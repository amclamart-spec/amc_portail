const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Récupère tous les mandats SEPA dont la date d'échéance est dépassée
 * et qui n'ont pas encore été chargés
 */
async function getPendingSepaPayments() {
  try {
    const now = new Date();
    
    // Récupérer les paiements dont le mandat est signé et la date d'échéance est dépassée
    // PostgreSQL: NOW() - INTERVAL '5 minutes' (pas DATE_SUB comme MySQL)
    const pendingPayments = await prisma.$queryRaw`
      SELECT * FROM paiements 
      WHERE statut = 'mandate_signed' 
      AND echeance_numero = 1
      AND due_date <= NOW()
      ORDER BY due_date ASC
      LIMIT 10
    `;

    return pendingPayments || [];
  } catch (error) {
    console.error('Erreur getPendingSepaPayments:', error);
    return [];
  }
}

/**
 * Déclenche le prélèvement SEPA pour un mandat signé
 */
async function chargeSepaMandate(paiement) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY non configurée');
      return { success: false, error: 'STRIPE_SECRET_KEY non configurée' };
    }

    const { id: paiementId, stripe_payment_method_id, stripe_customer_id, montant, inscription_id } = paiement;
    const amount = Math.round(Number(montant) * 100);

    if (!Number.isFinite(amount) || amount <= 0) {
      console.error(`Montant invalide pour paiement ${paiementId}: ${montant}`);
      return { success: false, error: 'Montant invalide' };
    }

    // Créer et confirmer le PaymentIntent
    const body = new URLSearchParams({
      amount: String(amount),
      currency: 'eur',
      customer: stripe_customer_id,
      payment_method: stripe_payment_method_id,
      'payment_method_types[0]': 'sepa_debit',
      confirm: 'true',
      off_session: 'true',
      'metadata[inscriptionId]': String(inscription_id),
      'metadata[echeance]': '1',
      'metadata[paiementId]': String(paiementId),
    });

    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`Erreur Stripe pour paiement ${paiementId}:`, data);
      
      // Mettre à jour avec raison d'échec
      await prisma.$executeRaw`
        UPDATE paiements 
        SET statut = 'failed',
            failure_reason = ${data.error?.message || 'Erreur Stripe'},
            date_mise_a_jour = NOW()
        WHERE id = ${paiementId}
      `;
      
      return { success: false, error: data.error?.message };
    }

    // Succès - mettre à jour le paiement avec le PaymentIntent ID
    await prisma.$executeRaw`
      UPDATE paiements 
      SET stripe_payment_intent_id = ${data.id},
          statut = 'processing',
          date_mise_a_jour = NOW()
      WHERE id = ${paiementId}
    `;

    console.log(`✓ Prélèvement SEPA déclenché pour inscription ${inscription_id}, montant ${montant}€`);
    return { success: true, paymentIntentId: data.id };
  } catch (error) {
    console.error(`Erreur chargeSepaMandate pour paiement ${paiement.id}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Exécute les prélèvements SEPA en attente
 * Appelé par un cron job ou un endpoint périodique
 */
async function processScheduledSepaPayments() {
  try {
    console.log('[SEPA Scheduler] Vérification des paiements en attente...');
    
    const pendingPayments = await getPendingSepaPayments();
    
    if (pendingPayments.length === 0) {
      console.log('[SEPA Scheduler] Aucun paiement en attente');
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    console.log(`[SEPA Scheduler] Traitement de ${pendingPayments.length} paiement(s)`);

    let succeeded = 0;
    let failed = 0;

    for (const paiement of pendingPayments) {
      const result = await chargeSepaMandate(paiement);
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
      // Petit délai pour éviter le throttling Stripe
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[SEPA Scheduler] Résultats: ${succeeded} réussis, ${failed} échoués sur ${pendingPayments.length}`);
    return { processed: pendingPayments.length, succeeded, failed };
  } catch (error) {
    console.error('[SEPA Scheduler] Erreur:', error);
    return { processed: 0, succeeded: 0, failed: 0, error: error.message };
  }
}

/**
 * Démarre le scheduler SEPA - vérifie tous les 5 minutes
 */
function startSepaScheduler() {
  // Vérifier immédiatement au démarrage
  processScheduledSepaPayments().catch(err => {
    console.error('Erreur lors du démarrage du scheduler SEPA:', err);
  });

  // Puis toutes les 5 minutes
  const intervalId = setInterval(() => {
    processScheduledSepaPayments().catch(err => {
      console.error('Erreur dans le scheduler SEPA récurrent:', err);
    });
  }, 5 * 60 * 1000); // 5 minutes

  console.log('[SEPA Scheduler] ✓ Démarré (vérification toutes les 5 minutes)');
  return intervalId;
}

module.exports = {
  getPendingSepaPayments,
  chargeSepaMandate,
  processScheduledSepaPayments,
  startSepaScheduler,
};
