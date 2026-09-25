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

// Récapitulatif par classe depuis le début de l'année scolaire jusqu'à aujourd'hui :
// absences enregistrées, absences/déclarations en attente de validation, devoirs
// publiés. Agrégé en mémoire (pas de groupBy sur un champ de relation en Prisma).
async function computeClassesRecap(classIds) {
  if (!classIds || classIds.length === 0) return [];

  const [classes, evaluations, homeworkCounts] = await Promise.all([
    prisma.class.findMany({
      where: { id: { in: classIds } },
      include: { level: { include: { pole: true } } },
    }),
    prisma.evaluation.findMany({
      where: { lesson: { classId: { in: classIds } } },
      select: { status: true, justificationStatus: true, lesson: { select: { classId: true } } },
    }),
    prisma.homeworkMessage.groupBy({
      by: ['classId'],
      where: { classId: { in: classIds } },
      _count: { id: true },
    }),
  ]);

  const homeworkByClass = new Map(homeworkCounts.map((row) => [row.classId, row._count.id]));

  const statsByClass = new Map(classIds.map((id) => [id, { absences: 0, pendingJustifications: 0 }]));
  evaluations.forEach((evaluation) => {
    const stat = statsByClass.get(evaluation.lesson.classId);
    if (!stat) return;
    if (evaluation.status === 'missing') stat.absences += 1;
    if (evaluation.justificationStatus === 'PENDING') stat.pendingJustifications += 1;
  });

  return classes
    .map((cls) => {
      const stat = statsByClass.get(cls.id) || { absences: 0, pendingJustifications: 0 };
      return {
        classId: cls.id,
        poleName: cls.level?.pole?.name || 'Pôle',
        levelName: cls.level?.name || 'Classe',
        schedule: [cls.dayOfWeek, cls.startTime, cls.endTime].filter(Boolean).join(' '),
        absences: stat.absences,
        pendingJustifications: stat.pendingJustifications,
        homeworkCount: homeworkByClass.get(cls.id) || 0,
      };
    })
    .sort((a, b) => a.poleName.localeCompare(b.poleName, 'fr') || a.levelName.localeCompare(b.levelName, 'fr'));
}

function buildRecapTableHtml(rows) {
  const tableRows = rows.map((row) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${row.levelName}${row.schedule ? ` <span style="color:#64748b;font-size:12px;">(${row.schedule})</span>` : ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${row.absences}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;${row.pendingJustifications > 0 ? 'font-weight:bold;color:#b45309;' : ''}">${row.pendingJustifications}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${row.homeworkCount}</td>
    </tr>
  `).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">
      <thead>
        <tr>
          <th style="padding:8px 10px;background:#${RECAP_COLOR};color:#fff;text-align:left;font-size:13px;">Classe</th>
          <th style="padding:8px 10px;background:#${RECAP_COLOR};color:#fff;text-align:center;font-size:13px;">Absences</th>
          <th style="padding:8px 10px;background:#${RECAP_COLOR};color:#fff;text-align:center;font-size:13px;">À valider</th>
          <th style="padding:8px 10px;background:#${RECAP_COLOR};color:#fff;text-align:center;font-size:13px;">Devoirs transmis</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;
}

// Construit le contenu HTML complet du mail : un tableau par pôle (une seule
// section pour un responsable de pôle, plusieurs pour la vue admin) — réutilise
// renderMailHtml (mailService.js) pour le rendu final (logo, en-tête colorée, pied).
function buildRecapEmailContent({ recipientLabel, rows, asOfLabel }) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row.poleName)) groups.set(row.poleName, []);
    groups.get(row.poleName).push(row);
  });

  const sectionsHtml = Array.from(groups.entries()).map(([poleName, poleRows]) => `
    <h3 style="margin:22px 0 4px;color:#${RECAP_COLOR};font-size:15px;">${poleName}</h3>
    ${buildRecapTableHtml(poleRows)}
  `).join('');

  const totalAbsences = rows.reduce((sum, r) => sum + r.absences, 0);
  const totalPending = rows.reduce((sum, r) => sum + r.pendingJustifications, 0);
  const totalHomework = rows.reduce((sum, r) => sum + r.homeworkCount, 0);

  return `
    <p>Bonjour ${recipientLabel},</p>
    <p>Voici le récapitulatif hebdomadaire, cumulé depuis le début de l'année scolaire jusqu'au <strong>${asOfLabel}</strong> :</p>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin:14px 0;">
      <div style="background:#eff6ff;border-left:4px solid #${RECAP_COLOR};padding:10px 16px;border-radius:8px;">
        <div style="font-size:22px;font-weight:bold;color:#${RECAP_COLOR};">${totalAbsences}</div>
        <div style="font-size:12px;color:#64748b;">Absences</div>
      </div>
      <div style="background:#fffbeb;border-left:4px solid #b45309;padding:10px 16px;border-radius:8px;">
        <div style="font-size:22px;font-weight:bold;color:#b45309;">${totalPending}</div>
        <div style="font-size:12px;color:#64748b;">À valider</div>
      </div>
      <div style="background:#f0fdf4;border-left:4px solid #15803d;padding:10px 16px;border-radius:8px;">
        <div style="font-size:22px;font-weight:bold;color:#15803d;">${totalHomework}</div>
        <div style="font-size:12px;color:#64748b;">Devoirs transmis</div>
      </div>
    </div>
    ${rows.length === 0 ? '<p style="color:#64748b;">Aucune classe à afficher.</p>' : sectionsHtml}
    <p style="margin-top:20px;color:#64748b;font-size:12px;">Ce récapitulatif est envoyé automatiquement chaque lundi matin.</p>
  `;
}

async function sendRecapEmail({ to, recipientLabel, classIds, subject }) {
  const rows = await computeClassesRecap(classIds);
  const asOfLabel = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const content = buildRecapEmailContent({ recipientLabel, rows, asOfLabel });

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
        subject: `AMC — Récapitulatif hebdomadaire — Pôle ${poleName}`,
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
        subject: 'AMC — Récapitulatif hebdomadaire — Tous pôles',
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
  computeClassesRecap,
  sendRecapEmail,
  sendWeeklyRecapEmails,
  checkAndSendWeeklyRecap,
  startWeeklyRecapScheduler,
};
