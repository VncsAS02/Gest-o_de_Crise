let currentSimulation = null;
const crisisHistory = [];
const crisisCommittee = [
    { id: 'user1', email: 'membro1@empresa.com', name: 'João Silva' },
    { id: 'user2', email: 'membro2@empresa.com', name: 'Maria Santos' },
    { id: 'user3', email: 'membro3@empresa.com', name: 'Carlos Lima' }
];

const prdTemplate = {
    phases: [
        {
            id: 'phase_execucao',
            name: 'Execução do PRD',
            tasks: [
                { id: 1, name: 'Identificar o incidente e a causa, avaliar o impacto e informar Líder.', responsible: 'comunicacao', estimatedTime: 15, completed: false, startTime: null, completionTime: null, actualTime: null, dependencies: [] },
                { id: 2, name: 'Acionar o Gerente de Tecnologia da Informação e solicitar a disponibilização de novos recursos do produto.', responsible: 'comunicacao', estimatedTime: 15, completed: false, startTime: null, completionTime: null, actualTime: null, dependencies: [1] },
                { id: 3, name: 'Determinar ao Líder que comunique a indisponibilidade às áreas afetadas.', responsible: 'infraestrutura', estimatedTime: 10, completed: false, startTime: null, completionTime: null, actualTime: null, dependencies: [2] },
                { id: 4, name: "Abrir chamado para a Área de Comunicação no serviço 'Comunicado oficial sobre indisponibilidade de serviços/produtos' para comunicar as áreas afetadas sobre a indisponibilidade do produto.", responsible: 'infraestrutura', estimatedTime: 15, completed: false, startTime: null, completionTime: null, actualTime: null, dependencies: [3] },
                { id: 5, name: 'Área de TI (Contingência) Disponibilizar os novos recursos.', responsible: 'ti', estimatedTime: 120, completed: false, startTime: null, completionTime: null, actualTime: null, dependencies: [4] },
                { id: 6, name: 'Líder orientar a recuperação do produto no novo ambiente.', responsible: 'infraestrutura', estimatedTime: 10, completed: false, startTime: null, completionTime: null, actualTime: null, dependencies: [5] },
                { id: 7, name: 'Executar a recuperação de acordo com o POP', responsible: 'ti', estimatedTime: 480, completed: false, startTime: null, completionTime: null, actualTime: null, dependencies: [6] },
                { id: 8, name: 'Validação do produto nos novos recursos.', responsible: 'infraestrutura', estimatedTime: 15, completed: false, startTime: null, completionTime: null, actualTime: null, dependencies: [7] },
                { id: 9, name: "Abrir chamado para a Área de Comunicação no serviço 'Comunicado oficial sobre indisponibilidade de serviços/produtos' para comunicar as áreas afetadas sobre o retorno da disponibilidade do produto. Finalizado o PRD com sucesso - gerar o relatório e armazenar o processo como histórico.", responsible: 'comunicacao', estimatedTime: 10, completed: false, startTime: null, completionTime: null, actualTime: null, dependencies: [8] }
            ]
        }
    ],
    // RTO total de 12 horas
    rto: 720
};

const getCrisisCommittee = () => crisisCommittee;
const getPRDTemplate = () => JSON.parse(JSON.stringify(prdTemplate));
const startNewSimulation = (rto = prdTemplate.rto) => {
    currentSimulation = {
        id: `sim-${Date.now()}`,
        startTime: null,
        crisisVote: { totalVotes: 0, yesVotes: 0, noVotes: 0, voters: new Set() },
        isCrisisConfirmed: null,
        prd: null,
        rto: rto,
        crisisFormDetails: { role: null, type: null, cause: null, scenario: null },
        validationData: null,
        monitoring: {
            progressiveCounterStart: null,
            rtoCountdownStart: null,
            rtoReached: false
        },
        status: 'pending_vote',
        completionTime: null,
        timeExceeded: 0,
        estimatedLoss: 0,
        report: null,
        cancelReason: null,
        cancelStage: null,
        initiatedBy: null // NOVO: Armazena o ID do usuário que iniciou a votação
    };
    return currentSimulation;
};
const getCurrentSimulation = () => currentSimulation;
const updateSimulation = (simulationData) => {
    if (currentSimulation) {
        Object.assign(currentSimulation, simulationData);
        return currentSimulation;
    }
    return null;
};
const resetSimulation = () => {
    if (currentSimulation) {
        crisisHistory.push(currentSimulation);
    }
    currentSimulation = null;
};

const getCrisisHistory = () => crisisHistory;

module.exports = {
    getCrisisCommittee,
    getPRDTemplate,
    startNewSimulation,
    getCurrentSimulation,
    updateSimulation,
    resetSimulation,
    getCrisisHistory
};