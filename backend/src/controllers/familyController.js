const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * POST /api/family/profile
 */
async function createOrUpdateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { familyName, addressLine1, addressLine2, postalCode, city, phonePrimary, phoneSecondary } = req.body;

    const family = await prisma.family.upsert({
      where: { userId },
      update: { familyName, addressLine1, addressLine2, postalCode, city, phonePrimary, phoneSecondary },
      create: { userId, familyName, addressLine1, addressLine2, postalCode, city, phonePrimary, phoneSecondary },
    });

    res.json({ family });
  } catch (error) {
    console.error('Erreur createOrUpdateProfile:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/family/profile
 */
async function getProfile(req, res) {
  try {
    const family = await prisma.family.findUnique({
      where: { userId: req.user.id },
      include: {
        parents: { orderBy: { sortOrder: 'asc' } },
        students: {
          include: {
            enrollments: {
              include: {
                class: {
                  include: { level: { include: { pole: true } } },
                },
                schoolYear: true,
              },
            },
          },
        },
      },
    });

    if (!family) {
      return res.status(404).json({ error: 'Profil famille non trouvé. Veuillez compléter votre profil.' });
    }

    res.json({ family });
  } catch (error) {
    console.error('Erreur getProfile:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/family/parents
 */
async function addParent(req, res) {
  try {
    const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
    if (!family) {
      return res.status(400).json({ error: 'Créez d\'abord votre profil famille' });
    }

    const parentCount = await prisma.parent.count({ where: { familyId: family.id } });
    if (parentCount >= 4) {
      return res.status(400).json({ error: 'Maximum 4 parents/tuteurs par famille' });
    }

    const { civility, lastName, firstName, email, phone, link, isLegalGuardian } = req.body;

    const parent = await prisma.parent.create({
      data: {
        familyId: family.id,
        civility,
        lastName,
        firstName,
        email,
        phone,
        link,
        isLegalGuardian: !!isLegalGuardian,
        sortOrder: parentCount + 1,
      },
    });

    res.status(201).json({ parent });
  } catch (error) {
    console.error('Erreur addParent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * PUT /api/family/parents/:id
 */
async function updateParent(req, res) {
  try {
    const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
    const parent = await prisma.parent.findFirst({ where: { id: req.params.id, familyId: family?.id } });
    if (!parent) return res.status(404).json({ error: 'Parent non trouvé' });

    const updated = await prisma.parent.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ parent: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * DELETE /api/family/parents/:id
 */
async function deleteParent(req, res) {
  try {
    const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
    const parent = await prisma.parent.findFirst({ where: { id: req.params.id, familyId: family?.id } });
    if (!parent) return res.status(404).json({ error: 'Parent non trouvé' });

    await prisma.parent.delete({ where: { id: req.params.id } });
    res.json({ message: 'Parent supprimé' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/family/dashboard
 */
async function getDashboard(req, res) {
  try {
    const family = await prisma.family.findUnique({
      where: { userId: req.user.id },
      include: {
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
        },
        payments: {
          include: { installments: { orderBy: { installmentNumber: 'asc' } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    // Current school year
    const currentYear = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });

    res.json({ family, currentSchoolYear: currentYear });
  } catch (error) {
    console.error('Erreur getDashboard:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  createOrUpdateProfile, getProfile, addParent, updateParent, deleteParent, getDashboard,
};
