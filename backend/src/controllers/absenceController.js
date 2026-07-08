const PDFDocument = require('pdfkit');
const { PrismaClient } = require('@prisma/client');
const { fetchAbsenceRoster, fetchAbsenceHistory, fetchLessonAttendanceSheet, saveAbsences, fetchClassStudents } = require('../services/evaluationService');

const prisma = new PrismaClient();

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

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    doc.pipe(res);

    doc.fontSize(15).text('Feuille de présence', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10).text(`Classe: ${cls.level.pole?.name || '-'} - ${cls.level.name}`);
    doc.text(`Année scolaire: ${cls.schoolYear?.label || '-'}`);
    doc.text(`Date de la leçon: ${new Date(lesson.date).toLocaleDateString('fr-FR')}`);
    doc.text(`Cours: ${lesson.title}`);
    if (lesson.description) {
      doc.text(`Description: ${lesson.description}`);
    }
    doc.moveDown(0.8);

    const startX = doc.x;
    let y = doc.y;
    const rowHeight = 22;
    const nameWidth = 220;
    const statusWidth = 80;
    const justificationWidth = 220;
    const signatureWidth = 120;
    const tableWidth = nameWidth + statusWidth + justificationWidth + signatureWidth;
    const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const adjustedJustificationWidth = justificationWidth + Math.max(0, availableWidth - tableWidth);

    doc.rect(startX, y, nameWidth, rowHeight).stroke();
    doc.fontSize(8).text('Élève', startX + 4, y + 7, { width: nameWidth - 8 });
    doc.rect(startX + nameWidth, y, statusWidth, rowHeight).stroke();
    doc.fontSize(8).text('Absence', startX + nameWidth + 4, y + 7, { width: statusWidth - 8, align: 'center' });
    doc.rect(startX + nameWidth + statusWidth, y, adjustedJustificationWidth, rowHeight).stroke();
    doc.fontSize(8).text('Justification', startX + nameWidth + statusWidth + 4, y + 7, { width: adjustedJustificationWidth - 8, align: 'center' });
    doc.rect(startX + nameWidth + statusWidth + adjustedJustificationWidth, y, signatureWidth, rowHeight).stroke();
    doc.fontSize(8).text('Signature', startX + nameWidth + statusWidth + adjustedJustificationWidth + 4, y + 7, { width: signatureWidth - 8, align: 'center' });

    y += rowHeight;
    students.forEach((student) => {
      if (y > doc.page.height - 40) {
        doc.addPage();
        y = 30;
      }

      doc.rect(startX, y, nameWidth, rowHeight).stroke();
      doc.fontSize(8).text(student.studentName, startX + 4, y + 7, { width: nameWidth - 8 });
      doc.rect(startX + nameWidth, y, statusWidth, rowHeight).stroke();
      doc.fontSize(8).text(student.status === 'missing' ? 'Absent' : 'Présent', startX + nameWidth + 4, y + 7, { width: statusWidth - 8, align: 'center' });
      doc.rect(startX + nameWidth + statusWidth, y, adjustedJustificationWidth, rowHeight).stroke();
      doc.fontSize(8).text(student.justification || '', startX + nameWidth + statusWidth + 4, y + 7, { width: adjustedJustificationWidth - 8 });
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

async function getJustifications(req, res) {
  try {
    const { status } = req.query;
    const statusFilter = status || 'PENDING';

    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        e.id,
        e.student_id AS "studentId",
        e.lesson_id AS "lessonId",
        e.family_justification AS "familyJustification",
        e.justification_status AS "justificationStatus",
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
      WHERE e.justification_status = $1
        AND e.status = 'missing'
      ORDER BY l.date DESC
    `, statusFilter);

    return res.json({
      justifications: rows.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        studentName: `${r.studentFirstName || ''} ${r.studentLastName || ''}`.trim(),
        familyName: r.familyName || '-',
        lessonDate: r.lessonDate,
        lessonTitle: r.lessonTitle,
        classLabel: [r.poleName, r.levelName].filter(Boolean).join(' - ') || '-',
        familyJustification: r.familyJustification,
        justificationStatus: r.justificationStatus,
        teacherJustification: r.justification,
      })),
    });
  } catch (error) {
    console.error('Erreur getJustifications:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function patchJustification(req, res) {
  try {
    const { evaluationId } = req.params;
    const { status } = req.body;
    if (!['VALIDATED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide (VALIDATED ou REJECTED)' });
    }
    await prisma.$queryRawUnsafe(
      `UPDATE evaluations SET justification_status = $1 WHERE id = $2`,
      status,
      evaluationId,
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur patchJustification:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getAbsences,
  getClassStudents,
  getAbsenceHistory,
  exportLessonAttendancePdf,
  postAbsences,
  getJustifications,
  patchJustification,
};