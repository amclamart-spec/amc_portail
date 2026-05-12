const { PrismaClient } = require('@prisma/client');
const { createActivityLog } = require('../services/activityLogService');
const { computeDashboardAlerts } = require('./adminAdvancedController');

const prisma = new PrismaClient();

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSchoolYearPayload(payload = {}) {
  return {
    name: payload.name || payload.label,
    startDate: payload.startDate,
    endDate: payload.endDate,
    period: payload.period,
    status: payload.status,
  };
}

function buildSchoolYearLabel(startDate, endDate) {
  return `${startDate.getFullYear()}-${endDate.getFullYear()}`;
}

function normalizeSchoolYear(year, stats = null) {
  if (!year) return null;

  return {
    id: year.id,
    name: year.label,
    label: year.label,
    startDate: year.startDate,
    endDate: year.endDate,
    period: year.period || 'ANNUEL',
    status: year.status,
    isCurrent: year.isCurrent,
    createdAt: year.createdAt,
    updatedAt: year.updatedAt,
    stats,
  };
}

async function computeSchoolYearStats(schoolYearId) {
  const [classesCount, enrollmentsCount, studentsDistinct, familiesDistinct, paymentAgg, yearPayments] = await Promise.all([
    prisma.class.count({ where: { schoolYearId } }),
    prisma.enrollment.count({ where: { schoolYearId } }),
    prisma.enrollment.findMany({
      where: { schoolYearId },
      select: { studentId: true, student: { select: { familyId: true } } },
      distinct: ['studentId'],
    }),
    prisma.enrollment.findMany({
      where: { schoolYearId },
      select: { student: { select: { familyId: true } } },
      distinct: ['studentId'],
    }),
    prisma.payment.aggregate({
      where: { schoolYearId },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.payment.findMany({
      where: { schoolYearId },
      select: { familyId: true, totalAmount: true, paidAmount: true },
    }),
  ]);

  const totalAmount = toNumber(paymentAgg._sum.totalAmount);
  const paidAmount = toNumber(paymentAgg._sum.paidAmount);
  const unpaidAmount = Math.max(totalAmount - paidAmount, 0);

  const unpaidFamiliesSet = new Set(
    yearPayments
      .filter((payment) => toNumber(payment.paidAmount) < toNumber(payment.totalAmount))
      .map((payment) => payment.familyId),
  );

  return {
    families: new Set(familiesDistinct.map((item) => item.student.familyId)).size,
    students: studentsDistinct.length,
    classes: classesCount,
    enrollments: enrollmentsCount,
    paymentsTotalAmount: totalAmount,
    paymentsPaidAmount: paidAmount,
    paymentsPaidPercentage: totalAmount > 0 ? Number(((paidAmount / totalAmount) * 100).toFixed(2)) : 0,
    unpaidAmount,
    familiesWithUnpaid: unpaidFamiliesSet.size,
  };
}

async function getSchoolYears(req, res) {
  try {
    const years = await prisma.schoolYear.findMany({ orderBy: { startDate: 'desc' } });
    const withStats = await Promise.all(
      years.map(async (year) => {
        const stats = await computeSchoolYearStats(year.id);
        return normalizeSchoolYear(year, {
          families: stats.families,
          students: stats.students,
          classes: stats.classes,
        });
      }),
    );

    res.json({ schoolYears: withStats });
  } catch (error) {
    console.error('Erreur getSchoolYears (JALON1):', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createSchoolYear(req, res) {
  try {
    const payload = parseSchoolYearPayload(req.body);
    const requestedStatus = payload.status || 'UPCOMING';

    if (!payload.startDate || !payload.endDate) {
      return res.status(400).json({ error: 'startDate et endDate sont requis' });
    }

    const startDate = new Date(payload.startDate);
    const endDate = new Date(payload.endDate);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Dates invalides' });
    }

    if (endDate <= startDate) {
      return res.status(400).json({ error: 'La date de fin doit être après la date de début' });
    }

    const name = (payload.name || '').trim() || buildSchoolYearLabel(startDate, endDate);

    const created = await prisma.$transaction(async (tx) => {
      if (requestedStatus === 'CURRENT') {
        await tx.schoolYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false, status: 'ARCHIVED' } });
      }

      return tx.schoolYear.create({
        data: {
          label: name,
          startDate,
          endDate,
          period: payload.period || 'ANNUEL',
          status: requestedStatus,
          isCurrent: requestedStatus === 'CURRENT',
        },
      });
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'SCHOOL_YEAR_CREATED',
      entityType: 'SchoolYear',
      entityId: created.id,
      details: {
        name: created.label,
        status: created.status,
      },
    });

    res.status(201).json({ schoolYear: normalizeSchoolYear(created) });
  } catch (error) {
    console.error('Erreur createSchoolYear (JALON1):', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Une année scolaire avec ce nom existe déjà' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateSchoolYear(req, res) {
  try {
    const { id } = req.params;
    const payload = parseSchoolYearPayload(req.body);

    const existing = await prisma.schoolYear.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Année scolaire introuvable' });

    const data = {};

    if (payload.name !== undefined) {
      const trimmed = String(payload.name || '').trim();
      if (!trimmed) return res.status(400).json({ error: 'Le nom est requis' });
      data.label = trimmed;
    }

    if (payload.startDate !== undefined) {
      const parsed = new Date(payload.startDate);
      if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'startDate invalide' });
      data.startDate = parsed;
    }

    if (payload.endDate !== undefined) {
      const parsed = new Date(payload.endDate);
      if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'endDate invalide' });
      data.endDate = parsed;
    }

    const computedStart = data.startDate || existing.startDate;
    const computedEnd = data.endDate || existing.endDate;
    if (computedEnd <= computedStart) {
      return res.status(400).json({ error: 'La date de fin doit être après la date de début' });
    }

    if (payload.status !== undefined) {
      if (!['UPCOMING', 'CURRENT', 'ARCHIVED'].includes(payload.status)) {
        return res.status(400).json({ error: 'Statut invalide' });
      }

      if (payload.status === 'CURRENT') {
        return res.status(400).json({ error: 'Utilisez la route d’activation dédiée pour passer une année en cours' });
      }

      data.status = payload.status;
      data.isCurrent = false;
    }

    if (payload.period !== undefined) {
      if (!['MENSUEL', 'TRIMESTRIEL', 'SEMESTRIEL', 'ANNUEL'].includes(payload.period)) {
        return res.status(400).json({ error: 'Période scolaire invalide' });
      }
      data.period = payload.period;
    }

    if (existing.isCurrent && payload.status === 'ARCHIVED') {
      return res.status(400).json({ error: 'Utilisez la route d’archivage dédiée pour l’année en cours' });
    }

    const updated = await prisma.schoolYear.update({ where: { id }, data });
    res.json({ schoolYear: normalizeSchoolYear(updated) });
  } catch (error) {
    console.error('Erreur updateSchoolYear:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Une année scolaire avec ce nom existe déjà' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function activateSchoolYear(req, res) {
  try {
    const { id } = req.params;
    const target = await prisma.schoolYear.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'Année scolaire introuvable' });

    await prisma.$transaction(async (tx) => {
      await tx.schoolYear.updateMany({
        where: {
          id: { not: id },
          isCurrent: true,
        },
        data: {
          isCurrent: false,
          status: 'ARCHIVED',
        },
      });

      await tx.schoolYear.update({
        where: { id },
        data: {
          isCurrent: true,
          status: 'CURRENT',
        },
      });
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'SCHOOL_YEAR_ACTIVATED',
      entityType: 'SchoolYear',
      entityId: id,
      details: { name: target.label },
    });

    const updated = await prisma.schoolYear.findUnique({ where: { id } });
    res.json({ schoolYear: normalizeSchoolYear(updated), message: 'Année scolaire activée' });
  } catch (error) {
    console.error('Erreur activateSchoolYear:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function archiveSchoolYear(req, res) {
  try {
    const { id } = req.params;
    const year = await prisma.schoolYear.findUnique({ where: { id } });
    if (!year) return res.status(404).json({ error: 'Année scolaire introuvable' });

    if (!year.isCurrent || year.status !== 'CURRENT') {
      return res.status(400).json({ error: 'Seule l’année en cours peut être archivée' });
    }

    const archived = await prisma.schoolYear.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        isCurrent: false,
      },
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'SCHOOL_YEAR_ARCHIVED',
      entityType: 'SchoolYear',
      entityId: id,
      details: { name: year.label },
    });

    res.json({ schoolYear: normalizeSchoolYear(archived), message: 'Année scolaire archivée' });
  } catch (error) {
    console.error('Erreur archiveSchoolYear:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getSchoolYearStats(req, res) {
  try {
    const { id } = req.params;
    const year = await prisma.schoolYear.findUnique({ where: { id } });
    if (!year) return res.status(404).json({ error: 'Année scolaire introuvable' });

    const stats = await computeSchoolYearStats(id);

    res.json({
      schoolYear: normalizeSchoolYear(year),
      stats,
    });
  } catch (error) {
    console.error('Erreur getSchoolYearStats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getDashboardStats(req, res) {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const currentYear = await prisma.schoolYear.findFirst({ where: { status: 'CURRENT' }, orderBy: { startDate: 'desc' } });
    const yearWhere = currentYear ? { schoolYearId: currentYear.id } : {};

    const [
      totalFamilies,
      familiesCurrentMonth,
      familiesPreviousMonth,
      totalStudents,
      studentsCurrentMonth,
      studentsPreviousMonth,
      totalTeachers,
      paymentsAggregate,
      paymentsList,
      classesAggregate,
    ] = await Promise.all([
      prisma.family.count(),
      prisma.family.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.family.count({ where: { createdAt: { gte: previousMonthStart, lt: monthStart } } }),
      prisma.student.count(),
      prisma.student.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.student.count({ where: { createdAt: { gte: previousMonthStart, lt: monthStart } } }),
      prisma.teacher.count(),
      prisma.payment.aggregate({ where: yearWhere, _sum: { totalAmount: true, paidAmount: true } }),
      prisma.payment.findMany({ where: yearWhere, select: { familyId: true, totalAmount: true, paidAmount: true } }),
      prisma.class.aggregate({ where: yearWhere, _sum: { capacity: true, enrolledCount: true } }),
    ]);

    const paymentsTotalAmount = toNumber(paymentsAggregate._sum.totalAmount);
    const paymentsPaidAmount = toNumber(paymentsAggregate._sum.paidAmount);
    const unpaidAmount = Math.max(paymentsTotalAmount - paymentsPaidAmount, 0);

    const unpaidFamilies = new Set(
      paymentsList
        .filter((payment) => toNumber(payment.paidAmount) < toNumber(payment.totalAmount))
        .map((payment) => payment.familyId),
    );

    const totalCapacity = toNumber(classesAggregate._sum.capacity);
    const occupiedSeats = toNumber(classesAggregate._sum.enrolledCount);
    const alerts = await computeDashboardAlerts();

    res.json({
      currentSchoolYear: currentYear ? normalizeSchoolYear(currentYear) : null,
      metrics: {
        families: {
          count: totalFamilies,
          growthThisMonth: familiesCurrentMonth,
          growthPreviousMonth: familiesPreviousMonth,
        },
        students: {
          count: totalStudents,
          growthThisMonth: studentsCurrentMonth,
          growthPreviousMonth: studentsPreviousMonth,
        },
        teachers: {
          count: totalTeachers,
        },
        payments: {
          totalAmount: paymentsTotalAmount,
          paidAmount: paymentsPaidAmount,
          paidPercentage: paymentsTotalAmount > 0 ? Number(((paymentsPaidAmount / paymentsTotalAmount) * 100).toFixed(2)) : 0,
        },
        unpaid: {
          amount: unpaidAmount,
          familiesCount: unpaidFamilies.size,
        },
        classes: {
          occupied: occupiedSeats,
          totalCapacity,
          fillRate: totalCapacity > 0 ? Number(((occupiedSeats / totalCapacity) * 100).toFixed(2)) : 0,
        },
      },
      alerts,
    });
  } catch (error) {
    console.error('Erreur getDashboardStats (JALON1):', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getRecentActivity(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const activities = await prisma.activityLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
    });

    res.json({ activities });
  } catch (error) {
    console.error('Erreur getRecentActivity:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getSchoolYears,
  createSchoolYear,
  updateSchoolYear,
  activateSchoolYear,
  archiveSchoolYear,
  getSchoolYearStats,
  getDashboardStats,
  getRecentActivity,
};