const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * POST /api/students
 */
async function addStudent(req, res) {
  try {
    const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
    if (!family) {
      return res.status(400).json({ error: 'Créez d\'abord votre profil famille' });
    }

    const { lastName, firstName, dateOfBirth, gender, allergies, currentTreatments, emergencyContactName, emergencyContactPhone } = req.body;

    const student = await prisma.student.create({
      data: {
        familyId: family.id,
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

    res.status(201).json({ student });
  } catch (error) {
    console.error('Erreur addStudent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/students
 */
async function getStudents(req, res) {
  try {
    const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
    if (!family) {
      return res.json({ students: [] });
    }

    const students = await prisma.student.findMany({
      where: { familyId: family.id },
      include: {
        enrollments: {
          include: {
            class: { include: { level: { include: { pole: true } } } },
            schoolYear: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ students });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * PUT /api/students/:id
 */
async function updateStudent(req, res) {
  try {
    const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
    const student = await prisma.student.findFirst({ where: { id: req.params.id, familyId: family?.id } });
    if (!student) return res.status(404).json({ error: 'Élève non trouvé' });

    const { lastName, firstName, dateOfBirth, gender, allergies, currentTreatments, emergencyContactName, emergencyContactPhone } = req.body;

    const updated = await prisma.student.update({
      where: { id: req.params.id },
      data: {
        ...(lastName && { lastName }),
        ...(firstName && { firstName }),
        ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
        ...(gender && { gender }),
        allergies,
        currentTreatments,
        emergencyContactName,
        emergencyContactPhone,
      },
    });

    res.json({ student: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * DELETE /api/students/:id
 */
async function deleteStudent(req, res) {
  try {
    const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
    const student = await prisma.student.findFirst({ where: { id: req.params.id, familyId: family?.id } });
    if (!student) return res.status(404).json({ error: 'Élève non trouvé' });

    await prisma.student.delete({ where: { id: req.params.id } });
    res.json({ message: 'Élève supprimé' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = { addStudent, getStudents, updateStudent, deleteStudent };
