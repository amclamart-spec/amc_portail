const { PrismaClient } = require('@prisma/client');
const { classAccessWhere } = require('../utils/classAccessUtils');

const prisma = new PrismaClient();
const CONFIRMED_ENROLLMENT_STATUS = 'CONFIRMED';
// Un professeur doit pouvoir noter tout élève visible dans son roster de classe
// (`/absences/class-students`), qui inclut aussi les inscriptions PENDING —
// contrairement à la portée famille, limitée aux seules inscriptions CONFIRMED.
const TEACHER_VISIBLE_ENROLLMENT_STATUSES = ['PENDING', 'CONFIRMED'];

function isSoutienScolairePole(poleName) {
  return String(poleName || '').toLowerCase().includes('soutien');
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function validateNote(value, label) {
  const note = Number(value);
  if (!Number.isInteger(note) || note < 1 || note > 5) {
    throw badRequest(`${label} doit être un entier entre 1 et 5`);
  }
  return note;
}

// -- Scoping helpers ---------------------------------------------------------

async function getFamilyAppreciationStudent({ familyUserId, studentId }) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, family: { userId: familyUserId } },
    include: {
      enrollments: {
        where: { status: CONFIRMED_ENROLLMENT_STATUS },
        include: { class: { include: { level: { include: { pole: true } } } } },
      },
    },
  });
  if (!student) throw notFound('Élève introuvable pour cette famille');

  const soutienClassIds = student.enrollments
    .filter((enrollment) => isSoutienScolairePole(enrollment.class?.level?.pole?.name))
    .map((enrollment) => enrollment.classId);
  if (soutienClassIds.length === 0) throw notFound('Cet élève n\'est inscrit à aucun cours de soutien scolaire');

  return { student, soutienClassIds };
}

async function getTeacherAppreciationAccess({ teacherUserId, studentId, classId }) {
  const teacherProfile = await prisma.teacher.findUnique({ where: { userId: teacherUserId } });
  if (!teacherProfile) throw notFound('Profil professeur introuvable');

  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      status: { in: TEACHER_VISIBLE_ENROLLMENT_STATUSES },
      class: { ...classAccessWhere(teacherProfile.id), ...(classId ? { id: classId } : {}) },
    },
    include: { class: { include: { level: { include: { pole: true } } } } },
  });

  const soutienEnrollment = enrollments.find((enrollment) => isSoutienScolairePole(enrollment.class?.level?.pole?.name));
  if (!soutienEnrollment) throw notFound('Vous n\'avez pas accès aux appréciations régulières de cet élève');

  return { teacherProfile, classId: soutienEnrollment.classId };
}

async function assertReadAccess({ user, studentId }) {
  if (user.role === 'FAMILLE') {
    await getFamilyAppreciationStudent({ familyUserId: user.id, studentId });
  } else if (user.role === 'PROFESSEUR') {
    await getTeacherAppreciationAccess({ teacherUserId: user.id, studentId });
  } else {
    throw notFound('Accès non autorisé');
  }
}

// -- Lecture ------------------------------------------------------------------

async function listAppreciations({ studentId }) {
  return prisma.appreciationReguliere.findMany({
    where: { studentId },
    orderBy: { date: 'desc' },
  });
}

// -- Professeur : création / suppression --------------------------------------

async function createAppreciation({ teacherUserId, studentId, classId, commentaire, noteTravail, noteComportement, date }) {
  if (!studentId || !classId) throw badRequest('studentId et classId sont requis');
  const { teacherProfile } = await getTeacherAppreciationAccess({ teacherUserId, studentId, classId });

  const travail = validateNote(noteTravail, 'La note de travail');
  const comportement = validateNote(noteComportement, 'La note de comportement');

  return prisma.appreciationReguliere.create({
    data: {
      studentId,
      classId,
      teacherId: teacherProfile.id,
      date: date ? new Date(date) : new Date(),
      commentaire: commentaire || null,
      noteTravail: travail,
      noteComportement: comportement,
    },
  });
}

async function deleteAppreciation({ teacherUserId, id }) {
  const teacherProfile = await prisma.teacher.findUnique({ where: { userId: teacherUserId } });
  if (!teacherProfile) throw notFound('Profil professeur introuvable');

  const appreciation = await prisma.appreciationReguliere.findUnique({ where: { id } });
  if (!appreciation || appreciation.teacherId !== teacherProfile.id) {
    throw notFound('Appréciation introuvable');
  }

  return prisma.appreciationReguliere.delete({ where: { id } });
}

// -- Famille : marquer comme vue ----------------------------------------------

async function markAppreciationSeen({ familyUserId, studentId, id }) {
  await getFamilyAppreciationStudent({ familyUserId, studentId });

  const appreciation = await prisma.appreciationReguliere.findFirst({ where: { id, studentId } });
  if (!appreciation) throw notFound('Appréciation introuvable');

  return prisma.appreciationReguliere.update({
    where: { id },
    data: { vu: true, vuAt: new Date() },
  });
}

module.exports = {
  isSoutienScolairePole,
  assertReadAccess,
  listAppreciations,
  createAppreciation,
  deleteAppreciation,
  markAppreciationSeen,
};
