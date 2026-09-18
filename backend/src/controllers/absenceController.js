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

const REASON_LABELS = { MALADE: 'Malade', VOYAGE: 'Voyage', AUTRE: 'Autre' };
const STATUS_LABELS = { PENDING: 'En attente', VALIDATED: 'Validé', REJECTED: 'Refusé' };

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
async function fetchJustificationsList({ status, poleName, poleId, levelId, studentName, dateFrom, dateTo } = {}) {
  const statusFilter = status || 'PENDING';
  const params = [statusFilter];
  const conditions = ['e.justification_status = $1', "e.status = 'missing'"];

  // poleName : scoping automatique d'un responsable de pôle (voir poleNameForUser).
  // poleId : filtre manuel choisi par un admin dans l'écran de recherche.
  if (poleName) {
    params.push(poleName);
    conditions.push(`p.name ILIKE $${params.length}`);
  }
  if (poleId) {
    params.push(poleId);
    conditions.push(`p.id = $${params.length}`);
  }
  if (levelId) {
    params.push(levelId);
    conditions.push(`lv.id = $${params.length}`);
  }
  if (studentName && studentName.trim()) {
    params.push(`%${studentName.trim()}%`);
    conditions.push(`(s.first_name || ' ' || s.last_name) ILIKE $${params.length}`);
  }
  if (dateFrom) {
    params.push(new Date(dateFrom));
    conditions.push(`l.date >= $${params.length}`);
  }
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    params.push(end);
    conditions.push(`l.date <= $${params.length}`);
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
    const { status, studentName, poleId, levelId, dateFrom, dateTo } = req.query;
    const poleName = poleNameForUser(req.user);
    const justifications = await fetchJustificationsList({ status, poleName, poleId, levelId, studentName, dateFrom, dateTo });
    return res.json({ justifications });
  } catch (error) {
    console.error('Erreur getJustifications:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Ligne de filtres lisible affichée en tête d'export (PDF) — reflète les mêmes
// critères que la liste JSON, pour que l'export corresponde exactement à ce que
// l'utilisateur voit à l'écran.
async function buildJustificationsFilterSummary({ status, poleName, poleId, dateFrom, dateTo }) {
  const parts = [];
  parts.push(`Statut : ${STATUS_LABELS[status || 'PENDING'] || status}`);
  if (poleName) {
    parts.push(`Pôle : ${poleName}`);
  } else if (poleId) {
    const pole = await prisma.pole.findUnique({ where: { id: poleId }, select: { name: true } });
    if (pole) parts.push(`Pôle : ${pole.name}`);
  }
  if (dateFrom) parts.push(`Du ${new Date(dateFrom).toLocaleDateString('fr-FR')}`);
  if (dateTo) parts.push(`Au ${new Date(dateTo).toLocaleDateString('fr-FR')}`);
  return parts.join('  ·  ');
}

async function exportJustificationsExcel(req, res) {
  try {
    const { status, studentName, poleId, levelId, dateFrom, dateTo } = req.query;
    const poleName = poleNameForUser(req.user);
    const justifications = await fetchJustificationsList({ status, poleName, poleId, levelId, studentName, dateFrom, dateTo });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Suivi des absences');
    worksheet.columns = [
      { header: 'Date absence', key: 'date', width: 16 },
      { header: 'Élève', key: 'studentName', width: 26 },
      { header: 'Famille', key: 'familyName', width: 24 },
      { header: 'Cours', key: 'classLabel', width: 28 },
      { header: 'Motif', key: 'reason', width: 14 },
      { header: 'Statut', key: 'status', width: 14 },
      { header: 'Justificatif famille', key: 'familyJustification', width: 45 },
      { header: 'Note professeur', key: 'teacherJustification', width: 35 },
    ];
    worksheet.addRows(justifications.map((j) => ({
      date: j.lessonDate ? new Date(j.lessonDate).toLocaleDateString('fr-FR') : '-',
      studentName: j.studentName,
      familyName: j.familyName,
      classLabel: j.classLabel,
      reason: REASON_LABELS[j.absenceReason] || '-',
      status: STATUS_LABELS[j.justificationStatus] || j.justificationStatus,
      familyJustification: j.familyJustification || '-',
      teacherJustification: j.teacherJustification || '-',
    })));

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF213B88' } };
    headerRow.alignment = { vertical: 'middle' };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = { from: 'A1', to: 'H1' };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="suivi-absences-${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Erreur exportJustificationsExcel:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function exportJustificationsPdf(req, res) {
  try {
    const { status, studentName, poleId, levelId, dateFrom, dateTo } = req.query;
    const poleName = poleNameForUser(req.user);
    const justifications = await fetchJustificationsList({ status, poleName, poleId, levelId, studentName, dateFrom, dateTo });
    const filterSummary = await buildJustificationsFilterSummary({ status, poleName, poleId, dateFrom, dateTo });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="suivi-absences-${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    doc.pipe(res);

    /* ── logos + en-tête association (mêmes conventions que la feuille de présence) ── */
    const amcLogoPath = findLogo(['amc_logo.png']);
    const partnerLogoPath = findLogo(['amc_logo_partner.png']);
    const headerY = 30;
    const logoH = 40;
    const logoW = 100;
    try {
      if (amcLogoPath) doc.image(amcLogoPath, doc.page.margins.left, headerY, { fit: [logoW, logoH], align: 'left' });
      if (partnerLogoPath) doc.image(partnerLogoPath, doc.page.width - doc.page.margins.right - logoW, headerY, { fit: [logoW, logoH], align: 'right' });
    } catch (e) {
      console.warn('Suivi absences PDF: erreur logo', e?.message);
    }

    doc.y = headerY + logoH + 10;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#6B7280').text('ASSOCIATION PARTAGE ET DES MUSULMANS DE CLAMART', { align: 'center' });
    doc.fontSize(9).font('Helvetica').text('Portail interne', { align: 'center' });
    doc.moveDown(0.6);
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000').text('Suivi des absences', { align: 'center' });
    doc.moveDown(0.4);
    if (filterSummary) {
      doc.fontSize(9).font('Helvetica').fillColor('#374151').text(filterSummary, { align: 'center' });
    }
    doc.moveDown(0.8);
    doc.fillColor('#000000');

    const startX = doc.x;
    let y = doc.y;
    const rowHeight = 26;
    const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const cols = [
      { key: 'date', label: 'Date', width: 65 },
      { key: 'studentName', label: 'Élève', width: 120 },
      { key: 'familyName', label: 'Famille', width: 110 },
      { key: 'classLabel', label: 'Cours', width: 140 },
      { key: 'reason', label: 'Motif', width: 65 },
      { key: 'status', label: 'Statut', width: 75 },
    ];
    const fixedWidth = cols.reduce((sum, c) => sum + c.width, 0);
    cols.push({ key: 'familyJustification', label: 'Justificatif famille', width: Math.max(140, availableWidth - fixedWidth) });

    const drawRow = (values, isHeader = false) => {
      let x = startX;
      cols.forEach((col) => {
        doc.rect(x, y, col.width, rowHeight).stroke();
        doc.fontSize(isHeader ? 8 : 7.5).font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
          .text(String(values[col.key] ?? ''), x + 4, y + rowHeight / 2 - 4, { width: col.width - 8, height: rowHeight - 6, ellipsis: true });
        x += col.width;
      });
      y += rowHeight;
    };

    const headerValues = Object.fromEntries(cols.map((c) => [c.key, c.label]));
    drawRow(headerValues, true);

    justifications.forEach((j) => {
      if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
        doc.addPage();
        y = doc.page.margins.top;
        drawRow(headerValues, true);
      }
      drawRow({
        date: j.lessonDate ? new Date(j.lessonDate).toLocaleDateString('fr-FR') : '-',
        studentName: j.studentName,
        familyName: j.familyName,
        classLabel: j.classLabel,
        reason: REASON_LABELS[j.absenceReason] || '-',
        status: STATUS_LABELS[j.justificationStatus] || j.justificationStatus,
        familyJustification: j.familyJustification || '-',
      });
    });

    if (justifications.length === 0) {
      doc.moveDown(1);
      doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('Aucun résultat pour ces critères.', { align: 'center' });
    }

    doc.end();
  } catch (error) {
    console.error('Erreur exportJustificationsPdf:', error);
    res.status(500).json({ error: 'Erreur serveur' });
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
  exportJustificationsExcel,
  exportJustificationsPdf,
  fetchJustificationsList,
  updateJustificationStatus,
};