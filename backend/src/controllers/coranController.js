const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
  getSourates,
  assertReadAccess,
  listSeances,
  createSeance,
  updateSeance,
  listRevisions,
  createRevision,
  deleteRevision,
  evaluateRevision,
  listRepetitions,
  addRepetitionPages,
  deleteRepetition,
  evaluateRepetition,
  incrementRepetition,
  listLectures,
  createLecture,
  deleteLecture,
  evaluateLecture,
  uploadBulletin,
  getLatestBulletinUpload,
  deleteBulletinUpload,
  getBulletinData,
} = require('../services/coranService');

const MAX_MUSHAF_PAGE = 604;
// Même palette que le bulletin du pôle Arabe (`T` dans professeur/SuiviPedagogique.jsx).
const TEAL = { primary: '#0f766e', light2: '#ccfbf1', border: '#5eead4', dark: '#134e4a' };
// Police avec support des glyphes arabes (shaping/RTL géré nativement par fontkit).
const ARABIC_FONT_PATH = path.join(__dirname, '../../assets/fonts/NotoNaskhArabic-Regular.ttf');

function formatMinutesForPdf(totalMinutes) {
  if (!totalMinutes) return '0 min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes ? `${minutes} min` : ''}`.trim();
}

// Même recherche de logo que generateBulletinPDF (evaluationController.js).
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

function statusFromError(error) {
  return error.statusCode || (error.message?.includes('introuvable') ? 404 : 500);
}

async function getSouratesList(req, res) {
  try {
    const sourates = await getSourates();
    return res.json({ sourates });
  } catch (error) {
    console.error('Erreur getSouratesList:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getSeances(req, res) {
  try {
    const { studentId } = req.params;
    await assertReadAccess({ user: req.user, studentId });
    const seances = await listSeances({ studentId });
    return res.json({ seances });
  } catch (error) {
    console.error('Erreur getSeances:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postSeance(req, res) {
  try {
    const seance = await createSeance({ teacherUserId: req.user.id, ...req.body });
    return res.status(201).json({ seance });
  } catch (error) {
    console.error('Erreur postSeance:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function putSeance(req, res) {
  try {
    const { id } = req.params;
    const seance = await updateSeance({ teacherUserId: req.user.id, seanceId: id, ...req.body });
    return res.json({ seance });
  } catch (error) {
    console.error('Erreur putSeance:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getRevisions(req, res) {
  try {
    const { studentId } = req.params;
    await assertReadAccess({ user: req.user, studentId });
    const revisions = await listRevisions({ studentId });
    return res.json({ revisions });
  } catch (error) {
    console.error('Erreur getRevisions:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postRevision(req, res) {
  try {
    const revision = await createRevision({ familyUserId: req.user.id, ...req.body });
    return res.status(201).json({ revision });
  } catch (error) {
    console.error('Erreur postRevision:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function deleteRevisionHandler(req, res) {
  try {
    const { id } = req.params;
    await deleteRevision({ familyUserId: req.user.id, revisionId: id });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur deleteRevision:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function putEvaluateRevision(req, res) {
  try {
    const { id } = req.params;
    const { appreciation, commentaireProf } = req.body;
    const revision = await evaluateRevision({ teacherUserId: req.user.id, revisionId: id, appreciation, commentaireProf });
    return res.json({ revision });
  } catch (error) {
    console.error('Erreur putEvaluateRevision:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getRepetitions(req, res) {
  try {
    const { studentId } = req.params;
    await assertReadAccess({ user: req.user, studentId });
    const repetitions = await listRepetitions({ studentId });
    return res.json({ repetitions });
  } catch (error) {
    console.error('Erreur getRepetitions:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postIncrementRepetition(req, res) {
  try {
    const repetition = await incrementRepetition({ familyUserId: req.user.id, ...req.body });
    return res.json({ repetition });
  } catch (error) {
    console.error('Erreur postIncrementRepetition:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postRepetitions(req, res) {
  try {
    const result = await addRepetitionPages({ familyUserId: req.user.id, ...req.body });
    return res.status(201).json(result);
  } catch (error) {
    console.error('Erreur postRepetitions:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function deleteRepetitionHandler(req, res) {
  try {
    const { id } = req.params;
    await deleteRepetition({ familyUserId: req.user.id, repetitionId: id });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur deleteRepetition:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function putEvaluateRepetition(req, res) {
  try {
    const { id } = req.params;
    const { appreciation, commentaireProf } = req.body;
    const repetition = await evaluateRepetition({ teacherUserId: req.user.id, repetitionId: id, appreciation, commentaireProf });
    return res.json({ repetition });
  } catch (error) {
    console.error('Erreur putEvaluateRepetition:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getLectures(req, res) {
  try {
    const { studentId } = req.params;
    await assertReadAccess({ user: req.user, studentId });
    const lectures = await listLectures({ studentId });
    return res.json({ lectures });
  } catch (error) {
    console.error('Erreur getLectures:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postLecture(req, res) {
  try {
    const lecture = await createLecture({ familyUserId: req.user.id, ...req.body });
    return res.status(201).json({ lecture });
  } catch (error) {
    console.error('Erreur postLecture:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function deleteLectureHandler(req, res) {
  try {
    const { id } = req.params;
    await deleteLecture({ familyUserId: req.user.id, lectureId: id });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur deleteLecture:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function putEvaluateLecture(req, res) {
  try {
    const { id } = req.params;
    const { appreciation, commentaireProf } = req.body;
    const lecture = await evaluateLecture({ teacherUserId: req.user.id, lectureId: id, appreciation, commentaireProf });
    return res.json({ lecture });
  } catch (error) {
    console.error('Erreur putEvaluateLecture:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postBulletinUpload(req, res) {
  try {
    const upload = await uploadBulletin({ teacherUserId: req.user.id, ...req.body });
    return res.status(201).json({ upload });
  } catch (error) {
    console.error('Erreur postBulletinUpload:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getBulletinUpload(req, res) {
  try {
    const { studentId } = req.params;
    await assertReadAccess({ user: req.user, studentId });
    const upload = await getLatestBulletinUpload({ studentId });
    return res.json({ upload });
  } catch (error) {
    console.error('Erreur getBulletinUpload:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function deleteBulletinUploadHandler(req, res) {
  try {
    const { id } = req.params;
    await deleteBulletinUpload({ teacherUserId: req.user.id, uploadId: id });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur deleteBulletinUpload:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postCoranBulletinPdf(req, res) {
  try {
    const { studentId, studentName, classLabel, appreciation } = req.body || {};
    if (!studentId) return res.status(400).json({ error: 'studentId est requis' });

    await assertReadAccess({ user: req.user, studentId });
    const kpis = await getBulletinData({ studentId });

    const filename = `bulletin-coran-${(studentName || studentId).replace(/\s+/g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    const textColor = '#222222';
    const muted = '#6B7280';

    let arabicFontOk = false;
    try {
      if (fs.existsSync(ARABIC_FONT_PATH)) {
        doc.registerFont('ArabicNaskh', ARABIC_FONT_PATH);
        arabicFontOk = true;
      }
    } catch (e) {
      console.warn('Bulletin Coran: police arabe indisponible', e?.message);
    }

    /* ── logos (identiques au bulletin du pôle Arabe) ── */
    const amcLogoPath = findLogo(['amc_logo.png']);
    const partnerLogoPath = findLogo(['amc_logo_partner.png']);
    const headerY = 36;
    const logoH = 48;
    const logoW = 120;
    try {
      if (amcLogoPath) doc.image(amcLogoPath, 50, headerY, { fit: [logoW, logoH], align: 'left' });
      if (partnerLogoPath) doc.image(partnerLogoPath, doc.page.width - 50 - logoW, headerY, { fit: [logoW, logoH], align: 'right' });
    } catch (e) {
      console.warn('Bulletin Coran: erreur logo', e?.message);
    }
    doc.y = headerY + logoH + 8;

    doc.fontSize(10).font('Helvetica-Bold').fillColor(muted).text('ASSOCIATION PARTAGE ET DES MUSULMANS DE CLAMART', { align: 'center' });
    doc.fontSize(9).font('Helvetica').text('Portail interne', { align: 'center' });
    doc.moveDown(0.6);
    doc.fontSize(17).font('Helvetica-Bold').fillColor(TEAL.primary).text('BULLETIN DE SUIVI CORAN', { align: 'center' });
    doc.moveDown(0.3);
    if (classLabel) doc.fontSize(11).font('Helvetica').fillColor(textColor).text(classLabel, { align: 'center' });
    doc.moveDown(1.2);

    doc.fontSize(9).font('Helvetica-Bold').fillColor(muted).text('ÉLÈVE');
    doc.fontSize(13).font('Helvetica-Bold').fillColor(textColor).text(studentName || '—');
    doc.moveDown(1.4);

    const blocks = [
      {
        titleFr: 'Apprentissage', titleAr: 'الحفظ',
        figures: [
          ['Pages apprises', `${kpis.pagesApprises} / ${MAX_MUSHAF_PAGE} (${kpis.pctApprises}%)`],
          ['Pages maîtrisées (30 rép. ou plus)', `${kpis.mastered}`],
          ['Moyenne / semaine', `${kpis.avgApprentissagePerWeek.toFixed(1)} page(s)`],
        ],
      },
      {
        titleFr: 'Révision', titleAr: 'المراجعة',
        figures: [
          ['Pages révisées au total', `${kpis.totalRevisionPages}`],
          ['Moyenne par semaine', `${kpis.avgRevisionPerWeek.toFixed(1)} page(s)`],
          ['Nombre de révisions', `${kpis.totalRevisions}`],
        ],
      },
      {
        titleFr: 'Lecture', titleAr: 'التلاوة',
        figures: [
          ['Pages récitées', `${kpis.pagesRecitees} / ${MAX_MUSHAF_PAGE} (${kpis.pctRecitees}%)`],
          ['Séances de lecture', `${kpis.totalLectureSeances}`],
          ['Temps total', formatMinutesForPdf(kpis.totalLectureMinutes)],
        ],
      },
    ];

    const pageLeft = doc.page.margins.left;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const gap = 16;
    const blockWidth = (pageWidth - gap * 2) / 3;
    const blockTop = doc.y;
    const blockHeaderH = arabicFontOk ? 40 : 26;
    const blockPadding = 12;
    const lineHeight = 19;
    const blockHeight = blockHeaderH + blockPadding * 2 + blocks[0].figures.length * lineHeight;

    blocks.forEach((block, index) => {
      const x = pageLeft + index * (blockWidth + gap);
      doc.rect(x, blockTop, blockWidth, blockHeaderH).fill(TEAL.light2);
      doc.fillColor(TEAL.dark).fontSize(10).font('Helvetica-Bold')
        .text(block.titleFr, x + 8, blockTop + 6, { width: blockWidth - 16 });
      if (arabicFontOk) {
        doc.fillColor(TEAL.dark).fontSize(10).font('ArabicNaskh')
          .text(block.titleAr, x + 8, blockTop + 21, { width: blockWidth - 16, align: 'right', features: ['rtla'] });
      }

      doc.rect(x, blockTop + blockHeaderH, blockWidth, blockHeight - blockHeaderH).stroke(TEAL.border);
      let y = blockTop + blockHeaderH + blockPadding;
      block.figures.forEach(([label, value]) => {
        doc.fillColor(muted).fontSize(8).font('Helvetica').text(label, x + 8, y, { width: blockWidth - 16 });
        doc.fillColor(textColor).fontSize(9).font('Helvetica-Bold').text(value, x + 8, y + 9, { width: blockWidth - 16 });
        y += lineHeight;
      });
    });

    doc.y = blockTop + blockHeight + 30;

    doc.fontSize(10).font('Helvetica-Bold').fillColor(textColor).text("Appréciation de l'enseignant");
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Oblique').fillColor(textColor)
      .text(appreciation && appreciation.trim() ? `« ${appreciation.trim()} »` : 'Aucune appréciation renseignée.');

    doc.moveDown(3.5);
    const signX = doc.page.width - doc.page.margins.right - 180;
    doc.fontSize(9).font('Helvetica').fillColor(muted).text('Cachet et signature de l\'enseignant', signX, doc.y, { width: 180, align: 'center' });
    doc.moveDown(2.8);
    doc.moveTo(signX, doc.y).lineTo(signX + 180, doc.y).strokeColor('#D1D5DB').stroke();

    doc.end();
  } catch (error) {
    console.error('Erreur postCoranBulletinPdf:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur lors de la génération du PDF' });
  }
}

module.exports = {
  getSouratesList,
  getSeances,
  postSeance,
  putSeance,
  getRevisions,
  postRevision,
  deleteRevision: deleteRevisionHandler,
  putEvaluateRevision,
  getRepetitions,
  postRepetitions,
  deleteRepetition: deleteRepetitionHandler,
  putEvaluateRepetition,
  postIncrementRepetition,
  getLectures,
  postLecture,
  deleteLecture: deleteLectureHandler,
  putEvaluateLecture,
  postBulletinUpload,
  getBulletinUpload,
  deleteBulletinUpload: deleteBulletinUploadHandler,
  postCoranBulletinPdf,
};
