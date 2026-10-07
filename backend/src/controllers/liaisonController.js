const {
  listStaffThreads,
  createStaffThreads,
  replyAsStaff,
  markThreadReadAsStaff,
  listFamilyThreads,
  createFamilyThread,
  replyAsFamily,
  markThreadReadAsFamily,
} = require('../services/liaisonService');

function sendError(res, error, label) {
  console.error(`Erreur ${label}:`, error);
  return res.status(error.statusCode || 500).json({ error: error.message || 'Erreur serveur' });
}

// Un responsable de pôle / admin agit sous l'identité du professeur de la classe
// (middleware actAsClassTeacher) : l'expéditeur affiché et les accusés de lecture
// restent ceux de la personne réellement connectée.
function staffActor(req) {
  const actual = req.originalUser || req.user;
  let label = 'Professeur';
  if (req.originalUser) label = actual.role === 'ADMIN' ? 'Administration' : 'Responsable de pôle';
  return {
    id: actual.id,
    name: `${actual.firstName || ''} ${actual.lastName || ''}`.trim() || 'Équipe pédagogique',
    label,
  };
}

/* ─── espace professeur / responsable de pôle / admin ───────────────────────── */

async function getStaffThreads(req, res) {
  try {
    const { classId } = req.query;
    if (!classId) return res.status(400).json({ error: 'classId est requis' });
    const threads = await listStaffThreads({ teacherUserId: req.user.id, viewerUserId: staffActor(req).id, classId });
    return res.json({ threads });
  } catch (error) {
    return sendError(res, error, 'getStaffThreads');
  }
}

async function postStaffThread(req, res) {
  try {
    const { classId, mode, studentIds, subject, body, attachment } = req.body;
    if (!classId) return res.status(400).json({ error: 'classId est requis' });
    const result = await createStaffThreads({
      teacherUserId: req.user.id, sender: staffActor(req), classId, mode, studentIds, subject, body, attachment,
    });
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'postStaffThread');
  }
}

async function postStaffReply(req, res) {
  try {
    const { classId, studentId, body, attachment } = req.body;
    if (!classId) return res.status(400).json({ error: 'classId est requis' });
    const result = await replyAsStaff({
      teacherUserId: req.user.id, sender: staffActor(req), classId, threadId: req.params.threadId, studentId, body, attachment,
    });
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'postStaffReply');
  }
}

async function postStaffRead(req, res) {
  try {
    const { classId } = req.body;
    if (!classId) return res.status(400).json({ error: 'classId est requis' });
    const result = await markThreadReadAsStaff({
      teacherUserId: req.user.id, viewerUserId: staffActor(req).id, classId, threadId: req.params.threadId,
    });
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'postStaffRead');
  }
}

/* ─── espace famille ────────────────────────────────────────────────────────── */

async function getFamilyThreads(req, res) {
  try {
    const { studentId } = req.query;
    if (!studentId) return res.status(400).json({ error: 'studentId est requis' });
    const result = await listFamilyThreads({ familyUserId: req.user.id, studentId });
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'getFamilyThreads');
  }
}

async function postFamilyThread(req, res) {
  try {
    const { studentId, classId, subject, body, attachment } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId est requis' });
    const result = await createFamilyThread({ familyUser: req.user, studentId, classId, subject, body, attachment });
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'postFamilyThread');
  }
}

async function postFamilyReply(req, res) {
  try {
    const { studentId, body, attachment } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId est requis' });
    const result = await replyAsFamily({ familyUser: req.user, studentId, threadId: req.params.threadId, body, attachment });
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'postFamilyReply');
  }
}

async function postFamilyRead(req, res) {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId est requis' });
    const result = await markThreadReadAsFamily({ familyUserId: req.user.id, studentId, threadId: req.params.threadId });
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'postFamilyRead');
  }
}

module.exports = {
  getStaffThreads,
  postStaffThread,
  postStaffReply,
  postStaffRead,
  getFamilyThreads,
  postFamilyThread,
  postFamilyReply,
  postFamilyRead,
};
