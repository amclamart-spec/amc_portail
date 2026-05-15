const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { sendMail } = require('./emailService');

const prisma = new PrismaClient();

// Charger le logo en base64 une seule fois
let logoBase64 = null;

function getLogoBase64() {
  if (logoBase64) {
    return logoBase64;
  }

  try {
    // Essayer plusieurs chemins possibles
    const possiblePaths = [
      path.join(__dirname, '../../uploads/logo.png'),
      path.join(__dirname, '../../../frontend/public/amc_logo.png'),
      path.join(process.cwd(), 'frontend/public/amc_logo.png'),
      path.join(process.cwd(), 'uploads/logo.png'),
    ];

    for (const logoPath of possiblePaths) {
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
        console.log(`[MAIL] Logo chargé depuis: ${logoPath}`);
        return logoBase64;
      }
    }

    console.warn('[MAIL] Logo non trouvé, utilisation d\'une version par défaut');
    // Retourner une image placeholder
    logoBase64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzIxM0I4OCIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iMjAiIGZvbnQtd2VpZ2h0PSJib2xkIiBkeT0iLjNlbSI+QU1DPC90ZXh0Pjwvc3ZnPg==';
    return logoBase64;
  } catch (error) {
    console.warn('[MAIL] Erreur chargement logo:', error.message);
    logoBase64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzIxM0I4OCIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iMjAiIGZvbnQtd2VpZ2h0PSJib2xkIiBkeT0iLjNlbSI+QU1DPC90ZXh0Pjwvc3ZnPg==';
    return logoBase64;
  }
}

/**
 * Récupère les emails des destinataires selon le type et les paramètres
 */
async function getRecipients(recipientType, poleId, levelId, classId) {
  try {
    if (recipientType === 'ALL_FAMILIES') {
      // Toutes les familles avec des élèves inscrits
      const families = await prisma.family.findMany({
        where: {
          students: {
            some: {
              enrollments: {
                some: {},
              },
            },
          },
        },
        include: {
          user: { select: { email: true } },
        },
      });
      return families
        .filter((f) => f.user?.email)
        .map((f) => ({ email: f.user.email, name: f.familyName }));
    }

    if (recipientType === 'TEACHERS') {
      // Tous les professeurs
      const teachers = await prisma.teacher.findMany({
        where: { status: 'ACTIVE' },
        select: { email: true, firstName: true, lastName: true },
      });
      return teachers.map((t) => ({
        email: t.email,
        name: `${t.firstName} ${t.lastName}`,
      }));
    }

    if (recipientType === 'CLASS_FAMILIES') {
      // Familles des élèves d'une classe spécifique
      if (!classId) throw new Error('classId requis pour CLASS_FAMILIES');

      const enrollments = await prisma.enrollment.findMany({
        where: { classId },
        include: {
          student: {
            include: {
              family: {
                include: { user: { select: { email: true } } },
              },
            },
          },
        },
      });

      const uniqueFamilies = new Map();
      enrollments.forEach((e) => {
        const email = e.student.family.user?.email;
        if (email && !uniqueFamilies.has(email)) {
          uniqueFamilies.set(email, {
            email,
            name: e.student.family.familyName,
          });
        }
      });
      return Array.from(uniqueFamilies.values());
    }

    if (recipientType === 'LEVEL_FAMILIES') {
      // Familles de tous les élèves d'un niveau
      if (!levelId) throw new Error('levelId requis pour LEVEL_FAMILIES');

      const enrollments = await prisma.enrollment.findMany({
        where: {
          class: {
            levelId,
          },
        },
        include: {
          student: {
            include: {
              family: {
                include: { user: { select: { email: true } } },
              },
            },
          },
        },
      });

      const uniqueFamilies = new Map();
      enrollments.forEach((e) => {
        const email = e.student.family.user?.email;
        if (email && !uniqueFamilies.has(email)) {
          uniqueFamilies.set(email, {
            email,
            name: e.student.family.familyName,
          });
        }
      });
      return Array.from(uniqueFamilies.values());
    }

    if (recipientType === 'POLE_FAMILIES') {
      // Familles de tous les élèves d'un pôle
      if (!poleId) throw new Error('poleId requis pour POLE_FAMILIES');

      const enrollments = await prisma.enrollment.findMany({
        where: {
          class: {
            poleId,
          },
        },
        include: {
          student: {
            include: {
              family: {
                include: { user: { select: { email: true } } },
              },
            },
          },
        },
      });

      const uniqueFamilies = new Map();
      enrollments.forEach((e) => {
        const email = e.student.family.user?.email;
        if (email && !uniqueFamilies.has(email)) {
          uniqueFamilies.set(email, {
            email,
            name: e.student.family.familyName,
          });
        }
      });
      return Array.from(uniqueFamilies.values());
    }

    throw new Error(`Type de destinataire non reconnu: ${recipientType}`);
  } catch (error) {
    console.error('Erreur getRecipients:', error.message);
    throw error;
  }
}

/**
 * Rend le template HTML du mail avec le logo et le design AMC
 */
function renderMailHtml({ subject, content, attachmentInfo }) {
  const logoUrl = getLogoBase64();
  const attachmentHtml = attachmentInfo
    ? `<p style="margin-top:24px;font-size:14px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px;">📎 <strong>Pièce jointe:</strong> ${attachmentInfo.filename}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:'PT Sans', Arial, sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" style="background:#f3f4f6;padding:30px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.1);">
            <!-- Header avec logo -->
            <tr>
              <td style="background:#213B88;padding:32px 24px;text-align:center;">
                <img src="${logoUrl}" alt="AMC" width="100" height="auto" style="display:block;margin:0 auto;max-width:100%;height:auto;" />
              </td>
            </tr>
            <!-- Contenu -->
            <tr>
              <td style="padding:32px 28px;color:#1f2937;font-size:15px;line-height:1.6;">
                ${content}
                ${attachmentHtml}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#f8fafc;padding:20px 28px;color:#64748b;font-size:13px;text-align:center;border-top:1px solid #e2e8f0;">
                <p style="margin:0;">Association des Musulmans de Clamart (AMC)</p>
                <p style="margin:6px 0 0;opacity:0.7;">École de Langue Arabe et Sciences Islamiques</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Envoie un email en masse aux destinataires
 */
async function sendBulkMail({
  recipientType,
  poleId,
  levelId,
  classId,
  subject,
  content,
  attachmentInfo,
  adminId,
}) {
  try {
    console.log(`[MAIL] Début envoi: type=${recipientType}, subject="${subject}"`);

    // Récupérer les destinataires
    const recipients = await getRecipients(recipientType, poleId, levelId, classId);
    console.log(`[MAIL] ${recipients.length} destinataires trouvés`);

    if (recipients.length === 0) {
      throw new Error('Aucun destinataire trouvé');
    }

    // Rendre le HTML du mail
    const htmlContent = renderMailHtml({
      subject,
      content,
      attachmentInfo,
    });

    // Envoyer les emails
    const results = {
      successCount: 0,
      failedCount: 0,
      errors: [],
    };

    for (const recipient of recipients) {
      try {
        console.log(`[MAIL] Envoi à ${recipient.email}...`);
        const mailPayload = {
          to: recipient.email,
          subject,
          html: htmlContent,
        };

        // Ajouter la pièce jointe si présente
        if (attachmentInfo) {
          console.log(`[MAIL] Ajout pièce jointe: ${attachmentInfo.filename} (${attachmentInfo.path})`);
          mailPayload.attachments = [
            {
              filename: attachmentInfo.filename,
              path: attachmentInfo.path,
            },
          ];
        }

        const result = await sendMail(mailPayload);
        results.successCount++;
        console.log(`[MAIL] ✓ Succès pour ${recipient.email}`);
      } catch (error) {
        results.failedCount++;
        results.errors.push({
          email: recipient.email,
          error: error.message,
        });
        console.log(`[MAIL] ✗ Échec pour ${recipient.email}: ${error.message}`);
      }
    }

    console.log(
      `[MAIL] Envoi terminé: ${results.successCount} réussis, ${results.failedCount} échoués`
    );

    // TODO: Ajouter un log d'activité si une table ActivityLog existe
    // Actuellement, il n'y a pas de table de logging, mais on pourrait en ajouter une
    // pour tracker l'historique des mailings envoyés

    return results;
  } catch (error) {
    console.error('Erreur sendBulkMail:', error.message);
    throw error;
  }
}

/**
 * Récupère les pôles avec leurs niveaux et classes
 */
async function getPoleStructure(currentSchoolYear = null) {
  const poles = await prisma.pole.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      levels: {
        orderBy: { sortOrder: 'asc' },
        include: {
          classes: {
            where: currentSchoolYear ? { schoolYearId: currentSchoolYear } : undefined,
            select: {
              id: true,
              dayOfWeek: true,
              startTime: true,
              endTime: true,
              capacity: true,
              enrollments: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  return poles.map((pole) => ({
    id: pole.id,
    name: pole.name,
    levels: pole.levels.map((level) => ({
      id: level.id,
      name: level.name,
      classes: level.classes.map((cls) => ({
        id: cls.id,
        label: `${cls.dayOfWeek} ${cls.startTime}-${cls.endTime} (${cls.enrollments.length}/${cls.capacity || '∞'} élèves)`,
      })),
    })),
  }));
}

module.exports = {
  getRecipients,
  renderMailHtml,
  sendBulkMail,
  getPoleStructure,
};
