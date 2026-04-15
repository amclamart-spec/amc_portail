const { PrismaClient, Prisma } = require('@prisma/client');
const { createOnlineCheckout } = require('../services/paymentProviders');
const { sendPaymentConfirmationEmail } = require('../services/emailService');

const prisma = new PrismaClient();

function toDecimal(value) {
  return new Prisma.Decimal(value || 0);
}

async function ensureCurrentSchoolYear() {
  const year = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });
  if (!year) throw new Error('Aucune année scolaire courante');
  return year;
}

async function createPaymentIntent(req, res) {
  try {
    const { familyId, amount, provider, method, description } = req.body;
    const currentYear = await ensureCurrentSchoolYear();

    const payment = await prisma.payment.create({
      data: {
        familyId,
        schoolYearId: currentYear.id,
        totalAmount: toDecimal(amount),
        paymentMethod: method,
        provider,
        status: 'PENDING',
        metadata: { description: description || null },
      },
    });

    const checkout = await createOnlineCheckout({
      provider,
      amount,
      paymentId: payment.id,
      returnUrl: `${req.protocol}://${req.get('host')}/api/payments/confirm`,
      cancelUrl: `${req.protocol}://${req.get('host')}/api/payments/cancel`,
    });

    await prisma.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        provider,
        method,
        amount: toDecimal(amount),
        status: checkout.configured ? 'INITIATED' : 'FAILED',
        externalRef: checkout.externalPaymentId,
        description: description || null,
        metadata: checkout,
      },
    });

    res.status(201).json({ payment, checkout });
  } catch (error) {
    console.error('Erreur createPaymentIntent:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function recordOfflinePayment(req, res) {
  try {
    const { paymentId, amount, method, description, transactionRef } = req.body;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { family: { include: { user: true } } },
    });
    if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });

    const newPaidAmount = new Prisma.Decimal(payment.paidAmount).plus(toDecimal(amount));
    const isCompleted = newPaidAmount.greaterThanOrEqualTo(payment.totalAmount);

    const [updatedPayment, transaction] = await prisma.$transaction([
      prisma.payment.update({
        where: { id: paymentId },
        data: {
          paidAmount: newPaidAmount,
          paymentMethod: method,
          provider: 'OFFLINE',
          status: isCompleted ? 'COMPLETED' : 'PARTIAL',
        },
      }),
      prisma.paymentTransaction.create({
        data: {
          paymentId,
          provider: 'OFFLINE',
          method,
          amount: toDecimal(amount),
          status: 'SUCCEEDED',
          externalRef: transactionRef || null,
          description: description || 'Paiement hors ligne',
          recordedById: req.user.id,
          processedAt: new Date(),
        },
      }),
    ]);

    await prisma.financialEntry.create({
      data: {
        categoryId: await getOrCreateSystemCategory('Paiements cotisations', 'INCOME'),
        paymentId,
        entryType: 'INCOME',
        amount: toDecimal(amount),
        description: description || 'Paiement famille',
      },
    });

    await sendPaymentConfirmationEmail(payment.family.user, {
      id: payment.id,
      amount,
      method,
    });

    res.json({ payment: updatedPayment, transaction });
  } catch (error) {
    console.error('Erreur recordOfflinePayment:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getOrCreateSystemCategory(name, type) {
  const existing = await prisma.financialCategory.findUnique({ where: { name } });
  if (existing) return existing.id;
  const created = await prisma.financialCategory.create({ data: { name, type, isSystem: true } });
  return created.id;
}

async function getTransactions(req, res) {
  try {
    const { familyId } = req.query;
    const where = familyId ? { payment: { familyId } } : {};

    const transactions = await prisma.paymentTransaction.findMany({
      where,
      include: {
        payment: {
          include: {
            family: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ transactions });
  } catch (error) {
    console.error('Erreur getTransactions:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function requestRefund(req, res) {
  try {
    const { paymentId, amount, reason } = req.body;

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });

    const refund = await prisma.refund.create({
      data: {
        paymentId,
        amount: toDecimal(amount),
        reason,
        requestedBy: req.user.id,
        status: 'PENDING',
      },
    });

    res.status(201).json({ refund });
  } catch (error) {
    console.error('Erreur requestRefund:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function processRefund(req, res) {
  try {
    const { refundId } = req.params;
    const { status } = req.body;

    const refund = await prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) return res.status(404).json({ error: 'Remboursement introuvable' });

    const updated = await prisma.refund.update({
      where: { id: refundId },
      data: {
        status,
        approvedById: req.user.id,
        processedAt: new Date(),
      },
    });

    if (status === 'PROCESSED') {
      await prisma.payment.update({
        where: { id: refund.paymentId },
        data: { status: 'REFUNDED' },
      });

      const categoryId = await getOrCreateSystemCategory('Remboursements', 'EXPENSE');
      await prisma.financialEntry.create({
        data: {
          categoryId,
          paymentId: refund.paymentId,
          entryType: 'EXPENSE',
          amount: refund.amount,
          description: refund.reason,
        },
      });
    }

    res.json({ refund: updated });
  } catch (error) {
    console.error('Erreur processRefund:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getFamilyPaymentHistory(req, res) {
  try {
    const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
    if (!family) return res.status(404).json({ error: 'Famille introuvable' });

    const payments = await prisma.payment.findMany({
      where: { familyId: family.id },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
        refunds: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ payments });
  } catch (error) {
    console.error('Erreur getFamilyPaymentHistory:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  createPaymentIntent,
  recordOfflinePayment,
  getTransactions,
  requestRefund,
  processRefund,
  getFamilyPaymentHistory,
};
