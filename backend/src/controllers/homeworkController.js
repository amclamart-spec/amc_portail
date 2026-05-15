const {
  saveHomeworkMessage,
  fetchHomeworkMessage,
  fetchHomeworkMessagesByClass,
  fetchHomeworkMessagesForFamily,
  deleteHomeworkMessage: deleteHomeworkMessageService,
} = require('../services/homeworkService');

async function postHomeworkMessage(req, res) {
  try {
    const { classId, date, message, attachmentFilename, attachmentBase64 } = req.body;
    if (!classId || !date || !message) {
      return res.status(400).json({ error: 'classId, date et message sont requis' });
    }

    const homework = await saveHomeworkMessage({
      teacherUserId: req.user.id,
      classId,
      date,
      message,
      attachmentFilename,
      attachmentBase64,
    });

    return res.json({ homework });
  } catch (error) {
    console.error('Erreur postHomeworkMessage:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getHomeworkMessage(req, res) {
  try {
    const { classId, date } = req.query;
    if (!classId || !date) {
      return res.status(400).json({ error: 'classId et date sont requis' });
    }

    const homework = await fetchHomeworkMessage({
      teacherUserId: req.user.id,
      classId,
      date,
    });

    return res.json({ homework });
  } catch (error) {
    console.error('Erreur getHomeworkMessage:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getHomeworkHistory(req, res) {
  try {
    const { classId } = req.query;
    if (!classId) {
      return res.status(400).json({ error: 'classId est requis' });
    }

    const homeworks = await fetchHomeworkMessagesByClass({
      teacherUserId: req.user.id,
      classId,
    });

    return res.json({ homeworks });
  } catch (error) {
    console.error('Erreur getHomeworkHistory:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function getFamilyHomeworkMessages(req, res) {
  try {
    const messages = await fetchHomeworkMessagesForFamily({ familyUserId: req.user.id });
    return res.json({ messages });
  } catch (error) {
    console.error('Erreur getFamilyHomeworkMessages:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

async function deleteHomeworkMessage(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'homeworkId est requis' });
    }

    await deleteHomeworkMessageService({ teacherUserId: req.user.id, homeworkId: id });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur deleteHomeworkMessage:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}

module.exports = {
  postHomeworkMessage,
  getHomeworkMessage,
  getHomeworkHistory,
  deleteHomeworkMessage,
  getFamilyHomeworkMessages,
};