const {
  assertReadAccess,
  listNotes,
  createNote,
  deleteNote,
  uploadBulletin,
  listBulletinUploads,
  deleteBulletinUpload,
} = require('../services/noteScolaireService');

function statusFromError(error) {
  return error.statusCode || (error.message?.includes('introuvable') ? 404 : 500);
}

async function getNotes(req, res) {
  try {
    const { studentId } = req.params;
    await assertReadAccess({ user: req.user, studentId });
    const notes = await listNotes({ studentId });
    return res.json({ notes });
  } catch (error) {
    console.error('Erreur getNotes:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postNote(req, res) {
  try {
    const note = await createNote({ familyUserId: req.user.id, ...req.body });
    return res.status(201).json({ note });
  } catch (error) {
    console.error('Erreur postNote:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function deleteNoteHandler(req, res) {
  try {
    const { id } = req.params;
    await deleteNote({ familyUserId: req.user.id, noteId: id });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur deleteNote:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postBulletinUpload(req, res) {
  try {
    const upload = await uploadBulletin({ familyUserId: req.user.id, ...req.body });
    return res.status(201).json({ upload });
  } catch (error) {
    console.error('Erreur postBulletinUpload:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getBulletinUploads(req, res) {
  try {
    const { studentId } = req.params;
    await assertReadAccess({ user: req.user, studentId });
    const uploads = await listBulletinUploads({ studentId });
    return res.json({ uploads });
  } catch (error) {
    console.error('Erreur getBulletinUploads:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

async function deleteBulletinUploadHandler(req, res) {
  try {
    const { id } = req.params;
    await deleteBulletinUpload({ familyUserId: req.user.id, uploadId: id });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur deleteBulletinUpload:', error);
    return res.status(statusFromError(error)).json({ error: error.message || 'Erreur serveur' });
  }
}

module.exports = {
  getNotes,
  postNote,
  deleteNote: deleteNoteHandler,
  postBulletinUpload,
  getBulletinUploads,
  deleteBulletinUpload: deleteBulletinUploadHandler,
};
