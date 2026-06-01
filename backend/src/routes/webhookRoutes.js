const express = require('express');
const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post('/stripe', async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('Stripe webhook secret non configuré');
      return res.status(500).json({ error: 'Stripe webhook secret non configuré' });
    }

    if (!signature) {
      return res.status(400).json({ error: 'En-tête stripe-signature manquant' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
      console.error('Signature Stripe invalide:', err.message);
      return res.status(400).json({ error: `Signature Stripe invalide: ${err.message}` });
    }

    const eventType = event.type;
    console.log(`[Stripe webhook] événement reçu : ${eventType}`);

    if (eventType === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      await prisma.$executeRaw`
        UPDATE paiements
        SET statut = 'succeeded', date_mise_a_jour = NOW()
        WHERE stripe_payment_intent_id = ${paymentIntent.id}
      `;
      console.log(`[Stripe webhook] payment_intent.succeeded pour ${paymentIntent.id}`);
    }

    if (eventType === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      const failureReason = paymentIntent.last_payment_error?.message || paymentIntent.last_payment_error?.type || 'Paiement échoué';
      await prisma.$executeRaw`
        UPDATE paiements
        SET statut = 'failed', failure_reason = ${failureReason}, date_mise_a_jour = NOW()
        WHERE stripe_payment_intent_id = ${paymentIntent.id}
      `;
      console.log(`[Stripe webhook] payment_intent.payment_failed pour ${paymentIntent.id} : ${failureReason}`);
    }

    if (eventType === 'setup_intent.succeeded') {
      const setupIntent = event.data.object;
      const mandateId = setupIntent.mandate;
      const inscriptionId = setupIntent.metadata?.inscriptionId;

      if (mandateId && inscriptionId) {
        await prisma.$executeRaw`
          UPDATE paiements
          SET stripe_mandate_id = ${mandateId}, date_mise_a_jour = NOW()
          WHERE inscription_id = ${Number(inscriptionId)}
        `;
        console.log(`[Stripe webhook] setup_intent.succeeded pour inscription ${inscriptionId}, mandat ${mandateId}`);
      } else {
        console.log('[Stripe webhook] setup_intent.succeeded sans metadata.inscriptionId ou mandat');
      }
    }

    if (eventType === 'charge.dispute.created') {
      const dispute = event.data.object;
      await prisma.$executeRaw`
        UPDATE paiements
        SET statut = 'disputed', date_mise_a_jour = NOW()
        WHERE stripe_payment_intent_id = ${dispute.payment_intent}
      `;
      console.log(`[Stripe webhook] charge.dispute.created pour payment_intent ${dispute.payment_intent}`);
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('Erreur webhook Stripe :', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur webhook Stripe' });
  }
});

module.exports = router;
