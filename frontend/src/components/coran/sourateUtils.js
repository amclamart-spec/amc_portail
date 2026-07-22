export const MAX_MUSHAF_PAGE = 604;

export const APPRECIATION_OPTIONS = [
  { value: 'TRES_BIEN', label: 'Très Bien', icon: '🟢', color: '#16A34A', bg: '#F0FDF4' },
  { value: 'BIEN', label: 'Bien', icon: '🟡', color: '#D97706', bg: '#FFFBEB' },
  { value: 'A_REVOIR', label: 'À Revoir', icon: '🔴', color: '#DC2626', bg: '#FEF2F2' },
];

export function appreciationMeta(value) {
  return APPRECIATION_OPTIONS.find((o) => o.value === value) || null;
}

export function isoWeekNumber(date) {
  const d = new Date(Date.UTC(new Date(date).getFullYear(), new Date(date).getMonth(), new Date(date).getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export function fmtDate(d, opts) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', opts || { day: '2-digit', month: 'short', year: 'numeric' });
}

// Retourne les n derniers buckets hebdomadaires (lundi → dimanche), le plus récent
// étant la semaine en cours. Tout est ancré en UTC — cohérent avec la façon dont
// les dates "date-only" (ex: <input type="date">) sont parsées par `new Date(...)`
// (toujours en UTC), ce qui évite un décalage de frontière selon le fuseau du navigateur.
export function lastNWeekBuckets(n) {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const mondayIndex = (todayUTC.getUTCDay() + 6) % 7;
  const mondayThisWeek = new Date(todayUTC);
  mondayThisWeek.setUTCDate(todayUTC.getUTCDate() - mondayIndex);

  const buckets = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const start = new Date(mondayThisWeek);
    start.setUTCDate(mondayThisWeek.getUTCDate() - i * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    buckets.push({ label: `S${isoWeekNumber(start)}`, start, end });
  }
  return buckets;
}

export function isInBucket(date, bucket) {
  if (!date) return false;
  const time = new Date(date).getTime();
  return time >= bucket.start.getTime() && time < bucket.end.getTime() + 86400000;
}

// Indicateurs d'avancement partagés entre le panneau professeur (KPI par onglet)
// et le bulletin Coran (3 périmètres) — une seule formule, pas de duplication.
export function computeCoranKpis({ repetitions, revisions, lectures }) {
  const pagesApprises = repetitions.length;
  const mastered = repetitions.filter((r) => r.compteur >= 30).length;

  const totalRevisionPages = revisions.reduce((sum, r) => sum + (r.pageFin - r.pageDebut + 1), 0);
  let avgRevisionPerWeek = 0;
  if (revisions.length > 0) {
    const dates = revisions.map((r) => new Date(r.date).getTime());
    const earliest = Math.min(...dates);
    const weeksSpan = Math.max(1, Math.ceil((Date.now() - earliest) / (7 * 86400000)) + 1);
    avgRevisionPerWeek = totalRevisionPages / weeksSpan;
  }

  const recitedPages = new Set();
  lectures.forEach((l) => {
    for (let p = l.pageDebut; p <= l.pageFin; p += 1) recitedPages.add(p);
  });
  const pagesRecitees = recitedPages.size;
  const totalLectureMinutes = lectures.reduce((sum, l) => sum + (l.dureeMinutes || 0), 0);

  return {
    pagesApprises,
    pctApprises: Math.round((pagesApprises / MAX_MUSHAF_PAGE) * 100),
    mastered,
    totalRevisions: revisions.length,
    totalRevisionPages,
    avgRevisionPerWeek,
    totalLectureSeances: lectures.length,
    totalLectureMinutes,
    pagesRecitees,
    pctRecitees: Math.round((pagesRecitees / MAX_MUSHAF_PAGE) * 100),
  };
}
