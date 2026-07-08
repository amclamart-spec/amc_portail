const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
  fetchLessonsByClass,
  fetchEvaluations,
  computeStats,
  upsertEvaluation,
  fetchPeriodNotes,
  upsertPeriodNote,
} = require('../services/evaluationService');
const { computeModuleStats } = require('../services/statsService');

async function getEvaluations(req, res) {
  try {
    const { lessonId, classId, module } = req.query;
    if (!classId) {
      return res.status(400).json({ error: 'classId est requis' });
    }

    let stats;
    let evaluations = [];

    if (module) {
      stats = await computeModuleStats({
        teacherUserId: req.user.id,
        classId,
        module,
      });
    }

    if (lessonId) {
      evaluations = await fetchEvaluations({
        teacherUserId: req.user.id,
        classId,
        lessonId,
      });
      stats = await computeStats({
        teacherUserId: req.user.id,
        classId,
        lessonId,
      });
    } else if (!module) {
      stats = { totalStudents: 0 };
    }

    return res.json({ evaluations, stats });
  } catch (error) {
    console.error('Erreur getEvaluations:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postEvaluation(req, res) {
  try {
    const { studentId, lessonId, grade, appreciation, submitted, status } = req.body;
    if (!studentId || !lessonId) {
      return res.status(400).json({ error: 'studentId et lessonId sont requis' });
    }

    const evaluation = await upsertEvaluation({
      teacherUserId: req.user.id,
      studentId,
      lessonId,
      grade: Number(grade),
      appreciation: appreciation || '',
      submitted: Boolean(submitted),
      status,
    });

    return res.json({ evaluation });
  } catch (error) {
    console.error('Erreur postEvaluation:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getEvaluationStats(req, res) {
  try {
    const { lessonId, classId, module } = req.query;
    if (!classId) {
      return res.status(400).json({ error: 'classId est requis' });
    }

    let stats;

    if (module) {
      stats = await computeModuleStats({
        teacherUserId: req.user.id,
        classId,
        module,
      });
    } else {
      stats = await computeStats({
        teacherUserId: req.user.id,
        classId,
        lessonId,
      });
    }

    return res.json({ stats });
  } catch (error) {
    console.error('Erreur getEvaluationStats:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getLessons(req, res) {
  try {
    const { classId, date } = req.query;
    if (!classId) {
      return res.status(400).json({ error: 'classId est requis' });
    }

    const lessons = await fetchLessonsByClass({
      teacherUserId: req.user.id,
      classId,
      date,
    });

    return res.json({ lessons });
  } catch (error) {
    console.error('Erreur getLessons:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getPeriodNotes(req, res) {
  try {
    const { classId, period } = req.query;
    if (!classId || !period) {
      return res.status(400).json({ error: 'classId et period sont requis' });
    }

    const data = await fetchPeriodNotes({
      teacherUserId: req.user.id,
      classId,
      period,
    });

    return res.json(data);
  } catch (error) {
    console.error('Erreur getPeriodNotes:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postPeriodNote(req, res) {
  try {
    const { classId, period, studentId, discipline, grade } = req.body;
    if (!classId || !period || !studentId || !discipline || grade === undefined) {
      return res.status(400).json({ error: 'classId, period, studentId, discipline et grade sont requis' });
    }

    const note = await upsertPeriodNote({
      teacherUserId: req.user.id,
      classId,
      period,
      studentId,
      discipline,
      grade: Number(grade),
    });

    return res.json({ note });
  } catch (error) {
    console.error('Erreur postPeriodNote:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

/* ─── helpers réutilisés depuis invoiceUtils ──────────────────────────────── */
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

const PERIOD_LABEL = {
  TRIMESTRE_1: 'Trimestre 1', TRIMESTRE_2: 'Trimestre 2', TRIMESTRE_3: 'Trimestre 3',
  SEMESTRE_1:  'Semestre 1',  SEMESTRE_2:  'Semestre 2',
};
function gradeColor(g) {
  if (g == null) return '#6B7280';
  const pct = (g / 10) * 100;
  return pct >= 80 ? '#16A34A' : pct >= 70 ? '#0891B2' : pct >= 60 ? '#D97706' : '#DC2626';
}
function mention(avg) {
  if (avg == null) return null;
  const pct = (avg / 10) * 100;
  if (pct >= 80) return 'Très Bien';
  if (pct >= 70) return 'Bien';
  if (pct >= 60) return 'Assez Bien';
  return 'Passable';
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

async function generateBulletinPDF(req, res) {
  try {
    const { classId, period, studentId, appreciation } = req.body;
    if (!classId || !period || !studentId) {
      return res.status(400).json({ error: 'classId, period et studentId sont requis' });
    }

    // Fetch notes — re-uses existing service (security check included)
    const data = await fetchPeriodNotes({ teacherUserId: req.user.id, classId, period });
    const studentRow = data.students.find((s) => s.studentId === studentId);
    if (!studentRow) {
      return res.status(404).json({ error: 'Élève introuvable dans cette classe' });
    }

    // Fetch class details for header info
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const cls = await prisma.class.findFirst({
      where: { id: classId },
      include: { level: { include: { pole: true } }, schoolYear: true, teacher: true },
    });

    const periodLabel = PERIOD_LABEL[period] || period;
    const classLabel = [cls?.level?.pole?.name, cls?.level?.name].filter(Boolean).join(' – ');
    const yearLabel = cls?.schoolYear?.label || '';
    const teacherName = cls?.teacher
      ? `${cls.teacher.firstName || ''} ${cls.teacher.lastName || ''}`.trim()
      : '';

    // Build grade rows (skip lessons where grade is 0 AND no real evaluation recorded)
    const rows = data.lessons.map((lesson, i) => ({
      discipline: lesson.label || `Évaluation ${i + 1}`,
      date: lesson.date,
      grade: studentRow.notes[i] ?? null,
    }));

    const validGrades = rows.filter((r) => r.grade != null && r.grade !== '');
    const avg = validGrades.length > 0
      ? validGrades.reduce((s, r) => s + Number(r.grade), 0) / validGrades.length
      : null;

    // Logos
    const amcLogoPath     = findLogo(['amc_logo.png']);
    const partnerLogoPath = findLogo(['amc_logo_partner.png']);

    // Stream PDF
    const filename = `bulletin-${studentRow.studentName.replace(/\s+/g, '-')}-${period}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    /* ── logos ── */
    const headerY = 36;
    const logoH = 48;
    const logoW = 120;
    try {
      if (amcLogoPath) doc.image(amcLogoPath, 50, headerY, { fit: [logoW, logoH], align: 'left' });
      if (partnerLogoPath) doc.image(partnerLogoPath, doc.page.width - 50 - logoW, headerY, { fit: [logoW, logoH], align: 'right' });
    } catch (e) {
      console.warn('Bulletin: erreur logo', e?.message);
    }

    /* ── titre ── */
    doc.y = headerY + logoH + 8;
    doc.fontSize(10).font('Helvetica-Bold').text('ASSOCIATION PARTAGE ET DES MUSULMANS DE CLAMART', { align: 'center' });
    doc.fontSize(9).font('Helvetica').text("Portail d'Inscription Scolaire", { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(16).font('Helvetica-Bold').text(`BULLETIN DE ${periodLabel.toUpperCase()}`, { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(11).font('Helvetica').text(classLabel, { align: 'center' });
    if (yearLabel) doc.fontSize(10).font('Helvetica').text(`Année scolaire ${yearLabel}`, { align: 'center' });
    doc.moveDown(0.6);

    /* ── bloc élève + professeur ── */
    const infoY = doc.y;
    const leftX = 40;
    const rightX = 320;
    const colW = 230;

    doc.fontSize(9).font('Helvetica-Bold').text('ÉLÈVE', leftX, infoY);
    doc.fontSize(11).font('Helvetica-Bold').text(studentRow.studentName, leftX, infoY + 13);
    doc.fontSize(9).font('Helvetica').text(classLabel, leftX, infoY + 27);

    if (teacherName) {
      doc.fontSize(9).font('Helvetica-Bold').text('PROFESSEUR', rightX, infoY, { width: colW });
      doc.fontSize(10).font('Helvetica').text(teacherName, rightX, infoY + 13, { width: colW });
    }

    doc.moveDown(2.5);

    /* ── séparateur ── */
    const sepY = doc.y;
    doc.moveTo(40, sepY).lineTo(doc.page.width - 40, sepY).lineWidth(1).stroke();
    doc.moveDown(0.5);

    /* ── tableau des notes ── */
    doc.fontSize(10).font('Helvetica-Bold').text('ÉVALUATIONS', 40, doc.y);
    doc.moveDown(0.3);

    const tX = 40;
    const tW = doc.page.width - 80;
    const colDisciplW = tW * 0.50;
    const colDateW    = tW * 0.20;
    const colNoteW    = tW * 0.15;
    const colMentionW = tW * 0.15;
    const rowH = 20;

    // Header
    let curY = doc.y;
    doc.rect(tX, curY, tW, rowH).fillAndStroke('#E0F2FE', '#94A3B8');
    doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold');
    doc.text('Évaluation', tX + 5, curY + 5, { width: colDisciplW - 10 });
    doc.text('Date', tX + colDisciplW + 5, curY + 5, { width: colDateW - 10 });
    doc.text('Note /10', tX + colDisciplW + colDateW + 5, curY + 5, { width: colNoteW - 10, align: 'right' });
    doc.text('Mention', tX + colDisciplW + colDateW + colNoteW + 5, curY + 5, { width: colMentionW - 10 });
    curY += rowH;

    // Rows
    doc.font('Helvetica').fontSize(9).fillColor('#1E293B');
    rows.forEach((row, idx) => {
      if (curY > doc.page.height - 160) { doc.addPage(); curY = 40; }
      const bg = idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
      doc.rect(tX, curY, tW, rowH).fillAndStroke(bg, '#E2E8F0');
      doc.fillColor('#1E293B');
      doc.text(row.discipline, tX + 5, curY + 5, { width: colDisciplW - 10 });
      doc.text(row.date ? fmtDate(row.date).slice(0, 10) : '—', tX + colDisciplW + 5, curY + 5, { width: colDateW - 10 });
      const g = row.grade != null ? Number(row.grade) : null;
      const noteStr = g != null ? `${g.toFixed(2)}` : '—';
      doc.fillColor(g != null ? gradeColor(g) : '#6B7280').font('Helvetica-Bold');
      doc.text(noteStr, tX + colDisciplW + colDateW + 5, curY + 5, { width: colNoteW - 10, align: 'right' });
      doc.fillColor('#374151').font('Helvetica');
      doc.text(g != null ? (mention(g) || '—') : '—', tX + colDisciplW + colDateW + colNoteW + 5, curY + 5, { width: colMentionW - 10 });
      curY += rowH;
    });

    if (rows.length === 0) {
      doc.rect(tX, curY, tW, rowH).fillAndStroke('#F9FAFB', '#E2E8F0');
      doc.fillColor('#6B7280').text('Aucune évaluation pour cette période', tX + 5, curY + 5, { width: tW - 10, align: 'center' });
      curY += rowH;
    }

    /* ── moyenne ── */
    curY += 10;
    if (curY > doc.page.height - 160) { doc.addPage(); curY = 40; }
    const avgBoxW = 220;
    const avgBoxX = doc.page.width - 40 - avgBoxW;
    doc.rect(avgBoxX, curY, avgBoxW, 32).fillAndStroke('#F0F9FF', '#BAE6FD');
    doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text('Moyenne générale :', avgBoxX + 10, curY + 8, { width: 120 });
    const avgStr = avg != null ? `${avg.toFixed(2)}/10` : '—';
    const avgColor = avg != null ? gradeColor(avg) : '#6B7280';
    doc.fillColor(avgColor).fontSize(14).font('Helvetica-Bold').text(avgStr, avgBoxX + 130, curY + 5, { width: 70, align: 'right' });
    if (avg != null && mention(avg)) {
      doc.fillColor(avgColor).fontSize(9).font('Helvetica').text(`(${mention(avg)})`, avgBoxX + 130, curY + 22, { width: 70, align: 'right' });
    }
    curY += 44;

    /* ── appréciation du professeur ── */
    if (appreciation && String(appreciation).trim()) {
      if (curY > doc.page.height - 160) { doc.addPage(); curY = 40; }
      curY += 4;
      doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text('Appréciation du professeur :', 40, curY);
      curY += 16;
      const appText = `« ${String(appreciation).trim()} »`;
      const appH = doc.heightOfString(appText, { width: tW - 20 }) + 16;
      doc.rect(40, curY, tW, appH).fillAndStroke('#F0FDF4', '#86EFAC');
      doc.fillColor('#166534').fontSize(10).font('Helvetica-Oblique').text(appText, 50, curY + 8, { width: tW - 20 });
      curY += appH + 10;
    }

    /* ── zone signature ── */
    if (curY > doc.page.height - 120) { doc.addPage(); curY = 40; }
    curY += 16;
    doc.fillColor('#1E293B').fontSize(9).font('Helvetica').text(
      `Fait le ${fmtDate(new Date())}`,
      40, curY,
    );
    doc.text('Cachet et signature du professeur', doc.page.width - 240, curY, { width: 200, align: 'right' });
    curY += 36;
    doc.moveTo(doc.page.width - 240, curY).lineTo(doc.page.width - 40, curY).lineWidth(0.5).stroke();

    /* ── footer ── */
    const footerY = doc.page.height - 80;
    doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold').text(
      'Association PARTAGE • Portail AMC',
      40, footerY, { align: 'center', width: 515 },
    );
    doc.fontSize(8).font('Helvetica').text(
      'Ce bulletin a été généré automatiquement par le portail pédagogique AMC.',
      40, footerY + 16, { align: 'center', width: 515 },
    );
    doc.text(
      `Généré le ${new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      40, footerY + 30, { align: 'center', width: 515 },
    );

    doc.end();
  } catch (error) {
    console.error('Erreur generateBulletinPDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Erreur serveur' });
    }
  }
}

module.exports = {
  getEvaluations,
  postEvaluation,
  getEvaluationStats,
  getLessons,
  getPeriodNotes,
  postPeriodNote,
  generateBulletinPDF,
};
