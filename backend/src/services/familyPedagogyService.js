const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { saveBase64File } = require('../utils/fileUtils');

const prisma = new PrismaClient();
const MAX_JUSTIFICATION_DOCUMENTS = 5;
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
      justificationDocuments: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: [{ lesson: { date: 'desc' } }],
  });

  const ids = absences.map((e) => e.id);
  let rawFieldsMap = {};
  if (ids.length > 0) {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const rawRows = await prisma.$queryRawUnsafe(
      `SELECT id, family_justification as "familyJustification", justification_status as "justificationStatus", absence_reason as "absenceReason" FROM evaluations WHERE id IN (${placeholders})`,
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
    absenceReason: rawFieldsMap[evaluation.id]?.absenceReason || null,
    justificationDocuments: (evaluation.justificationDocuments || []).map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
    })),
    date: evaluation.lesson?.date || null,
    lessonTitle: evaluation.lesson?.title || null,
    classLabel: formatClassLabel(evaluation.lesson?.class),
    poleName: evaluation.lesson?.class?.level?.pole?.name || null,
    status: evaluation.status,
  }));
}

const ABSENCE_REASONS = ['MALADE', 'VOYAGE', 'AUTRE'];
// Pôle où un document est exigé pour les motifs Malade/Voyage, avec justification
// automatique dès qu'un document est fourni.
const AUTO_VALIDATE_POLE = 'coran';
const AUTO_VALIDATE_REASONS = ['MALADE', 'VOYAGE'];
// Même correspondance que côté professeur (SuiviPedagogique.jsx, DAY_MAP) pour
// vérifier qu'une déclaration anticipée tombe bien sur le jour de cours de la classe.
const DAY_OF_WEEK_INDEX = { DIMANCHE: 0, LUNDI: 1, MARDI: 2, MERCREDI: 3, JEUDI: 4, VENDREDI: 5, SAMEDI: 6 };

// Déclaration d'absence future par la famille (avant que le cours n'ait eu lieu) :
// crée (ou réutilise) la leçon du jour visé puis l'Evaluation correspondante en
// statut 'missing' + justification déjà renseignée en attente de validation —
// elle apparaît alors immédiatement dans la feuille d'appel du professeur/
// responsable de pôle pour cette date, exactement comme une absence a posteriori.
async function declareAbsence({ familyUserId, studentId, classId, date, reason, comment, documents }) {
  if (!classId) {
    const err = new Error('classId est requis');
    err.statusCode = 400;
    throw err;
  }
  if (!comment || !comment.trim()) {
    const err = new Error('Le commentaire est requis');
    err.statusCode = 400;
    throw err;
  }
  if (!ABSENCE_REASONS.includes(reason)) {
    const err = new Error('Le motif d\'absence est requis (Malade, Voyage ou Autre)');
    err.statusCode = 400;
    throw err;
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, family: { userId: familyUserId } },
    include: {
      enrollments: {
        where: { status: { in: FAMILY_VISIBLE_ENROLLMENT_STATUSES }, classId },
        include: { class: true },
      },
    },
  });
  if (!student) {
    const err = new Error('Élève introuvable pour cette famille');
    err.statusCode = 404;
    throw err;
  }
  const enrollment = student.enrollments[0];
  if (!enrollment) {
    const err = new Error('Cet élève n\'est pas inscrit à ce cours');
    err.statusCode = 403;
    throw err;
  }

  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(targetDate.getTime()) || targetDate < today) {
    const err = new Error('La date doit être aujourd\'hui ou dans le futur');
    err.statusCode = 400;
    throw err;
  }

  const expectedDay = DAY_OF_WEEK_INDEX[enrollment.class?.dayOfWeek];
  if (expectedDay !== undefined && targetDate.getDay() !== expectedDay) {
    const dayLabel = enrollment.class.dayOfWeek.charAt(0) + enrollment.class.dayOfWeek.slice(1).toLowerCase();
    const err = new Error(`Ce cours a lieu le ${dayLabel} — veuillez choisir une date correspondante`);
    err.statusCode = 400;
    throw err;
  }

  const newDocuments = Array.isArray(documents) ? documents.filter((doc) => doc && doc.base64) : [];

  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);

  let lesson = await prisma.lesson.findFirst({
    where: { classId, date: { gte: targetDate, lt: nextDate } },
  });
  if (!lesson) {
    lesson = await prisma.lesson.create({
      data: {
        classId,
        title: `Absence déclarée (${targetDate.toLocaleDateString('fr-FR')})`,
        description: 'Séance créée automatiquement suite à une déclaration d\'absence anticipée par la famille',
        date: targetDate,
      },
    });
  }

  const existingEvaluation = await prisma.evaluation.findUnique({
    where: { studentId_lessonId: { studentId, lessonId: lesson.id } },
    include: { justificationDocuments: true },
  });
  const existingDocCount = existingEvaluation?.justificationDocuments.length || 0;
  if (existingDocCount + newDocuments.length > MAX_JUSTIFICATION_DOCUMENTS) {
    const err = new Error(`Vous ne pouvez pas joindre plus de ${MAX_JUSTIFICATION_DOCUMENTS} documents`);
    err.statusCode = 400;
    throw err;
  }

  const evaluation = await prisma.evaluation.upsert({
    where: { studentId_lessonId: { studentId, lessonId: lesson.id } },
    create: {
      studentId,
      lessonId: lesson.id,
      grade: 0,
      appreciation: '',
      submitted: false,
      status: 'missing',
      familyJustification: comment.trim(),
      justificationStatus: 'PENDING',
      absenceReason: reason,
      declaredInAdvance: true,
    },
    update: {
      status: 'missing',
      familyJustification: comment.trim(),
      justificationStatus: 'PENDING',
      absenceReason: reason,
      declaredInAdvance: true,
    },
  });

  for (const doc of newDocuments) {
    const fileUrl = saveBase64File(doc.base64, 'absence-justifications', doc.fileName);
    await prisma.absenceJustificationDocument.create({
      data: {
        evaluationId: evaluation.id,
        fileUrl,
        fileName: doc.fileName || path.basename(fileUrl),
      },
    });
  }

  return { evaluationId: evaluation.id };
}

async function submitFamilyJustification({ familyUserId, evaluationId, comment, documents, reason }) {
  if (!comment || !comment.trim()) {
    const err = new Error('Le commentaire est requis');
    err.statusCode = 400;
    throw err;
  }
  if (!ABSENCE_REASONS.includes(reason)) {
    const err = new Error('Le motif d\'absence est requis (Malade, Voyage ou Autre)');
    err.statusCode = 400;
    throw err;
  }

  // Verify the evaluation belongs to a student of this family
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      student: { include: { family: true } },
      justificationDocuments: true,
      lesson: { include: { class: { include: { level: { include: { pole: true } } } } } },
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

  const newDocuments = Array.isArray(documents) ? documents.filter((doc) => doc && doc.base64) : [];
  if (evaluation.justificationDocuments.length + newDocuments.length > MAX_JUSTIFICATION_DOCUMENTS) {
    const err = new Error(`Vous ne pouvez pas joindre plus de ${MAX_JUSTIFICATION_DOCUMENTS} documents`);
    err.statusCode = 400;
    throw err;
  }

  const poleName = (evaluation.lesson?.class?.level?.pole?.name || '').trim().toLowerCase();
  const totalDocuments = evaluation.justificationDocuments.length + newDocuments.length;
  const requiresDocument = poleName === AUTO_VALIDATE_POLE && AUTO_VALIDATE_REASONS.includes(reason);

  if (requiresDocument && totalDocuments === 0) {
    const err = new Error('Un document justificatif est requis pour ce motif d\'absence');
    err.statusCode = 400;
    throw err;
  }

  // Coran + Malade/Voyage + document fourni → justification automatique.
  // Tous les autres cas restent en attente de validation par le responsable de pôle / l'administration.
  const justificationStatus = requiresDocument && totalDocuments > 0 ? 'VALIDATED' : 'PENDING';

  await prisma.$queryRawUnsafe(
    `UPDATE evaluations SET family_justification = $1, justification_status = $2, absence_reason = $3 WHERE id = $4`,
    comment.trim(),
    justificationStatus,
    reason,
    evaluationId,
  );

  for (const doc of newDocuments) {
    const fileUrl = saveBase64File(doc.base64, 'absence-justifications', doc.fileName);
    await prisma.absenceJustificationDocument.create({
      data: {
        evaluationId,
        fileUrl,
        fileName: doc.fileName || path.basename(fileUrl),
      },
    });
  }

  return { justificationStatus };
}

async function deleteJustificationDocument({ familyUserId, evaluationId, documentId }) {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: { student: { include: { family: true } } },
  });
  if (!evaluation || evaluation.student?.family?.userId !== familyUserId) {
    const err = new Error('Absence introuvable');
    err.statusCode = 404;
    throw err;
  }

  const document = await prisma.absenceJustificationDocument.findUnique({ where: { id: documentId } });
  if (!document || document.evaluationId !== evaluationId) {
    const err = new Error('Document introuvable');
    err.statusCode = 404;
    throw err;
  }

  await prisma.absenceJustificationDocument.delete({ where: { id: documentId } });

  const filePath = path.resolve(__dirname, '../../', document.fileUrl.replace(/^\//, ''));
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch { /* best-effort */ }
  }

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
  declareAbsence,
  submitFamilyJustification,
  deleteJustificationDocument,
  setHomeworkCompletion,
};
