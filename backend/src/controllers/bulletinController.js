const {
  publishBulletin,
  listBulletinsForTeacher,
  listBulletinsForFamily,
  deleteBulletin,
} = require('../services/bulletinService');

function statusFromError(error) {
  return error.statusCode || (error.message?.includes('introuvable') ? 404 : 500);
}

async function postPublishBulletin(req, res) {
  try {
    const bulletin = await publishBulletin({ teacherUserId: req.user.id, ...req.body });
    return res.status(201).json({ bulletin });
  } catch (error) {
    console.error('Erreur postPublishBulletin:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getBulletins(req, res) {
  try {
    const { studentId } = req.params;
    const { classId } = req.query;

    if (req.user.role === 'FAMILLE') {
      const bulletins = await listBulletinsForFamily({ familyUserId: req.user.id, studentId });
      return res.json({ bulletins });
    }

    if (!classId) return res.status(400).json({ error: 'classId est requis' });
    const bulletins = await listBulletinsForTeacher({ teacherUserId: req.user.id, studentId, classId });
    return res.json({ bulletins });
  } catch (error) {
    console.error('Erreur getBulletins:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function deleteBulletinHandler(req, res) {
  try {
    const { id } = req.params;
    await deleteBulletin({ teacherUserId: req.user.id, id });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur deleteBulletin:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

module.exports = {
  postPublishBulletin,
  getBulletins,
  deleteBulletin: deleteBulletinHandler,
};
