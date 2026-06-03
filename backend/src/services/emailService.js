const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { BrevoClient } = require('@getbrevo/brevo');
const config = require('../config');

let transporter;
let cachedLogoDataUri = null;
let cachedPartnerLogoDataUri = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise une adresse email : trim + lowercase.
 * Retourne null si la valeur n'est pas un email valide.
 */
function normalizeEmail(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase();
  // Regex simple mais suffisante pour valider la plupart des adresses
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(cleaned) ? cleaned : null;
}

// ---------------------------------------------------------------------------
// Transporteurs SMTP
// ---------------------------------------------------------------------------

function getTransporter() {
  if (!transporter) {
    const smtpOpts = {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      // Timeouts pour eviter un blocage infini (Render / PaaS bloquent souvent les ports SMTP)
      connectionTimeout: 10000,  // 10 s
      greetingTimeout: 10000,    // 10 s
      socketTimeout: 15000,      // 15 s
    };

    // Si auth vide, desactiver
    if (!config.smtp.user || !config.smtp.pass) {
      delete smtpOpts.auth;
    }

    transporter = nodemailer.createTransport(smtpOpts);
  }
  return transporter;
}

// ---------------------------------------------------------------------------
// Provider : Brevo (ex-Sendinblue) - API transactionnelle v3
// ---------------------------------------------------------------------------

async function sendWithBrevo({ to, subject, html, text, attachments }) {
  const { apiKey } = config.brevoEmail;

  if (!apiKey) {
    throw new Error('BREVO_API_KEY manquante pour envoi email Brevo');
  }

  // Normaliser l'email destinataire
  const recipientEmail = normalizeEmail(to);
  if (!recipientEmail) {
    throw new Error(`Adresse email destinataire invalide : "${to}"`);
  }

  // Construire le body conforme a Brevo API v3
  // Doc: https://developers.brevo.com/reference/sendtransacemail
  const brevoBody = {
    sender: {
      name: config.email.fromName,
      email: config.email.fromEmail,
    },
    to: [{ email: recipientEmail }],
    subject,
  };

  if (html) {
    brevoBody.htmlContent = html;
  } else if (text) {
    brevoBody.textContent = text;
  }

  // Pieces jointes (Brevo accepte base64)
  if (attachments && attachments.length > 0) {
    brevoBody.attachment = attachments
      .map((att) => {
        if (att.content) {
          const buf = Buffer.isBuffer(att.content)
            ? att.content
            : Buffer.from(att.content, att.encoding || 'utf-8');
          return { name: att.filename || 'attachment', content: buf.toString('base64') };
        }
        if (att.path) {
          const buf = fs.readFileSync(att.path);
          return {
            name: att.filename || path.basename(att.path),
            content: buf.toString('base64'),
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  console.log(`[EMAIL][BREVO] Envoi a ${recipientEmail} - sujet: ${subject}`);

  const client = new BrevoClient({ apiKey });
  const result = await client.transactionalEmails.sendTransacEmail(brevoBody);

  console.log(`[EMAIL][BREVO] Envoi reussi - messageId: ${result?.messageId || 'N/A'}`);
  return result;
}

// ---------------------------------------------------------------------------
// Provider : Abacus AI
// ---------------------------------------------------------------------------

async function sendWithAbacus({ to, subject, html, text, attachments }) {
  if (attachments && attachments.length > 0) {
    throw new Error('Pieces jointes non supportees par Abacus - basculement vers fallback requis');
  }

  const { apiBaseUrl, endpoint, apiKey } = config.abacusEmail;

  if (!apiKey) {
    throw new Error('ABACUS_API_KEY manquante pour envoi email Abacus');
  }

  const recipientEmail = normalizeEmail(to);
  if (!recipientEmail) {
    throw new Error(`Adresse email destinataire invalide : "${to}"`);
  }

  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      email: recipientEmail,
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

// ---------------------------------------------------------------------------
// Provider : SMTP (nodemailer)
// ---------------------------------------------------------------------------

async function sendWithSmtp({ to, subject, html, text, attachments }) {
  const recipientEmail = normalizeEmail(to);
  if (!recipientEmail) {
    throw new Error(`Adresse email destinataire invalide : "${to}"`);
  }

  const mailOptions = {
    from: `"${config.email.fromName}" <${config.email.fromEmail}>`,
    to: recipientEmail,
    subject,
    html,
    text,
    encoding: 'utf-8',
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
    },
  };

  if (attachments && attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  const info = await getTransporter().sendMail(mailOptions);
  return info;
}

// ---------------------------------------------------------------------------
// Detection fallback
// ---------------------------------------------------------------------------

function isSmtpConfigured() {
  return Boolean(config.smtp.host && config.smtp.port && config.smtp.user && config.smtp.pass);
}

function isBrevoConfigured() {
  return Boolean(/*config.brevoEmail &&*/ config.brevoEmail.apiKey);
}

/**
 * Tente d'envoyer via un fallback (Brevo API > SMTP) quand le provider
 * principal echoue.
 */
async function sendWithFallback(payload, originalError) {
  // Essayer Brevo API en fallback si configure
  if (isBrevoConfigured()) {
    try {
      console.warn('[EMAIL] Tentative fallback via Brevo API...');
      return await sendWithBrevo(payload);
    } catch (brevoErr) {
      console.warn('[EMAIL] Fallback Brevo echoue:', brevoErr.message);
    }
  }

  // Essayer SMTP en fallback si configure
  if (isSmtpConfigured()) {
    try {
      console.warn('[EMAIL] Tentative fallback via SMTP...');
      return await sendWithSmtp(payload);
    } catch (smtpErr) {
      console.warn('[EMAIL] Fallback SMTP echoue:', smtpErr.message);
    }
  }

  // Aucun fallback disponible
  throw originalError;
}

// ---------------------------------------------------------------------------
// Point d'entree principal
// ---------------------------------------------------------------------------

async function sendMail(payload) {
  try {
    const provider = config.email.provider;
    console.log(`[EMAIL] Envoi avec provider: ${provider}`);
    console.log(`[EMAIL] Destinataire: ${payload.to}`);
    console.log(`[EMAIL] Pieces jointes: ${payload.attachments ? payload.attachments.length : 0}`);

    // ----- BREVO -----
    if (provider === 'BREVO') {
      if (!isBrevoConfigured()) {
        console.warn('[EMAIL] BREVO_API_KEY manquante, tentative de fallback...');
        return await sendWithFallback(payload, new Error('BREVO_API_KEY manquante'));
      }
      try {
        return await sendWithBrevo(payload);
      } catch (error) {
        console.warn('[EMAIL] Brevo echoue, tentative de fallback:', error.message);
        return await sendWithFallback(payload, error);
      }
    }

    // ----- ABACUS -----
    if (provider === 'ABACUS') {
      // Abacus ne gere pas les pieces jointes -> fallback immediat
      if (payload.attachments && payload.attachments.length > 0) {
        console.log('[EMAIL] Pieces jointes detectees - basculement vers fallback (Abacus ne supporte pas les PJ)');
        return await sendWithFallback(
          payload,
          new Error('Pieces jointes non supportees par Abacus'),
        );
      }

      if (!config.abacusEmail.apiKey) {
        console.warn('[EMAIL] ABACUS_API_KEY manquante, tentative de fallback...');
        return await sendWithFallback(payload, new Error('ABACUS_API_KEY manquante'));
      }

      try {
        return await sendWithAbacus(payload);
      } catch (error) {
        console.warn('[EMAIL] Abacus echoue, tentative de fallback:', error.message);
        return await sendWithFallback(payload, error);
      }
    }

    // ----- SMTP (defaut) -----
    if (!isSmtpConfigured()) {
      if (isBrevoConfigured()) {
        console.warn('[EMAIL] SMTP non configure, tentative via Brevo...');
        return await sendWithBrevo(payload);
      }
      throw new Error('Aucun provider email configure (SMTP non configure, Brevo non configure)');
    }

    return await sendWithSmtp(payload);
  } catch (error) {
    console.error('[EMAIL] Erreur envoi email:', error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Templates HTML
// ---------------------------------------------------------------------------

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

function getEmailLogoUrls() {
  const logoUrl = getEmbeddedLogoDataUri('amc_logo.png');
  const partnerLogoUrl = getEmbeddedLogoDataUri('amc_logo_partner.png', '#64748b', 'PARTAGE');
  return { logoUrl, partnerLogoUrl };
}

function renderEmailHtml({ title, subtitle, contentHtml }) {
  const { logoUrl, partnerLogoUrl } = getEmailLogoUrls();
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
                Association PARTAGE &bull; Portail AMC
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// Fonctions d'envoi specifiques
// ---------------------------------------------------------------------------

async function sendVerificationEmail(user, token) {
  const verifyUrl = `${config.frontendUrl}/verify-email?token=${token}&redirect=/login`;
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Bienvenue sur le portail AMC. Pour finaliser la creation de votre compte, veuillez verifier votre adresse email en cliquant sur le bouton ci-dessous :</p>
    <p style="text-align:center;">
      <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;background:#213B88;border-radius:8px;text-decoration:none;font-weight:bold;">Verifier mon email</a>
    </p>
    <p style="font-size:14px;color:#64748b;margin-top:24px;">Ou copiez-collez ce lien dans votre navigateur :<br/><span style="word-break:break-all;">${verifyUrl}</span></p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Verification de votre adresse email',
    html: renderEmailHtml({
      title: 'Verifiez votre adresse email',
      subtitle: 'Creez votre compte sur le portail AMC',
      contentHtml,
    }),
  });
}

async function sendResetPasswordEmail(user, token) {
  const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Nous avons recu une demande de reinitialisation de votre mot de passe.</p>
    <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
    <p style="text-align:center;">
      <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;background:#213B88;border-radius:8px;text-decoration:none;font-weight:bold;">Reinitialiser mon mot de passe</a>
    </p>
    <p style="font-size:14px;color:#64748b;margin-top:24px;">Si vous n'avez pas demande cette reinitialisation, ignorez simplement ce message.</p>
    <p style="font-size:14px;color:#64748b;">Ou copiez-collez ce lien dans votre navigateur :<br/><span style="word-break:break-all;">${resetUrl}</span></p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Reinitialisation de votre mot de passe',
    html: renderEmailHtml({
      title: 'Reinitialisez votre mot de passe',
      subtitle: 'Suivez le lien pour definir un nouveau mot de passe',
      contentHtml,
    }),
  });
}

async function sendEnrollmentConfirmationEmail(user, enrollmentSummary = '', subject = 'Inscription enregistree') {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Votre inscription a bien ete enregistree.</p>
    ${enrollmentSummary ? `<div style="margin:18px 0;padding:18px;background:#eef2ff;border-radius:12px;"><strong>Details des inscriptions :</strong><br/>${enrollmentSummary}</div>` : ''}
    <p>Nous vous enverrons un second email des que le paiement sera valide et que l'inscription sera confirmee.</p>
  `;

  return sendMail({
    to: user.email,
    subject,
    html: renderEmailHtml({
      title: 'Inscription enregistree',
      subtitle: 'Votre inscription a bien ete prise en compte',
      contentHtml,
    }),
  });
}

async function sendEnrollmentConfirmedEmail(user, enrollmentSummary = '', attachments = []) {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Votre inscription a bien été confirmée.</p>
    ${enrollmentSummary ? `<div style="margin:18px 0;padding:18px;background:#eef2ff;border-radius:12px;"><strong>Détails des inscriptions :</strong><br/>${enrollmentSummary}</div>` : ''}
    <p>Veuillez trouver en pièce jointe le reçu de paiement.</p>
  `;

  return sendMail({
    to: user.email,
    subject: 'Inscription confirmée',
    html: renderEmailHtml({
      title: 'Inscription confirmée',
      subtitle: 'Votre inscription est maintenant confirmée',
      contentHtml,
    }),
    attachments,
  });
}

async function sendEnrollmentRequestRegisteredEmail(user, enrollmentSummary = '') {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Votre inscription a bien été enregistrée. A fin de valider définitivement votre inscription, nous vous invitons à éffectuer le réglement directement sur place. Votre inscription sera considérée comme confirmée après réception du paiement et validation par l'administration. Vous serez informé(e) par email de l'état de votre inscription.</p>
    ${enrollmentSummary ? `<div style="margin:18px 0;padding:18px;background:#eef2ff;border-radius:12px;"><strong>Détails des inscriptions :</strong><br/>${enrollmentSummary}</div>` : ''}
  `;

  return sendMail({
    to: user.email,
    subject: "Demande d'inscription enregistrée",
    html: renderEmailHtml({
      title: "Demande d'inscription enregistrée",
      subtitle: 'Votre demande est en cours de traitement',
      contentHtml,
    }),
  });
}

async function sendStripePaymentPendingEmail(user, paymentData = {}) {
  const payerName = paymentData?.payerName || paymentData?.metadata?.payerName || paymentData?.metadata?.payer_name || 'N/A';
  const methodLabel = paymentData?.method === 'SEPA' ? 'SEPA Stripe' : paymentData?.method === 'CB' ? 'Carte bancaire Stripe' : paymentData?.method || 'Stripe';
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Nous confirmons que votre paiement Stripe a bien été enregistré. Il reste en attente tant que votre inscription n'est pas validée.</p>
    <div style="margin:18px 0;padding:18px;background:#f8fafc;border-radius:12px;">
      <strong>Référence de paiement :</strong> ${paymentData.id || 'N/A'}<br/>
      <strong>Montant :</strong> ${Number(paymentData.totalAmount || paymentData.amount || 0).toFixed(2)} €<br/>
      <strong>Méthode :</strong> ${methodLabel}<br/>
      <strong>Payeur :</strong> ${payerName}
    </div>
    ${paymentData.enrollmentSummary ? `<div style="margin-top:12px;">${paymentData.enrollmentSummary}</div>` : ''}
    <p>Vous serez informé(e) par email de l'état de votre inscription.</p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Paiement Stripe enregistré',
    html: renderEmailHtml({
      title: 'Paiement Stripe enregistré',
      subtitle: "Le paiement est bien enregistré, l'inscription reste en attente",
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
    'Inscription validee',
    'Inscription validee',
    "Votre inscription a ete validee par l'equipe administrative.",
    `<p>Felicitations ! L'inscription suivante a ete validee :</p><div style="margin:18px 0;padding:18px;background:#dcfce7;border-radius:12px;">${enrollmentSummary}</div>`,
  );
}

async function sendEnrollmentRejectedEmail(user, enrollmentSummary = '', reason = '') {
  return sendEnrollmentStatusEmail(
    user,
    'Inscription refusee',
    'Inscription refusee',
    "Votre inscription n'a pas ete validee.",
    `<p>Nous sommes desoles, l'inscription suivante a ete refusee :</p><div style="margin:18px 0;padding:18px;background:#fee2e2;border-radius:12px;">${enrollmentSummary}</div>${reason ? `<p><strong>Motif :</strong> ${reason}</p>` : '<p>Pour plus d\'informations, merci de contacter le secretariat.</p>'}`,
  );
}

async function sendPaymentConfirmationEmail(user, payment) {
  const payerName = payment?.payerName || payment?.metadata?.payerName || payment?.metadata?.payer_name || 'N/A';
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Nous confirmons la réception de votre paiement.</p>
    <ul>
      <li><strong>Référence :</strong> ${payment.id}</li>
      <li><strong>Montant :</strong> ${Number(payment.amount || payment.totalAmount || 0).toFixed(2)} &euro;</li>
      <li><strong>Méthode :</strong> ${payment.method || payment.paymentMethod}</li>
      <li><strong>Payeur :</strong> ${payerName}</li>
    </ul>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Confirmation de paiement',
    html: renderEmailHtml({
      title: 'Paiement confirme',
      subtitle: 'Merci, votre paiement a bien ete recu',
      contentHtml,
    }),
  });
}

async function sendAccountApprovedEmail(user) {
  const loginUrl = `${config.frontendUrl}/login`;
  const contentHtml = `
    <p>Bonne nouvelle ${user.firstName},</p>
    <p>Votre compte a ete valide.</p>
    <p style="text-align:center;"><a href="${loginUrl}" style="display:inline-block;padding:10px 18px;background:#213B88;color:#fff;border-radius:6px;text-decoration:none;">Se connecter</a></p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Votre compte a ete valide',
    html: renderEmailHtml({ title: 'Compte valide', subtitle: '', contentHtml }),
  });
}

async function sendAccountRejectedEmail(user, reason) {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Votre compte n'a pas ete valide.</p>
    ${reason ? `<p><strong>Motif:</strong> ${reason}</p>` : ''}
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Votre demande de compte',
    html: renderEmailHtml({ title: 'Demande de compte', subtitle: 'Statut: refuse', contentHtml }),
  });
}

async function sendFamilyRegistrationConfirmationEmail(user, familySummary = '') {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Votre inscription famille a bien ete enregistree. Nous avons recu votre dossier complet.</p>
    ${familySummary ? `<div style="margin:12px 0;padding:12px;background:#eef2ff;border-radius:8px;">${familySummary}</div>` : ''}
    <p>Prochaines etapes :</p>
    <ul>
      <li>Verifiez votre email pour activer votre compte</li>
      <li>Effectuez le paiement selon l'echeancier fourni</li>
      <li>Les inscriptions de vos enfants seront confirmees apres paiement</li>
    </ul>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Inscription famille enregistree',
    html: renderEmailHtml({ title: 'Inscription famille enregistree', subtitle: '', contentHtml }),
  });
}

async function sendChildRegistrationConfirmationEmail(user, childName, enrollmentSummary = '') {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>L'inscription de <strong>${childName}</strong> a bien ete enregistree.</p>
    ${enrollmentSummary ? `<div style="margin:12px 0;padding:12px;background:#eef2ff;border-radius:8px;">${enrollmentSummary}</div>` : ''}
    <p>Effectuez le paiement selon l'echeancier pour finaliser l'inscription.</p>
  `;

  return sendMail({
    to: user.email,
    subject: `AMC — Inscription de ${childName} confirmee`,
    html: renderEmailHtml({ title: 'Inscription confirmee', subtitle: '', contentHtml }),
  });
}

async function sendOfflinePaymentConfirmationEmail(user, paymentData) {
  const payerName = paymentData?.payerName || paymentData?.metadata?.payerName || paymentData?.metadata?.payer_name || 'N/A';
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Nous avons bien enregistre votre demande de paiement par <strong>${paymentData.method || 'cheque/especes'}</strong>.</p>
    <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
      <strong>Montant total :</strong> ${Number(paymentData.totalAmount || 0).toFixed(2)} &euro;<br/>
      <strong>Nombre d'echeances :</strong> ${paymentData.numberOfInstallments || 1}<br/>
      <strong>Methode :</strong> ${paymentData.method || 'Cheque/Especes'}<br/>
      <strong>Payeur :</strong> ${payerName}
    </div>
    <p>${paymentData.instructions || 'Suivez les instructions communiquees pour finaliser votre paiement.'}</p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Confirmation de paiement en attente',
    html: renderEmailHtml({ title: 'Paiement en attente', subtitle: '', contentHtml }),
  });
}

async function sendPaymentValidationEmail(user, paymentData) {
  const payerName = paymentData?.payerName || paymentData?.metadata?.payerName || paymentData?.metadata?.payer_name || 'N/A';
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Nous avons confirmé votre paiement. Les inscriptions de vos enfants sont maintenant validées.</p>
    <div style="background:#dcfce7;padding:18px;border-radius:12px;margin:18px 0;border-left:4px solid #22c55e;">
      <strong>&#10003; Paiement confirmé</strong><br/>
      Montant : ${Number(paymentData.totalAmount || paymentData.amount || 0).toFixed(2)} &euro;<br/>
      Méthode : ${paymentData.method || 'Carte bancaire'}<br/>
      Payeur : ${payerName}<br/>
      Référence : ${paymentData.id || 'N/A'}
    </div>
    <p>Votre inscription est désormais confirmée. Merci de votre confiance.</p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Inscription confirmee',
    html: renderEmailHtml({
      title: 'Inscription confirmee',
      subtitle: "Le paiement est valide et l'inscription est confirmee",
      contentHtml,
    }),
  });
}

module.exports = {
  sendMail,
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendEnrollmentConfirmationEmail,
  sendEnrollmentRequestRegisteredEmail,
  sendStripePaymentPendingEmail,
  sendEnrollmentApprovedEmail,
  sendEnrollmentRejectedEmail,
  sendPaymentConfirmationEmail,
  sendEnrollmentConfirmedEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendFamilyRegistrationConfirmationEmail,
  sendChildRegistrationConfirmationEmail,
  sendOfflinePaymentConfirmationEmail,
  sendPaymentValidationEmail,
};
