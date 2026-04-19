const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient, Prisma } = require('@prisma/client');
const { sendVerificationEmail, sendEnrollmentConfirmationEmail } = require('../services/emailService');
const { resolvePricingConfig, calculateFamilyTotal, buildInstallmentSchedule } = require('../services/pricingService');
const { createOnlineCheckout } = require('../services/paymentProviders');

const prisma = new PrismaClient();

const ENGAGEMENT_TEXT_VERSION = 'engagement-v1-2026';
const SANITARY_TEXT_VERSION = 'fiche-sanitaire-v1-2026';

function toDecimal(value) {
  return new Prisma.Decimal(value || 0);
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.ip || null;
}

function ensureStrongPassword(password) {
  if (!password || password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères';
  if (!/[A-Z]/.test(password)) return 'Le mot de passe doit contenir une majuscule';
  if (!/[0-9]/.test(password)) return 'Le mot de passe doit contenir un chiffre';
  return null;
}

async function ensureCurrentSchoolYear() {
  const year = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });
  if (!year) throw new Error('Aucune année scolaire courante');
  return year;
}

async function saveDraft(req, res) {
  try {
    const { email, currentStep = 1, payload = {}, draftId = null } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email requis pour sauvegarder le brouillon' });
    }

    const existing = draftId
      ? await prisma.enrollmentDraft.findUnique({ where: { id: draftId } })
      : await prisma.enrollmentDraft.findFirst({ where: { email }, orderBy: { updatedAt: 'desc' } });

    const data = {
      email,
      profile: payload?.profile || existing?.profile || 'FAMILLE',
      currentStep,
      payload,
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    };

    const draft = existing
      ? await prisma.enrollmentDraft.update({ where: { id: existing.id }, data })
      : await prisma.enrollmentDraft.create({ data });

    return res.json({ draft });
  } catch (error) {
    console.error('Erreur saveDraft:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getDraft(req, res) {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email requis' });

    const draft = await prisma.enrollmentDraft.findFirst({
      where: {
        email,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { updatedAt: 'desc' },
    });

    return res.json({ draft });
  } catch (error) {
    console.error('Erreur getDraft:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
async function getPricingPreview(req, res) {
  try {
    const { courseSelections = [] } = req.body || {};
    const classIds = [...new Set(courseSelections.map((s) => s.classId).filter(Boolean))];

    const classes = await prisma.class.findMany({
      where: { id: { in: classIds } },
      include: { level: { include: { pole: true } } },
    });

    const classById = new Map(classes.map((c) => [c.id, c]));
    const enrollments = courseSelections
      .map((selection) => {
        const cls = classById.get(selection.classId);
        if (!cls) return null;
        return {
          poleName: cls.level.pole.name,
          levelCode: cls.level.code,
        };
      })
      .filter(Boolean);

    const pricingConfig = await resolvePricingConfig(prisma);
    const pricing = calculateFamilyTotal(enrollments, pricingConfig);

    return res.json({ pricing, classes });
  } catch (error) {
    console.error('Erreur getPricingPreview:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

function mapPaymentMethod(method) {
  if (method === 'STRIPE_CARD') return { provider: 'STRIPE', paymentMethod: 'CB' };
  if (method === 'GO_CARDLESS_SEPA') return { provider: 'GOCARDLESS', paymentMethod: 'SEPA' };
  return { provider: 'OFFLINE', paymentMethod: 'CHEQUE' };
}

function validateHealthForm(healthForm = {}) {
  const conditionalFields = [
    ['hasChronicDisease', 'chronicDiseaseDetails', 'Veuillez détailler les maladies chroniques'],
    ['hasMedicalTreatment', 'medicalTreatmentDetails', 'Veuillez détailler le traitement médical'],
    ['hasAllergy', 'allergyDetails', 'Veuillez détailler les allergies'],
    ['hasDisability', 'disabilityDetails', 'Veuillez détailler le handicap'],
  ];

  for (const [flag, details, message] of conditionalFields) {
    if (healthForm[flag] && !String(healthForm[details] || '').trim()) {
      return message;
    }
  }

  if (healthForm.canLeaveAloneAfterClass === undefined || healthForm.canLeaveAloneAfterClass === null) {
    return 'La décision de sortie (seul ou accompagné) est obligatoire';
  }

  if (healthForm.canLeaveAloneAfterClass === false && (!healthForm.pickupAuthorizedPersons || healthForm.pickupAuthorizedPersons.length === 0)) {
    return 'Au moins une personne autorisée à récupérer l’enfant est requise';
  }

  if (!healthForm.emergencyAuthorizationAccepted) {
    return 'L’autorisation d’intervention d’urgence est obligatoire';
  }

  return null;
}

async function completeFamilyRegistration(req, res) {
  try {
    const payload = req.body || {};
    const account = payload.account || {};
    const address = payload.address || {};
    const members = payload.members || [];
    const courseSelections = payload.courseSelections || [];
    const healthForms = payload.healthForms || {};
    const engagement = payload.engagement || {};
    const payment = payload.payment || {};

    if (!account.email || !account.password || !account.firstName || !account.lastName) {
      return res.status(400).json({ error: 'Informations du compte incomplètes' });
    }

    const passwordError = ensureStrongPassword(account.password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    if (!address.addressLine1 || !address.postalCode || !address.city || !address.country || !address.phonePrimary) {
      return res.status(400).json({ error: 'Adresse et téléphone principal sont obligatoires' });
    }

    if (members.length === 0) {
      return res.status(400).json({ error: 'Ajoutez au moins un membre de la famille' });
    }

    if (!engagement?.readAndApproved || !engagement?.legalMentionAccepted || !engagement?.signedByFullName || !engagement?.citySigned || !engagement?.signedAt) {
      return res.status(400).json({ error: 'Engagement incomplet: validation, lieu, date et signataire requis' });
    }

    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });

    const currentYear = await ensureCurrentSchoolYear();

    const selectedClassIds = [...new Set(courseSelections.map((c) => c.classId).filter(Boolean))];
    const classes = await prisma.class.findMany({
      where: { id: { in: selectedClassIds }, schoolYearId: currentYear.id },
      include: { level: { include: { pole: true } } },
    });
    const classById = new Map(classes.map((c) => [c.id, c]));

    const pricingConfig = await resolvePricingConfig(prisma);

    const enrollmentForPricing = courseSelections
      .map((selection) => {
        const cls = classById.get(selection.classId);
        if (!cls) return null;
        return {
          poleName: cls.level.pole.name,
          levelCode: cls.level.code,
        };
      })
      .filter(Boolean);

    const pricing = calculateFamilyTotal(enrollmentForPricing, pricingConfig);

    const installmentsCount = Number(payment.installmentsCount || 1);
    const scheduleDay = Number(payment.scheduleDay || 10);
    const selectedPaymentMethod = payment.method || 'CHEQUE';
    const { provider, paymentMethod } = mapPaymentMethod(selectedPaymentMethod);

    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;

    const passwordHash = await bcrypt.hash(account.password, 12);
    const emailVerifyToken = uuidv4();

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: account.email,
          passwordHash,
          provider: 'local',
          firstName: account.firstName,
          lastName: account.lastName,
          phone: account.phone || address.phonePrimary,
          role: 'FAMILLE',
          validationStatus: 'PENDING',
          emailVerifyToken,
        },
      });

      const family = await tx.family.create({
        data: {
          userId: user.id,
          familyName: address.familyName || account.lastName,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2 || null,
          postalCode: address.postalCode,
          city: address.city,
          country: address.country,
          phonePrimary: address.phonePrimary,
          phoneSecondary: address.phoneSecondary || null,
        },
      });

      const students = [];
      for (let i = 0; i < members.length; i += 1) {
        const m = members[i];
        const student = await tx.student.create({
          data: {
            familyId: family.id,
            firstName: m.firstName,
            lastName: m.lastName,
            dateOfBirth: new Date(m.dateOfBirth),
            gender: m.gender || 'GARCON',
            allergies: m.allergies || null,
            currentTreatments: m.currentTreatments || null,
            emergencyContactName: m.emergencyContactName || null,
            emergencyContactPhone: m.emergencyContactPhone || null,
          },
        });
        students.push(student);
      }

      const createdEnrollments = [];
      for (const selection of courseSelections) {
        const cls = classById.get(selection.classId);
        if (!cls) continue;

        const studentIndex = Number(selection.memberIndex);
        const student = students[studentIndex];
        if (!student) continue;

        if (cls.enrolledCount >= cls.capacity || cls.status === 'FULL') {
          throw new Error(`Le créneau ${cls.dayOfWeek} ${cls.startTime}-${cls.endTime} est complet`);
        }

        const enrollment = await tx.enrollment.create({
          data: {
            studentId: student.id,
            classId: cls.id,
            schoolYearId: currentYear.id,
            status: 'PENDING',
          },
        });

        await tx.class.update({
          where: { id: cls.id },
          data: {
            enrolledCount: { increment: 1 },
            status: cls.enrolledCount + 1 >= cls.capacity ? 'FULL' : 'OPEN',
          },
        });

        createdEnrollments.push(enrollment);
      }

      for (let i = 0; i < students.length; i += 1) {
        const student = students[i];
        const health = healthForms[i] || {};

        const error = validateHealthForm(health);
        if (error) {
          throw new Error(`Fiche sanitaire élève ${student.firstName} ${student.lastName}: ${error}`);
        }

        const form = await tx.studentHealthForm.create({
          data: {
            studentId: student.id,
            schoolYearId: currentYear.id,
            hasChronicDisease: Boolean(health.hasChronicDisease),
            chronicDiseaseDetails: health.chronicDiseaseDetails || null,
            hasMedicalTreatment: Boolean(health.hasMedicalTreatment),
            medicalTreatmentDetails: health.medicalTreatmentDetails || null,
            hasAllergy: Boolean(health.hasAllergy),
            allergyDetails: health.allergyDetails || null,
            hasDisability: Boolean(health.hasDisability),
            disabilityDetails: health.disabilityDetails || null,
            otherUsefulHealthInfo: health.otherUsefulHealthInfo || null,
            canLeaveAloneAfterClass: health.canLeaveAloneAfterClass,
            confidentialityAccepted: Boolean(health.confidentialityAccepted),
            noMedicationPolicyAccepted: Boolean(health.noMedicationPolicyAccepted),
          },
        });

        if (Array.isArray(health.emergencyContacts) && health.emergencyContacts.length > 0) {
          await tx.emergencyContact.createMany({
            data: health.emergencyContacts.map((c) => ({
              healthFormId: form.id,
              firstName: c.firstName,
              lastName: c.lastName,
              relationship: c.relationship || 'Proche',
              phone: c.phone,
            })),
          });
        }

        if (Array.isArray(health.pickupAuthorizedPersons) && health.pickupAuthorizedPersons.length > 0) {
          await tx.pickupAuthorization.createMany({
            data: health.pickupAuthorizedPersons.map((p) => ({
              healthFormId: form.id,
              fullName: p.fullName,
              relationship: p.relationship || 'Proche',
              phone: p.phone,
            })),
          });
        }

        await tx.enrollmentConsent.create({
          data: {
            familyId: family.id,
            studentId: student.id,
            schoolYearId: currentYear.id,
            consentType: 'SANITARY_FORM',
            textVersion: SANITARY_TEXT_VERSION,
            accepted: Boolean(health.emergencyAuthorizationAccepted),
            acceptedAt: health.emergencyAuthorizationAccepted ? new Date() : null,
            acceptedByFullName: health.legalRepresentativeFullName || engagement.signedByFullName,
            acceptedByRole: health.legalRepresentativeRole || 'parent',
            citySigned: health.citySigned || engagement.citySigned,
            signedAt: health.signedAt ? new Date(health.signedAt) : new Date(engagement.signedAt),
            signatureMode: 'TYPED',
            signatureData: health.legalRepresentativeSignature || health.legalRepresentativeFullName || null,
            legalMentionAccepted: Boolean(health.emergencyAuthorizationAccepted),
            legalMentionLabel: 'Lu et approuvé',
            ipAddress,
            userAgent,
            documentSnapshot: JSON.stringify({
              confidentialityNotice: true,
              noMedicationPolicy: true,
            }),
          },
        });
      }

      await tx.enrollmentConsent.create({
        data: {
          familyId: family.id,
          schoolYearId: currentYear.id,
          consentType: 'ENGAGEMENT',
          textVersion: ENGAGEMENT_TEXT_VERSION,
          accepted: true,
          acceptedAt: new Date(),
          acceptedByFullName: engagement.signedByFullName,
          acceptedByRole: engagement.signedByRole || 'responsable_legal',
          citySigned: engagement.citySigned,
          signedAt: new Date(engagement.signedAt),
          signatureMode: 'TYPED',
          signatureData: engagement.signedByFullName,
          legalMentionAccepted: Boolean(engagement.legalMentionAccepted),
          legalMentionLabel: 'Lu et approuvé',
          ipAddress,
          userAgent,
          documentSnapshot: JSON.stringify({
            text: engagement.textSnapshot || null,
            obligationsAccepted: true,
            parkingClauseAccepted: true,
          }),
          metadata: {
            childSafetyAgeRule: '11',
            readAndApproved: Boolean(engagement.readAndApproved),
          },
        },
      });

      const paymentRecord = await tx.payment.create({
        data: {
          familyId: family.id,
          schoolYearId: currentYear.id,
          totalAmount: toDecimal(pricing.total),
          registrationFee: toDecimal(pricing.registrationFee),
          arabicFee: toDecimal(pricing.arabicFee),
          coranScienceFee: toDecimal(pricing.coranScienceFee),
          paymentMethod,
          provider,
          numberOfInstallments: installmentsCount,
          status: 'PENDING',
          metadata: {
            enrollmentIds: createdEnrollments.map((e) => e.id),
            checkoutMethod: selectedPaymentMethod,
            ipAddress,
            draftId: payload.draftId || null,
          },
        },
      });

      const installments = buildInstallmentSchedule(pricing.total, installmentsCount, {
        dayOfMonth: scheduleDay,
        startDate: new Date(),
      });

      await tx.installment.createMany({
        data: installments.map((inst) => ({
          paymentId: paymentRecord.id,
          installmentNumber: inst.installmentNumber,
          amount: toDecimal(inst.amount),
          dueDate: inst.dueDate,
          status: 'UPCOMING',
        })),
      });

      const paymentPlan = await tx.paymentPlan.create({
        data: {
          familyId: family.id,
          schoolYearId: currentYear.id,
          paymentId: paymentRecord.id,
          type: selectedPaymentMethod,
          status: provider === 'OFFLINE' ? 'ACTIVE' : 'PENDING',
          installmentsCount,
          scheduleDay,
          totalAmount: toDecimal(pricing.total),
          metadata: {
            createdFrom: 'public_family_wizard',
          },
        },
      });

      let checkout = null;
      if (provider !== 'OFFLINE') {
        checkout = await createOnlineCheckout({
          provider,
          amount: pricing.total,
          paymentId: paymentRecord.id,
          returnUrl: `${req.protocol}://${req.get('host')}/api/payments/confirm`,
          cancelUrl: `${req.protocol}://${req.get('host')}/api/payments/cancel`,
          installments: installmentsCount,
          customer: {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
          },
          metadata: {
            source: 'family_wizard',
            plan_id: paymentPlan.id,
          },
        });

        await tx.payment.update({
          where: { id: paymentRecord.id },
          data: {
            externalPaymentId: checkout.externalPaymentId || null,
            metadata: {
              ...(paymentRecord.metadata || {}),
              checkout,
            },
          },
        });

        await tx.paymentPlan.update({
          where: { id: paymentPlan.id },
          data: {
            status: checkout.configured ? 'PENDING' : 'FAILED',
            providerRef: checkout.externalPaymentId || null,
            metadata: {
              ...(paymentPlan.metadata || {}),
              checkout,
            },
          },
        });

        await tx.paymentTransaction.create({
          data: {
            paymentId: paymentRecord.id,
            provider,
            method: paymentMethod,
            amount: toDecimal(pricing.total),
            status: checkout.configured ? 'INITIATED' : 'FAILED',
            externalRef: checkout.externalPaymentId || null,
            description: 'Paiement inscription initiale',
            metadata: checkout,
          },
        });
      }

      if (provider === 'OFFLINE') {
        await tx.paymentTransaction.create({
          data: {
            paymentId: paymentRecord.id,
            provider: 'OFFLINE',
            method: 'CHEQUE',
            amount: toDecimal(pricing.total),
            status: 'INITIATED',
            description: 'Paiement par chèque en attente',
            metadata: {
              instructions: 'Déposer les chèques selon l’échéancier communiqué par AMC.',
            },
          },
        });
      }

      if (payload.draftId) {
        await tx.enrollmentDraft.deleteMany({ where: { id: payload.draftId } });
      } else {
        await tx.enrollmentDraft.deleteMany({ where: { email: account.email } });
      }

      return {
        user,
        family,
        students,
        enrollments: createdEnrollments,
        payment: paymentRecord,
        paymentPlan,
        checkout,
        installments,
      };
    });

    await sendVerificationEmail(result.user, emailVerifyToken);
    await sendEnrollmentConfirmationEmail(
      result.user,
      `${result.enrollments.length} inscription(s) enregistrée(s) pour l'année ${currentYear.label}`,
    );

    return res.status(201).json({
      message: 'Inscription famille enregistrée. Vérifiez votre email pour activer votre compte.',
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        validationStatus: result.user.validationStatus,
      },
      summary: {
        familyId: result.family.id,
        students: result.students.length,
        enrollments: result.enrollments.length,
        pricing,
      },
      payment: {
        id: result.payment.id,
        planId: result.paymentPlan.id,
        installments: result.installments,
        checkout: result.checkout,
      },
    });
  } catch (error) {
    console.error('Erreur completeFamilyRegistration:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

module.exports = {
  saveDraft,
  getDraft,
  getPricingPreview,
  completeFamilyRegistration,
};