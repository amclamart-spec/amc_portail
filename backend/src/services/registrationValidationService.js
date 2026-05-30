const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function normalizeToPaymentMethod(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return null;

  const map = {
    STRIPE: 'CB',
    STRIPE_CARD: 'CB',
    CARTE: 'CB',
    CARTE_BANCAIRE: 'CB',
    CB: 'CB',
    GOCARDLESS: 'SEPA',
    GO_CARDLESS: 'SEPA',
    GO_CARDLESS_SEPA: 'SEPA',
    PRELEVEMENT: 'SEPA',
    PRELEVEMENT_SEPA: 'SEPA',
    SEPA: 'SEPA',
    CHEQUE: 'CHEQUE',
    ESPECE: 'ESPECES',
    ESPECES: 'ESPECES',
    CASH: 'ESPECES',
  };

  return map[raw] || null;
}

function getPaymentSettingsFromMethod(value) {
  const paymentMethod = normalizeToPaymentMethod(value);

  if (!paymentMethod) {
    throw new Error('Mode de paiement invalide. Valeurs autorisées: carte bancaire, prélèvement SEPA, chèque, espèce');
  }

  if (paymentMethod === 'CB') {
    return { paymentMethod, provider: 'STRIPE', paymentPlanType: 'STRIPE_CARD' };
  }

  if (paymentMethod === 'SEPA') {
    return { paymentMethod, provider: 'STRIPE', paymentPlanType: 'STRIPE_SEPA' };
  }

  if (paymentMethod === 'ESPECES') {
    return { paymentMethod, provider: 'OFFLINE', paymentPlanType: 'ESPECES' };
  }

  return { paymentMethod, provider: 'OFFLINE', paymentPlanType: 'CHEQUE' };
}

async function shouldAutoApproveUserFromPayments(tx, userId) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    include: {
      family: {
        include: {
          payments: {
            include: {
              transactions: {
                where: { status: 'SUCCEEDED' },
              },
              paymentPlan: true,
            },
          },
        },
      },
    },
  });

  if (!user || !user.family) return false;

  const payments = user.family.payments || [];
  if (payments.length === 0) return false;

  const hasManualMethod = payments.some((payment) => ['CHEQUE', 'ESPECES'].includes(payment.paymentMethod));
  if (hasManualMethod) return false;

  const hasSuccessfulCardPayment = payments.some((payment) => payment.transactions.some((txRow) => txRow.method === 'CB'));
  if (hasSuccessfulCardPayment) return true;

  const hasCompletedSepa = payments.some((payment) => {
    if (payment.paymentMethod !== 'SEPA') return false;
    const plan = payment.paymentPlan;
    return Boolean(plan?.mandateId && plan?.providerRef);
  });

  return hasCompletedSepa;
}

async function autoApproveUserIfPaymentEligible(userId, prismaClient = prisma) {
  return prismaClient.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.validationStatus === 'APPROVED') return false;

    const shouldApprove = await shouldAutoApproveUserFromPayments(tx, userId);
    if (!shouldApprove) return false;

    await tx.user.update({
      where: { id: userId },
      data: { validationStatus: 'APPROVED' },
    });

    return true;
  });
}

module.exports = {
  normalizeToPaymentMethod,
  getPaymentSettingsFromMethod,
  autoApproveUserIfPaymentEligible,
};
