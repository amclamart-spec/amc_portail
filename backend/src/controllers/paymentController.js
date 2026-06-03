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
  getStripeSepaMandateDetailsByChargeId,
  verifyStripeWebhookSignature,
  verifyGoCardlessWebhookSignature,
} = require('../services/paymentProviders');
const {
  sendPaymentConfirmationEmail,
  sendEnrollmentConfirmationEmail,
  sendEnrollmentConfirmedEmail,
  sendPaymentValidationEmail,
} = require('../services/emailService');
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

function isStripeProvider(provider) {
  return provider === 'STRIPE' || provider === 'STRIPE_CARD' || provider === 'STRIPE_SEPA';
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

async function upsertStripePaymentTransaction({ paymentId, provider, method, amount, status, externalRef, payerName, description, metadata = {}, processedAt = null }) {
  const existingTransaction = await prisma.paymentTransaction.findFirst({
    where: { paymentId, externalRef },
    orderBy: { createdAt: 'desc' },
  });

  const data = {
    provider,
    method,
    amount: toDecimal(amount),
    status,
    payerName,
    description,
    metadata: metadata || {},
    processedAt,
  };

  if (existingTransaction) {
    return prisma.paymentTransaction.update({
      where: { id: existingTransaction.id },
      data,
    });
  }

  return prisma.paymentTransaction.create({
    data: {
      paymentId,
      externalRef,
      ...data,
    },
  });
}

async function generateInvoiceForPayment(paymentId) {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        family: { include: { user: true } },
        schoolYear: true,
        transactions: { orderBy: { createdAt: 'desc' } },
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
          schoolYearId: payment.schoolYearId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          student: { familyId: payment.familyId },
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
        student: true,
      },
    });

    console.log(`Génération facture pour ${paymentId} avec ${enrollments.length} inscriptions`);

    // Derive the list of children concerned by these enrollments (unique)
    const studentList = (enrollments || [])
      .map((e) => e.student)
      .filter(Boolean);
    const uniqueStudentsMap = new Map();
    for (const s of studentList) {
      if (!s || !s.id) continue;
      uniqueStudentsMap.set(String(s.id), { id: s.id, firstName: s.firstName, lastName: s.lastName, dateOfBirth: s.dateOfBirth });
    }
    const uniqueStudents = Array.from(uniqueStudentsMap.values()).sort((a, b) => {
      const la = (a.lastName || '').localeCompare(b.lastName || '');
      if (la !== 0) return la;
      return (a.firstName || '').localeCompare(b.firstName || '');
    });

    const familyWithChildren = { ...payment.family, children: uniqueStudents };

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
    const invoiceResult = await generateInvoiceForPayment(paymentId);
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
          where: {
            schoolYearId: payment.schoolYearId,
            status: { in: ['PENDING', 'CONFIRMED'] },
            student: { familyId: payment.familyId },
          },
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
      const attachments = [];
      if (invoiceResult?.filePath) {
        attachments.push({ path: invoiceResult.filePath, filename: invoiceResult.filename });
      }

      await sendEnrollmentConfirmedEmail(payment.family.user, `${enrollmentDetailsHtml}${paymentDetailsHtml}`, attachments);
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
  if (method === 'STRIPE_CARD' || method === 'STRIPE_SEPA') {
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

    if ((normalizedMethod === 'GO_CARDLESS_SEPA' || normalizedMethod === 'STRIPE_SEPA') && ![10, 20, 30].includes(Number(scheduleDay))) {
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
      poleId: e.class.level.pole.id,
      levelId: e.class.level.id,
      poleName: e.class.level.pole.name,
      levelCode: e.class.level.code,
    }));

    // Build totalFamilyEnrollmentsByPole from the current enrollments
    const totalFamilyEnrollmentsByPole = {};
    for (const e of enrollments) {
      const poleName = String(e.class.level.pole.name || '').toLowerCase();
      const poleId = e.class.level.pole.id || '';
      const poleKey = poleId || poleName;
      if (poleKey) {
        totalFamilyEnrollmentsByPole[poleKey] = (totalFamilyEnrollmentsByPole[poleKey] || 0) + 1;
      }
    }

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
      totalFamilyEnrollmentsByPole,
    });
    const paymentTotal = pricing.total;

    const provider = normalizedMethod === 'STRIPE_CARD' || normalizedMethod === 'STRIPE_SEPA' ? 'STRIPE' : normalizedMethod === 'GO_CARDLESS_SEPA' ? 'GOCARDLESS' : 'OFFLINE';
    const paymentMethod = normalizedMethod === 'STRIPE_CARD' ? 'CB' : normalizedMethod === 'STRIPE_SEPA' ? 'SEPA' : normalizedMethod === 'GO_CARDLESS_SEPA' ? 'SEPA' : normalizedMethod === 'ESPECES' ? 'ESPECES' : 'CHEQUE';

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
        paymentMethodType: paymentMethod === 'SEPA' ? 'sepa_debit' : 'card',
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
            paymentIntentId: checkout.paymentIntentId || null,
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
    const normalizedProvider = provider === 'STRIPE_CARD' || provider === 'STRIPE_SEPA' ? 'STRIPE' : provider === 'GO_CARDLESS_SEPA' ? 'GOCARDLESS' : provider;
    const normalizedMethod = provider === 'STRIPE_CARD' ? 'CB' : method;
    const currentYear = await ensureCurrentSchoolYear();

    const family = familyId
      ? await prisma.family.findUnique({
          where: { id: familyId },
          include: { user: true },
        })
      : null;

    const customer = family?.user
      ? {
          email: family.user.email,
          firstName: family.user.firstName,
          lastName: family.user.lastName,
        }
      : null;

    const payment = await prisma.payment.create({
      data: {
        familyId,
        schoolYearId: currentYear.id,
        totalAmount: toDecimal(amount),
        paymentMethod: normalizedMethod,
        provider: normalizedProvider,
        status: 'PENDING',
        numberOfInstallments: Number(installments) || 1,
        metadata: { description: description || null },
      },
    });

    const urls = getPaymentReturnUrls(req, normalizedProvider);
    const checkout = await createOnlineCheckout({
      provider: normalizedProvider,
      amount,
      paymentId: payment.id,
      paymentMethodType: normalizedMethod === 'SEPA' ? 'sepa_debit' : 'card',
      installments: Number(installments) || 1,
      returnUrl: urls.returnUrl,
      cancelUrl: urls.cancelUrl,
      customer,
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        externalPaymentId: checkout.externalPaymentId || null,
        metadata: {
          ...(payment.metadata || {}),
          paymentIntentId: checkout.paymentIntentId || null,
        },
      },
    });

    await prisma.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        provider: normalizedProvider,
        method: normalizedMethod,
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

  // support multiple input names for family search (family, familyName, family_name)
  const rawFamilyName = query.familyName || query.family || query.family_name || null;

  const where = {};
  const paymentWhere = {};

  if (familyId) {
    paymentWhere.familyId = familyId;
  }

  if (rawFamilyName) {
    // filter on related payment.family.familyName
    paymentWhere.family = {
      familyName: { contains: String(rawFamilyName), mode: 'insensitive' },
    };
  }

  if (Object.keys(paymentWhere).length > 0) {
    where.payment = paymentWhere;
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

async function recalculatePaymentAggregate(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { transactions: true },
  });

  if (!payment) {
    throw new Error('Paiement introuvable');
  }

  const paidAmount = payment.transactions.reduce((sum, tx) => {
    if (String(tx.status) === 'SUCCEEDED') {
      return sum.plus(tx.amount);
    }
    return sum;
  }, new Prisma.Decimal(0));

  let status = 'PENDING';
  if (paidAmount.greaterThanOrEqualTo(payment.totalAmount)) {
    status = 'COMPLETED';
  } else if (paidAmount.greaterThan(0)) {
    status = 'PARTIAL';
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      paidAmount,
      status,
    },
  });
}

async function updateTransactionStatus(req, res) {
  try {
    const { status } = req.body;
    const transactionId = req.params.transactionId;
    const allowedStatuses = ['validé', 'annulé', 'SUCCEEDED', 'CANCELLED'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Statut de paiement invalide' });
    }

    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
      include: { payment: true },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction introuvable' });
    }

    const newStatus = status === 'validé' || status === 'SUCCEEDED' ? 'SUCCEEDED' : 'CANCELLED';

    if (String(transaction.status) === newStatus) {
      return res.json({
        transaction: {
          id: transaction.id,
          paymentId: transaction.paymentId,
          payerName: transaction.payerName,
          method: transaction.method,
          description: transaction.description,
          amount: String(transaction.amount),
          status: transaction.status,
          provider: transaction.provider,
          processedAt: transaction.processedAt,
          createdAt: transaction.createdAt,
        },
      });
    }

    if (String(transaction.status) !== 'INITIATED') {
      return res.status(403).json({ error: 'Seuls les paiements au statut Initié peuvent être modifiés' });
    }

    // New rule: cannot validate a payment if any related enrollment has levelValidated === false
    if (newStatus === 'SUCCEEDED') {
      // Determine enrollment IDs from payment metadata or fallback like invoice generation
      const paymentFull = await prisma.payment.findUnique({ where: { id: transaction.paymentId } });
      let enrollmentIds = paymentFull?.metadata?.enrollmentIds || [];
      if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
        const fallbackEnrollments = await prisma.enrollment.findMany({
          where: {
            familyId: paymentFull?.familyId,
            schoolYearId: paymentFull?.schoolYearId,
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
          select: { id: true },
        });
        enrollmentIds = fallbackEnrollments.map(e => e.id);
      }

      if (Array.isArray(enrollmentIds) && enrollmentIds.length > 0) {
        const unvalidatedCount = await prisma.enrollment.count({
          where: {
            id: { in: enrollmentIds },
            levelValidated: false,
          },
        });

        if (unvalidatedCount > 0) {
          return res.status(400).json({ error: 'Niveau scolaire non validé, donc validation de paiement impossible' });
        }
      }
    }

    const updatedTransaction = await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: newStatus,
        processedAt: new Date(),
      },
    });

    try {
      const isStripePayment = isStripeProvider(transaction.provider) || isStripeProvider(transaction.payment?.provider);
      if (isStripePayment) {
        if (newStatus === 'SUCCEEDED') {
          await finalizeStripePayment(updatedTransaction.paymentId);
        } else {
          await cancelStripePayment(updatedTransaction.paymentId);
        }
      }

      // Recalculate aggregates after successful provider handling
      await recalculatePaymentAggregate(updatedTransaction.paymentId);

      return res.json({
        transaction: {
          id: updatedTransaction.id,
          paymentId: updatedTransaction.paymentId,
          payerName: updatedTransaction.payerName,
          method: updatedTransaction.method,
          description: updatedTransaction.description,
          amount: String(updatedTransaction.amount),
          status: updatedTransaction.status,
          provider: updatedTransaction.provider,
          processedAt: updatedTransaction.processedAt,
          createdAt: updatedTransaction.createdAt,
        },
      });
    } catch (providerError) {
      // Revert transaction status when provider update fails
      await prisma.paymentTransaction.update({
        where: { id: updatedTransaction.id },
        data: { status: 'INITIATED', processedAt: null },
      });
      await recalculatePaymentAggregate(updatedTransaction.paymentId);
      console.error('Erreur mise à jour du paiement Stripe:', providerError);
      return res.status(502).json({ error: providerError.message || 'Erreur fournisseur lors de la finalisation du paiement' });
    }
  } catch (error) {
    console.error('Erreur updateTransactionStatus:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getTransactions(req, res) {
  try {
    const where = buildTransactionQuery(req.query);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(Math.min(parseInt(req.query.limit, 10) || 50, 100), 1);
    const offset = (page - 1) * limit;

    const [total, transactions] = await Promise.all([
      prisma.paymentTransaction.count({ where }),
      prisma.paymentTransaction.findMany({
        where,
        include: {
          payment: {
            include: {
              family: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);
    return res.json({ transactions, total, page, limit, totalPages });
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
    const { paymentId } = req.query;
    const where = {};
    if (paymentId) {
      where.paymentId = paymentId;
    }

    const refunds = await prisma.refund.findMany({
      where,
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

function isStripeInstallmentPayment(payment) {
  return payment?.numberOfInstallments > 1;
}

async function getStripeFirstInstallmentAmount(paymentId) {
  const installment = await prisma.installment.findFirst({
    where: { paymentId, installmentNumber: 1 },
  });
  return installment?.amount || null;
}

async function recordStripeInstallmentResult({ payment, paymentIntentId, externalPaymentId, shouldHold }) {
  const firstInstallmentAmount = await getStripeFirstInstallmentAmount(payment.id) || payment.totalAmount;
  const paymentStatus = shouldHold ? 'PENDING' : 'PARTIAL';
  const planStatus = shouldHold ? (payment.paymentPlan?.status || 'PENDING') : 'ACTIVE';

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: paymentStatus,
      paidAmount: toDecimal(firstInstallmentAmount),
      externalPaymentId: externalPaymentId || payment.externalPaymentId,
      metadata: {
        ...(payment.metadata || {}),
        paymentIntentId: paymentIntentId || payment.metadata?.paymentIntentId,
      },
    },
  });

  await prisma.installment.updateMany({
    where: { paymentId: payment.id, installmentNumber: 1 },
    data: { status: 'PAID', paidAt: new Date() },
  });

  if (!shouldHold && payment.paymentPlan) {
    await prisma.paymentPlan.update({
      where: { id: payment.paymentPlan.id },
      data: {
        status: planStatus,
        providerRef: externalPaymentId || payment.paymentPlan.providerRef || payment.externalPaymentId,
      },
    });
  }
}

async function finalizeStripePayment(paymentId, options = {}) {
  const { force = false } = options;
  console.log(`[FINALIZE STRIPE] Début de finalisation pour paiement ${paymentId} (force=${force})`);
  
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { family: { include: { user: true } }, paymentPlan: true },
  });

  if (!payment) {
    console.log(`[FINALIZE STRIPE] Paiement ${paymentId} non trouvé`);
    return payment;
  }

  const hasPendingEnrollments = !force && await hasPendingEnrollmentsForPayment(payment);
  if (hasPendingEnrollments) {
    console.log(`[FINALIZE STRIPE] Paiement ${paymentId} lié à des inscriptions en attente, capture différée.`);
    return payment;
  }

  if (payment.status === 'COMPLETED' && !isStripeProvider(payment.provider)) {
    console.log(`[FINALIZE STRIPE] Paiement ${paymentId} déjà complété, rien à finaliser`);
    return payment;
  }
  if (payment.status === 'COMPLETED' && isStripeProvider(payment.provider)) {
    console.log(`[FINALIZE STRIPE] Paiement ${paymentId} déjà complété en base, vérification/capture Stripe nécessaire`);
  }

  const shouldVerifyStripe = isStripeProvider(payment.provider);
  let paymentIntentId = await getStripePaymentIntentId(payment);
  let payerName = payment.metadata?.payerName || null;

  console.log(`[FINALIZE STRIPE] paymentIntentId depuis metadata ou Stripe: ${paymentIntentId}, externalPaymentId: ${payment.externalPaymentId}`);

  if (isStripeProvider(payment.provider) && !paymentIntentId) {
    const msg = `Impossible de finaliser le paiement Stripe ${paymentId} : paymentIntentId manquant`;
    console.error(`[FINALIZE STRIPE] ${msg}`);
    throw new Error(msg);
  }

  if (isStripeProvider(payment.provider)) {
    let paymentIntent;
    try {
      console.log(`[FINALIZE STRIPE] Récupération du statut du PaymentIntent ${paymentIntentId}`);
      paymentIntent = await getStripePaymentIntent(paymentIntentId);
      console.log(`[FINALIZE STRIPE] PaymentIntent retrouvé: status=${paymentIntent.status}`);
    } catch (intentError) {
      console.error(`[FINALIZE STRIPE] Impossible de récupérer le PaymentIntent Stripe ${paymentIntentId} pour le paiement ${paymentId}:`, intentError);
      throw intentError;
    }

    if (String(paymentIntent.status) === 'requires_capture') {
      console.log(`[FINALIZE STRIPE] PaymentIntent en requires_capture, appel de capture`);
      try {
        await captureStripePaymentIntent(paymentIntentId);
      } catch (captureError) {
        console.error(`[FINALIZE STRIPE] Erreur capture Stripe pour le paiement ${paymentId}:`, captureError);
        throw captureError;
      }
    } else if (String(paymentIntent.status) !== 'succeeded') {
      const msg = `Le PaymentIntent Stripe ${paymentIntentId} n'est pas capturable (status=${paymentIntent.status})`;
      console.error(`[FINALIZE STRIPE] ${msg}`);
      throw new Error(msg);
    } else {
      console.log(`[FINALIZE STRIPE] PaymentIntent déjà succeeded`);
    }
  }

  if (isStripeInstallmentPayment(payment)) {
    await recordStripeInstallmentResult({
      payment,
      paymentIntentId,
      externalPaymentId: payment.externalPaymentId || paymentId,
      shouldHold: false,
    });
  } else {
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
  }

  const finalTransactionExternalRef = payment.externalPaymentId || paymentIntentId || paymentId;
  await upsertStripePaymentTransaction({
    paymentId,
    provider: 'STRIPE',
    method: payment.paymentMethod || 'CB',
    amount: payment.totalAmount,
    status: 'SUCCEEDED',
    externalRef: finalTransactionExternalRef,
    payerName,
    description: 'Paiement Stripe réussi',
    processedAt: new Date(),
    metadata: {
      source: 'stripe-finalize',
    },
  });

  // if (payment.family?.user && !payment.metadata?.enrollmentIds?.length) {
  //   await sendPaymentConfirmationEmail(payment.family.user, {
  //     id: payment.id,
  //     totalAmount: Number(payment.totalAmount),
  //     method: 'Carte bancaire Stripe',
  //   });
  // }

  return payment;
}

async function getStripePaymentIntentId(payment) {
  let paymentIntentId = payment.metadata?.paymentIntentId;

  if (!paymentIntentId && payment.metadata?.checkout?.raw) {
    const rawIntent = payment.metadata.checkout.raw.payment_intent;
    if (rawIntent) {
      paymentIntentId = typeof rawIntent === 'string' ? rawIntent : rawIntent.id || null;
      if (paymentIntentId) {
        console.log(`PaymentIntent trouvé dans metadata.checkout.raw pour ${payment.id}: ${paymentIntentId}`);
      }
    }
  }

  if (!paymentIntentId && payment.externalPaymentId) {
    try {
      const session = await getStripeCheckoutSession(payment.externalPaymentId);
      paymentIntentId = session.payment_intent || null;
      if (paymentIntentId && typeof paymentIntentId !== 'string') {
        paymentIntentId = paymentIntentId.id || null;
      }
    } catch (sessionError) {
      console.warn(`Session Stripe expirée ou introuvable pour ${payment.id}:`, sessionError?.message);
      // Fallback : chercher dans les transactions Stripe
      try {
        const existingTransaction = await prisma.paymentTransaction.findFirst({
          where: {
            paymentId: payment.id,
            provider: 'STRIPE',
            externalRef: { not: null },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existingTransaction?.externalRef?.startsWith('pi_')) {
          paymentIntentId = existingTransaction.externalRef;
          console.log(`PaymentIntent retrouvé dans les transactions: ${paymentIntentId}`);
        }
      } catch (txError) {
        console.warn(`Fallback transaction échoué: ${txError?.message}`);
      }
    }
  }

  return paymentIntentId;
}

async function cancelStripePayment(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment || !isStripeProvider(payment.provider)) {
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
  console.log(`[STRIPE CONFIRM] Retour Stripe reçu avec payment_id=${paymentId}`);
  let payment = null;
  if (paymentId) {
    payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      return res.send(formatPaymentReturnPage(
        'Erreur de validation Stripe',
        'Paiement introuvable. Veuillez vérifier depuis l’application.',
        paymentId,
        'Vous pouvez réessayer depuis l’application ou contacter le support.',
        `${frontendLoginUrl}?registration_message=${encodeURIComponent(REGISTRATION_PENDING_VALIDATION_MESSAGE)}`,
      ));
    }
    console.log(`[STRIPE CONFIRM] Paiement trouvé pour payment_id=${paymentId}, status=${payment.status}`);
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

    const eventType = event.type;
    if (eventType === 'checkout.session.completed' || eventType === 'checkout.session.async_payment_succeeded' || eventType === 'checkout.session.async_payment_failed') {
      const session = event.data.object;
      const paymentId = session.metadata?.payment_id;
      const paymentIntentId = session.payment_intent || null;
      console.log(`[STRIPE WEBHOOK] ${eventType} reçu: payment_id=${paymentId}, session_id=${session.id}, paymentIntentId=${paymentIntentId}`);

      if (paymentId) {
        const payment = await prisma.payment.findUnique({
          where: { id: paymentId },
          include: { family: { include: { user: true } }, paymentPlan: true },
        });

        if (payment) {
          const shouldHold = isStripeProvider(payment.provider) && await hasPendingEnrollmentsForPayment(payment);
          const payerName = getStripeSessionPayerName(session, payment.metadata?.payerName);

          await prisma.payment.update({
            where: { id: paymentId },
            data: {
              externalPaymentId: payment.externalPaymentId || session.id,
              metadata: {
                ...(payment.metadata || {}),
                paymentIntentId: paymentIntentId || payment.metadata?.paymentIntentId,
                payerName,
              },
            },
          });

          const isInstallment = isStripeInstallmentPayment(payment);
          const isSepa = payment.paymentMethod === 'SEPA';

          if (eventType === 'checkout.session.completed') {
            if (isSepa || shouldHold) {
              await upsertStripePaymentTransaction({
                paymentId,
                provider: 'STRIPE',
                method: payment.paymentMethod || 'CB',
                amount: payment.totalAmount,
                status: 'INITIATED',
                externalRef: paymentIntentId || session.id,
                payerName,
                description: isSepa
                  ? 'Prélèvement Stripe SEPA en attente de confirmation'
                  : 'Paiement Stripe en attente de validation de l’inscription',
                metadata: event,
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

              if (isInstallment) {
                await recordStripeInstallmentResult({
                  payment,
                  paymentIntentId,
                  externalPaymentId: session.id,
                  shouldHold: false,
                });
              } else {
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
              }

              await upsertStripePaymentTransaction({
                paymentId,
                provider: 'STRIPE',
                method: payment.paymentMethod || 'CB',
                amount: payment.totalAmount,
                status: 'SUCCEEDED',
                externalRef: paymentIntentId || session.id,
                payerName,
                description: 'Paiement Stripe réussi',
                processedAt: new Date(),
                metadata: event,
              });

              if (!payment.metadata?.enrollmentIds?.length && !isInstallment) {
                await sendPaymentConfirmationEmail(payment.family.user, {
                  id: payment.id,
                  totalAmount: Number(payment.totalAmount),
                  method: 'Carte bancaire Stripe',
                });
              }
            }
          } else if (eventType === 'checkout.session.async_payment_succeeded') {
            await finalizeStripePayment(paymentId);
          } else if (eventType === 'checkout.session.async_payment_failed') {
            await prisma.payment.update({
              where: { id: paymentId },
              data: { status: 'FAILED' },
            });

            await upsertStripePaymentTransaction({
              paymentId,
              provider: 'STRIPE',
              method: payment.paymentMethod || 'CB',
              amount: payment.totalAmount,
              status: 'FAILED',
              externalRef: paymentIntentId || session.id,
              payerName,
              description: 'Échec du prélèvement Stripe SEPA',
              metadata: event,
            });
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

    const enrolledCourses = await prisma.enrollment.findMany({
      where: {
        schoolYearId: payment.schoolYearId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        student: {
          familyId: payment.familyId,
        },
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

    const invoiceResult = await generateInvoicePDF(payment, familyWithChildren, enrolledCourses);
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

async function downloadSepaMandatePdf(req, res) {
  try {
    const { paymentId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { family: { include: { user: true } }, transactions: { orderBy: { createdAt: 'desc' } } },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Paiement introuvable' });
    }

    const isOwnPayment = payment.family?.userId === req.user.id;
    const userRole = req.user?.role;
    const isAdminOrTresorier = hasPermission(userRole, PERMISSIONS.PAYMENTS_MANAGE) || hasPermission(userRole, PERMISSIONS.FINANCE_VIEW);

    if (!isOwnPayment && !isAdminOrTresorier) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    if (payment.paymentMethod !== 'SEPA') {
      return res.status(400).json({ error: 'Ce paiement n\'est pas un paiement SEPA' });
    }

    const paymentIntentId = await getStripePaymentIntentId(payment);
    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Aucun PaymentIntent Stripe trouvé pour ce paiement' });
    }

    const paymentIntent = await getStripePaymentIntent(paymentIntentId);
    const chargeId = paymentIntent.charges?.data?.[0]?.id;
    if (!chargeId) {
      return res.status(400).json({ error: 'Aucune charge Stripe trouvée pour ce paiement SEPA' });
    }

    const mandateInfo = await getStripeSepaMandateDetailsByChargeId(chargeId);
    const mandate = mandateInfo.mandate;
    const sepaDetails = mandateInfo.charge.payment_method_details?.sepa_debit || {};

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="mandat-sepa-${paymentId.substring(0, 8)}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).text('Mandat SEPA', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`Référence paiement : ${paymentId}`);
    doc.text(`ID du mandat Stripe : ${mandate.id}`);
    doc.text(`Statut : ${mandate.status || '-'} `);
    doc.text(`Créé le : ${mandate.created ? new Date(mandate.created * 1000).toLocaleString('fr-FR') : '-'}`);
    doc.moveDown();

    doc.fontSize(14).text('Informations client', { underline: true });
    doc.fontSize(12);
    doc.text(`Nom de la famille : ${payment.family?.lastName || '-'} ${payment.family?.firstName || ''}`);
    doc.text(`Email : ${payment.family?.user?.email || payment.family?.email || '-'}`);
    doc.moveDown();

    doc.fontSize(14).text('Informations SEPA', { underline: true });
    doc.fontSize(12);
    doc.text(`Titulaire du compte : ${sepaDetails.name || '-'}`);
    doc.text(`IBAN masqué : ${sepaDetails.last4 ? `***${sepaDetails.last4}` : '-'}`);
    doc.text(`Banque : ${sepaDetails.bank_name || '-'}`);
    doc.text(`Référence du mandat SEPA : ${sepaDetails.mandate || mandate.id}`);
    doc.text(`Type de mandat : ${mandate.type || '-'}`);
    doc.moveDown();

    if (mandate.customer_acceptance) {
      doc.fontSize(14).text('Acceptation du mandat', { underline: true });
      doc.fontSize(12);
      doc.text(`Type : ${mandate.customer_acceptance.type || '-'}`);
      if (mandate.customer_acceptance.online) {
        doc.text(`Accepté le : ${mandate.customer_acceptance.online?.accepted_at ? new Date(mandate.customer_acceptance.online.accepted_at * 1000).toLocaleString('fr-FR') : '-'}`);
        doc.text(`Adresse IP : ${mandate.customer_acceptance.online?.ip_address || '-'}`);
        doc.text(`User Agent : ${mandate.customer_acceptance.online?.user_agent || '-'}`);
      }
      doc.moveDown();
    }

    doc.text('Ce document fournit les informations du mandat SEPA associé à ce paiement.', {
      align: 'left',
    });

    doc.end();
  } catch (error) {
    console.error('Erreur downloadSepaMandatePdf:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'Erreur serveur lors du téléchargement du mandat SEPA' });
    }
  }
}

async function updatePaymentDetails(req, res) {
  try {
    const { paymentId } = req.params;
    const updates = req.body || {};

    if (!paymentId) {
      return res.status(400).json({ error: 'Identifiant paiement manquant' });
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { family: true, paymentPlan: true },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Paiement non trouvé' });
    }

    const paymentMethod = payment.paymentMethod || 'CHEQUE';
    const isVirement = paymentMethod === 'VIREMENT';
    const isCheque = paymentMethod === 'CHEQUE';

    if (!isVirement && !isCheque) {
      return res.status(400).json({ error: 'La modification n\'est pas disponible pour ce type de paiement' });
    }

    const metadata = payment.metadata || {};
    const updateData = {};

    // Update number of installments
    if (updates.numberOfInstallments !== undefined) {
      const installments = Number(updates.numberOfInstallments);
      if (Number.isNaN(installments) || installments < 1 || installments > 12) {
        return res.status(400).json({ error: 'Le nombre d\'échéances doit être entre 1 et 12' });
      }
      updateData.numberOfInstallments = installments;
    }

    // Update first payment date
    if (updates.firstPaymentDate !== undefined && updates.firstPaymentDate) {
      const date = new Date(updates.firstPaymentDate);
      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({ error: 'Date première échéance invalide' });
      }
      metadata.firstPaymentDate = updates.firstPaymentDate;
    }

    // Update bank debit day (for VIREMENT and CHEQUE)
    if (updates.bankDebitDay !== undefined) {
      const day = Number(updates.bankDebitDay);
      if (![10, 20, 30].includes(day)) {
        return res.status(400).json({ error: 'Le jour de prélèvement doit être 10, 20 ou 30' });
      }
      metadata.bankDebitDay = day;
    }

    // Update IBAN (VIREMENT only)
    if (isVirement && updates.bankDebitIban !== undefined && updates.bankDebitIban) {
      const ibanNorm = String(updates.bankDebitIban).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (ibanNorm.length < 15) {
        return res.status(400).json({ error: 'L\'IBAN doit avoir au moins 15 caractères' });
      }
      metadata.bankDebitIban = ibanNorm;
    }

    // Update SWIFT (VIREMENT only)
    if (isVirement && updates.bankDebitSwift !== undefined && updates.bankDebitSwift) {
      const swiftNorm = String(updates.bankDebitSwift).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (swiftNorm.length < 8) {
        return res.status(400).json({ error: 'Le SWIFT/BIC doit avoir au moins 8 caractères' });
      }
      metadata.bankDebitSwift = swiftNorm;
    }

    // Merge metadata
    updateData.metadata = {
      ...(payment.metadata || {}),
      ...metadata,
    };

    // Update payment
    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: updateData,
      include: { family: true, paymentPlan: true },
    });

    // Also update payment plan if it exists
    if (payment.paymentPlan) {
      await prisma.paymentPlan.update({
        where: { id: payment.paymentPlan.id },
        data: {
          metadata: {
            ...(payment.paymentPlan.metadata || {}),
            ...metadata,
          },
        },
      });
    }

    return res.json({
      success: true,
      message: 'Paiement modifié avec succès',
      payment: updatedPayment,
    });
  } catch (error) {
    console.error('Erreur updatePaymentDetails:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur lors de la mise à jour du paiement' });
  }
}

module.exports = {
  createFamilyEnrollmentPayment,
  createPaymentIntent,
  recordOfflinePayment,
  markChequeInstallmentStatus,
  getChequePaymentPlans,
  getTransactions,
  updateTransactionStatus,
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
  cancelStripePayment,
  downloadSepaMandatePdf,
  updatePaymentDetails,
};
