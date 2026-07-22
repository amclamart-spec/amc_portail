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
} = require('../services/coranService');

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
};
