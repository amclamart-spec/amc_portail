const { PrismaClient } = require('@prisma/client');
const {
  sendBulkMail,
  sendMailBcc,
  getPoleStructure,
  getRecipients,
  getRecipientsByCriteria,
  buildClassicRecipientLabel,
} = require('../services/mailService');

const prisma = new PrismaClient();

// Historise une campagne envoyée (rubrique "Mails envoyés") — best-effort : une erreur
// de journalisation ne doit jamais faire échouer un envoi déjà parti.
async function logMailSend({ subject, content, mode, recipientLabel, recipients, successCount, failedCount, attachmentFilename, sentById }) {
  try {
    const cleanRecipients = (recipients || []).filter((r) => r?.email);
    await prisma.mailLog.create({
      data: {
        subject,
        content,
        mode,
        recipientLabel: recipientLabel || null,
        recipients: cleanRecipients.map((r) => ({
          email: r.email,
          name: r.name || [r.firstName, r.lastName].filter(Boolean).join(' ') || null,
        })),
        recipientEmails: cleanRecipients.map((r) => r.email),
        recipientCount: cleanRecipients.length,
        successCount: successCount || 0,
        failedCount: failedCount || 0,
        attachmentFilename: attachmentFilename || null,
        sentById,
      },
    });
  } catch (error) {
    console.error('Erreur logMailSend:', error.message);
  }
}

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

    const recipientLabel = await buildClassicRecipientLabel(recipientType, poleId, levelId, classId, recipients.length);
    await logMailSend({
      subject,
      content,
      mode: 'CLASSIC',
      recipientLabel,
      recipients,
      successCount: result.successCount,
      failedCount: result.failedCount,
      attachmentFilename: attachmentFile?.originalname,
      sentById: adminId,
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
    const recipientInfo = await buildClassicRecipientLabel(recipientType, poleId, levelId, classId, recipients.length);

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

/**
 * POST /admin/mailing/recipients-by-criteria
 * Retourne la liste des destinataires selon population + objet + statut
 */
async function getMailingRecipientsByCriteria(req, res) {
  try {
    const { population, objet, statut, classIds } = req.body;
    if (!population) {
      return res.status(400).json({ error: 'population est requis' });
    }
    if (population === 'CLASSE') {
      if (!Array.isArray(classIds) || classIds.length === 0) {
        return res.status(400).json({ error: 'Au moins une classe est requise pour cette population' });
      }
      if (!statut) {
        return res.status(400).json({ error: 'Le statut d\'inscription est requis pour cette population' });
      }
    } else if (population !== 'PROFESSEURS' && (!objet || !statut)) {
      return res.status(400).json({ error: 'objet et statut sont requis pour cette population' });
    }
    const recipients = await getRecipientsByCriteria({ population, objet, statut, classIds });
    return res.json({ recipients });
  } catch (error) {
    console.error('Erreur getMailingRecipientsByCriteria:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST /admin/mailing/send-bcc
 * Envoie un email unique avec tous les destinataires en CCI (BCC)
 * Body: { bccEmails: string[], subject: string, content: string }
 * File: attachment (optionnel)
 */
async function sendMailingBcc(req, res) {
  try {
    let { bccEmails, subject, content, recipientLabel } = req.body;
    const attachmentFile = req.file;

    if (!subject || !content) {
      return res.status(400).json({ error: 'subject et content sont requis' });
    }

    // bccEmails peut arriver comme chaîne JSON ou tableau
    if (typeof bccEmails === 'string') {
      try { bccEmails = JSON.parse(bccEmails); } catch { bccEmails = bccEmails.split(/[;,\n]+/).map(e => e.trim()).filter(Boolean); }
    }
    if (!Array.isArray(bccEmails) || bccEmails.length === 0) {
      return res.status(400).json({ error: 'Au moins un destinataire BCC requis' });
    }

    // Dédupliquer (insensible à la casse/espaces) avant envoi ET avant calcul du
    // compteur/historique, pour qu'un même destinataire ne reçoive le mail qu'une
    // seule fois et que le suivi reflète exactement ce qui a été envoyé.
    const seenEmails = new Set();
    bccEmails = bccEmails.filter((email) => {
      const normalized = (email || '').trim().toLowerCase();
      if (!normalized || seenEmails.has(normalized)) return false;
      seenEmails.add(normalized);
      return true;
    });
    if (bccEmails.length === 0) {
      return res.status(400).json({ error: 'Au moins un destinataire BCC requis' });
    }

    let attachmentInfo = null;
    if (attachmentFile) {
      attachmentInfo = { filename: attachmentFile.originalname, path: attachmentFile.path, mimetype: attachmentFile.mimetype };
    }

    const result = await sendMailBcc({ bccEmails, subject, content, attachmentInfo });

    // Enrichit best-effort avec les noms connus, pour l'affichage dans l'historique
    const knownUsers = await prisma.user.findMany({
      where: { email: { in: bccEmails } },
      select: { email: true, firstName: true, lastName: true },
    });
    const nameByEmail = new Map(knownUsers.map((u) => [u.email, `${u.firstName || ''} ${u.lastName || ''}`.trim()]));
    const recipients = bccEmails.map((email) => ({ email, name: nameByEmail.get(email) || null }));

    await logMailSend({
      subject,
      content,
      mode: 'CRITERIA',
      recipientLabel,
      recipients,
      successCount: result.successCount,
      failedCount: result.failedCount,
      attachmentFilename: attachmentFile?.originalname,
      sentById: req.user.id,
    });

    if (attachmentFile) {
      const fs = require('fs');
      fs.unlink(attachmentFile.path, () => {});
    }

    return res.json({ success: true, recipientCount: bccEmails.length, successCount: result.successCount, failedCount: result.failedCount });
  } catch (error) {
    console.error('Erreur sendMailingBcc:', error.message);
    if (req.file) { const fs = require('fs'); fs.unlink(req.file.path, () => {}); }
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /admin/mailing/sent
 * Historique des mails envoyés — filtrable par date (3 derniers mois par défaut) et
 * recherche libre (objet du mail ou adresse d'un destinataire).
 */
async function getMailLogs(req, res) {
  try {
    const { from, to, search, page = 1, limit = 20 } = req.query;

    const defaultFrom = new Date();
    defaultFrom.setMonth(defaultFrom.getMonth() - 3);
    const fromDate = from ? new Date(from) : defaultFrom;
    const toDate = to ? new Date(to) : new Date();
    toDate.setHours(23, 59, 59, 999);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return res.status(400).json({ error: 'Dates invalides' });
    }

    const searchTerm = (search || '').trim();
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.max(parseInt(limit, 10) || 20, 1);

    // Recherche sur l'objet OU sur une adresse destinataire (unnest du tableau
    // recipient_emails) : au-delà de ce que l'ORM Prisma sait exprimer simplement,
    // d'où le passage par du SQL brut (paramétré) pour ce filtre.
    const [totalRows, logRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS count FROM "mail_logs"
        WHERE "created_at" BETWEEN ${fromDate} AND ${toDate}
          AND (
            ${searchTerm} = ''
            OR "subject" ILIKE '%' || ${searchTerm} || '%'
            OR EXISTS (SELECT 1 FROM unnest("recipient_emails") AS e WHERE e ILIKE '%' || ${searchTerm} || '%')
          )
      `,
      prisma.$queryRaw`
        SELECT "id", "subject", "mode", "recipient_label" AS "recipientLabel", "recipient_count" AS "recipientCount",
               "success_count" AS "successCount", "failed_count" AS "failedCount", "attachment_filename" AS "attachmentFilename",
               "sent_by_id" AS "sentById", "created_at" AS "createdAt"
        FROM "mail_logs"
        WHERE "created_at" BETWEEN ${fromDate} AND ${toDate}
          AND (
            ${searchTerm} = ''
            OR "subject" ILIKE '%' || ${searchTerm} || '%'
            OR EXISTS (SELECT 1 FROM unnest("recipient_emails") AS e WHERE e ILIKE '%' || ${searchTerm} || '%')
          )
        ORDER BY "created_at" DESC
        LIMIT ${safeLimit} OFFSET ${(safePage - 1) * safeLimit}
      `,
    ]);

    const total = totalRows[0]?.count || 0;
    const senderIds = [...new Set(logRows.map((row) => row.sentById))];
    const senders = senderIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const senderNameById = new Map(senders.map((u) => [u.id, `${u.firstName || ''} ${u.lastName || ''}`.trim()]));

    res.json({
      logs: logRows.map((row) => ({ ...row, sentByName: senderNameById.get(row.sentById) || '—' })),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1),
    });
  } catch (error) {
    console.error('Erreur getMailLogs:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /admin/mailing/sent/:id
 * Détail d'un mail envoyé : destinataires complets + contenu du message.
 */
async function getMailLogDetail(req, res) {
  try {
    const { id } = req.params;
    const log = await prisma.mailLog.findUnique({
      where: { id },
      include: { sentBy: { select: { firstName: true, lastName: true } } },
    });
    if (!log) return res.status(404).json({ error: 'Mail introuvable' });

    res.json({
      log: {
        id: log.id,
        subject: log.subject,
        content: log.content,
        mode: log.mode,
        recipientLabel: log.recipientLabel,
        recipients: log.recipients,
        recipientCount: log.recipientCount,
        successCount: log.successCount,
        failedCount: log.failedCount,
        attachmentFilename: log.attachmentFilename,
        sentByName: `${log.sentBy?.firstName || ''} ${log.sentBy?.lastName || ''}`.trim(),
        createdAt: log.createdAt,
      },
    });
  } catch (error) {
    console.error('Erreur getMailLogDetail:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getMailingStructure,
  sendMailing,
  getMailingPreview,
  getMailingRecipientsByCriteria,
  sendMailingBcc,
  getMailLogs,
  getMailLogDetail,
};
