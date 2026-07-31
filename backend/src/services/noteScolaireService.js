const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const CONFIRMED_ENROLLMENT_STATUS = 'CONFIRMED';
// Un professeur doit pouvoir consulter tout élève visible dans son roster de classe
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

// -- Scoping helpers ---------------------------------------------------------

async function getFamilySoutienScolaireStudent({ familyUserId, studentId }) {
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

async function getTeacherSoutienScolaireAccess({ teacherUserId, studentId, classId }) {
  const teacherProfile = await prisma.teacher.findUnique({ where: { userId: teacherUserId } });
  if (!teacherProfile) throw notFound('Profil professeur introuvable');

  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      status: { in: TEACHER_VISIBLE_ENROLLMENT_STATUSES },
      class: { teacherId: teacherProfile.id, ...(classId ? { id: classId } : {}) },
    },
    include: { class: { include: { level: { include: { pole: true } } } } },
  });

  const soutienEnrollment = enrollments.find((enrollment) => isSoutienScolairePole(enrollment.class?.level?.pole?.name));
  if (!soutienEnrollment) throw notFound('Vous n\'avez pas accès aux notes scolaires de cet élève');

  return { teacherProfile, classId: soutienEnrollment.classId };
}

async function assertReadAccess({ user, studentId }) {
  if (user.role === 'FAMILLE') {
    await getFamilySoutienScolaireStudent({ familyUserId: user.id, studentId });
  } else if (user.role === 'PROFESSEUR') {
    await getTeacherSoutienScolaireAccess({ teacherUserId: user.id, studentId });
  } else {
    throw notFound('Accès non autorisé');
  }
}

// -- Notes (saisie famille, lecture famille + professeur) ---------------------

async function listNotes({ studentId }) {
  return prisma.noteScolaire.findMany({
    where: { studentId },
    orderBy: { date: 'desc' },
  });
}

async function createNote({ familyUserId, studentId, period, matiere, note, bareme, date, commentaire }) {
  if (!studentId || !period || !matiere || !matiere.trim()) throw badRequest('studentId, period et matiere sont requis');

  const noteValue = Number(note);
  const baremeValue = bareme != null && bareme !== '' ? Number(bareme) : 20;
  if (!Number.isFinite(noteValue) || noteValue < 0) throw badRequest('La note doit être un nombre positif');
  if (!Number.isFinite(baremeValue) || baremeValue <= 0) throw badRequest('Le barème doit être un nombre positif');
  if (noteValue > baremeValue) throw badRequest('La note ne peut pas dépasser le barème');

  const { soutienClassIds } = await getFamilySoutienScolaireStudent({ familyUserId, studentId });

  return prisma.noteScolaire.create({
    data: {
      studentId,
      classId: soutienClassIds[0],
      period,
      matiere: matiere.trim(),
      note: noteValue,
      bareme: baremeValue,
      date: date ? new Date(date) : new Date(),
      commentaire: commentaire || null,
    },
  });
}

async function deleteNote({ familyUserId, noteId }) {
  const note = await prisma.noteScolaire.findUnique({ where: { id: noteId } });
  if (!note) throw notFound('Note introuvable');
  await getFamilySoutienScolaireStudent({ familyUserId, studentId: note.studentId });

  return prisma.noteScolaire.delete({ where: { id: noteId } });
}

// -- Bulletin scolaire importé (upload famille, lecture famille + professeur) -

async function uploadBulletin({ familyUserId, studentId, period, fileName, fileBase64 }) {
  if (!studentId || !period || !fileName || !fileBase64) {
    throw badRequest('studentId, period, fileName et fileBase64 sont requis');
  }
  const { soutienClassIds } = await getFamilySoutienScolaireStudent({ familyUserId, studentId });

  const uploadsDir = path.resolve(__dirname, '../../uploads/bulletins-scolaires');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(uploadsDir, safeName);
  const buffer = Buffer.from(fileBase64, 'base64');
  fs.writeFileSync(filePath, buffer);

  return prisma.bulletinScolaireUpload.create({
    data: {
      studentId,
      classId: soutienClassIds[0],
      period,
      fileUrl: `/uploads/bulletins-scolaires/${safeName}`,
      fileName,
      uploadedById: familyUserId,
    },
  });
}

// Historique des imports : plusieurs uploads possibles par période (comme pour le
// bulletin Coran) — le frontend prend le plus récent par période via ce tri desc.
async function listBulletinUploads({ studentId }) {
  return prisma.bulletinScolaireUpload.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });
}

async function deleteBulletinUpload({ familyUserId, uploadId }) {
  const upload = await prisma.bulletinScolaireUpload.findUnique({ where: { id: uploadId } });
  if (!upload) throw notFound('Fichier introuvable');
  await getFamilySoutienScolaireStudent({ familyUserId, studentId: upload.studentId });

  const filePath = path.resolve(__dirname, '../../', upload.fileUrl.replace(/^\//, ''));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await prisma.bulletinScolaireUpload.delete({ where: { id: uploadId } });
  return { success: true };
}

module.exports = {
  isSoutienScolairePole,
  assertReadAccess,
  listNotes,
  createNote,
  deleteNote,
  uploadBulletin,
  listBulletinUploads,
  deleteBulletinUpload,
};
