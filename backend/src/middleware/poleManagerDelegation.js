const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Le nom du rôle porte lui-même l'information du pôle : aucune donnée ne relie
// aujourd'hui un compte responsable à un `Pole` en base (comptes créés via
// backend/scripts/createResponsableAccounts.js). Noms de pôles confirmés en DB :
// Arabe, Coran, Soutien scolaire, Sciences islamiques.
const POLE_ROLE_TO_NAME = {
  RESPONSABLE_POLE_CORAN: 'Coran',
  RESPONSABLE_POLE_ARABE: 'Arabe',
  RESPONSABLE_POLE_SOUTIEN_SCO: 'Soutien scolaire',
  RESPONSABLE_POLE_SCIENCE_IS: 'Sciences islamiques',
};
const POLE_MANAGER_ROLES = Object.keys(POLE_ROLE_TO_NAME);

const TEACHER_VISIBLE_ENROLLMENT_STATUSES = ['PENDING', 'CONFIRMED'];
const CLASS_INCLUDE = { level: { include: { pole: true } }, teacher: { include: { user: true } } };

// Substitue l'identité d'un responsable de pôle par celle du professeur titulaire
// de la classe visée, pour la durée de la requête — tout le code métier existant
// (paramétré par teacherUserId/req.user.id) fonctionne alors sans modification.
async function actAsClassTeacher(req, res, next) {
  try {
    if (!POLE_MANAGER_ROLES.includes(req.user.role)) return next();

    const poleName = POLE_ROLE_TO_NAME[req.user.role];
    const classId = req.query.classId || req.body?.classId;
    const studentId = req.params.studentId || req.query.studentId || req.body?.studentId;
    const lessonId = req.params.lessonId;

    let classRecord = null;
    if (classId) {
      classRecord = await prisma.class.findUnique({ where: { id: classId }, include: CLASS_INCLUDE });
    } else if (studentId) {
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          studentId,
          status: { in: TEACHER_VISIBLE_ENROLLMENT_STATUSES },
          class: { level: { pole: { name: { equals: poleName, mode: 'insensitive' } } } },
        },
        include: { class: { include: CLASS_INCLUDE } },
      });
      classRecord = enrollment?.class || null;
    } else if (lessonId) {
      const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { class: { include: CLASS_INCLUDE } } });
      classRecord = lesson?.class || null;
    }

    if (!classRecord) {
      return res.status(400).json({ error: 'Classe introuvable ou non déterminable pour cette action' });
    }
    if ((classRecord.level?.pole?.name || '').toLowerCase() !== poleName.toLowerCase()) {
      return res.status(403).json({ error: 'Cette classe n\'appartient pas à votre pôle' });
    }
    if (!classRecord.teacher?.user) {
      return res.status(404).json({ error: 'Aucun professeur assigné à cette classe' });
    }

    req.user = { ...req.user, id: classRecord.teacher.user.id, role: 'PROFESSEUR' };
    return next();
  } catch (error) {
    console.error('Erreur actAsClassTeacher:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = { actAsClassTeacher, POLE_MANAGER_ROLES, POLE_ROLE_TO_NAME };
