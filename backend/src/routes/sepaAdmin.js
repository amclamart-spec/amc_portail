const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { processScheduledSepaPayments, getPendingSepaPayments } = require('../services/sepaSchedulerService');

const router = express.Router();

/**
 * GET /admin/sepa/pending - Récupère la liste des mandats SEPA en attente
 * Permissions: Admin seulement
 */
router.get('/pending', authenticate, authorize('admin'), async (req, res) => {
  try {
    const pending = await getPendingSepaPayments();
    return res.json({
      count: pending.length,
      payments: pending,
    });
  } catch (error) {
    console.error('Erreur /admin/sepa/pending:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

/**
 * POST /admin/sepa/process - Déclenche le traitement des paiements SEPA en attente
 * Permissions: Admin seulement
 */
router.post('/process', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await processScheduledSepaPayments();
    return res.json({
      message: 'Traitement des paiements SEPA exécuté',
      result,
    });
  } catch (error) {
    console.error('Erreur /admin/sepa/process:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

module.exports = router;
