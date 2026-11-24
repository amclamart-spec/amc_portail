const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { classAccessWhere } = require('../utils/classAccessUtils');
const { mimeTypeFromFileName } = require('../utils/fileDownload');

const prisma = new PrismaClient();

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

// Tous les champs d'un devoir sauf le contenu binaire de la pièce jointe, qui n'est
// chargé que par la route de téléchargement.
const HOMEWORK_SELECT = {
  id: true,
  classId: true,
  teacherId: true,
  date: true,
  body: true,
  attachmentUrl: true,
  attachmentFilename: true,
  attachmentMimeType: true,
  createdAt: true,
  updatedAt: true,
};

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Pièce jointe en base (attachmentMimeType renseigné) ou ancien fichier de uploads/.
function hasHomeworkAttachment(homework) {
  return Boolean(homework.attachmentMimeType || homework.attachmentUrl);
}

function serializeHomework(homework) {
  const { attachmentMimeType, ...rest } = homework;
  return { ...rest, hasAttachment: hasHomeworkAttachment(homework) };
}

async function getTeacherProfile(userId) {
  return prisma.teacher.findUnique({ where: { userId } });
}

async function saveHomeworkMessage({ teacherUserId, classId, date, message, attachmentFilename, attachmentBase64 }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, ...classAccessWhere(teacherProfile.id) } });
  if (!classRecord) throw new Error('Vous n’avez pas accès à cette classe');
  if (!date || !message) throw new Error('date et message sont requis');

  // Sans nouveau fichier, la pièce jointe existante (s'il y en a une) est conservée.
  let attachmentData = {};
  if (attachmentBase64 && attachmentFilename) {
    const fileName = String(attachmentFilename).trim().slice(0, 200);
    const buffer = Buffer.from(attachmentBase64, 'base64');
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      throw httpError(400, 'La pièce jointe ne doit pas dépasser 5 Mo');
    }
    attachmentData = {
      attachmentFilename: fileName,
      attachmentMimeType: mimeTypeFromFileName(fileName),
      attachmentData: buffer,
      attachmentUrl: null,
    };
  }

  const homework = await prisma.homeworkMessage.upsert({
    where: {
      classId_date: {
        classId,
        date: new Date(date),
      },
    },
    create: {
      classId,
      teacherId: teacherProfile.id,
      date: new Date(date),
      body: message,
      ...attachmentData,
    },
    update: {
      body: message,
      date: new Date(date),
      ...attachmentData,
    },
    select: HOMEWORK_SELECT,
  });

  return serializeHomework(homework);
}

async function fetchHomeworkMessage({ teacherUserId, classId, date }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, ...classAccessWhere(teacherProfile.id) } });
  if (!classRecord) throw new Error('Vous n’avez pas accès à cette classe');
  if (!date) throw new Error('Date est requise');

  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const homework = await prisma.homeworkMessage.findFirst({
    where: {
      classId,
      date: { gte: targetDate, lt: nextDate },
    },
    orderBy: { updatedAt: 'desc' },
    select: HOMEWORK_SELECT,
  });
  return homework ? serializeHomework(homework) : null;
}

async function fetchHomeworkMessagesForFamily({ familyUserId }) {
  const family = await prisma.family.findUnique({ where: { userId: familyUserId } });
  if (!family) throw new Error('Famille introuvable');

  const studentIds = await prisma.student.findMany({ where: { familyId: family.id }, select: { id: true } });
  const classIds = await prisma.enrollment.findMany({
    where: {
      studentId: { in: studentIds.map((s) => s.id) },
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    select: { classId: true },
  });

  const uniqueClassIds = [...new Set(classIds.map((item) => item.classId))];

  const homeworks = await prisma.homeworkMessage.findMany({
    where: { classId: { in: uniqueClassIds } },
    orderBy: { date: 'desc' },
    select: {
      ...HOMEWORK_SELECT,
      class: { select: { level: { select: { name: true, pole: { select: { name: true } } } } } },
    },
  });
  return homeworks.map(({ class: cls, ...homework }) => ({
    ...serializeHomework(homework),
    classLabel: [cls?.level?.pole?.name, cls?.level?.name].filter(Boolean).join(' — ') || 'Classe',
  }));
}

async function fetchHomeworkMessagesByClass({ teacherUserId, classId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, ...classAccessWhere(teacherProfile.id) } });
  if (!classRecord) throw new Error('Vous n’avez pas accès à cette classe');

  const totalStudents = await prisma.enrollment.count({
    where: { classId, status: { in: ['PENDING', 'CONFIRMED'] } },
  });

  // Pas de filtre par année scolaire ici : `classId` scope déjà à une seule année
  // (chaque Class a son propre schoolYearId). Un filtre calculé sur la date du jour
  // (indépendant du schoolYearId réel de la classe) masquait silencieusement des
  // devoirs bien réels dès que leur date sortait de cette fenêtre glissante Sept-Août
  // — même bug que celui corrigé sur le classement des absences.
  const homeworks = await prisma.homeworkMessage.findMany({
    where: { classId },
    select: {
      ...HOMEWORK_SELECT,
      completions: {
        include: { student: true },
        orderBy: { completedAt: 'asc' },
      },
    },
    orderBy: { date: 'desc' },
  });

  return homeworks.map((homework) => ({
    ...serializeHomework(homework),
    completions: homework.completions.map((completion) => ({
      studentId: completion.studentId,
      studentName: `${completion.student.firstName} ${completion.student.lastName}`,
      completedAt: completion.completedAt,
    })),
    totalStudents,
  }));
}

// Contenu de la pièce jointe d'un devoir : en base, ou ancien fichier de uploads/
// tant qu'il existe encore sur le disque du serveur.
async function readHomeworkAttachment(homeworkId) {
  const homework = await prisma.homeworkMessage.findUnique({
    where: { id: homeworkId },
    select: { classId: true, attachmentFilename: true, attachmentMimeType: true, attachmentData: true, attachmentUrl: true },
  });
  if (!homework) throw httpError(404, 'Devoir introuvable');

  const fileName = homework.attachmentFilename || 'piece-jointe';
  if (homework.attachmentData) {
    return {
      classId: homework.classId,
      fileName,
      mimeType: homework.attachmentMimeType || 'application/octet-stream',
      data: Buffer.from(homework.attachmentData),
    };
  }
  if (homework.attachmentUrl && homework.attachmentUrl.startsWith('/uploads/homeworks/')) {
    const filePath = path.resolve(__dirname, '../../', homework.attachmentUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      return {
        classId: homework.classId,
        fileName,
        mimeType: mimeTypeFromFileName(fileName),
        data: fs.readFileSync(filePath),
      };
    }
  }
  return { classId: homework.classId, missing: true };
}

function ensureAttachmentAvailable(attachment) {
  if (attachment.missing) {
    throw httpError(404, 'Ce fichier n’est plus disponible sur le serveur. Le professeur doit republier la pièce jointe.');
  }
  return attachment;
}

async function getHomeworkAttachmentForStaff({ teacherUserId, homeworkId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw httpError(403, 'Profil professeur introuvable');

  const attachment = await readHomeworkAttachment(homeworkId);
  const classRecord = await prisma.class.findFirst({ where: { id: attachment.classId, ...classAccessWhere(teacherProfile.id) } });
  if (!classRecord) throw httpError(403, 'Vous n’avez pas accès à ce devoir');
  return ensureAttachmentAvailable(attachment);
}

// Une famille n'accède qu'aux pièces jointes des classes où l'un de ses enfants est inscrit.
async function getHomeworkAttachmentForFamily({ familyUserId, homeworkId }) {
  const attachment = await readHomeworkAttachment(homeworkId);
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      classId: attachment.classId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      student: { family: { userId: familyUserId } },
    },
    select: { id: true },
  });
  if (!enrollment) throw httpError(403, 'Vous n’avez pas accès à ce devoir');
  return ensureAttachmentAvailable(attachment);
}

async function deleteHomeworkMessage({ teacherUserId, homeworkId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const homework = await prisma.homeworkMessage.findUnique({ where: { id: homeworkId }, select: HOMEWORK_SELECT });
  if (!homework) throw new Error('Devoir introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: homework.classId, ...classAccessWhere(teacherProfile.id) } });
  if (!classRecord) throw new Error('Vous n’avez pas accès à ce devoir');

  if (homework.attachmentUrl && homework.attachmentUrl.startsWith('/uploads/homeworks/')) {
    const filePath = path.resolve(__dirname, '../../', homework.attachmentUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  return prisma.homeworkMessage.delete({ where: { id: homeworkId }, select: { id: true } });
}

module.exports = {
  saveHomeworkMessage,
  fetchHomeworkMessage,
  fetchHomeworkMessagesByClass,
  fetchHomeworkMessagesForFamily,
  getHomeworkAttachmentForStaff,
  getHomeworkAttachmentForFamily,
  deleteHomeworkMessage,
  hasHomeworkAttachment,
};
