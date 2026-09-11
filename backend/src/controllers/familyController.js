const { PrismaClient } = require('@prisma/client');
const { applyNameCasing } = require('../lib/prismaNameMiddleware');

const prisma = applyNameCasing(new PrismaClient());

/**
 * POST /api/family/profile
 */
async function createOrUpdateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { familyName, addressLine1, addressLine2, postalCode, city, country, phonePrimary, phoneSecondary } = req.body;

    const family = await prisma.family.upsert({
      where: { userId },
      update: { familyName, addressLine1, addressLine2, postalCode, city, country: country || 'France', phonePrimary, phoneSecondary },
      create: { userId, familyName, addressLine1, addressLine2, postalCode, city, country: country || 'France', phonePrimary, phoneSecondary },
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

/**
 * GET /api/family/events
 * Événements du pôle bénévoles ouverts à l'inscription et non réservés à un groupe de bénévoles.
 * L'inscription se fait par enfant (Student), pas au niveau du compte famille.
 */
async function getOpenEvents(req, res) {
  try {
    const family = await prisma.family.findUnique({
      where: { userId: req.user.id },
      include: { students: { select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } } },
    });
    const studentIds = (family?.students || []).map((s) => s.id);

    const events = await prisma.volunteerEvent.findMany({
      where: { registrationOpen: true, groups: { none: {} }, startDate: { gte: new Date() } },
      orderBy: { startDate: 'asc' },
      include: { childRegistrations: { where: { studentId: { in: studentIds } } } },
    });

    res.json({
      children: family?.students || [],
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        description: e.description,
        location: e.location,
        posterUrl: e.posterUrl,
        startDate: e.startDate,
        endDate: e.endDate,
        registeredStudentIds: e.childRegistrations.map((r) => r.studentId),
      })),
    });
  } catch (error) {
    console.error('Erreur getOpenEvents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * PUT /api/family/events/:id/registration
 * body: { studentId, registered }
 */
async function registerForEvent(req, res) {
  try {
    const { id } = req.params;
    const { studentId, registered } = req.body;
    if (!studentId) return res.status(400).json({ error: 'Enfant requis' });

    const family = await prisma.family.findUnique({ where: { userId: req.user.id }, include: { students: { select: { id: true } } } });
    if (!family || !family.students.some((s) => s.id === studentId)) {
      return res.status(403).json({ error: "Cet enfant n'appartient pas à votre famille" });
    }

    const event = await prisma.volunteerEvent.findUnique({ where: { id }, include: { groups: true } });
    if (!event) return res.status(404).json({ error: 'Événement introuvable' });

    if (registered) {
      if (!event.registrationOpen || event.groups.length > 0) {
        return res.status(400).json({ error: "Cet événement n'est pas ouvert aux inscriptions" });
      }
      await prisma.volunteerEventChildRegistration.upsert({
        where: { eventId_studentId: { eventId: id, studentId } },
        update: {},
        create: { eventId: id, studentId },
      });
    } else {
      await prisma.volunteerEventChildRegistration.deleteMany({ where: { eventId: id, studentId } });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erreur registerForEvent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  createOrUpdateProfile, getProfile, addParent, updateParent, deleteParent, getDashboard,
  getOpenEvents, registerForEvent,
};
