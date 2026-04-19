const { PrismaClient, Prisma } = require('@prisma/client');
const {
  createOnlineCheckout,
  verifyStripeWebhookSignature,
  verifyGoCardlessWebhookSignature,
} = require('../services/paymentProviders');
const { sendPaymentConfirmationEmail } = require('../services/emailService');
const {
  resolvePricingConfig,
  calculateFamilyTotal,
  buildInstallmentSchedule,
} = require('../services/pricingService');

const prisma = new PrismaClient();

function toDecimal(value) {
  return new Prisma.Decimal(value || 0);
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.ip || null;
}

async function ensureCurrentSchoolYear() {
  const year = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });
  if (!year) throw new Error('Aucune année scolaire courante');
  return year;
}

async function getOrCreateSystemCategory(name, type) {
  const existing = await prisma.financialCategory.findUnique({ where: { name } });
  if (existing) return existing.id;
  const created = await prisma.financialCategory.create({ data: { name, type, isSystem: true } });
  return created.id;
}

function normalizeInstallmentsByMethod(method, installmentsCount) {
  if (method === 'STRIPE_CARD') {
    if (![1, 2, 3, 4, 8].includes(installmentsCount)) {
      throw new Error('Paiement Stripe: seules 1, 2, 3, 4 ou 8 échéances sont autorisées');
    }
    return installmentsCount;
  }

  if (method === 'GO_CARDLESS_SEPA') {
    if (installmentsCount < 2 || installmentsCount > 8) {
      throw new Error('Prélèvement SEPA: mensualités entre 2 et 8');
    }
    return installmentsCount;
  }

  if (method === 'CHEQUE') {
    if (installmentsCount < 1 || installmentsCount > 8) {
      throw new Error('Paiement chèque: 1 à 8 chèques autorisés');
    }
    return installmentsCount;
  }

  throw new Error('Mode de paiement non supporté');
}

async function createFamilyEnrollmentPayment(req, res) {
  try {
    const { method, installmentsCount = 1, scheduleDay = 10 } = req.body;

    const normalizedMethod = method || 'CHEQUE';
    const count = normalizeInstallmentsByMethod(normalizedMethod, Number(installmentsCount));

    if (normalizedMethod === 'GO_CARDLESS_SEPA' && ![10, 20, 30].includes(Number(scheduleDay))) {
      return res.status(400).json({ error: 'Le jour de prélèvement doit être 10, 20 ou 30' });
    }

    const family = await prisma.family.findUnique({
      where: { userId: req.user.id },
      include: { user: true },
    });
    if (!family) return res.status(404).json({ error: 'Profil famille non trouvé' });

    const currentYear = await ensureCurrentSchoolYear();
    const enrollments = await prisma.enrollment.findMany({
      where: {
        student: { familyId: family.id },
        schoolYearId: currentYear.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        student: true,
        class: { include: { level: { include: { pole: true } } } },
      },
    });

    if (enrollments.length === 0) {
      return res.status(400).json({ error: 'Aucune inscription active pour générer un paiement' });
    }

    const pricingConfig = await resolvePricingConfig(prisma);
    const enrollmentData = enrollments.map((e) => ({
      levelCode: e.class.level.code,
      poleName: e.class.level.pole.name,
    }));
    const pricing = calculateFamilyTotal(enrollmentData, pricingConfig);

    const provider = normalizedMethod === 'STRIPE_CARD' ? 'STRIPE' : normalizedMethod === 'GO_CARDLESS_SEPA' ? 'GOCARDLESS' : 'OFFLINE';
    const paymentMethod = normalizedMethod === 'STRIPE_CARD' ? 'CB' : normalizedMethod === 'GO_CARDLESS_SEPA' ? 'SEPA' : 'CHEQUE';

    const payment = await prisma.payment.create({
      data: {
        familyId: family.id,
        schoolYearId: currentYear.id,
        totalAmount: toDecimal(pricing.total),
        paidAmount: toDecimal(0),
        registrationFee: toDecimal(pricing.registrationFee),
        arabicFee: toDecimal(pricing.arabicFee),
        coranScienceFee: toDecimal(pricing.coranScienceFee),
        paymentMethod,
        provider,
        numberOfInstallments: count,
        status: 'PENDING',
        metadata: {
          enrollmentCount: enrollments.length,
          enrollmentIds: enrollments.map((e) => e.id),
          paymentPlanType: normalizedMethod,
        },
      },
    });

    const schedule = buildInstallmentSchedule(pricing.total, count, {
      dayOfMonth: Number(scheduleDay || 10),
      startDate: new Date(),
    });

    await prisma.installment.createMany({
      data: schedule.map((s) => ({
        paymentId: payment.id,
        installmentNumber: s.installmentNumber,
        amount: toDecimal(s.amount),
        dueDate: s.dueDate,
        status: 'UPCOMING',
      })),
    });

    const plan = await prisma.paymentPlan.create({
      data: {
        familyId: family.id,
        schoolYearId: currentYear.id,
        paymentId: payment.id,
        type: normalizedMethod,
        status: provider === 'OFFLINE' ? 'ACTIVE' : 'PENDING',
        installmentsCount: count,
        scheduleDay: Number(scheduleDay || 10),
        totalAmount: toDecimal(pricing.total),
        metadata: {
          createdFrom: 'family_wizard',
          ipAddress: getClientIp(req),
        },
      },
    });

    let checkout = null;
    if (provider !== 'OFFLINE') {
      checkout = await createOnlineCheckout({
        provider,
        amount: pricing.total,
        paymentId: payment.id,
        currency: 'EUR',
        installments: count,
        returnUrl: `${req.protocol}://${req.get('host')}/api/payments/confirm`,
        cancelUrl: `${req.protocol}://${req.get('host')}/api/payments/cancel`,
        customer: {
          firstName: family.user.firstName,
          lastName: family.user.lastName,
          email: family.user.email,
        },
        metadata: {
          family_id: family.id,
          plan_id: plan.id,
        },
      });

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          externalPaymentId: checkout.externalPaymentId || null,
          metadata: {
            ...(payment.metadata || {}),
            checkout,
          },
        },
      });

      await prisma.paymentPlan.update({
        where: { id: plan.id },
        data: {
          providerRef: checkout.externalPaymentId || null,
          status: checkout.configured ? 'PENDING' : 'FAILED',
          metadata: {
            ...(plan.metadata || {}),
            checkout,
          },
        },
      });

      await prisma.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          provider,
          method: paymentMethod,
          amount: toDecimal(pricing.total),
          status: checkout.configured ? 'INITIATED' : 'FAILED',
          externalRef: checkout.externalPaymentId || null,
          description: `Paiement inscription famille (${normalizedMethod})`,
          metadata: checkout,
        },
      });
    }

    if (provider === 'OFFLINE') {
      await prisma.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          provider: 'OFFLINE',
          method: 'CHEQUE',
          amount: toDecimal(pricing.total),
          status: 'INITIATED',
          description: 'Paiement par chèque en attente de réception',
          metadata: {
            paymentInstructions: 'Déposez les chèques au bureau AMC selon l\'échéancier fourni.',
          },
        },
      });
    }

    return res.status(201).json({
      payment,
      paymentPlan: plan,
      installments: schedule,
      pricing,
      checkout,
    });
  } catch (error) {
    console.error('Erreur createFamilyEnrollmentPayment:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function createPaymentIntent(req, res) {
  try {
    const { familyId, amount, provider, method, description, installments = 1 } = req.body;
    const currentYear = await ensureCurrentSchoolYear();

    const payment = await prisma.payment.create({
      data: {
        familyId,
        schoolYearId: currentYear.id,
        totalAmount: toDecimal(amount),
        paymentMethod: method,
        provider,
        status: 'PENDING',
        numberOfInstallments: Number(installments) || 1,
        metadata: { description: description || null },
      },
    });

    const checkout = await createOnlineCheckout({
      provider,
      amount,
      paymentId: payment.id,
      installments: Number(installments) || 1,
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

    return res.status(201).json({ payment, checkout });
  } catch (error) {
    console.error('Erreur createPaymentIntent:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function recordOfflinePayment(req, res) {
  try {
    const { paymentId, amount, method, description, transactionRef } = req.body;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { family: { include: { user: true } }, paymentPlan: true },
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

    if (payment.paymentPlan) {
      await prisma.paymentPlan.update({
        where: { id: payment.paymentPlan.id },
        data: { status: isCompleted ? 'COMPLETED' : 'ACTIVE' },
      });
    }

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

    return res.json({ payment: updatedPayment, transaction });
  } catch (error) {
    console.error('Erreur recordOfflinePayment:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function markChequeInstallmentStatus(req, res) {
  try {
    const { installmentId } = req.params;
    const { status, chequeNumber, comment } = req.body;

    const validStatuses = ['UPCOMING', 'PAID', 'FAILED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    const installment = await prisma.installment.findUnique({
      where: { id: installmentId },
      include: {
        payment: {
          include: {
            family: { include: { user: true } },
          },
        },
      },
    });

    if (!installment) return res.status(404).json({ error: 'Échéance introuvable' });

    const updated = await prisma.installment.update({
      where: { id: installmentId },
      data: {
        status,
        chequeNumber: chequeNumber || installment.chequeNumber,
        comment: comment || installment.comment,
        paidAt: status === 'PAID' ? new Date() : installment.paidAt,
      },
    });

    if (status === 'FAILED') {
      await prisma.payment.update({
        where: { id: installment.paymentId },
        data: { status: 'OVERDUE' },
      });
    }

    return res.json({ installment: updated });
  } catch (error) {
    console.error('Erreur markChequeInstallmentStatus:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getChequePaymentPlans(_req, res) {
  try {
    const plans = await prisma.paymentPlan.findMany({
      where: { type: 'CHEQUE' },
      include: {
        family: true,
        payment: {
          include: {
            installments: { orderBy: { installmentNumber: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ plans });
  } catch (error) {
    console.error('Erreur getChequePaymentPlans:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
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

    return res.json({ transactions });
  } catch (error) {
    console.error('Erreur getTransactions:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
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

    return res.status(201).json({ refund });
  } catch (error) {
    console.error('Erreur requestRefund:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
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
      await prisma.payment.update({ where: { id: refund.paymentId }, data: { status: 'REFUNDED' } });

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

    return res.json({ refund: updated });
  } catch (error) {
    console.error('Erreur processRefund:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
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
        installments: { orderBy: { installmentNumber: 'asc' } },
        paymentPlan: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ payments });
  } catch (error) {
    console.error('Erreur getFamilyPaymentHistory:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function handleStripeWebhook(req, res) {
  try {
    const signature = req.headers['stripe-signature'];
    const isValid = verifyStripeWebhookSignature(req.body, signature);

    if (!isValid) {
      return res.status(400).json({ error: 'Signature Stripe invalide' });
    }

    const event = JSON.parse(req.body.toString('utf8'));

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const paymentId = session.metadata?.payment_id;

      if (paymentId) {
        const payment = await prisma.payment.findUnique({
          where: { id: paymentId },
          include: { family: { include: { user: true } }, paymentPlan: true },
        });

        if (payment) {
          await prisma.payment.update({
            where: { id: paymentId },
            data: {
              status: 'COMPLETED',
              paidAmount: payment.totalAmount,
              externalPaymentId: session.id,
            },
          });

          await prisma.installment.updateMany({
            where: { paymentId },
            data: { status: 'PAID', paidAt: new Date() },
          });

          if (payment.paymentPlan) {
            await prisma.paymentPlan.update({
              where: { id: payment.paymentPlan.id },
              data: { status: 'COMPLETED', providerRef: session.id },
            });
          }

          await prisma.paymentTransaction.create({
            data: {
              paymentId,
              provider: 'STRIPE',
              method: payment.paymentMethod || 'CB',
              amount: payment.totalAmount,
              status: 'SUCCEEDED',
              externalRef: session.id,
              processedAt: new Date(),
              metadata: event,
            },
          });

          await sendPaymentConfirmationEmail(payment.family.user, {
            id: payment.id,
            totalAmount: Number(payment.totalAmount),
            method: 'Carte bancaire Stripe',
          });
        }
      }
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('Erreur handleStripeWebhook:', error);
    return res.status(500).json({ error: 'Erreur webhook Stripe' });
  }
}

async function handleGoCardlessWebhook(req, res) {
  try {
    const signature = req.headers['webhook-signature'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

    const isValid = verifyGoCardlessWebhookSignature(rawBody, signature);
    if (!isValid) {
      return res.status(400).json({ error: 'Signature GoCardless invalide' });
    }

    const body = JSON.parse(rawBody.toString('utf8'));
    const events = body.events || [];

    for (const event of events) {
      const paymentId = event.links?.payment || event.details?.metadata?.payment_id;
      if (!paymentId) continue;

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { paymentPlan: true },
      });
      if (!payment) continue;

      if (event.action === 'confirmed' || event.action === 'paid_out') {
        await prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: 'COMPLETED',
            paidAmount: payment.totalAmount,
            externalPaymentId: event.links?.payment || payment.externalPaymentId,
          },
        });

        await prisma.installment.updateMany({
          where: { paymentId },
          data: { status: 'PAID', paidAt: new Date() },
        });

        if (payment.paymentPlan) {
          await prisma.paymentPlan.update({
            where: { id: payment.paymentPlan.id },
            data: {
              status: 'COMPLETED',
              mandateId: event.links?.mandate || payment.paymentPlan.mandateId,
              providerRef: event.links?.payment || payment.paymentPlan.providerRef,
            },
          });
        }
      }

      if (event.action === 'failed' || event.action === 'cancelled') {
        await prisma.payment.update({ where: { id: paymentId }, data: { status: 'FAILED' } });

        if (payment.paymentPlan) {
          await prisma.paymentPlan.update({ where: { id: payment.paymentPlan.id }, data: { status: 'FAILED' } });
        }
      }

      await prisma.paymentTransaction.create({
        data: {
          paymentId,
          provider: 'GOCARDLESS',
          method: payment.paymentMethod || 'SEPA',
          amount: payment.totalAmount,
          status: event.action === 'failed' ? 'FAILED' : 'SUCCEEDED',
          externalRef: event.id,
          metadata: event,
          processedAt: new Date(),
        },
      });
    }

    return res.json({ received: true, count: events.length });
  } catch (error) {
    console.error('Erreur handleGoCardlessWebhook:', error);
    return res.status(500).json({ error: 'Erreur webhook GoCardless' });
  }
}

module.exports = {
  createFamilyEnrollmentPayment,
  createPaymentIntent,
  recordOfflinePayment,
  markChequeInstallmentStatus,
  getChequePaymentPlans,
  getTransactions,
  requestRefund,
  processRefund,
  getFamilyPaymentHistory,
  handleStripeWebhook,
  handleGoCardlessWebhook,
};
