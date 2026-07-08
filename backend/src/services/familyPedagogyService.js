const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const CONFIRMED_ENROLLMENT_STATUS = 'CONFIRMED';

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
        where: { status: CONFIRMED_ENROLLMENT_STATUS },
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

  // Filtrer pour garder seulement les élèves qui ont au moins une inscription confirmée
  const studentsWithConfirmedEnrollments = students.filter(
    (student) => student.enrollments.length > 0
  );

  return studentsWithConfirmedEnrollments.map((student) => ({
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    fullName: `${student.firstName} ${student.lastName}`,
    enrollments: student.enrollments.map((enrollment) => ({
      id: enrollment.id,
      status: enrollment.status,
      classId: enrollment.classId,
      classLabel: formatClassLabel(enrollment.class),
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
        where: { status: CONFIRMED_ENROLLMENT_STATUS },
      },
    },
  });
  if (!student) throw new Error('Élève introuvable pour cette famille');

  const classIds = student.enrollments.map((enrollment) => enrollment.classId);
  if (classIds.length === 0) return [];

  const absences = await prisma.evaluation.findMany({
    where: {
      studentId,
      status: 'missing',
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
  if (evaluation.status !== 'missing') {
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
        where: { status: CONFIRMED_ENROLLMENT_STATUS },
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
  }));
}

async function fetchStudentNotes({ familyUserId, studentId }) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      family: { userId: familyUserId },
    },
    include: {
      enrollments: {
        where: { status: CONFIRMED_ENROLLMENT_STATUS },
      },
    },
  });
  if (!student) throw new Error('Élève introuvable pour cette famille');

  const classIds = student.enrollments.map((enrollment) => enrollment.classId);
  if (classIds.length === 0) return [];

  // Récupérer uniquement les notes/appréciations (exclure les absences et les évaluations vides)
  const allEvaluations = await prisma.evaluation.findMany({
    where: {
      studentId,
      NOT: {
        status: 'missing',
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

  // Filtrer au niveau de l'application pour garder seulement les évaluations avec une note ou une appréciation
  const evaluations = allEvaluations.filter(
    (evaluation) => evaluation.grade !== null || evaluation.appreciation !== null
  );

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
};
