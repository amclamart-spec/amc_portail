const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getTeacherProfile(userId) {
  return prisma.teacher.findUnique({ where: { userId } });
}

async function computeModuleStats({ teacherUserId, classId, module }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({
    where: { id: classId, teacherId: teacherProfile.id },
  });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  const totalStudents = await prisma.enrollment.count({
    where: { classId, status: { in: ['PENDING', 'CONFIRMED'] } },
  });

  // Module Absences: absence rate + lessons with evaluations
  if (module === 'absences') {
    const allLessons = await prisma.lesson.findMany({
      where: { classId },
    });
    const lessonsWithEvaluations = await prisma.lesson.findMany({
      where: {
        classId,
        evaluations: { some: {} },
      },
    });

    const allEvaluations = await prisma.evaluation.findMany({
      where: {
        lesson: { classId },
      },
    });

    const absentCount = allEvaluations.filter((e) => e.status === 'missing').length;
    const absenceRate = allEvaluations.length > 0
      ? Number(((absentCount / allEvaluations.length) * 100).toFixed(1))
      : 0;

    const lessonsFollowedRate = allLessons.length > 0
      ? Number(((lessonsWithEvaluations.length / allLessons.length) * 100).toFixed(1))
      : 0;

    return {
      absenceRate,
      lessonsFollowedRate,
      totalStudents,
    };
  }

  // Module Devoirs: submission rate + homework posts
  if (module === 'devoirs') {
    const homeworkMessages = await prisma.homeworkMessage.findMany({
      where: { classId },
    });

    const homeworkMessagesCount = homeworkMessages.length;
    const submissionRate = homeworkMessagesCount > 0 ? 100 : 0;

    return {
      submissionRate,
      homeworkCount: homeworkMessagesCount,
      totalStudents,
    };
  }

  // Module Notes: average grade + participation rate (present students)
  if (module === 'notes') {
    const allEvaluations = await prisma.evaluation.findMany({
      where: {
        lesson: { classId },
      },
    });

    const gradedEvaluations = allEvaluations.filter((item) => typeof item.grade === 'number');
    const averageGrade = gradedEvaluations.length > 0
      ? gradedEvaluations.reduce((sum, item) => sum + item.grade, 0) / gradedEvaluations.length
      : 0;

    const presentCount = allEvaluations.filter((item) => item.status !== 'missing').length;
    const participationRate = allEvaluations.length > 0
      ? Number(((presentCount / allEvaluations.length) * 100).toFixed(1))
      : 0;

    return {
      averageGrade: Number(averageGrade.toFixed(2)),
      participationRate,
      totalStudents,
    };
  }

  return {
    totalStudents,
  };
}

module.exports = {
  computeModuleStats,
};
