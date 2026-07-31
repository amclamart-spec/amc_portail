const {
  assertReadAccess,
  listAppreciations,
  createAppreciation,
  deleteAppreciation,
  markAppreciationSeen,
} = require('../services/appreciationService');

function statusFromError(error) {
  return error.statusCode || (error.message?.includes('introuvable') ? 404 : 500);
}

async function getAppreciations(req, res) {
  try {
    const { studentId } = req.params;
    await assertReadAccess({ user: req.user, studentId });
    const appreciations = await listAppreciations({ studentId });
    return res.json({ appreciations });
  } catch (error) {
    console.error('Erreur getAppreciations:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postAppreciation(req, res) {
  try {
    const appreciation = await createAppreciation({ teacherUserId: req.user.id, ...req.body });
    return res.status(201).json({ appreciation });
  } catch (error) {
    console.error('Erreur postAppreciation:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function deleteAppreciationHandler(req, res) {
  try {
    const { id } = req.params;
    await deleteAppreciation({ teacherUserId: req.user.id, id });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur deleteAppreciation:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function putAppreciationSeen(req, res) {
  try {
    const { id } = req.params;
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId est requis' });

    const appreciation = await markAppreciationSeen({ familyUserId: req.user.id, studentId, id });
    return res.json({ appreciation });
  } catch (error) {
    console.error('Erreur putAppreciationSeen:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

module.exports = {
  getAppreciations,
  postAppreciation,
  deleteAppreciation: deleteAppreciationHandler,
  putAppreciationSeen,
};
