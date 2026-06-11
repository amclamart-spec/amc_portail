const bcrypt = require('bcryptjs');

const { v4: uuidv4 } = require('uuid');

const { PrismaClient, Prisma } = require('@prisma/client');

const {

  sendVerificationEmail,

  sendEnrollmentConfirmationEmail,

  sendEnrollmentRequestRegisteredEmail,

  sendStripePaymentPendingEmail,

  sendMail,

} = require('../services/emailService');

const { resolvePricingConfig, calculateFamilyTotal, buildInstallmentSchedule } = require('../services/pricingService');

const { createOnlineCheckout, createStripeCustomer, createStripeSepaSetupIntent } = require('../services/paymentProviders');

const { getNextEnrollmentRegistrationCode, extractSchoolYearCode } = require('../utils/enrollmentUtils');

const { getProvisionalClassFilter, PROVISIONAL_CLASS_NAME } = require('../utils/provisionalClassUtils');

const { savePhotoBase64 } = require('../utils/photoUtils');
const { saveBase64File } = require('../utils/fileUtils');

const { isRegistrationBlocked } = require('../services/systemService');

const config = require('../config');



const prisma = new PrismaClient();



const ENGAGEMENT_TEXT_VERSION = 'engagement-v1-2026';

const SANITARY_TEXT_VERSION = 'fiche-sanitaire-v1-2026';

const REGISTRATION_PENDING_VALIDATION_MESSAGE = 'Votre inscription a bien Ã©tÃ© prise en compte, une validation par le service secrÃ©tÃ©riat interviendra sous peu.';



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

  if (!password || password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractÃ¨res';

  if (!/[A-Z]/.test(password)) return 'Le mot de passe doit contenir une majuscule';

  if (!/[0-9]/.test(password)) return 'Le mot de passe doit contenir un chiffre';

  return null;

}



async function ensureCurrentSchoolYear() {

  const year = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });

  if (!year) throw new Error('Aucune annÃ©e scolaire courante');

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

    

    // Handle both classId (old students) and poleId (new students)

    const classIds = [...new Set(courseSelections.map((s) => s.classId).filter(Boolean))];

    const poleIds = [...new Set(courseSelections.map((s) => s.poleId).filter(Boolean))];

    const levelIds = [...new Set(courseSelections.map((s) => s.levelId).filter(Boolean))];



    const classes = await prisma.class.findMany({

      where: { id: { in: classIds } },

      include: { level: { include: { pole: true } }, pole: true },

    });



    const poles = await prisma.pole.findMany({

      where: { id: { in: poleIds } },

      include: { levels: true },

    });



    const levels = await prisma.level.findMany({

      where: { id: { in: levelIds } },

      include: { pole: true },

    });



    const classById = new Map(classes.map((c) => [c.id, c]));

    const poleById = new Map(poles.map((p) => [p.id, p]));

    const levelById = new Map(levels.map((l) => [l.id, l]));



    const enrollments = courseSelections

      .map((selection) => {

        if (selection.classId) {

          // Old student: has selected a specific class

          const cls = classById.get(selection.classId);

          if (!cls) return null;

          return {

            poleId: cls.level?.pole?.id || cls.pole?.id || '',

            poleName: cls.level?.pole?.name || cls.pole?.name || '',

            levelId: cls.level?.id || '',

            levelCode: cls.level?.code || '',

          };

        } else if (selection.levelId) {

          const level = levelById.get(selection.levelId);

          if (!level) return null;

          return {

            poleId: level.pole?.id || '',

            poleName: level.pole?.name || '',

            levelId: level.id,

            levelCode: level.code || '',

          };

        } else if (selection.poleId) {

          // New student: has only selected a pole, estimate based on pole

          const pole = poleById.get(selection.poleId);

          if (!pole) return null;

          

          const firstLevel = pole.levels && pole.levels[0];

          return {

            poleId: pole.id,

            poleName: pole.name || '',

            levelId: firstLevel?.id || '',

            levelCode: firstLevel?.code || '',

          };

        }

        return null;

      })

      .filter(Boolean);



    const pricingConfig = await resolvePricingConfig(prisma);

    let skipRegistrationFee = false;

    let existingArabicCount = 0;

    let totalFamilyEnrollmentsByPole = {};



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



        // Fetch existing enrollments with pole info for totalFamilyEnrollmentsByPole
        const existingEnrollments = await prisma.enrollment.findMany({

          where: {

            student: { familyId: family.id },

            schoolYearId: currentYear.id,

            status: { in: ['PENDING', 'CONFIRMED'] },

          },

          include: {

            class: {

              include: {

                level: { include: { pole: true } },

              },

            },

          },

        });



        for (const enrollment of existingEnrollments) {

          const poleName = String(enrollment.class?.level?.pole?.name || '').toLowerCase();

          const poleId = enrollment.class?.level?.pole?.id || '';

          const poleKey = poleId || poleName;

          if (poleKey) {

            totalFamilyEnrollmentsByPole[poleKey] = (totalFamilyEnrollmentsByPole[poleKey] || 0) + 1;

          }

        }

      }

    }



    const pricing = calculateFamilyTotal(enrollments, pricingConfig, {

      skipRegistrationFee,

      existingArabicCount,

      totalFamilyEnrollmentsByPole: totalFamilyEnrollmentsByPole || {},

    });



    return res.json({ pricing, classes });

  } catch (error) {

    console.error('Erreur getPricingPreview:', error);

    return res.status(500).json({ error: 'Erreur serveur' });

  }

}



function mapPaymentMethod(method) {

  if (method === 'STRIPE_CARD') return { provider: 'STRIPE', paymentMethod: 'CB' };

  if (method === 'STRIPE_SEPA') return { provider: 'STRIPE', paymentMethod: 'SEPA' };

  if (method === 'GO_CARDLESS_SEPA') return { provider: 'GOCARDLESS', paymentMethod: 'SEPA' };

  if (method === 'PRELEVEMENT_BANCAIRE') return { provider: 'OFFLINE', paymentMethod: 'VIREMENT' };

  if (method === 'ESPECES') return { provider: 'OFFLINE', paymentMethod: 'ESPECES' };

  if (method === 'CHEQUE') return { provider: 'OFFLINE', paymentMethod: 'CHEQUE' };

  return { provider: 'OFFLINE', paymentMethod: 'CHEQUE' };

}



function buildBankDebitMetadata(payment) {
  const metadata = {};

  // Handle PRELEVEMENT_BANCAIRE
  if (payment.method === 'PRELEVEMENT_BANCAIRE') {
    if (payment.bankDebitIban) metadata.bankDebitIban = String(payment.bankDebitIban).trim();
    if (payment.bankDebitSwift) metadata.bankDebitSwift = String(payment.bankDebitSwift).trim();

    if (payment.scheduleDay !== undefined && payment.scheduleDay !== null) {
      metadata.bankDebitDay = Number(payment.scheduleDay);
    } else if (payment.bankDebitDay !== undefined && payment.bankDebitDay !== null) {
      metadata.bankDebitDay = Number(payment.bankDebitDay);
    }

    if (payment.installmentsCount !== undefined && payment.installmentsCount !== null) {
      metadata.bankDebitInstallmentsCount = Number(payment.installmentsCount);
    } else if (payment.numberOfInstallments !== undefined && payment.numberOfInstallments !== null) {
      metadata.bankDebitInstallmentsCount = Number(payment.numberOfInstallments);
    }

    if (payment.firstPaymentDate) {
      metadata.firstPaymentDate = String(payment.firstPaymentDate).trim();
    }

    if (payment.ribDocument?.base64) {
      metadata.bankDebitRibUrl = saveBase64File(payment.ribDocument.base64, 'ribs', payment.ribDocument.name || 'rib.pdf');
      metadata.bankDebitRibFilename = String(payment.ribDocument.name || 'RIB');
    }
  }

  // Handle CHEQUE
  if (payment.method === 'CHEQUE') {
    if (payment.scheduleDay !== undefined && payment.scheduleDay !== null) {
      metadata.chequeDepositDay = Number(payment.scheduleDay);
    }
    if (payment.firstPaymentDate) {
      metadata.chequeFirstPaymentDate = String(payment.firstPaymentDate).trim();
    }
    if (payment.installmentsCount !== undefined && payment.installmentsCount !== null) {
      metadata.chequeInstallmentsCount = Number(payment.installmentsCount);
    } else if (payment.numberOfInstallments !== undefined && payment.numberOfInstallments !== null) {
      metadata.chequeInstallmentsCount = Number(payment.numberOfInstallments);
    }
  }

  return metadata;
}

async function createEnrollmentWithUniqueRegistrationCode(tx, enrollmentData, schoolYearId, registrationYearCode, usedRegistrationCodes) {

  const prefix = `FAM-${registrationYearCode}-`;



  while (true) {

    const [latestEnrollment] = await tx.enrollment.findMany({

      where: { schoolYearId, registrationCode: { startsWith: prefix } },

      orderBy: { registrationCode: 'desc' },

      take: 1,

      select: { registrationCode: true },

    });



    const baseSequence = latestEnrollment

      ? Number(latestEnrollment.registrationCode.slice(prefix.length))

      : 0;



    let nextSequence = baseSequence + 1;

    let registrationCode = `${prefix}${String(nextSequence).padStart(3, '0')}`;



    while (usedRegistrationCodes.has(registrationCode)) {

      nextSequence += 1;

      registrationCode = `${prefix}${String(nextSequence).padStart(3, '0')}`;

    }



    usedRegistrationCodes.add(registrationCode);



    try {

      return await tx.enrollment.create({

        data: {

          ...enrollmentData,

          registrationCode,

        },

      });

    } catch (error) {

      if (error?.code === 'P2002' && Array.isArray(error?.meta?.target) && error.meta.target.includes('registration_code')) {

        usedRegistrationCodes.delete(registrationCode);

        continue;

      }

      throw error;

    }

  }

}



function validateHealthForm(healthForm = {}) {

  const conditionalFields = [

    ['hasChronicDisease', 'chronicDiseaseDetails', 'Veuillez dÃ©tailler les maladies chroniques'],

    ['hasMedicalTreatment', 'medicalTreatmentDetails', 'Veuillez dÃ©tailler le traitement mÃ©dical'],

    ['hasAllergy', 'allergyDetails', 'Veuillez dÃ©tailler les allergies'],

    ['hasDisability', 'disabilityDetails', 'Veuillez dÃ©tailler le handicap'],

  ];



  for (const [flag, details, message] of conditionalFields) {

    if (healthForm[flag] && !String(healthForm[details] || '').trim()) {

      return message;

    }

  }



  if (healthForm.canLeaveAloneAfterClass === undefined || healthForm.canLeaveAloneAfterClass === null) {

    return 'La dÃ©cision de sortie (seul ou accompagnÃ©) est obligatoire';

  }



  if (healthForm.canLeaveAloneAfterClass === false && (!healthForm.pickupAuthorizedPersons || healthForm.pickupAuthorizedPersons.length === 0)) {

    return 'Au moins une personne autorisÃ©e Ã  rÃ©cupÃ©rer lâ€™enfant est requise';

  }



  if (!healthForm.emergencyAuthorizationAccepted) {

    return 'Lâ€™autorisation dâ€™intervention dâ€™urgence est obligatoire';

  }



  return null;

}



async function completeExistingFamilyRegistration(req, res) {

  try {

    const blocked = await isRegistrationBlocked();

    if (blocked) {

      return res.status(403).json({ error: 'Les inscriptions sont temporairement bloquÃ©es par le secrÃ©tariat' });

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

      return res.status(400).json({ error: 'ComplÃ©tez dâ€™abord votre profil famille avant dâ€™ajouter un membre' });

    }



    const currentYear = await ensureCurrentSchoolYear();

    const registrationYearCode = extractSchoolYearCode(currentYear.label, currentYear.startDate);



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

      return res.status(400).json({ error: 'Adresse et tÃ©lÃ©phone principal sont obligatoires' });

    }



    if (members.length === 0) {

      return res.status(400).json({ error: 'Ajoutez au moins un membre de la famille' });

    }



    if (!engagement?.readAndApproved || !engagement?.legalMentionAccepted || !engagement?.signedByFullName || !engagement?.citySigned || !engagement?.signedAt) {

      return res.status(400).json({ error: 'Engagement incomplet: validation, lieu, date et signataire requis' });

    }



    const selectedClassIds = [...new Set(courseSelections.map((c) => c.classId).filter(Boolean))];

    const selectedPoleIds = [...new Set(courseSelections.map((c) => c.poleId).filter(Boolean))];

    const selectedLevelIds = [...new Set(courseSelections.map((c) => c.levelId).filter(Boolean))];

    

    const classes = await prisma.class.findMany({

      where: { id: { in: selectedClassIds }, schoolYearId: currentYear.id },

      include: { level: { include: { pole: true } } },

    });

    const classById = new Map(classes.map((c) => [c.id, c]));



    // Fetch poles for new students

    const poles = await prisma.pole.findMany({

      where: { id: { in: selectedPoleIds } },

      include: { levels: true },

    });

    const poleById = new Map(poles.map((p) => [p.id, p]));



    const levels = await prisma.level.findMany({

      where: { id: { in: selectedLevelIds } },

      include: { pole: true },

    });

    const levelById = new Map(levels.map((l) => [l.id, l]));



    // ensure there is a fictive / provisional class for new students without class selection

    let fictiveClass = await prisma.class.findFirst({

      where: {

        schoolYearId: currentYear.id,

        ...getProvisionalClassFilter(),

      },

    });

    if (!fictiveClass) {

      const anyLevel = await prisma.level.findFirst();

      if (!anyLevel) throw new Error('Niveau introuvable pour crÃ©er la classe provisoire');

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

      .flatMap((selection) => {

        const result = [];

        

        if (selection.classId) {

          const cls = classById.get(selection.classId);

          if (cls) {

            result.push({

              poleName: cls.level.pole.name,

              levelCode: cls.level.code,

            });

          }

        } else if (selection.levelId) {

          const level = levelById.get(selection.levelId);

          if (level) {

            result.push({

              poleName: level.pole?.name || '',

              levelCode: level.code,

            });

          }

        } else if (selection.poleId) {

          const pole = poleById.get(selection.poleId);

          if (pole) {

            const firstLevel = pole.levels && pole.levels[0];

            result.push({

              poleName: pole.name,

              levelCode: firstLevel?.code || '',

            });

          }

        }

        

        return result;

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



    // Fetch existing enrollments with pole info to build totalFamilyEnrollmentsByPole
    const existingEnrollments = await prisma.enrollment.findMany({

      where: {

        student: { familyId: family.id },

        schoolYearId: currentYear.id,

        status: { in: ['PENDING', 'CONFIRMED'] },

      },

      include: {

        class: {

          include: {

            level: { include: { pole: true } },

          },

        },

      },

    });



    const totalFamilyEnrollmentsByPole = {};

    for (const enrollment of existingEnrollments) {

      const poleName = String(enrollment.class?.level?.pole?.name || '').toLowerCase();

      const poleId = enrollment.class?.level?.pole?.id || '';

      const poleKey = poleId || poleName;

      if (poleKey) {

        totalFamilyEnrollmentsByPole[poleKey] = (totalFamilyEnrollmentsByPole[poleKey] || 0) + 1;

      }

    }



    const pricing = calculateFamilyTotal(enrollmentForPricing, pricingConfig, {

      skipRegistrationFee: existingEnrollmentsCount > 0,

      existingArabicCount,

      totalFamilyEnrollmentsByPole,

    });



    const installmentsCount = Number(payment.installmentsCount || 1);

    const scheduleDay = Number(payment.scheduleDay || 10);

    const selectedPaymentMethod = payment.method || 'CHEQUE';

    const { provider, paymentMethod } = mapPaymentMethod(selectedPaymentMethod);

    const paymentTotal = pricing.total + ((selectedPaymentMethod === 'GO_CARDLESS_SEPA' || selectedPaymentMethod === 'PRELEVEMENT_BANCAIRE') ? pricing.fraisPrelevement : 0);



    const ipAddress = getClientIp(req);

    const userAgent = req.headers['user-agent'] || null;
    const bankDebitMetadata = buildBankDebitMetadata(payment);



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

        let student;

        // Si un studentId est fourni (admin re-inscrivant un élève existant), réutiliser l'enregistrement
        if (m.studentId) {

          const existing = await tx.student.findUnique({ where: { id: m.studentId } });

          if (existing && existing.familyId === family.id) {

            student = existing;

          }

        }

        if (!student) {

          const photoUrl = m.photoBase64 ? savePhotoBase64(m.photoBase64) : null;

          student = await tx.student.create({

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

        }

        students.push(student);

      }



      const createdEnrollments = [];

      const usedRegistrationCodes = new Set();

      for (const selection of courseSelections) {

        const studentIndex = Number(selection.memberIndex);

        const student = students[studentIndex];

        if (!student) continue;



        // Old student: has selected a specific class

        if (selection.classId) {

          const cls = classById.get(selection.classId);

          if (!cls) continue;



          const activeEnrollmentCount = await tx.enrollment.count({
            where: {
              classId: cls.id,
              status: { in: ['PENDING', 'CONFIRMED'] },
            },
          });

          const waitlistOrder = (activeEnrollmentCount + 1) - cls.capacity;
          const isWaitlist = waitlistOrder > 0;

          const enrollment = await createEnrollmentWithUniqueRegistrationCode(tx, {

            studentId: student.id,

            classId: cls.id,

            schoolYearId: currentYear.id,

            status: 'PENDING',
            isWaitlist,
            waitlistOrder: isWaitlist ? waitlistOrder : null,

            ...(isWaitlist ? { comment: 'Liste d\'attente' } : {}),

          }, currentYear.id, registrationYearCode, usedRegistrationCodes);



          if (!isWaitlist) {

            await tx.class.update({

              where: { id: cls.id },

              data: {

                enrolledCount: { increment: 1 },

                status: activeEnrollmentCount + 1 > cls.capacity ? 'FULL' : 'OPEN',

              },

            });

          }



          createdEnrollments.push(enrollment);

        }

        // New student: has selected a specific level

        else if (selection.levelId) {

          const level = levelById.get(selection.levelId);

          if (!level) continue;



          const pole = poleById.get(selection.poleId) || level.pole;

          if (!pole) continue;



          const enrollment = await createEnrollmentWithUniqueRegistrationCode(tx, {

            studentId: student.id,

            classId: fictiveClass.id,

            schoolYearId: currentYear.id,

            status: 'PENDING',

            comment: `Affectation provisoire - ${pole.name} / ${level.name} - Test de niveau Ã  organiser`,

          }, currentYear.id, registrationYearCode, usedRegistrationCodes);

          createdEnrollments.push(enrollment);

        }

        // New student: fallback selection by pole only

        else if (selection.poleId) {

          const pole = poleById.get(selection.poleId);

          if (!pole) continue;



          const enrollment = await createEnrollmentWithUniqueRegistrationCode(tx, {

            studentId: student.id,

            classId: fictiveClass.id,

            schoolYearId: currentYear.id,

            status: 'PENDING',

            comment: 'Affectation provisoire - ' + (pole?.name || 'PÃ´le') + ' - Test de niveau Ã  organiser',

          }, currentYear.id, registrationYearCode, usedRegistrationCodes);

          createdEnrollments.push(enrollment);

        }

      }



      for (let i = 0; i < students.length; i += 1) {

        const student = students[i];

        const health = healthForms[i] || {};

        const error = validateHealthForm(health);

        if (error) {

          throw new Error(`Fiche sanitaire Ã©lÃ¨ve ${student.firstName} ${student.lastName}: ${error}`);

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

            legalMentionLabel: 'Lu et approuvÃ©',

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

          const enrollment = await createEnrollmentWithUniqueRegistrationCode(tx, {

            studentId: student.id,

            classId: fictiveClass.id,

            schoolYearId: currentYear.id,

            status: 'PENDING',

            comment: 'Affectation provisoire â€” Ã  confirmer par lâ€™administration',

          }, currentYear.id, registrationYearCode, usedRegistrationCodes);



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

          legalMentionLabel: 'Lu et approuvÃ©',

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



      // Idempotence: if a payment already exists for these enrollments, reuse it

      const enrollmentIds = createdEnrollments.map((e) => e.id).sort();

      let paymentRecord = null;

      const candidatePayments = await tx.payment.findMany({

        where: {

          familyId: family.id,

          schoolYearId: currentYear.id,

          status: { not: 'CANCELLED' },

        },

      });



      for (const p of candidatePayments) {

        const pIds = Array.isArray(p.metadata?.enrollmentIds) ? p.metadata.enrollmentIds.slice().sort() : [];

        if (pIds.length === enrollmentIds.length && pIds.join(',') === enrollmentIds.join(',')) {

          paymentRecord = p;

          break;

        }

      }



      if (!paymentRecord) {

        paymentRecord = await tx.payment.create({

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

              enrollmentIds,

              checkoutMethod: selectedPaymentMethod,

              sepaFee: pricing.fraisPrelevement,

              ipAddress,

              draftId: payload.draftId || null,

              payerName: payment.payerName || null,
              ...bankDebitMetadata,

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



        await tx.paymentPlan.create({

          data: {

            familyId: family.id,

            schoolYearId: currentYear.id,

            paymentId: paymentRecord.id,

            type: selectedPaymentMethod === 'PRELEVEMENT_BANCAIRE' ? 'ESPECES' : selectedPaymentMethod,

            status: provider === 'OFFLINE' ? 'ACTIVE' : 'PENDING',

            installmentsCount,

            scheduleDay,

            totalAmount: toDecimal(paymentTotal),

            metadata: {

              createdFrom: 'existing_family_wizard',

              sepaFee: pricing.fraisPrelevement,

              ...bankDebitMetadata,

            },

          },

        });

      } else {

        // Ensure metadata includes expected fields

        await tx.payment.update({

          where: { id: paymentRecord.id },

          data: {

            metadata: {

              ...(paymentRecord.metadata || {}),

              enrollmentIds,

              checkoutMethod: selectedPaymentMethod,

              sepaFee: pricing.fraisPrelevement,

              ipAddress,

              draftId: payload.draftId || null,

              payerName: payment.payerName || null,
              ...bankDebitMetadata,

            },

          },

        });

      }



      const installments = await tx.installment.findMany({ where: { paymentId: paymentRecord.id } });

      const paymentPlan = await tx.paymentPlan.findUnique({ where: { paymentId: paymentRecord.id } });



      if (provider === 'OFFLINE') {

        const isCheque = paymentMethod === 'CHEQUE';
        const isBankDebit = paymentMethod === 'VIREMENT' && selectedPaymentMethod === 'PRELEVEMENT_BANCAIRE';

        await tx.paymentTransaction.create({

          data: {

            paymentId: paymentRecord.id,

            provider: 'OFFLINE',

            method: paymentMethod,

            amount: toDecimal(paymentTotal),

            status: 'INITIATED',

            payerName: `${req.user.firstName} ${req.user.lastName}`,

            description: isCheque
              ? 'Paiement par chÃ¨que en attente'
              : isBankDebit
                ? 'PrÃ©lÃ¨vement bancaire en attente'
                : 'Paiement en espÃ¨ces en attente',

            metadata: {

              instructions: isCheque
                ? 'DÃ©poser les chÃ¨ques selon lâ€™Ã©chÃ©ancier communiquÃ© par association PARTAGE.'
                : isBankDebit
                  ? 'Le RIB est enregistrÃ© pour traitement. Le prÃ©lÃ¨vement sera mis en place par le service trÃ©sorerie.'
                  : 'Veuillez dÃ©poser le montant en espÃ¨ces selon lâ€™Ã©chÃ©ancier fourni.',

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

        installments,

        shouldCreateCheckout: provider !== 'OFFLINE',

      };

    });



    if (result.payment.provider !== 'OFFLINE' && result.shouldCreateCheckout) {

      try {

        if (result.payment.provider === 'STRIPE' && result.payment.paymentMethod === 'SEPA') {

          const stripeCustomer = await createStripeCustomer({

            email: req.user.email,

            firstName: req.user.firstName,

            lastName: req.user.lastName,

            metadata: {

              source: 'family_wizard_existing',

              paymentId: result.payment.id,

              planId: result.paymentPlan.id,

            },

          });



          const setupIntent = await createStripeSepaSetupIntent({

            customerId: stripeCustomer.id,

            metadata: {

              source: 'family_wizard_existing',

              paymentId: result.payment.id,

              planId: result.paymentPlan.id,

            },

            ipAddress: getClientIp(req),

            userAgent: req.headers['user-agent'] || null,

          });



          const mandateToken = uuidv4();

          const payerName = result.payment.metadata?.payerName || `${req.user.firstName} ${req.user.lastName}`;

          const dueDateFirstPayment = result.installments[0]?.dueDate instanceof Date

            ? result.installments[0].dueDate.toISOString()

            : new Date(result.installments[0]?.dueDate).toISOString();



          const checkout = {

            type: 'SEPA_SETUP',

            provider: 'STRIPE',

            configured: true,

            clientSecret: setupIntent.client_secret,

            setupIntentId: setupIntent.id,

            customerId: stripeCustomer.id,

            mandateToken,

            montantTotal: Number(result.payment.totalAmount || 0).toFixed(2),

            nombreEcheances: result.installments.length,

            payerName,

            email: req.user.email,

            paymentId: result.payment.id,

            inscriptionId: result.enrollments[0]?.id || null,

            dueDateFirstPayment,

          };



          await prisma.payment.update({

            where: { id: result.payment.id },

            data: {

              externalPaymentId: null,

              metadata: {

                ...(result.payment.metadata || {}),

                sepaMandateToken: mandateToken,

                stripeCustomerId: stripeCustomer.id,

                stripeSetupIntentId: setupIntent.id,

                sepaCheckout: checkout,

              },

            },

          });



          await prisma.paymentPlan.update({

            where: { id: result.paymentPlan.id },

            data: {

              status: 'PENDING',

              providerRef: null,

              metadata: {

                ...(result.paymentPlan.metadata || {}),

                sepaMandateToken: mandateToken,

                sepaCheckout: checkout,

              },

            },

          });



          result.checkout = checkout;

        } else {

          const urls = getPaymentReturnUrls(req, provider);

          const checkout = await createOnlineCheckout({

            provider,

            amount: paymentTotal,

            paymentMethodType: paymentMethod === 'SEPA' ? 'sepa_debit' : 'card',

            paymentId: result.payment.id,

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

              plan_id: result.paymentPlan.id,

            },

          });



          await prisma.$transaction([

            prisma.payment.update({

              where: { id: result.payment.id },

              data: {

                externalPaymentId: checkout.externalPaymentId || null,

                metadata: {

                  ...(result.payment.metadata || {}),

                  checkout,

                },

              },

            }),

            prisma.paymentPlan.update({

              where: { id: result.paymentPlan.id },

              data: {

                status: checkout.configured ? 'PENDING' : 'FAILED',

                providerRef: checkout.externalPaymentId || null,

                metadata: {

                  ...(result.paymentPlan.metadata || {}),

                  checkout,

                },

              },

            }),

            prisma.paymentTransaction.create({

              data: {

                paymentId: result.payment.id,

                provider,

                method: paymentMethod,

                amount: toDecimal(paymentTotal),

                status: checkout.configured ? 'INITIATED' : 'FAILED',

                externalRef: checkout.externalPaymentId || null,

                payerName: payment.payerName || `${req.user.firstName} ${req.user.lastName}`,

                description: 'Paiement inscription membre existant',

                metadata: checkout,

              },

            }),

          ]);



          result.checkout = checkout;

        }

      } catch (checkoutError) {

        console.error('Erreur crÃ©ation Stripe Checkout hors transaction:', checkoutError);

        await prisma.paymentPlan.update({

          where: { id: result.paymentPlan.id },

          data: { status: 'FAILED' },

        });

        await prisma.paymentTransaction.create({

          data: {

            paymentId: result.payment.id,

            provider,

            method: paymentMethod,

            amount: toDecimal(paymentTotal),

            status: 'FAILED',

            description: 'Ã‰chec crÃ©ation Stripe Checkout',

            metadata: {

              error: checkoutError?.message || 'Stripe checkout error',

            },

          },

        });

        throw new Error(`Erreur lors de l'initialisation du paiement Stripe : ${checkoutError?.message || 'unknown'}`);

      }

    }



    if (result.payment.provider !== 'OFFLINE' && result.shouldCreateCheckout && !result.checkout) {

      throw new Error('Le paiement Stripe nâ€™a pas pu Ãªtre initialisÃ©. Veuillez rÃ©essayer plus tard.');

    }



    // Envoi du mail de demande d'inscription enregistrÃ©e aprÃ¨s validation de la derniÃ¨re Ã©tape

    const studentById = new Map(result.students.map((s) => [s.id, s]));

    const enrollmentDetailsHtml = result.enrollments.map((en) => {

      const student = studentById.get(en.studentId) || { firstName: 'Ã‰lÃ¨ve', lastName: '' };

      const cls = classById.get(en.classId);

      const waitlistNote = en.comment === 'Liste d\'attente' ? ' â€¢ Liste d\'attente' : '';

      return `â€¢ ${student.firstName} ${student.lastName} â€” ${cls?.level?.pole?.name || 'PÃ´le'} / ${cls?.level?.name || 'Niveau'} ${cls?.dayOfWeek || ''} ${cls?.startTime || ''}-${cls?.endTime || ''}${waitlistNote}`;

    }).join('<br/>');

    const paymentDetailsHtml = `<div style="margin:18px 0;padding:18px;background:#f8fafc;border-radius:12px;">

      <strong>Montant total :</strong> ${Number(result.payment.totalAmount || 0).toFixed(2)} â‚¬<br/>

      <strong>Mode :</strong> ${payment.method || 'CHEQUE'}<br/>

      <strong>Ã‰chÃ©ances :</strong> ${result.installments.length}

    </div>`;



    sendEnrollmentRequestRegisteredEmail(req.user, `${enrollmentDetailsHtml}${paymentDetailsHtml}`).catch((err) => {

      console.error('[EMAIL] Erreur envoi email demande inscription:', err?.message || err);

    });



    if (result.payment.provider === 'STRIPE') {

      sendStripePaymentPendingEmail(req.user, {

        id: result.payment.id,

        totalAmount: Number(result.payment.totalAmount || 0),

        method: result.payment.paymentMethod || 'Stripe',

        payerName: result.payment.metadata?.payerName || `${req.user.firstName} ${req.user.lastName}`,

        enrollmentSummary: `${enrollmentDetailsHtml}${paymentDetailsHtml}`,

      }).catch((err) => {

        console.error('[EMAIL] Erreur envoi email paiement Stripe en attente:', err?.message || err);

      });

    }



    // Notify admins about provisional enrollments (if any were created)

    try {

      const adminUsers = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { email: true, firstName: true } });

      const adminEmails = adminUsers.map((u) => u.email).filter(Boolean);

      if (adminEmails.length > 0 && result.enrollments && result.enrollments.length > 0) {

        const provisionalListHtml = result.enrollments.map((en) => `â€¢ ${en.registrationCode || en.id} â€” ${result.students.find((s) => s.id === en.studentId)?.firstName || 'Ã‰lÃ¨ve'}`).join('<br/>');

        const contentHtml = `

          <p>Bonjour,</p>

          <p>De nouvelles inscriptions avec <strong>affectation provisoire</strong> ont Ã©tÃ© crÃ©Ã©es via lâ€™assistant famille :</p>

          <div style="margin:12px 0;padding:12px;background:#FEF3C7;border-radius:8px;">${provisionalListHtml}</div>

          <p>Consultez la liste des inscriptions administrateur pour traiter et affecter ces Ã©lÃ¨ves :</p>

          <p style="text-align:center;"><a href="${config.frontendUrl}/admin/enrollments" style="display:inline-block;padding:10px 16px;background:#213B88;color:#fff;border-radius:8px;text-decoration:none;">AccÃ©der aux inscriptions</a></p>

        `;

        await sendMail({ to: adminEmails.join(','), subject: 'AMC â€” Nouvelles inscriptions (affectation provisoire)', html: contentHtml });

      }

    } catch (err) {

      console.error('Erreur notification admins pour inscriptions provisoires:', err?.message || err);

    }



    return res.status(201).json({

      message: 'Inscription du nouveau membre enregistrÃ©e. Les inscriptions seront confirmÃ©es aprÃ¨s paiement rÃ©ussi.',

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

      return res.status(409).json({ error: 'Un compte existe dÃ©jÃ  avec cet email' });

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

      return res.status(400).json({ error: 'Nom, email, tÃ©lÃ©phone et mot de passe sont obligatoires' });

    }



    const passwordError = ensureStrongPassword(account.password);

    if (passwordError) return res.status(400).json({ error: passwordError });



    const existing = await prisma.user.findUnique({ where: { email: account.email } });

    if (existing) return res.status(409).json({ error: 'Un compte existe dÃ©jÃ  avec cet email' });



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

      message: 'Compte crÃ©Ã©. VÃ©rifiez votre email pour activer lâ€™accÃ¨s.',

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



async function saveFamilyWizardSepaMandate(req, res) {

  try {

    const {

      paymentId,

      mandateToken,

      paymentMethodId,

      setupIntentId,

      mandateId,

      customerId,

      montant,

      inscriptionId,

      dueDateFirstPayment,

    } = req.body || {};



    if (!paymentId || !mandateToken || !paymentMethodId || !setupIntentId || !customerId || montant === undefined || montant === null || !inscriptionId || !dueDateFirstPayment) {

      return res.status(400).json({

        error: 'paymentId, mandateToken, paymentMethodId, setupIntentId, customerId, montant, inscriptionId et dueDateFirstPayment sont requis',

      });

    }



    const payment = await prisma.payment.findUnique({ where: { id: String(paymentId) } });

    if (!payment) {

      return res.status(404).json({ error: 'Paiement introuvable pour ce mandat SEPA' });

    }



    if (payment.provider !== 'STRIPE' || payment.paymentMethod !== 'SEPA') {

      return res.status(400).json({ error: 'Le paiement doit Ãªtre un SEPA Stripe valide' });

    }



    const metadataEnrollmentIds = Array.isArray(payment.metadata?.enrollmentIds) ? payment.metadata.enrollmentIds.map((id) => Number(id)) : [];

    if (metadataEnrollmentIds.length > 0 && !metadataEnrollmentIds.includes(Number(inscriptionId))) {

      return res.status(400).json({ error: 'Lâ€™inscription fournie ne correspond pas au paiement SEPA' });

    }



    if (!payment.metadata?.sepaMandateToken || payment.metadata.sepaMandateToken !== mandateToken) {

      return res.status(403).json({ error: 'Jeton de mandat SEPA invalide' });

    }



    const dueDate = new Date(dueDateFirstPayment);

    if (Number.isNaN(dueDate.getTime())) {

      return res.status(400).json({ error: 'dueDateFirstPayment invalide (format ISO attendu)' });

    }



    const updatedPaymentMetadata = {

      ...(payment.metadata || {}),

      stripePaymentMethodId: paymentMethodId,

      stripeCustomerId: customerId,

      stripeSetupIntentId: setupIntentId,

      stripeMandateId: mandateId || payment.metadata?.stripeMandateId || null,

      sepaMandateSavedAt: new Date().toISOString(),

      sepaMandateSaved: true,

      sepaMandateFirstPaymentDate: dueDate.toISOString(),

    };



    await prisma.payment.update({

      where: { id: payment.id },

      data: {

        metadata: updatedPaymentMetadata,

      },

    });



    await prisma.installment.updateMany({

      where: { paymentId: payment.id, installmentNumber: 1 },

      data: { dueDate },

    });



    const paymentPlan = await prisma.paymentPlan.findFirst({ where: { paymentId: payment.id } });

    if (paymentPlan) {

      await prisma.paymentPlan.update({

        where: { id: paymentPlan.id },

        data: {

          metadata: {

            ...(paymentPlan.metadata || {}),

            stripePaymentMethodId: paymentMethodId,

            stripeCustomerId: customerId,

            stripeSetupIntentId: setupIntentId,

            stripeMandateId: mandateId || paymentPlan.metadata?.stripeMandateId || null,

            sepaMandateSavedAt: new Date().toISOString(),

          },

        },

      });

    }



    const payerName = payment.metadata?.payerName || 'Titulaire du compte SEPA';

    await prisma.paymentTransaction.create({

      data: {

        paymentId: payment.id,

        provider: 'STRIPE',

        method: payment.paymentMethod || 'SEPA',

        amount: toDecimal(Number(montant).toFixed(2)),

        status: 'INITIATED',

        externalRef: setupIntentId,

        payerName,

        description: 'Mandat SEPA signÃ© et premier prÃ©lÃ¨vement planifiÃ©.',

        metadata: {

          paymentMethodId,

          customerId,

          setupIntentId,

          mandateId,

          dueDateFirstPayment: dueDate.toISOString(),

        },

      },

    });



    return res.json({

      success: true,

      message: `Mandat SEPA signÃ© et sauvegardÃ©. Le premier prÃ©lÃ¨vement sera effectuÃ© le ${dueDate.toLocaleDateString('fr-FR')}.`,

    });

  } catch (error) {

    console.error('Erreur saveFamilyWizardSepaMandate:', error);

    return res.status(500).json({ error: error.message || 'Erreur serveur lors de la sauvegarde du mandat SEPA' });

  }

}



async function completeFamilyRegistration(req, res) {

  try {

    const blocked = await isRegistrationBlocked();

    if (blocked) {

      return res.status(403).json({ error: 'Les inscriptions sont temporairement bloquÃ©es par le secrÃ©tariat' });

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

      return res.status(400).json({ error: 'Informations du compte incomplÃ¨tes' });

    }



    const passwordError = ensureStrongPassword(account.password);

    if (passwordError) return res.status(400).json({ error: passwordError });



    if (!address.addressLine1 || !address.postalCode || !address.city || !address.country || !address.phonePrimary) {

      return res.status(400).json({ error: 'Adresse et tÃ©lÃ©phone principal sont obligatoires' });

    }



    if (members.length === 0) {

      return res.status(400).json({ error: 'Ajoutez au moins un membre de la famille' });

    }



    if (!engagement?.readAndApproved || !engagement?.legalMentionAccepted || !engagement?.signedByFullName || !engagement?.citySigned || !engagement?.signedAt) {

      return res.status(400).json({ error: 'Engagement incomplet: validation, lieu, date et signataire requis' });

    }



    const existing = await prisma.user.findUnique({ where: { email: account.email } });

    if (existing) return res.status(409).json({ error: 'Un compte existe dÃ©jÃ  avec cet email' });



    const currentYear = await ensureCurrentSchoolYear();

    const registrationYearCode = extractSchoolYearCode(currentYear.label, currentYear.startDate);



    const selectedClassIds = [...new Set(courseSelections.map((c) => c.classId).filter(Boolean))];

    const selectedPoleIds = [...new Set(courseSelections.map((c) => c.poleId).filter(Boolean))];

    const classes = await prisma.class.findMany({

      where: { id: { in: selectedClassIds }, schoolYearId: currentYear.id },

      include: { level: { include: { pole: true } } },

    });

    const poles = await prisma.pole.findMany({

      where: { id: { in: selectedPoleIds } },

      include: { levels: true },

    });

    const classById = new Map(classes.map((c) => [c.id, c]));

    const poleById = new Map(poles.map((p) => [p.id, p]));



    let fictiveClass = await prisma.class.findFirst({

      where: {

        schoolYearId: currentYear.id,

        ...getProvisionalClassFilter(),

      },

    });

    if (!fictiveClass) {

      const anyLevel = await prisma.level.findFirst();

      if (!anyLevel) throw new Error('Niveau introuvable pour crÃ©er la classe provisoire');

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

        if (selection.classId) {

          const cls = classById.get(selection.classId);

          if (!cls) return null;

          return {

            poleId: cls.level.pole.id,

            levelId: cls.level.id,

            poleName: cls.level.pole.name,

            levelCode: cls.level.code,

          };

        } else if (selection.poleId) {

          const pole = poleById.get(selection.poleId);

          if (!pole) return null;

          const firstLevel = pole.levels && pole.levels[0];

          return {

            poleId: pole.id,

            levelId: firstLevel?.id || '',

            poleName: pole.name,

            levelCode: firstLevel?.code || '',

          };

        }

        return null;

      })

      .filter(Boolean);



    const pricing = calculateFamilyTotal(enrollmentForPricing, pricingConfig);



    const installmentsCount = Number(payment.installmentsCount || 1);

    const scheduleDay = Number(payment.scheduleDay || 10);

    const selectedPaymentMethod = payment.method || 'CHEQUE';

    const { provider, paymentMethod } = mapPaymentMethod(selectedPaymentMethod);

    const paymentTotal = pricing.total + ((selectedPaymentMethod === 'GO_CARDLESS_SEPA' || selectedPaymentMethod === 'PRELEVEMENT_BANCAIRE') ? pricing.fraisPrelevement : 0);



    const ipAddress = getClientIp(req);

    const userAgent = req.headers['user-agent'] || null;
    const bankDebitMetadata = buildBankDebitMetadata(payment);



    const passwordHash = await bcrypt.hash(account.password, 12);

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

      const usedRegistrationCodes = new Set();

      for (const selection of courseSelections) {

        const cls = classById.get(selection.classId);

        if (!cls) continue;



        const studentIndex = Number(selection.memberIndex);

        const student = students[studentIndex];

        if (!student) continue;



        const activeEnrollmentCount = await tx.enrollment.count({
          where: {
            classId: cls.id,
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        });

        const waitlistOrder = (activeEnrollmentCount + 1) - cls.capacity;
        const isWaitlist = waitlistOrder > 0;

        const enrollment = await createEnrollmentWithUniqueRegistrationCode(tx, {

          studentId: student.id,

          classId: cls.id,

          schoolYearId: currentYear.id,

          status: 'PENDING',
          isWaitlist,
          waitlistOrder: isWaitlist ? waitlistOrder : null,

          ...(isWaitlist ? { comment: 'Liste d\'attente' } : {}),

        }, currentYear.id, registrationYearCode, usedRegistrationCodes);



        if (!isWaitlist) {

          await tx.class.update({

            where: { id: cls.id },

            data: {

              enrolledCount: { increment: 1 },

              status: activeEnrollmentCount + 1 >= cls.capacity ? 'FULL' : 'OPEN',

            },

          });

        }



        createdEnrollments.push(enrollment);

      }



      for (let i = 0; i < students.length; i += 1) {

        const student = students[i];

        const already = createdEnrollments.find((e) => e.studentId === student.id);

        if (!already) {

            const enrollment = await createEnrollmentWithUniqueRegistrationCode(tx, {

            studentId: student.id,

            classId: fictiveClass.id,

            schoolYearId: currentYear.id,

            status: 'PENDING',

            comment: 'Affectation provisoire â€” Ã  confirmer par lâ€™administration',

          }, currentYear.id, registrationYearCode, usedRegistrationCodes);

          await tx.class.update({ where: { id: fictiveClass.id }, data: { enrolledCount: { increment: 1 } } });

          createdEnrollments.push(enrollment);

        }

      }



      for (let i = 0; i < students.length; i += 1) {

        const student = students[i];

        const health = healthForms[i] || {};



        const error = validateHealthForm(health);

        if (error) {

          throw new Error(`Fiche sanitaire Ã©lÃ¨ve ${student.firstName} ${student.lastName}: ${error}`);

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

            legalMentionLabel: 'Lu et approuvÃ©',

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

          legalMentionLabel: 'Lu et approuvÃ©',

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



      // Idempotence: reuse an existing payment if it matches these enrollments

      const enrollmentIds = createdEnrollments.map((e) => e.id).sort();

      let paymentRecord = null;

      const candidatePayments = await tx.payment.findMany({

        where: {

          familyId: family.id,

          schoolYearId: currentYear.id,

          status: { not: 'CANCELLED' },

        },

      });



      for (const p of candidatePayments) {

        const pIds = Array.isArray(p.metadata?.enrollmentIds) ? p.metadata.enrollmentIds.slice().sort() : [];

        if (pIds.length === enrollmentIds.length && pIds.join(',') === enrollmentIds.join(',')) {

          paymentRecord = p;

          break;

        }

      }



      if (!paymentRecord) {

        paymentRecord = await tx.payment.create({

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

              enrollmentIds,

              checkoutMethod: selectedPaymentMethod,

              sepaFee: pricing.fraisPrelevement,

              ipAddress,

              draftId: payload.draftId || null,

              payerName: payment.payerName || null,
              ...bankDebitMetadata,

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



        await tx.paymentPlan.create({

          data: {

            familyId: family.id,

            schoolYearId: currentYear.id,

            paymentId: paymentRecord.id,

            type: selectedPaymentMethod === 'PRELEVEMENT_BANCAIRE' ? 'ESPECES' : selectedPaymentMethod,

            status: provider === 'OFFLINE' ? 'ACTIVE' : 'PENDING',

            installmentsCount,

            scheduleDay,

            totalAmount: toDecimal(paymentTotal),

            metadata: {

              createdFrom: 'public_family_wizard',

              sepaFee: pricing.fraisPrelevement,

              ...bankDebitMetadata,

            },

          },

        });

      } else {

        await tx.payment.update({

          where: { id: paymentRecord.id },

          data: {

            metadata: {

              ...(paymentRecord.metadata || {}),

              enrollmentIds,

              checkoutMethod: selectedPaymentMethod,

              sepaFee: pricing.fraisPrelevement,

              ipAddress,

              draftId: payload.draftId || null,

              payerName: payment.payerName || null,
              ...bankDebitMetadata,

            },

          },

        });

      }



      const installments = await tx.installment.findMany({ where: { paymentId: paymentRecord.id } });

      const paymentPlan = await tx.paymentPlan.findUnique({ where: { paymentId: paymentRecord.id } });



      if (provider === 'OFFLINE') {

        const isCheque = paymentMethod === 'CHEQUE';
        const isBankDebit = paymentMethod === 'VIREMENT' && selectedPaymentMethod === 'PRELEVEMENT_BANCAIRE';

        await tx.paymentTransaction.create({

          data: {

            paymentId: paymentRecord.id,

            provider: 'OFFLINE',

            method: paymentMethod,

            amount: toDecimal(paymentTotal),

            status: 'INITIATED',

            payerName: `${user.firstName} ${user.lastName}`,

            description: isCheque
              ? 'Paiement par chÃ¨que en attente'
              : isBankDebit
                ? 'PrÃ©lÃ¨vement bancaire en attente'
                : 'Paiement en espÃ¨ces en attente',

            metadata: {

              instructions: isCheque
                ? 'DÃ©poser les chÃ¨ques selon lâ€™Ã©chÃ©ancier communiquÃ© par association PARTAGE.'
                : isBankDebit
                  ? 'Le RIB est enregistrÃ© pour traitement. Le prÃ©lÃ¨vement sera mis en place par le service trÃ©sorerie.'
                  : 'Veuillez dÃ©poser le montant en espÃ¨ces selon lâ€™Ã©chÃ©ancier fourni.',

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

        installments,

        shouldCreateCheckout: provider !== 'OFFLINE',

      };

    });



    if (result.payment.provider !== 'OFFLINE' && result.shouldCreateCheckout) {

      try {

        if (result.payment.provider === 'STRIPE' && result.payment.paymentMethod === 'SEPA') {

          const stripeCustomer = await createStripeCustomer({

            email: result.user.email,

            firstName: result.user.firstName,

            lastName: result.user.lastName,

            metadata: {

              source: 'family_wizard',

              paymentId: result.payment.id,

              planId: result.paymentPlan.id,

            },

          });



          const setupIntent = await createStripeSepaSetupIntent({

            customerId: stripeCustomer.id,

            metadata: {

              source: 'family_wizard',

              paymentId: result.payment.id,

              planId: result.paymentPlan.id,

            },

            ipAddress: getClientIp(req),

            userAgent: req.headers['user-agent'] || null,

          });



          const mandateToken = uuidv4();

          const payerName = result.payment.metadata?.payerName || `${result.user.firstName} ${result.user.lastName}`;

          const dueDateFirstPayment = result.installments[0]?.dueDate instanceof Date

            ? result.installments[0].dueDate.toISOString()

            : new Date(result.installments[0]?.dueDate).toISOString();



          const checkout = {

            type: 'SEPA_SETUP',

            provider: 'STRIPE',

            configured: true,

            clientSecret: setupIntent.client_secret,

            setupIntentId: setupIntent.id,

            customerId: stripeCustomer.id,

            mandateToken,

            montantTotal: Number(result.payment.totalAmount || 0).toFixed(2),

            nombreEcheances: result.installments.length,

            payerName,

            email: result.user.email,

            paymentId: result.payment.id,

            inscriptionId: result.enrollments[0]?.id || null,

            dueDateFirstPayment,

          };



          await prisma.payment.update({

            where: { id: result.payment.id },

            data: {

              externalPaymentId: null,

              metadata: {

                ...(result.payment.metadata || {}),

                sepaMandateToken: mandateToken,

                stripeCustomerId: stripeCustomer.id,

                stripeSetupIntentId: setupIntent.id,

                sepaCheckout: checkout,

              },

            },

          });



          await prisma.paymentPlan.update({

            where: { id: result.paymentPlan.id },

            data: {

              status: 'PENDING',

              providerRef: null,

              metadata: {

                ...(result.paymentPlan.metadata || {}),

                sepaMandateToken: mandateToken,

                sepaCheckout: checkout,

              },

            },

          });



          result.checkout = checkout;

        } else {

          const urls = getPaymentReturnUrls(req, result.payment.provider);

          const checkout = await createOnlineCheckout({

            provider: result.payment.provider,

            amount: Number(result.payment.totalAmount || 0),

            paymentMethodType: result.payment.paymentMethod === 'SEPA' ? 'sepa_debit' : 'card',

            paymentId: result.payment.id,

            returnUrl: urls.returnUrl,

            cancelUrl: urls.cancelUrl,

            installments: result.installments.length,

            customer: {

              firstName: result.user.firstName,

              lastName: result.user.lastName,

              email: result.user.email,

            },

            metadata: {

              source: 'family_wizard',

              plan_id: result.paymentPlan.id,

            },

          });



          await prisma.payment.update({

            where: { id: result.payment.id },

            data: {

              externalPaymentId: checkout.externalPaymentId || null,

              metadata: {

                ...(result.payment.metadata || {}),

                checkout,

              },

            },

          });



          await prisma.paymentPlan.update({

            where: { id: result.paymentPlan.id },

            data: {

              status: checkout.configured ? 'PENDING' : 'FAILED',

              providerRef: checkout.externalPaymentId || null,

              metadata: {

                ...(result.paymentPlan.metadata || {}),

                checkout,

              },

            },

          });



          await prisma.paymentTransaction.create({

            data: {

              paymentId: result.payment.id,

              provider: result.payment.provider,

              method: result.payment.paymentMethod,

              amount: toDecimal(result.payment.totalAmount),

              status: checkout.configured ? 'INITIATED' : 'FAILED',

              externalRef: checkout.externalPaymentId || null,

              payerName: payment.payerName /*|| `${user.firstName} ${user.lastName}`*/,

              description: 'Paiement inscription initiale',

              metadata: checkout,

            },

          });



          result.checkout = checkout;

        }

      } catch (checkoutError) {

        console.error('Erreur crÃ©ation Stripe Checkout hors transaction:', checkoutError);

        await prisma.paymentPlan.update({

          where: { id: result.paymentPlan.id },

          data: { status: 'FAILED' },

        });

        await prisma.paymentTransaction.create({

          data: {

            paymentId: result.payment.id,

            provider: result.payment.provider,

            method: result.payment.paymentMethod,

            amount: toDecimal(result.payment.totalAmount),

            status: 'FAILED',

            description: 'Ã‰chec crÃ©ation Stripe Checkout',

            metadata: {

              error: checkoutError?.message || 'Stripe checkout error',

            },

          },

        });

        throw new Error(`Erreur lors de l'initialisation du paiement Stripe : ${checkoutError?.message || 'unknown'}`);

      }

    }



    if (result.payment.provider !== 'OFFLINE' && result.shouldCreateCheckout && !result.checkout) {

      throw new Error('Le paiement Stripe nâ€™a pas pu Ãªtre initialisÃ©. Veuillez rÃ©essayer plus tard.');

    }



    // Envoi du mail de confirmation d'inscription

    const studentById = new Map(result.students.map((s) => [s.id, s]));

    const enrollmentDetailsHtml = result.enrollments.map((en) => {

      const student = studentById.get(en.studentId) || { firstName: 'Ã‰lÃ¨ve', lastName: '' };

      const cls = classById.get(en.classId);

      const waitlistNote = en.comment === 'Liste d\'attente' ? ' â€¢ Liste d\'attente' : '';

      return `â€¢ ${student.firstName} ${student.lastName} â€” ${cls?.level?.pole?.name || 'PÃ´le'} / ${cls?.level?.name || 'Niveau'} ${cls?.dayOfWeek || ''} ${cls?.startTime || ''}-${cls?.endTime || ''}${waitlistNote}`;

    }).join('<br/>');

    const paymentDetailsHtml = `<div style="margin:18px 0;padding:18px;background:#f8fafc;border-radius:12px;">

      <strong>Montant total :</strong> ${Number(result.payment.totalAmount || 0).toFixed(2)} â‚¬<br/>

      <strong>Mode :</strong> ${paymentMethod}<br/>

      <strong>Ã‰chÃ©ances :</strong> ${result.installments.length}

    </div>`;



    // Envoi du mail de demande d'inscription enregistrÃ©e aprÃ¨s validation de la derniÃ¨re Ã©tape

    sendEnrollmentRequestRegisteredEmail(result.user, `${enrollmentDetailsHtml}${paymentDetailsHtml}`).catch((err) => {

      console.error('[EMAIL] Erreur envoi email demande inscription:', err?.message || err);

    });



    if (result.payment.provider === 'STRIPE') {

      sendStripePaymentPendingEmail(result.user, {

        id: result.payment.id,

        totalAmount: Number(result.payment.totalAmount || 0),

        method: result.payment.paymentMethod || 'Stripe',

        payerName: result.payment.metadata?.payerName || result.user.firstName && `${result.user.firstName} ${result.user.lastName}`,

        enrollmentSummary: `${enrollmentDetailsHtml}${paymentDetailsHtml}`,

      }).catch((err) => {

        console.error('[EMAIL] Erreur envoi email paiement Stripe en attente:', err?.message || err);

      });

    }



    // Notify admins about provisional enrollments (if any were created)

    try {

      const adminUsers = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { email: true, firstName: true } });

      const adminEmails = adminUsers.map((u) => u.email).filter(Boolean);

      if (adminEmails.length > 0 && result.enrollments && result.enrollments.length > 0) {

        const provisionalListHtml = result.enrollments.map((en) => `â€¢ ${en.registrationCode || en.id} â€” ${result.students.find((s) => s.id === en.studentId)?.firstName || 'Ã‰lÃ¨ve'}`).join('<br/>');

        const contentHtml = `

          <p>Bonjour,</p>

          <p>De nouvelles inscriptions avec <strong>affectation provisoire</strong> ont Ã©tÃ© crÃ©Ã©es via lâ€™assistant famille :</p>

          <div style="margin:12px 0;padding:12px;background:#FEF3C7;border-radius:8px;">${provisionalListHtml}</div>

          <p>Consultez la liste des inscriptions administrateur pour traiter et affecter ces Ã©lÃ¨ves :</p>

          <p style="text-align:center;"><a href="${config.frontendUrl}/admin/enrollments" style="display:inline-block;padding:10px 16px;background:#213B88;color:#fff;border-radius:8px;text-decoration:none;">AccÃ©der aux inscriptions</a></p>

        `;

        await sendMail({ to: adminEmails.join(','), subject: 'AMC â€” Nouvelles inscriptions (affectation provisoire)', html: contentHtml });

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

  saveFamilyWizardSepaMandate,

  completeFamilyRegistration,

  completeExistingFamilyRegistration,

};
