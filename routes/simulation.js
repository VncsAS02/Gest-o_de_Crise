const express = require('express');
const router = express.Router();
const simulationController = require('../controllers/simulationController');

// ALTERADO: A rota '/start' agora usa a nova função 'startCrisisVoteProcess'
router.post('/start', simulationController.startCrisisVoteProcess); 

router.post('/vote', simulationController.submitCrisisVote);

// REMOVIDO: A rota '/details' não é mais necessária
// router.post('/details', simulationController.submitCrisisDetails); 

router.post('/task/complete', simulationController.completeTask);
router.get('/status', simulationController.getSimulationStatus);
router.get('/report', simulationController.generateFinalReport);
router.post('/cancel', simulationController.cancelSimulation);
router.get('/stats', simulationController.getStatistics);
router.post('/reset', simulationController.resetSimulation);

module.exports = router;