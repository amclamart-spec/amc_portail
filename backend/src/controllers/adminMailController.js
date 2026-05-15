const { PrismaClient } = require('@prisma/client');
const {
  sendBulkMail,
  getPoleStructure,
  getRecipients,
} = require('../services/mailService');

const prisma = new PrismaClient();

/**
 * GET /admin/mailing/structure
 * Récupère la structure pôles/niveaux/classes pour l'interface
 */
async function getMailingStructure(req, res) {
  try {
    // Récupérer l'année scolaire courante
    const currentSchoolYear = await prisma.schoolYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });

    const structure = await getPoleStructure(currentSchoolYear?.id);

    res.json({
      success: true,
      structure,
    });
  } catch (error) {
    console.error('Erreur getMailingStructure:', error.message);
    res.status(500).json({ error: 'Impossible de charger la structure' });
  }
}

/**
 * POST /admin/mailing/send
 * Envoie un mail en masse
 * Body: { recipientType, poleId, levelId, classId, subject, content }
 * File: attachment (optionnel)
 */
async function sendMailing(req, res) {
  try {
    const { recipientType, poleId, levelId, classId, subject, content } =
      req.body;
    const adminId = req.user.id;
    const attachmentFile = req.file; // Depuis multer

    // Validation
    if (!recipientType || !subject || !content) {
      return res.status(400).json({
        error: 'recipientType, subject et content sont requis',
      });
    }

    if (
      ['CLASS_FAMILIES', 'LEVEL_FAMILIES', 'POLE_FAMILIES'].includes(
        recipientType
      ) &&
      !classId &&
      !levelId &&
      !poleId
    ) {
      return res.status(400).json({
        error: 'Un ID (classe, niveau ou pôle) est requis pour ce type',
      });
    }

    // Récupérer les destinataires pour la preview
    const recipients = await getRecipients(
      recipientType,
      poleId,
      levelId,
      classId
    );

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'Aucun destinataire trouvé' });
    }

    // Préparer les données de la pièce jointe
    let attachmentInfo = null;
    if (attachmentFile) {
      attachmentInfo = {
        filename: attachmentFile.originalname,
        path: attachmentFile.path,
        mimetype: attachmentFile.mimetype,
      };
    }

    // Envoyer les mails
    const result = await sendBulkMail({
      recipientType,
      poleId,
      levelId,
      classId,
      subject,
      content,
      attachmentInfo,
      adminId,
    });

    // Supprimer le fichier temporaire après envoi
    if (attachmentFile) {
      const fs = require('fs');
      fs.unlink(attachmentFile.path, (err) => {
        if (err) console.warn('Erreur suppression fichier:', err.message);
      });
    }

    res.json({
      success: true,
      result: {
        totalRecipients: recipients.length,
        successCount: result.successCount,
        failedCount: result.failedCount,
        errors: result.errors,
      },
    });
  } catch (error) {
    console.error('Erreur sendMailing:', error.message);

    // Supprimer le fichier en cas d'erreur
    if (req.file) {
      const fs = require('fs');
      fs.unlink(req.file.path, (err) => {
        if (err) console.warn('Erreur suppression fichier:', err.message);
      });
    }

    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /admin/mailing/preview
 * Prévisualise les destinataires et récupère un aperçu du mail
 */
async function getMailingPreview(req, res) {
  try {
    const { recipientType, poleId, levelId, classId, subject } = req.body;

    if (!recipientType) {
      return res.status(400).json({ error: 'recipientType requis' });
    }

    // Récupérer les destinataires
    const recipients = await getRecipients(
      recipientType,
      poleId,
      levelId,
      classId
    );

    // Informations sur les destinataires
    let recipientInfo = '';
    if (recipientType === 'ALL_FAMILIES') {
      recipientInfo = `Toutes les familles inscrites (${recipients.length})`;
    } else if (recipientType === 'TEACHERS') {
      recipientInfo = `Tous les professeurs (${recipients.length})`;
    } else if (recipientType === 'CLASS_FAMILIES') {
      const cls = await prisma.class.findUnique({
        where: { id: classId },
        include: { level: { include: { pole: true } } },
      });
      recipientInfo = `Classe: ${cls?.level?.pole?.name} - ${cls?.level?.name} (${recipients.length} familles)`;
    } else if (recipientType === 'LEVEL_FAMILIES') {
      const level = await prisma.level.findUnique({
        where: { id: levelId },
        include: { pole: true },
      });
      recipientInfo = `Niveau: ${level?.pole?.name} - ${level?.name} (${recipients.length} familles)`;
    } else if (recipientType === 'POLE_FAMILIES') {
      const pole = await prisma.pole.findUnique({
        where: { id: poleId },
      });
      recipientInfo = `Pôle: ${pole?.name} (${recipients.length} familles)`;
    }

    res.json({
      success: true,
      preview: {
        recipientInfo,
        recipientCount: recipients.length,
        recipients: recipients.slice(0, 10).map((r) => ({
          email: r.email,
          name: r.name,
        })),
        hasMore: recipients.length > 10,
        totalRecipients: recipients.length,
      },
    });
  } catch (error) {
    console.error('Erreur getMailingPreview:', error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getMailingStructure,
  sendMailing,
  getMailingPreview,
};
