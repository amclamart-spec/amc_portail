const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient, Prisma } = require('@prisma/client');
const { sendVerificationEmail, sendEnrollmentConfirmationEmail, sendMail } = require('../services/emailService');
const { resolvePricingConfig, calculateFamilyTotal, buildInstallmentSchedule } = require('../services/pricingService');
const { createOnlineCheckout } = require('../services/paymentProviders');
const { getNextEnrollmentRegistrationCode } = require('../utils/enrollmentUtils');
const { getProvisionalClassFilter, PROVISIONAL_CLASS_NAME } = require('../utils/provisionalClassUtils');
const { savePhotoBase64 } = require('../utils/photoUtils');
const { isRegistrationBlocked } = require('../services/systemService');
const config = require('../config');

const prisma = new PrismaClient();

const ENGAGEMENT_TEXT_VERSION = 'engagement-v1-2026';
const SANITARY_TEXT_VERSION = 'fiche-sanitaire-v1-2026';
const REGISTRATION_PENDING_VALIDATION_MESSAGE = 'Votre inscription a bien été prise en compte, une validation par le service secrétériat interviendra sous peu.';

function toDecimal(value) {
  return new Prisma.Decimal(value || 0);
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
    const { email: rawEmail, currentStep = 1, payload = {}, draftId = null } = req.body;
    const email = String(rawEmail || '').trim().toLowerCase();

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
    const email = String(req.query.email || '').trim().toLowerCase();
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
    let skipRegistrationFee = false;
    let existingArabicCount = 0;

    if (req.user) {
      const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
      if (family) {
        const currentYear = await ensureCurrentSchoolYear();
        const existingCount = await prisma.enrollment.count({
          where: {
            student: { familyId: family.id },
            schoolYearId: currentYear.id,
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        });
        skipRegistrationFee = existingCount > 0;

        existingArabicCount = await prisma.enrollment.count({
          where: {
            student: { familyId: family.id },
            schoolYearId: currentYear.id,
            status: { in: ['PENDING', 'CONFIRMED'] },
            class: {
              level: {
                pole: {
                  name: { contains: 'arabe', mode: 'insensitive' },
                },
              },
            },
          },
        });
      }
    }

    const pricing = calculateFamilyTotal(enrollments, pricingConfig, {
      skipRegistrationFee,
      existingArabicCount,
    });

    return res.json({ pricing, classes });
  } catch (error) {
    console.error('Erreur getPricingPreview:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

function mapPaymentMethod(method) {
  if (method === 'STRIPE_CARD') return { provider: 'STRIPE', paymentMethod: 'CB' };
  if (method === 'GO_CARDLESS_SEPA') return { provider: 'GOCARDLESS', paymentMethod: 'SEPA' };
  if (method === 'ESPECES') return { provider: 'OFFLINE', paymentMethod: 'ESPECES' };
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

async function completeExistingFamilyRegistration(req, res) {
  try {
    const blocked = await isRegistrationBlocked();
    if (blocked) {
      return res.status(403).json({ error: 'Les inscriptions sont temporairement bloquées par le secrétariat' });
    }

    const payload = req.body || {};
    const address = payload.address || {};
    const members = payload.members || [];
    const courseSelections = payload.courseSelections || [];
    const healthForms = payload.healthForms || {};
    const engagement = payload.engagement || {};
    const payment = payload.payment || {};

    const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
    if (!family) {
      return res.status(400).json({ error: 'Complétez d’abord votre profil famille avant d’ajouter un membre' });
    }

    const currentYear = await ensureCurrentSchoolYear();

    const effectiveAddress = {
      familyName: address.familyName || family.familyName || `${req.user.lastName}`,
      addressLine1: address.addressLine1 || family.addressLine1,
      addressLine2: address.addressLine2 || family.addressLine2 || null,
      postalCode: address.postalCode || family.postalCode,
      city: address.city || family.city,
      country: address.country || family.country,
      phonePrimary: address.phonePrimary || family.phonePrimary,
      phoneSecondary: address.phoneSecondary || family.phoneSecondary || null,
    };

    if (!effectiveAddress.addressLine1 || !effectiveAddress.postalCode || !effectiveAddress.city || !effectiveAddress.country || !effectiveAddress.phonePrimary) {
      return res.status(400).json({ error: 'Adresse et téléphone principal sont obligatoires' });
    }

    if (members.length === 0) {
      return res.status(400).json({ error: 'Ajoutez au moins un membre de la famille' });
    }

    if (!engagement?.readAndApproved || !engagement?.legalMentionAccepted || !engagement?.signedByFullName || !engagement?.citySigned || !engagement?.signedAt) {
      return res.status(400).json({ error: 'Engagement incomplet: validation, lieu, date et signataire requis' });
    }

    const selectedClassIds = [...new Set(courseSelections.map((c) => c.classId).filter(Boolean))];
    const classes = await prisma.class.findMany({
      where: { id: { in: selectedClassIds }, schoolYearId: currentYear.id },
      include: { level: { include: { pole: true } } },
    });
    const classById = new Map(classes.map((c) => [c.id, c]));

    // ensure there is a fictive / provisional class for new students without class selection
    let fictiveClass = await prisma.class.findFirst({
      where: {
        schoolYearId: currentYear.id,
        ...getProvisionalClassFilter(),
      },
    });
    if (!fictiveClass) {
      const anyLevel = await prisma.level.findFirst();
      if (!anyLevel) throw new Error('Niveau introuvable pour créer la classe provisoire');
      fictiveClass = await prisma.class.create({
        data: {
          schoolYearId: currentYear.id,
          levelId: anyLevel.id,
          dayOfWeek: 'N/A',
          startTime: '00:00',
          endTime: '00:00',
          room: PROVISIONAL_CLASS_NAME,
          teacherName: PROVISIONAL_CLASS_NAME,
          capacity: 1000,
          enrolledCount: 0,
          status: 'OPEN',
        },
      });
    }

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

    const existingEnrollmentsCount = await prisma.enrollment.count({
      where: {
        student: { familyId: family.id },
        schoolYearId: currentYear.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });

    const existingArabicCount = await prisma.enrollment.count({
      where: {
        student: { familyId: family.id },
        schoolYearId: currentYear.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
        class: {
          level: {
            pole: {
              name: { contains: 'arabe', mode: 'insensitive' },
            },
          },
        },
      },
    });

    const pricing = calculateFamilyTotal(enrollmentForPricing, pricingConfig, {
      skipRegistrationFee: existingEnrollmentsCount > 0,
      existingArabicCount,
    });

    const installmentsCount = Number(payment.installmentsCount || 1);
    const scheduleDay = Number(payment.scheduleDay || 10);
    const selectedPaymentMethod = payment.method || 'CHEQUE';
    const { provider, paymentMethod } = mapPaymentMethod(selectedPaymentMethod);
    const paymentTotal = pricing.total + (selectedPaymentMethod === 'GO_CARDLESS_SEPA' ? pricing.fraisPrelevement : 0);

    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;

    const result = await prisma.$transaction(async (tx) => {
      await tx.family.update({
        where: { id: family.id },
        data: {
          familyName: effectiveAddress.familyName,
          addressLine1: effectiveAddress.addressLine1,
          addressLine2: effectiveAddress.addressLine2,
          postalCode: effectiveAddress.postalCode,
          city: effectiveAddress.city,
          country: effectiveAddress.country,
          phonePrimary: effectiveAddress.phonePrimary,
          phoneSecondary: effectiveAddress.phoneSecondary,
        },
      });

      const students = [];
      for (let i = 0; i < members.length; i += 1) {
        const m = members[i];
        const photoUrl = m.photoBase64 ? savePhotoBase64(m.photoBase64) : null;
        const student = await tx.student.create({
          data: {
            familyId: family.id,
            firstName: m.firstName,
            lastName: m.lastName,
            dateOfBirth: new Date(m.dateOfBirth),
            gender: m.gender || 'GARCON',
            photoUrl,
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

        const isFull = cls.enrolledCount >= cls.capacity || cls.status === 'FULL';
        const registrationCode = await getNextEnrollmentRegistrationCode(tx, currentYear.id);
        const enrollmentData = {
          registrationCode,
          studentId: student.id,
          classId: cls.id,
          schoolYearId: currentYear.id,
          status: 'PENDING',
        };

        if (isFull) {
          // Put on waitlist (do not increment enrolledCount)
          enrollmentData.comment = 'Liste d\'attente';
        }

        const enrollment = await tx.enrollment.create({ data: enrollmentData });

        if (!isFull) {
          await tx.class.update({
            where: { id: cls.id },
            data: {
              enrolledCount: { increment: 1 },
              status: cls.enrolledCount + 1 >= cls.capacity ? 'FULL' : 'OPEN',
            },
          });
        }

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

      // Create enrollments for students that do not have one (assigned to fictive class)
      for (let i = 0; i < students.length; i += 1) {
        const student = students[i];
        const already = createdEnrollments.find((e) => e.studentId === student.id);
        if (!already) {
          const registrationCode = await getNextEnrollmentRegistrationCode(tx, currentYear.id);
          const enrollment = await tx.enrollment.create({
            data: {
              registrationCode,
              studentId: student.id,
              classId: fictiveClass.id,
              schoolYearId: currentYear.id,
              status: 'PENDING',
              comment: 'Affectation provisoire — à confirmer par l’administration',
            },
          });

          await tx.class.update({ where: { id: fictiveClass.id }, data: { enrolledCount: { increment: 1 } } });
          createdEnrollments.push(enrollment);
        }
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
          totalAmount: toDecimal(paymentTotal),
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
            sepaFee: pricing.fraisPrelevement,
            ipAddress,
            draftId: payload.draftId || null,
          },
        },
      });

      const installments = buildInstallmentSchedule(paymentTotal, installmentsCount, {
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
          totalAmount: toDecimal(paymentTotal),
          metadata: {
            createdFrom: 'existing_family_wizard',
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
          paymentId: paymentRecord.id,
          returnUrl: urls.returnUrl,
          cancelUrl: urls.cancelUrl,
          installments: installmentsCount,
          customer: {
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            email: req.user.email,
          },
          metadata: {
            source: 'family_wizard_existing',
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
            amount: toDecimal(paymentTotal),
            status: checkout.configured ? 'INITIATED' : 'FAILED',
            externalRef: checkout.externalPaymentId || null,
            description: 'Paiement inscription membre existant',
            metadata: checkout,
          },
        });
      }

      if (provider === 'OFFLINE') {
        const isCheque = paymentMethod === 'CHEQUE';
        await tx.paymentTransaction.create({
          data: {
            paymentId: paymentRecord.id,
            provider: 'OFFLINE',
            method: paymentMethod,
            amount: toDecimal(paymentTotal),
            status: 'INITIATED',
            payerName: `${family.user.firstName} ${family.user.lastName}`,
            description: isCheque ? 'Paiement par chèque en attente' : 'Paiement en espèces en attente',
            metadata: {
              instructions: isCheque ? 'Déposer les chèques selon l’échéancier communiqué par association PARTAGE.' : 'Veuillez déposer le montant en espèces selon l’échéancier fourni.',
            },
          },
        });
      }

      if (payload.draftId) {
        await tx.enrollmentDraft.deleteMany({ where: { id: payload.draftId } });
      }

      return {
        family,
        students,
        enrollments: createdEnrollments,
        payment: paymentRecord,
        paymentPlan,
        checkout,
        installments,
      };
    });

    // Envoi du mail d'inscription enregistrée
    const studentById = new Map(result.students.map((s) => [s.id, s]));
    const enrollmentDetailsHtml = result.enrollments.map((en) => {
      const student = studentById.get(en.studentId) || { firstName: 'Élève', lastName: '' };
      const cls = classById.get(en.classId);
      const waitlistNote = en.comment === 'Liste d\'attente' ? ' • Liste d\'attente' : '';
      return `• ${student.firstName} ${student.lastName} — ${cls?.level?.pole?.name || 'Pôle'} / ${cls?.level?.name || 'Niveau'} ${cls?.dayOfWeek || ''} ${cls?.startTime || ''}-${cls?.endTime || ''}${waitlistNote}`;
    }).join('<br/>');
    const paymentDetailsHtml = `<div style="margin:18px 0;padding:18px;background:#f8fafc;border-radius:12px;">
      <strong>Montant total :</strong> ${Number(result.payment.totalAmount || 0).toFixed(2)} €<br/>
      <strong>Mode :</strong> ${payment.method || 'CHEQUE'}<br/>
      <strong>Échéances :</strong> ${result.installments.length}
    </div>`;

    await sendEnrollmentConfirmationEmail(req.user, `${enrollmentDetailsHtml}${paymentDetailsHtml}`);

    // Notify admins about provisional enrollments (if any were created)
    try {
      const adminUsers = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { email: true, firstName: true } });
      const adminEmails = adminUsers.map((u) => u.email).filter(Boolean);
      if (adminEmails.length > 0 && result.enrollments && result.enrollments.length > 0) {
        const provisionalListHtml = result.enrollments.map((en) => `• ${en.registrationCode || en.id} — ${result.students.find((s) => s.id === en.studentId)?.firstName || 'Élève'}`).join('<br/>');
        const contentHtml = `
          <p>Bonjour,</p>
          <p>De nouvelles inscriptions avec <strong>affectation provisoire</strong> ont été créées via l’assistant famille :</p>
          <div style="margin:12px 0;padding:12px;background:#FEF3C7;border-radius:8px;">${provisionalListHtml}</div>
          <p>Consultez la liste des inscriptions administrateur pour traiter et affecter ces élèves :</p>
          <p style="text-align:center;"><a href="${config.frontendUrl}/admin/enrollments" style="display:inline-block;padding:10px 16px;background:#213B88;color:#fff;border-radius:8px;text-decoration:none;">Accéder aux inscriptions</a></p>
        `;
        await sendMail({ to: adminEmails.join(','), subject: 'AMC — Nouvelles inscriptions (affectation provisoire)', html: contentHtml });
      }
    } catch (err) {
      console.error('Erreur notification admins pour inscriptions provisoires:', err?.message || err);
    }

    return res.status(201).json({
      message: 'Inscription du nouveau membre enregistrée. Les inscriptions seront confirmées après paiement réussi.',
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
    console.error('Erreur completeExistingFamilyRegistration:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function checkEmailAvailability(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Email requis' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }

    return res.json({ available: true });
  } catch (error) {
    console.error('Erreur checkEmailAvailability:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createFamilyPortalAccount(req, res) {
  try {
    const payload = req.body || {};
    const account = payload.account || {};
    account.email = String(account.email || '').trim().toLowerCase();

    if (!account.email || !account.password || !account.firstName || !account.lastName || !account.phone) {
      return res.status(400).json({ error: 'Nom, email, téléphone et mot de passe sont obligatoires' });
    }

    const passwordError = ensureStrongPassword(account.password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });

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
          phone: account.phone,
          role: 'FAMILLE',
          validationStatus: 'APPROVED',
          emailVerifyToken,
        },
      });

      const family = await tx.family.create({
        data: {
          userId: user.id,
          familyName: account.lastName,
          addressLine1: '',
          addressLine2: null,
          postalCode: '',
          city: '',
          country: 'France',
          phonePrimary: account.phone,
          phoneSecondary: null,
        },
      });

      return { user, family };
    });

    await sendVerificationEmail(result.user, emailVerifyToken);

    return res.status(201).json({
      message: 'Compte créé. Vérifiez votre email pour activer l’accès.',
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        validationStatus: result.user.validationStatus,
      },
    });
  } catch (error) {
    console.error('Erreur createFamilyPortalAccount:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function completeFamilyRegistration(req, res) {
  try {
    const blocked = await isRegistrationBlocked();
    if (blocked) {
      return res.status(403).json({ error: 'Les inscriptions sont temporairement bloquées par le secrétariat' });
    }

    const payload = req.body || {};
    const account = payload.account || {};
    const address = payload.address || {};
    const members = payload.members || [];
    const courseSelections = payload.courseSelections || [];
    const healthForms = payload.healthForms || {};
    const engagement = payload.engagement || {};
    const payment = payload.payment || {};

    account.email = String(account.email || '').trim().toLowerCase();

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

    let fictiveClass = await prisma.class.findFirst({
      where: {
        schoolYearId: currentYear.id,
        ...getProvisionalClassFilter(),
      },
    });
    if (!fictiveClass) {
      const anyLevel = await prisma.level.findFirst();
      if (!anyLevel) throw new Error('Niveau introuvable pour créer la classe provisoire');
      fictiveClass = await prisma.class.create({
        data: {
          schoolYearId: currentYear.id,
          levelId: anyLevel.id,
          dayOfWeek: 'N/A',
          startTime: '00:00',
          endTime: '00:00',
          room: PROVISIONAL_CLASS_NAME,
          teacherName: PROVISIONAL_CLASS_NAME,
          capacity: 1000,
          enrolledCount: 0,
          status: 'OPEN',
        },
      });
    }

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
    const paymentTotal = pricing.total + (selectedPaymentMethod === 'GO_CARDLESS_SEPA' ? pricing.fraisPrelevement : 0);

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
          validationStatus: 'APPROVED',
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
        const photoUrl = m.photoBase64 ? savePhotoBase64(m.photoBase64) : null;
        const student = await tx.student.create({
          data: {
            familyId: family.id,
            firstName: m.firstName,
            lastName: m.lastName,
            dateOfBirth: new Date(m.dateOfBirth),
            gender: m.gender || 'GARCON',
            photoUrl,
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

        const isFull = cls.enrolledCount >= cls.capacity || cls.status === 'FULL';
        const registrationCode = await getNextEnrollmentRegistrationCode(tx, currentYear.id);
        const enrollmentData = {
          registrationCode,
          studentId: student.id,
          classId: cls.id,
          schoolYearId: currentYear.id,
          status: 'PENDING',
        };

        if (isFull) {
          // Put on waitlist (do not increment enrolledCount)
          enrollmentData.comment = 'Liste d\'attente';
        }

        const enrollment = await tx.enrollment.create({ data: enrollmentData });

        if (!isFull) {
          await tx.class.update({
            where: { id: cls.id },
            data: {
              enrolledCount: { increment: 1 },
              status: cls.enrolledCount + 1 >= cls.capacity ? 'FULL' : 'OPEN',
            },
          });
        }

        createdEnrollments.push(enrollment);
      }

      for (let i = 0; i < students.length; i += 1) {
        const student = students[i];
        const already = createdEnrollments.find((e) => e.studentId === student.id);
        if (!already) {
          const registrationCode = await getNextEnrollmentRegistrationCode(tx, currentYear.id);
          const enrollment = await tx.enrollment.create({
            data: {
              registrationCode,
              studentId: student.id,
              classId: fictiveClass.id,
              schoolYearId: currentYear.id,
              status: 'PENDING',
              comment: 'Affectation provisoire — à confirmer par l’administration',
            },
          });
          await tx.class.update({ where: { id: fictiveClass.id }, data: { enrolledCount: { increment: 1 } } });
          createdEnrollments.push(enrollment);
        }
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
          totalAmount: toDecimal(paymentTotal),
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
            sepaFee: pricing.fraisPrelevement,
            ipAddress,
            draftId: payload.draftId || null,
          },
        },
      });

      const installments = buildInstallmentSchedule(paymentTotal, installmentsCount, {
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
          totalAmount: toDecimal(paymentTotal),
          metadata: {
            createdFrom: 'public_family_wizard',
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
          paymentId: paymentRecord.id,
          returnUrl: urls.returnUrl,
          cancelUrl: urls.cancelUrl,
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
            amount: toDecimal(paymentTotal),
            status: checkout.configured ? 'INITIATED' : 'FAILED',
            externalRef: checkout.externalPaymentId || null,
            description: 'Paiement inscription initiale',
            metadata: checkout,
          },
        });
      }

      if (provider === 'OFFLINE') {
        const isCheque = paymentMethod === 'CHEQUE';
        await tx.paymentTransaction.create({
          data: {
            paymentId: paymentRecord.id,
            provider: 'OFFLINE',
            method: paymentMethod,
            amount: toDecimal(paymentTotal),
            status: 'INITIATED',
            payerName: `${family.user.firstName} ${family.user.lastName}`,
            description: isCheque ? 'Paiement par chèque en attente' : 'Paiement en espèces en attente',
            metadata: {
              instructions: isCheque ? 'Déposer les chèques selon l’échéancier communiqué par association PARTAGE.' : 'Veuillez déposer le montant en espèces selon l’échéancier fourni.',
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

    // Envoi du mail d'inscription enregistrée (avec activation si nécessaire)
    const studentById = new Map(result.students.map((s) => [s.id, s]));
    const enrollmentDetailsHtml = result.enrollments.map((en) => {
      const student = studentById.get(en.studentId) || { firstName: 'Élève', lastName: '' };
      const cls = classById.get(en.classId);
      const waitlistNote = en.comment === 'Liste d\'attente' ? ' • Liste d\'attente' : '';
      return `• ${student.firstName} ${student.lastName} — ${cls?.level?.pole?.name || 'Pôle'} / ${cls?.level?.name || 'Niveau'} ${cls?.dayOfWeek || ''} ${cls?.startTime || ''}-${cls?.endTime || ''}${waitlistNote}`;
    }).join('<br/>');
    const verifyUrl = `${config.frontendUrl}/verify-email?token=${emailVerifyToken}`;
    const activationHtml = `<p>Pour activer votre compte famille, cliquez sur le bouton ci-dessous :</p>
      <p style="text-align:center;">
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;background:#213B88;border-radius:8px;text-decoration:none;">Activer mon compte</a>
      </p>`;
    const paymentDetailsHtml = `<div style="margin:18px 0;padding:18px;background:#f8fafc;border-radius:12px;">
      <strong>Montant total :</strong> ${Number(result.payment.totalAmount || 0).toFixed(2)} €<br/>
      <strong>Mode :</strong> ${paymentMethod}<br/>
      <strong>Échéances :</strong> ${result.installments.length}
    </div>`;

    await sendEnrollmentConfirmationEmail(result.user, `${enrollmentDetailsHtml}${paymentDetailsHtml}${activationHtml}`);

    // Notify admins about provisional enrollments (if any were created)
    try {
      const adminUsers = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { email: true, firstName: true } });
      const adminEmails = adminUsers.map((u) => u.email).filter(Boolean);
      if (adminEmails.length > 0 && result.enrollments && result.enrollments.length > 0) {
        const provisionalListHtml = result.enrollments.map((en) => `• ${en.registrationCode || en.id} — ${result.students.find((s) => s.id === en.studentId)?.firstName || 'Élève'}`).join('<br/>');
        const contentHtml = `
          <p>Bonjour,</p>
          <p>De nouvelles inscriptions avec <strong>affectation provisoire</strong> ont été créées via l’assistant famille :</p>
          <div style="margin:12px 0;padding:12px;background:#FEF3C7;border-radius:8px;">${provisionalListHtml}</div>
          <p>Consultez la liste des inscriptions administrateur pour traiter et affecter ces élèves :</p>
          <p style="text-align:center;"><a href="${config.frontendUrl}/admin/enrollments" style="display:inline-block;padding:10px 16px;background:#213B88;color:#fff;border-radius:8px;text-decoration:none;">Accéder aux inscriptions</a></p>
        `;
        await sendMail({ to: adminEmails.join(','), subject: 'AMC — Nouvelles inscriptions (affectation provisoire)', html: contentHtml });
      }
    } catch (err) {
      console.error('Erreur notification admins pour inscriptions provisoires:', err?.message || err);
    }

    return res.status(201).json({
      message: REGISTRATION_PENDING_VALIDATION_MESSAGE,
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
  createFamilyPortalAccount,
  checkEmailAvailability,
  completeFamilyRegistration,
  completeExistingFamilyRegistration,
};