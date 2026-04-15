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

async function sendWithAbacus({ to, subject, html, text }) {
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

async function sendWithSmtp({ to, subject, html, text }) {
  const info = await getTransporter().sendMail({
    from: `"${config.email.fromName}" <${config.email.fromEmail}>`,
    to,
    subject,
    html,
    text,
  });
  return info;
}

async function sendMail(payload) {
  try {
    if (config.email.provider === 'ABACUS') {
      return await sendWithAbacus(payload);
    }
    return await sendWithSmtp(payload);
  } catch (error) {
    console.error('Erreur envoi email:', error.message);
    return null;
  }
}

async function sendVerificationEmail(user, token) {
  const verifyUrl = `${config.frontendUrl}/verify-email?token=${token}`;
  return sendMail({
    to: user.email,
    subject: 'AMC — Vérification de votre adresse email',
    html: `<h2>Bienvenue ${user.firstName}</h2><p>Merci de vous être inscrit sur le portail AMC.</p><p><a href="${verifyUrl}">Vérifier mon email</a></p>`,
  });
}

async function sendEnrollmentConfirmationEmail(user, enrollmentSummary) {
  return sendMail({
    to: user.email,
    subject: 'AMC — Confirmation de votre inscription',
    html: `<h2>Inscription confirmée</h2><p>Bonjour ${user.firstName}, votre inscription a bien été enregistrée.</p><p>${enrollmentSummary || ''}</p>`,
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

module.exports = {
  sendMail,
  sendVerificationEmail,
  sendEnrollmentConfirmationEmail,
  sendPaymentConfirmationEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
};
