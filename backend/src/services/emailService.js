const nodemailer = require('nodemailer');
const config = require('../config');

let transporter;

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

    if (config.email.provider === 'ABACUS') {
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

function renderEmailHtml({ title, subtitle, contentHtml }) {
  const logoUrl = `${config.frontendUrl.replace(/\/$/, '')}/amc_logo.png`;
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
                <img src="${logoUrl}" alt="AMC" width="120" style="display:block;margin:0 auto 16px;" />
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
                Association des Musulmans de Clamart • Portail AMC
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

async function sendEnrollmentConfirmationEmail(user, enrollmentSummary = '') {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Votre inscription a bien été enregistrée.</p>
    ${enrollmentSummary ? `<div style="margin:18px 0;padding:18px;background:#eef2ff;border-radius:12px;">${enrollmentSummary}</div>` : ''}
    <p>Nous vous enverrons un second email dès que le paiement sera validé et que l'inscription sera confirmée.</p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Inscription enregistrée',
    html: renderEmailHtml({
      title: 'Inscription enregistrée',
      subtitle: 'Votre inscription a bien été prise en compte',
      contentHtml,
    }),
  });
}

async function sendPaymentConfirmationEmail(user, payment) {
  return sendMail({
    to: user.email,
    subject: 'AMC — Confirmation de paiement',
    html: `<h2>Paiement confirmé</h2><p>Bonjour ${user.firstName}, nous confirmons la réception de votre paiement.</p><ul><li>Référence: ${payment.id}</li><li>Montant: ${payment.amount || payment.totalAmount} €</li><li>Méthode: ${payment.method || payment.paymentMethod}</li></ul>`,
  });
}

async function sendAccountApprovedEmail(user) {
  const loginUrl = `${config.frontendUrl}/login`;
  return sendMail({
    to: user.email,
    subject: 'AMC — Votre compte a été validé',
    html: `<h2>Bonne nouvelle ${user.firstName}</h2><p>Votre compte a été validé.</p><p><a href="${loginUrl}">Se connecter</a></p>`,
  });
}

async function sendAccountRejectedEmail(user, reason) {
  return sendMail({
    to: user.email,
    subject: 'AMC — Votre demande de compte',
    html: `<h2>Bonjour ${user.firstName}</h2><p>Votre compte n'a pas été validé.</p>${reason ? `<p>Motif: ${reason}</p>` : ''}`,
  });
}

async function sendFamilyRegistrationConfirmationEmail(user, familySummary = '') {
  return sendMail({
    to: user.email,
    subject: 'AMC — Inscription famille enregistrée',
    html: `<h2>Inscription famille confirmée</h2>
      <p>Bonjour ${user.firstName},</p>
      <p>Votre inscription famille a bien été enregistrée. Nous avons reçu votre dossier complet.</p>
      ${familySummary ? `<div>${familySummary}</div>` : ''}
      <p>Prochaines étapes :</p>
      <ul>
        <li>Vérifiez votre email pour activer votre compte</li>
        <li>Effectuez le paiement selon l'échéancier fourni</li>
        <li>Les inscriptions de vos enfants seront confirmées après paiement</li>
      </ul>`,
  });
}

async function sendChildRegistrationConfirmationEmail(user, childName, enrollmentSummary = '') {
  return sendMail({
    to: user.email,
    subject: `AMC — Inscription de ${childName} confirmée`,
    html: `<h2>Inscription confirmée</h2>
      <p>Bonjour ${user.firstName},</p>
      <p>L'inscription de <strong>${childName}</strong> a bien été enregistrée.</p>
      ${enrollmentSummary ? `<div>${enrollmentSummary}</div>` : ''}
      <p>Effectuez le paiement selon l'échéancier pour finaliser l'inscription.</p>`,
  });
}

async function sendOfflinePaymentConfirmationEmail(user, paymentData) {
  return sendMail({
    to: user.email,
    subject: 'AMC — Confirmation de paiement en attente',
    html: `<h2>Paiement en attente</h2>
      <p>Bonjour ${user.firstName},</p>
      <p>Nous avons bien enregistré votre demande de paiement par ${paymentData.method || 'chèque/espèces'}.</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <strong>Montant total :</strong> ${Number(paymentData.totalAmount || 0).toFixed(2)} €<br/>
        <strong>Nombre d'échéances :</strong> ${paymentData.numberOfInstallments || 1}<br/>
        <strong>Méthode :</strong> ${paymentData.method || 'Chèque/Espèces'}
      </div>
      <p>${paymentData.instructions || 'Suivez les instructions communiquées pour finaliser votre paiement.'}</p>`,
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
  sendPaymentConfirmationEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendFamilyRegistrationConfirmationEmail,
  sendChildRegistrationConfirmationEmail,
  sendOfflinePaymentConfirmationEmail,
  sendPaymentValidationEmail,
};
