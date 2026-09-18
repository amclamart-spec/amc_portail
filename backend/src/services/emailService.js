const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { BrevoClient } = require('@getbrevo/brevo');
const config = require('../config');

let transporter;

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

/**
 * Découpe un champ "to" (chaîne unique, chaîne multi-destinataires séparés
 * par virgule/point-virgule, ou tableau) en liste d'adresses valides et
 * dédupliquées. Utilisé par les providers pour supporter plusieurs
 * destinataires sans faire échouer normalizeEmail sur la chaîne jointe.
 */
function parseRecipients(to) {
  const rawList = Array.isArray(to) ? to : String(to || '').split(/[,;]/);
  const emails = rawList.map((entry) => normalizeEmail(entry)).filter(Boolean);
  return [...new Set(emails)];
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

async function sendWithBrevo({ to, subject, html, text, attachments, bcc }) {
  const { apiKey } = config.brevoEmail;

  if (!apiKey) {
    throw new Error('BREVO_API_KEY manquante pour envoi email Brevo');
  }

  // Normaliser le(s) email(s) destinataire(s) — supporte une liste séparée par virgule/point-virgule
  const recipientEmails = parseRecipients(to);
  if (recipientEmails.length === 0) {
    throw new Error(`Adresse email destinataire invalide : "${to}"`);
  }

  // Construire le body conforme a Brevo API v3
  // Doc: https://developers.brevo.com/reference/sendtransacemail
  const brevoBody = {
    sender: {
      name: config.email.fromName,
      email: config.email.fromEmail,
    },
    to: recipientEmails.map((email) => ({ email })),
    subject,
  };

  if (html) {
    brevoBody.htmlContent = html;
  } else if (text) {
    brevoBody.textContent = text;
  }

  // CCI (BCC) — chaque destinataire ne voit pas les autres
  if (bcc && bcc.length > 0) {
    brevoBody.bcc = bcc.map((email) => ({ email }));
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

  console.log(`[EMAIL][BREVO] Envoi a ${recipientEmails.join(', ')} - sujet: ${subject}`);

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

  const recipientEmails = parseRecipients(to);
  if (recipientEmails.length === 0) {
    throw new Error(`Adresse email destinataire invalide : "${to}"`);
  }

  // L'API Abacus n'accepte qu'un seul destinataire par appel : on envoie un appel par adresse.
  const results = [];
  for (const recipientEmail of recipientEmails) {
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

    results.push(await response.json());
  }

  return results.length === 1 ? results[0] : results;
}

// ---------------------------------------------------------------------------
// Provider : SMTP (nodemailer)
// ---------------------------------------------------------------------------

async function sendWithSmtp({ to, subject, html, text, attachments, bcc }) {
  const recipientEmails = parseRecipients(to);
  if (recipientEmails.length === 0) {
    throw new Error(`Adresse email destinataire invalide : "${to}"`);
  }

  const mailOptions = {
    from: `"${config.email.fromName}" <${config.email.fromEmail}>`,
    to: recipientEmails.join(', '),
    subject,
    html,
    text,
  };

  if (bcc && bcc.length > 0) {
    mailOptions.bcc = bcc.join(',');
  }

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
 * principal echoue. `excludeProvider` ne doit JAMAIS être retenté ici : si le
 * provider principal a déjà échoué (ou si l'appel a levé une erreur alors que
 * l'email était en réalité parti côté fournisseur, ex. timeout réseau en lisant
 * la réponse), le retenter en "fallback" envoie le même email une deuxième fois
 * au même destinataire — c'était la cause des envois en double du mailing.
 *
 * Basculer vers un AUTRE provider n'élimine pas ce risque (le provider principal
 * peut très bien avoir délivré le mail malgré l'erreur locale). Les appelants
 * pour qui un doublon serait plus grave qu'un échec silencieux (ex. mailing en
 * masse) doivent donc passer `allowFallback: false` dans le payload : on ne
 * retente alors aucun autre provider, on remonte simplement l'erreur d'origine.
 */
async function sendWithFallback(payload, originalError, excludeProvider = null) {
  if (payload.allowFallback === false) {
    throw originalError;
  }

  // Essayer Brevo API en fallback si configure (sauf si c'était déjà le provider principal)
  if (excludeProvider !== 'BREVO' && isBrevoConfigured()) {
    try {
      console.warn('[EMAIL] Tentative fallback via Brevo API...');
      return await sendWithBrevo(payload);
    } catch (brevoErr) {
      console.warn('[EMAIL] Fallback Brevo echoue:', brevoErr.message);
    }
  }

  // Essayer SMTP en fallback si configure (sauf si c'était déjà le provider principal)
  if (excludeProvider !== 'SMTP' && isSmtpConfigured()) {
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
        return await sendWithFallback(payload, error, 'BREVO');
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
        return await sendWithFallback(payload, error, 'ABACUS');
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

// Les logos sont référencés par URL publique (servis en statique par le frontend,
// cf. frontend/public/) et non plus embarqués en base64 dans le HTML : les images
// data: URI gonflent le message au point de dépasser le seuil de troncature de
// Gmail (~102 Ko, "Voir la totalité du message") et sont mal supportées par de
// nombreux clients mail (Outlook en particulier).
function getEmailLogoUrls() {
  const base = (config.frontendUrl || '').replace(/\/$/, '');
  return {
    logoUrl: `${base}/amc_logo.png`,
    partnerLogoUrl: `${base}/amc_logo_partner.png`,
  };
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

async function sendVolunteerInvitationEmail(user, token) {
  const setPasswordUrl = `${config.frontendUrl}/reset-password?token=${token}`;
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Un compte benevole a ete cree pour vous sur le portail AMC &amp; PARTAGE.</p>
    <p>Cliquez sur le bouton ci-dessous pour choisir votre mot de passe et acceder a votre espace :</p>
    <p style="text-align:center;">
      <a href="${setPasswordUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;background:#213B88;border-radius:8px;text-decoration:none;font-weight:bold;">Definir mon mot de passe</a>
    </p>
    <p style="font-size:14px;color:#64748b;">Ou copiez-collez ce lien dans votre navigateur :<br/><span style="word-break:break-all;">${setPasswordUrl}</span></p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Votre compte benevole a ete cree',
    html: renderEmailHtml({ title: 'Bienvenue au Pole Benevoles', subtitle: 'Definissez votre mot de passe pour commencer', contentHtml }),
  });
}

async function sendAccountInvitationEmail(user, token) {
  const setPasswordUrl = `${config.frontendUrl}/reset-password?token=${token}`;
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Un compte a ete cree pour vous sur le portail AMC &amp; PARTAGE.</p>
    <p>Cliquez sur le bouton ci-dessous pour choisir votre mot de passe et acceder a votre espace :</p>
    <p style="text-align:center;">
      <a href="${setPasswordUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;background:#213B88;border-radius:8px;text-decoration:none;font-weight:bold;">Definir mon mot de passe</a>
    </p>
    <p style="font-size:14px;color:#64748b;">Ou copiez-collez ce lien dans votre navigateur :<br/><span style="word-break:break-all;">${setPasswordUrl}</span></p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Votre compte a ete cree',
    html: renderEmailHtml({ title: 'Bienvenue sur le portail AMC & PARTAGE', subtitle: 'Definissez votre mot de passe pour commencer', contentHtml }),
  });
}

async function sendEmployeeRoleAddedEmail(user) {
  const loginUrl = `${config.frontendUrl}/login`;
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>L'acces a l'espace Salarie (RH) a ete ajoute a votre compte AMC &amp; PARTAGE existant.</p>
    <p>Vous pouvez continuer a utiliser votre compte avec votre mot de passe habituel, et retrouver desormais vos fiches de paie depuis le menu apres connexion.</p>
    <p style="text-align:center;"><a href="${loginUrl}" style="display:inline-block;padding:10px 18px;background:#213B88;color:#fff;border-radius:6px;text-decoration:none;">Se connecter</a></p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Acces espace Salarie ajoute a votre compte',
    html: renderEmailHtml({ title: 'Nouvel acces ajoute', subtitle: 'Ressources Humaines', contentHtml }),
  });
}

async function sendVolunteerRoleAddedEmail(user) {
  const loginUrl = `${config.frontendUrl}/login`;
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>L'acces au Pole Benevoles a ete ajoute a votre compte AMC &amp; PARTAGE existant.</p>
    <p>Vous pouvez continuer a utiliser votre compte avec votre mot de passe habituel, et retrouver desormais votre espace benevole depuis le menu apres connexion.</p>
    <p style="text-align:center;"><a href="${loginUrl}" style="display:inline-block;padding:10px 18px;background:#213B88;color:#fff;border-radius:6px;text-decoration:none;">Se connecter</a></p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Acces Pole Benevoles ajoute a votre compte',
    html: renderEmailHtml({ title: 'Nouvel acces ajoute', subtitle: 'Pole Benevoles', contentHtml }),
  });
}

async function sendRoleRequestApprovedEmail(user, roleLabel) {
  const loginUrl = `${config.frontendUrl}/login`;
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Votre demande d'ajout du role <strong>${roleLabel}</strong> a ete validee.</p>
    <p>Vous pouvez continuer a utiliser votre compte avec votre mot de passe habituel, et retrouver ce nouvel espace depuis le menu apres connexion.</p>
    <p style="text-align:center;"><a href="${loginUrl}" style="display:inline-block;padding:10px 18px;background:#213B88;color:#fff;border-radius:6px;text-decoration:none;">Se connecter</a></p>
  `;

  return sendMail({
    to: user.email,
    subject: `AMC — Votre demande de role ${roleLabel} a ete validee`,
    html: renderEmailHtml({ title: 'Nouvel acces ajoute', subtitle: roleLabel, contentHtml }),
  });
}

async function sendRoleRequestRejectedEmail(user, roleLabel, reason) {
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>Votre demande d'ajout du role <strong>${roleLabel}</strong> n'a pas ete validee.</p>
    ${reason ? `<p><strong>Motif:</strong> ${reason}</p>` : ''}
  `;

  return sendMail({
    to: user.email,
    subject: `AMC — Votre demande de role ${roleLabel}`,
    html: renderEmailHtml({ title: 'Demande de role', subtitle: 'Statut: refusee', contentHtml }),
  });
}

async function sendOperatorRoleAddedEmail(user) {
  const loginUrl = `${config.frontendUrl}/login`;
  const contentHtml = `
    <p>Bonjour ${user.firstName},</p>
    <p>L'acces au Pole Social (Operateur) a ete ajoute a votre compte AMC &amp; PARTAGE existant.</p>
    <p>Vous pouvez continuer a utiliser votre compte avec votre mot de passe habituel, et retrouver desormais votre espace operateur depuis le menu apres connexion.</p>
    <p style="text-align:center;"><a href="${loginUrl}" style="display:inline-block;padding:10px 18px;background:#213B88;color:#fff;border-radius:6px;text-decoration:none;">Se connecter</a></p>
  `;

  return sendMail({
    to: user.email,
    subject: 'AMC — Acces Pole Social ajoute a votre compte',
    html: renderEmailHtml({ title: 'Nouvel acces ajoute', subtitle: 'Pole Social', contentHtml }),
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
  sendVolunteerInvitationEmail,
  sendVolunteerRoleAddedEmail,
  sendAccountInvitationEmail,
  sendEmployeeRoleAddedEmail,
  sendFamilyRegistrationConfirmationEmail,
  sendChildRegistrationConfirmationEmail,
  sendOfflinePaymentConfirmationEmail,
  sendPaymentValidationEmail,
  sendRoleRequestApprovedEmail,
  sendRoleRequestRejectedEmail,
  sendOperatorRoleAddedEmail,
};
