// Adresse(s) email d'une famille pour les notifications automatiques (absences,
// mailing, paiements...) : l'email du compte ("principal") et, si renseignée,
// l'adresse secondaire (Family.emailSecondary) — dédupliquées et nettoyées.
function getFamilyEmailRecipients(family) {
  const candidates = [family?.user?.email, family?.emailSecondary];
  const seen = new Set();
  const emails = [];
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(trimmed);
  }
  return emails;
}

module.exports = { getFamilyEmailRecipients };
