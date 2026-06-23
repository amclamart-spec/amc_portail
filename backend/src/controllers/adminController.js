const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { PrismaClient, Prisma } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const { sendAccountApprovedEmail, sendAccountRejectedEmail, sendEnrollmentApprovedEmail, sendEnrollmentRejectedEmail, sendMail } = require('../services/emailService');
const { finalizeStripePayment, cancelStripePayment } = require('./paymentController');
const { savePhotoBase64 } = require('../utils/photoUtils');
const { saveBase64File } = require('../utils/fileUtils');
const { isProvisionalClass, getProvisionalClassFilter, PROVISIONAL_CLASS_NAME } = require('../utils/provisionalClassUtils');
const { getRegistrationBlock, setRegistrationBlock } = require('../services/systemService');
const { getReceiptInfo } = require('../utils/receiptUtils');
const { generateInvoicePDF } = require('../utils/invoiceUtils');

const prisma = new PrismaClient();

function normalizeId(value) {
  return String(value || '').replace(/[\u200B-\u200F\uFEFF]/g, '').trim();
}

async function confirmStripePaymentsForEnrollment(enrollmentId) {
  const stripePayments = await prisma.payment.findMany({
    where: {
      provider: 'STRIPE',
      paymentMethod: 'CB',
      status: 'PENDING',
    },
  });

  for (const payment of stripePayments) {
    const enrollmentIds = Array.isArray(payment.metadata?.enrollmentIds)
      ? payment.metadata.enrollmentIds
      : [];

    if (!enrollmentIds.includes(enrollmentId)) {
      continue;
    }

    const pendingCount = await prisma.enrollment.count({
      where: {
        id: { in: enrollmentIds },
        status: 'PENDING',
      },
    });

    if (pendingCount === 0) {
      await finalizeStripePayment(payment.id);
    }
  }
}

const DAYS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];

function parseTimeToMinutes(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map((v) => Number(v));
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function classFillIndicator(enrolledCount, capacity) {
  if (!capacity) return { color: 'green', label: '🟢' };
  const ratio = enrolledCount / capacity;
  if (ratio >= 1) return { color: 'red', label: '🔴' };
  if (ratio >= 0.75) return { color: 'orange', label: '🟠' };
  return { color: 'green', label: '🟢' };
}

async function validateTimeSlotOverlap({ dayOfWeek, startTime, endTime, roomId, excludeId }) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);

  if (!DAYS.includes(dayOfWeek)) {
    return 'Le jour est invalide';
  }

  if (start === null || end === null || start >= end) {
    return "L'horaire est invalide (heure de début/fin)";
  }

  const existing = await prisma.timeSlot.findMany({
    where: {
      roomId,
      dayOfWeek,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, startTime: true, endTime: true },
  });

  for (const slot of existing) {
    const currentStart = parseTimeToMinutes(slot.startTime);
    const currentEnd = parseTimeToMinutes(slot.endTime);
    if (currentStart === null || currentEnd === null) continue;
    if (overlaps(start, end, currentStart, currentEnd)) {
      return 'Chevauchement détecté : la salle est déjà occupée sur ce créneau';
    }
  }

  return null;
}

function dateRangesOverlap(fromA, toA, fromB, toB) {
  const start = fromA && fromB ? Math.max(new Date(fromA).getTime(), new Date(fromB).getTime()) : 0;
  const end = toA && toB ? Math.min(new Date(toA).getTime(), new Date(toB).getTime()) : Infinity;
  return start <= end;
}

// Uses raw SQL to avoid dependency on Prisma client having validFrom/validTo in its schema
async function validateClassConflicts({ classId, schoolYearId, teacherId, roomId, dayOfWeek, startTime, endTime, validFrom, validTo }) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);

  if (roomId) {
    const roomClasses = classId
      ? await prisma.$queryRaw`SELECT id, start_time as "startTime", end_time as "endTime", valid_from as "validFrom", valid_to as "validTo" FROM classes WHERE school_year_id = ${schoolYearId} AND day_of_week = ${dayOfWeek} AND room_id = ${roomId} AND id != ${classId}`
      : await prisma.$queryRaw`SELECT id, start_time as "startTime", end_time as "endTime", valid_from as "validFrom", valid_to as "validTo" FROM classes WHERE school_year_id = ${schoolYearId} AND day_of_week = ${dayOfWeek} AND room_id = ${roomId}`;

    for (const cls of roomClasses) {
      const clsStart = parseTimeToMinutes(cls.startTime);
      const clsEnd = parseTimeToMinutes(cls.endTime);
      if (clsStart !== null && clsEnd !== null && overlaps(start, end, clsStart, clsEnd)) {
        if (dateRangesOverlap(validFrom, validTo, cls.validFrom, cls.validTo)) {
          return 'Chevauchement détecté : la salle est déjà utilisée pour ce créneau sur cette période';
        }
      }
    }
  }

  if (teacherId) {
    const teacherClasses = classId
      ? await prisma.$queryRaw`SELECT id, start_time as "startTime", end_time as "endTime", valid_from as "validFrom", valid_to as "validTo" FROM classes WHERE school_year_id = ${schoolYearId} AND day_of_week = ${dayOfWeek} AND teacher_id = ${teacherId} AND id != ${classId}`
      : await prisma.$queryRaw`SELECT id, start_time as "startTime", end_time as "endTime", valid_from as "validFrom", valid_to as "validTo" FROM classes WHERE school_year_id = ${schoolYearId} AND day_of_week = ${dayOfWeek} AND teacher_id = ${teacherId}`;

    for (const cls of teacherClasses) {
      const clsStart = parseTimeToMinutes(cls.startTime);
      const clsEnd = parseTimeToMinutes(cls.endTime);
      if (clsStart !== null && clsEnd !== null && overlaps(start, end, clsStart, clsEnd)) {
        if (dateRangesOverlap(validFrom, validTo, cls.validFrom, cls.validTo)) {
          return 'Chevauchement détecté : le professeur est déjà affecté à ce créneau sur cette période';
        }
      }
    }
  }

  return null;
}

/**
 * GET /api/admin/users/pending
 */
async function getPendingUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      where: { validationStatus: 'PENDING' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
        emailVerified: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ users });
  } catch (error) {
    console.error('Erreur getPendingUsers:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/admin/users
 */
async function getAllUsers(req, res) {
  try {
    const { status, role, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status) where.validationStatus = status;
    if (role) where.role = role;
    const name = String(req.query.name || '').trim();
    if (name) {
      where.OR = [
        { firstName: { contains: name, mode: 'insensitive' } },
        { lastName: { contains: name, mode: 'insensitive' } },
        { email: { contains: name, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          validationStatus: true,
          emailVerified: true,
          createdAt: true,
          lastLogin: true,
          lockedUntil: true,
          failedLoginAttempts: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
        take: parseInt(limit, 10),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (error) {
    console.error('Erreur getAllUsers:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * PUT /api/admin/users/:id/approve
 */
async function approveUser(req, res) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: req.params.id },
        data: { validationStatus: 'APPROVED' },
      });

      let teacher = null;
      if (user.role === 'PROFESSEUR') {
        teacher = await tx.teacher.findUnique({ where: { userId: user.id } });
        if (!teacher) {
          teacher = await tx.teacher.create({
            data: {
              userId: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              phone: user.phone,
            },
          });
        }
      }

      return { user, teacher };
    });

    await sendAccountApprovedEmail(result.user);
    res.json({
      message: 'Compte validé avec succès',
      user: {
        id: result.user.id,
        email: result.user.email,
        validationStatus: result.user.validationStatus,
      },
    });
  } catch (error) {
    console.error('Erreur approveUser:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * PUT /api/admin/users/:id/reject
 */
async function rejectUser(req, res) {
  try {
    const { reason } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { validationStatus: 'REJECTED' },
    });
    await sendAccountRejectedEmail(user, reason);
    res.json({ message: 'Compte refusé', user: { id: user.id, email: user.email, validationStatus: user.validationStatus } });
  } catch (error) {
    console.error('Erreur rejectUser:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/admin/stats
 */
async function getStats(req, res) {
  try {
    const scope = (req.query.scope || 'current').toLowerCase();

    const activeEnrollmentStatuses = ['PENDING', 'CONFIRMED'];
    const [totalUsers, pendingUsers, totalFamilies, totalStudents, totalEnrollments, schoolYears] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { validationStatus: 'PENDING' } }),
      prisma.family.count(),
      prisma.student.count(),
      prisma.enrollment.count({ where: { status: { in: activeEnrollmentStatuses } } }),
      prisma.schoolYear.findMany({ orderBy: { startDate: 'desc' }, take: 5 }),
    ]);

    // Try to compute counts for the current school year when available
    const currentYear = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });

    let currentEnrollments = null;
    let currentStudents = null;
    let currentFamilies = null;

    const yearWhere = scope === 'current' && currentYear ? { schoolYearId: currentYear.id } : {};
    const [scopeEnrollmentsByStatusRaw, scopeEnrollmentsTestRequired, scopeValidatedEnrollmentsCount] = await Promise.all([
      prisma.enrollment.groupBy({
        by: ['status'],
        where: { ...yearWhere, status: { in: activeEnrollmentStatuses } },
        _count: { status: true },
      }).catch(() => []),
      prisma.enrollment.count({ where: { ...yearWhere, levelValidated: false, status: { in: activeEnrollmentStatuses } } }),
      prisma.enrollment.count({ where: { ...yearWhere, status: 'CONFIRMED', levelValidated: true } }),
    ]);

    const scopeEnrollmentsByStatus = (scopeEnrollmentsByStatusRaw || []).reduce((acc, item) => {
      acc[item.status] = item._count?.status || 0;
      return acc;
    }, {});

    if (currentYear) {
      const yearId = currentYear.id;
      const [totalForYear, studentsForYear, familiesForYear] = await Promise.all([
        prisma.enrollment.count({ where: { schoolYearId: yearId, status: { in: activeEnrollmentStatuses } } }),
        prisma.student.count({ where: { enrollments: { some: { schoolYearId: yearId, status: { in: activeEnrollmentStatuses } } } } }),
        prisma.family.count({ where: { students: { some: { enrollments: { some: { schoolYearId: yearId, status: { in: activeEnrollmentStatuses } } } } } } }),
      ]);

      currentEnrollments = totalForYear;
      currentStudents = studentsForYear;
      currentFamilies = familiesForYear;
    }

    // Determine displayed counts according to requested scope
    let displayEnrollments = totalEnrollments;
    let displayStudents = totalStudents;
    let displayFamilies = totalFamilies;
    let displayLabel = null;

    if (scope === 'current' && currentYear) {
      displayEnrollments = currentEnrollments ?? totalEnrollments;
      displayStudents = currentStudents ?? totalStudents;
      displayFamilies = currentFamilies ?? totalFamilies;
      displayLabel = currentYear.label;
    }

    res.json({
      stats: {
        totalUsers,
        pendingUsers,
        totalFamilies,
        totalStudents,
        totalEnrollments,
        currentSchoolYear: currentYear ? { id: currentYear.id, label: currentYear.label } : null,
        currentEnrollments,
        currentStudents,
        currentFamilies,
        // breakdowns to drive frontend KPI widgets
        enrollmentsByStatus: scopeEnrollmentsByStatus,
        enrollmentsTestRequired: scopeEnrollmentsTestRequired || 0,
        displayCounts: {
          enrollments: displayEnrollments,
          students: displayStudents,
          families: displayFamilies,
        },
        displayScope: scope,
        displayLabel,
        validatedEnrollmentsCount: scopeValidatedEnrollmentsCount || 0,
      },
      schoolYears,
    });
  } catch (error) {
    console.error('Erreur getStats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getRegistrationBlockStatus(req, res) {
  try {
    const status = await getRegistrationBlock();
    res.json(status);
  } catch (error) {
    console.error('Erreur getRegistrationBlockStatus:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateRegistrationBlockStatus(req, res) {
  try {
    const { blocked } = req.body;
    if (typeof blocked !== 'boolean') {
      return res.status(400).json({ error: 'blocked doit être un booléen' });
    }

    const setting = await setRegistrationBlock(blocked);
    res.json({ blocked: String(setting.value).toLowerCase() === 'true' });
  } catch (error) {
    console.error('Erreur updateRegistrationBlockStatus:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Statut d'affichage : statut le plus significatif parmi tous les paiements liés à une inscription
function computePaymentDisplayStatus(pmts) {
  if (!pmts || pmts.length === 0) return null;
  const s = pmts.map(p => String(p.status || '').toUpperCase());
  if (s.some(x => x === 'COMPLETED')) return 'COMPLETED';
  if (s.some(x => x === 'PARTIAL'))   return 'PARTIAL';
  if (s.some(x => x === 'OVERDUE'))   return 'OVERDUE';
  if (s.some(x => x === 'PENDING'))   return 'PENDING';
  if (s.every(x => x === 'CANCELLED')) return 'CANCELLED';
  if (s.some(x => x === 'FAILED'))    return 'FAILED';
  return String(pmts[0].status || '');
}

// Catégorie de filtre (3 valeurs UI)
// PENDING  : aucun paiement COMPLETED + au moins un PENDING ou PARTIAL (en cours)
// COMPLETED: au moins un paiement COMPLETED
// CANCELLED: tous les paiements sont CANCELLED
function computePaymentFilterCategory(pmts) {
  if (!pmts || pmts.length === 0) return null;
  const s = pmts.map(p => String(p.status || '').toUpperCase());
  if (s.some(x => x === 'COMPLETED')) return 'COMPLETED';
  if (s.every(x => x === 'CANCELLED')) return 'CANCELLED';
  if (s.some(x => x === 'PENDING' || x === 'PARTIAL' || x === 'OVERDUE')) return 'PENDING';
  return null;
}

// Mapping rôle → mot-clé pôle (recherche insensible à la casse dans le nom du pôle)
const ROLE_POLE_KEYWORD = {
  RESPONSABLE_POLE_CORAN:      'coran',
  RESPONSABLE_POLE_ARABE:      'arab',
  RESPONSABLE_POLE_SOUTIEN_SCO: 'soutien',
  RESPONSABLE_POLE_SCIENCE_IS:  'science',
};

// Specialties whose lowercase form contains the keyword → included in that pole's scope
const POLE_KEYWORD_SPECIALTIES = {
  arab:    ['Arabe débutant (Niv. 1-2)', 'Arabe intermédiaire (Niv. 3-5)', 'Arabe avancé (Niv. 6-8)'],
  coran:   ['Coran'],
  soutien: ['Soutien scolaire'],
  science: ['Sciences islamiques'],
};

async function getAutoDetectedPoleId(specialties) {
  if (!Array.isArray(specialties) || specialties.length === 0) return null;
  const specialtiesLower = specialties.map((s) => String(s).toLowerCase());
  const allPoles = await prisma.pole.findMany({ select: { id: true, name: true } });
  for (const pole of allPoles) {
    const poleLower = pole.name.toLowerCase();
    const matched = Object.keys(POLE_KEYWORD_SPECIALTIES).some(
      (kw) => poleLower.includes(kw) && specialtiesLower.some((s) => s.includes(kw))
    );
    if (matched) return pole.id;
  }
  return null;
}

async function getScopedPoleId(role) {
  const keyword = ROLE_POLE_KEYWORD[role];
  if (!keyword) return null;
  const pole = await prisma.pole.findFirst({
    where: { name: { contains: keyword, mode: 'insensitive' } },
    select: { id: true },
  });
  return pole?.id || null;
}

/**
 * GET /api/admin/enrollments
 */
async function getEnrollments(req, res) {
  try {
    const { schoolYearId, status, studentName, familyName, paymentStatus, poleId, classId, page = 1, limit = 50, testRequired } = req.query;
    const waitlist = req.query.waitlist === 'true';
    const where = {};
    if (schoolYearId) where.schoolYearId = schoolYearId;
    if (waitlist) {
      where.status = 'PENDING';
      where.isWaitlist = true;
    } else if (status) {
      where.status = status;
    }

    const studentWhere = {};
    if (studentName) {
      studentWhere.OR = [
        { firstName: { contains: studentName, mode: 'insensitive' } },
        { lastName: { contains: studentName, mode: 'insensitive' } },
      ];
    }
    if (familyName) {
      studentWhere.family = {
        familyName: { contains: familyName, mode: 'insensitive' },
      };
    }
    if (Object.keys(studentWhere).length > 0) {
      where.student = studentWhere;
    }

    if (testRequired === 'true') {
      where.levelValidated = false;
    }

    // Forcer le filtre pôle pour les responsables de pôle
    const scopedPoleId = await getScopedPoleId(req.user?.role);
    const effectivePoleId = scopedPoleId || poleId;

    const classWhere = {};
    if (classId) classWhere.id = classId;
    if (effectivePoleId) classWhere.level = { poleId: effectivePoleId };
    if (req.query.provisional === 'true') {
      classWhere.OR = getProvisionalClassFilter().OR;
    }
    if (Object.keys(classWhere).length > 0) {
      where.class = classWhere;
    }

    const studentHealthFormsInclude = schoolYearId
      ? { where: { schoolYearId }, include: { emergencyContacts: true, pickupAuthorizations: true } }
      : { include: { emergencyContacts: true, pickupAuthorizations: true } };

    const studentConsentsInclude = schoolYearId
      ? { where: { schoolYearId, consentType: 'SANITARY_FORM' } }
      : { where: { consentType: 'SANITARY_FORM' } };

    const enrollments = await prisma.enrollment.findMany({
      where,
      include: {
        student: {
          include: {
            family: { include: { user: true } },
            healthForms: studentHealthFormsInclude,
            enrollmentConsents: studentConsentsInclude,
          },
        },
        class: {
          include: {
            level: { include: { pole: true } },
          },
        },
        schoolYear: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Récupère TOUS les paiements liés aux inscriptions (plusieurs paiements possibles par inscription)
    const enrollmentIds = enrollments.map(e => e.id);
    const paymentsByEnrollment = {};
    if (enrollmentIds.length > 0) {
      const payments = await prisma.payment.findMany({
        where: {
          OR: enrollmentIds.map((enrollmentId) => ({
            metadata: { path: ['enrollmentIds'], array_contains: [enrollmentId] },
          })),
        },
        select: { id: true, status: true, metadata: true },
      });
      for (const eid of enrollmentIds) {
        paymentsByEnrollment[eid] = payments.filter(
          p => Array.isArray(p.metadata?.enrollmentIds) && p.metadata.enrollmentIds.includes(eid),
        );
      }
    }

    const enhanced = enrollments.map((e) => {
      const isProvisional = isProvisionalClass(e.class);
      const isWaitlist = e.status === 'PENDING' && e.isWaitlist === true;
      const pmts = paymentsByEnrollment[e.id] || [];
      const paymentStatus = computePaymentDisplayStatus(pmts);
      const paymentFilterCategory = computePaymentFilterCategory(pmts);
      return { ...e, isProvisional, isWaitlist, waitlistOrder: e.waitlistOrder || null, paymentStatus, paymentFilterCategory };
    });

    const waitlistWithoutOrderClassIds = [...new Set(enhanced.filter((e) => e.isWaitlist && !e.waitlistOrder && e.classId).map((e) => e.classId))];
    if (waitlistWithoutOrderClassIds.length > 0) {
      const waitlistEnrollments = await prisma.enrollment.findMany({
        where: {
          status: 'PENDING',
          classId: { in: waitlistWithoutOrderClassIds },
          isWaitlist: true,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, classId: true },
      });
      const waitlistOrderByClass = waitlistEnrollments.reduce((acc, item) => {
        const classGroup = acc[item.classId] || [];
        classGroup.push(item.id);
        acc[item.classId] = classGroup;
        return acc;
      }, {});
      const orders = {};
      Object.entries(waitlistOrderByClass).forEach(([classId, ids]) => {
        ids.forEach((enrollmentId, idx) => {
          orders[`${classId}_${enrollmentId}`] = idx + 1;
        });
      });
      enhanced.forEach((e) => {
        if (e.isWaitlist && e.classId) {
          e.waitlistOrder = orders[`${e.classId}_${e.id}`] || null;
        }
      });
    }

    const normalizedPaymentStatus = String(paymentStatus || '').trim().toUpperCase();
    const filteredEnhanced = normalizedPaymentStatus
      ? enhanced.filter((enrollment) => enrollment.paymentFilterCategory === normalizedPaymentStatus)
      : enhanced;

    const totalFiltered = filteredEnhanced.length;
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.max(parseInt(limit, 10) || 50, 1);
    const paginatedEnhanced = filteredEnhanced.slice((safePage - 1) * safeLimit, safePage * safeLimit);

    res.json({
      enrollments: paginatedEnhanced,
      total: totalFiltered,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(Math.ceil(totalFiltered / safeLimit), 1),
    });
  } catch (error) {
    console.error('Erreur getEnrollments:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function findEnrollmentAndPayment(enrollmentId) {
  const cleanedEnrollmentId = normalizeId(enrollmentId);
  if (!cleanedEnrollmentId) {
    const error = new Error('Inscription introuvable');
    error.status = 404;
    throw error;
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: cleanedEnrollmentId },
    include: {
      student: { include: { family: { include: { user: true } } } },
      schoolYear: true,
    },
  });

  if (!enrollment) {
    const error = new Error('Inscription introuvable');
    error.status = 404;
    throw error;
  }

  const payments = await prisma.payment.findMany({
    where: {
      familyId: enrollment.student.familyId,
      schoolYearId: enrollment.schoolYearId,
    },
    include: {
      transactions: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const payment = payments.find((p) => Array.isArray(p.metadata?.enrollmentIds) && p.metadata.enrollmentIds.includes(cleanedEnrollmentId))
    || payments[0] || null;

  const attachedPayments = payments.filter((p) => Array.isArray(p.metadata?.enrollmentIds) && p.metadata.enrollmentIds.includes(cleanedEnrollmentId));

  return {
    enrollment,
    payment,
    payments: attachedPayments.length > 0 ? attachedPayments : (payment ? [payment] : []),
  };
}

async function findEnrollmentTransaction(enrollmentId, transactionId) {
  const cleanedEnrollmentId = normalizeId(enrollmentId);
  const cleanedTransactionId = normalizeId(transactionId);

  if (!cleanedEnrollmentId) {
    const error = new Error('Inscription introuvable');
    error.status = 404;
    throw error;
  }

  if (!cleanedTransactionId) {
    const error = new Error('Paiement introuvable');
    error.status = 404;
    throw error;
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: cleanedEnrollmentId },
    include: {
      student: { select: { familyId: true } },
      schoolYear: true,
    },
  });

  if (!enrollment) {
    const error = new Error('Inscription introuvable');
    error.status = 404;
    throw error;
  }

  const transaction = await prisma.paymentTransaction.findUnique({
    where: { id: cleanedTransactionId },
    include: { payment: true },
  });

  if (!transaction || !transaction.payment) {
    const error = new Error('Paiement introuvable');
    error.status = 404;
    throw error;
  }

  const enrollmentIds = Array.isArray(transaction.payment.metadata?.enrollmentIds)
    ? transaction.payment.metadata.enrollmentIds
    : [];

  if (enrollmentIds.length > 0) {
    if (!enrollmentIds.includes(cleanedEnrollmentId)) {
      const error = new Error('Paiement introuvable pour cette inscription');
      error.status = 404;
      throw error;
    }
  } else if (transaction.payment.familyId !== enrollment.student.familyId || transaction.payment.schoolYearId !== enrollment.schoolYearId) {
    const error = new Error('Paiement introuvable pour cette inscription');
    error.status = 404;
    throw error;
  }

  return { enrollment, transaction };
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

async function getEnrollmentPayments(req, res) {
  try {
    const { payments } = await findEnrollmentAndPayment(req.params.id);
    const paymentIds = (payments || []).map((p) => p.id);
    const transactions = paymentIds.length > 0 ? await prisma.paymentTransaction.findMany({
      where: { paymentId: { in: paymentIds } },
      orderBy: { createdAt: 'desc' },
      include: {
        payment: {
          select: {
            metadata: true,
            paymentMethod: true,
            provider: true,
          },
        },
      },
    }) : [];

    return res.json({
      payments: transactions.map((tx) => ({
        id: tx.id,
        paymentId: tx.paymentId,
        payerName: tx.payerName,
        method: tx.method,
        paymentMethod: tx.payment?.paymentMethod,
        paymentMetadata: tx.payment?.metadata || {},
        description: tx.description,
        amount: String(tx.amount),
        status: tx.status,
        provider: tx.provider,
        processedAt: tx.processedAt,
        createdAt: tx.createdAt,
      })),
    });
  } catch (error) {
    console.error('Erreur getEnrollmentPayments:', error);
    if (error.status) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateEnrollmentPayment(req, res) {
  try {
    const { payerName, date, method, status, comment, amount } = req.body;
    const { enrollment, transaction } = await findEnrollmentTransaction(req.params.id, req.params.paymentId);

    if (String(transaction.status) === 'SUCCEEDED') {
      return res.status(403).json({ error: 'Impossible de modifier un paiement validé.' });
    }
    const updateData = {};

    if (payerName !== undefined) {
      updateData.payerName = String(payerName || '').trim() || null;
    }

    if (method !== undefined) {
      const allowedMethods = ['CHEQUE', 'ESPECES', 'CB', 'STRIPE', 'VIREMENT', 'PRELEVEMENT_BANCAIRE'];
      if (!allowedMethods.includes(method)) {
        return res.status(400).json({ error: 'Moyen de paiement invalide' });
      }
      updateData.method = method;
    }

    if (status !== undefined) {
      const allowedStatuses = ['validé', 'non validé', 'annulé'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Statut de paiement invalide' });
      }
      updateData.status = status === 'validé' ? 'SUCCEEDED' : status === 'annulé' ? 'CANCELLED' : 'INITIATED';

      if (updateData.status === 'SUCCEEDED') {
        const unvalidatedActiveCount = await prisma.enrollment.count({
          where: {
            student: { familyId: enrollment.student.familyId },
            schoolYearId: enrollment.schoolYearId,
            status: { in: ['PENDING', 'CONFIRMED'] },
            levelValidated: false,
          },
        });
        if (unvalidatedActiveCount > 0) {
          return res.status(400).json({ error: "Au moins une inscription active de la famille n'a pas le niveau validé — impossible de valider le paiement." });
        }
      }
    }

    if (amount !== undefined) {
      const parsedAmount = amount ? new Prisma.Decimal(amount) : null;
      if (!parsedAmount || parsedAmount.lte(0)) {
        return res.status(400).json({ error: 'Montant de paiement invalide' });
      }
      updateData.amount = parsedAmount;
    }

    if (date !== undefined) {
      const txDate = date ? new Date(date) : null;
      if (!txDate || Number.isNaN(txDate.getTime())) {
        return res.status(400).json({ error: 'Date de paiement invalide' });
      }
      updateData.processedAt = txDate;
    }

    if (comment !== undefined) {
      updateData.description = comment || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    const updatedTransaction = await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: updateData,
    });

    await recalculatePaymentAggregate(transaction.paymentId);

    // If this transaction is a Stripe transaction and has just been marked succeeded,
    // ensure the Stripe payment intent is captured / finalized.
    if (String(updatedTransaction.provider) === 'STRIPE') {
      console.log(`[ADMIN STRIPE] Transaction Stripe ${updatedTransaction.id} avec statut ${updatedTransaction.status}`);
      if (String(updatedTransaction.status) === 'SUCCEEDED') {
        console.log(`[ADMIN STRIPE] Tentative de finalisation pour paiement ${updatedTransaction.paymentId}`);
        try {
          await finalizeStripePayment(updatedTransaction.paymentId, { force: true });
          console.log(`[ADMIN STRIPE] ✅ Finalisation réussie pour paiement ${updatedTransaction.paymentId}`);
        } catch (captureErr) {
          console.error(`[ADMIN STRIPE] Erreur lors de la finalisation Stripe pour le paiement ${updatedTransaction.paymentId}:`, captureErr);
          await prisma.paymentTransaction.update({
            where: { id: updatedTransaction.id },
            data: { status: 'INITIATED' },
          });
          await recalculatePaymentAggregate(updatedTransaction.paymentId);
          return res.status(500).json({ error: `Impossible de finaliser le paiement Stripe : ${captureErr.message}` });
        }
      } else if (String(updatedTransaction.status) === 'CANCELLED') {
        try {
          await cancelStripePayment(updatedTransaction.paymentId);
        } catch (cancelErr) {
          console.error(`Erreur lors de l'annulation Stripe pour le paiement ${updatedTransaction.paymentId}:`, cancelErr);
          await prisma.paymentTransaction.update({
            where: { id: updatedTransaction.id },
            data: { status: 'INITIATED' },
          });
          await recalculatePaymentAggregate(updatedTransaction.paymentId);
          return res.status(500).json({ error: `Impossible d'annuler le paiement Stripe : ${cancelErr.message}` });
        }
      }
    }

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
  } catch (error) {
    console.error('Erreur updateEnrollmentPayment:', error);
    if (error.status) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteEnrollmentPayment(req, res) {
  try {
    const { transaction } = await findEnrollmentTransaction(req.params.id, req.params.paymentId);

    if (String(transaction.status) === 'SUCCEEDED') {
      return res.status(403).json({ error: 'Impossible de supprimer un paiement validé.' });
    }

    await prisma.paymentTransaction.delete({ where: { id: transaction.id } });
    await recalculatePaymentAggregate(transaction.paymentId);
    return res.json({ message: 'Paiement supprimé avec succès' });
  } catch (error) {
    console.error('Erreur deleteEnrollmentPayment:', error);
    if (error.status) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function downloadEnrollmentPaymentReceipt(req, res) {
  try {
    const { id: enrollmentId, paymentId: transactionId } = req.params;
    const { enrollment, transaction } = await findEnrollmentTransaction(enrollmentId, transactionId);
    const payment = await prisma.payment.findUnique({
      where: { id: transaction.paymentId },
      include: {
        family: { include: { user: true } },
        transactions: { orderBy: { createdAt: 'desc' } },
        schoolYear: true,
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Paiement introuvable' });
    }

    let familyWithChildren = payment.family;
    let familyChildren = [];
    try {
      familyChildren = await prisma.student.findMany({ where: { familyId: payment.familyId }, select: { id: true, firstName: true, lastName: true, dateOfBirth: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
      familyWithChildren = { ...payment.family, children: familyChildren };
    } catch (err) {
      console.warn('Impossible de récupérer les enfants pour le reçu (adminController):', err?.message || err);
    }

    const familyStudentMap = new Map(
      familyChildren
        .map((student) => [normalizeId(student.id), student])
        .filter(([studentId]) => Boolean(studentId)),
    );

    let enrollmentRows = await prisma.enrollment.findMany({
      where: {
        student: { familyId: payment.familyId },
        schoolYearId: payment.schoolYearId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        isWaitlist: false,
      },
      include: {
        class: { include: { level: { include: { pole: true } } } },
        student: true,
      },
      orderBy: [{ student: { lastName: 'asc' } }, { createdAt: 'asc' }],
    });

    const missingStudentIds = [...new Set(
      enrollmentRows
        .filter((row) => !row.student || (!row.student.firstName && !row.student.lastName))
        .map((row) => normalizeId(row.studentId))
        .filter(Boolean),
    )];

    if (missingStudentIds.length > 0) {
      const missingStudents = await prisma.student.findMany({ where: { id: { in: missingStudentIds } } });
      missingStudents.forEach((student) => {
        const studentId = normalizeId(student.id);
        if (studentId) {
          familyStudentMap.set(studentId, student);
        }
      });
    }

    enrollmentRows = enrollmentRows.map((row) => {
      const studentId = normalizeId(row.studentId);
      const fallbackStudent = familyStudentMap.get(studentId);
      const firstName = normalizeId(row.student?.firstName) || normalizeId(fallbackStudent?.firstName);
      const lastName = normalizeId(row.student?.lastName) || normalizeId(fallbackStudent?.lastName);
      return {
        ...row,
        student: {
          ...(row.student || fallbackStudent || {}),
          firstName: firstName || '',
          lastName: lastName || '',
        },
      };
    });

    const familyPayments = await prisma.payment.findMany({
      where: {
        familyId: payment.familyId,
        schoolYearId: payment.schoolYearId,
        status: { not: 'CANCELLED' },
      },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
        paymentPlan: true,
        installments: { orderBy: { dueDate: 'asc' } },
      },
    });

    const familyTransactionsForReceipt = familyPayments
      .flatMap((familyPayment) => (familyPayment.transactions || []).map((tx) => {
        const paymentMetadata = {
          ...((familyPayment.paymentPlan?.metadata && typeof familyPayment.paymentPlan.metadata === 'object') ? familyPayment.paymentPlan.metadata : {}),
          ...((familyPayment.metadata && typeof familyPayment.metadata === 'object') ? familyPayment.metadata : {}),
        };
        const installments = Array.isArray(familyPayment.installments) ? familyPayment.installments : [];
        const firstInstallment = installments.length > 0 ? installments[0] : null;
        const paymentMethod = familyPayment.paymentMethod || paymentMetadata.paymentMethod || paymentMetadata.checkoutMethod || paymentMetadata.paymentPlanType || familyPayment.paymentPlan?.type || null;
        const paymentInstallmentsCount = familyPayment.numberOfInstallments || familyPayment.paymentPlan?.installmentsCount || paymentMetadata.numberOfInstallments || paymentMetadata.bankDebitInstallmentsCount || paymentMetadata.chequeInstallmentsCount || installments.length || null;

        return {
          ...tx,
          paymentMetadata,
          paymentMethod,
          paymentInstallmentsCount,
          scheduleDay: familyPayment.paymentPlan?.scheduleDay || paymentMetadata.bankDebitDay || paymentMetadata.chequeDepositDay || null,
          firstPaymentDate: paymentMetadata.firstPaymentDate || paymentMetadata.chequeFirstPaymentDate || firstInstallment?.dueDate || null,
        };
      }))
      .filter((tx) => String(tx.status || '').toUpperCase() === 'SUCCEEDED');

    // Generate invoice-like PDF file using shared utility
    const invoiceResult = await generateInvoicePDF(
      payment,
      familyWithChildren,
      enrollmentRows,
      familyTransactionsForReceipt,
    );
    if (!invoiceResult) {
      return res.status(500).json({ error: 'Impossible de générer le reçu' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceResult.filename}"`);
    return res.sendFile(invoiceResult.filePath);
  } catch (error) {
    console.error('Erreur downloadEnrollmentPaymentReceipt:', error);
    if (error.status) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createEnrollmentPayment(req, res) {
  try {
    const { payerName, date, method, status, comment, amount, bankDebitIban, bankDebitSwift, numberOfInstallments, firstPaymentDate, scheduleDay, ribDocument, applyToAllActiveEnrollments } = req.body;
    const parsedAmount = amount ? new Prisma.Decimal(amount) : null;
    if (!parsedAmount || parsedAmount.lte(0)) {
      return res.status(400).json({ error: 'Montant de paiement invalide' });
    }
    const allowedMethods = ['CHEQUE', 'ESPECES', 'CB', 'STRIPE', 'VIREMENT', 'PRELEVEMENT_BANCAIRE'];
    if (!allowedMethods.includes(method)) {
      return res.status(400).json({ error: 'Moyen de paiement invalide' });
    }
    const allowedStatuses = ['validé', 'non validé', 'annulé'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Statut de paiement invalide' });
    }
    const txDate = date ? new Date(date) : new Date();
    if (Number.isNaN(txDate.getTime())) {
      return res.status(400).json({ error: 'Date de paiement invalide' });
    }

    const { enrollment, payment } = await findEnrollmentAndPayment(req.params.id);
    let targetPayment = payment;
    const transactionStatus = status === 'validé' ? 'SUCCEEDED' : status === 'annulé' ? 'CANCELLED' : 'INITIATED';
    const shouldApplyToAllActiveEnrollments = applyToAllActiveEnrollments === true;

    const activeEnrollmentStatuses = ['PENDING', 'CONFIRMED'];
    let enrollmentIdsToAssociate = [enrollment.id];
    if (shouldApplyToAllActiveEnrollments) {
      const activeFamilyEnrollments = await prisma.enrollment.findMany({
        where: {
          student: { familyId: enrollment.student.familyId },
          schoolYearId: enrollment.schoolYearId,
          status: { in: activeEnrollmentStatuses },
        },
        select: { id: true },
      });
      enrollmentIdsToAssociate = activeFamilyEnrollments.map((item) => item.id);
      if (!enrollmentIdsToAssociate.includes(enrollment.id)) {
        enrollmentIdsToAssociate.push(enrollment.id);
      }
    }
    const defaultPayer = [enrollment.student.family.user?.firstName, enrollment.student.family.user?.lastName]
      .filter(Boolean)
      .join(' ') || enrollment.student.family.familyName;
    const normalizedPayerName = payerName && String(payerName).trim()
      ? String(payerName).trim()
      : (['CHEQUE', 'ESPECES'].includes(method) ? defaultPayer : null);
    if (!normalizedPayerName && !['VIREMENT', 'PRELEVEMENT_BANCAIRE', 'CB', 'STRIPE'].includes(method)) {
      return res.status(400).json({ error: 'Nom du payeur requis' });
    }

    // Build metadata for prelevement and cheque
    const paymentMetadata = {};
    if (['VIREMENT', 'PRELEVEMENT_BANCAIRE'].includes(method)) {
      if (bankDebitIban) paymentMetadata.bankDebitIban = String(bankDebitIban).trim();
      if (bankDebitSwift) paymentMetadata.bankDebitSwift = String(bankDebitSwift).trim();
      if (numberOfInstallments !== undefined) paymentMetadata.bankDebitInstallmentsCount = Number(numberOfInstallments) || 1;
      if (firstPaymentDate) paymentMetadata.firstPaymentDate = String(firstPaymentDate).trim();
      if (scheduleDay !== undefined) paymentMetadata.bankDebitDay = Number(scheduleDay) || 10;
      if (ribDocument?.base64) {
        paymentMetadata.bankDebitRibUrl = saveBase64File(ribDocument.base64, 'ribs', ribDocument.name || 'rib.pdf');
        paymentMetadata.bankDebitRibFilename = String(ribDocument.name || 'RIB');
      }
    } else if (method === 'CHEQUE') {
      if (numberOfInstallments !== undefined) paymentMetadata.chequeInstallmentsCount = Number(numberOfInstallments) || 1;
      if (firstPaymentDate) paymentMetadata.chequeFirstPaymentDate = String(firstPaymentDate).trim();
      if (scheduleDay !== undefined) paymentMetadata.chequeDepositDay = Number(scheduleDay) || 10;
    }

    const paymentData = {
      paymentMethod: method,
      provider: ['VIREMENT', 'PRELEVEMENT_BANCAIRE'].includes(method) ? 'OFFLINE' : 'OFFLINE',
    };

    if (!targetPayment) {
      targetPayment = await prisma.payment.create({
        data: {
          familyId: enrollment.student.familyId,
          schoolYearId: enrollment.schoolYearId,
          totalAmount: parsedAmount,
          paidAmount: transactionStatus === 'SUCCEEDED' ? parsedAmount : new Prisma.Decimal(0),
          paymentMethod: method,
          provider: 'OFFLINE',
          numberOfInstallments: ['VIREMENT', 'PRELEVEMENT_BANCAIRE'].includes(method) ? (Number(numberOfInstallments) || 1) : 1,
          status: transactionStatus === 'SUCCEEDED' ? 'COMPLETED' : 'PENDING',
          metadata: { enrollmentIds: enrollmentIdsToAssociate, ...paymentMetadata },
        },
      });
    } else {
      const enrollmentIds = Array.isArray(targetPayment.metadata?.enrollmentIds)
        ? [...new Set([...targetPayment.metadata.enrollmentIds, ...enrollmentIdsToAssociate])]
        : enrollmentIdsToAssociate;
      const updateData = {
        ...paymentData,
        metadata: { ...targetPayment.metadata, enrollmentIds, ...paymentMetadata },
      };
      if (transactionStatus === 'SUCCEEDED') {
        const unvalidatedActiveCount = await prisma.enrollment.count({
          where: {
            student: { familyId: enrollment.student.familyId },
            schoolYearId: enrollment.schoolYearId,
            status: { in: ['PENDING', 'CONFIRMED'] },
            levelValidated: false,
          },
        });
        if (unvalidatedActiveCount > 0) {
          return res.status(400).json({ error: "Au moins une inscription active de la famille n'a pas le niveau validé — impossible de marquer ce paiement comme validé." });
        }

        const newPaidAmount = new Prisma.Decimal(targetPayment.paidAmount).plus(parsedAmount);
        updateData.paidAmount = newPaidAmount;
        updateData.status = newPaidAmount.greaterThanOrEqualTo(targetPayment.totalAmount) ? 'COMPLETED' : 'PARTIAL';
      }
      targetPayment = await prisma.payment.update({
        where: { id: targetPayment.id },
        data: updateData,
      });
    }

    const transaction = await prisma.paymentTransaction.create({
      data: {
        paymentId: targetPayment.id,
        provider: 'OFFLINE',
        method,
        amount: parsedAmount,
        status: transactionStatus,
        payerName: normalizedPayerName || 'Non spécifié',
        description: comment || 'Paiement ajouté par admin',
        recordedById: req.user.id,
        processedAt: txDate,
        createdAt: txDate,
      },
    });

    return res.status(201).json({ transaction, payment: targetPayment });
  } catch (error) {
    console.error('Erreur createEnrollmentPayment:', error);
    if (error.status) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function exportEnrollments(req, res) {
  try {
    const { schoolYearId, status, studentName, poleId, classId, waitlist, provisional } = req.body || {};
    const where = {};
    if (schoolYearId) where.schoolYearId = schoolYearId;
    if (waitlist) {
      where.status = 'PENDING';
      where.isWaitlist = true;
    } else if (status) {
      where.status = status;
    }
    if (studentName) {
      where.student = {
        OR: [
          { firstName: { contains: studentName, mode: 'insensitive' } },
          { lastName: { contains: studentName, mode: 'insensitive' } },
        ],
      };
    }

    const classWhere = {};
    if (classId) classWhere.id = classId;
    if (poleId) classWhere.level = { poleId };
    if (waitlist) {
      classWhere.status = 'FULL';
    }
    if (provisional === true || provisional === 'true') {
      classWhere.OR = getProvisionalClassFilter().OR;
    }
    if (Object.keys(classWhere).length > 0) {
      where.class = classWhere;
    }

    const enrollments = await prisma.enrollment.findMany({
      where,
      include: {
        student: {
          include: {
            family: { include: { user: true } },
          },
        },
        class: {
          include: {
            level: { include: { pole: true } },
          },
        },
        schoolYear: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inscriptions');
    worksheet.columns = [
      { header: 'Réf. inscription', key: 'registrationCode', width: 20 },
      { header: 'Élève', key: 'studentName', width: 28 },
      { header: 'Famille', key: 'familyName', width: 24 },
      { header: 'Pôle', key: 'pole', width: 18 },
      { header: 'Niveau', key: 'level', width: 18 },
      { header: 'Créneau', key: 'schedule', width: 22 },
      { header: 'Statut', key: 'status', width: 16 },
      { header: 'Liste d\'attente', key: 'waitlist', width: 16 },
      { header: 'Commentaire', key: 'comment', width: 30 },
    ];

    const rows = enrollments.map((enrollment) => {
      const studentName = `${enrollment.student.lastName} ${enrollment.student.firstName}`.trim();
      const familyName = enrollment.student.family?.familyName || '';
      const pole = enrollment.class?.level?.pole?.name || '';
      const level = enrollment.class?.level?.name || '';
      const schedule = enrollment.class ? `${enrollment.class.dayOfWeek} ${enrollment.class.startTime}-${enrollment.class.endTime}` : '';
      const isWaitlist = enrollment.status === 'PENDING' && enrollment.isWaitlist === true;
      return {
        registrationCode: enrollment.registrationCode || '',
        studentName,
        familyName,
        pole,
        level,
        schedule,
        status: enrollment.status,
        waitlist: isWaitlist ? 'Oui' : 'Non',
        comment: enrollment.comment || '',
      };
    });

    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="inscriptions-${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Erreur exportEnrollments:', error);
    res.status(500).json({ error: 'Erreur lors de l’export des inscriptions' });
  }
}

function formatClassLabel(cls) {
  if (!cls) return null;
  const poleName = cls.level?.pole?.name;
  const levelName = cls.level?.name;
  return [poleName, levelName].filter(Boolean).join(' - ');
}

async function getStudentAcademicRecord(req, res) {
  try {
    const { studentId } = req.params;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId est requis' });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        enrollments: {
          where: { status: 'CONFIRMED' },
          include: {
            class: {
              include: {
                level: { include: { pole: true } },
                schoolYear: true,
              },
            },
          },
        },
      },
    });

    if (!student) {
      return res.status(404).json({ error: 'Élève introuvable' });
    }

    const classIds = student.enrollments.map((enrollment) => enrollment.classId).filter(Boolean);

    const absences = classIds.length > 0
      ? await prisma.evaluation.findMany({
          where: {
            studentId,
            status: 'missing',
            lesson: { classId: { in: classIds } },
          },
          include: {
            lesson: {
              include: {
                class: {
                  include: {
                    level: { include: { pole: true } },
                  },
                },
              },
            },
          },
          orderBy: [{ lesson: { date: 'desc' } }],
        })
      : [];

    const notes = classIds.length > 0
      ? await prisma.evaluation.findMany({
          where: {
            studentId,
            NOT: { status: 'missing' },
            lesson: { classId: { in: classIds } },
          },
          include: {
            lesson: {
              include: {
                class: {
                  include: {
                    level: { include: { pole: true } },
                  },
                },
              },
            },
          },
          orderBy: [{ lesson: { date: 'desc' } }],
        })
      : [];

    const formattedAbsences = absences.map((evaluation) => ({
      id: evaluation.id,
      date: evaluation.lesson?.date || null,
      lessonTitle: evaluation.lesson?.title || null,
      classLabel: formatClassLabel(evaluation.lesson?.class),
      status: evaluation.status,
      justification: evaluation.justification,
      grade: evaluation.grade,
      appreciation: evaluation.appreciation,
    }));

    const formattedNotes = notes
      .filter((evaluation) => evaluation.grade !== null || evaluation.appreciation !== null)
      .map((evaluation) => ({
        id: evaluation.id,
        date: evaluation.lesson?.date || null,
        lessonTitle: evaluation.lesson?.title || null,
        classLabel: formatClassLabel(evaluation.lesson?.class),
        status: evaluation.status,
        grade: evaluation.grade,
        appreciation: evaluation.appreciation,
      }));

    return res.json({
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        photoUrl: student.photoUrl || null,
      },
      absences: formattedAbsences,
      notes: formattedNotes,
    });
  } catch (error) {
    console.error('Erreur getStudentAcademicRecord:', error);
    res.status(500).json({ error: 'Impossible de charger la fiche élève' });
  }
}

async function updateEnrollment(req, res) {
  try {
    const { id } = req.params;
    const { status, classId, schoolYearId, student, family, healthForm, comment, levelValidated, waitlistOrder, isWaitlist } = req.body;
    const allowedStatuses = ['PENDING', 'CONFIRMED', 'CANCELLED', 'ARCHIVED'];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Statut d’inscription invalide' });
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      include: {
        class: true,
        student: { include: { family: true, healthForms: true } },
      },
    });
    if (!enrollment) {
      return res.status(404).json({ error: 'Inscription introuvable' });
    }

    const currentStatus = enrollment.status;
    const targetStatus = status || currentStatus;
    const classChanged = classId && classId !== enrollment.classId;
    const enrollmentUpdates = {};

    if (currentStatus !== 'CONFIRMED' && targetStatus === 'CONFIRMED') {
      // Vérifier que le niveau est validé
      if (!enrollment.levelValidated && !levelValidated) {
        return res.status(400).json({ error: 'Impossible de confirmer l’inscription : le niveau doit être validé.' });
      }
      // Vérifier qu'au moins un paiement lié est validé
      const attachedPayments = await prisma.payment.findMany({
        where: {
          familyId: enrollment.student.familyId,
          schoolYearId: enrollment.schoolYearId,
        },
        include: { transactions: true },
        orderBy: { createdAt: 'desc' },
      });

      const enrollmentPayments = attachedPayments.filter((payment) =>
        Array.isArray(payment.metadata?.enrollmentIds) && payment.metadata.enrollmentIds.includes(enrollment.id)
      );

      const hasValidatedPayment = enrollmentPayments.some((payment) =>
        payment.transactions.some((tx) => String(tx.status) === 'SUCCEEDED')
      );

      if (!hasValidatedPayment) {
        return res.status(400).json({ error: 'Impossible de confirmer l’inscription : au moins un paiement lié doit être validé.' });
      }
    }

    if (status) {
      enrollmentUpdates.status = status;
      if (status === 'CONFIRMED') {
        enrollmentUpdates.confirmedAt = new Date();
        enrollmentUpdates.cancelledAt = null;
      } else if (status === 'CANCELLED') {
        enrollmentUpdates.cancelledAt = new Date();
        enrollmentUpdates.confirmedAt = null;
      } else {
        enrollmentUpdates.confirmedAt = null;
        enrollmentUpdates.cancelledAt = null;
      }
    }

    if (classChanged) {
      enrollmentUpdates.classId = classId;
    }
    if (schoolYearId && schoolYearId !== enrollment.schoolYearId) {
      enrollmentUpdates.schoolYearId = schoolYearId;
    }
    if (comment !== undefined) {
      enrollmentUpdates.comment = comment;
    }
    if (isWaitlist !== undefined) {
      if (typeof isWaitlist !== 'boolean') {
        return res.status(400).json({ error: 'isWaitlist doit être un booléen' });
      }
      enrollmentUpdates.isWaitlist = isWaitlist;
      if (!isWaitlist && waitlistOrder === undefined) {
        enrollmentUpdates.waitlistOrder = null;
      }
    }
    if (waitlistOrder !== undefined) {
      if (waitlistOrder === null || waitlistOrder === '') {
        enrollmentUpdates.waitlistOrder = null;
        enrollmentUpdates.isWaitlist = false;
      } else {
        const parsedWaitlistOrder = Number(waitlistOrder);
        if (!Number.isInteger(parsedWaitlistOrder) || parsedWaitlistOrder < 1) {
          return res.status(400).json({ error: 'waitlistOrder doit être un entier positif' });
        }
        enrollmentUpdates.waitlistOrder = parsedWaitlistOrder;
        enrollmentUpdates.isWaitlist = true;
      }
    }
    if (levelValidated !== undefined) {
      if (typeof levelValidated !== 'boolean') {
        return res.status(400).json({ error: 'levelValidated doit être un booléen' });
      }
      enrollmentUpdates.levelValidated = levelValidated;
    }

    const studentUpdates = {};
    if (student) {
      if (student.firstName !== undefined) studentUpdates.firstName = student.firstName;
      if (student.lastName !== undefined) studentUpdates.lastName = student.lastName;
      if (student.dateOfBirth !== undefined) {
        studentUpdates.dateOfBirth = student.dateOfBirth ? new Date(student.dateOfBirth) : null;
      }
      if (student.gender !== undefined) studentUpdates.gender = student.gender;
      if (student.allergies !== undefined) studentUpdates.allergies = student.allergies;
      if (student.currentTreatments !== undefined) studentUpdates.currentTreatments = student.currentTreatments;
      if (student.isReturningStudent !== undefined) studentUpdates.isReturningStudent = Boolean(student.isReturningStudent);
      if (student.photoBase64 !== undefined) {
        studentUpdates.photoUrl = student.photoBase64 ? savePhotoBase64(student.photoBase64) : null;
      }
    }

    const familyUpdates = {};
    let userEmailUpdate = null;
    if (family) {
      if (family.familyName !== undefined) familyUpdates.familyName = family.familyName;
      if (family.addressLine1 !== undefined) familyUpdates.addressLine1 = family.addressLine1;
      if (family.addressLine2 !== undefined) familyUpdates.addressLine2 = family.addressLine2;
      if (family.postalCode !== undefined) familyUpdates.postalCode = family.postalCode;
      if (family.city !== undefined) familyUpdates.city = family.city;
      if (family.country !== undefined) familyUpdates.country = family.country;
      if (family.phonePrimary !== undefined) familyUpdates.phonePrimary = family.phonePrimary;
      if (family.phoneSecondary !== undefined) familyUpdates.phoneSecondary = family.phoneSecondary;
      if (family.email !== undefined && family.email.trim()) {
        const newEmail = family.email.trim().toLowerCase();
        const familyRecord = await prisma.family.findUnique({
          where: { id: enrollment.student.familyId },
          include: { user: { select: { id: true, email: true } } },
        });
        if (familyRecord?.user && familyRecord.user.email !== newEmail) {
          const conflict = await prisma.user.findUnique({ where: { email: newEmail } });
          if (conflict) {
            return res.status(409).json({ error: 'Cette adresse email est déjà utilisée par un autre compte' });
          }
          userEmailUpdate = { userId: familyRecord.user.id, email: newEmail };
        }
      }
    }

    const targetSchoolYearId = schoolYearId || enrollment.schoolYearId;

    let newClass = null;
    if (classChanged) {
      newClass = await prisma.class.findUnique({ where: { id: classId } });
      if (!newClass) {
        return res.status(404).json({ error: 'Classe introuvable' });
      }
      if (newClass.status === 'CLOSED') {
        return res.status(400).json({ error: 'Impossible d’affecter une inscription à une classe fermée' });
      }
      if (newClass.schoolYearId !== targetSchoolYearId) {
        return res.status(400).json({ error: 'La classe sélectionnée ne correspond pas à l’année scolaire choisie' });
      }
    } else if (schoolYearId && enrollment.class?.schoolYearId !== schoolYearId) {
      return res.status(400).json({ error: 'La classe actuelle ne correspond pas à l’année scolaire choisie' });
    }

    const classTransactions = [];
    const activeEnrollmentStatuses = ['PENDING', 'CONFIRMED'];
    if (classChanged) {
      const enrollmentWillBeActive = activeEnrollmentStatuses.includes(targetStatus);
      const oldEnrollmentWasCounted = activeEnrollmentStatuses.includes(currentStatus) && enrollment.isWaitlist !== true;

      if (oldEnrollmentWasCounted && enrollment.classId) {
        classTransactions.push({
          where: { id: enrollment.classId },
          data: {
            enrolledCount: { decrement: 1 },
            status: 'OPEN',
          },
        });
      }

      if (enrollmentWillBeActive) {
        const destinationActiveEnrollmentCount = await prisma.enrollment.count({
          where: {
            classId: newClass.id,
            status: { in: activeEnrollmentStatuses },
            id: { not: id },
          },
        });

        const computedWaitlistOrder = (destinationActiveEnrollmentCount + 1) - newClass.capacity;
        const computedIsWaitlist = computedWaitlistOrder > 0;

        enrollmentUpdates.isWaitlist = computedIsWaitlist;
        enrollmentUpdates.waitlistOrder = computedIsWaitlist ? computedWaitlistOrder : null;

        if (!computedIsWaitlist) {
          classTransactions.push({
            where: { id: newClass.id },
            data: {
              enrolledCount: { increment: 1 },
              status: destinationActiveEnrollmentCount + 1 >= newClass.capacity ? 'FULL' : 'OPEN',
            },
          });
        }
      } else {
        enrollmentUpdates.isWaitlist = false;
        enrollmentUpdates.waitlistOrder = null;
      }
    } else {
      if (currentStatus !== 'CONFIRMED' && targetStatus === 'CONFIRMED') {
        const targetClass = enrollment.class;
        const activeEnrollmentCount = await prisma.enrollment.count({
          where: {
            classId: enrollment.classId,
            status: { in: activeEnrollmentStatuses },
            id: { not: id },
          },
        });
        if (activeEnrollmentCount >= targetClass.capacity) {
          return res.status(400).json({ error: 'Impossible de confirmer l’inscription : la classe est complète' });
        }
        classTransactions.push({
          where: { id: enrollment.classId },
          data: {
            enrolledCount: { increment: 1 },
            status: activeEnrollmentCount + 1 >= targetClass.capacity ? 'FULL' : 'OPEN',
          },
        });
      } else if (currentStatus === 'CONFIRMED' && targetStatus !== 'CONFIRMED') {
        classTransactions.push({
          where: { id: enrollment.classId },
          data: {
            enrolledCount: { decrement: 1 },
            status: 'OPEN',
          },
        });
      }
    }

    const healthFormData = healthForm || null;
    let healthFormAction = null;
    let healthFormId = null;

    if (healthFormData) {
      const existingHealthForm = await prisma.studentHealthForm.findFirst({
        where: { studentId: enrollment.studentId, schoolYearId: targetSchoolYearId },
      });

      const signedAt = healthFormData.signedAt ? new Date(healthFormData.signedAt) : null;
      if (healthFormData.signedAt && Number.isNaN(signedAt.getTime())) {
        return res.status(400).json({ error: 'Date de signature de la fiche sanitaire invalide' });
      }

      const healthFormPayload = {
        studentId: enrollment.studentId,
        schoolYearId: targetSchoolYearId,
        hasChronicDisease: Boolean(healthFormData.hasChronicDisease),
        chronicDiseaseDetails: healthFormData.chronicDiseaseDetails || null,
        hasMedicalTreatment: Boolean(healthFormData.hasMedicalTreatment),
        medicalTreatmentDetails: healthFormData.medicalTreatmentDetails || null,
        hasAllergy: Boolean(healthFormData.hasAllergy),
        allergyDetails: healthFormData.allergyDetails || null,
        hasDisability: Boolean(healthFormData.hasDisability),
        disabilityDetails: healthFormData.disabilityDetails || null,
        otherUsefulHealthInfo: healthFormData.otherUsefulHealthInfo || null,
        canLeaveAloneAfterClass: healthFormData.canLeaveAloneAfterClass,
        confidentialityAccepted: Boolean(healthFormData.confidentialityAccepted),
        noMedicationPolicyAccepted: Boolean(healthFormData.noMedicationPolicyAccepted),
      };

      const emergencyContactsData = Array.isArray(healthFormData.emergencyContacts)
        ? healthFormData.emergencyContacts
          .filter((contact) => contact.firstName?.trim() && contact.lastName?.trim() && contact.phone?.trim())
          .map((contact) => ({
            firstName: contact.firstName.trim(),
            lastName: contact.lastName.trim(),
            relationship: contact.relationship?.trim() || 'Proche',
            phone: contact.phone.trim(),
          }))
        : [];

      const pickupAuthorizedPersonsData = Array.isArray(healthFormData.pickupAuthorizedPersons)
        ? healthFormData.pickupAuthorizedPersons
          .filter((person) => person.fullName?.trim() && person.phone?.trim())
          .map((person) => ({
            fullName: person.fullName.trim(),
            relationship: person.relationship?.trim() || 'Proche',
            phone: person.phone.trim(),
          }))
        : [];

      if (existingHealthForm) {
        healthFormAction = async () => {
          await prisma.studentHealthForm.update({
            where: { id: existingHealthForm.id },
            data: healthFormPayload,
          });
          await prisma.emergencyContact.deleteMany({ where: { healthFormId: existingHealthForm.id } });
          await prisma.pickupAuthorization.deleteMany({ where: { healthFormId: existingHealthForm.id } });
          if (emergencyContactsData.length > 0) {
            await prisma.emergencyContact.createMany({ data: emergencyContactsData.map((contact) => ({ ...contact, healthFormId: existingHealthForm.id })) });
          }
          if (pickupAuthorizedPersonsData.length > 0) {
            await prisma.pickupAuthorization.createMany({ data: pickupAuthorizedPersonsData.map((person) => ({ ...person, healthFormId: existingHealthForm.id })) });
          }
        };
      } else {
        healthFormAction = async () => {
          const created = await prisma.studentHealthForm.create({
            data: healthFormPayload,
          });
          if (emergencyContactsData.length > 0) {
            await prisma.emergencyContact.createMany({ data: emergencyContactsData.map((contact) => ({ ...contact, healthFormId: created.id })) });
          }
          if (pickupAuthorizedPersonsData.length > 0) {
            await prisma.pickupAuthorization.createMany({ data: pickupAuthorizedPersonsData.map((person) => ({ ...person, healthFormId: created.id })) });
          }
        };
      }
    }

    const actions = [];
    if (Object.keys(studentUpdates).length > 0) {
      actions.push(prisma.student.update({ where: { id: enrollment.studentId }, data: studentUpdates }));
    }
    if (Object.keys(familyUpdates).length > 0) {
      actions.push(prisma.family.update({ where: { id: enrollment.student.familyId }, data: familyUpdates }));
    }
    if (userEmailUpdate) {
      actions.push(prisma.user.update({ where: { id: userEmailUpdate.userId }, data: { email: userEmailUpdate.email } }));
    }
    if (Object.keys(enrollmentUpdates).length > 0) {
      actions.push(prisma.enrollment.update({ where: { id }, data: enrollmentUpdates }));
    }
    classTransactions.forEach((tx) => actions.push(prisma.class.update(tx)));

    if (healthFormAction) {
      await healthFormAction();
    }

    // Update EnrollmentConsent for SANITARY_FORM if relevant fields are provided
    if (healthFormData && (healthFormData.legalRepresentativeFullName || healthFormData.citySigned || healthFormData.signedAt)) {
      const consentUpdateData = {};
      if (healthFormData.legalRepresentativeFullName !== undefined) {
        const trimmedName = healthFormData.legalRepresentativeFullName.trim();
        if (trimmedName) {
          consentUpdateData.acceptedByFullName = trimmedName;
        }
      }
      if (healthFormData.citySigned !== undefined) {
        consentUpdateData.citySigned = healthFormData.citySigned.trim() || null;
      }
      if (healthFormData.signedAt !== undefined) {
        const signedAt = healthFormData.signedAt ? new Date(healthFormData.signedAt) : null;
        if (healthFormData.signedAt && Number.isNaN(signedAt.getTime())) {
          return res.status(400).json({ error: 'Date de signature invalide' });
        }
        consentUpdateData.signedAt = signedAt;
      }

      if (Object.keys(consentUpdateData).length > 0) {
        await prisma.enrollmentConsent.updateMany({
          where: {
            familyId: enrollment.student.familyId,
            studentId: enrollment.studentId,
            schoolYearId: targetSchoolYearId,
            consentType: 'SANITARY_FORM',
          },
          data: consentUpdateData,
        });
      }
    }

    if (actions.length > 0) {
      await prisma.$transaction(actions);
    }

    const updated = await prisma.enrollment.findUnique({
      where: { id },
      include: {
        student: {
          include: {
            family: { include: { user: true } },
            healthForms: { include: { emergencyContacts: true, pickupAuthorizations: true } },
            enrollmentConsents: { where: { consentType: 'SANITARY_FORM' } },
          },
        },
        class: { include: { level: { include: { pole: true } } } },
        schoolYear: true,
      },
    });

    if (status === 'CONFIRMED' && currentStatus !== 'CONFIRMED') {
      await confirmStripePaymentsForEnrollment(id);
      if (updated?.student?.family?.user?.email) {
        const familyUser = updated.student.family.user;
        const classInfo = `${updated.class?.level?.pole?.name ? `${updated.class.level.pole.name} - ` : ''}${updated.class?.level?.name || 'Classe inconnue'}`;
        const scheduleInfo = [updated.class?.dayOfWeek, updated.class?.startTime, updated.class?.endTime].filter(Boolean).join(' ');
        const summaryHtml = `
          <p><strong>Élève :</strong> ${updated.student.firstName} ${updated.student.lastName}</p>
          <p><strong>Classe :</strong> ${classInfo}</p>
          <p><strong>Horaires :</strong> ${scheduleInfo || 'Non renseignés'}</p>
          <p><strong>Année scolaire :</strong> ${updated.schoolYear?.label || 'Non renseignée'}</p>
        `;
        await sendEnrollmentApprovedEmail(familyUser, summaryHtml);
      }
    } else if (status === 'CANCELLED' && currentStatus !== 'CANCELLED') {
      if (updated?.student?.family?.user?.email) {
        const familyUser = updated.student.family.user;
        const classInfo = `${updated.class?.level?.pole?.name ? `${updated.class.level.pole.name} - ` : ''}${updated.class?.level?.name || 'Classe inconnue'}`;
        const scheduleInfo = [updated.class?.dayOfWeek, updated.class?.startTime, updated.class?.endTime].filter(Boolean).join(' ');
        const summaryHtml = `
          <p><strong>Élève :</strong> ${updated.student.firstName} ${updated.student.lastName}</p>
          <p><strong>Classe :</strong> ${classInfo}</p>
          <p><strong>Horaires :</strong> ${scheduleInfo || 'Non renseignés'}</p>
          <p><strong>Année scolaire :</strong> ${updated.schoolYear?.label || 'Non renseignée'}</p>
        `;
        await sendEnrollmentRejectedEmail(familyUser, summaryHtml, updated.comment || 'Aucun motif précisé.');
      }
    }

    res.json({ enrollment: updated });
  } catch (error) {
    console.error('Erreur updateEnrollment:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * CRUD Années scolaires
 */
async function getSchoolYears(req, res) {
  try {
    const years = await prisma.schoolYear.findMany({ orderBy: { startDate: 'desc' } });
    res.json({ schoolYears: years });
  } catch (error) {
    console.error('Erreur getSchoolYears:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createSchoolYear(req, res) {
  try {
    const { label, startDate, endDate, isCurrent } = req.body;
    if (!label || !startDate || !endDate) {
      return res.status(400).json({ error: 'label, startDate et endDate sont requis' });
    }

    if (isCurrent) {
      await prisma.schoolYear.updateMany({ data: { isCurrent: false } });
    }

    const year = await prisma.schoolYear.create({
      data: { label, startDate: new Date(startDate), endDate: new Date(endDate), isCurrent: !!isCurrent },
    });
    res.status(201).json({ schoolYear: year });
  } catch (error) {
    console.error('Erreur createSchoolYear:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateSchoolYear(req, res) {
  try {
    const { id } = req.params;
    const { label, startDate, endDate, isCurrent } = req.body;

    const existing = await prisma.schoolYear.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Année scolaire introuvable' });

    if (isCurrent) {
      await prisma.schoolYear.updateMany({ where: { id: { not: id } }, data: { isCurrent: false } });
    }

    const year = await prisma.schoolYear.update({
      where: { id },
      data: {
        ...(label !== undefined ? { label: String(label).trim() } : {}),
        ...(startDate !== undefined ? { startDate: new Date(startDate) } : {}),
        ...(endDate !== undefined ? { endDate: new Date(endDate) } : {}),
        ...(isCurrent !== undefined ? { isCurrent: !!isCurrent } : {}),
      },
    });
    res.json({ schoolYear: year });
  } catch (error) {
    console.error('Erreur updateSchoolYear:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * CRUD Poles
 */
async function getPoles(req, res) {
  try {
    const scopedPoleId = await getScopedPoleId(req.user?.role);
    const where = scopedPoleId ? { id: scopedPoleId } : {};
    const poles = await prisma.pole.findMany({
      where,
      include: { levels: { orderBy: { sortOrder: 'asc' } }, _count: { select: { classes: true, levels: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ poles });
  } catch (error) {
    console.error('Erreur getPoles:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createPole(req, res) {
  try {
    const { name, description, sortOrder = 0 } = req.body;
    if (!name) return res.status(400).json({ error: 'Le nom du pôle est requis' });

    const pole = await prisma.pole.create({ data: { name: name.trim(), description, sortOrder: Number(sortOrder) } });
    res.status(201).json({ pole });
  } catch (error) {
    console.error('Erreur createPole:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updatePole(req, res) {
  try {
    const { id } = req.params;
    const { name, description, sortOrder, blockReenrollments, blockNewEnrollments } = req.body;

    const pole = await prisma.pole.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
        ...(blockReenrollments !== undefined ? { blockReenrollments: Boolean(blockReenrollments) } : {}),
        ...(blockNewEnrollments !== undefined ? { blockNewEnrollments: Boolean(blockNewEnrollments) } : {}),
      },
    });

    res.json({ pole });
  } catch (error) {
    console.error('Erreur updatePole:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deletePole(req, res) {
  try {
    const { id } = req.params;
    const classesCount = await prisma.class.count({ where: { poleId: id } });
    if (classesCount > 0) {
      return res.status(400).json({ error: 'Impossible de supprimer un pôle utilisé par des classes' });
    }

    await prisma.pole.delete({ where: { id } });
    return res.json({ message: 'Pôle supprimé avec succès' });
  } catch (error) {
    console.error('Erreur deletePole:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * CRUD Niveaux
 */
async function getLevels(req, res) {
  try {
    const scopedPoleId = await getScopedPoleId(req.user?.role);
    const effectivePoleId = scopedPoleId || req.query.poleId;
    const levels = await prisma.level.findMany({
      where: effectivePoleId ? { poleId: effectivePoleId } : {},
      include: { pole: true, _count: { select: { classes: true } } },
      orderBy: [{ pole: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });

    res.json({ levels });
  } catch (error) {
    console.error('Erreur getLevels:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createLevel(req, res) {
  try {
    const { poleId, code, name, description, sortOrder = 0, minAge, maxAge, cursus } = req.body;
    if (!poleId || !name) {
      return res.status(400).json({ error: 'poleId et name sont requis' });
    }

    const levelCode = code && String(code).trim()
      ? String(code).trim().toUpperCase()
      : name.normalize('NFD').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').toUpperCase();

    const minAgeNum = minAge !== undefined && minAge !== null && minAge !== '' ? Number(minAge) : null;
    const maxAgeNum = maxAge !== undefined && maxAge !== null && maxAge !== '' ? Number(maxAge) : null;

    if (minAgeNum !== null && isNaN(minAgeNum)) {
      return res.status(400).json({ error: 'Âge minimum invalide' });
    }
    if (maxAgeNum !== null && isNaN(maxAgeNum)) {
      return res.status(400).json({ error: 'Âge maximum invalide' });
    }

    const level = await prisma.level.create({
      data: {
        poleId,
        code: levelCode,
        name: String(name).trim(),
        description,
        sortOrder: Number(sortOrder),
        minAge: minAgeNum,
        maxAge: maxAgeNum,
        cursus: cursus || null,
      },
    });

    res.status(201).json({ level });
  } catch (error) {
    console.error('Erreur createLevel:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateLevel(req, res) {
  try {
    const { id } = req.params;
    const { poleId, code, name, description, sortOrder, minAge, maxAge, cursus } = req.body;

    const minAgeNum = minAge !== undefined ? (minAge === '' || minAge === null ? null : Number(minAge)) : undefined;
    const maxAgeNum = maxAge !== undefined ? (maxAge === '' || maxAge === null ? null : Number(maxAge)) : undefined;

    if (minAgeNum !== undefined && minAgeNum !== null && isNaN(minAgeNum)) {
      return res.status(400).json({ error: 'Âge minimum invalide' });
    }
    if (maxAgeNum !== undefined && maxAgeNum !== null && isNaN(maxAgeNum)) {
      return res.status(400).json({ error: 'Âge maximum invalide' });
    }

    const level = await prisma.level.update({
      where: { id },
      data: {
        ...(poleId !== undefined ? { poleId } : {}),
        ...(code !== undefined ? { code: String(code).trim().toUpperCase() } : {}),
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
        ...(minAgeNum !== undefined ? { minAge: minAgeNum } : {}),
        ...(maxAgeNum !== undefined ? { maxAge: maxAgeNum } : {}),
        ...(cursus !== undefined ? { cursus: cursus || null } : {}),
      },
      include: { pole: true },
    });

    res.json({ level });
  } catch (error) {
    console.error('Erreur updateLevel:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteLevel(req, res) {
  try {
    const { id } = req.params;
    const classesCount = await prisma.class.count({ where: { levelId: id } });
    if (classesCount > 0) {
      return res.status(400).json({ error: 'Impossible de supprimer un niveau déjà utilisé par des classes' });
    }

    await prisma.level.delete({ where: { id } });
    return res.json({ message: 'Niveau supprimé avec succès' });
  } catch (error) {
    console.error('Erreur deleteLevel:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * CRUD Salles
 */
async function getRooms(req, res) {
  try {
    const rooms = await prisma.room.findMany({
      include: {
        _count: { select: { timeSlots: true, classes: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ rooms });
  } catch (error) {
    console.error('Erreur getRooms:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createRoom(req, res) {
  try {
    const { name, capacity, equipments = [], location, status = 'ACTIVE' } = req.body;
    if (!name || !capacity) {
      return res.status(400).json({ error: 'Nom et capacité sont requis' });
    }

    const room = await prisma.room.create({
      data: {
        name: String(name).trim(),
        capacity: Number(capacity),
        equipments: Array.isArray(equipments) ? equipments : [],
        location,
        status,
      },
    });

    res.status(201).json({ room });
  } catch (error) {
    console.error('Erreur createRoom:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateRoom(req, res) {
  try {
    const { id } = req.params;
    const { name, capacity, equipments, location, status } = req.body;

    const room = await prisma.room.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(capacity !== undefined ? { capacity: Number(capacity) } : {}),
        ...(equipments !== undefined ? { equipments: Array.isArray(equipments) ? equipments : [] } : {}),
        ...(location !== undefined ? { location } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });

    await prisma.class.updateMany({
      where: { roomId: id },
      data: { room: room.name },
    });

    return res.json({ room });
  } catch (error) {
    console.error('Erreur updateRoom:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteRoom(req, res) {
  try {
    const { id } = req.params;
    const [classesCount, slotsCount] = await Promise.all([
      prisma.class.count({ where: { roomId: id } }),
      prisma.timeSlot.count({ where: { roomId: id } }),
    ]);

    if (classesCount > 0 || slotsCount > 0) {
      return res.status(400).json({ error: 'Impossible de supprimer une salle utilisée par des classes/créneaux' });
    }

    await prisma.room.delete({ where: { id } });
    return res.json({ message: 'Salle supprimée avec succès' });
  } catch (error) {
    console.error('Erreur deleteRoom:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * CRUD Créneaux
 */
async function getTimeSlots(req, res) {
  try {
    const { dayOfWeek, roomId, poleId } = req.query;
    const where = {
      ...(dayOfWeek ? { dayOfWeek } : {}),
      ...(roomId ? { roomId } : {}),
      ...(poleId ? { poleId } : {}),
    };

    const timeSlots = await prisma.timeSlot.findMany({
      where,
      include: {
        room: true,
        pole: true,
        _count: { select: { classes: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    res.json({ timeSlots });
  } catch (error) {
    console.error('Erreur getTimeSlots:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createTimeSlot(req, res) {
  try {
    const { dayOfWeek, startTime, endTime, roomId, poleId, recurring = true } = req.body;

    if (!dayOfWeek || !startTime || !endTime || !roomId) {
      return res.status(400).json({ error: 'dayOfWeek, startTime, endTime et roomId sont requis' });
    }

    const overlapError = await validateTimeSlotOverlap({ dayOfWeek, startTime, endTime, roomId });
    if (overlapError) {
      return res.status(400).json({ error: overlapError });
    }

    const timeSlot = await prisma.timeSlot.create({
      data: {
        dayOfWeek,
        startTime,
        endTime,
        roomId,
        ...(poleId ? { poleId } : {}),
        recurring: !!recurring,
      },
      include: { room: true, pole: true },
    });

    res.status(201).json({ timeSlot });
  } catch (error) {
    console.error('Erreur createTimeSlot:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateTimeSlot(req, res) {
  try {
    const { id } = req.params;
    const existing = await prisma.timeSlot.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Créneau non trouvé' });

    const dayOfWeek = req.body.dayOfWeek ?? existing.dayOfWeek;
    const startTime = req.body.startTime ?? existing.startTime;
    const endTime = req.body.endTime ?? existing.endTime;
    const roomId = req.body.roomId ?? existing.roomId;

    const overlapError = await validateTimeSlotOverlap({ dayOfWeek, startTime, endTime, roomId, excludeId: id });
    if (overlapError) {
      return res.status(400).json({ error: overlapError });
    }

    const timeSlot = await prisma.timeSlot.update({
      where: { id },
      data: {
        ...(req.body.dayOfWeek !== undefined ? { dayOfWeek: req.body.dayOfWeek } : {}),
        ...(req.body.startTime !== undefined ? { startTime: req.body.startTime } : {}),
        ...(req.body.endTime !== undefined ? { endTime: req.body.endTime } : {}),
        ...(req.body.roomId !== undefined ? { roomId: req.body.roomId } : {}),
        ...(req.body.poleId !== undefined ? { poleId: req.body.poleId || null } : {}),
        ...(req.body.recurring !== undefined ? { recurring: !!req.body.recurring } : {}),
      },
      include: { room: true, pole: true },
    });

    await prisma.class.updateMany({
      where: { timeSlotId: id },
      data: {
        dayOfWeek: timeSlot.dayOfWeek,
        startTime: timeSlot.startTime,
        endTime: timeSlot.endTime,
        roomId: timeSlot.roomId,
        room: timeSlot.room.name,
      },
    });

    return res.json({ timeSlot });
  } catch (error) {
    console.error('Erreur updateTimeSlot:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteTimeSlot(req, res) {
  try {
    const { id } = req.params;
    const classesCount = await prisma.class.count({ where: { timeSlotId: id } });
    if (classesCount > 0) {
      return res.status(400).json({ error: 'Impossible de supprimer un créneau utilisé par des classes' });
    }

    await prisma.timeSlot.delete({ where: { id } });
    return res.json({ message: 'Créneau supprimé avec succès' });
  } catch (error) {
    console.error('Erreur deleteTimeSlot:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * CRUD Classes
 */
async function getClasses(req, res) {
  try {
    const { schoolYearId, levelId } = req.query;
    const scopedPoleId = await getScopedPoleId(req.user?.role);
    const effectivePoleId = scopedPoleId || req.query.poleId;
    const where = {};
    if (schoolYearId) where.schoolYearId = schoolYearId;
    if (effectivePoleId) where.poleId = effectivePoleId;
    if (levelId) where.levelId = levelId;

    const classes = await prisma.class.findMany({
      where,
      include: {
        level: { include: { pole: true } },
        pole: true,
        schoolYear: true,
        timeSlot: true,
        roomRef: true,
        teacher: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
        classTimeSlots: { include: { timeSlot: { include: { room: true } } }, orderBy: { sortOrder: 'asc' } },
        _count: {
          select: {
            enrollments: {
              where: {
                status: { not: 'CANCELLED' },
              },
            },
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    // Fetch raw fields (valid_from/valid_to/apply_enrollment_fee) via raw SQL (Prisma client may not have these fields yet)
    let rawFieldsMap = {};
    if (classes.length > 0) {
      const ids = classes.map((c) => c.id);
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
      const rawRows = await prisma.$queryRawUnsafe(
        `SELECT id, valid_from as "validFrom", valid_to as "validTo", apply_enrollment_fee as "applyEnrollmentFee", genre FROM classes WHERE id IN (${placeholders})`,
        ...ids,
      );
      rawFieldsMap = Object.fromEntries(rawRows.map((r) => [r.id, { validFrom: r.validFrom, validTo: r.validTo, applyEnrollmentFee: r.applyEnrollmentFee, genre: r.genre }]));
    }

    const formatted = classes.map((cls) => {
      const enrolledCount = cls._count?.enrollments || 0;
      const computedStatus = cls.status === 'CLOSED'
        ? 'CLOSED'
        : (enrolledCount >= cls.capacity ? 'FULL' : 'OPEN');
      return {
        ...cls,
        enrolledCount,
        status: computedStatus,
        fillIndicator: classFillIndicator(enrolledCount, cls.capacity),
        validFrom: rawFieldsMap[cls.id]?.validFrom ?? null,
        validTo: rawFieldsMap[cls.id]?.validTo ?? null,
        applyEnrollmentFee: rawFieldsMap[cls.id]?.applyEnrollmentFee ?? true,
        genre: rawFieldsMap[cls.id]?.genre ?? 'Tout',
      };
    });

    res.json({ classes: formatted });
  } catch (error) {
    console.error('Erreur getClasses:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getClassDetails(req, res) {
  try {
    const { id } = req.params;
    const cls = await prisma.class.findUnique({
      where: { id },
      include: {
        schoolYear: true,
        pole: true,
        level: { include: { pole: true } },
        timeSlot: { include: { room: true } },
        classTimeSlots: { include: { timeSlot: { include: { room: true } } }, orderBy: { sortOrder: 'asc' } },
        roomRef: true,
        teacher: { include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } } },
        enrollments: {
          where: { status: { in: ['PENDING', 'CONFIRMED'] } },
          include: {
            student: {
              include: {
                family: {
                  include: {
                    user: { select: { email: true, phone: true, firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
          orderBy: { enrolledAt: 'desc' },
        },
      },
    });

    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });

    const [rawFields] = await prisma.$queryRaw`SELECT valid_from as "validFrom", valid_to as "validTo", apply_enrollment_fee as "applyEnrollmentFee", exam_preparation as "examPreparation" FROM classes WHERE id = ${id}`;

    res.json({
      class: {
        ...cls,
        enrolledCount: cls.enrollments.length,
        status:
          cls.status === 'CLOSED'
            ? 'CLOSED'
            : (cls.enrollments.length > cls.capacity ? 'FULL' : 'OPEN'),
        fillIndicator: classFillIndicator(cls.enrollments.length, cls.capacity),
        validFrom: rawFields?.validFrom ?? null,
        validTo: rawFields?.validTo ?? null,
        applyEnrollmentFee: rawFields?.applyEnrollmentFee ?? true,
        examPreparation: rawFields?.examPreparation ?? false,
      },
    });
  } catch (error) {
    console.error('Erreur getClassDetails:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getClassWaitlist(req, res) {
  try {
    const { id } = req.params;
    const cls = await prisma.class.findUnique({
      where: { id },
      select: { id: true, status: true, enrolledCount: true, capacity: true },
    });

    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });

    const waitlistEnrollments = await prisma.enrollment.findMany({
      where: {
        classId: id,
        status: { not: 'CANCELLED' },
        isWaitlist: true,
      },
      include: {
        student: {
          include: {
            family: {
              include: {
                user: { select: { email: true, phone: true } },
              },
            },
          },
        },
      },
      orderBy: [
        { waitlistOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    const waitlist = waitlistEnrollments.map((enrollment) => ({
      id: enrollment.id,
      studentId: enrollment.studentId,
      studentFirstName: enrollment.student.firstName,
      studentLastName: enrollment.student.lastName,
      dateOfBirth: enrollment.student.dateOfBirth,
      enrolledAt: enrollment.enrolledAt,
      createdAt: enrollment.createdAt,
      familyEmail: enrollment.student.family?.user?.email || null,
      familyPhone: enrollment.student.family?.user?.phone || null,
      waitlistOrder: enrollment.waitlistOrder,
    }));

    return res.json({
      class: {
        id: cls.id,
        status: cls.status,
        enrolledCount: cls.enrolledCount,
        capacity: cls.capacity,
        isFull: cls.status === 'FULL' || cls.enrolledCount >= cls.capacity,
      },
      waitlist,
    });
  } catch (error) {
    console.error('Erreur getClassWaitlist:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createClass(req, res) {
  try {
    const {
      schoolYearId,
      poleId,
      levelId,
      teacherId,
      capacity,
      status = 'OPEN',
      validFrom,
      validTo,
      applyEnrollmentFee = true,
      examPreparation = false,
      isProvisional = false,
      genre = 'Tout',
    } = req.body;

    // Support both timeSlotIds[] (new) and timeSlotId (legacy single)
    const rawIds = req.body.timeSlotIds;
    const timeSlotIds = Array.isArray(rawIds) && rawIds.length > 0
      ? rawIds
      : (req.body.timeSlotId ? [req.body.timeSlotId] : []);

    const isProvisionalBool = Boolean(isProvisional);

    if (!schoolYearId || !poleId) {
      return res.status(400).json({ error: 'schoolYearId et poleId sont requis' });
    }
    if (!isProvisionalBool && (!levelId || timeSlotIds.length === 0 || !teacherId)) {
      return res.status(400).json({ error: 'schoolYearId, poleId, levelId, au moins un timeSlotId et teacherId sont requis' });
    }

    const [year, pole, teacher] = await Promise.all([
      prisma.schoolYear.findUnique({ where: { id: schoolYearId } }),
      prisma.pole.findUnique({ where: { id: poleId } }),
      teacherId ? prisma.teacher.findUnique({ where: { id: teacherId }, include: { user: true } }) : Promise.resolve(null),
    ]);

    if (!year || !pole) {
      return res.status(404).json({ error: 'Référence invalide (année/pôle)' });
    }
    if (!isProvisionalBool && !teacher) {
      return res.status(404).json({ error: 'Professeur introuvable' });
    }

    // Resolve level: required for non-provisional; for provisional, fall back to first level of the pole
    let level = levelId ? await prisma.level.findUnique({ where: { id: levelId } }) : null;
    if (!level) {
      if (!isProvisionalBool) return res.status(404).json({ error: 'Niveau invalide' });
      level = await prisma.level.findFirst({ where: { poleId } });
      if (!level) return res.status(400).json({ error: 'Aucun niveau disponible pour ce pôle' });
    }

    if (level.poleId !== poleId) {
      return res.status(400).json({ error: 'Le niveau sélectionné ne correspond pas au pôle choisi' });
    }

    let timeSlots = [];
    let primarySlot = null;
    let primaryRoom = null;

    if (timeSlotIds.length > 0) {
      timeSlots = await prisma.timeSlot.findMany({ where: { id: { in: timeSlotIds } }, include: { room: true } });
      if (timeSlots.length !== timeSlotIds.length) {
        return res.status(404).json({ error: 'Un ou plusieurs créneaux sont introuvables' });
      }
      primarySlot = timeSlots.find((s) => s.id === timeSlotIds[0]) || timeSlots[0];
      primaryRoom = primarySlot.room;
    }

    const classCapacity = Number(capacity || (primaryRoom?.capacity ?? 1000));
    const classValidFrom = validFrom ? new Date(validFrom) : year.startDate;
    const classValidTo = validTo ? new Date(validTo) : year.endDate;

    // Validate conflicts for each slot, taking date range into account
    for (const slot of timeSlots) {
      const conflictError = await validateClassConflicts({
        schoolYearId,
        teacherId,
        roomId: slot.roomId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        validFrom: classValidFrom,
        validTo: classValidTo,
      });
      if (conflictError) return res.status(400).json({ error: `Créneau ${slot.dayOfWeek} ${slot.startTime}-${slot.endTime}: ${conflictError}` });
    }

    const cls = await prisma.$transaction(async (tx) => {
      const created = await tx.class.create({
        data: {
          schoolYearId,
          poleId,
          levelId: level.id,
          ...(primarySlot ? {
            timeSlotId: primarySlot.id,
            roomId: primaryRoom.id,
            dayOfWeek: primarySlot.dayOfWeek,
            startTime: primarySlot.startTime,
            endTime: primarySlot.endTime,
            room: primaryRoom.name,
          } : {
            dayOfWeek: 'N/A',
            startTime: '00:00',
            endTime: '00:00',
          }),
          ...(teacher ? {
            teacherId,
            teacherUserId: teacher.userId,
            teacherName: `${teacher.firstName} ${teacher.lastName}`,
          } : {}),
          capacity: classCapacity,
          status,
        },
      });

      if (timeSlotIds.length > 0) {
        await tx.classTimeSlot.createMany({
          data: timeSlotIds.map((tsId, idx) => ({ classId: created.id, timeSlotId: tsId, sortOrder: idx })),
        });
      }

      // Set validFrom/validTo/applyEnrollmentFee/examPreparation/isProvisional via raw SQL (Prisma client may not know these fields yet)
      const applyFee = applyEnrollmentFee !== false;
      const examPrep = Boolean(examPreparation);
      const provisional = Boolean(isProvisional);
      const genreVal = ['Tout', 'Masculin', 'Feminin'].includes(genre) ? genre : 'Tout';
      await tx.$executeRaw`UPDATE classes SET valid_from = ${classValidFrom}, valid_to = ${classValidTo}, apply_enrollment_fee = ${applyFee}, exam_preparation = ${examPrep}, is_provisional = ${provisional}, genre = ${genreVal} WHERE id = ${created.id}`;

      return created;
    });

    const fullClass = await prisma.class.findUnique({
      where: { id: cls.id },
      include: {
        schoolYear: true,
        pole: true,
        level: { include: { pole: true } },
        timeSlot: true,
        roomRef: true,
        teacher: { include: { user: true } },
        classTimeSlots: { include: { timeSlot: { include: { room: true } } }, orderBy: { sortOrder: 'asc' } },
      },
    });

    const genreVal = ['Tout', 'Masculin', 'Feminin'].includes(genre) ? genre : 'Tout';
    res.status(201).json({ class: { ...fullClass, validFrom: classValidFrom, validTo: classValidTo, applyEnrollmentFee: applyEnrollmentFee !== false, examPreparation: Boolean(examPreparation), isProvisional: Boolean(isProvisional), genre: genreVal, fillIndicator: classFillIndicator(fullClass.enrolledCount, fullClass.capacity) } });
  } catch (error) {
    console.error('Erreur createClass:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateClass(req, res) {
  try {
    const { id } = req.params;
    const existing = await prisma.class.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Classe non trouvée' });

    // Fetch raw fields from SQL since Prisma client may not know them yet
    const [existingRaw] = await prisma.$queryRaw`SELECT valid_from as "validFrom", valid_to as "validTo", apply_enrollment_fee as "applyEnrollmentFee", exam_preparation as "examPreparation", is_provisional as "isProvisional", genre FROM classes WHERE id = ${id}`;

    // Support timeSlotIds[] (new) or single timeSlotId (legacy)
    const rawIds = req.body.timeSlotIds;
    const timeSlotIds = Array.isArray(rawIds) && rawIds.length > 0
      ? rawIds
      : (req.body.timeSlotId ? [req.body.timeSlotId] : null);

    const next = {
      schoolYearId: req.body.schoolYearId ?? existing.schoolYearId,
      poleId: req.body.poleId ?? existing.poleId,
      levelId: req.body.levelId ?? existing.levelId,
      teacherId: req.body.teacherId ?? existing.teacherId,
      capacity: req.body.capacity !== undefined ? Number(req.body.capacity) : existing.capacity,
      status: req.body.status ?? existing.status,
      validFrom: req.body.validFrom !== undefined ? (req.body.validFrom ? new Date(req.body.validFrom) : null) : (existingRaw?.validFrom ?? null),
      validTo: req.body.validTo !== undefined ? (req.body.validTo ? new Date(req.body.validTo) : null) : (existingRaw?.validTo ?? null),
      applyEnrollmentFee: req.body.applyEnrollmentFee !== undefined ? req.body.applyEnrollmentFee !== false : (existingRaw?.applyEnrollmentFee ?? true),
      examPreparation: req.body.examPreparation !== undefined ? Boolean(req.body.examPreparation) : (existingRaw?.examPreparation ?? false),
      isProvisional: req.body.isProvisional !== undefined ? Boolean(req.body.isProvisional) : (existingRaw?.isProvisional ?? false),
      genre: req.body.genre !== undefined ? ((['Tout', 'Masculin', 'Feminin'].includes(req.body.genre) ? req.body.genre : 'Tout')) : (existingRaw?.genre ?? 'Tout'),
    };

    const [level, teacher] = await Promise.all([
      prisma.level.findUnique({ where: { id: next.levelId } }),
      next.teacherId ? prisma.teacher.findUnique({ where: { id: next.teacherId }, include: { user: true } }) : null,
    ]);

    if (!level) return res.status(400).json({ error: 'Niveau invalide' });
    if (next.poleId && level.poleId !== next.poleId) {
      return res.status(400).json({ error: 'Le niveau sélectionné ne correspond pas au pôle choisi' });
    }
    if (next.teacherId && !teacher) return res.status(400).json({ error: 'Professeur invalide' });

    // Resolve time slots to update
    let newTimeSlots = null;
    if (timeSlotIds) {
      newTimeSlots = await prisma.timeSlot.findMany({
        where: { id: { in: timeSlotIds } },
        include: { room: true },
      });
      if (newTimeSlots.length !== timeSlotIds.length) {
        return res.status(404).json({ error: 'Un ou plusieurs créneaux sont introuvables' });
      }

      for (const slot of newTimeSlots) {
        const conflictError = await validateClassConflicts({
          classId: id,
          schoolYearId: next.schoolYearId,
          teacherId: next.teacherId,
          roomId: slot.roomId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          validFrom: next.validFrom,
          validTo: next.validTo,
        });
        if (conflictError) return res.status(400).json({ error: `Créneau ${slot.dayOfWeek} ${slot.startTime}-${slot.endTime}: ${conflictError}` });
      }
    } else {
      // No slot change: validate existing primary slot for teacher conflict
      const conflictError = await validateClassConflicts({
        classId: id,
        schoolYearId: next.schoolYearId,
        teacherId: next.teacherId,
        roomId: existing.roomId,
        dayOfWeek: existing.dayOfWeek,
        startTime: existing.startTime,
        endTime: existing.endTime,
        validFrom: next.validFrom,
        validTo: next.validTo,
      });
      if (conflictError) return res.status(400).json({ error: conflictError });
    }

    const primarySlot = newTimeSlots ? (newTimeSlots.find((s) => s.id === timeSlotIds[0]) || newTimeSlots[0]) : null;

    const updated = await prisma.$transaction(async (tx) => {
      if (newTimeSlots) {
        await tx.classTimeSlot.deleteMany({ where: { classId: id } });
        await tx.classTimeSlot.createMany({
          data: timeSlotIds.map((tsId, idx) => ({ classId: id, timeSlotId: tsId, sortOrder: idx })),
        });
      }

      const updatedClass = await tx.class.update({
        where: { id },
        data: {
          schoolYearId: next.schoolYearId,
          poleId: next.poleId,
          levelId: next.levelId,
          ...(primarySlot ? {
            timeSlotId: primarySlot.id,
            roomId: primarySlot.roomId,
            dayOfWeek: primarySlot.dayOfWeek,
            startTime: primarySlot.startTime,
            endTime: primarySlot.endTime,
            room: primarySlot.room.name,
          } : {}),
          teacherId: next.teacherId,
          teacherUserId: teacher ? teacher.userId : existing.teacherUserId,
          teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : existing.teacherName,
          capacity: next.capacity,
          status: next.status,
        },
        include: {
          schoolYear: true,
          pole: true,
          level: { include: { pole: true } },
          timeSlot: true,
          roomRef: true,
          teacher: { include: { user: true } },
          classTimeSlots: { include: { timeSlot: { include: { room: true } } }, orderBy: { sortOrder: 'asc' } },
        },
      });

      // Set raw fields via SQL (Prisma client may not know these fields yet)
      await tx.$executeRaw`UPDATE classes SET valid_from = ${next.validFrom}, valid_to = ${next.validTo}, apply_enrollment_fee = ${next.applyEnrollmentFee}, exam_preparation = ${next.examPreparation}, is_provisional = ${next.isProvisional}, genre = ${next.genre} WHERE id = ${id}`;

      return { ...updatedClass, validFrom: next.validFrom, validTo: next.validTo, applyEnrollmentFee: next.applyEnrollmentFee, examPreparation: next.examPreparation, isProvisional: next.isProvisional, genre: next.genre };
    });

    res.json({ class: { ...updated, fillIndicator: classFillIndicator(updated.enrolledCount, updated.capacity) } });
  } catch (error) {
    console.error('Erreur updateClass:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteClass(req, res) {
  try {
    const { id } = req.params;
    
    // Vérifier que la classe existe
    const cls = await prisma.class.findUnique({ where: { id } });
    if (!cls) {
      return res.status(404).json({ error: 'Classe non trouvée' });
    }

    // Supprimer en cascade : enrollments → lessons (avec evaluations) → homeworkMessages
    await prisma.$transaction([
      // Supprimer les inscriptions
      prisma.enrollment.deleteMany({ where: { classId: id } }),
      // Supprimer les leçons (et leurs évaluations via onDelete: Cascade)
      prisma.lesson.deleteMany({ where: { classId: id } }),
      // Supprimer les messages de devoir
      prisma.homeworkMessage.deleteMany({ where: { classId: id } }),
      // Finalement supprimer la classe
      prisma.class.delete({ where: { id } }),
    ]);
    
    res.json({ message: 'Classe supprimée avec succès' });
  } catch (error) {
    console.error('Erreur deleteClass:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function removeStudentFromClass(req, res) {
  try {
    const { classId, enrollmentId } = req.params;

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        classId,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });

    if (!enrollment) return res.status(404).json({ error: 'Inscription élève introuvable' });

    await prisma.$transaction([
      prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      }),
      prisma.class.update({
        where: { id: classId },
        data: {
          enrolledCount: { decrement: 1 },
          status: 'OPEN',
        },
      }),
    ]);

    res.json({ message: 'Élève retiré de la classe' });
  } catch (error) {
    console.error('Erreur removeStudentFromClass:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function exportClassStudentsExcel(req, res) {
  try {
    const { id } = req.params;
    const cls = await prisma.class.findUnique({
      where: { id },
      include: {
        schoolYear: true,
        pole: true,
        level: true,
        roomRef: true,
        teacher: true,
        enrollments: {
          where: { status: { in: ['PENDING', 'CONFIRMED'] } },
          include: {
            student: {
              include: {
                family: { include: { user: true } },
              },
            },
          },
          orderBy: { enrolledAt: 'asc' },
        },
      },
    });

    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Classe');

    worksheet.addRow(['Classe', `${cls.pole?.name || '-'} / ${cls.level?.name || '-'}`]);
    worksheet.addRow(['Année scolaire', cls.schoolYear?.label || '-']);
    worksheet.addRow(['Créneau', `${cls.dayOfWeek} ${cls.startTime} - ${cls.endTime}`]);
    worksheet.addRow(['Salle', cls.roomRef?.name || cls.room || '-']);
    worksheet.addRow(['Professeur', cls.teacher ? `${cls.teacher.firstName} ${cls.teacher.lastName}` : '-']);
    worksheet.addRow(['Effectif', `${cls.enrolledCount}/${cls.capacity}`]);
    worksheet.addRow([]);

    worksheet.addRow(['Nom élève', 'Prénom', 'Date inscription', 'Email famille', 'Téléphone famille']);

    cls.enrollments.forEach((enrollment) => {
      worksheet.addRow([
        enrollment.student.lastName,
        enrollment.student.firstName,
        new Date(enrollment.enrolledAt).toLocaleDateString('fr-FR'),
        enrollment.student.family?.user?.email || '-',
        enrollment.student.family?.user?.phone || '-',
      ]);
    });

    worksheet.columns.forEach((column) => {
      column.width = 24;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="classe-${id}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Erreur exportClassStudentsExcel:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function exportClassStudentsPdf(req, res) {
  try {
    const { id } = req.params;
    const cls = await prisma.class.findUnique({
      where: { id },
      include: {
        schoolYear: true,
        pole: true,
        level: true,
        roomRef: true,
        teacher: true,
        enrollments: {
          where: { status: { in: ['PENDING', 'CONFIRMED'] } },
          include: {
            student: {
              include: {
                family: { include: { user: true } },
              },
            },
          },
          orderBy: { enrolledAt: 'asc' },
        },
      },
    });

    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="classe-${id}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text('Export classe AMC', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Classe: ${cls.pole?.name || '-'} / ${cls.level?.name || '-'}`);
    doc.text(`Année: ${cls.schoolYear?.label || '-'}`);
    doc.text(`Créneau: ${cls.dayOfWeek} ${cls.startTime} - ${cls.endTime}`);
    doc.text(`Salle: ${cls.roomRef?.name || cls.room || '-'}`);
    doc.text(`Professeur: ${cls.teacher ? `${cls.teacher.firstName} ${cls.teacher.lastName}` : '-'}`);
    doc.text(`Effectif: ${cls.enrolledCount}/${cls.capacity}`);
    doc.moveDown();

    doc.fontSize(12).text('Liste des élèves', { underline: true });
    doc.moveDown(0.4);

    cls.enrollments.forEach((enrollment, index) => {
      const student = enrollment.student;
      const family = student.family;
      doc
        .fontSize(10)
        .text(
          `${index + 1}. ${student.lastName} ${student.firstName} | Inscrit le ${new Date(enrollment.enrolledAt).toLocaleDateString('fr-FR')} | ${family?.user?.email || '-'} | ${family?.user?.phone || '-'}`,
          { lineGap: 2 }
        );
    });

    doc.end();
  } catch (error) {
    console.error('Erreur exportClassStudentsPdf:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function sendMessageToClassFamilies(req, res) {
  try {
    const { id } = req.params;
    const { subject, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: 'subject et message sont requis' });
    }

    const cls = await prisma.class.findUnique({
      where: { id },
      include: {
        level: { include: { pole: true } },
        enrollments: {
          where: { status: { in: ['PENDING', 'CONFIRMED'] } },
          include: {
            student: {
              include: {
                family: {
                  include: {
                    user: { select: { email: true, firstName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!cls) return res.status(404).json({ error: 'Classe introuvable' });

    const emails = [...new Set(cls.enrollments.map((e) => e.student.family?.user?.email).filter(Boolean))];

    if (emails.length === 0) {
      return res.status(400).json({ error: 'Aucune adresse email famille trouvée pour cette classe' });
    }

    await Promise.all(
      emails.map((email) => sendMail({
        to: email,
        subject,
        html: `<p>${message.replace(/\n/g, '<br />')}</p><hr/><p><strong>Classe:</strong> ${cls.level.pole.name} / ${cls.level.name}</p>`,
      }))
    );

    return res.json({ message: 'Message envoyé aux familles', recipients: emails.length });
  } catch (error) {
    console.error('Erreur sendMessageToClassFamilies:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * CRUD Professeurs
 */
async function getTeachers(req, res) {
  try {
    const role = req.user?.role;
    const scopedPoleId = await getScopedPoleId(role);
    const keyword = ROLE_POLE_KEYWORD[role];
    const scopedSpecialties = keyword ? (POLE_KEYWORD_SPECIALTIES[keyword] || []) : [];
    const where = scopedPoleId
      ? { OR: [
          { poleId: scopedPoleId },
          { classes: { some: { poleId: scopedPoleId } } },
          ...(scopedSpecialties.length > 0 ? [{ specialties: { hasSome: scopedSpecialties } }] : []),
        ] }
      : {};

    const teachers = await prisma.teacher.findMany({
      where,
      include: {
        user: { select: { id: true, validationStatus: true, emailVerified: true, createdAt: true } },
        pole: { select: { id: true, name: true } },
        _count: { select: { classes: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    res.json({ teachers });
  } catch (error) {
    console.error('Erreur getTeachers:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getTeacherById(req, res) {
  try {
    const { id } = req.params;
    const teacher = await prisma.teacher.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, validationStatus: true, emailVerified: true } },
        pole: { select: { id: true, name: true } },
        classes: {
          include: {
            schoolYear: true,
            level: { include: { pole: true } },
            roomRef: true,
          },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
      },
    });

    if (!teacher) return res.status(404).json({ error: 'Professeur introuvable' });

    const totalStudents = teacher.classes.reduce((sum, cls) => sum + cls.enrolledCount, 0);
    return res.json({ teacher, stats: { totalClasses: teacher.classes.length, totalStudents } });
  } catch (error) {
    console.error('Erreur getTeacherById:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createTeacher(req, res) {
  try {
    const {
      civility = 'M',
      lastName,
      firstName,
      email,
      phone,
      specialties = [],
      poleId = null,
      status = 'ACTIVE',
    } = req.body;

    if (!lastName || !firstName || !email) {
      return res.status(400).json({ error: 'lastName, firstName et email sont requis' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Un compte utilisateur existe déjà avec cet email' });
    }

    const temporaryPassword = `AMC-${uuidv4().slice(0, 10)}`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const emailVerifyToken = uuidv4();

    // If no pole explicitly chosen, try to detect from specialties
    const resolvedPoleId = poleId || await getAutoDetectedPoleId(Array.isArray(specialties) ? specialties : []);

    const teacher = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'PROFESSEUR',
          validationStatus: 'APPROVED',
          emailVerified: false,
          emailVerifyToken,
          firstName,
          lastName,
          phone,
        },
      });

      return tx.teacher.create({
        data: {
          userId: user.id,
          civility,
          firstName,
          lastName,
          email,
          phone,
          specialties: Array.isArray(specialties) ? specialties : [],
          poleId: resolvedPoleId || null,
          status,
        },
        include: { user: true, pole: { select: { id: true, name: true } } },
      });
    });

    await sendMail({
      to: email,
      subject: 'AMC — Création de votre compte professeur',
      html: `
        <h2>Bonjour ${firstName},</h2>
        <p>Votre compte professeur AMC a été créé.</p>
        <p><strong>Email:</strong> ${email}<br />
        <strong>Mot de passe temporaire:</strong> ${temporaryPassword}</p>
        <p>Veuillez vous connecter puis modifier ce mot de passe dès la première connexion.</p>
      `,
    });

    res.status(201).json({ teacher });
  } catch (error) {
    console.error('Erreur createTeacher:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateTeacher(req, res) {
  try {
    const { id } = req.params;
    const existing = await prisma.teacher.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Professeur introuvable' });

    const {
      civility,
      lastName,
      firstName,
      email,
      phone,
      specialties,
      poleId,
      status,
    } = req.body;

    // Resolve poleId: explicit value takes priority, then auto-detect from specialties, then keep existing
    let resolvedPoleId = existing.poleId;
    if (poleId !== undefined) {
      resolvedPoleId = poleId || null;
    } else if (specialties !== undefined) {
      const auto = await getAutoDetectedPoleId(Array.isArray(specialties) ? specialties : []);
      resolvedPoleId = auto || existing.poleId || null;
    }

    const teacher = await prisma.$transaction(async (tx) => {
      const updatedTeacher = await tx.teacher.update({
        where: { id },
        data: {
          ...(civility !== undefined ? { civility } : {}),
          ...(lastName !== undefined ? { lastName: String(lastName).trim() } : {}),
          ...(firstName !== undefined ? { firstName: String(firstName).trim() } : {}),
          ...(email !== undefined ? { email: String(email).trim() } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(specialties !== undefined ? { specialties: Array.isArray(specialties) ? specialties : [] } : {}),
          poleId: resolvedPoleId,
          ...(status !== undefined ? { status } : {}),
        },
        include: { pole: { select: { id: true, name: true } } },
      });

      await tx.user.update({
        where: { id: existing.userId },
        data: {
          ...(lastName !== undefined ? { lastName: String(lastName).trim() } : {}),
          ...(firstName !== undefined ? { firstName: String(firstName).trim() } : {}),
          ...(email !== undefined ? { email: String(email).trim() } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(status !== undefined ? { validationStatus: status === 'ACTIVE' ? 'APPROVED' : 'REJECTED' } : {}),
        },
      });

      return updatedTeacher;
    });

    res.json({ teacher });
  } catch (error) {
    console.error('Erreur updateTeacher:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function resetTeacherPassword(req, res) {
  try {
    const { id } = req.params;
    const teacher = await prisma.teacher.findUnique({ where: { id } });
    if (!teacher) return res.status(404).json({ error: 'Professeur introuvable' });

    const temporaryPassword = `AMC-${uuidv4().slice(0, 10)}`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    await prisma.user.update({
      where: { id: teacher.userId },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    await sendMail({
      to: teacher.email,
      subject: 'AMC — Réinitialisation de mot de passe',
      html: `<p>Bonjour ${teacher.firstName},</p><p>Votre mot de passe temporaire est: <strong>${temporaryPassword}</strong></p>`,
    });

    res.json({ message: 'Mot de passe réinitialisé et envoyé par email' });
  } catch (error) {
    console.error('Erreur resetTeacherPassword:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function unlockUser(req, res) {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    await prisma.user.update({
      where: { id },
      data: { lockedUntil: null, failedLoginAttempts: 0 },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Erreur unlockUser:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function resetUserPassword(req, res) {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const temporaryPassword = `AMC-${uuidv4().slice(0, 10)}`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    await prisma.user.update({
      where: { id },
      data: { passwordHash, resetPasswordToken: null, resetPasswordExpires: null },
    });

    res.json({ password: temporaryPassword });
  } catch (error) {
    console.error('Erreur resetUserPassword:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteTeacher(req, res) {
  try {
    const { id } = req.params;
    const teacher = await prisma.teacher.findUnique({ where: { id } });
    if (!teacher) return res.status(404).json({ error: 'Professeur introuvable' });

    const assignedClasses = await prisma.class.count({ where: { teacherId: id } });
    if (assignedClasses > 0) {
      return res.status(400).json({ error: 'Impossible de supprimer un professeur avec des classes assignées' });
    }

    await prisma.$transaction([
      prisma.teacher.delete({ where: { id } }),
      prisma.user.update({ where: { id: teacher.userId }, data: { validationStatus: 'REJECTED' } }),
    ]);

    res.json({ message: 'Professeur désactivé/supprimé avec succès' });
  } catch (error) {
    console.error('Erreur deleteTeacher:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getPendingUsers,
  getAllUsers,
  approveUser,
  rejectUser,
  getStats,
  getEnrollments,
  getSchoolYears,
  createSchoolYear,
  updateSchoolYear,

  getPoles,
  createPole,
  updatePole,
  deletePole,

  getLevels,
  createLevel,
  updateLevel,
  deleteLevel,

  getRooms,
  createRoom,
  updateRoom,
  deleteRoom,

  getTimeSlots,
  createTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,

  getClasses,
  getClassDetails,
  getClassWaitlist,
  createClass,
  updateClass,
  deleteClass,
  removeStudentFromClass,
  exportClassStudentsExcel,
  exportClassStudentsPdf,
  exportEnrollments,
  sendMessageToClassFamilies,
  getEnrollmentPayments,
  createEnrollmentPayment,
  updateEnrollmentPayment,
  deleteEnrollmentPayment,
  downloadEnrollmentPaymentReceipt,

  getTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  resetTeacherPassword,
  deleteTeacher,
  resetUserPassword,
  unlockUser,
  getRegistrationBlockStatus,
  updateRegistrationBlockStatus,
  getStudentAcademicRecord,
  updateEnrollment,
  cleanupFictiveLevels,
};

async function cleanupFictiveLevels(req, res) {
  try {
    // Per-pole fictive levels created by the old auto-create logic have code starting with 'FICTIF_'
    const fictiveLevels = await prisma.level.findMany({
      where: { code: { startsWith: 'FICTIF_' } },
      include: { classes: true },
    });

    if (fictiveLevels.length === 0) {
      return res.json({ message: 'Aucun niveau fictif trouvé', deletedLevels: 0 });
    }

    // Global fictive class = a fictive class under a real level (not FICTIF_)
    const globalFictiveClass = await prisma.class.findFirst({
      where: {
        level: { code: { not: { startsWith: 'FICTIF_' } } },
        OR: getProvisionalClassFilter().OR,
      },
    });

    let deletedLevels = 0;
    let movedEnrollments = 0;

    for (const level of fictiveLevels) {
      for (const cls of level.classes) {
        const enrollmentCount = await prisma.enrollment.count({ where: { classId: cls.id } });

        if (enrollmentCount > 0) {
          if (globalFictiveClass) {
            const moved = await prisma.enrollment.updateMany({
              where: { classId: cls.id },
              data: { classId: globalFictiveClass.id },
            });
            movedEnrollments += moved.count;
          } else {
            await prisma.enrollment.deleteMany({ where: { classId: cls.id } });
          }
        }

        await prisma.class.delete({ where: { id: cls.id } });
      }

      await prisma.level.delete({ where: { id: level.id } });
      deletedLevels++;
    }

    const parts = [`${deletedLevels} niveau(x) fictif(s) supprimé(s)`];
    if (movedEnrollments > 0) parts.push(`${movedEnrollments} inscription(s) déplacée(s) vers la classe fictive globale`);

    return res.json({ message: parts.join(', '), deletedLevels, movedEnrollments });
  } catch (error) {
    console.error('Erreur cleanupFictiveLevels:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
