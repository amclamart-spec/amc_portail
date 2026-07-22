const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const CONFIRMED_ENROLLMENT_STATUS = 'CONFIRMED';
// Un professeur doit pouvoir évaluer/consulter tout élève visible dans son roster de
// classe (`/absences/class-students`), qui inclut aussi les inscriptions PENDING —
// pas seulement les CONFIRMED, contrairement à la portée famille.
const TEACHER_VISIBLE_ENROLLMENT_STATUSES = ['PENDING', 'CONFIRMED'];
const MAX_PAGE = 604;
const REVISION_TYPES = ['NOUVELLE_PAGE', 'ANCIENNE_PAGE'];
const APPRECIATIONS = ['TRES_BIEN', 'BIEN', 'A_REVOIR'];

function isCoranPole(poleName) {
  return String(poleName || '').toLowerCase().includes('coran');
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

function validatePageRange(pageDebut, pageFin) {
  const debut = Number(pageDebut);
  const fin = Number(pageFin);
  if (!Number.isInteger(debut) || !Number.isInteger(fin)) {
    throw badRequest('pageDebut et pageFin doivent être des nombres entiers');
  }
  if (debut < 1 || fin > MAX_PAGE || debut > fin) {
    throw badRequest(`Plage de pages invalide (1 à ${MAX_PAGE}, pageDebut ≤ pageFin)`);
  }
  return { debut, fin };
}

async function getSourates() {
  return prisma.sourateCoran.findMany({ orderBy: { numero: 'asc' } });
}

// -- Scoping helpers ---------------------------------------------------------

async function getFamilyCoranStudent({ familyUserId, studentId }) {
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

  const coranClassIds = student.enrollments
    .filter((enrollment) => isCoranPole(enrollment.class?.level?.pole?.name))
    .map((enrollment) => enrollment.classId);
  if (coranClassIds.length === 0) throw notFound('Cet élève n\'est inscrit à aucun cours de Coran');

  return { student, coranClassIds };
}

async function getTeacherCoranAccess({ teacherUserId, studentId, classId }) {
  const teacherProfile = await prisma.teacher.findUnique({ where: { userId: teacherUserId } });
  if (!teacherProfile) throw notFound('Profil professeur introuvable');

  const enrollmentWhere = {
    studentId,
    status: { in: TEACHER_VISIBLE_ENROLLMENT_STATUSES },
    class: { teacherId: teacherProfile.id, ...(classId ? { id: classId } : {}) },
  };

  const enrollments = await prisma.enrollment.findMany({
    where: enrollmentWhere,
    include: { class: { include: { level: { include: { pole: true } } } } },
  });

  const coranEnrollment = enrollments.find((enrollment) => isCoranPole(enrollment.class?.level?.pole?.name));
  if (!coranEnrollment) throw notFound('Vous n\'avez pas accès au suivi Coran de cet élève');

  return { teacherProfile, classId: coranEnrollment.classId };
}

// -- Séances (professeur) ----------------------------------------------------

async function listSeances({ studentId }) {
  return prisma.coranSeance.findMany({
    where: { studentId },
    include: { sourate: true },
    orderBy: { date: 'desc' },
  });
}

async function createSeance({ teacherUserId, studentId, classId, sourateId, date, pageDebut, pageFin, noteMemorisation, noteRevisionNouvelle, noteRevisionAncienne, noteTajwid, commentaire }) {
  if (!studentId || !classId || !sourateId || !date) {
    throw badRequest('studentId, classId, sourateId et date sont requis');
  }
  const { debut, fin } = validatePageRange(pageDebut, pageFin);
  await getTeacherCoranAccess({ teacherUserId, studentId, classId });

  const sourate = await prisma.sourateCoran.findUnique({ where: { id: sourateId } });
  if (!sourate) throw notFound('Sourate introuvable');

  [noteMemorisation, noteRevisionNouvelle, noteRevisionAncienne, noteTajwid].forEach((note) => {
    if (note && !APPRECIATIONS.includes(note)) throw badRequest('Appréciation invalide');
  });

  return prisma.coranSeance.create({
    data: {
      studentId,
      classId,
      sourateId,
      date: new Date(date),
      pageDebut: debut,
      pageFin: fin,
      noteMemorisation: noteMemorisation || null,
      noteRevisionNouvelle: noteRevisionNouvelle || null,
      noteRevisionAncienne: noteRevisionAncienne || null,
      noteTajwid: noteTajwid || null,
      commentaire: commentaire || null,
    },
    include: { sourate: true },
  });
}

async function updateSeance({ teacherUserId, seanceId, sourateId, date, pageDebut, pageFin, noteMemorisation, noteRevisionNouvelle, noteRevisionAncienne, noteTajwid, commentaire }) {
  const seance = await prisma.coranSeance.findUnique({ where: { id: seanceId } });
  if (!seance) throw notFound('Séance introuvable');

  await getTeacherCoranAccess({ teacherUserId, studentId: seance.studentId, classId: seance.classId });

  const data = {};
  if (sourateId) {
    const sourate = await prisma.sourateCoran.findUnique({ where: { id: sourateId } });
    if (!sourate) throw notFound('Sourate introuvable');
    data.sourateId = sourateId;
  }
  if (date) data.date = new Date(date);
  if (pageDebut !== undefined || pageFin !== undefined) {
    const { debut, fin } = validatePageRange(pageDebut ?? seance.pageDebut, pageFin ?? seance.pageFin);
    data.pageDebut = debut;
    data.pageFin = fin;
  }
  [['noteMemorisation', noteMemorisation], ['noteRevisionNouvelle', noteRevisionNouvelle], ['noteRevisionAncienne', noteRevisionAncienne], ['noteTajwid', noteTajwid]].forEach(([key, value]) => {
    if (value === undefined) return;
    if (value && !APPRECIATIONS.includes(value)) throw badRequest('Appréciation invalide');
    data[key] = value || null;
  });
  if (commentaire !== undefined) data.commentaire = commentaire || null;

  return prisma.coranSeance.update({ where: { id: seanceId }, data, include: { sourate: true } });
}

// -- Révisions (élève/famille) -----------------------------------------------

async function listRevisions({ studentId }) {
  return prisma.coranRevision.findMany({
    where: { studentId },
    include: { sourate: true },
    orderBy: { date: 'desc' },
  });
}

async function createRevision({ familyUserId, studentId, sourateId, pageDebut, pageFin, type, date }) {
  if (!studentId || !sourateId || !type) throw badRequest('studentId, sourateId et type sont requis');
  if (!REVISION_TYPES.includes(type)) throw badRequest('Type de révision invalide');
  const { debut, fin } = validatePageRange(pageDebut, pageFin);

  await getFamilyCoranStudent({ familyUserId, studentId });

  const sourate = await prisma.sourateCoran.findUnique({ where: { id: sourateId } });
  if (!sourate) throw notFound('Sourate introuvable');

  return prisma.coranRevision.create({
    data: {
      studentId,
      sourateId,
      pageDebut: debut,
      pageFin: fin,
      type,
      date: date ? new Date(date) : new Date(),
    },
    include: { sourate: true },
  });
}

async function deleteRevision({ familyUserId, revisionId }) {
  const revision = await prisma.coranRevision.findUnique({ where: { id: revisionId } });
  if (!revision) throw notFound('Révision introuvable');
  await getFamilyCoranStudent({ familyUserId, studentId: revision.studentId });
  await prisma.coranRevision.delete({ where: { id: revisionId } });
  return { success: true };
}

async function evaluateRevision({ teacherUserId, revisionId, appreciation, commentaireProf }) {
  const revision = await prisma.coranRevision.findUnique({ where: { id: revisionId } });
  if (!revision) throw notFound('Révision introuvable');
  await getTeacherCoranAccess({ teacherUserId, studentId: revision.studentId });

  return prisma.coranRevision.update({
    where: { id: revisionId },
    data: evaluationData(appreciation, commentaireProf),
    include: { sourate: true },
  });
}

// -- Répétitions de pages (élève/famille) ------------------------------------

async function listRepetitions({ studentId }) {
  return prisma.coranRepetition.findMany({
    where: { studentId },
    include: { sourate: true },
    orderBy: { createdAt: 'desc' },
  });
}

async function addRepetitionPages({ familyUserId, studentId, sourateId, pageDebut, pageFin }) {
  if (!studentId) throw badRequest('studentId est requis');
  const { debut, fin } = validatePageRange(pageDebut, pageFin ?? pageDebut);

  await getFamilyCoranStudent({ familyUserId, studentId });

  if (sourateId) {
    const sourate = await prisma.sourateCoran.findUnique({ where: { id: sourateId } });
    if (!sourate) throw notFound('Sourate introuvable');
  }

  const pages = [];
  for (let p = debut; p <= fin; p += 1) pages.push(p);

  const existingRows = await prisma.coranRepetition.findMany({
    where: { studentId, numeroPage: { in: pages } },
    select: { numeroPage: true },
  });
  const existingPages = new Set(existingRows.map((r) => r.numeroPage));
  const toCreate = pages.filter((p) => !existingPages.has(p));

  if (toCreate.length > 0) {
    await prisma.coranRepetition.createMany({
      data: toCreate.map((numeroPage) => ({ studentId, numeroPage, sourateId: sourateId || null, compteur: 0 })),
    });
  }

  const created = await prisma.coranRepetition.findMany({
    where: { studentId, numeroPage: { in: pages } },
    include: { sourate: true },
    orderBy: { numeroPage: 'asc' },
  });

  return { created, addedCount: toCreate.length, skippedCount: pages.length - toCreate.length };
}

async function deleteRepetition({ familyUserId, repetitionId }) {
  const repetition = await prisma.coranRepetition.findUnique({ where: { id: repetitionId } });
  if (!repetition) throw notFound('Page introuvable');
  await getFamilyCoranStudent({ familyUserId, studentId: repetition.studentId });
  await prisma.coranRepetition.delete({ where: { id: repetitionId } });
  return { success: true };
}

function evaluationData(appreciation, commentaireProf) {
  if (appreciation && !APPRECIATIONS.includes(appreciation)) throw badRequest('Appréciation invalide');
  return {
    appreciation: appreciation || null,
    commentaireProf: commentaireProf || null,
    evaluatedAt: new Date(),
  };
}

async function evaluateRepetition({ teacherUserId, repetitionId, appreciation, commentaireProf }) {
  const repetition = await prisma.coranRepetition.findUnique({ where: { id: repetitionId } });
  if (!repetition) throw notFound('Page introuvable');
  await getTeacherCoranAccess({ teacherUserId, studentId: repetition.studentId });

  return prisma.coranRepetition.update({
    where: { id: repetitionId },
    data: evaluationData(appreciation, commentaireProf),
    include: { sourate: true },
  });
}

async function incrementRepetition({ familyUserId, studentId, numeroPage, sourateId }) {
  const page = Number(numeroPage);
  if (!studentId || !Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    throw badRequest(`numeroPage doit être un entier entre 1 et ${MAX_PAGE}`);
  }

  await getFamilyCoranStudent({ familyUserId, studentId });

  if (sourateId) {
    const sourate = await prisma.sourateCoran.findUnique({ where: { id: sourateId } });
    if (!sourate) throw notFound('Sourate introuvable');
  }

  const existing = await prisma.coranRepetition.findUnique({
    where: { studentId_numeroPage: { studentId, numeroPage: page } },
  });

  if (existing) {
    return prisma.coranRepetition.update({
      where: { id: existing.id },
      data: { compteur: existing.compteur + 1, derniereDate: new Date(), ...(sourateId ? { sourateId } : {}) },
      include: { sourate: true },
    });
  }

  return prisma.coranRepetition.create({
    data: { studentId, numeroPage: page, sourateId: sourateId || null, compteur: 1, derniereDate: new Date() },
    include: { sourate: true },
  });
}

// -- Entraînement lecture / Tajwid (élève/famille) ---------------------------

async function listLectures({ studentId }) {
  return prisma.coranLecture.findMany({
    where: { studentId },
    include: { sourate: true },
    orderBy: { date: 'desc' },
  });
}

async function createLecture({ familyUserId, studentId, sourateId, pageDebut, pageFin, date, dureeMinutes, commentaire }) {
  if (!studentId || !sourateId) throw badRequest('studentId et sourateId sont requis');
  const { debut, fin } = validatePageRange(pageDebut, pageFin);

  await getFamilyCoranStudent({ familyUserId, studentId });

  const sourate = await prisma.sourateCoran.findUnique({ where: { id: sourateId } });
  if (!sourate) throw notFound('Sourate introuvable');

  return prisma.coranLecture.create({
    data: {
      studentId,
      sourateId,
      pageDebut: debut,
      pageFin: fin,
      date: date ? new Date(date) : new Date(),
      dureeMinutes: dureeMinutes !== undefined && dureeMinutes !== null && dureeMinutes !== '' ? Number(dureeMinutes) : null,
      commentaire: commentaire || null,
    },
    include: { sourate: true },
  });
}

async function deleteLecture({ familyUserId, lectureId }) {
  const lecture = await prisma.coranLecture.findUnique({ where: { id: lectureId } });
  if (!lecture) throw notFound('Séance de lecture introuvable');
  await getFamilyCoranStudent({ familyUserId, studentId: lecture.studentId });
  await prisma.coranLecture.delete({ where: { id: lectureId } });
  return { success: true };
}

async function evaluateLecture({ teacherUserId, lectureId, appreciation, commentaireProf }) {
  const lecture = await prisma.coranLecture.findUnique({ where: { id: lectureId } });
  if (!lecture) throw notFound('Séance de lecture introuvable');
  await getTeacherCoranAccess({ teacherUserId, studentId: lecture.studentId });

  return prisma.coranLecture.update({
    where: { id: lectureId },
    data: evaluationData(appreciation, commentaireProf),
    include: { sourate: true },
  });
}

// -- Accès en lecture pour un élève (famille OU professeur ayant accès) ------

async function assertReadAccess({ user, studentId }) {
  if (user.role === 'FAMILLE') {
    await getFamilyCoranStudent({ familyUserId: user.id, studentId });
    return;
  }
  if (user.role === 'PROFESSEUR') {
    await getTeacherCoranAccess({ teacherUserId: user.id, studentId });
    return;
  }
  throw notFound('Accès non autorisé');
}

// -- Bulletin (fichier importé par le professeur) ----------------------------

async function uploadBulletin({ teacherUserId, studentId, classId, fileName, fileBase64 }) {
  if (!studentId || !classId || !fileName || !fileBase64) {
    throw badRequest('studentId, classId, fileName et fileBase64 sont requis');
  }
  await getTeacherCoranAccess({ teacherUserId, studentId, classId });

  const uploadsDir = path.resolve(__dirname, '../../uploads/coran-bulletins');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(uploadsDir, safeName);
  const buffer = Buffer.from(fileBase64, 'base64');
  fs.writeFileSync(filePath, buffer);

  return prisma.coranBulletinUpload.create({
    data: {
      studentId,
      classId,
      fileUrl: `/uploads/coran-bulletins/${safeName}`,
      fileName,
      uploadedById: teacherUserId,
    },
  });
}

async function getLatestBulletinUpload({ studentId }) {
  return prisma.coranBulletinUpload.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });
}

async function deleteBulletinUpload({ teacherUserId, uploadId }) {
  const upload = await prisma.coranBulletinUpload.findUnique({ where: { id: uploadId } });
  if (!upload) throw notFound('Fichier introuvable');
  await getTeacherCoranAccess({ teacherUserId, studentId: upload.studentId });

  const filePath = path.resolve(__dirname, '../../', upload.fileUrl.replace(/^\//, ''));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await prisma.coranBulletinUpload.delete({ where: { id: uploadId } });
  return { success: true };
}

module.exports = {
  getSourates,
  assertReadAccess,
  listSeances,
  createSeance,
  updateSeance,
  listRevisions,
  createRevision,
  deleteRevision,
  evaluateRevision,
  listRepetitions,
  addRepetitionPages,
  deleteRepetition,
  evaluateRepetition,
  incrementRepetition,
  listLectures,
  createLecture,
  deleteLecture,
  evaluateLecture,
  uploadBulletin,
  getLatestBulletinUpload,
  deleteBulletinUpload,
};
