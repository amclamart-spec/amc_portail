const { PrismaClient, Prisma } = require('@prisma/client');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const {
  createOnlineCheckout,
  completeGoCardlessRedirectFlow,
  captureStripePaymentIntent,
  cancelStripePaymentIntent,
  getStripeCheckoutSession,
  getStripePaymentIntent,
  verifyStripeWebhookSignature,
  verifyGoCardlessWebhookSignature,
} = require('../services/paymentProviders');
const { sendPaymentConfirmationEmail, sendEnrollmentConfirmationEmail, sendPaymentValidationEmail } = require('../services/emailService');
const {
  resolvePricingConfig,
  calculateFamilyTotal,
  buildInstallmentSchedule,
} = require('../services/pricingService');
const { generateInvoicePDF, getInvoiceFilePath } = require('../utils/invoiceUtils');
const { getReceiptInfo, saveReceiptFile } = require('../utils/receiptUtils');
const config = require('../config');
const { hasPermission, PERMISSIONS } = require('../config/permissions');

const prisma = new PrismaClient();
const frontendLoginUrl = `${config.frontendUrl.replace(/\/$/, '')}/login`;
const REGISTRATION_PENDING_VALIDATION_MESSAGE = 'Votre inscription a bien été prise en compte, une validation par le service secrétériat interviendra sous peu.';

function toDecimal(value) {
  return new Prisma.Decimal(value || 0);
}

async function hasPendingEnrollmentsForPayment(payment) {
  if (!payment?.metadata?.enrollmentIds?.length) {
    return false;
  }

  const pendingCount = await prisma.enrollment.count({
    where: {
      id: { in: payment.metadata.enrollmentIds },
      status: 'PENDING',
    },
  });

  return pendingCount > 0;
}

async function generateInvoiceForPayment(paymentId) {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        family: { include: { user: true } },
        schoolYear: true,
      },
    });

    if (!payment || payment.status !== 'COMPLETED') {
      console.error(`Paiement ${paymentId} non trouvé ou non complété`);
      return null;
    }

    if (!payment.family || !payment.family.user) {
      console.error(`Famille ou utilisateur manquant pour paiement ${paymentId}`);
      return null;
    }

    // Get enrolled students for this family
    let enrollmentIds = payment.metadata?.enrollmentIds || [];
    if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      console.warn(`Aucun enrollmentIds dans metadata pour paiement ${paymentId}, recherche d'inscriptions alternatives`);
      // Fallback: find enrollments for this family in the same school year
      const fallbackEnrollments = await prisma.enrollment.findMany({
        where: {
          familyId: payment.familyId,
          schoolYearId: payment.schoolYearId,
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        include: {
          class: {
            include: {
              level: { include: { pole: true } },
              schoolYear: true,
            },
          },
        },
      });
      enrollmentIds = fallbackEnrollments.map(e => e.id);
      console.log(`Fallback trouvé ${enrollmentIds.length} inscriptions pour ${paymentId}`);
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        id: { in: enrollmentIds },
      },
      include: {
        class: {
          include: {
            level: { include: { pole: true } },
            schoolYear: true,
          },
        },
      },
    });

    console.log(`Génération facture pour ${paymentId} avec ${enrollments.length} inscriptions`);

    // Fetch all children (students) of the family to include on the receipt
    let children = [];
    try {
      children = await prisma.student.findMany({
        where: { familyId: payment.familyId },
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    } catch (err) {
      console.warn('Impossible de récupérer les enfants de la famille pour la facture', err?.message || err);
    }

    const familyWithChildren = { ...payment.family, children };

    // Generate PDF invoice
    const invoiceResult = await generateInvoicePDF(payment, familyWithChildren, enrollments);
    console.log(`✅ Facture générée: ${invoiceResult.filename}`);

    return invoiceResult;
  } catch (error) {
    console.error(`❌ Erreur génération facture ${paymentId}:`, error);
    return null;
  }
}

async function handlePaymentCompletionForEnrollment(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      family: { include: { user: true } },
    },
  });

  if (!payment?.family?.user || !Array.isArray(payment.metadata?.enrollmentIds) || payment.metadata.enrollmentIds.length === 0) {
    return;
  }

  const paymentData = {
    id: payment.id,
    totalAmount: payment.totalAmount,
    method: payment.paymentMethod,
  };
  await sendPaymentValidationEmail(payment.family.user, paymentData);

  if (payment.status === 'COMPLETED') {
    await generateInvoiceForPayment(paymentId);
    // Send enrollment confirmation email now that payment is completed
    try {
      let enrollmentIds = payment.metadata?.enrollmentIds || [];
      let enrollments = [];
      if (Array.isArray(enrollmentIds) && enrollmentIds.length > 0) {
        enrollments = await prisma.enrollment.findMany({
          where: { id: { in: enrollmentIds } },
          include: { class: { include: { level: { include: { pole: true } } } }, student: true },
        });
      } else {
        enrollments = await prisma.enrollment.findMany({
          where: { familyId: payment.familyId, schoolYearId: payment.schoolYearId, status: { in: ['PENDING', 'CONFIRMED'] } },
          include: { class: { include: { level: { include: { pole: true } } } }, student: true },
        });
      }

      const enrollmentDetailsHtml = enrollments.map((en) => {
        const cls = en.class || {};
        const student = en.student || { firstName: 'Élève', lastName: '' };
        const waitlistNote = en.comment === "Liste d'attente" ? " • Liste d'attente" : '';
        return `• ${student.firstName} ${student.lastName} — ${cls.level?.pole?.name || 'Pôle'} / ${cls.level?.name || 'Niveau'} ${cls.dayOfWeek || ''} ${cls.startTime || ''}-${cls.endTime || ''}${waitlistNote}`;
      }).join('<br/>');
      const paymentDetailsHtml = `<div style="margin:18px 0;padding:18px;background:#f8fafc;border-radius:12px;"><strong>Montant total :</strong> ${Number(payment.totalAmount || 0).toFixed(2)} €</div>`;

      await sendEnrollmentConfirmationEmail(payment.family.user, `${enrollmentDetailsHtml}${paymentDetailsHtml}`);
    } catch (err) {
      console.error('[EMAIL] Erreur envoi email confirmation après paiement:', err?.message || err);
    }
  }
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.ip || null;
}

function getPaymentReturnUrls(req, provider) {
  const host = `${req.protocol}://${req.get('host')}`;
  if (provider === 'GOCARDLESS') {
    return {
      returnUrl: `${host}/api/payments/gocardless/return`,
      cancelUrl: `${host}/api/payments/gocardless/cancel`,
    };
  }
  return {
    returnUrl: `${host}/api/payments/confirm`,
    cancelUrl: `${host}/api/payments/cancel`,
  };
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

  if (method === 'CHEQUE' || method === 'ESPECES') {
    if (installmentsCount < 1 || installmentsCount > 10) {
      throw new Error('Paiement chèque ou espèces: 1 à 10 paiements autorisés');
    }
    return installmentsCount;
  }

  throw new Error('Mode de paiement non supporté');
}

function getDefaultPayerName(family) {
  if (!family) return null;
  const name = [family.user?.firstName, family.user?.lastName].filter(Boolean).join(' ');
  return name || family.familyName || null;
}

function userCanManageReceipt(user, payment) {
  if (!user || !payment) return false;
  if (hasPermission(user.role, PERMISSIONS.PAYMENTS_MANAGE)) return true;
  if (hasPermission(user.role, PERMISSIONS.FAMILY_SELF_PAYMENTS) && payment.family?.userId === user.id) return true;
  return false;
}

async function uploadPaymentReceipt(req, res) {
  try {
    const { paymentId } = req.params;
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { family: true },
    });

    if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
    if (!userCanManageReceipt(req.user, payment)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier de reçu fourni' });
    }

    const receiptInfo = saveReceiptFile(paymentId, req.file);
    const metadata = {
      ...(payment.metadata || {}),
      receiptUrl: receiptInfo.relativePath,
      receiptFileName: receiptInfo.filename,
      receiptUploadedAt: new Date().toISOString(),
    };

    await prisma.payment.update({
      where: { id: paymentId },
      data: { metadata },
    });

    return res.status(201).json({
      receiptUrl: receiptInfo.relativePath,
      filename: receiptInfo.filename,
      downloadUrl: `/api/payments/${paymentId}/receipt/download`,
    });
  } catch (error) {
    console.error('Erreur uploadPaymentReceipt:', error);
    return res.status(500).json({ error: 'Erreur serveur lors de l’enregistrement du reçu' });
  }
}

async function getPaymentReceipt(req, res) {
  try {
    const { paymentId } = req.params;
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { family: true },
    });
    if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
    if (!userCanManageReceipt(req.user, payment)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const receiptUrl = payment.metadata?.receiptUrl;
    if (!receiptUrl) return res.status(404).json({ error: 'Reçu non disponible' });

    return res.json({
      receiptUrl,
      filename: payment.metadata.receiptFileName || `recu-${paymentId}.pdf`,
      downloadUrl: `/api/payments/${paymentId}/receipt/download`,
    });
  } catch (error) {
    console.error('Erreur getPaymentReceipt:', error);
    return res.status(500).json({ error: 'Erreur serveur lors de la récupération du reçu' });
  }
}

async function downloadPaymentReceipt(req, res) {
  try {
    const { paymentId } = req.params;
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { family: true },
    });
    if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
    if (!userCanManageReceipt(req.user, payment)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    const receiptUrl = payment.metadata?.receiptUrl;
    if (!receiptUrl) return res.status(404).json({ error: 'Reçu non disponible' });

    const filePath = getReceiptInfo(paymentId)?.filePath;
    if (!filePath) return res.status(404).json({ error: 'Fichier de reçu introuvable' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${payment.metadata.receiptFileName || `recu-${paymentId}.pdf`}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Erreur downloadPaymentReceipt:', error);
    return res.status(500).json({ error: 'Erreur serveur lors du téléchargement du reçu' });
  }
}

async function createFamilyEnrollmentPayment(req, res) {
  try {
    const { method, installmentsCount = 1, scheduleDay = 10, payerName } = req.body;

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

    const hasPreviousRegistrationPayment = await prisma.payment.findFirst({
      where: {
        familyId: family.id,
        schoolYearId: currentYear.id,
        registrationFee: { gt: 0 },
        status: { not: 'CANCELLED' },
      },
    });

    const pricing = calculateFamilyTotal(enrollmentData, pricingConfig, {
      skipRegistrationFee: Boolean(hasPreviousRegistrationPayment),
    });
    const paymentTotal = pricing.total + (normalizedMethod === 'GO_CARDLESS_SEPA' ? pricing.fraisPrelevement : 0);

    const provider = normalizedMethod === 'STRIPE_CARD' ? 'STRIPE' : normalizedMethod === 'GO_CARDLESS_SEPA' ? 'GOCARDLESS' : 'OFFLINE';
    const paymentMethod = normalizedMethod === 'STRIPE_CARD' ? 'CB' : normalizedMethod === 'GO_CARDLESS_SEPA' ? 'SEPA' : normalizedMethod === 'ESPECES' ? 'ESPECES' : 'CHEQUE';

    const payment = await prisma.payment.create({
      data: {
        familyId: family.id,
        schoolYearId: currentYear.id,
        totalAmount: toDecimal(paymentTotal),
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
          payerName: payerName || family.user?.lastName || '',
        },
      },
    });

    const schedule = buildInstallmentSchedule(paymentTotal, count, {
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
        totalAmount: toDecimal(paymentTotal),
        metadata: {
          createdFrom: 'family_wizard',
          ipAddress: getClientIp(req),
          sepaFee: pricing.fraisPrelevement,
        },
      },
    });

    let checkout = null;
    if (provider !== 'OFFLINE') {
      const urls = getPaymentReturnUrls(req, provider);
      checkout = await createOnlineCheckout({
        provider,
        amount: paymentTotal,
        paymentId: payment.id,
        currency: 'EUR',
        installments: count,
        returnUrl: urls.returnUrl,
        cancelUrl: urls.cancelUrl,
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
          amount: toDecimal(paymentTotal),
          status: checkout.configured ? 'INITIATED' : 'FAILED',
          externalRef: checkout.externalPaymentId || null,
          description: `Paiement inscription famille (${normalizedMethod})`,
          metadata: checkout,
        },
      });
    }

    const effectivePayerName = payerName && String(payerName).trim()
      ? String(payerName).trim()
      : getDefaultPayerName(family);

    if (provider === 'OFFLINE') {
      await prisma.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          provider: 'OFFLINE',
          method: paymentMethod,
          amount: toDecimal(paymentTotal),
          status: 'INITIATED',
          payerName: effectivePayerName,
          description: 'Paiement par ' + (paymentMethod === 'ESPECES' ? 'espèces' : 'chèque') + ' en attente de réception',
          metadata: {
            paymentInstructions: paymentMethod === 'ESPECES'
              ? 'Veuillez déposer le montant en espèces selon l\'échéancier fourni.'
              : 'Déposez les chèques au bureau PARTAGE selon l\'échéancier fourni.',
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

    const urls = getPaymentReturnUrls(req, provider);
    const checkout = await createOnlineCheckout({
      provider,
      amount,
      paymentId: payment.id,
      installments: Number(installments) || 1,
      returnUrl: urls.returnUrl,
      cancelUrl: urls.cancelUrl,
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
    const { paymentId, amount, method, description, transactionRef, payerName } = req.body;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { family: { include: { user: true } }, paymentPlan: true },
    });
    if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });

    const newPaidAmount = new Prisma.Decimal(payment.paidAmount).plus(toDecimal(amount));
    const isCompleted = newPaidAmount.greaterThanOrEqualTo(payment.totalAmount);

    const defaultPayerName = getDefaultPayerName(payment.family);
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
          payerName: payerName?.trim() || defaultPayerName,
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

    if (isCompleted) {
      await handlePaymentCompletionForEnrollment(paymentId);
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

    if (!payment.metadata?.enrollmentIds?.length) {
      await sendPaymentConfirmationEmail(payment.family.user, {
        id: payment.id,
        amount,
        method,
      });
    }

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

function buildTransactionQuery(query = {}) {
  const {
    familyId,
    payerName,
    status,
    startDate,
    endDate,
    minAmount,
    maxAmount,
  } = query;

  const where = {};

  if (familyId) {
    where.payment = { familyId };
  }

  if (payerName) {
    where.payerName = { contains: payerName, mode: 'insensitive' };
  }

  if (status) {
    where.status = status;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      const from = new Date(startDate);
      from.setHours(0, 0, 0, 0);
      where.createdAt.gte = from;
    }
    if (endDate) {
      const to = new Date(endDate);
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }

  if (minAmount || maxAmount) {
    const amountFilter = {};
    if (minAmount) {
      amountFilter.gte = new Prisma.Decimal(minAmount);
    }
    if (maxAmount) {
      amountFilter.lte = new Prisma.Decimal(maxAmount);
    }
    where.amount = amountFilter;
  }

  return where;
}

async function getTransactions(req, res) {
  try {
    const where = buildTransactionQuery(req.query);

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

async function exportTransactions(req, res) {
  try {
    const where = buildTransactionQuery(req.query);
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

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Transactions');

    sheet.columns = [
      { header: 'Date', key: 'createdAt', width: 20 },
      { header: 'Paiement', key: 'paymentId', width: 36 },
      { header: 'Payeur', key: 'payerName', width: 30 },
      { header: 'Famille', key: 'familyName', width: 30 },
      { header: 'Méthode', key: 'method', width: 15 },
      { header: 'Montant', key: 'amount', width: 15 },
      { header: 'Devise', key: 'currency', width: 10 },
      { header: 'Statut', key: 'status', width: 15 },
      { header: 'Référence externe', key: 'externalRef', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
    ];

    transactions.forEach((tx) => {
      sheet.addRow({
        createdAt: tx.createdAt ? new Date(tx.createdAt).toLocaleString('fr-FR') : '',
        paymentId: tx.paymentId,
        payerName: tx.payerName || '',
        familyName: tx.payment?.family?.familyName || '',
        method: tx.method,
        amount: Number(tx.amount).toFixed(2),
        currency: tx.currency,
        status: tx.status,
        externalRef: tx.externalRef || '',
        description: tx.description || '',
      });
    });

    const filename = `paiements-${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Erreur exportTransactions:', error);
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
    const { status, amount, reason } = req.body;

    const refund = await prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) return res.status(404).json({ error: 'Remboursement introuvable' });

    const updateData = {
      approvedById: req.user.id,
      processedAt: new Date(),
    };

    if (status) {
      updateData.status = status;
    }
    if (amount !== undefined) {
      updateData.amount = toDecimal(amount);
    }
    if (reason !== undefined) {
      updateData.reason = reason;
    }

    const updated = await prisma.refund.update({
      where: { id: refundId },
      data: updateData,
    });

    if (status === 'PROCESSED' && refund.status !== 'PROCESSED') {
      await prisma.payment.update({ where: { id: refund.paymentId }, data: { status: 'REFUNDED' } });

      const categoryId = await getOrCreateSystemCategory('Remboursements', 'EXPENSE');
      await prisma.financialEntry.create({
        data: {
          categoryId,
          paymentId: refund.paymentId,
          entryType: 'EXPENSE',
          amount: updated.amount,
          description: updated.reason,
        },
      });
    }

    return res.json({ refund: updated });
  } catch (error) {
    console.error('Erreur processRefund:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getRefunds(req, res) {
  try {
    const refunds = await prisma.refund.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        payment: {
          include: {
            family: true,
          },
        },
        approvedBy: true,
      },
    });

    return res.json({ refunds });
  } catch (error) {
    console.error('Erreur getRefunds:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteRefund(req, res) {
  try {
    const { refundId } = req.params;
    const refund = await prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) return res.status(404).json({ error: 'Remboursement introuvable' });

    await prisma.refund.delete({ where: { id: refundId } });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur deleteRefund:', error);
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

function formatStripeReturnPage(title, message, paymentId) {
  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>body{font-family:system-ui,Arial,sans-serif;padding:36px;background:#f8fafc;color:#111}a{color:#2563eb;text-decoration:none}</style>
  </head>
  <body>
    <h1>${title}</h1>
    <p>${message}</p>
    ${paymentId ? `<p>ID du paiement : <strong>${paymentId}</strong></p>` : ''}
    <p><a href="${config.frontendUrl}">Retour à l’application</a></p>
  </body>
</html>`;
}

function getStripeSessionPayerName(session, fallback = null) {
  return session?.customer_details?.name
    || session?.customer_details?.email
    || session?.customer_email
    || fallback
    || null;
}

async function finalizeStripePayment(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { family: { include: { user: true } }, paymentPlan: true },
  });

  if (!payment) {
    return payment;
  }

  const shouldVerifyStripe = payment.provider === 'STRIPE';
  if (payment.status === 'COMPLETED' && !shouldVerifyStripe) {
    return payment;
  }

  const shouldHold = shouldVerifyStripe && await hasPendingEnrollmentsForPayment(payment);
  if (shouldHold) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        externalPaymentId: payment.externalPaymentId || paymentId,
      },
    });
    return payment;
  }

  let paymentIntentId = payment.metadata?.paymentIntentId;
  let payerName = payment.metadata?.payerName || null;
  if (payment.provider === 'STRIPE' && !payerName && payment.externalPaymentId) {
    try {
      const session = await getStripeCheckoutSession(payment.externalPaymentId);
      paymentIntentId = paymentIntentId || session.payment_intent || null;
      payerName = getStripeSessionPayerName(session, payerName);
    } catch (sessionError) {
      console.error(`Impossible de récupérer la session Stripe pour ${paymentId}:`, sessionError);
    }
  }

  if (payment.provider === 'STRIPE') {
    if (!paymentIntentId) {
      const msg = `Impossible de finaliser le paiement Stripe ${paymentId} : paymentIntentId manquant`;
      console.error(msg);
      throw new Error(msg);
    }

    let paymentIntent;
    try {
      paymentIntent = await getStripePaymentIntent(paymentIntentId);
    } catch (intentError) {
      console.error(`Impossible de récupérer le PaymentIntent Stripe ${paymentIntentId} pour le paiement ${paymentId}:`, intentError);
      throw intentError;
    }

    if (String(paymentIntent.status) === 'requires_capture') {
      try {
        await captureStripePaymentIntent(paymentIntentId);
      } catch (captureError) {
        console.error(`Erreur capture Stripe pour le paiement ${paymentId}:`, captureError);
        throw captureError;
      }
    } else if (String(paymentIntent.status) !== 'succeeded') {
      const msg = `Le PaymentIntent Stripe ${paymentIntentId} n'est pas capturable (status=${paymentIntent.status})`;
      console.error(msg);
      throw new Error(msg);
    }
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'COMPLETED',
      paidAmount: payment.totalAmount,
      externalPaymentId: payment.externalPaymentId || paymentId,
      metadata: {
        ...(payment.metadata || {}),
        paymentIntentId: paymentIntentId || payment.metadata?.paymentIntentId,
        payerName: payerName || payment.metadata?.payerName || null,
      },
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
        providerRef: payment.externalPaymentId || payment.paymentPlan.providerRef || paymentId,
      },
    });
  }

  await handlePaymentCompletionForEnrollment(paymentId);

  await prisma.paymentTransaction.create({
    data: {
      paymentId,
      provider: 'STRIPE',
      method: payment.paymentMethod || 'CB',
      amount: payment.totalAmount,
      status: 'SUCCEEDED',
      externalRef: payment.externalPaymentId || paymentId,
      payerName,
      processedAt: new Date(),
      metadata: {
        source: 'stripe-return-confirm',
      },
    },
  });

  if (payment.family?.user && !payment.metadata?.enrollmentIds?.length) {
    await sendPaymentConfirmationEmail(payment.family.user, {
      id: payment.id,
      totalAmount: Number(payment.totalAmount),
      method: 'Carte bancaire Stripe',
    });
  }

  return payment;
}

async function getStripePaymentIntentId(payment) {
  let paymentIntentId = payment.metadata?.paymentIntentId;
  if (!paymentIntentId && payment.externalPaymentId) {
    try {
      const session = await getStripeCheckoutSession(payment.externalPaymentId);
      paymentIntentId = session.payment_intent || null;
    } catch (sessionError) {
      console.error(`Impossible de récupérer la session Stripe pour ${payment.id}:`, sessionError);
    }
  }
  return paymentIntentId;
}

async function cancelStripePayment(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment || payment.provider !== 'STRIPE') {
    return payment;
  }

  const paymentIntentId = await getStripePaymentIntentId(payment);
  if (!paymentIntentId) {
    const msg = `Impossible d'annuler le paiement Stripe ${paymentId} : paymentIntentId manquant`;
    console.error(msg);
    throw new Error(msg);
  }

  let paymentIntent;
  try {
    paymentIntent = await getStripePaymentIntent(paymentIntentId);
  } catch (intentError) {
    console.error(`Impossible de récupérer le PaymentIntent Stripe ${paymentIntentId} pour l'annulation du paiement ${paymentId}:`, intentError);
    throw intentError;
  }

  const cancelableStatuses = [
    'requires_capture',
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
  ];

  if (String(paymentIntent.status) === 'canceled') {
    return payment;
  }

  if (!cancelableStatuses.includes(String(paymentIntent.status))) {
    const msg = `Le PaymentIntent Stripe ${paymentIntentId} ne peut pas être annulé (status=${paymentIntent.status})`;
    console.error(msg);
    throw new Error(msg);
  }

  try {
    await cancelStripePaymentIntent(paymentIntentId);
  } catch (cancelError) {
    console.error(`Erreur lors de l'annulation du PaymentIntent Stripe ${paymentIntentId} pour le paiement ${paymentId}:`, cancelError);
    throw cancelError;
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'CANCELLED',
      metadata: {
        ...(payment.metadata || {}),
        paymentIntentId,
      },
    },
  });

  return payment;
}

async function handleStripeConfirm(req, res) {
  const paymentId = req.query.payment_id || null;
  let payment = null;
  let finalizeError = null;

  if (paymentId) {
    try {
      payment = await finalizeStripePayment(paymentId);
    } catch (error) {
      console.error('Erreur finalisation paiement Stripe sur page de retour:', error);
      finalizeError = error;
    }
  }

  if (finalizeError) {
    return res.send(formatPaymentReturnPage(
      'Erreur de validation Stripe',
      `La validation de votre paiement Stripe a échoué : ${finalizeError.message || 'Erreur inconnue'}.`, 
      paymentId,
      'Vous pouvez réessayer depuis l’application ou contacter le support.',
      `${frontendLoginUrl}?registration_message=${encodeURIComponent(REGISTRATION_PENDING_VALIDATION_MESSAGE)}`,
    ));
  }

  const isEnrollmentPayment = payment?.metadata?.enrollmentIds?.length > 0;
  const isPending = payment?.status !== 'COMPLETED';
  const title = isEnrollmentPayment && isPending ? 'Paiement en cours' : 'Paiement réussi';
  const message = isEnrollmentPayment && isPending
    ? 'Votre paiement Stripe a bien été enregistré. Il restera en attente pendant la validation de votre inscription.'
    : 'Merci, votre paiement Stripe a bien été enregistré. Vous pouvez fermer cette page ou retourner à l’application.';

  return res.send(formatPaymentReturnPage(
    title,
    message,
    paymentId,
    '',
    `${frontendLoginUrl}?registration_message=${encodeURIComponent(REGISTRATION_PENDING_VALIDATION_MESSAGE)}`,
  ));
}

function formatPaymentReturnPage(title, message, paymentId, extraMessage = '', returnUrl = frontendLoginUrl) {
  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>body{font-family:system-ui,Arial,sans-serif;padding:36px;background:#f8fafc;color:#111}a{color:#2563eb;text-decoration:none}</style>
  </head>
  <body>
    <h1>${title}</h1>
    <p>${message}</p>
    ${paymentId ? `<p>ID du paiement : <strong>${paymentId}</strong></p>` : ''}
    ${extraMessage ? `<p>${extraMessage}</p>` : ''}
    <p><a href="${returnUrl}">Retour à l’application</a></p>
  </body>
</html>`;
}

async function handleStripeCancel(req, res) {
  const paymentId = req.query.payment_id || null;
  return res.send(formatPaymentReturnPage(
    'Paiement annulé',
    'Le paiement Stripe a été annulé. Vous pouvez réessayer depuis l’application.',
    paymentId,
  ));
}

async function handleGoCardlessCancel(req, res) {
  const paymentId = req.query.payment_id || null;
  return res.send(formatPaymentReturnPage(
    'Paiement annulé',
    'Le paiement GoCardless a été annulé. Vous pouvez réessayer depuis l’application.',
    paymentId,
  ));
}

async function handleGoCardlessReturn(req, res) {
  const paymentId = req.query.payment_id || null;
  const redirectFlowId = req.query.redirect_flow_id || null;

  if (!paymentId || !redirectFlowId) {
    return res.send(formatPaymentReturnPage(
      'Retour GoCardless',
      'Paramètres de retour GoCardless manquants. Veuillez réessayer depuis l’application.',
      paymentId,
    ));
  }

  try {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      return res.send(formatPaymentReturnPage(
        'Retour GoCardless',
        'Paiement introuvable. Vérifiez depuis l’application.',
        paymentId,
      ));
    }

    if (payment.provider !== 'GOCARDLESS') {
      return res.send(formatPaymentReturnPage(
        'Retour GoCardless',
        'Ce paiement n’est pas géré par GoCardless.',
        paymentId,
      ));
    }

    const sessionToken = payment.metadata?.checkout?.sessionToken;
    if (!sessionToken) {
      return res.send(formatPaymentReturnPage(
        'Retour GoCardless',
        'Impossible de finaliser le mandat GoCardless : session introuvable.',
        paymentId,
      ));
    }

    const { flow } = await completeGoCardlessRedirectFlow({ redirectFlowId, sessionToken });

    const updateData = {
      externalPaymentId: payment.externalPaymentId || redirectFlowId,
      metadata: {
        ...(payment.metadata || {}),
        redirectFlow: flow,
      },
    };

    await prisma.payment.update({ where: { id: paymentId }, data: updateData });

    await prisma.paymentPlan.updateMany({
      where: { paymentId },
      data: {
        mandateId: flow.links?.mandate || undefined,
        providerRef: flow.links?.mandate || payment.paymentPlan?.providerRef || undefined,
        status: 'PENDING',
      },
    });

    return res.send(formatPaymentReturnPage(
      'Retour GoCardless',
      'Le mandat GoCardless a bien été finalisé. Le paiement restera en attente de confirmation via webhook.',
      paymentId,
      'Vous serez redirigé vers l’application dès que le prélèvement aura été confirmé.',
      `${frontendLoginUrl}?registration_message=${encodeURIComponent(REGISTRATION_PENDING_VALIDATION_MESSAGE)}`,
    ));
  } catch (error) {
    console.error('Erreur handleGoCardlessReturn:', error);
    return res.send(formatPaymentReturnPage(
      'Retour GoCardless',
      `Impossible de finaliser le mandat GoCardless : ${error.message}`,
      paymentId,
    ));
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
          const paymentIntentId = session.payment_intent || null;
          const shouldHold = payment.provider === 'STRIPE' && await hasPendingEnrollmentsForPayment(payment);
          const payerName = getStripeSessionPayerName(session, payment.metadata?.payerName);

          const updateData = {
            externalPaymentId: payment.externalPaymentId || session.id,
            metadata: {
              ...(payment.metadata || {}),
              paymentIntentId: paymentIntentId || payment.metadata?.paymentIntentId,
              payerName,
            },
          };

          await prisma.payment.update({ where: { id: paymentId }, data: updateData });

          if (shouldHold) {
            await prisma.paymentTransaction.create({
              data: {
                paymentId,
                provider: 'STRIPE',
                method: payment.paymentMethod || 'CB',
                amount: payment.totalAmount,
                status: 'SUCCEEDED',
                externalRef: session.id,
                payerName,
                description: 'Paiement Stripe en attente de validation de l’inscription',
                metadata: event,
              },
            });
          } else {
            if (paymentIntentId) {
              try {
                await captureStripePaymentIntent(paymentIntentId);
              } catch (captureError) {
                console.error(`Erreur capture Stripe pour le paiement ${paymentId}:`, captureError);
                throw captureError;
              }
            }

            await prisma.payment.update({
              where: { id: paymentId },
              data: {
                status: 'COMPLETED',
                paidAmount: payment.totalAmount,
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

            await handlePaymentCompletionForEnrollment(paymentId);

            await prisma.paymentTransaction.create({
              data: {
                paymentId,
                provider: 'STRIPE',
                method: payment.paymentMethod || 'CB',
                amount: payment.totalAmount,
                status: 'SUCCEEDED',
                externalRef: session.id,
                payerName,
                processedAt: new Date(),
                metadata: event,
              },
            });

            if (!payment.metadata?.enrollmentIds?.length) {
              await sendPaymentConfirmationEmail(payment.family.user, {
                id: payment.id,
                totalAmount: Number(payment.totalAmount),
                method: 'Carte bancaire Stripe',
              });
            }
          }
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
        include: { family: { include: { user: true } }, paymentPlan: true },
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

        await handlePaymentCompletionForEnrollment(paymentId);
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

async function getPaymentInvoice(req, res) {
  try {
    const { paymentId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { family: true },
    });

    if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
    if (!payment.family || payment.family.userId !== req.user.id) return res.status(403).json({ error: 'Accès non autorisé' });
    if (payment.status !== 'COMPLETED') return res.status(400).json({ error: 'Le paiement n\'est pas encore complété' });

    const invoiceInfo = getInvoiceFilePath(paymentId);
    if (!invoiceInfo) return res.status(404).json({ error: 'Facture non disponible' });

    return res.json({
      invoiceId: paymentId,
      filename: invoiceInfo.filename,
      downloadUrl: `/api/payments/${paymentId}/invoice/download`,
    });
  } catch (error) {
    console.error('Erreur getPaymentInvoice:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function downloadInvoice(req, res) {
  try {
    const { paymentId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { family: true },
    });

    if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
    if (!payment.family || payment.family.userId !== req.user.id) return res.status(403).json({ error: 'Accès non autorisé' });
    if (payment.status !== 'COMPLETED') return res.status(400).json({ error: 'Le paiement n\'est pas encore complété' });

    let invoiceInfo = getInvoiceFilePath(paymentId);
    if (!invoiceInfo) {
      console.log(`Facture manquante pour paiement ${paymentId}, régénération en cours...`);
      const generated = await generateInvoiceForPayment(paymentId);
      if (!generated) {
        console.error(`Échec de régénération de la facture pour ${paymentId}`);
        return res.status(500).json({ error: 'Impossible de générer la facture. Veuillez contacter l\'administration.' });
      }
      invoiceInfo = getInvoiceFilePath(paymentId);
      if (!invoiceInfo) {
        console.error(`Facture régénérée introuvable pour ${paymentId}`);
        return res.status(500).json({ error: 'Erreur lors de la récupération de la facture régénérée' });
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceInfo.filename}"`);
    res.sendFile(invoiceInfo.filePath);
  } catch (error) {
    console.error('Erreur downloadInvoice:', error);
    return res.status(500).json({ error: 'Erreur serveur lors du téléchargement' });
  }
}

// Fonction générique pour générer un reçu de paiement
async function generatePaymentReceiptPDF(req, res) {
  try {
    const { paymentId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        family: { include: { user: true } },
        schoolYear: true,
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Paiement introuvable' });
    }

    // Vérifier les permissions
    const isOwnPayment = payment.family.userId === req.user.id;
    const userRole = req.user && req.user.role ? req.user.role : null;
    const isAdminOrTresorier = hasPermission(userRole, PERMISSIONS.PAYMENTS_MANAGE) || 
                   hasPermission(userRole, PERMISSIONS.FINANCE_VIEW);
    
    if (!isOwnPayment && !isAdminOrTresorier) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Use shared invoice generator to ensure consistent layout (with logos, transactions, reminder)
    // Ensure family includes children list
    let familyWithChildren = payment.family;
    try {
      const children = await prisma.student.findMany({ where: { familyId: payment.familyId }, select: { id: true, firstName: true, lastName: true, dateOfBirth: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
      familyWithChildren = { ...payment.family, children };
    } catch (err) {
      console.warn('Impossible de récupérer les enfants pour le reçu (paymentController):', err?.message || err);
    }

    const invoiceResult = await generateInvoicePDF(payment, familyWithChildren, []);
    if (!invoiceResult) {
      console.error(`Échec génération reçu pour paiement ${paymentId}`);
      return res.status(500).json({ error: 'Impossible de générer le reçu' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceResult.filename}"`);
    return res.sendFile(invoiceResult.filePath);
  } catch (error) {
    console.error('Erreur generatePaymentReceiptPDF:', error);
    return res.status(500).json({ error: 'Erreur serveur lors de la génération du reçu' });
  }
}

async function generateRefundSecurityCode(req, res) {
  try {
    // Generate a 6-digit random code
    const code = Math.random().toString().substring(2, 8).padStart(6, '0');
    
    // Code expires in 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const securityCode = await prisma.refundSecurityCode.create({
      data: {
        code,
        generatedBy: req.user.id,
        expiresAt,
      },
    });

    res.json({ 
      code: securityCode.code, 
      expiresAt: securityCode.expiresAt,
      message: 'Code de sécurité généré avec succès'
    });
  } catch (error) {
    console.error('Erreur generateRefundSecurityCode:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function validateRefundSecurityCode(req, res) {
  try {
    const { code } = req.body;
    
    if (!code || code.trim().length !== 6) {
      return res.status(400).json({ error: 'Code invalide (6 chiffres requis)' });
    }

    const securityCode = await prisma.refundSecurityCode.findUnique({
      where: { code: code.trim() },
    });

    if (!securityCode) {
      return res.status(404).json({ error: 'Code non trouvé' });
    }

    // Check if code is expired
    if (new Date() > securityCode.expiresAt) {
      return res.status(400).json({ error: 'Code expiré' });
    }

    // Check if code has already been used
    if (securityCode.usedAt) {
      return res.status(400).json({ error: 'Code déjà utilisé' });
    }

    // Mark code as used
    const updated = await prisma.refundSecurityCode.update({
      where: { id: securityCode.id },
      data: {
        usedBy: req.user.id,
        usedAt: new Date(),
      },
    });

    res.json({ 
      valid: true,
      message: 'Code validé avec succès',
      expiresAt: securityCode.expiresAt,
    });
  } catch (error) {
    console.error('Erreur validateRefundSecurityCode:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  createFamilyEnrollmentPayment,
  createPaymentIntent,
  recordOfflinePayment,
  markChequeInstallmentStatus,
  getChequePaymentPlans,
  getTransactions,
  exportTransactions,
  requestRefund,
  processRefund,
  getRefunds,
  deleteRefund,
  getFamilyPaymentHistory,
  generateRefundSecurityCode,
  validateRefundSecurityCode,
  handleStripeConfirm,
  handleStripeCancel,
  handleGoCardlessReturn,
  handleGoCardlessCancel,
  handleStripeWebhook,
  handleGoCardlessWebhook,
  downloadInvoice,
  getPaymentInvoice,
  uploadPaymentReceipt,
  getPaymentReceipt,
  downloadPaymentReceipt,
  generatePaymentReceiptPDF,
  finalizeStripePayment,
};
