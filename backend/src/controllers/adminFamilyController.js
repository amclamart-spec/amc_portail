const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { createActivityLog } = require('../services/activityLogService');

const prisma = new PrismaClient();

function buildFamilySearchWhere({ search, accountStatus }) {
  const where = {};

  if (accountStatus) {
    where.accountStatus = accountStatus;
  }

  if (search) {
    const query = String(search).trim();
    if (query) {
      where.OR = [
        { familyName: { contains: query, mode: 'insensitive' } },
        { city: { contains: query, mode: 'insensitive' } },
        { postalCode: { contains: query, mode: 'insensitive' } },
        { user: { email: { contains: query, mode: 'insensitive' } } },
        { user: { firstName: { contains: query, mode: 'insensitive' } } },
        { user: { lastName: { contains: query, mode: 'insensitive' } } },
      ];
    }
  }

  return where;
}

async function getFamilies(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const offset = (page - 1) * limit;

    const where = buildFamilySearchWhere({
      search: req.query.search,
      accountStatus: req.query.accountStatus,
    });

    const [rows, total] = await Promise.all([
      prisma.family.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              validationStatus: true,
            },
          },
          _count: {
            select: {
              parents: true,
              students: true,
              payments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.family.count({ where }),
    ]);

    const families = await Promise.all(
      rows.map(async (family) => {
        const aggregate = await prisma.payment.aggregate({
          where: { familyId: family.id },
          _sum: { totalAmount: true, paidAmount: true },
        });

        const totalAmount = Number(aggregate._sum.totalAmount || 0);
        const paidAmount = Number(aggregate._sum.paidAmount || 0);

        return {
          ...family,
          financial: {
            totalAmount,
            paidAmount,
            unpaidAmount: Math.max(totalAmount - paidAmount, 0),
          },
        };
      }),
    );

    res.json({
      families,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('Erreur getFamilies:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getFamilyDetails(req, res) {
  try {
    const { id } = req.params;

    const family = await prisma.family.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            validationStatus: true,
            createdAt: true,
          },
        },
        parents: { orderBy: { sortOrder: 'asc' } },
        students: {
          include: {
            enrollments: {
              include: {
                class: { include: { level: { include: { pole: true } } } },
                schoolYear: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        payments: {
          include: {
            installments: {
              orderBy: { installmentNumber: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!family) {
      return res.status(404).json({ error: 'Famille introuvable' });
    }

    await createActivityLog({
      userId: req.user?.id,
      action: 'ADMIN_FAMILY_VIEWED',
      entityType: 'Family',
      entityId: id,
      details: { familyName: family.familyName },
    });

    res.json({ family });
  } catch (error) {
    console.error('Erreur getFamilyDetails:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createFamilyParent(req, res) {
  try {
    const { id: familyId } = req.params;
    const { civility, lastName, firstName, email, phone, link, isLegalGuardian } = req.body;

    if (!lastName || !firstName || !phone || !link || !civility) {
      return res.status(400).json({ error: 'civility, lastName, firstName, phone et link sont requis' });
    }

    const family = await prisma.family.findUnique({ where: { id: familyId } });
    if (!family) return res.status(404).json({ error: 'Famille introuvable' });

    const parentCount = await prisma.parent.count({ where: { familyId } });

    const parent = await prisma.parent.create({
      data: {
        familyId,
        civility,
        lastName,
        firstName,
        email,
        phone,
        link,
        isLegalGuardian: Boolean(isLegalGuardian),
        sortOrder: parentCount + 1,
      },
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'ADMIN_PARENT_CREATED',
      entityType: 'Parent',
      entityId: parent.id,
      details: { familyId, firstName, lastName },
    });

    res.status(201).json({ parent });
  } catch (error) {
    console.error('Erreur createFamilyParent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateFamilyParent(req, res) {
  try {
    const { familyId, parentId } = req.params;

    const parent = await prisma.parent.findFirst({ where: { id: parentId, familyId } });
    if (!parent) return res.status(404).json({ error: 'Parent introuvable pour cette famille' });

    const updated = await prisma.parent.update({
      where: { id: parentId },
      data: {
        ...(req.body.civility !== undefined ? { civility: req.body.civility } : {}),
        ...(req.body.lastName !== undefined ? { lastName: req.body.lastName } : {}),
        ...(req.body.firstName !== undefined ? { firstName: req.body.firstName } : {}),
        ...(req.body.email !== undefined ? { email: req.body.email } : {}),
        ...(req.body.phone !== undefined ? { phone: req.body.phone } : {}),
        ...(req.body.link !== undefined ? { link: req.body.link } : {}),
        ...(req.body.isLegalGuardian !== undefined ? { isLegalGuardian: Boolean(req.body.isLegalGuardian) } : {}),
      },
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'ADMIN_PARENT_UPDATED',
      entityType: 'Parent',
      entityId: parentId,
      details: { familyId },
    });

    res.json({ parent: updated });
  } catch (error) {
    console.error('Erreur updateFamilyParent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteFamilyParent(req, res) {
  try {
    const { familyId, parentId } = req.params;
    const parent = await prisma.parent.findFirst({ where: { id: parentId, familyId } });
    if (!parent) return res.status(404).json({ error: 'Parent introuvable pour cette famille' });

    await prisma.parent.delete({ where: { id: parentId } });

    await createActivityLog({
      userId: req.user?.id,
      action: 'ADMIN_PARENT_DELETED',
      entityType: 'Parent',
      entityId: parentId,
      details: { familyId, firstName: parent.firstName, lastName: parent.lastName },
    });

    res.json({ message: 'Parent supprimé' });
  } catch (error) {
    console.error('Erreur deleteFamilyParent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createFamilyStudent(req, res) {
  try {
    const { id: familyId } = req.params;
    const {
      lastName,
      firstName,
      dateOfBirth,
      gender,
      allergies,
      currentTreatments,
      emergencyContactName,
      emergencyContactPhone,
    } = req.body;

    if (!lastName || !firstName || !dateOfBirth || !gender) {
      return res.status(400).json({ error: 'lastName, firstName, dateOfBirth et gender sont requis' });
    }

    const family = await prisma.family.findUnique({ where: { id: familyId } });
    if (!family) return res.status(404).json({ error: 'Famille introuvable' });

    const student = await prisma.student.create({
      data: {
        familyId,
        lastName,
        firstName,
        dateOfBirth: new Date(dateOfBirth),
        gender,
        allergies,
        currentTreatments,
        emergencyContactName,
        emergencyContactPhone,
      },
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'ADMIN_STUDENT_CREATED',
      entityType: 'Student',
      entityId: student.id,
      details: { familyId, firstName, lastName },
    });

    res.status(201).json({ student });
  } catch (error) {
    console.error('Erreur createFamilyStudent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateFamilyStudent(req, res) {
  try {
    const { familyId, studentId } = req.params;

    const student = await prisma.student.findFirst({ where: { id: studentId, familyId } });
    if (!student) return res.status(404).json({ error: 'Élève introuvable pour cette famille' });

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: {
        ...(req.body.lastName !== undefined ? { lastName: req.body.lastName } : {}),
        ...(req.body.firstName !== undefined ? { firstName: req.body.firstName } : {}),
        ...(req.body.dateOfBirth !== undefined ? { dateOfBirth: new Date(req.body.dateOfBirth) } : {}),
        ...(req.body.gender !== undefined ? { gender: req.body.gender } : {}),
        ...(req.body.allergies !== undefined ? { allergies: req.body.allergies } : {}),
        ...(req.body.currentTreatments !== undefined ? { currentTreatments: req.body.currentTreatments } : {}),
        ...(req.body.emergencyContactName !== undefined ? { emergencyContactName: req.body.emergencyContactName } : {}),
        ...(req.body.emergencyContactPhone !== undefined ? { emergencyContactPhone: req.body.emergencyContactPhone } : {}),
      },
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'ADMIN_STUDENT_UPDATED',
      entityType: 'Student',
      entityId: studentId,
      details: { familyId },
    });

    res.json({ student: updated });
  } catch (error) {
    console.error('Erreur updateFamilyStudent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteFamilyStudent(req, res) {
  try {
    const { familyId, studentId } = req.params;

    const student = await prisma.student.findFirst({ where: { id: studentId, familyId } });
    if (!student) return res.status(404).json({ error: 'Élève introuvable pour cette famille' });

    await prisma.student.delete({ where: { id: studentId } });

    await createActivityLog({
      userId: req.user?.id,
      action: 'ADMIN_STUDENT_DELETED',
      entityType: 'Student',
      entityId: studentId,
      details: { familyId, firstName: student.firstName, lastName: student.lastName },
    });

    res.json({ message: 'Élève supprimé' });
  } catch (error) {
    console.error('Erreur deleteFamilyStudent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

const { completeExistingFamilyRegistration } = require('./familyWizardController');

async function adminEnrollForFamily(req, res) {
  const { id: familyId } = req.params;
  try {
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    if (!family) return res.status(404).json({ error: 'Famille introuvable' });

    // Proxy req.user so completeExistingFamilyRegistration finds the family by userId
    // Preserve firstName/lastName so the paymentTransaction payerName is set correctly
    const proxyReq = Object.create(req);
    proxyReq.user = {
      ...req.user,
      id: family.userId,
      firstName: family.user?.firstName || req.user.firstName || '',
      lastName: family.user?.lastName || req.user.lastName || '',
      email: family.user?.email || req.user.email || '',
    };

    return await completeExistingFamilyRegistration(proxyReq, res);
  } catch (error) {
    console.error('Erreur adminEnrollForFamily:', error);
    // Erreurs de validation métier → 400, erreurs serveur → 500
    const isValidationError = error.message && (
      error.message.includes('Fiche sanitaire') ||
      error.message.includes('Adresse') ||
      error.message.includes('Ajoutez au moins') ||
      error.message.includes('Engagement incomplet')
    );
    return res.status(isValidationError ? 400 : 500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function adminEnrollNewFamily(req, res) {
  const { email, address } = req.body;

  if (!email || !address?.familyName || !address?.addressLine1 || !address?.postalCode || !address?.city || !address?.phonePrimary) {
    return res.status(400).json({ error: 'Email, nom famille, adresse et téléphone sont requis' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Un compte avec cet email existe déjà' });
    }

    // Mot de passe aléatoire — la famille pourra le réinitialiser
    const tempPassword = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: hashedPassword,
          firstName: address.familyName,
          lastName: '',
          role: 'FAMILLE',
          validationStatus: 'APPROVED',
          emailVerified: true,
        },
      });

      const family = await tx.family.create({
        data: {
          userId: user.id,
          familyName: address.familyName,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2 || null,
          postalCode: address.postalCode,
          city: address.city,
          country: address.country || 'France',
          phonePrimary: address.phonePrimary,
          phoneSecondary: address.phoneSecondary || null,
        },
      });

      return { user, family };
    });

    await createActivityLog({
      userId: req.user?.id,
      action: 'ADMIN_NEW_FAMILY_ENROLLED',
      entityType: 'Family',
      entityId: result.family.id,
      details: { email, familyName: address.familyName },
    });

    const proxyReq = Object.create(req);
    proxyReq.user = {
      ...req.user,
      id: result.user.id,
      firstName: address.familyName,
      lastName: '',
      email,
    };
    return await completeExistingFamilyRegistration(proxyReq, res);
  } catch (error) {
    console.error('Erreur adminEnrollNewFamily:', error);
    const isValidationError = error.message && (
      error.message.includes('Fiche sanitaire') ||
      error.message.includes('Adresse') ||
      error.message.includes('Ajoutez au moins') ||
      error.message.includes('Engagement incomplet')
    );
    return res.status(isValidationError ? 400 : 500).json({ error: error.message || 'Erreur serveur' });
  }
}

module.exports = {
  getFamilies,
  getFamilyDetails,
  createFamilyParent,
  updateFamilyParent,
  deleteFamilyParent,
  createFamilyStudent,
  updateFamilyStudent,
  deleteFamilyStudent,
  adminEnrollForFamily,
  adminEnrollNewFamily,
};
