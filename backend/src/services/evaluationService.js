const { PrismaClient } = require('@prisma/client');
const { validateEvaluationPayload } = require('../models/Evaluation');
const { sendMail } = require('../services/emailService');
const { classAccessWhere, teacherHasClassAccess } = require('../utils/classAccessUtils');
const { getFamilyEmailRecipients } = require('../utils/familyEmailUtils');

const prisma = new PrismaClient();

// Gestion des absences (feuille d'appel, classement, historique, export) : seuls
// les élèves dont l'inscription est confirmée et qui ne sont pas en liste d'attente
// doivent apparaître — contrairement aux devoirs/notes qui restent visibles dès PENDING.
const ABSENCE_ELIGIBLE_ENROLLMENT_WHERE = { status: 'CONFIRMED', isWaitlist: false };

async function getTeacherProfile(userId) {
  return prisma.teacher.findUnique({ where: { userId } });
}

async function fetchLessonsByClass({ teacherUserId, classId, date }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, ...classAccessWhere(teacherProfile.id) } });
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

  const classRecord = await prisma.class.findFirst({ where: { id: classId, ...classAccessWhere(teacherProfile.id) } });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  const enrollments = await prisma.enrollment.findMany({
    where: {
      classId,
      ...ABSENCE_ELIGIBLE_ENROLLMENT_WHERE,
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
    where: { id: classId, ...classAccessWhere(teacherProfile.id) },
    include: { schoolYear: true },
  });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  const lessons = await prisma.lesson.findMany({
    where: { classId, evaluations: { some: {} } },
    orderBy: [{ date: 'desc' }, { title: 'asc' }],
  });

  return lessons.map((lesson) => ({
    id: lesson.id,
    date: lesson.date,
    title: lesson.title,
    description: lesson.description || null,
  }));
}

// Déclarations d'absence à l'avance et justificatifs a posteriori soumis par les
// familles pour une classe — grille dédiée côté professeur/responsable de pôle
// (onglet Absences) permettant de valider ou refuser chaque déclaration.
async function fetchClassJustifications({ teacherUserId, classId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, ...classAccessWhere(teacherProfile.id) } });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  const evaluations = await prisma.evaluation.findMany({
    where: {
      justificationStatus: { not: 'NONE' },
      lesson: { classId },
    },
    include: {
      student: true,
      lesson: true,
      justificationDocuments: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: [{ lesson: { date: 'desc' } }],
  });

  return evaluations.map((evaluation) => ({
    evaluationId: evaluation.id,
    studentId: evaluation.studentId,
    studentName: `${evaluation.student.firstName} ${evaluation.student.lastName}`,
    date: evaluation.lesson.date,
    lessonTitle: evaluation.lesson.title,
    status: evaluation.status,
    absenceReason: evaluation.absenceReason,
    familyJustification: evaluation.familyJustification,
    justificationStatus: evaluation.justificationStatus,
    declaredInAdvance: evaluation.declaredInAdvance,
    justificationDocuments: evaluation.justificationDocuments.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
    })),
  }));
}

async function updateJustificationDecision({ teacherUserId, evaluationId, decision }) {
  if (!['VALIDATED', 'REJECTED'].includes(decision)) {
    const error = new Error('Décision invalide (VALIDATED ou REJECTED)');
    error.statusCode = 400;
    throw error;
  }

  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: { lesson: { include: { class: { include: { classTeachers: true } } } } },
  });
  if (!evaluation) {
    const error = new Error('Déclaration introuvable');
    error.statusCode = 404;
    throw error;
  }
  if (!teacherHasClassAccess(evaluation.lesson.class, teacherProfile.id)) {
    throw new Error('Vous n\'avez pas accès à cette classe');
  }

  return prisma.evaluation.update({
    where: { id: evaluationId },
    data: { justificationStatus: decision },
  });
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
          classTeachers: true,
        },
      },
    },
  });

  if (!lesson) throw new Error('Leçon introuvable');
  if (!teacherHasClassAccess(lesson.class, teacherProfile.id)) {
    throw new Error('Vous n\'avez pas accès à cette classe');
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      classId: lesson.classId,
      ...ABSENCE_ELIGIBLE_ENROLLMENT_WHERE,
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

// Compte les absences et retards ('missing'/'late') de chaque élève d'une classe —
// partagé entre la feuille d'appel et le classement. Le classement a en plus besoin
// de la répartition justifiée/non justifiée (filtre), donc on groupe aussi par
// justificationStatus ; seul VALIDATED compte comme "justifiée".
// Pas de filtre par date/année scolaire ici : `classId` scope déjà à une seule année
// scolaire (chaque Class a un schoolYearId propre, une nouvelle classe est créée à
// chaque rentrée). Filtrer en plus sur les dates de la SchoolYear liée masquait
// silencieusement des absences bien réelles dès qu'une leçon sortait de cette plage
// (ex. rentrée pas encore basculée sur la nouvelle année scolaire, séance de
// rattrapage estivale) — le classement affichait alors 0 alors que la feuille
// d'appel du jour montrait bien l'élève absent.
async function computeYearlyAttendanceCounts(classId) {
  const absentCountByStudent = new Map();
  const lateCountByStudent = new Map();
  const absentJustifiedByStudent = new Map();
  const absentUnjustifiedByStudent = new Map();
  const lateJustifiedByStudent = new Map();
  const lateUnjustifiedByStudent = new Map();
  // Les maps sont partagées par référence : `result` reflète déjà leur contenu une
  // fois `accumulate` appelé plus bas, pas besoin de reconstruire l'objet au retour.
  const result = { absentCountByStudent, lateCountByStudent, absentJustifiedByStudent, absentUnjustifiedByStudent, lateJustifiedByStudent, lateUnjustifiedByStudent };

  const [classAbsences, classLates] = await Promise.all([
    prisma.evaluation.groupBy({
      by: ['studentId', 'justificationStatus'],
      where: { lesson: { classId }, status: 'missing' },
      _count: { id: true },
    }),
    prisma.evaluation.groupBy({
      by: ['studentId', 'justificationStatus'],
      where: { lesson: { classId }, status: 'late' },
      _count: { id: true },
    }),
  ]);

  const accumulate = (records, totalMap, justifiedMap, unjustifiedMap) => {
    records.forEach((record) => {
      const count = record._count.id;
      totalMap.set(record.studentId, (totalMap.get(record.studentId) || 0) + count);
      const targetMap = record.justificationStatus === 'VALIDATED' ? justifiedMap : unjustifiedMap;
      targetMap.set(record.studentId, (targetMap.get(record.studentId) || 0) + count);
    });
  };

  accumulate(classAbsences, absentCountByStudent, absentJustifiedByStudent, absentUnjustifiedByStudent);
  accumulate(classLates, lateCountByStudent, lateJustifiedByStudent, lateUnjustifiedByStudent);

  return result;
}

async function fetchAbsenceRanking({ teacherUserId, classId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({
    where: { id: classId, ...classAccessWhere(teacherProfile.id) },
  });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  const enrollments = await prisma.enrollment.findMany({
    where: { classId, ...ABSENCE_ELIGIBLE_ENROLLMENT_WHERE },
    include: { student: true },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });

  const {
    absentCountByStudent, lateCountByStudent,
    absentJustifiedByStudent, absentUnjustifiedByStudent,
    lateJustifiedByStudent, lateUnjustifiedByStudent,
  } = await computeYearlyAttendanceCounts(classId);

  return enrollments
    .map((enrollment) => ({
      studentId: enrollment.student.id,
      studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
      absenceCount: absentCountByStudent.get(enrollment.student.id) || 0,
      lateCount: lateCountByStudent.get(enrollment.student.id) || 0,
      absenceCountJustified: absentJustifiedByStudent.get(enrollment.student.id) || 0,
      absenceCountUnjustified: absentUnjustifiedByStudent.get(enrollment.student.id) || 0,
      lateCountJustified: lateJustifiedByStudent.get(enrollment.student.id) || 0,
      lateCountUnjustified: lateUnjustifiedByStudent.get(enrollment.student.id) || 0,
    }))
    .sort((a, b) => b.absenceCount - a.absenceCount || b.lateCount - a.lateCount);
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
    where: { id: classId, ...classAccessWhere(teacherProfile.id) },
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
      ...ABSENCE_ELIGIBLE_ENROLLMENT_WHERE,
    },
    include: { student: true },
    orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
  });

  const existingEvaluations = lesson
    ? await prisma.evaluation.findMany({ where: { lessonId: lesson.id }, include: { justificationDocuments: true } })
    : [];
  const evaluationByStudent = new Map(existingEvaluations.map((evaluation) => [evaluation.studentId, evaluation]));

  const { absentCountByStudent, lateCountByStudent } = await computeYearlyAttendanceCounts(classId);

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
        // Déclaration/justification famille (voir familyPedagogyService) — permet
        // d'afficher côté professeur/responsable de pôle le motif et les pièces
        // jointes d'une absence déclarée à l'avance ou justifiée après coup.
        familyJustification: evaluation?.familyJustification || null,
        justificationStatus: evaluation?.justificationStatus || 'NONE',
        absenceReason: evaluation?.absenceReason || null,
        justificationDocuments: (evaluation?.justificationDocuments || []).map((doc) => ({
          id: doc.id,
          fileName: doc.fileName,
          fileUrl: doc.fileUrl,
        })),
        createdAt: evaluation?.createdAt || null,
        absenceCount: absentCountByStudent.get(student.id) || 0,
        lateCount: lateCountByStudent.get(student.id) || 0,
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
    where: { id: classId, ...classAccessWhere(teacherProfile.id) },
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

  // Élèves déclarés absents lors d'un précédent enregistrement de cette même
  // feuille d'appel, et que le professeur vient de repasser à "présent" (arrivée
  // après le début du cours) — déclenche un second mail distinct de celui d'absence.
  const nowPresentStudentIds = students
    .filter((studentRow) => evaluationByStudent.get(studentRow.studentId)?.status === 'missing' && studentRow.status === 'on_time')
    .map((studentRow) => studentRow.studentId);

  if (absentStudentIds.length > 0 || nowPresentStudentIds.length > 0) {
    const lessonDate = new Date(lesson.date).toLocaleDateString('fr-FR');
    const classLabel = `${classRecord.level?.pole?.name || ''}${classRecord.level?.pole ? ' - ' : ''}${classRecord.level?.name || ''}`;
    const teacherName = `${teacherProfile.firstName || ''} ${teacherProfile.lastName || ''}`.trim();

    const groupStudentsByFamily = async (studentIds) => {
      if (studentIds.length === 0) return [];
      const foundStudents = await prisma.student.findMany({
        where: { id: { in: studentIds } },
        include: { family: { include: { user: true } } },
      });

      const byFamily = new Map();
      foundStudents.forEach((student) => {
        if (!student.family) return;
        const entry = byFamily.get(student.familyId) || { family: student.family, students: [] };
        entry.students.push(student);
        byFamily.set(student.familyId, entry);
      });
      return Array.from(byFamily.values());
    };

    const sendFamilyEmails = async (studentIds, buildEmail) => {
      const familyGroups = await groupStudentsByFamily(studentIds);
      await Promise.all(familyGroups.map(async ({ family, students: familyStudents }) => {
        // Email du compte famille + email secondaire (Family.emailSecondary) si renseigné.
        const recipients = getFamilyEmailRecipients(family);
        if (recipients.length === 0) return;

        const { subject, contentHtml } = buildEmail(familyStudents);
        await sendMail({ to: recipients, subject, html: contentHtml });
      }));
    };

    await sendFamilyEmails(absentStudentIds, (familyStudents) => {
      const studentListHtml = familyStudents
        .map((student) => `<li><strong>${student.firstName} ${student.lastName}</strong> — Classe : ${classLabel}</li>`)
        .join('');
      return {
        subject: `AMC — Absence(s) de votre/vos membre(s) de famille le ${lessonDate}`,
        contentHtml: `
          <p>Bonjour,</p>
          <p>Nous vous informons que votre enfant a été absent au cours suivant :</p>
          <ul>${studentListHtml}</ul>
          <p><strong>Informations du cours</strong></p>
          <ul>
            <li>Cours : ${lesson.title}</li>
            <li>Date : ${lessonDate}</li>
            <li>Classe : ${classLabel}</li>
            <li>Professeur : ${teacherName}</li>
          </ul>
          <p>Merci de justifier son absence en vous connectant à votre espace famille (onglet absence) ou vous rapprocher de l'administration pour justifier cette absence.</p>
          <p>Cordialement,<br/>Administration AMC</p>
        `,
      };
    });

    await sendFamilyEmails(nowPresentStudentIds, (familyStudents) => {
      const studentListHtml = familyStudents
        .map((student) => `<li><strong>${student.firstName} ${student.lastName}</strong> — Classe : ${classLabel}</li>`)
        .join('');
      const plural = familyStudents.length > 1;
      return {
        subject: `AMC — ${plural ? 'Vos enfants sont' : 'Votre enfant est'} bien présent${plural ? 's' : ''} au cours du ${lessonDate}`,
        contentHtml: `
          <p>Bonjour,</p>
          <p>Nous vous informons que ${plural ? 'vos enfants sont arrivés et sont' : 'votre enfant est arrivé et est'} désormais présent${plural ? 's' : ''} au cours suivant :</p>
          <ul>${studentListHtml}</ul>
          <p><strong>Informations du cours</strong></p>
          <ul>
            <li>Cours : ${lesson.title}</li>
            <li>Date : ${lessonDate}</li>
            <li>Classe : ${classLabel}</li>
            <li>Professeur : ${teacherName}</li>
          </ul>
          <p>Cordialement,<br/>Administration AMC</p>
        `,
      };
    });
  }

  return { lessonId: lesson.id };
}

async function fetchEvaluations({ teacherUserId, classId, lessonId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { class: { include: { classTeachers: true } } },
  });
  if (!lesson || lesson.classId !== classId) {
    throw new Error('Leçon ou classe invalide');
  }
  if (!teacherHasClassAccess(lesson.class, teacherProfile.id)) {
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
    where: { id: classId, ...classAccessWhere(teacherProfile.id) },
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

// Classement de la classe (Tableau de bord, onglet "Classement des élèves" et KPI
// "En difficulté") : moyenne par élève sur toutes ses évaluations réellement saisies
// par le professeur (`submitted: true` — même signal que fetchStudentNotes, une
// leçon de prise de présence a `submitted: false` par défaut et ne doit pas fausser
// la moyenne). Contrairement à `fetchEvaluations`, qui ne porte que sur une leçon
// précise, ceci agrège sur toute la classe.
async function fetchClassGradeSummary({ teacherUserId, classId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, ...classAccessWhere(teacherProfile.id) } });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  const enrollments = await prisma.enrollment.findMany({
    where: { classId, status: { in: ['PENDING', 'CONFIRMED'] } },
    include: { student: true },
  });

  const evaluations = await prisma.evaluation.findMany({
    where: { lesson: { classId }, submitted: true },
  });

  const gradesByStudent = new Map();
  evaluations.forEach((evaluation) => {
    const grades = gradesByStudent.get(evaluation.studentId) || [];
    grades.push(evaluation.grade);
    gradesByStudent.set(evaluation.studentId, grades);
  });

  return enrollments
    .map((enrollment) => {
      const grades = gradesByStudent.get(enrollment.studentId) || [];
      if (grades.length === 0) return null;
      const average = grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
      return {
        studentId: enrollment.studentId,
        studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
        grade: Number(average.toFixed(1)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.grade - a.grade);
}

async function computeStats({ teacherUserId, classId, lessonId }) {
  const teacherProfile = await getTeacherProfile(teacherUserId);
  if (!teacherProfile) throw new Error('Profil professeur introuvable');

  const classRecord = await prisma.class.findFirst({ where: { id: classId, ...classAccessWhere(teacherProfile.id) } });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');

  const totalStudents = await prisma.enrollment.count({
    where: { classId, status: { in: ['PENDING', 'CONFIRMED'] } },
  });

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { class: { include: { classTeachers: true } } },
  });
  if (!lesson || lesson.classId !== classId) {
    throw new Error('Leçon ou classe invalide');
  }
  if (!teacherHasClassAccess(lesson.class, teacherProfile.id)) {
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
    include: { class: { include: { classTeachers: true } } },
  });
  if (!lesson) {
    throw new Error('Leçon invalide');
  }
  if (!teacherHasClassAccess(lesson.class, teacherProfile.id)) {
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
    where: { id: classId, ...classAccessWhere(teacherProfile.id) },
    include: { schoolYear: true, level: { include: { pole: true } } },
  });
  if (!classRecord) throw new Error('Vous n\'avez pas accès à cette classe');
  if (!classRecord.schoolYear) throw new Error('Année scolaire introuvable pour cette classe');

  // La leçon support d'une note de période doit être datée DANS la période visée
  // (getPeriodRange filtre ensuite les notes du bulletin par plage de dates) —
  // sinon toute note de Trimestre 2/3 ou Semestre 2 retombe dans la période 1.
  const range = getPeriodRange(classRecord.schoolYear, classRecord.level?.pole, period);
  const lessonDate = range ? range[0] : (classRecord.schoolYear.startDate || new Date());

  const noteLessonTitle = `${period} - ${discipline}`;
  let noteLesson = await prisma.lesson.findFirst({ where: { classId, title: noteLessonTitle } });
  if (!noteLesson) {
    noteLesson = await prisma.lesson.create({
      data: {
        classId,
        title: noteLessonTitle,
        description: `Note de période ${period} (${discipline})`,
        date: lessonDate,
      },
    });
  } else if (noteLesson.date.getTime() !== lessonDate.getTime()) {
    noteLesson = await prisma.lesson.update({ where: { id: noteLesson.id }, data: { date: lessonDate } });
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
  fetchClassJustifications,
  updateJustificationDecision,
  fetchLessonAttendanceSheet,
  fetchAbsenceRoster,
  fetchAbsenceRanking,
  saveAbsences,
  fetchEvaluations,
  fetchClassGradeSummary,
  computeStats,
  upsertEvaluation,
  fetchPeriodNotes,
  upsertPeriodNote,
};
