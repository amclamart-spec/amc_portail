const {
  fetchFamilyStudents,
  fetchStudentAbsences,
  fetchStudentHomework,
  fetchStudentNotes,
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

module.exports = {
  getPedagogyStudents,
  getPedagogyAbsences,
  getPedagogyHomework,
  getPedagogyNotes,
};
