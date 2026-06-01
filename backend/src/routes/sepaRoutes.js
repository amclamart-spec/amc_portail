const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const prisma = new PrismaClient();
const router = express.Router();

function toFormUrlEncoded(payload = {}) {
  return Object.entries(payload)
    .flatMap(([key, value]) => {
      if (value === undefined || value === null) return [];
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');
}

async function createSepaSetupIntent(req, res) {
  try {
    const { customerId, inscriptionId } = req.body;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      return res.status(500).json({ error: 'Clé Stripe non configurée' });
    }

    if (!customerId) {
      return res.status(400).json({ error: 'customerId est requis' });
    }

    const body = {
      'payment_method_types[0]': 'sepa_debit',
      usage: 'off_session',
      'mandate_data[customer_acceptance][type]': 'online',
      'mandate_data[customer_acceptance][ip_address]': req.ip || 'unknown',
      'mandate_data[customer_acceptance][user_agent]': req.headers['user-agent'] || 'unknown',
      customer: customerId,
    };

    if (inscriptionId !== undefined && inscriptionId !== null) {
      body['metadata[inscriptionId]'] = String(inscriptionId);
    }

    const response = await fetch('https://api.stripe.com/v1/setup_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: toFormUrlEncoded(body),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Stripe setup intent error:', data);
      return res.status(500).json({ error: data.error?.message || 'Impossible de créer le SetupIntent Stripe' });
    }

    return res.json({ clientSecret: data.client_secret, setupIntentId: data.id });
  } catch (error) {
    console.error('Erreur createSepaSetupIntent:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur lors de la création du SetupIntent SEPA' });
  }
}

async function saveSepaMandateAndSchedule(req, res) {
  try {
    const { paymentMethodId, customerId, montant, inscriptionId, dueDateFirstPayment } = req.body;

    if (!paymentMethodId || !customerId || montant === undefined || montant === null || !inscriptionId || !dueDateFirstPayment) {
      return res.status(400).json({ 
        error: 'paymentMethodId, customerId, montant, inscriptionId et dueDateFirstPayment sont requis' 
      });
    }

    const dueDate = new Date(dueDateFirstPayment);
    if (isNaN(dueDate.getTime())) {
      return res.status(400).json({ error: 'dueDateFirstPayment invalide (format ISO attendu)' });
    }

    // Sauvegarder le mandat dans la BD sans exécuter de charge
    await prisma.$executeRaw`
      INSERT INTO paiements (
        inscription_id,
        stripe_payment_method_id,
        stripe_customer_id,
        montant,
        statut,
        echeance_numero,
        due_date,
        date_creation,
        date_mise_a_jour
      ) VALUES (
        ${Number(inscriptionId)},
        ${paymentMethodId},
        ${customerId},
        ${Number(montant).toFixed(2)},
        'mandate_signed',
        1,
        ${dueDate},
        NOW(),
        NOW()
      )
    `;

    return res.json({ 
      success: true,
      message: 'Mandat SEPA signé et sauvegardé. Le premier paiement sera exécuté le ' + dueDate.toLocaleDateString('fr-FR')
    });
  } catch (error) {
    console.error('Erreur saveSepaMandateAndSchedule:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur lors de la sauvegarde du mandat SEPA' });
  }
}

async function chargeFirstSepaPaymentAtDueDate(req, res) {
  try {
    const { inscriptionId } = req.body;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      return res.status(500).json({ error: 'Clé Stripe non configurée' });
    }

    if (!inscriptionId) {
      return res.status(400).json({ error: 'inscriptionId est requis' });
    }

    // Récupérer le mandat sauvegardé
    const mandate = await prisma.$queryRaw`
      SELECT * FROM paiements 
      WHERE inscription_id = ${Number(inscriptionId)} 
      AND statut = 'mandate_signed'
      AND echeance_numero = 1
      LIMIT 1
    `;

    if (!mandate || mandate.length === 0) {
      return res.status(404).json({ error: 'Aucun mandat SEPA trouvé pour cette inscription' });
    }

    const { stripe_payment_method_id: paymentMethodId, stripe_customer_id: customerId, montant } = mandate[0];
    const amount = Math.round(Number(montant) * 100);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    // Créer et confirmer le PaymentIntent
    const body = {
      amount: String(amount),
      currency: 'eur',
      customer: customerId,
      payment_method: paymentMethodId,
      'payment_method_types[0]': 'sepa_debit',
      confirm: 'true',
      off_session: 'true',
      'metadata[inscriptionId]': String(inscriptionId),
      'metadata[echeance]': '1',
    };

    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: toFormUrlEncoded(body),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Stripe payment intent error:', data);
      return res.status(500).json({ error: data.error?.message || 'Impossible de créer le PaymentIntent Stripe' });
    }

    // Mettre à jour le mandat avec le PaymentIntent ID
    await prisma.$executeRaw`
      UPDATE paiements 
      SET stripe_payment_intent_id = ${data.id},
          statut = 'processing',
          date_mise_a_jour = NOW()
      WHERE inscription_id = ${Number(inscriptionId)} 
      AND echeance_numero = 1
    `;

    return res.json({ 
      success: true,
      status: data.status, 
      paymentIntentId: data.id,
      message: 'Premier paiement SEPA déclenché'
    });
  } catch (error) {
    console.error('Erreur chargeFirstSepaPaymentAtDueDate:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur lors du déclenchement du paiement SEPA' });
  }
}

router.post('/setup-intent', authenticate, createSepaSetupIntent);
router.post('/save-mandate', authenticate, saveSepaMandateAndSchedule);
router.post('/charge-first-at-due-date', authenticate, chargeFirstSepaPaymentAtDueDate);

module.exports = router;
