// Lógica para gerenciar contadores de tempo e alertas proativos de RTO
const simulationModel = require('../models/simulationModel');
const { sendAlertToManagers } = require('./notification');

let rtoAlertInterval = null; // Armazena o ID do intervalo para limpar
let currentIntervalTime = null; // Controla o tempo atual entre os alertas 

const startRTOAlerts = () => {
    const simulation = simulationModel.getCurrentSimulation();
    if (!simulation || simulation.status !== 'active' || simulation.monitoring.progressiveCounterStart === null) {
        console.log("[TIMER] Não é possível iniciar alertas RTO: simulação não ativa ou sem tempo de início.");
        return;
    }

    // Limpa qualquer intervalo anterior para evitar que múltiplos contadores rodem de uma só vez
    if (rtoAlertInterval) {
        clearInterval(rtoAlertInterval);
        rtoAlertInterval = null;
    }

    const checkAndSendAlert = () => {
        const sim = simulationModel.getCurrentSimulation(); // Pega a simulação mais recente
        if (!sim || sim.status !== 'active') { // Verifica se a simulação ainda está ativa
            clearInterval(rtoAlertInterval);
            rtoAlertInterval = null;
            currentIntervalTime = null;
            console.log("[TIMER] Alertas RTO parados: simulação não está mais ativa.");
            return;
        }

        const currentTime = Date.now();
        const elapsedMilliseconds = currentTime - sim.monitoring.progressiveCounterStart;
        const elapsedMinutes = Math.floor(elapsedMilliseconds / (1000 * 60));
        const rtoMinutes = sim.rto;
        const remainingMinutes = rtoMinutes - elapsedMinutes;

        console.log(`[TIMER STATUS] Tempo decorrido: ${elapsedMinutes} min. RTO: ${rtoMinutes} min. Restante: ${remainingMinutes} min.`);

        let newIntervalTime = 30 * 60 * 1000; // Padrão: 30 minutos em ms

        // Lógica de escalonamento dos alertas
        if (remainingMinutes <= 0 && !sim.monitoring.rtoReached) {
            sim.monitoring.rtoReached = true;
            sim.status = 'completed_out_of_rto'; // Marca como excedeu RTO
            const exceededTime = Math.abs(remainingMinutes);
            sim.timeExceeded = exceededTime;
            // Exemplo de cálculo de perda: R$1000 por minuto excedido
            sim.estimatedLoss = exceededTime * 1000;
            simulationModel.updateSimulation(sim); 
            sendAlertToManagers(`ALERTA CRÍTICO: RTO de ${rtoMinutes} minutos ULTRAPASSADO em ${exceededTime} minutos. Perda estimada: R$ ${sim.estimatedLoss.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`);
            console.log("[TIMER] RTO ultrapassado! Simulação finalizada fora do RTO.");
            clearInterval(rtoAlertInterval); // Para os alertas
            rtoAlertInterval = null;
            currentIntervalTime = null;
            return;
        } else if (remainingMinutes > 0) {
            const percentageUsed = (elapsedMinutes / rtoMinutes) * 100;
            if (percentageUsed >= 95) { // Últimos 5% do RTO
                newIntervalTime = 1 * 60 * 1000; // 1 minuto
                if (currentIntervalTime !== newIntervalTime) {
                    sendAlertToManagers(`CRÍTICO: ${Math.floor(percentageUsed)}% do RTO (${rtoMinutes} min) consumido. Faltam ${remainingMinutes} min. Alertas agora a cada 1 min.`);
                }
            } else if (percentageUsed >= 90) { // Últimos 10% do RTO
                newIntervalTime = 5 * 60 * 1000; // 5 minutos
                if (currentIntervalTime !== newIntervalTime) {
                    sendAlertToManagers(`URGENTE: ${Math.floor(percentageUsed)}% do RTO (${rtoMinutes} min) consumido. Faltam ${remainingMinutes} min. Alertas agora a cada 5 min.`);
                }
            } else if (percentageUsed >= 80) { // Últimos 20% do RTO
                newIntervalTime = 10 * 60 * 1000; // 10 minutos
                if (currentIntervalTime !== newIntervalTime) {
                    sendAlertToManagers(`ATENÇÃO: ${Math.floor(percentageUsed)}% do RTO (${rtoMinutes} min) consumido. Faltam ${remainingMinutes} min. Alertas agora a cada 10 min.`);
                }
            }
            // Se o intervalo de tempo de alerta mudou, limpa o antigo e define um novo
            if (currentIntervalTime !== newIntervalTime) {
                clearInterval(rtoAlertInterval);
                rtoAlertInterval = setInterval(checkAndSendAlert, newIntervalTime);
                currentIntervalTime = newIntervalTime;
            }
        }
    };

    // Inicia o primeiro cheque imediatamente e depois configura o intervalo
    checkAndSendAlert(); // Executa uma vez para iniciar o processo
    rtoAlertInterval = setInterval(checkAndSendAlert, currentIntervalTime || (30 * 60 * 1000)); // Começa com 30 min se não houver um definido
    console.log(`[TIMER] Alertas RTO iniciados. Intervalo inicial: ${currentIntervalTime / (1000 * 60) || 30} min.`);
};


const stopRTOAlerts = () => {
    if (rtoAlertInterval) {
        clearInterval(rtoAlertInterval);
        rtoAlertInterval = null;
        currentIntervalTime = null;
        console.log("[TIMER] Alertas RTO parados.");
    }
};

module.exports = {
    startRTOAlerts,
    stopRTOAlerts
};