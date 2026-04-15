const { PrismaClient } = require('@prisma/client');
const { sendAccountApprovedEmail, sendAccountRejectedEmail } = require('../services/emailService');

const prisma = new PrismaClient();

/**
 * GET /api/admin/users/pending
 */
async function getPendingUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      where: { validationStatus: 'PENDING' },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, role: true, createdAt: true, emailVerified: true,
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

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, firstName: true, lastName: true,
          phone: true, role: true, validationStatus: true,
          emailVerified: true, createdAt: true, lastLogin: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page: parseInt(page), limit: parseInt(limit) });
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
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { validationStatus: 'APPROVED' },
    });
    await sendAccountApprovedEmail(user);
    res.json({ message: 'Compte validé avec succès', user: { id: user.id, email: user.email, validationStatus: user.validationStatus } });
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
    const [totalUsers, pendingUsers, totalFamilies, totalStudents, totalEnrollments, schoolYears] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { validationStatus: 'PENDING' } }),
      prisma.family.count(),
      prisma.student.count(),
      prisma.enrollment.count(),
      prisma.schoolYear.findMany({ orderBy: { startDate: 'desc' }, take: 5 }),
    ]);

    res.json({
      stats: {
        totalUsers,
        pendingUsers,
        totalFamilies,
        totalStudents,
        totalEnrollments,
      },
      schoolYears,
    });
  } catch (error) {
    console.error('Erreur getStats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/admin/enrollments
 */
async function getEnrollments(req, res) {
  try {
    const { schoolYearId, status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (schoolYearId) where.schoolYearId = schoolYearId;
    if (status) where.status = status;

    const [enrollments, total] = await Promise.all([
      prisma.enrollment.findMany({
        where,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, dateOfBirth: true } },
          class: {
            include: {
              level: { include: { pole: true } },
            },
          },
          schoolYear: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.enrollment.count({ where }),
    ]);

    res.json({ enrollments, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Erreur getEnrollments:', error);
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
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createSchoolYear(req, res) {
  try {
    const { label, startDate, endDate, isCurrent } = req.body;
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

/**
 * CRUD Poles
 */
async function getPoles(req, res) {
  try {
    const poles = await prisma.pole.findMany({
      include: { levels: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ poles });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createPole(req, res) {
  try {
    const { name, description, sortOrder } = req.body;
    const pole = await prisma.pole.create({ data: { name, description, sortOrder } });
    res.status(201).json({ pole });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * CRUD Niveaux
 */
async function createLevel(req, res) {
  try {
    const { poleId, code, name, description, sortOrder, minAge } = req.body;
    const level = await prisma.level.create({ data: { poleId, code, name, description, sortOrder, minAge } });
    res.status(201).json({ level });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * CRUD Classes
 */
async function getClasses(req, res) {
  try {
    const { schoolYearId, levelId } = req.query;
    const where = {};
    if (schoolYearId) where.schoolYearId = schoolYearId;
    if (levelId) where.levelId = levelId;

    const classes = await prisma.class.findMany({
      where,
      include: {
        level: { include: { pole: true } },
        schoolYear: true,
      },
      orderBy: { dayOfWeek: 'asc' },
    });
    res.json({ classes });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createClass(req, res) {
  try {
    const { schoolYearId, levelId, dayOfWeek, startTime, endTime, room, teacherName, teacherUserId, capacity } = req.body;
    const cls = await prisma.class.create({
      data: { schoolYearId, levelId, dayOfWeek, startTime, endTime, room, teacherName, teacherUserId, capacity: capacity || 20 },
    });
    res.status(201).json({ class: cls });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getPendingUsers, getAllUsers, approveUser, rejectUser, getStats,
  getEnrollments, getSchoolYears, createSchoolYear,
  getPoles, createPole, createLevel, getClasses, createClass,
};
