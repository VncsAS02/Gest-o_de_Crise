const simulationModel = require('../models/simulationModel');
const { sendEmail, shareTeamsLink, sendAlertToManagers } = require('../utils/notification');
const { startRTOAlerts, stopRTOAlerts } = require('../utils/timer');

// FUNÇÃO AUXILIAR: Isola a lógica de ativação do PRD
const activatePrd = (simulation) => {
    simulation.status = 'active';
    simulation.prd = simulationModel.getPRDTemplate();
    simulation.startTime = Date.now(); // Corrige data de início
    simulation.monitoring.progressiveCounterStart = simulation.startTime;
    simulation.monitoring.rtoCountdownStart = simulation.startTime;
    
    simulationModel.updateSimulation(simulation); // Garante que o estado final 'active' seja salvo
    
    startRTOAlerts();

    // --- CORREÇÃO APLICADA AQUI ---
    // Envolvemos as chamadas de notificação em um try...catch.
    // Isso impede que um erro nelas derrube o servidor e apague a simulação.
    try {
        sendAlertToManagers(`Votação encerrada: CRISE CONFIRMADA. PRD INICIADO! Detalhes: ${simulation.crisisFormDetails.type}`);
        const committee = simulationModel.getCrisisCommittee();
        const teamsLink = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_Nzkw...';
        shareTeamsLink(committee, teamsLink);
    } catch (error) {
        // Se as notificações falharem, apenas registramos o erro no console do servidor,
        // mas a aplicação continua funcionando normalmente.
        console.error("Falha ao enviar notificações, mas a simulação continuará:", error);
    }
};

const startCrisisVoteProcess = (req, res) => {
    const { userId, userRole, crisisType, crisisCause, crisisScenario, validationData } = req.body;
    
    let currentSim = simulationModel.getCurrentSimulation();
    if (currentSim && currentSim.status !== 'inactive' && currentSim.status !== 'completed' && !currentSim.status.startsWith('cancelled')) {
        return res.status(400).json({ message: 'Uma simulação de crise já está em andamento.' });
    }

    const simulation = simulationModel.startNewSimulation();
    simulation.initiatedBy = userId;
    simulation.crisisFormDetails = { 
        role: userRole, 
        type: crisisType || 'Crise Validada', // Tipo padrão se não fornecido
        cause: crisisCause,
        scenario: crisisScenario || 'cenario1'
    };
    
    // Armazenar dados de validação se fornecidos
    if (validationData) {
        simulation.validationData = validationData;
    }
    
    simulation.status = 'pending_vote';
    
    simulationModel.updateSimulation(simulation);
    
    const committee = simulationModel.getCrisisCommittee();
    committee.forEach(member => {
        if(member.username !== userId) {
             sendEmail(
                member.email,
                'Votação de Crise: Ação Necessária',
                `Uma votação de crise foi iniciada por ${userId}.\nTipo: ${crisisType || 'Crise Validada'}\nDescrição: ${crisisCause}\nCenário: ${crisisScenario || 'Cenário 1'}\n\nAcesse o painel para votar.`
            );
        }
    });

    res.status(200).json({
        message: 'Votação de crise iniciada com sucesso.',
        simulationId: simulation.id,
    });
};

const submitCrisisVote = (req, res) => {
    const { userId, vote } = req.body;
    const simulation = simulationModel.getCurrentSimulation();

    if (!simulation || simulation.status !== 'pending_vote') {
        return res.status(400).json({ message: 'Nenhuma simulação aguardando voto ou voto já encerrado.' });
    }
    if (simulation.crisisVote.voters.has(userId)) {
        return res.status(400).json({ message: `Usuário ${userId} já votou nesta simulação.` });
    }

    if (vote === 'SIM') simulation.crisisVote.yesVotes++;
    else if (vote === 'NAO') simulation.crisisVote.noVotes++;
    else return res.status(400).json({ message: 'Voto inválido.' });

    simulation.crisisVote.totalVotes++;
    simulation.crisisVote.voters.add(userId);
    simulationModel.updateSimulation(simulation); 

    const committee = simulationModel.getCrisisCommittee();
    const requiredVotes = committee.length;

    if (simulation.crisisVote.totalVotes >= requiredVotes) {
        if (simulation.crisisVote.yesVotes > simulation.crisisVote.noVotes) {
            simulation.isCrisisConfirmed = true;
            simulation.status = 'awaiting_details'; 
            simulationModel.updateSimulation(simulation); 

            activatePrd(simulation);

            res.status(200).json({
                message: 'Votação encerrada. Crise confirmada!',
                simulationStatus: 'active',
                isCrisisConfirmed: true
            });
        } else {
            simulation.isCrisisConfirmed = false;
            simulation.status = 'cancelled_by_vote';
            simulationModel.updateSimulation(simulation);
            sendAlertToManagers('Votação encerrada: Não é uma crise. Simulação cancelada.');
            res.status(200).json({
                message: 'Votação encerrada. A maioria votou "Acidente".',
                simulationStatus: 'cancelled_by_vote',
                isCrisisConfirmed: false
            });
        }
    } else {
        res.status(200).json({
            message: `Voto registrado. Aguardando ${requiredVotes - simulation.crisisVote.totalVotes} voto(s) restante(s).`,
            currentVotes: simulation.crisisVote
        });
    }
};

// O restante do arquivo (getStatistics, completeTask, etc.) permanece inalterado...
const getStatistics = (req, res) => {
    const crisisHistory = simulationModel.getCrisisHistory();
    const totalCrises = crisisHistory.length;
    const crisesInPeriod = crisisHistory.filter(c => {
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        return c.startTime > thirtyDaysAgo;
    }).length;
    const totalCrisisTime = crisisHistory.reduce((sum, c) => {
        if (c.completionTime && c.startTime) {
            return sum + (c.completionTime - c.startTime);
        }
        return sum;
    }, 0);
    const avgCrisisTime = totalCrises > 0 ? totalCrisisTime / (totalCrises * 60 * 1000) : 0;
    const commonCrises = {};
    crisisHistory.forEach(c => {
        const type = c.crisisFormDetails?.type || 'Não especificado';
        commonCrises[type] = (commonCrises[type] || 0) + 1;
    });
    res.status(200).json({
        totalCrises,
        crisesInPeriod,
        avgCrisisTime: avgCrisisTime.toFixed(2),
        commonCrises
    });
};

const completeTask = (req, res) => {
    const { taskId, responsibleId } = req.body;
    const simulation = simulationModel.getCurrentSimulation();

    if (!simulation || simulation.status !== 'active' || !simulation.prd) {
        return res.status(400).json({ message: 'Nenhuma simulação ativa com PRD para completar tarefas.' });
    }

    let taskFound = false;
    let taskCompletedDetails = null;
    let phaseCompletedFlag = false;

    for (const phase of simulation.prd.phases) {
        for (const task of phase.tasks) {
            if (task.id === taskId && task.responsible === responsibleId) {
                if (task.completed) {
                    return res.status(400).json({ message: `Tarefa '${task.name}' já foi marcada como concluída anteriormente.` });
                }

                const uncompletedDependencies = task.dependencies.filter(depId => {
                    let depTask = null;
                    for (const p of simulation.prd.phases) {
                        depTask = p.tasks.find(t => t.id === depId);
                        if (depTask) break;
                    }
                    return depTask && !depTask.completed;
                });

                if (uncompletedDependencies.length > 0) {
                    return res.status(400).json({
                        message: `A tarefa '${task.name}' possui dependências não concluídas: ${uncompletedDependencies.join(', ')}. Conclua-as primeiro.`,
                        uncompletedDependencies: uncompletedDependencies
                    });
                }

                task.completed = true;
                task.completionTime = Date.now();
                task.actualTime = Math.floor((task.completionTime - simulation.monitoring.progressiveCounterStart) / (1000 * 60));
                taskFound = true;
                taskCompletedDetails = { name: task.name, actualTime: task.actualTime, estimatedTime: task.estimatedTime };

                console.log(`Tarefa '${task.name}' (${taskId}) marcada como concluída por ${responsibleId}. Tempo real: ${task.actualTime} min.`);

                if (phase.tasks.every(t => t.completed)) {
                    phaseCompletedFlag = true;
                    sendAlertToManagers(`Fase '${phase.name}' do PRD CONCLUÍDA por completo.`);
                }
                break;
            }
        }
        if (taskFound) break;
    }

    if (!taskFound) {
        return res.status(404).json({ message: 'Tarefa não encontrada para o responsável fornecido ou ID de tarefa incorreto.' });
    }

    const allPhasesAndTasksCompleted = simulation.prd.phases.every(phase => phase.tasks.every(task => task.completed));

    if (allPhasesAndTasksCompleted) {
        const endTime = Date.now();
        const totalElapsedMinutes = Math.floor((endTime - simulation.monitoring.progressiveCounterStart) / (1000 * 60));

        simulation.completionTime = endTime;
        stopRTOAlerts();

        if (totalElapsedMinutes <= simulation.rto) {
            simulation.status = 'completed_in_rto';
            simulation.timeExceeded = 0;
            sendAlertToManagers(`PRD FINALIZADO COM SUCESSO! Dentro do RTO de ${simulation.rto} minutos. Tempo total de execução: ${totalElapsedMinutes} minutos.`);
        } else {
            simulation.status = 'completed_out_of_rto';
            simulation.timeExceeded = totalElapsedMinutes - simulation.rto;
            simulation.estimatedLoss = simulation.timeExceeded * 1000;
            sendAlertToManagers(`PRD FINALIZADO, mas FORA do RTO! Tempo excedido: ${simulation.timeExceeded} minutos. Perda estimada: R$ ${simulation.estimatedLoss.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`);
        }
        simulationModel.updateSimulation(simulation);
    }

    simulationModel.updateSimulation(simulation);
    res.status(200).json({
        message: 'Tarefa concluída com sucesso.',
        taskDetails: taskCompletedDetails,
        phaseCompleted: phaseCompletedFlag ? `Fase concluída: ${phaseCompletedFlag}` : false,
        simulationOverallStatus: simulation.status,
        allPhasesCompleted: allPhasesAndTasksCompleted
    });
};

const getSimulationStatus = (req, res) => {
    const simulation = simulationModel.getCurrentSimulation();
    if (!simulation) {
        return res.status(404).json({ error: 'Nenhuma simulação ativa para monitoramento.' });
    }

    const currentTime = Date.now();
    let progressiveCounterMinutes = 0;
    let regressiveCounterMinutes = simulation.rto;
    let percentageRTOUsed = 0;

    if (simulation.status === 'active' && simulation.monitoring.progressiveCounterStart) {
        const elapsedMilliseconds = currentTime - simulation.monitoring.progressiveCounterStart;
        progressiveCounterMinutes = Math.floor(elapsedMilliseconds / (1000 * 60));
        regressiveCounterMinutes = Math.max(0, simulation.rto - progressiveCounterMinutes);
        percentageRTOUsed = (progressiveCounterMinutes / simulation.rto) * 100;
    } else if (simulation.status.startsWith('completed') || simulation.status.startsWith('cancelled')) {
        progressiveCounterMinutes = simulation.completionTime ? Math.floor((simulation.completionTime - simulation.startTime) / (1000 * 60)) : 'N/A';
        regressiveCounterMinutes = simulation.timeExceeded > 0 ? -simulation.timeExceeded : Math.max(0, simulation.rto - progressiveCounterMinutes);
        percentageRTOUsed = (progressiveCounterMinutes / simulation.rto) * 100;
    }

    const prdStatus = simulation.prd ? simulation.prd.phases.map(phase => ({
        id: phase.id,
        name: phase.name,
        tasks: phase.tasks.map(task => ({
            id: task.id,
            name: task.name,
            responsible: task.responsible,
            estimatedTime: task.estimatedTime,
            completed: task.completed,
            actualTime: task.actualTime
        }))
    })) : null;

    res.status(200).json({
        simulationId: simulation.id,
        overallStatus: simulation.status,
        isCrisisConfirmed: simulation.isCrisisConfirmed,
        currentPRD: prdStatus,
        rtoDefinedMinutes: simulation.rto,
        monitoring: {
            progressiveCounterMinutes: progressiveCounterMinutes,
            regressiveCounterMinutes: regressiveCounterMinutes,
            percentageRTOUsed: parseFloat(percentageRTOUsed.toFixed(2)),
            rtoReached: simulation.monitoring.rtoReached,
            progressiveCounterStart: simulation.monitoring.progressiveCounterStart
        },
        completionDetails: {
            completionTime: simulation.completionTime ? new Date(simulation.completionTime).toLocaleString('pt-BR') : 'N/A',
            timeExceededMinutes: simulation.timeExceeded,
            estimatedLoss: simulation.estimatedLoss
        },
        crisisVoteResults: simulation.crisisVote,
        initiatedBy: simulation.initiatedBy,
        crisisFormDetails: simulation.crisisFormDetails,
        validationData: simulation.validationData || null
    });
};

const generateFinalReport = (req, res) => {
    const simulation = simulationModel.getCurrentSimulation();
    if (!simulation || !['completed_in_rto', 'completed_out_of_rto', 'cancelled_by_vote', 'cancelled_manual'].includes(simulation.status)) {
        return res.status(400).json({ message: 'A simulação não foi finalizada ou não existe para que um relatório seja gerado.' });
    }

    const report = {
        simulationId: simulation.id,
        statusFinal: simulation.status,
        startTime: new Date(simulation.startTime).toLocaleString('pt-BR'),
        endTime: simulation.completionTime ? new Date(simulation.completionTime).toLocaleString('pt-BR') : 'N/A',
        totalTimeElapsedMinutes: simulation.completionTime ? Math.floor((simulation.completionTime - simulation.startTime) / (1000 * 60)) : 'N/A',
        rtoDefinedMinutes: simulation.rto,
        rtoStatus: simulation.timeExceeded === 0 ? 'Dentro do RTO' : `Fora do RTO por ${simulation.timeExceeded} minutos`,
        estimatedLoss: simulation.estimatedLoss.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        tables: {
            realExecutionTime: [],
            estimatedTime: [],
            comparison: {
                extrapolatedActivities: [],
                optimizedActivities: []
            }
        },
        performanceGraphsData: {},
        suggestions: [],
        crisisFormDetails: simulation.crisisFormDetails,
        validationData: simulation.validationData || null
    };

    if (simulation.prd) {
        let totalEstimatedPRDTime = 0;
        let totalActualPRDTime = 0;

        simulation.prd.phases.forEach(phase => {
            let phaseActualTime = 0;
            let phaseEstimatedTime = 0;
            let phaseCompletedTasks = 0;

            phase.tasks.forEach(task => {
                const estimatedTaskTime = task.estimatedTime;
                const actualTaskTime = task.actualTime !== null ? task.actualTime : 'N/A';

                report.tables.estimatedTime.push({ taskId: task.id, name: task.name, responsible: task.responsible, estimatedTime: estimatedTaskTime });
                report.tables.realExecutionTime.push({ taskId: task.id, name: task.name, responsible: task.responsible, actualTime: actualTaskTime, completed: task.completed });

                if (task.completed && typeof actualTaskTime === 'number') {
                    totalEstimatedPRDTime += estimatedTaskTime;
                    totalActualPRDTime += actualTaskTime;
                    phaseEstimatedTime += estimatedTaskTime;
                    phaseActualTime += actualTaskTime;
                    phaseCompletedTasks++;

                    if (actualTaskTime > estimatedTaskTime) {
                        report.tables.comparison.extrapolatedActivities.push({
                            taskId: task.id,
                            name: task.name,
                            responsible: task.responsible,
                            estimated: estimatedTaskTime,
                            actual: actualTaskTime,
                            delta: actualTaskTime - estimatedTaskTime
                        });
                    } else if (actualTaskTime < estimatedTaskTime) {
                        report.tables.comparison.optimizedActivities.push({
                            taskId: task.id,
                            name: task.name,
                            responsible: task.responsible,
                            estimated: estimatedTaskTime,
                            actual: actualTaskTime,
                            delta: estimatedTaskTime - actualTaskTime
                        });
                    }
                }
            });
            report.performanceGraphsData[phase.name] = {
                tasksCompleted: phaseCompletedTasks,
                totalTasks: phase.tasks.length,
            };
        });

        report.performanceGraphsData.totalEstimatedPRDTime = totalEstimatedPRDTime;
        report.performanceGraphsData.totalActualPRDTime = totalActualPRDTime;


        if (simulation.status === 'completed_out_of_rto') {
            report.suggestions.push(`**REVISÃO CRÍTICA DO RTO**: O RTO de ${simulation.rto} minutos foi excedido por ${simulation.timeExceeded} minutos. Uma reavaliação aprofundada do RTO ou do próprio PRD é recomendada para alinhamento com a realidade operacional.`);
        } else if (simulation.status === 'completed_in_rto') {
            report.suggestions.push(`**SUCESSO DENTRO DO RTO**: O PRD foi concluído dentro do tempo esperado (${simulation.rto} minutos). Analisar este sucesso para replicar as melhores práticas.`);
        }

        if (report.tables.comparison.extrapolatedActivities.length > 0) {
            report.suggestions.push(`**OTIMIZAÇÃO DE ATIVIDADES**: Analisar em detalhes as ${report.tables.comparison.extrapolatedActivities.length} atividades que extrapolaram o tempo estimado para identificar gargalos, otimizar processos ou ajustar as estimativas futuras.`);
        }
        if (report.tables.comparison.optimizedActivities.length > 0) {
            report.suggestions.push(`**MELHORES PRÁTICAS**: Identificar e documentar as ${report.tables.comparison.optimizedActivities.length} atividades que foram concluídas em tempo menor que o estimado para consolidar essas práticas como padrão.`);
        }
        if (simulation.status === 'cancelled_by_vote') {
             report.suggestions.push(`**ANÁLISE DA VOTAÇÃO**: A crise foi cancelada por votação. Reavaliar os critérios de 'crise' vs. 'incidente' para garantir clareza e alinhamento do comitê.`);
        }
        if (simulation.status === 'cancelled_manual') {
            report.suggestions.push(`**ANÁLISE DE CANCELAMENTO MANUAL**: A simulação foi cancelada manualmente. Revisar o motivo ('${simulation.cancelReason}') e a etapa ('${simulation.cancelStage}') para lições aprendidas.`);
        }

    } else {
        report.suggestions.push('Nenhum PRD foi executado para análise detalhada de atividades, pois a simulação foi encerrada precocemente.');
    }

    simulationModel.updateSimulation({ report: report });

    res.status(200).json(report);
};

const cancelSimulation = (req, res) => {
    const { reason, currentStage } = req.body;
    const simulation = simulationModel.getCurrentSimulation();

    if (!simulation || ['completed_in_rto', 'completed_out_of_rto', 'cancelled_by_vote'].includes(simulation.status)) {
        return res.status(400).json({ message: 'Nenhuma simulação ativa ou em andamento para ser cancelada manualmente.' });
    }

    simulation.status = 'cancelled_manual';
    simulation.completionTime = Date.now();
    simulation.cancelReason = reason || 'Motivo não especificado';
    simulation.cancelStage = currentStage || 'Etapa não especificada';
    stopRTOAlerts();
    sendAlertToManagers(`SIMULAÇÃO CANCELADA MANUALMENTE: Motivo: '${simulation.cancelReason}'. Etapa no cancelamento: '${simulation.cancelStage}'.`);
    simulationModel.updateSimulation(simulation);

    res.status(200).json({
        message: 'Simulação cancelada com sucesso.',
        simulationId: simulation.id,
        simulationStatus: simulation.status,
        cancelDetails: {
            reason: simulation.cancelReason,
            stage: simulation.cancelStage
        }
    });
};

const resetSimulation = (req, res) => {
    simulationModel.resetSimulation();
    res.status(200).json({ message: 'Simulação resetada com sucesso. Você pode iniciar uma nova.' });
};

module.exports = {
    startCrisisVoteProcess,
    submitCrisisVote,
    completeTask,
    getSimulationStatus,
    generateFinalReport,
    cancelSimulation,
    getStatistics,
    resetSimulation
};