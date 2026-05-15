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

module.exports = {
  getEvaluations,
  postEvaluation,
  getEvaluationStats,
  getLessons,
  getPeriodNotes,
  postPeriodNote,
};
