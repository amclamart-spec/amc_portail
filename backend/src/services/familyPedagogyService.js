const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
// Le suivi pédagogique (absences, notes, devoirs) ne doit être visible en espace
// famille que pour les inscriptions confirmées administrativement — une inscription
// PENDING n'est pas encore validée et ne doit rien afficher côté famille.
const FAMILY_VISIBLE_ENROLLMENT_STATUSES = ['CONFIRMED'];

function formatClassLabel(cls) {
  if (!cls) return null;
  const poleName = cls.level?.pole?.name;
  const levelName = cls.level?.name;
  return [poleName, levelName].filter(Boolean).join(' - ');
}

async function fetchFamilyStudents({ familyUserId }) {
  const family = await prisma.family.findUnique({ where: { userId: familyUserId } });
  if (!family) throw new Error('Famille introuvable');

  const students = await prisma.student.findMany({
    where: { familyId: family.id },
    include: {
      enrollments: {
        where: { status: { in: FAMILY_VISIBLE_ENROLLMENT_STATUSES } },
        include: {
          class: {
            include: {
              level: { include: { pole: true } },
              schoolYear: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  // Filtrer pour garder seulement les élèves qui ont au moins une inscription active
  const studentsWithVisibleEnrollments = students.filter(
    (student) => student.enrollments.length > 0
  );

  return studentsWithVisibleEnrollments.map((student) => ({
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    fullName: `${student.firstName} ${student.lastName}`,
    enrollments: student.enrollments.map((enrollment) => ({
      id: enrollment.id,
      status: enrollment.status,
      classId: enrollment.classId,
      classLabel: formatClassLabel(enrollment.class),
      period: enrollment.class?.level?.pole?.period || null,
      schoolYear: enrollment.schoolYear ? {
        id: enrollment.schoolYear.id,
        label: enrollment.schoolYear.label,
      } : null,
    })),
  }));
}

async function fetchStudentAbsences({ familyUserId, studentId }) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      family: { userId: familyUserId },
    },
    include: {
      enrollments: {
        where: { status: { in: FAMILY_VISIBLE_ENROLLMENT_STATUSES } },
      },
    },
  });
  if (!student) throw new Error('Élève introuvable pour cette famille');

  const classIds = student.enrollments.map((enrollment) => enrollment.classId);
  if (classIds.length === 0) return [];

  const absences = await prisma.evaluation.findMany({
    where: {
      studentId,
      status: { in: ['missing', 'late'] },
      lesson: {
        classId: { in: classIds },
      },
    },
    include: {
      lesson: {
        include: {
          class: {
            include: {
              level: { include: { pole: true } },
            },
          },
        },
      },
    },
    orderBy: [{ lesson: { date: 'desc' } }],
  });

  const ids = absences.map((e) => e.id);
  let rawFieldsMap = {};
  if (ids.length > 0) {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const rawRows = await prisma.$queryRawUnsafe(
      `SELECT id, family_justification as "familyJustification", justification_status as "justificationStatus" FROM evaluations WHERE id IN (${placeholders})`,
      ...ids,
    );
    rawFieldsMap = Object.fromEntries(rawRows.map((r) => [r.id, r]));
  }

  return absences.map((evaluation) => ({
    id: evaluation.id,
    grade: evaluation.grade,
    appreciation: evaluation.appreciation,
    justification: evaluation.justification,
    familyJustification: rawFieldsMap[evaluation.id]?.familyJustification || null,
    justificationStatus: rawFieldsMap[evaluation.id]?.justificationStatus || 'NONE',
    date: evaluation.lesson?.date || null,
    lessonTitle: evaluation.lesson?.title || null,
    classLabel: formatClassLabel(evaluation.lesson?.class),
    status: evaluation.status,
  }));
}

async function submitFamilyJustification({ familyUserId, evaluationId, comment }) {
  if (!comment || !comment.trim()) {
    const err = new Error('Le commentaire est requis');
    err.statusCode = 400;
    throw err;
  }

  // Verify the evaluation belongs to a student of this family
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      student: { include: { family: true } },
    },
  });
  if (!evaluation || evaluation.student?.family?.userId !== familyUserId) {
    const err = new Error('Absence introuvable');
    err.statusCode = 404;
    throw err;
  }
  if (evaluation.status !== 'missing' && evaluation.status !== 'late') {
    const err = new Error('Ce relevé n\'est pas une absence');
    err.statusCode = 400;
    throw err;
  }

  await prisma.$queryRawUnsafe(
    `UPDATE evaluations SET family_justification = $1, justification_status = 'PENDING' WHERE id = $2`,
    comment.trim(),
    evaluationId,
  );

  return { success: true };
}

async function fetchStudentHomework({ familyUserId, studentId }) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      family: { userId: familyUserId },
    },
    include: {
      enrollments: {
        where: { status: { in: FAMILY_VISIBLE_ENROLLMENT_STATUSES } },
      },
    },
  });
  if (!student) throw new Error('Élève introuvable pour cette famille');

  const classIds = student.enrollments.map((enrollment) => enrollment.classId);
  if (classIds.length === 0) return [];

  const homeworks = await prisma.homeworkMessage.findMany({
    where: { classId: { in: classIds } },
    include: {
      class: {
        include: {
          level: { include: { pole: true } },
        },
      },
      completions: {
        where: { studentId },
      },
    },
    orderBy: { date: 'desc' },
  });

  return homeworks.map((homework) => ({
    id: homework.id,
    date: homework.date,
    body: homework.body,
    attachmentUrl: homework.attachmentUrl,
    attachmentFilename: homework.attachmentFilename,
    classLabel: formatClassLabel(homework.class),
    poleName: homework.class?.level?.pole?.name || null,
    done: homework.completions.length > 0,
    completedAt: homework.completions[0]?.completedAt || null,
  }));
}

async function setHomeworkCompletion({ familyUserId, studentId, homeworkId, done }) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      family: { userId: familyUserId },
    },
    include: {
      enrollments: {
        where: { status: { in: FAMILY_VISIBLE_ENROLLMENT_STATUSES } },
      },
    },
  });
  if (!student) throw new Error('Élève introuvable pour cette famille');

  const classIds = student.enrollments.map((enrollment) => enrollment.classId);
  const homework = await prisma.homeworkMessage.findUnique({ where: { id: homeworkId } });
  if (!homework || !classIds.includes(homework.classId)) {
    const err = new Error('Devoir introuvable');
    err.statusCode = 404;
    throw err;
  }

  if (done) {
    await prisma.homeworkCompletion.upsert({
      where: { homeworkId_studentId: { homeworkId, studentId } },
      create: { homeworkId, studentId },
      update: {},
    });
  } else {
    await prisma.homeworkCompletion.deleteMany({ where: { homeworkId, studentId } });
  }

  return { done };
}

async function fetchStudentNotes({ familyUserId, studentId }) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      family: { userId: familyUserId },
    },
    include: {
      enrollments: {
        where: { status: { in: FAMILY_VISIBLE_ENROLLMENT_STATUSES } },
      },
    },
  });
  if (!student) throw new Error('Élève introuvable pour cette famille');

  const classIds = student.enrollments.map((enrollment) => enrollment.classId);
  if (classIds.length === 0) return [];

  // `grade` n'est jamais null (colonne Float non-nullable, défaut 0) : un ancien filtre
  // sur `grade !== null` ne pouvait donc rien exclure. Le seul signal fiable qu'une
  // évaluation est une vraie note saisie par le professeur (et pas une simple ligne
  // créée par la prise de présence, ex. leçon "Absences <date>") est `submitted: true`.
  const evaluations = await prisma.evaluation.findMany({
    where: {
      studentId,
      submitted: true,
      NOT: {
        status: { in: ['missing', 'late'] },
      },
      lesson: {
        classId: { in: classIds },
      },
    },
    include: {
      lesson: {
        include: {
          class: {
            include: {
              level: { include: { pole: true } },
            },
          },
        },
      },
    },
    orderBy: [{ lesson: { date: 'desc' } }],
  });

  return evaluations.map((evaluation) => ({
    id: evaluation.id,
    grade: evaluation.grade,
    appreciation: evaluation.appreciation,
    status: evaluation.status,
    date: evaluation.lesson?.date || null,
    lessonTitle: evaluation.lesson?.title || null,
    classLabel: formatClassLabel(evaluation.lesson?.class),
  }));
}

module.exports = {
  fetchFamilyStudents,
  fetchStudentAbsences,
  fetchStudentHomework,
  fetchStudentNotes,
  submitFamilyJustification,
  setHomeworkCompletion,
};
