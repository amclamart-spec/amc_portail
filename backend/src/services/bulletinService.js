const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const CONFIRMED_ENROLLMENT_STATUS = 'CONFIRMED';
// Un professeur doit pouvoir publier le bulletin de tout élève visible dans son
// roster de classe (`/absences/class-students`), qui inclut aussi les inscriptions
// PENDING — contrairement à la portée famille, limitée aux seules CONFIRMED.
const TEACHER_VISIBLE_ENROLLMENT_STATUSES = ['PENDING', 'CONFIRMED'];

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

function formatClassLabel(cls) {
  if (!cls) return null;
  const poleName = cls.level?.pole?.name;
  const levelName = cls.level?.name;
  return [poleName, levelName].filter(Boolean).join(' - ');
}

async function getTeacherClassAccess({ teacherUserId, studentId, classId }) {
  const teacherProfile = await prisma.teacher.findUnique({ where: { userId: teacherUserId } });
  if (!teacherProfile) throw notFound('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, teacherId: teacherProfile.id } });
  if (!classRecord) throw notFound('Vous n\'avez pas accès à cette classe');

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, classId, status: { in: TEACHER_VISIBLE_ENROLLMENT_STATUSES } },
  });
  if (!enrollment) throw notFound('Cet élève n\'est pas inscrit dans cette classe');

  return { teacherProfile, classRecord };
}

async function getFamilyStudent({ familyUserId, studentId }) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, family: { userId: familyUserId } },
    include: {
      enrollments: { where: { status: CONFIRMED_ENROLLMENT_STATUS } },
    },
  });
  if (!student) throw notFound('Élève introuvable pour cette famille');
  return { student, confirmedClassIds: student.enrollments.map((e) => e.classId) };
}

async function assertReadAccess({ user, studentId }) {
  if (user.role === 'FAMILLE') {
    await getFamilyStudent({ familyUserId: user.id, studentId });
  } else if (user.role === 'PROFESSEUR') {
    const teacherProfile = await prisma.teacher.findUnique({ where: { userId: user.id } });
    if (!teacherProfile) throw notFound('Profil professeur introuvable');
    const hasAccess = await prisma.enrollment.findFirst({
      where: { studentId, status: { in: TEACHER_VISIBLE_ENROLLMENT_STATUSES }, class: { teacherId: teacherProfile.id } },
    });
    if (!hasAccess) throw notFound('Vous n\'avez pas accès aux bulletins de cet élève');
  } else {
    throw notFound('Accès non autorisé');
  }
}

async function publishBulletin({ teacherUserId, studentId, classId, period, fileName, fileBase64 }) {
  if (!studentId || !classId || !fileName || !fileBase64) {
    throw badRequest('studentId, classId, fileName et fileBase64 sont requis');
  }
  await getTeacherClassAccess({ teacherUserId, studentId, classId });

  const uploadsDir = path.resolve(__dirname, '../../uploads/bulletins');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(uploadsDir, safeName);
  const buffer = Buffer.from(fileBase64, 'base64');
  fs.writeFileSync(filePath, buffer);

  return prisma.bulletin.create({
    data: {
      studentId,
      classId,
      period: period || 'ANNUEL',
      fileUrl: `/uploads/bulletins/${safeName}`,
      fileName,
      publishedById: teacherUserId,
    },
  });
}

async function listBulletinsForTeacher({ teacherUserId, studentId, classId }) {
  await getTeacherClassAccess({ teacherUserId, studentId, classId });
  return prisma.bulletin.findMany({
    where: { studentId, classId },
    orderBy: { createdAt: 'desc' },
  });
}

async function listBulletinsForFamily({ familyUserId, studentId }) {
  const { confirmedClassIds } = await getFamilyStudent({ familyUserId, studentId });
  if (confirmedClassIds.length === 0) return [];

  const bulletins = await prisma.bulletin.findMany({
    where: { studentId, classId: { in: confirmedClassIds } },
    include: { class: { include: { level: { include: { pole: true } } } } },
    orderBy: { createdAt: 'desc' },
  });

  return bulletins.map((b) => ({
    id: b.id,
    period: b.period,
    fileUrl: b.fileUrl,
    fileName: b.fileName,
    createdAt: b.createdAt,
    classLabel: formatClassLabel(b.class),
    poleName: b.class?.level?.pole?.name || null,
  }));
}

async function deleteBulletin({ teacherUserId, id }) {
  const teacherProfile = await prisma.teacher.findUnique({ where: { userId: teacherUserId } });
  if (!teacherProfile) throw notFound('Profil professeur introuvable');

  const bulletin = await prisma.bulletin.findUnique({ where: { id } });
  if (!bulletin) throw notFound('Bulletin introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: bulletin.classId, teacherId: teacherProfile.id } });
  if (!classRecord) throw notFound('Vous n\'avez pas accès à ce bulletin');

  const filePath = path.resolve(__dirname, '../../', bulletin.fileUrl.replace(/^\//, ''));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await prisma.bulletin.delete({ where: { id } });
  return { success: true };
}

module.exports = {
  assertReadAccess,
  publishBulletin,
  listBulletinsForTeacher,
  listBulletinsForFamily,
  deleteBulletin,
};
