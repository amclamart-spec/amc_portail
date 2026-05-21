const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let transporter;
let cachedLogoDataUri = null;
let cachedPartnerLogoDataUri = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  return transporter;
}

async function sendWithAbacus({ to, subject, html, text, attachments }) {
  // L'API Abacus ne supporte pas les pièces jointes pour le moment
  // Si des pièces jointes sont présentes, on lève une erreur pour forcer l'utilisation de SMTP
  if (attachments && attachments.length > 0) {
    throw new Error('Pièces jointes non supportées par Abacus - basculement vers SMTP requis');
  }

  const { apiBaseUrl, endpoint, apiKey } = config.abacusEmail;

  if (!apiKey) {
    throw new Error('ABACUS_API_KEY manquante pour envoi email Abacus');
  }

  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      email: to,
      subject,
      body: html || text || '',
      is_html: Boolean(html),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Abacus email API error ${response.status}: ${details}`);
  }

  return response.json();
}

async function sendWithBrevo({ to, subject, html, text, attachments }) {
  const { apiKey } = config.brevoEmail;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY manquante pour envoi email Brevo');
  }

  const recipientList = Array.isArray(to)
    ? to.map((recipient) => ({ email: recipient.email || recipient }))
    : [{ email: to }];

  const payload = {
    sender: {
      name: config.email.fromName,
      email: config.email.fromEmail,
    },
    to: recipientList,
    subject,
    htmlContent: html || undefined,
    textContent: text || (html ? html.replace(/<[^>]+>/g, '') : undefined),
  };

  if (attachments && attachments.length > 0) {
    payload.attachment = await Promise.all(
      attachments.map(async (attachment) => {
        if (attachment.content) {
          return {
            name: attachment.filename,
            content: attachment.content,
            contentType: attachment.contentType || 'application/octet-stream',
          };
        }

        const buffer = await fs.promises.readFile(attachment.path);
        return {
          name: attachment.filename,
          content: buffer.toString('base64'),
          contentType: attachment.mimetype || 'application/octet-stream',
        };
      })
    );
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Brevo email API error ${response.status}: ${details}`);
  }

  return response.json();
}

async function sendWithSmtp({ to, subject, html, text, attachments }) {
  const mailOptions = {
    from: `"${config.email.fromName}" <${config.email.fromEmail}>`,
    to,
    subject,
    html,
    text,
  };

  // Ajouter les pièces jointes si présentes
  if (attachments && attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  const info = await getTransporter().sendMail(mailOptions);
  return info;
}

function isSmtpConfigured() {
  return Boolean(config.smtp.host && config.smtp.port && config.smtp.user && config.smtp.pass);
}

async function sendMail(payload) {
  try {
    console.log(`[EMAIL] Envoi avec provider: ${config.email.provider}`);
    console.log(`[EMAIL] Pièces jointes: ${payload.attachments ? payload.attachments.length : 0}`);

    // Si on utilise Abacus mais qu'il y a des pièces jointes, forcer SMTP
    if (config.email.provider === 'ABACUS' && payload.attachments && payload.attachments.length > 0) {
      console.log('[EMAIL] Basculement vers SMTP car pièces jointes détectées avec Abacus');
      return await sendWithSmtp(payload);
    }

    if (config.email.provider === 'BREVO') {
      if (!config.brevoEmail.apiKey) {
        const fallbackAllowed = isSmtpConfigured();
        if (fallbackAllowed) {
          console.warn('[EMAIL] BREVO_API_KEY manquante, basculement vers SMTP');
          return await sendWithSmtp(payload);
        }
        throw new Error('BREVO_API_KEY manquante et SMTP non configuré pour l’envoi d’email');
      }

      try {
        return await sendWithBrevo(payload);
      } catch (error) {
        const fallbackAllowed = isSmtpConfigured();
        if (fallbackAllowed) {
          console.warn('[EMAIL] Brevo non disponible, basculement vers SMTP:', error.message);
          return await sendWithSmtp(payload);
        }
        throw error;
      }
    }

    if (config.email.provider === 'ABACUS') {
      if (!config.abacusEmail.apiKey) {
        const fallbackAllowed = isSmtpConfigured();
        if (fallbackAllowed) {
          console.warn('[EMAIL] ABACUS_API_KEY manquante, basculement vers SMTP');
          return await sendWithSmtp(payload);
        }
        throw new Error('ABACUS_API_KEY manquante et SMTP non configuré pour l’envoi d’email');
      }

      try {
        return await sendWithAbacus(payload);
      } catch (error) {
        const fallbackAllowed = isSmtpConfigured();
        if (fallbackAllowed) {
          console.warn('[EMAIL] Abacus non disponible, basculement vers SMTP:', error.message);
          return await sendWithSmtp(payload);
        }
        throw error;
      }
    }

    if (!isSmtpConfigured()) {
      throw new Error('SMTP non configuré pour l’envoi d’email');
    }

    return await sendWithSmtp(payload);
  } catch (error) {
    console.error('Erreur envoi email:', error.message);
    throw error; // Re-throw pour que l'appelant puisse gérer l'erreur
  }
}

function getEmbeddedLogoDataUri(fileName, fallbackColor = '#213B88', fallbackText = 'AMC') {
  const cache = fileName === 'amc_logo.png' ? cachedLogoDataUri : cachedPartnerLogoDataUri;
  if (cache) return cache;

  const possiblePaths = [
    path.join(__dirname, '..', '..', '..', 'frontend', 'public', fileName),
    path.join(process.cwd(), 'frontend', 'public', fileName),
    path.join(process.cwd(), '..', 'frontend', 'public', fileName),
    path.join(__dirname, '..', '..', 'uploads', fileName),
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const dataUri = `data:image/${path.extname(fileName).slice(1)};base64,${buffer.toString('base64')}`;
      if (fileName === 'amc_logo.png') cachedLogoDataUri = dataUri;
      else cachedPartnerLogoDataUri = dataUri;
      return dataUri;
    }
  }

  const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="100%" height="100%" fill="${fallbackColor}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#FFF" font-family="Arial, sans-serif" font-size="24">${fallbackText}</text></svg>`;
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(placeholderSvg).toString('base64')}`;
  if (fileName === 'amc_logo.png') cachedLogoDataUri = dataUri;
  else cachedPartnerLogoDataUri = dataUri;
  return dataUri;
}

function renderEmailHtml({ title, subtitle, contentHtml }) {
  const logoUrl = getEmbeddedLogoDataUri('amc_logo.png');
  const partnerLogoUrl = getEmbeddedLogoDataUri('amc_logo_partner.png', '#64748b', 'PARTAGE');
  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" style="background:#f3f4f6;padding:30px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" style="background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 24px 80px rgba(15,23,42,0.12);">
            <tr>
              <td style="background:#213B88;padding:28px 24px;text-align:center;color:#ffffff;">
                <div style="display:flex;justify-content:center;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:16px;">
                  <img src="${logoUrl}" alt="AMC" width="120" height="80" style="display:block;width:120px;height:80px;max-width:120px;max-height:80px;object-fit:contain;" />
                  <img src="${partnerLogoUrl}" alt="PARTAGE" width="120" height="80" style="display:block;width:120px;height:80px;max-width:120px;max-height:80px;object-fit:contain;" />
                </div>
                <h1 style="margin:0;font-size:28px;font-weight:700;letter-spacing:-0.02em;">${title}</h1>
                ${subtitle ? `<p style="margin:12px 0 0;font-size:16px;opacity:0.88;line-height:1.5;">${subtitle}</p>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 32px;color:#1f2937;font-size:16px;line-height:1.75;">
                ${contentHtml}
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc;padding:20px 28px;color:#475569;font-size:14px;text-align:center;">
                Association PARTAGE • Portail AMC
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendVerificationEmail(user, token) {
  const verifyUrl = `${config.frontendUrl}/verify-email?token=${token}&redirect=/login`;
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Bienvenue sur le portail AMC. Pour finaliser la création de votre compte, veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous :</p>
    <p style="text-align:center;">
      <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;background:#213B88;border-radius:8px;text-decoration:none;font-weight:bold;">Vérifier mon email</a>
    </p>
    <p style="font-size:14px;color:#64748b;margin-top:24px;">Ou copiez-collez ce lien dans votre navigateur :<br/><span style="word-break:break-all;">${verifyUrl}</span></p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Vérification de votre adresse email',
    html: renderEmailHtml({
      title: 'Vérifiez votre adresse email',
      subtitle: 'Créez votre compte sur le portail AMC',
      contentHtml,
    }),
  });
}

async function sendResetPasswordEmail(user, token) {
  const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Nous avons reçu une demande de réinitialisation de votre mot de passe.</p>
    <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
    <p style="text-align:center;">
      <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;background:#213B88;border-radius:8px;text-decoration:none;font-weight:bold;">Réinitialiser mon mot de passe</a>
    </p>
    <p style="font-size:14px;color:#64748b;margin-top:24px;">Si vous n'avez pas demandé cette réinitialisation, ignorez simplement ce message.</p>
    <p style="font-size:14px;color:#64748b;">Ou copiez-collez ce lien dans votre navigateur :<br/><span style="word-break:break-all;">${resetUrl}</span></p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Réinitialisation de votre mot de passe',
    html: renderEmailHtml({
      title: 'Réinitialisez votre mot de passe',
      subtitle: 'Suivez le lien pour définir un nouveau mot de passe',
      contentHtml,
    }),
  });
}

async function sendEnrollmentConfirmationEmail(user, enrollmentSummary = '', subject = 'Inscription enregistrée') {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Votre inscription a bien été enregistrée.</p>
    ${enrollmentSummary ? `<div style="margin:18px 0;padding:18px;background:#eef2ff;border-radius:12px;"><strong>Détails des inscriptions :</strong><br/>${enrollmentSummary}</div>` : ''}
    <p>Nous vous enverrons un second email dès que le paiement sera validé et que l'inscription sera confirmée.</p>
  `;

  return sendMail({
    to: user.email,
    subject,
    html: renderEmailHtml({
      title: 'Inscription enregistrée',
      subtitle: 'Votre inscription a bien été prise en compte',
      contentHtml,
    }),
  });
}

async function sendEnrollmentStatusEmail(user, subject, title, subtitle, summaryHtml) {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    ${summaryHtml}
    <p style="margin-top:24px;">Merci de votre confiance.</p>
  `;

  return sendMail({
    to: user.email,
    subject,
    html: renderEmailHtml({
      title,
      subtitle,
      contentHtml,
    }),
  });
}

async function sendEnrollmentApprovedEmail(user, enrollmentSummary = '') {
  return sendEnrollmentStatusEmail(
    user,
    'Inscription validée',
    'Inscription validée',
    'Votre inscription a été validée par l’équipe administrative.',
    `<p>Félicitations ! L’inscription suivante a été validée :</p><div style="margin:18px 0;padding:18px;background:#dcfce7;border-radius:12px;">${enrollmentSummary}</div>`,
  );
}

async function sendEnrollmentRejectedEmail(user, enrollmentSummary = '', reason = '') {
  return sendEnrollmentStatusEmail(
    user,
    'Inscription refusée',
    'Inscription refusée',
    'Votre inscription n’a pas été validée.',
    `<p>Nous sommes désolés, l’inscription suivante a été refusée :</p><div style="margin:18px 0;padding:18px;background:#fee2e2;border-radius:12px;">${enrollmentSummary}</div>${reason ? `<p><strong>Motif :</strong> ${reason}</p>` : '<p>Pour plus d’informations, merci de contacter le secrétariat.</p>'}`,
  );
}

async function sendPaymentConfirmationEmail(user, payment) {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Nous confirmons la réception de votre paiement.</p>
    <ul>
      <li><strong>Référence:</strong> ${payment.id}</li>
      <li><strong>Montant:</strong> ${Number(payment.amount || payment.totalAmount || 0).toFixed(2)} €</li>
      <li><strong>Méthode:</strong> ${payment.method || payment.paymentMethod}</li>
    </ul>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Confirmation de paiement',
    html: renderEmailHtml({
      title: 'Paiement confirmé',
      subtitle: 'Merci, votre paiement a bien été reçu',
      contentHtml,
    }),
  });
}

async function sendAccountApprovedEmail(user) {
  const loginUrl = `${config.frontendUrl}/login`;
  const contentHtml = `
    <p>Bonne nouvelle ${user.firstName},</p>
    <p>Votre compte a été validé.</p>
    <p style="text-align:center;"><a href="${loginUrl}" style="display:inline-block;padding:10px 18px;background:#213B88;color:#fff;border-radius:6px;text-decoration:none;">Se connecter</a></p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Votre compte a été validé',
    html: renderEmailHtml({ title: 'Compte validé', subtitle: '', contentHtml }),
  });
}

async function sendAccountRejectedEmail(user, reason) {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Votre compte n'a pas été validé.</p>
    ${reason ? `<p><strong>Motif:</strong> ${reason}</p>` : ''}
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Votre demande de compte',
    html: renderEmailHtml({ title: 'Demande de compte', subtitle: 'Statut: refusé', contentHtml }),
  });
}

async function sendFamilyRegistrationConfirmationEmail(user, familySummary = '') {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Votre inscription famille a bien été enregistrée. Nous avons reçu votre dossier complet.</p>
    ${familySummary ? `<div style="margin:12px 0;padding:12px;background:#eef2ff;border-radius:8px;">${familySummary}</div>` : ''}
    <p>Prochaines étapes :</p>
    <ul>
      <li>Vérifiez votre email pour activer votre compte</li>
      <li>Effectuez le paiement selon l'échéancier fourni</li>
      <li>Les inscriptions de vos enfants seront confirmées après paiement</li>
    </ul>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Inscription famille enregistrée',
    html: renderEmailHtml({ title: 'Inscription famille enregistrée', subtitle: '', contentHtml }),
  });
}

async function sendChildRegistrationConfirmationEmail(user, childName, enrollmentSummary = '') {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>L'inscription de <strong>${childName}</strong> a bien été enregistrée.</p>
    ${enrollmentSummary ? `<div style="margin:12px 0;padding:12px;background:#eef2ff;border-radius:8px;">${enrollmentSummary}</div>` : ''}
    <p>Effectuez le paiement selon l'échéancier pour finaliser l'inscription.</p>
  `;

  return sendMail({
    to: user.email,
    subject: `AMC — Inscription de ${childName} confirmée`,
    html: renderEmailHtml({ title: 'Inscription confirmée', subtitle: '', contentHtml }),
  });
}

async function sendOfflinePaymentConfirmationEmail(user, paymentData) {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Nous avons bien enregistré votre demande de paiement par <strong>${paymentData.method || 'chèque/espèces'}</strong>.</p>
    <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
      <strong>Montant total :</strong> ${Number(paymentData.totalAmount || 0).toFixed(2)} €<br/>
      <strong>Nombre d'échéances :</strong> ${paymentData.numberOfInstallments || 1}<br/>
      <strong>Méthode :</strong> ${paymentData.method || 'Chèque/Espèces'}
    </div>
    <p>${paymentData.instructions || 'Suivez les instructions communiquées pour finaliser votre paiement.'}</p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Confirmation de paiement en attente',
    html: renderEmailHtml({ title: 'Paiement en attente', subtitle: '', contentHtml }),
  });
}

async function sendPaymentValidationEmail(user, paymentData) {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Nous avons confirmé votre paiement. Les inscriptions de vos enfants sont maintenant validées.</p>
    <div style="background:#dcfce7;padding:18px;border-radius:12px;margin:18px 0;border-left:4px solid #22c55e;">
      <strong>✓ Paiement confirmé</strong><br/>
      Montant : ${Number(paymentData.totalAmount || paymentData.amount || 0).toFixed(2)} €<br/>
      Méthode : ${paymentData.method || 'Carte bancaire'}<br/>
      Référence : ${paymentData.id || 'N/A'}
    </div>
    <p>Votre inscription est désormais confirmée. Merci de votre confiance.</p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Inscription confirmée',
    html: renderEmailHtml({
      title: 'Inscription confirmée',
      subtitle: 'Le paiement est validé et l’inscription est confirmée',
      contentHtml,
    }),
  });
}

module.exports = {
  sendMail,
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendEnrollmentConfirmationEmail,
  sendEnrollmentApprovedEmail,
  sendEnrollmentRejectedEmail,
  sendPaymentConfirmationEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendFamilyRegistrationConfirmationEmail,
  sendChildRegistrationConfirmationEmail,
  sendOfflinePaymentConfirmationEmail,
  sendPaymentValidationEmail,
};
