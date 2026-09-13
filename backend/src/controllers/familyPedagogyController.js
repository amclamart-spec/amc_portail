const {
  fetchFamilyStudents,
  fetchStudentAbsences,
  fetchStudentHomework,
  fetchStudentNotes,
  submitFamilyJustification,
  deleteJustificationDocument,
  setHomeworkCompletion,
} = require('../services/familyPedagogyService');

async function getPedagogyStudents(req, res) {
  try {
    const students = await fetchFamilyStudents({ familyUserId: req.user.id });
    return res.json({ students });
  } catch (error) {
    console.error('Erreur getPedagogyStudents:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getPedagogyAbsences(req, res) {
  try {
    const { studentId } = req.query;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId est requis' });
    }

    const absences = await fetchStudentAbsences({ familyUserId: req.user.id, studentId });
    return res.json({ absences });
  } catch (error) {
    console.error('Erreur getPedagogyAbsences:', error);
    const status = error.message.includes('introuvable') ? 404 : 500;
    return res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getPedagogyHomework(req, res) {
  try {
    const { studentId } = req.query;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId est requis' });
    }

    const homeworks = await fetchStudentHomework({ familyUserId: req.user.id, studentId });
    return res.json({ homeworks });
  } catch (error) {
    console.error('Erreur getPedagogyHomework:', error);
    const status = error.message.includes('introuvable') ? 404 : 500;
    return res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getPedagogyNotes(req, res) {
  try {
    const { studentId } = req.query;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId est requis' });
    }

    const notes = await fetchStudentNotes({ familyUserId: req.user.id, studentId });
    return res.json({ notes });
  } catch (error) {
    console.error('Erreur getPedagogyNotes:', error);
    const status = error.message.includes('introuvable') ? 404 : 500;
    return res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

async function putHomeworkCompletion(req, res) {
  try {
    const { homeworkId } = req.params;
    const { studentId, done } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId est requis' });
    }

    const result = await setHomeworkCompletion({ familyUserId: req.user.id, studentId, homeworkId, done: Boolean(done) });
    return res.json(result);
  } catch (error) {
    console.error('Erreur putHomeworkCompletion:', error);
    const status = error.statusCode || (error.message.includes('introuvable') ? 404 : 500);
    return res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

async function postPedagogyJustification(req, res) {
  try {
    const { evaluationId } = req.params;
    const { comment, documents } = req.body;
    await submitFamilyJustification({ familyUserId: req.user.id, evaluationId, comment, documents });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur postPedagogyJustification:', error);
    const status = error.statusCode || (error.message.includes('introuvable') ? 404 : 500);
    return res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

async function deletePedagogyJustificationDocument(req, res) {
  try {
    const { evaluationId, documentId } = req.params;
    await deleteJustificationDocument({ familyUserId: req.user.id, evaluationId, documentId });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur deletePedagogyJustificationDocument:', error);
    const status = error.statusCode || (error.message.includes('introuvable') ? 404 : 500);
    return res.status(status).json({ error: error.message || 'Erreur serveur' });
  }
}

module.exports = {
  getPedagogyStudents,
  getPedagogyAbsences,
  getPedagogyHomework,
  getPedagogyNotes,
  postPedagogyJustification,
  deletePedagogyJustificationDocument,
  putHomeworkCompletion,
};
