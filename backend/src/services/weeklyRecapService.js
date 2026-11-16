const { PrismaClient } = require('@prisma/client');
const { sendMail } = require('./emailService');
const { renderMailHtml } = require('./mailService');
const { getAppSetting, setAppSetting } = require('./systemService');
const { POLE_MANAGER_ROLES, POLE_ROLE_TO_NAME } = require('../middleware/poleManagerDelegation');

const prisma = new PrismaClient();

const WEEKLY_RECAP_LAST_SENT_KEY = 'WEEKLY_RECAP_LAST_SENT_WEEK';
const RECAP_COLOR = '213B88';

// Clé de semaine (date du lundi, YYYY-MM-DD) — sert à ne déclencher l'envoi qu'une
// seule fois par semaine même si le scheduler est vérifié plusieurs fois pendant
// la fenêtre "lundi matin".
function getMondayKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=dimanche .. 6=samedi
  const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

const COLORS = {
  justified: '15803d',
  unjustified: 'dc2626',
  late: 'd97706',
  homework: '0f766e',
  muted: '64748b',
  border: 'e2e8f0',
};

const MAX_LIST_ROWS = 40;

const JUSTIFICATION_LABELS = {
  VALIDATED: { label: 'Justifiée', color: COLORS.justified },
  PENDING: { label: 'Justificatif à valider', color: 'b45309' },
  REJECTED: { label: 'Justificatif refusé', color: COLORS.unjustified },
  NONE: { label: 'Non justifiée', color: COLORS.unjustified },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(date, options = { day: '2-digit', month: 'short' }) {
  return new Date(date).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', ...options });
}

// Semaine écoulée : du lundi 00:00 de la semaine précédente au lundi 00:00 courant (exclu).
function getPreviousWeekRange(now = new Date()) {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() - ((end.getDay() + 6) % 7));
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end };
}

function formatWeekLabel({ start, end }) {
  const lastDay = new Date(end);
  lastDay.setDate(lastDay.getDate() - 1);
  return `du ${fmtDate(start, { weekday: 'long', day: 'numeric', month: 'long' })} au ${fmtDate(lastDay, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
}

// Compte rendu de la semaine écoulée, regroupé par pôle : absences et retards des
// séances de la semaine (avec leur statut de justification), devoirs envoyés dans la
// semaine, et agrégats par classe. Agrégé en mémoire (pas de groupBy sur un champ de
// relation en Prisma).
async function computeWeeklyRecap(classIds, { start, end }) {
  if (!classIds || classIds.length === 0) return [];

  const [classes, evaluations, homeworks] = await Promise.all([
    prisma.class.findMany({
      where: { id: { in: classIds } },
      include: { level: { include: { pole: true } } },
    }),
    prisma.evaluation.findMany({
      where: {
        status: { in: ['missing', 'late'] },
        lesson: { classId: { in: classIds }, date: { gte: start, lt: end } },
      },
      select: {
        status: true,
        justificationStatus: true,
        declaredInAdvance: true,
        student: { select: { firstName: true, lastName: true } },
        lesson: { select: { classId: true, date: true } },
      },
      orderBy: [{ lesson: { date: 'asc' } }],
    }),
    // Sans attachmentData : seul l'indicateur de pièce jointe est utile ici.
    prisma.homeworkMessage.findMany({
      where: { classId: { in: classIds }, createdAt: { gte: start, lt: end } },
      select: { classId: true, date: true, body: true, attachmentMimeType: true, attachmentUrl: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const classInfo = new Map(classes.map((cls) => [cls.id, {
    classId: cls.id,
    poleName: cls.level?.pole?.name || 'Pôle',
    levelName: cls.level?.name || 'Classe',
    schedule: [cls.dayOfWeek, cls.startTime, cls.endTime].filter(Boolean).join(' '),
    absences: 0,
    absencesJustified: 0,
    lates: 0,
    pendingJustifications: 0,
    homeworkCount: 0,
  }]));

  const poles = new Map();
  const getPole = (poleName) => {
    if (!poles.has(poleName)) poles.set(poleName, { poleName, classes: [], absences: [], homeworks: [] });
    return poles.get(poleName);
  };
  classInfo.forEach((info) => getPole(info.poleName).classes.push(info));

  evaluations.forEach((evaluation) => {
    const info = classInfo.get(evaluation.lesson.classId);
    if (!info) return;
    if (evaluation.status === 'missing') {
      info.absences += 1;
      if (evaluation.justificationStatus === 'VALIDATED') info.absencesJustified += 1;
    } else {
      info.lates += 1;
    }
    if (evaluation.justificationStatus === 'PENDING') info.pendingJustifications += 1;
    getPole(info.poleName).absences.push({
      date: evaluation.lesson.date,
      studentName: `${evaluation.student.firstName} ${evaluation.student.lastName}`,
      classLabel: info.levelName,
      isLate: evaluation.status === 'late',
      justificationStatus: evaluation.justificationStatus,
      declaredInAdvance: evaluation.declaredInAdvance,
    });
  });

  homeworks.forEach((homework) => {
    const info = classInfo.get(homework.classId);
    if (!info) return;
    info.homeworkCount += 1;
    getPole(info.poleName).homeworks.push({
      date: homework.date,
      classLabel: info.levelName,
      body: homework.body,
      hasAttachment: Boolean(homework.attachmentMimeType || homework.attachmentUrl),
    });
  });

  return Array.from(poles.values())
    .map((pole) => {
      pole.classes.sort((a, b) => a.levelName.localeCompare(b.levelName, 'fr'));
      pole.kpi = {
        absences: pole.classes.reduce((sum, c) => sum + c.absences, 0),
        absencesJustified: pole.classes.reduce((sum, c) => sum + c.absencesJustified, 0),
        lates: pole.classes.reduce((sum, c) => sum + c.lates, 0),
        pendingJustifications: pole.classes.reduce((sum, c) => sum + c.pendingJustifications, 0),
        homeworks: pole.homeworks.length,
        classesWithoutHomework: pole.classes.filter((c) => c.homeworkCount === 0).length,
      };
      return pole;
    })
    .sort((a, b) => a.poleName.localeCompare(b.poleName, 'fr'));
}

/* ─── rendu HTML (tableaux uniquement : flex, SVG et JS sont ignorés par Outlook/Gmail) ─── */

function kpiCell({ value, label, sub, color }) {
  return `
    <td width="33%" valign="top" style="padding:4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#f8fafc;border:1px solid #${COLORS.border};border-top:4px solid #${color};border-radius:8px;">
        <tr><td style="padding:12px 8px;text-align:center;">
          <div style="font-size:28px;font-weight:bold;line-height:1.1;color:#${color};">${value}</div>
          <div style="font-size:11px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:#334155;margin-top:4px;">${label}</div>
          ${sub ? `<div style="font-size:11px;color:#${COLORS.muted};margin-top:3px;">${sub}</div>` : ''}
        </td></tr>
      </table>
    </td>`;
}

function plural(count, word) {
  return `${count} ${word}${count > 1 ? 's' : ''}`;
}

function buildKpiRowHtml(kpi) {
  const unjustified = kpi.absences - kpi.absencesJustified;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 10px;">
      <tr>
        ${kpiCell({
          value: kpi.absences,
          label: 'Absences déclarées',
          sub: kpi.absences > 0 ? `${plural(kpi.absencesJustified, 'justifiée')} · ${plural(unjustified, 'non justifiée')}` : '',
          color: COLORS.unjustified,
        })}
        ${kpiCell({ value: kpi.lates, label: 'Retards', color: COLORS.late })}
        ${kpiCell({
          value: kpi.homeworks,
          label: 'Devoirs envoyés',
          sub: kpi.classesWithoutHomework > 0 ? `${plural(kpi.classesWithoutHomework, 'classe')} sans devoir` : '',
          color: COLORS.homework,
        })}
      </tr>
    </table>`;
}

// Barre horizontale composée de segments [{ value, color }], proportionnelle à `max`.
function barHtml(segments, max) {
  const visible = segments.filter((s) => s.value > 0);
  const cells = visible
    .map((s) => `<td width="${Math.max(1, Math.round((s.value / max) * 100))}%" style="background:#${s.color};height:10px;font-size:0;line-height:0;">&nbsp;</td>`)
    .join('');
  const used = visible.reduce((sum, s) => sum + Math.max(1, Math.round((s.value / max) * 100)), 0);
  const rest = 100 - used;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>${cells}${rest > 0 ? `<td width="${rest}%" style="background:#f1f5f9;height:10px;font-size:0;line-height:0;">&nbsp;</td>` : ''}</tr>
    </table>`;
}

const BAR_GAP = '<div style="height:3px;font-size:0;line-height:0;">&nbsp;</div>';

function legendHtml(items) {
  return `<div style="font-size:11px;color:#${COLORS.muted};margin:2px 0 8px;">${items
    .map(([color, label]) => `<span style="display:inline-block;width:10px;height:10px;background:#${color};border-radius:2px;vertical-align:middle;"></span>&nbsp;${label}`)
    .join('&nbsp;&nbsp;&nbsp;')}</div>`;
}

function sectionTitle(text) {
  return `<div style="margin:18px 0 6px;font-size:13px;font-weight:bold;color:#334155;border-bottom:1px solid #${COLORS.border};padding-bottom:4px;">${text}</div>`;
}

function buildClassChartHtml(classes) {
  if (classes.every((c) => c.absences === 0 && c.lates === 0)) {
    return `<p style="font-size:13px;color:#${COLORS.justified};margin:4px 0;">✓ Aucune absence ni aucun retard cette semaine.</p>`;
  }
  const max = Math.max(1, ...classes.map((c) => Math.max(c.absences, c.lates)));
  const rows = classes.map((c) => `
    <tr>
      <td width="34%" style="padding:5px 8px 5px 0;font-size:12px;color:#1f2937;vertical-align:middle;">${escapeHtml(c.levelName)}</td>
      <td style="padding:5px 0;vertical-align:middle;">
        ${barHtml([{ value: c.absencesJustified, color: COLORS.justified }, { value: c.absences - c.absencesJustified, color: COLORS.unjustified }], max)}
        ${BAR_GAP}
        ${barHtml([{ value: c.lates, color: COLORS.late }], max)}
      </td>
      <td width="16%" style="padding:5px 0 5px 8px;font-size:11px;color:#${COLORS.muted};text-align:right;vertical-align:middle;white-space:nowrap;">${c.absences} abs.<br/>${c.lates} ret.</td>
    </tr>`).join('');
  return `
    ${legendHtml([[COLORS.justified, 'Absence justifiée'], [COLORS.unjustified, 'Absence non justifiée'], [COLORS.late, 'Retard']])}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;
}

function th(label, align = 'left') {
  return `<th style="padding:7px 8px;background:#${RECAP_COLOR};color:#fff;text-align:${align};font-size:12px;">${label}</th>`;
}

function td(content, style = '') {
  return `<td style="padding:6px 8px;border-bottom:1px solid #${COLORS.border};font-size:12px;${style}">${content}</td>`;
}

function buildClassTableHtml(classes) {
  const rows = classes.map((c) => `
    <tr>
      ${td(`${escapeHtml(c.levelName)}${c.schedule ? ` <span style="color:#${COLORS.muted};font-size:11px;">(${escapeHtml(c.schedule)})</span>` : ''}`)}
      ${td(c.absences, 'text-align:center;')}
      ${td(c.absencesJustified, 'text-align:center;')}
      ${td(c.lates, 'text-align:center;')}
      ${td(c.pendingJustifications, `text-align:center;${c.pendingJustifications > 0 ? 'font-weight:bold;color:#b45309;' : ''}`)}
      ${td(c.homeworkCount, `text-align:center;${c.homeworkCount === 0 ? `font-weight:bold;color:#${COLORS.unjustified};` : ''}`)}
    </tr>`).join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr>${th('Classe')}${th('Absences', 'center')}${th('dont justifiées', 'center')}${th('Retards', 'center')}${th('À valider', 'center')}${th('Devoirs', 'center')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function moreRowsHtml(total, colspan, where) {
  if (total <= MAX_LIST_ROWS) return '';
  return `<tr><td colspan="${colspan}" style="padding:6px 8px;font-size:12px;color:#${COLORS.muted};font-style:italic;">… et ${total - MAX_LIST_ROWS} autre(s), à consulter dans ${where}.</td></tr>`;
}

function buildAbsenceListHtml(absences) {
  if (absences.length === 0) return `<p style="font-size:13px;color:#${COLORS.muted};margin:4px 0;">Aucune absence ni aucun retard.</p>`;
  const rows = absences.slice(0, MAX_LIST_ROWS).map((a) => {
    const status = JUSTIFICATION_LABELS[a.justificationStatus] || JUSTIFICATION_LABELS.NONE;
    const type = a.isLate
      ? `<span style="color:#${COLORS.late};font-weight:bold;">Retard</span>`
      : '<span style="font-weight:bold;">Absence</span>';
    return `
      <tr>
        ${td(fmtDate(a.date), 'white-space:nowrap;')}
        ${td(escapeHtml(a.studentName), 'font-weight:bold;')}
        ${td(escapeHtml(a.classLabel))}
        ${td(`${type}${a.declaredInAdvance ? `<br/><span style="font-size:10px;color:#${COLORS.muted};">déclarée à l'avance</span>` : ''}`)}
        ${td(status.label, `color:#${status.color};font-weight:bold;`)}
      </tr>`;
  }).join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr>${th('Date')}${th('Élève')}${th('Classe')}${th('Type')}${th('Justification')}</tr></thead>
      <tbody>${rows}${moreRowsHtml(absences.length, 5, 'le Suivi des absences')}</tbody>
    </table>`;
}

function buildHomeworkListHtml(homeworks) {
  if (homeworks.length === 0) return `<p style="font-size:13px;color:#${COLORS.unjustified};margin:4px 0;">Aucun devoir envoyé cette semaine.</p>`;
  const rows = homeworks.slice(0, MAX_LIST_ROWS).map((h) => {
    const body = String(h.body || '').replace(/\s+/g, ' ').trim();
    const excerpt = body.length > 140 ? `${body.slice(0, 140)}…` : body;
    return `
      <tr>
        ${td(fmtDate(h.date), 'white-space:nowrap;')}
        ${td(escapeHtml(h.classLabel), 'white-space:nowrap;')}
        ${td(`${escapeHtml(excerpt)}${h.hasAttachment ? ' 📎' : ''}`, 'color:#334155;')}
      </tr>`;
  }).join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr>${th('Séance')}${th('Classe')}${th('Devoir')}</tr></thead>
      <tbody>${rows}${moreRowsHtml(homeworks.length, 3, 'le Suivi pédagogique')}</tbody>
    </table>`;
}

// Comparatif entre pôles (vue admin uniquement) : absences, retards, devoirs.
function buildPoleComparisonHtml(poles) {
  const max = Math.max(1, ...poles.map((p) => Math.max(p.kpi.absences, p.kpi.lates, p.kpi.homeworks)));
  const rows = poles.map((p) => `
    <tr>
      <td width="30%" style="padding:6px 8px 6px 0;font-size:12px;font-weight:bold;color:#1f2937;vertical-align:middle;">${escapeHtml(p.poleName)}</td>
      <td style="padding:6px 0;vertical-align:middle;">
        ${barHtml([{ value: p.kpi.absences, color: COLORS.unjustified }], max)}
        ${BAR_GAP}
        ${barHtml([{ value: p.kpi.lates, color: COLORS.late }], max)}
        ${BAR_GAP}
        ${barHtml([{ value: p.kpi.homeworks, color: COLORS.homework }], max)}
      </td>
      <td width="18%" style="padding:6px 0 6px 8px;font-size:11px;color:#${COLORS.muted};text-align:right;vertical-align:middle;white-space:nowrap;">${p.kpi.absences} abs.<br/>${p.kpi.lates} ret.<br/>${p.kpi.homeworks} dev.</td>
    </tr>`).join('');
  return `
    ${sectionTitle('Comparatif par pôle')}
    ${legendHtml([[COLORS.unjustified, 'Absences'], [COLORS.late, 'Retards'], [COLORS.homework, 'Devoirs envoyés']])}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;
}

function buildPoleSectionHtml(pole) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:26px;">
      <tr><td style="background:#${RECAP_COLOR};color:#fff;padding:9px 12px;border-radius:6px;font-size:16px;font-weight:bold;">Pôle ${escapeHtml(pole.poleName)}</td></tr>
    </table>
    ${buildKpiRowHtml(pole.kpi)}
    ${pole.kpi.pendingJustifications > 0 ? `<p style="margin:0 0 6px;font-size:13px;color:#b45309;">⚠️ <strong>${pole.kpi.pendingJustifications}</strong> justificatif(s) de la semaine en attente de validation.</p>` : ''}
    ${sectionTitle('Absences et retards par classe')}
    ${buildClassChartHtml(pole.classes)}
    ${sectionTitle('Synthèse par classe')}
    ${buildClassTableHtml(pole.classes)}
    ${sectionTitle(`Liste des absences et retards (${pole.absences.length})`)}
    ${buildAbsenceListHtml(pole.absences)}
    ${sectionTitle(`Devoirs envoyés (${pole.homeworks.length})`)}
    ${buildHomeworkListHtml(pole.homeworks)}
  `;
}

// Contenu HTML complet du mail : une section par pôle (une seule pour un responsable
// de pôle ; toutes pour la vue admin, précédées d'un comparatif) — réutilise
// renderMailHtml (mailService.js) pour le rendu final (logo, en-tête colorée, pied).
function buildRecapEmailContent({ recipientLabel, poles, weekLabel }) {
  return `
    <p>Bonjour ${escapeHtml(recipientLabel)},</p>
    <p>Voici le compte rendu de la semaine écoulée, <strong>${weekLabel}</strong>.</p>
    ${poles.length === 0 ? `<p style="color:#${COLORS.muted};">Aucune classe à afficher.</p>` : ''}
    ${poles.length > 1 ? buildPoleComparisonHtml(poles) : ''}
    ${poles.map(buildPoleSectionHtml).join('')}
    <p style="margin-top:24px;color:#${COLORS.muted};font-size:12px;">Absences et retards : séances de la semaine. Devoirs : devoirs envoyés aux familles pendant la semaine. Ce compte rendu est envoyé automatiquement chaque lundi matin.</p>
  `;
}

async function sendRecapEmail({ to, recipientLabel, classIds, subject, now = new Date() }) {
  const range = getPreviousWeekRange(now);
  const poles = await computeWeeklyRecap(classIds, range);
  const content = buildRecapEmailContent({ recipientLabel, poles, weekLabel: formatWeekLabel(range) });

  await sendMail({
    to,
    subject,
    html: renderMailHtml({ subject, content }),
  });
}

async function getCurrentSchoolYearClassIds(where = {}) {
  const classes = await prisma.class.findMany({
    where: { ...where, schoolYear: { isCurrent: true } },
    select: { id: true },
  });
  return classes.map((c) => c.id);
}

// Un mail par responsable de pôle, scopé aux classes de son propre pôle.
async function sendPoleManagerRecaps() {
  const poleManagers = await prisma.user.findMany({
    where: { role: { in: POLE_MANAGER_ROLES }, isActive: true, validationStatus: 'APPROVED' },
  });

  for (const manager of poleManagers) {
    const poleName = POLE_ROLE_TO_NAME[manager.role];
    if (!poleName) continue;

    const pole = await prisma.pole.findFirst({ where: { name: { equals: poleName, mode: 'insensitive' } } });
    if (!pole) continue;

    const classIds = await getCurrentSchoolYearClassIds({ level: { poleId: pole.id } });
    if (classIds.length === 0) continue;

    try {
      await sendRecapEmail({
        to: manager.email,
        recipientLabel: `${manager.firstName || ''}`.trim() || 'Responsable de pôle',
        classIds,
        subject: `AMC — Compte rendu hebdomadaire — Pôle ${poleName}`,
      });
    } catch (error) {
      console.error(`[Récap hebdo] Erreur envoi responsable pôle ${poleName} (${manager.email}):`, error.message);
    }
  }
}

// Un mail global aux admins, toutes classes confondues, groupées par pôle.
async function sendAdminRecap() {
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true, validationStatus: 'APPROVED' },
  });
  if (admins.length === 0) return;

  const classIds = await getCurrentSchoolYearClassIds();
  if (classIds.length === 0) return;

  for (const admin of admins) {
    try {
      await sendRecapEmail({
        to: admin.email,
        recipientLabel: `${admin.firstName || ''}`.trim() || 'Administrateur',
        classIds,
        subject: 'AMC — Compte rendu hebdomadaire — Tous pôles',
      });
    } catch (error) {
      console.error(`[Récap hebdo] Erreur envoi admin (${admin.email}):`, error.message);
    }
  }
}

async function sendWeeklyRecapEmails() {
  console.log('[Récap hebdo] Génération et envoi en cours...');
  await sendPoleManagerRecaps();
  await sendAdminRecap();
  console.log('[Récap hebdo] Terminé.');
}

// Vérifie s'il faut envoyer le récap (lundi matin, pas déjà envoyé cette semaine)
// et l'envoie le cas échéant. Appelé au démarrage puis à intervalle régulier.
async function checkAndSendWeeklyRecap() {
  const now = new Date();
  const isMonday = now.getDay() === 1;
  const isMorning = now.getHours() >= 7 && now.getHours() < 12;
  if (!isMonday || !isMorning) return;

  const weekKey = getMondayKey(now);
  const lastSentWeek = await getAppSetting(WEEKLY_RECAP_LAST_SENT_KEY);
  if (lastSentWeek === weekKey) return;

  await sendWeeklyRecapEmails();
  await setAppSetting(WEEKLY_RECAP_LAST_SENT_KEY, weekKey);
}

// Démarre la vérification périodique (toutes les 15 minutes) — suffisant pour
// déclencher l'envoi dans la fenêtre "lundi matin" sans dépendre d'un cron externe.
function startWeeklyRecapScheduler() {
  checkAndSendWeeklyRecap().catch((err) => {
    console.error('[Récap hebdo] Erreur au démarrage du scheduler:', err);
  });

  setInterval(() => {
    checkAndSendWeeklyRecap().catch((err) => {
      console.error('[Récap hebdo] Erreur dans le scheduler récurrent:', err);
    });
  }, 15 * 60 * 1000);
}

module.exports = {
  computeWeeklyRecap,
  buildRecapEmailContent,
  getPreviousWeekRange,
  sendRecapEmail,
  sendWeeklyRecapEmails,
  checkAndSendWeeklyRecap,
  startWeeklyRecapScheduler,
};
