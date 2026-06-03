const { PrismaClient } = require('@prisma/client');
const { calculateFamilyTotal, resolvePricingConfig } = require('../services/pricingService');
const { sendEnrollmentConfirmationEmail } = require('../services/emailService');
const { getNextEnrollmentRegistrationCode } = require('../utils/enrollmentUtils');
const { isProvisionalClass } = require('../utils/provisionalClassUtils');
const { isRegistrationBlocked } = require('../services/systemService');

const prisma = new PrismaClient();

/**
 * GET /api/enrollments/registration-block (public)
 */
async function getRegistrationBlockPublic(req, res) {
  try {
    const blocked = await isRegistrationBlocked();
    res.json({ blocked });
  } catch (error) {
    console.error('Erreur getRegistrationBlockPublic:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/enrollments/poles — liste des pôles avec niveaux
 */
async function getPolesAndLevels(req, res) {
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

/**
 * GET /api/enrollments/classes?levelId=&schoolYearId=
 */
async function getAvailableClasses(req, res) {
  try {
    const { levelId, schoolYearId } = req.query;
    const where = {};
    if (levelId) where.levelId = levelId;
    if (schoolYearId) {
      where.schoolYearId = schoolYearId;
    } else {
      const currentYear = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });
      if (currentYear) where.schoolYearId = currentYear.id;
    }

    const classes = await prisma.class.findMany({
      where,
      include: {
        level: { include: { pole: true } },
        pole: true,
        schoolYear: true,
      },
      orderBy: { dayOfWeek: 'asc' },
    });

    res.json({ classes });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/enrollments — inscrire un élève à une classe
 */
async function createEnrollment(req, res) {
  try {
    const blocked = await isRegistrationBlocked();
    if (blocked) {
      return res.status(403).json({ error: 'Les inscriptions sont temporairement bloquées par le secrétariat' });
    }

    const { studentId, classId } = req.body;

    // Vérifier que l'élève appartient à la famille
    const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
    const student = await prisma.student.findFirst({ where: { id: studentId, familyId: family?.id } });
    if (!student) {
      return res.status(404).json({ error: 'Élève non trouvé' });
    }

    // Vérifier la classe
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: { level: { include: { pole: true } }, schoolYear: true },
    });
    if (!cls) {
      return res.status(404).json({ error: 'Classe non trouvée' });
    }
    // Vérifier l'âge minimum
    if (cls.level.minAge) {
      const age = Math.floor((Date.now() - student.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < cls.level.minAge) {
        return res.status(400).json({ error: `L'âge minimum pour ce cours est de ${cls.level.minAge} ans` });
      }
    }

    // Vérifier les doublons
    const existing = await prisma.enrollment.findFirst({
      where: { studentId, classId, schoolYearId: cls.schoolYearId },
    });
    if (existing) {
      return res.status(409).json({ error: 'Cet élève est déjà inscrit à cette classe' });
    }

    // Générer un identifiant d'inscription et créer l'inscription
    const registrationCode = await getNextEnrollmentRegistrationCode(prisma, cls.schoolYearId);
    const [enrollment] = await prisma.$transaction([
      prisma.enrollment.create({
        data: {
          studentId,
          classId,
          schoolYearId: cls.schoolYearId,
          status: 'PENDING',
          registrationCode,
        },
      }),
      prisma.class.update({
        where: { id: classId },
        data: {
          enrolledCount: { increment: 1 },
          status: cls.enrolledCount + 1 >= cls.capacity ? 'FULL' : 'OPEN',
        },
      }),
    ]);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user) {
      await sendEnrollmentConfirmationEmail(user, `${student.firstName} ${student.lastName} - ${cls.level.pole.name} / ${cls.level.name}`);
    }

    res.status(201).json({
      enrollment,
      class: cls,
      message: 'Inscription enregistrée avec succès',
    });
  } catch (error) {
    console.error('Erreur createEnrollment:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/enrollments/summary — récapitulatif tarifs famille
 */
async function getEnrollmentSummary(req, res) {
  try {
    const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
    if (!family) return res.status(404).json({ error: 'Profil famille non trouvé' });

    const currentYear = await prisma.schoolYear.findFirst({ where: { isCurrent: true } });
    if (!currentYear) return res.json({ enrollments: [], pricing: null });

    const enrollments = await prisma.enrollment.findMany({
      where: {
        student: { familyId: family.id },
        schoolYearId: currentYear.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        student: true,
        class: { include: { level: { include: { pole: true } } } },
      },
    });

    const enrollmentData = enrollments.map((e) => ({
      enrollmentId: e.id,
      studentName: `${e.student.lastName} ${e.student.firstName}`,
      poleName: e.class.level.pole.name,
      poleId: e.class.level.pole.id,
      levelName: e.class.level.name,
      levelCode: e.class.level.code,
      levelId: e.class.level.id,
      schedule: `${e.class.dayOfWeek} ${e.class.startTime}-${e.class.endTime}`,
      status: e.status,
      room: e.class.room || null,
      teacherName: e.class.teacherName || null,
      classLabel: `${e.class.level.pole.name} — ${e.class.level.name}`,
    }));

    // mark provisional enrollments (assigned to the provisional class)
    const enhanced = enrollmentData.map((d, idx) => {
      const cls = enrollments[idx].class;
      const isProvisional = isProvisionalClass(cls);
      if (isProvisional) {
        return {
          ...d,
          isProvisional: true,
          classLabel: 'Classe fictive',
          levelName: 'Classe fictive',
          levelCode: '',
          schedule: 'À affecter',
          room: null,
          teacherName: null,
        };
      }
      return { ...d, isProvisional: false };
    });

    const pricingConfig = await resolvePricingConfig(prisma);
    
    // Build totalFamilyEnrollmentsByPole from the enrollments
    const totalFamilyEnrollmentsByPole = {};
    for (const e of enrollments) {
      const poleName = String(e.class.level.pole.name || '').toLowerCase();
      const poleId = e.class.level.pole.id || '';
      const poleKey = poleId || poleName;
      if (poleKey) {
        totalFamilyEnrollmentsByPole[poleKey] = (totalFamilyEnrollmentsByPole[poleKey] || 0) + 1;
      }
    }
    
    // Count existing Arabic enrollments
    const existingArabicCount = enrollments.filter((e) =>
      String(e.class.level.pole.name || '').toLowerCase().includes('arabe')
    ).length;

    const pricingForCalculation = enrollments.map((e) => ({
      poleId: e.class.level.pole.id,
      levelId: e.class.level.id,
      poleName: e.class.level.pole.name,
      levelCode: e.class.level.code,
    }));

    const pricing = calculateFamilyTotal(pricingForCalculation, pricingConfig, {
      totalFamilyEnrollmentsByPole,
      existingArabicCount,
    });

    res.json({
      enrollments: enhanced,
      pricing,
      schoolYear: currentYear,
    });
  } catch (error) {
    console.error('Erreur getEnrollmentSummary:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * DELETE /api/enrollments/:id — annuler une inscription
 */
async function cancelEnrollment(req, res) {
  try {
    const family = await prisma.family.findUnique({ where: { userId: req.user.id } });
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        id: req.params.id,
        student: { familyId: family?.id },
        status: 'PENDING',
      },
    });

    if (!enrollment) {
      return res.status(404).json({ error: 'Inscription non trouvée ou non annulable' });
    }

    await prisma.$transaction([
      prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      }),
      prisma.class.update({
        where: { id: enrollment.classId },
        data: {
          enrolledCount: { decrement: 1 },
          status: 'OPEN',
        },
      }),
    ]);

    res.json({ message: 'Inscription annulée' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getPolesAndLevels,
  getAvailableClasses,
  createEnrollment,
  getEnrollmentSummary,
  cancelEnrollment,
  getRegistrationBlockPublic,
};
