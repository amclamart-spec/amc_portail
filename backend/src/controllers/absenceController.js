const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { fetchAbsenceRoster, fetchAbsenceRanking, fetchAbsenceHistory, fetchLessonAttendanceSheet, saveAbsences, fetchClassStudents } = require('../services/evaluationService');
const { POLE_MANAGER_ROLES, POLE_ROLE_TO_NAME } = require('../middleware/poleManagerDelegation');

// Un responsable de pôle ne doit voir/agir que sur les absences de son propre pôle ;
// un admin (ou autre rôle disposant de la permission) voit tout.
function poleNameForUser(user) {
  return POLE_MANAGER_ROLES.includes(user.role) ? POLE_ROLE_TO_NAME[user.role] : undefined;
}

const prisma = new PrismaClient();

function findLogo(names) {
  const bases = [
    path.join(process.cwd(), '../frontend/public'),
    path.join(process.cwd(), '../../frontend/public'),
    path.join(__dirname, '../../../frontend/public'),
    path.join(__dirname, '../../uploads'),
  ];
  for (const name of names) {
    for (const base of bases) {
      const p = path.join(base, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

async function getAbsences(req, res) {
  try {
    const { classId, date } = req.query;
    if (!classId || !date) {
      return res.status(400).json({ error: 'classId et date sont requis' });
    }

    const absenceData = await fetchAbsenceRoster({
      teacherUserId: req.user.id,
      classId,
      date,
    });

    return res.json(absenceData);
  } catch (error) {
    console.error('Erreur getAbsences:', error);
    const status = error.statusCode || (error.message.includes('requis') || error.message.includes('Aucune leçon trouvée')
      ? 400
      : 500);
    return res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getAbsenceRanking(req, res) {
  try {
    const { classId } = req.query;
    if (!classId) {
      return res.status(400).json({ error: 'classId est requis' });
    }

    const ranking = await fetchAbsenceRanking({ teacherUserId: req.user.id, classId });
    return res.json({ ranking });
  } catch (error) {
    console.error('Erreur getAbsenceRanking:', error);
    const status = error.statusCode || (error.message.includes('accès') ? 403 : 500);
    return res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

// Même logique de filtre/tri que le classement affiché côté frontend (displayedAbsenceRanking) :
// 'ALL' garde tous les élèves, 'JUSTIFIED'/'UNJUSTIFIED' ne gardent que ceux ayant au moins
// une absence ou un retard de ce type.
function pickRankingCounts(row, justified) {
  if (justified === 'JUSTIFIED') return { absence: row.absenceCountJustified, late: row.lateCountJustified };
  if (justified === 'UNJUSTIFIED') return { absence: row.absenceCountUnjustified, late: row.lateCountUnjustified };
  return { absence: row.absenceCount, late: row.lateCount };
}

async function exportAbsenceRanking(req, res) {
  try {
    const { classId, justified } = req.query;
    if (!classId) {
      return res.status(400).json({ error: 'classId est requis' });
    }

    const ranking = await fetchAbsenceRanking({ teacherUserId: req.user.id, classId });
    const rows = ranking
      .map((row) => ({ studentName: row.studentName, ...pickRankingCounts(row, justified) }))
      .filter((row) => justified === 'JUSTIFIED' || justified === 'UNJUSTIFIED' ? (row.absence > 0 || row.late > 0) : true)
      .sort((a, b) => b.absence - a.absence || b.late - a.late);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Classement absences');
    worksheet.columns = [
      { header: 'Élève', key: 'studentName', width: 32 },
      { header: 'Absences', key: 'absence', width: 14 },
      { header: 'Retards', key: 'late', width: 14 },
    ];
    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="classement-absences-${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Erreur exportAbsenceRanking:', error);
    const status = error.statusCode || (error.message.includes('accès') ? 403 : 500);
    res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getClassStudents(req, res) {
  try {
    const { classId } = req.query;
    if (!classId) {
      return res.status(400).json({ error: 'classId est requis' });
    }

    const students = await fetchClassStudents({
      teacherUserId: req.user.id,
      classId,
    });

    return res.json({ students });
  } catch (error) {
    console.error('Erreur getClassStudents:', error);
    const status = error.statusCode || (error.message.includes('requis') || error.message.includes('Aucune leçon trouvée')
      ? 400
      : 500);
    return res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getAbsenceHistory(req, res) {
  try {
    const { classId } = req.query;
    if (!classId) {
      return res.status(400).json({ error: 'classId est requis' });
    }

    const history = await fetchAbsenceHistory({
      teacherUserId: req.user.id,
      classId,
    });

    return res.json({ lessons: history });
  } catch (error) {
    console.error('Erreur getAbsenceHistory:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

async function exportLessonAttendancePdf(req, res) {
  try {
    const { lessonId } = req.params;
    if (!lessonId) {
      return res.status(400).json({ error: 'lessonId est requis' });
    }

    const { lesson, class: cls, students } = await fetchLessonAttendanceSheet({
      teacherUserId: req.user.id,
      lessonId,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="presence-${lesson.id}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    doc.pipe(res);

    /* ── logos + en-tête association ── */
    const amcLogoPath = findLogo(['amc_logo.png']);
    const partnerLogoPath = findLogo(['amc_logo_partner.png']);
    const headerY = 30;
    const logoH = 40;
    const logoW = 100;
    try {
      if (amcLogoPath) doc.image(amcLogoPath, doc.page.margins.left, headerY, { fit: [logoW, logoH], align: 'left' });
      if (partnerLogoPath) doc.image(partnerLogoPath, doc.page.width - doc.page.margins.right - logoW, headerY, { fit: [logoW, logoH], align: 'right' });
    } catch (e) {
      console.warn('Feuille de présence: erreur logo', e?.message);
    }

    doc.y = headerY + logoH + 10;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#6B7280').text('ASSOCIATION PARTAGE ET DES MUSULMANS DE CLAMART', { align: 'center' });
    doc.fontSize(9).font('Helvetica').text('Portail interne', { align: 'center' });
    doc.moveDown(0.6);
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000').text('Feuille de présence', { align: 'center' });
    doc.moveDown(0.8);

    doc.fontSize(10).font('Helvetica');
    doc.text(`Classe: ${cls.level.pole?.name || '-'} - ${cls.level.name}`);
    doc.moveDown(0.25);
    doc.text(`Année scolaire: ${cls.schoolYear?.label || '-'}`);
    doc.moveDown(0.25);
    doc.text(`Date de la leçon: ${new Date(lesson.date).toLocaleDateString('fr-FR')}`);
    doc.moveDown(0.25);
    doc.text(`Cours: ${lesson.title}`);
    if (lesson.description) {
      doc.moveDown(0.25);
      doc.text(`Description: ${lesson.description}`);
    }
    doc.moveDown(1.2);

    const startX = doc.x;
    let y = doc.y;
    const rowHeight = 28;
    const nameWidth = 220;
    const statusWidth = 80;
    const justificationWidth = 220;
    const signatureWidth = 120;
    const tableWidth = nameWidth + statusWidth + justificationWidth + signatureWidth;
    const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const adjustedJustificationWidth = justificationWidth + Math.max(0, availableWidth - tableWidth);

    doc.rect(startX, y, nameWidth, rowHeight).stroke();
    doc.fontSize(8).text('Élève', startX + 4, y + 10, { width: nameWidth - 8 });
    doc.rect(startX + nameWidth, y, statusWidth, rowHeight).stroke();
    doc.fontSize(8).text('Absence', startX + nameWidth + 4, y + 10, { width: statusWidth - 8, align: 'center' });
    doc.rect(startX + nameWidth + statusWidth, y, adjustedJustificationWidth, rowHeight).stroke();
    doc.fontSize(8).text('Justification', startX + nameWidth + statusWidth + 4, y + 10, { width: adjustedJustificationWidth - 8, align: 'center' });
    doc.rect(startX + nameWidth + statusWidth + adjustedJustificationWidth, y, signatureWidth, rowHeight).stroke();
    doc.fontSize(8).text('Signature', startX + nameWidth + statusWidth + adjustedJustificationWidth + 4, y + 10, { width: signatureWidth - 8, align: 'center' });

    y += rowHeight;
    students.forEach((student) => {
      if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      doc.rect(startX, y, nameWidth, rowHeight).stroke();
      doc.fontSize(8).text(student.studentName, startX + 4, y + 10, { width: nameWidth - 8 });
      doc.rect(startX + nameWidth, y, statusWidth, rowHeight).stroke();
      doc.fontSize(8).text(student.status === 'missing' ? 'Absent' : 'Présent', startX + nameWidth + 4, y + 10, { width: statusWidth - 8, align: 'center' });
      doc.rect(startX + nameWidth + statusWidth, y, adjustedJustificationWidth, rowHeight).stroke();
      doc.fontSize(8).text(student.justification || '', startX + nameWidth + statusWidth + 4, y + 10, { width: adjustedJustificationWidth - 8 });
      doc.rect(startX + nameWidth + statusWidth + adjustedJustificationWidth, y, signatureWidth, rowHeight).stroke();
      y += rowHeight;
    });

    doc.end();
  } catch (error) {
    console.error('Erreur exportLessonAttendancePdf:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postAbsences(req, res) {
  try {
    const { classId, date, lessonId, students } = req.body;
    if (!classId || !Array.isArray(students) || (!date && !lessonId)) {
      return res.status(400).json({ error: 'classId, date ou lessonId et students sont requis' });
    }

    const result = await saveAbsences({
      teacherUserId: req.user.id,
      classId,
      date,
      lessonId,
      students,
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('Erreur postAbsences:', error);
    const status = error.statusCode || (error.message.includes('requis') || error.message.includes('Aucune leçon trouvée')
      ? 400
      : 500);
    return res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

// Récupère la liste des justificatifs d'absence, avec filtre optionnel par pôle
// (utilisé par l'espace responsable de pôle) et par nom d'élève.
async function fetchJustificationsList({ status, poleName, studentName } = {}) {
  const statusFilter = status || 'PENDING';
  const params = [statusFilter];
  const conditions = ['e.justification_status = $1', "e.status = 'missing'"];

  if (poleName) {
    params.push(poleName);
    conditions.push(`p.name ILIKE $${params.length}`);
  }
  if (studentName && studentName.trim()) {
    params.push(`%${studentName.trim()}%`);
    conditions.push(`(s.first_name || ' ' || s.last_name) ILIKE $${params.length}`);
  }

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      e.id,
      e.student_id AS "studentId",
      e.lesson_id AS "lessonId",
      e.family_justification AS "familyJustification",
      e.justification_status AS "justificationStatus",
      e.absence_reason AS "absenceReason",
      e.justification,
      s.first_name AS "studentFirstName",
      s.last_name AS "studentLastName",
      l.date AS "lessonDate",
      l.title AS "lessonTitle",
      c.id AS "classId",
      lv.name AS "levelName",
      p.name AS "poleName",
      f.family_name AS "familyName"
    FROM evaluations e
    JOIN students s ON s.id = e.student_id
    JOIN lessons l ON l.id = e.lesson_id
    JOIN classes c ON c.id = l.class_id
    LEFT JOIN levels lv ON lv.id = c.level_id
    LEFT JOIN poles p ON p.id = lv.pole_id
    LEFT JOIN families f ON f.id = s.family_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY l.date DESC
  `, ...params);

  const evaluationIds = rows.map((r) => r.id);
  const documents = evaluationIds.length > 0
    ? await prisma.absenceJustificationDocument.findMany({
      where: { evaluationId: { in: evaluationIds } },
      orderBy: { createdAt: 'asc' },
    })
    : [];
  const documentsByEvaluation = {};
  documents.forEach((doc) => {
    if (!documentsByEvaluation[doc.evaluationId]) documentsByEvaluation[doc.evaluationId] = [];
    documentsByEvaluation[doc.evaluationId].push({ id: doc.id, fileName: doc.fileName, fileUrl: doc.fileUrl });
  });

  return rows.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    studentName: `${r.studentFirstName || ''} ${r.studentLastName || ''}`.trim(),
    familyName: r.familyName || '-',
    lessonDate: r.lessonDate,
    lessonTitle: r.lessonTitle,
    classLabel: [r.poleName, r.levelName].filter(Boolean).join(' - ') || '-',
    familyJustification: r.familyJustification,
    justificationStatus: r.justificationStatus,
    absenceReason: r.absenceReason,
    teacherJustification: r.justification,
    justificationDocuments: documentsByEvaluation[r.id] || [],
  }));
}

async function getEvaluationPoleName(evaluationId) {
  const [row] = await prisma.$queryRawUnsafe(`
    SELECT p.name AS "poleName"
    FROM evaluations e
    JOIN lessons l ON l.id = e.lesson_id
    JOIN classes c ON c.id = l.class_id
    LEFT JOIN levels lv ON lv.id = c.level_id
    LEFT JOIN poles p ON p.id = lv.pole_id
    WHERE e.id = $1
  `, evaluationId);
  return row?.poleName || null;
}

// Met à jour le statut d'un justificatif. Si `poleName` est fourni (cas d'un
// responsable de pôle), vérifie d'abord que le justificatif appartient bien à
// ce pôle avant d'autoriser la modification.
async function updateJustificationStatus({ evaluationId, status, poleName }) {
  if (!['VALIDATED', 'REJECTED'].includes(status)) {
    const error = new Error('Statut invalide (VALIDATED ou REJECTED)');
    error.statusCode = 400;
    throw error;
  }

  if (poleName) {
    const evaluationPole = await getEvaluationPoleName(evaluationId);
    if (!evaluationPole || evaluationPole.toLowerCase() !== poleName.toLowerCase()) {
      const error = new Error('Ce justificatif n\'appartient pas à votre pôle');
      error.statusCode = 403;
      throw error;
    }
  }

  await prisma.$queryRawUnsafe(
    `UPDATE evaluations SET justification_status = $1 WHERE id = $2`,
    status,
    evaluationId,
  );
}

async function getJustifications(req, res) {
  try {
    const { status, studentName } = req.query;
    const poleName = poleNameForUser(req.user);
    const justifications = await fetchJustificationsList({ status, poleName, studentName });
    return res.json({ justifications });
  } catch (error) {
    console.error('Erreur getJustifications:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function patchJustification(req, res) {
  try {
    const { evaluationId } = req.params;
    const { status } = req.body;
    const poleName = poleNameForUser(req.user);
    await updateJustificationStatus({ evaluationId, status, poleName });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur patchJustification:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Erreur serveur' });
  }
}

module.exports = {
  getAbsences,
  getAbsenceRanking,
  exportAbsenceRanking,
  getClassStudents,
  getAbsenceHistory,
  exportLessonAttendancePdf,
  postAbsences,
  getJustifications,
  patchJustification,
  fetchJustificationsList,
  updateJustificationStatus,
};