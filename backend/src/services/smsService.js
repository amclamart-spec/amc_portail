const { BrevoClient } = require('@getbrevo/brevo');
const config = require('../config');

const SMS_SENDER = process.env.BREVO_SMS_SENDER || config.sms?.sender || 'AMC';

function normalizeFrenchPhone(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const p = raw.replace(/[\s\-.()+]/g, '');
  if (p.startsWith('0033')) return p.slice(2);      // 0033... → 33...
  if (p.startsWith('+33')) return p.slice(1);        // +33... → 33...  (already stripped above but safe)
  if (p.startsWith('33') && p.length >= 11) return p; // already E.164 without +
  if (p.startsWith('0') && p.length === 10) return '33' + p.slice(1); // 06... → 336...
  return null;
}

async function sendSms(phone, content) {
  const apiKey = config.brevoEmail.apiKey;
  if (!apiKey) {
    console.warn('[SMS] BREVO_API_KEY manquante — SMS non envoye');
    return null;
  }

  const recipient = normalizeFrenchPhone(phone);
  if (!recipient) {
    console.warn(`[SMS] Numero de telephone invalide : "${phone}" — SMS non envoye`);
    return null;
  }

  try {
    const client = new BrevoClient({ apiKey });
    const result = await client.transactionalSms.sendTransacSms({
      sender: SMS_SENDER,
      recipient,
      content,
      type: 'transactional',
    });
    const body = result?.data ?? result;
    console.log(`[SMS] Envoye a +${recipient} | messageId: ${body?.messageId ?? 'N/A'} | remainingCredits: ${body?.remainingCredits ?? 'N/A'}`);
    return body;
  } catch (err) {
    const details = err?.body ?? err?.response?.data ?? err?.message ?? err;
    console.error(`[SMS] Erreur envoi a +${recipient} :`, JSON.stringify(details));
    return null;
  }
}

async function sendEnrollmentConfirmedSms(phone, studentFirstName, className, schoolYearLabel) {
  const content = `AMC - Bonne nouvelle ! L'inscription de ${studentFirstName} en ${className} (${schoolYearLabel}) a ete confirmee. Pour toute question, contactez le secretariat.`;
  return sendSms(phone, content);
}

async function sendEnrollmentCancelledSms(phone, studentFirstName, className, reason) {
  const motif = reason ? ` Motif : ${reason}.` : '';
  const content = `AMC - L'inscription de ${studentFirstName} en ${className} a ete annulee.${motif} Pour toute question, contactez le secretariat.`;
  return sendSms(phone, content);
}

async function sendPasswordResetSms(phone, resetLink) {
  const content = `AMC - Reinitialisation de mot de passe. Cliquez sur ce lien (valable 1h) : ${resetLink}`;
  return sendSms(phone, content);
}

module.exports = {
  sendSms,
  sendEnrollmentConfirmedSms,
  sendEnrollmentCancelledSms,
  sendPasswordResetSms,
};
