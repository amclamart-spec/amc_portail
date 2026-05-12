const { PrismaClient } = require('@prisma/client');
const { validateEvaluationPayload } = require('../models/Evaluation');
const { sendMail } = require('../services/emailService');

const prisma = new PrismaClient();

async function getTeacherProfile(userId) {
  return prisma.teacher.findUnique({ where: { userId } });
}

async function fetchLessonsByClass({ teacherUserId, classId, date }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, teacherId: teacherProfile.id } });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  const where = { classId };
  if (date) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);
    where.date = { gte: targetDate, lt: nextDate };
  }

  return prisma.lesson.findMany({
    where,
    orderBy: [{ date: 'asc' }, { title: 'asc' }],
  });
}

async function fetchClassStudents({ teacherUserId, classId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, teacherId: teacherProfile.id } });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  const enrollments = await prisma.enrollment.findMany({
    where: {
      classId,
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    include: { student: true },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });

  return enrollments.map((enrollment) => ({
    studentId: enrollment.student.id,
    studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
    classId,
  }));
}

async function fetchAbsenceHistory({ teacherUserId, classId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({
    where: { id: classId, teacherId: teacherProfile.id },
    include: { schoolYear: true },
  });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  const lessonWhere = {
    classId,
    evaluations: { some: {} },
  };
  if (classRecord.schoolYear) {
    lessonWhere.date = {
      gte: classRecord.schoolYear.startDate,
      lte: classRecord.schoolYear.endDate,
    };
  }

  const lessons = await prisma.lesson.findMany({
    where: lessonWhere,
    orderBy: [{ date: 'desc' }, { title: 'asc' }],
  });

  return lessons.map((lesson) => ({
    id: lesson.id,
    date: lesson.date,
    title: lesson.title,
    description: lesson.description || null,
  }));
}

async function fetchLessonAttendanceSheet({ teacherUserId, lessonId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      class: {
        include: {
          level: { include: { pole: true } },
          schoolYear: true,
        },
      },
    },
  });

  if (!lesson) throw new Error('Leçon introuvable');
  if (!lesson.class || lesson.class.teacherId !== teacherProfile.id) {
    throw new Error('Vous n\'avez pas accès à cette classe');
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      classId: lesson.classId,
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    include: { student: true },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });

  const existingEvaluations = await prisma.evaluation.findMany({ where: { lessonId } });
  const evaluationByStudent = new Map(existingEvaluations.map((evaluation) => [evaluation.studentId, evaluation]));

  return {
    lesson,
    class: lesson.class,
    students: enrollments.map((enrollment) => {
      const evaluation = evaluationByStudent.get(enrollment.student.id);
      return {
        studentId: enrollment.student.id,
        studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
        status: evaluation?.status || 'on_time',
        justification: evaluation?.justification || '',
      };
    }),
  };
}

async function fetchAbsenceRoster({ teacherUserId, classId, date }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');
  if (!date) {
    const error = new Error('Date est requise');
    error.statusCode = 400;
    throw error;
  }

  const classRecord = await prisma.class.findFirst({
    where: { id: classId, teacherId: teacherProfile.id },
    include: { schoolYear: true },
  });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const lesson = await prisma.lesson.findFirst({
    where: {
      classId,
      date: { gte: targetDate, lt: nextDate },
    },
    orderBy: [{ date: 'asc' }, { title: 'asc' }],
  });

  const enrollments = await prisma.enrollment.findMany({
    where: {
      classId,
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    include: { student: true },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });

  const existingEvaluations = lesson
    ? await prisma.evaluation.findMany({ where: { lessonId: lesson.id } })
    : [];
  const evaluationByStudent = new Map(existingEvaluations.map((evaluation) => [evaluation.studentId, evaluation]));

  // Compter les absences pour chaque élève durant l'année scolaire
  const absentCountByStudent = new Map();
  if (classRecord.schoolYear) {
    const schoolYearAbsences = await prisma.evaluation.groupBy({
      by: ['studentId'],
      where: {
        lesson: {
          classId,
          date: {
            gte: classRecord.schoolYear.startDate,
            lte: classRecord.schoolYear.endDate,
          },
        },
        status: 'missing',
      },
      _count: { id: true },
    });

    schoolYearAbsences.forEach((record) => {
      absentCountByStudent.set(record.studentId, record._count.id);
    });
  }

  return {
    lessonId: lesson?.id || null,
    lessonTitle: lesson ? `${lesson.title} (${new Date(lesson.date).toLocaleDateString('fr-FR')})` : null,
    students: enrollments.map((enrollment) => {
      const student = enrollment.student;
      const evaluation = evaluationByStudent.get(student.id);
      return {
        evaluationId: evaluation?.id || null,
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        lessonId: lesson?.id || null,
        classId,
        grade: evaluation?.grade ?? 0,
        appreciation: evaluation?.appreciation || '',
        submitted: evaluation?.submitted ?? false,
        status: evaluation?.status || 'on_time',
        justification: evaluation?.justification || '',
        createdAt: evaluation?.createdAt || null,
        absenceCount: absentCountByStudent.get(student.id) || 0,
      };
    }),
  };
}

async function saveAbsences({ teacherUserId, classId, date, lessonId, students }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');
  if (!classId || !Array.isArray(students) || (!date && !lessonId)) {
    const error = new Error('classId, date ou lessonId et students sont requis');
    error.statusCode = 400;
    throw error;
  }

  const classRecord = await prisma.class.findFirst({
    where: { id: classId, teacherId: teacherProfile.id },
    include: { level: { include: { pole: true } } },
  });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  let lesson;
  if (lessonId) {
    lesson = await prisma.lesson.findFirst({ where: { id: lessonId, classId } });
  } else {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    lesson = await prisma.lesson.findFirst({
      where: {
        classId,
        date: { gte: targetDate, lt: nextDate },
      },
    });

    if (!lesson) {
      lesson = await prisma.lesson.create({
        data: {
          classId,
          title: `Absences ${targetDate.toLocaleDateString('fr-FR')}`,
          description: 'Session créée automatiquement pour saisie d\'absences hors cours',
          date: targetDate,
        },
      });
    }
  }

  const existingEvaluations = await prisma.evaluation.findMany({ where: { lessonId: lesson.id } });
  const evaluationByStudent = new Map(existingEvaluations.map((evaluation) => [evaluation.studentId, evaluation]));

  await Promise.all(students.map(async (studentRow) => {
    const existing = evaluationByStudent.get(studentRow.studentId);
    return upsertEvaluation({
      teacherUserId,
      studentId: studentRow.studentId,
      lessonId: lesson.id,
      grade: existing?.grade ?? 0,
      appreciation: existing?.appreciation || '',
      submitted: existing?.submitted ?? false,
      status: studentRow.status || 'on_time',
      justification: studentRow.justification || '',
    });
  }));

  const absentStudentIds = students
    .filter((studentRow) => studentRow.status === 'missing')
    .map((studentRow) => studentRow.studentId);

  if (absentStudentIds.length > 0) {
    const absentees = await prisma.student.findMany({
      where: { id: { in: absentStudentIds } },
      include: {
        family: {
          include: {
            user: true,
            parents: true,
          },
        },
      },
    });

    const absencesByFamily = new Map();
    absentees.forEach((student) => {
      if (!student.family) return;
      const familyEntry = absencesByFamily.get(student.familyId) || { family: student.family, students: [] };
      familyEntry.students.push(student);
      absencesByFamily.set(student.familyId, familyEntry);
    });

    const lessonDate = new Date(lesson.date).toLocaleDateString('fr-FR');
    const classLabel = `${classRecord.pole?.name || ''}${classRecord.pole ? ' - ' : ''}${classRecord.level?.name || ''}`;
    const teacherName = `${teacherProfile.firstName || ''} ${teacherProfile.lastName || ''}`.trim();

    await Promise.all(Array.from(absencesByFamily.values()).map(async ({ family, students: familyStudents }) => {
      const recipientEmails = new Set();
      if (family.user?.email) recipientEmails.add(family.user.email);
      family.parents?.forEach((parent) => {
        if (parent.email) recipientEmails.add(parent.email);
      });

      if (recipientEmails.size === 0) return;

      const studentListHtml = familyStudents
        .map((student) => `<li><strong>${student.firstName} ${student.lastName}</strong> — Classe : ${classLabel}</li>`)
        .join('');
      const plural = familyStudents.length > 1;
      const subject = `AMC — Absence${plural ? 's' : ''} de votre enfant${plural ? 's' : ''} le ${lessonDate}`;
      const contentHtml = `
        <p>Bonjour,</p>
        <p>Nous vous informons que ${plural ? 'vos enfants' : 'votre enfant'} a été absent${plural ? 's' : ''} au cours suivant :</p>
        <ul>${studentListHtml}</ul>
        <p><strong>Informations du cours</strong></p>
        <ul>
          <li>Cours : ${lesson.title}</li>
          <li>Date : ${lessonDate}</li>
          <li>Classe : ${classLabel}</li>
          <li>Professeur : ${teacherName}</li>
        </ul>
        <p>Merci de vous rapprocher de l'administration pour justifier cette absence.</p>
        <p>Cordialement,<br/>Administration AMC</p>
      `;

      await sendMail({
        to: Array.from(recipientEmails).join(', '),
        subject,
        html: contentHtml,
      });
    }));
  }

  return { lessonId: lesson.id };
}

async function fetchEvaluations({ teacherUserId, classId, lessonId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { class: true },
  });
  if (!lesson || lesson.classId !== classId) {
    throw new Error('Leçon ou classe invalide');
  }
  if (!lesson.class || lesson.class.teacherId !== teacherProfile.id) {
    throw new Error('Vous n\'avez pas accès à cette classe');
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      classId,
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    include: { student: true },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });

  const existingEvaluations = await prisma.evaluation.findMany({ where: { lessonId } });
  const evaluationByStudent = new Map(existingEvaluations.map((evaluation) => [evaluation.studentId, evaluation]));

  return enrollments.map((enrollment) => {
    const student = enrollment.student;
    const evaluation = evaluationByStudent.get(student.id);
    return {
      evaluationId: evaluation?.id || null,
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      lessonId,
      classId,
      grade: evaluation?.grade ?? 0,
      appreciation: evaluation?.appreciation || '',
      submitted: evaluation?.submitted ?? false,
      status: evaluation?.status || 'on_time',
      createdAt: evaluation?.createdAt || null,
    };
  });
}

function getPeriodRange(schoolYear, pole, periodKey) {
  if (!schoolYear || !schoolYear.startDate || !schoolYear.endDate || !pole || !pole.period) return null;

  const startDate = new Date(schoolYear.startDate);
  const endDate = new Date(schoolYear.endDate);

  if (pole.period === 'TRIMESTRIEL') {
    const second = new Date(startDate);
    second.setMonth(second.getMonth() + 3);
    const third = new Date(startDate);
    third.setMonth(third.getMonth() + 6);

    if (periodKey === 'TRIMESTRE_1') return [startDate, second];
    if (periodKey === 'TRIMESTRE_2') return [second, third];
    if (periodKey === 'TRIMESTRE_3') return [third, new Date(endDate.getTime() + 86400000)];
  }

  if (pole.period === 'SEMESTRIEL') {
    const mid = new Date(startDate);
    mid.setMonth(mid.getMonth() + 6);

    if (periodKey === 'SEMESTRE_1') return [startDate, mid];
    if (periodKey === 'SEMESTRE_2') return [mid, new Date(endDate.getTime() + 86400000)];
  }

  return null;
}

async function fetchPeriodNotes({ teacherUserId, classId, period }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({
    where: { id: classId, teacherId: teacherProfile.id },
    include: { schoolYear: true, level: { include: { pole: true } } },
  });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');
  if (!classRecord.schoolYear) throw new Error('Année scolaire introuvable pour cette classe');
  if (!classRecord.level?.pole) throw new Error('Pôle introuvable pour cette classe');

  const range = getPeriodRange(classRecord.schoolYear, classRecord.level.pole, period);
  if (!range) throw new Error('Période invalide ou non supportée pour cette classe');

  const [periodStart, periodEnd] = range;
  const lessons = await prisma.lesson.findMany({
    where: {
      classId,
      date: { gte: periodStart, lt: periodEnd },
    },
    orderBy: [{ date: 'asc' }, { title: 'asc' }],
    take: 5,
  });

  const enrollments = await prisma.enrollment.findMany({
    where: {
      classId,
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    include: { student: true },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });

  const lessonIds = lessons.map((lesson) => lesson.id);
  const evaluations = lessonIds.length > 0
    ? await prisma.evaluation.findMany({ where: { lessonId: { in: lessonIds } } })
    : [];

  const evaluationMap = new Map(evaluations.map((evaluation) => [
    `${evaluation.studentId}_${evaluation.lessonId}`,
    evaluation,
  ]));

  const students = enrollments.map((enrollment) => ({
    studentId: enrollment.student.id,
    studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
    notes: lessons.map((lesson) => {
      const evaluation = evaluationMap.get(`${enrollment.student.id}_${lesson.id}`);
      return evaluation?.grade ?? 0;
    }),
  }));

  return {
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      label: lesson.title,
      date: lesson.date,
    })),
    students,
  };
}

async function computeStats({ teacherUserId, classId, lessonId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, teacherId: teacherProfile.id } });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  const totalStudents = await prisma.enrollment.count({
    where: { classId, status: { in: ['PENDING', 'CONFIRMED'] } },
  });

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { class: true },
  });
  if (!lesson || lesson.classId !== classId) {
    throw new Error('Leçon ou classe invalide');
  }
  if (!lesson.class || lesson.class.teacherId !== teacherProfile.id) {
    throw new Error('Vous n\'avez pas accès à cette classe');
  }

  const evaluations = await prisma.evaluation.findMany({ where: { lessonId } });
  const gradedEvaluations = evaluations.filter((evaluation) => typeof evaluation.grade === 'number');
  const averageGrade = gradedEvaluations.length > 0
    ? gradedEvaluations.reduce((sum, evaluation) => sum + evaluation.grade, 0) / gradedEvaluations.length
    : 0;

  const absentCount = evaluations.filter((evaluation) => evaluation.status === 'missing').length;
  const attendanceRate = totalStudents > 0
    ? Number((((totalStudents - absentCount) / totalStudents) * 100).toFixed(1))
    : 0;

  return {
    totalStudents,
    averageGrade: Number(averageGrade.toFixed(2)),
    absentCount,
    attendanceRate,
  };
}

async function upsertEvaluation({ teacherUserId, studentId, lessonId, grade, appreciation, submitted, status, justification }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { class: true },
  });
  if (!lesson) {
    throw new Error('Leçon invalide');
  }
  if (!lesson.class || lesson.class.teacherId !== teacherProfile.id) {
    throw new Error('Vous n\'avez pas accès à cette classe');
  }

  const payload = {
    studentId,
    lessonId,
    grade,
    appreciation,
    submitted,
    status,
    justification,
  };
  validateEvaluationPayload(payload);

  return prisma.evaluation.upsert({
    where: { studentId_lessonId: { studentId, lessonId } },
    create: payload,
    update: payload,
  });
}

async function upsertPeriodNote({ teacherUserId, classId, period, studentId, discipline, grade }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({
    where: { id: classId, teacherId: teacherProfile.id },
    include: { schoolYear: true },
  });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');
  if (!classRecord.schoolYear) throw new Error('Année scolaire introuvable pour cette classe');

  const noteLessonTitle = `${period} - ${discipline}`;
  let noteLesson = await prisma.lesson.findFirst({ where: { classId, title: noteLessonTitle } });
  if (!noteLesson) {
    noteLesson = await prisma.lesson.create({
      data: {
        classId,
        title: noteLessonTitle,
        description: `Note de période ${period} (${discipline})`,
        date: classRecord.schoolYear.startDate || new Date(),
      },
    });
  }

  const payload = {
    studentId,
    lessonId: noteLesson.id,
    grade,
    appreciation: '',
    submitted: true,
    status: 'on_time',
    justification: '',
  };
  validateEvaluationPayload(payload);

  return prisma.evaluation.upsert({
    where: { studentId_lessonId: { studentId, lessonId: noteLesson.id } },
    create: payload,
    update: payload,
  });
}

module.exports = {
  fetchLessonsByClass,
  fetchClassStudents,
  fetchAbsenceHistory,
  fetchLessonAttendanceSheet,
  fetchAbsenceRoster,
  saveAbsences,
  fetchEvaluations,
  computeStats,
  upsertEvaluation,
  fetchPeriodNotes,
  upsertPeriodNote,
};
