const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { classAccessWhere } = require('../utils/classAccessUtils');

const prisma = new PrismaClient();

async function getTeacherProfile(userId) {
  return prisma.teacher.findUnique({ where: { userId } });
}

async function saveHomeworkMessage({ teacherUserId, classId, date, message, attachmentFilename, attachmentBase64 }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, ...classAccessWhere(teacherProfile.id) } });
  if (!classRecord) throw new Error('Vous n’avez pas accès à cette classe');
  if (!date || !message) throw new Error('date et message sont requis');

  let attachmentUrl = null;
  let persistedFilename = null;

  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const existingHomework = await prisma.homeworkMessage.findFirst({
    where: {
      classId,
      date: { gte: targetDate, lt: nextDate },
    },
  });

  if (attachmentBase64 && attachmentFilename) {
    const uploadsDir = path.resolve(__dirname, '../../uploads/homeworks');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const safeName = `${Date.now()}-${attachmentFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(uploadsDir, safeName);
    const buffer = Buffer.from(attachmentBase64, 'base64');
    fs.writeFileSync(filePath, buffer);

    attachmentUrl = `/uploads/homeworks/${safeName}`;
    persistedFilename = attachmentFilename;
  } else if (existingHomework) {
    attachmentUrl = existingHomework.attachmentUrl;
    persistedFilename = existingHomework.attachmentFilename;
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
      attachmentUrl,
      attachmentFilename: persistedFilename,
    },
    update: {
      body: message,
      attachmentUrl,
      attachmentFilename: persistedFilename,
      date: new Date(date),
    },
  });

  return homework;
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

  return prisma.homeworkMessage.findFirst({
    where: {
      classId,
      date: { gte: targetDate, lt: nextDate },
    },
    orderBy: { updatedAt: 'desc' },
  });
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

  return prisma.homeworkMessage.findMany({
    where: { classId: { in: uniqueClassIds } },
    orderBy: { date: 'desc' },
  });
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
    include: {
      completions: {
        include: { student: true },
        orderBy: { completedAt: 'asc' },
      },
    },
    orderBy: { date: 'desc' },
  });

  return homeworks.map((homework) => ({
    ...homework,
    completions: homework.completions.map((completion) => ({
      studentId: completion.studentId,
      studentName: `${completion.student.firstName} ${completion.student.lastName}`,
      completedAt: completion.completedAt,
    })),
    totalStudents,
  }));
}

async function deleteHomeworkMessage({ teacherUserId, homeworkId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const homework = await prisma.homeworkMessage.findUnique({ where: { id: homeworkId } });
  if (!homework) throw new Error('Devoir introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: homework.classId, ...classAccessWhere(teacherProfile.id) } });
  if (!classRecord) throw new Error('Vous n’avez pas accès à ce devoir');

  if (homework.attachmentUrl && homework.attachmentUrl.startsWith('/uploads/homeworks/')) {
    const filePath = path.resolve(__dirname, '../../', homework.attachmentUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  return prisma.homeworkMessage.delete({ where: { id: homeworkId } });
}

module.exports = {
  saveHomeworkMessage,
  fetchHomeworkMessage,
  fetchHomeworkMessagesByClass,
  fetchHomeworkMessagesForFamily,
  deleteHomeworkMessage,
};