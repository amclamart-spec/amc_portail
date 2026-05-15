const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function getTeacherProfile(userId) {
  return prisma.teacher.findUnique({ where: { userId } });
}

async function saveHomeworkMessage({ teacherUserId, classId, date, message, attachmentFilename, attachmentBase64 }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, teacherId: teacherProfile.id } });
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

  const classRecord = await prisma.class.findFirst({ where: { id: classId, teacherId: teacherProfile.id } });
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

  const classRecord = await prisma.class.findFirst({ where: { id: classId, teacherId: teacherProfile.id } });
  if (!classRecord) throw new Error('Vous n’avez pas accès à cette classe');

  // Get current school year (September to August)
  const now = new Date();
  const currentYear = now.getFullYear();
  const schoolYearStart = new Date(currentYear, 8, 1); // September 1st
  const schoolYearEnd = new Date(currentYear + 1, 7, 31); // August 31st

  // If we're before September, we're in the previous school year
  if (now < schoolYearStart) {
    schoolYearStart.setFullYear(currentYear - 1);
    schoolYearEnd.setFullYear(currentYear);
  }

  return prisma.homeworkMessage.findMany({
    where: {
      classId,
      date: {
        gte: schoolYearStart,
        lte: schoolYearEnd,
      },
    },
    orderBy: { date: 'desc' },
  });
}

async function deleteHomeworkMessage({ teacherUserId, homeworkId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const homework = await prisma.homeworkMessage.findUnique({ where: { id: homeworkId } });
  if (!homework) throw new Error('Devoir introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: homework.classId, teacherId: teacherProfile.id } });
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