const path = require('path');
const { PrismaClient } = require('@prisma/client');
const config = require('../config');
const { saveBase64File } = require('../utils/fileUtils');
const { classAccessWhere } = require('../utils/classAccessUtils');
const { getFamilyEmailRecipients } = require('../utils/familyEmailUtils');
const { sendMail } = require('./emailService');

const prisma = new PrismaClient();

// Côté équipe pédagogique, un élève est destinataire possible dès que son inscription
// est visible du professeur (PENDING ou CONFIRMED, comme la liste d'appel) ; côté
// famille, le suivi pédagogique n'est visible que pour les inscriptions confirmées.
const STAFF_ENROLLMENT_STATUSES = ['PENDING', 'CONFIRMED'];
const FAMILY_VISIBLE_ENROLLMENT_STATUSES = ['CONFIRMED'];

const MAX_SUBJECT_LENGTH = 150;
const MAX_BODY_LENGTH = 5000;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
// Liste blanche : les fichiers sont servis tels quels sous /uploads, un .html ou
// .svg déposé ici serait exécuté dans le navigateur du destinataire.
const ALLOWED_ATTACHMENT_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.odt', '.ods', '.txt'];

const CLASS_INCLUDE = {
  level: { include: { pole: true } },
  teacher: true,
  classTeachers: { include: { teacher: true } },
};
const STUDENT_SELECT = { id: true, firstName: true, lastName: true };

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function formatClassLabel(cls) {
  if (!cls) return null;
  return [cls.level?.pole?.name, cls.level?.name].filter(Boolean).join(' - ');
}

function fullName(person) {
  return `${person?.firstName || ''} ${person?.lastName || ''}`.trim();
}

function classTeacherNames(cls) {
  const teachers = [cls.teacher, ...(cls.classTeachers || []).map((ct) => ct.teacher)].filter(Boolean);
  return [...new Set(teachers.map(fullName).filter(Boolean))];
}

function validateContent({ subject, body, requireSubject }) {
  const cleanBody = String(body || '').trim();
  const cleanSubject = String(subject || '').trim();
  if (requireSubject && !cleanSubject) throw httpError(400, 'L\'objet du message est requis');
  if (!cleanBody) throw httpError(400, 'Le message ne peut pas être vide');
  if (cleanSubject.length > MAX_SUBJECT_LENGTH) throw httpError(400, `L'objet ne doit pas dépasser ${MAX_SUBJECT_LENGTH} caractères`);
  if (cleanBody.length > MAX_BODY_LENGTH) throw httpError(400, `Le message ne doit pas dépasser ${MAX_BODY_LENGTH} caractères`);
  return { subject: cleanSubject || null, body: cleanBody };
}

function saveAttachment(attachment) {
  if (!attachment || !attachment.base64) return { attachmentUrl: null, attachmentFilename: null };

  const fileName = String(attachment.fileName || '').trim();
  const extension = path.extname(fileName).toLowerCase();
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(extension)) {
    throw httpError(400, 'Type de pièce jointe non autorisé (PDF, image, Word, Excel ou texte)');
  }
  const payload = String(attachment.base64).split(',')[1] || '';
  if (Math.floor((payload.length * 3) / 4) > MAX_ATTACHMENT_BYTES) {
    throw httpError(400, 'La pièce jointe ne doit pas dépasser 5 Mo');
  }

  try {
    const attachmentUrl = saveBase64File(attachment.base64, 'liaison', fileName);
    return { attachmentUrl, attachmentFilename: fileName.slice(0, 200) };
  } catch (error) {
    throw httpError(400, error.message || 'Pièce jointe invalide');
  }
}

/* ─── sérialisation ─────────────────────────────────────────────────────────── */

function threadInclude(viewerUserId, replyWhere) {
  const reads = { where: { userId: viewerUserId }, select: { id: true } };
  return {
    class: { include: { level: { include: { pole: true } } } },
    student: { select: STUDENT_SELECT },
    reads,
    replies: {
      ...(replyWhere ? { where: replyWhere } : {}),
      include: { student: { select: STUDENT_SELECT }, reads },
      orderBy: { createdAt: 'desc' },
    },
  };
}

function serializeMessage(message, viewerUserId, viewerSide) {
  return {
    id: message.id,
    senderType: message.senderType,
    senderName: message.senderName,
    senderLabel: message.senderLabel,
    body: message.body,
    attachmentUrl: message.attachmentUrl,
    attachmentFilename: message.attachmentFilename,
    studentId: message.studentId,
    studentName: message.student ? fullName(message.student) : null,
    createdAt: message.createdAt,
    isMine: message.senderType === viewerSide && message.senderUserId === viewerUserId,
    isUnread: message.senderType !== viewerSide && message.reads.length === 0,
  };
}

// Messages du plus récent au plus ancien : la grille et le fil d'échange affichent
// toujours le dernier message en tête.
function serializeThread(root, viewerUserId, viewerSide) {
  const messages = [...root.replies, root]
    .map((message) => serializeMessage(message, viewerUserId, viewerSide))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const last = messages[0];
  const involvedStudents = new Map();
  messages.forEach((m) => { if (m.studentId) involvedStudents.set(m.studentId, m.studentName); });

  return {
    id: root.id,
    classId: root.classId,
    classLabel: formatClassLabel(root.class),
    subject: root.subject,
    isCollective: !root.studentId,
    studentId: root.studentId,
    studentName: root.student ? fullName(root.student) : null,
    involvedStudents: [...involvedStudents].map(([id, name]) => ({ id, name })),
    startedBy: root.senderType,
    createdAt: root.createdAt,
    lastActivityAt: last.createdAt,
    lastMessage: {
      senderType: last.senderType,
      senderName: last.senderName,
      senderLabel: last.senderLabel,
      body: last.body.length > 160 ? `${last.body.slice(0, 160)}…` : last.body,
    },
    messageCount: messages.length,
    unreadCount: messages.filter((m) => m.isUnread).length,
    hasAttachment: messages.some((m) => m.attachmentUrl),
    awaitingStaffReply: last.senderType === 'FAMILY',
    messages,
  };
}

function sortThreads(threads) {
  return threads.sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));
}

async function markMessagesRead({ messageIds, userId }) {
  if (messageIds.length === 0) return 0;
  const result = await prisma.liaisonMessageRead.createMany({
    data: messageIds.map((messageId) => ({ messageId, userId })),
    skipDuplicates: true,
  });
  return result.count;
}

/* ─── notifications email (best effort, ne bloquent jamais l'envoi du message) ─ */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function messageHtml({ intro, senderName, senderLabel, subject, body, hasAttachment, linkPath }) {
  const excerpt = body.length > 1000 ? `${body.slice(0, 1000)}…` : body;
  const link = `${(config.frontendUrl || '').replace(/\/$/, '')}${linkPath}`;
  return `
    <p>Bonjour,</p>
    <p>${intro}</p>
    <ul>
      <li>De : ${escapeHtml(senderName)} (${escapeHtml(senderLabel)})</li>
      <li>Objet : ${escapeHtml(subject)}</li>
      ${hasAttachment ? '<li>Une pièce jointe est disponible dans le cahier de liaison.</li>' : ''}
    </ul>
    <blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #213B88;background:#f8fafc;">${escapeHtml(excerpt).replace(/\n/g, '<br/>')}</blockquote>
    <p>Pour répondre, connectez-vous au portail : <a href="${link}">${link}</a> (Suivi pédagogique, onglet Cahier de liaison).</p>
    <p>Cordialement,<br/>Administration AMC</p>`;
}

async function notifyFamilies({ classRecord, studentId, subject, senderName, senderLabel, body, hasAttachment }) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      classId: classRecord.id,
      status: { in: FAMILY_VISIBLE_ENROLLMENT_STATUSES },
      ...(studentId ? { studentId } : {}),
    },
    include: { student: { include: { family: { include: { user: true } } } } },
  });

  const byFamily = new Map();
  enrollments.forEach(({ student }) => {
    if (!student.family) return;
    const entry = byFamily.get(student.familyId) || { family: student.family, names: [] };
    entry.names.push(student.firstName);
    byFamily.set(student.familyId, entry);
  });

  const classLabel = formatClassLabel(classRecord);
  await Promise.all([...byFamily.values()].map(async ({ family, names }) => {
    const recipients = getFamilyEmailRecipients(family);
    if (recipients.length === 0) return;
    await sendMail({
      to: recipients,
      subject: `AMC — Cahier de liaison : ${subject}`,
      html: messageHtml({
        intro: `Un nouveau message a été déposé dans le cahier de liaison (${escapeHtml(classLabel)}) concernant ${escapeHtml(names.join(', '))}.`,
        senderName, senderLabel, subject, body, hasAttachment,
        linkPath: '/famille/suivi-pedagogique',
      }),
    });
  }));
}

async function notifyTeachers({ classRecord, student, subject, senderName, senderLabel, body, hasAttachment }) {
  const teachers = [classRecord.teacher, ...(classRecord.classTeachers || []).map((ct) => ct.teacher)].filter(Boolean);
  const recipients = [...new Set(teachers.map((t) => (t.email || '').trim()).filter(Boolean))];
  if (recipients.length === 0) return;
  await sendMail({
    to: recipients,
    subject: `AMC — Cahier de liaison : ${subject}`,
    html: messageHtml({
      intro: `La famille de ${escapeHtml(fullName(student))} (${escapeHtml(formatClassLabel(classRecord))}) vous a écrit dans le cahier de liaison.`,
      senderName, senderLabel, subject, body, hasAttachment,
      linkPath: '/suivi-pedagogique',
    }),
  });
}

function fireAndForget(promise, label) {
  promise.catch((error) => console.error(`Erreur notification cahier de liaison (${label}):`, error.message));
}

/* ─── espace professeur / responsable de pôle / admin ───────────────────────── */

async function getStaffClass({ teacherUserId, classId }) {
  const teacherProfile = await prisma.teacher.findUnique({ where: { userId: teacherUserId } });
  if (!teacherProfile) throw httpError(403, 'Profil professeur introuvable');
  const classRecord = await prisma.class.findFirst({
    where: { id: classId, ...classAccessWhere(teacherProfile.id) },
    include: CLASS_INCLUDE,
  });
  if (!classRecord) throw httpError(403, 'Vous n’avez pas accès à cette classe');
  return classRecord;
}

async function assertStudentsInClass(classId, studentIds) {
  const enrollments = await prisma.enrollment.findMany({
    where: { classId, studentId: { in: studentIds }, status: { in: STAFF_ENROLLMENT_STATUSES } },
    select: { studentId: true },
  });
  const found = new Set(enrollments.map((e) => e.studentId));
  if (studentIds.some((id) => !found.has(id))) throw httpError(400, 'Un des élèves sélectionnés n\'est pas inscrit dans cette classe');
}

async function listStaffThreads({ teacherUserId, viewerUserId, classId }) {
  await getStaffClass({ teacherUserId, classId });
  const roots = await prisma.liaisonMessage.findMany({
    where: { classId, threadId: null },
    include: threadInclude(viewerUserId),
  });
  return sortThreads(roots.map((root) => serializeThread(root, viewerUserId, 'STAFF')));
}

async function createStaffThreads({ teacherUserId, sender, classId, mode, studentIds, subject, body, attachment }) {
  const classRecord = await getStaffClass({ teacherUserId, classId });
  const content = validateContent({ subject, body, requireSubject: true });

  let targets = [null];
  if (mode === 'INDIVIDUAL') {
    targets = [...new Set(Array.isArray(studentIds) ? studentIds.filter(Boolean) : [])];
    if (targets.length === 0) throw httpError(400, 'Sélectionnez au moins un élève destinataire');
    await assertStudentsInClass(classId, targets);
  } else if (mode !== 'COLLECTIVE') {
    throw httpError(400, 'Type de message invalide');
  }

  const files = saveAttachment(attachment);
  // Un message individuel adressé à plusieurs élèves ouvre une conversation privée
  // par élève : chaque famille ne voit que la sienne et y répond séparément.
  const created = await prisma.$transaction(targets.map((studentId) => prisma.liaisonMessage.create({
    data: {
      classId,
      studentId,
      senderUserId: sender.id,
      senderType: 'STAFF',
      senderName: sender.name,
      senderLabel: sender.label,
      subject: content.subject,
      body: content.body,
      ...files,
    },
  })));

  targets.forEach((studentId) => fireAndForget(notifyFamilies({
    classRecord, studentId, subject: content.subject, senderName: sender.name, senderLabel: sender.label,
    body: content.body, hasAttachment: !!files.attachmentUrl,
  }), 'familles'));

  return { count: created.length };
}

async function replyAsStaff({ teacherUserId, sender, classId, threadId, studentId, body, attachment }) {
  const classRecord = await getStaffClass({ teacherUserId, classId });
  const root = await prisma.liaisonMessage.findFirst({ where: { id: threadId, classId, threadId: null } });
  if (!root) throw httpError(404, 'Conversation introuvable');
  const content = validateContent({ body });

  // Conversation individuelle : la réponse reste adressée au même élève. Conversation
  // collective : sans élève ciblé la réponse est visible de toute la classe, sinon
  // seulement de la famille de l'élève choisi.
  const targetStudentId = root.studentId || studentId || null;
  if (!root.studentId && targetStudentId) await assertStudentsInClass(classId, [targetStudentId]);

  const files = saveAttachment(attachment);
  const [reply] = await prisma.$transaction([
    prisma.liaisonMessage.create({
      data: {
        classId,
        studentId: targetStudentId,
        threadId: root.id,
        senderUserId: sender.id,
        senderType: 'STAFF',
        senderName: sender.name,
        senderLabel: sender.label,
        body: content.body,
        ...files,
      },
    }),
    prisma.liaisonMessage.update({ where: { id: root.id }, data: { lastActivityAt: new Date() } }),
  ]);

  fireAndForget(notifyFamilies({
    classRecord, studentId: targetStudentId, subject: `Re : ${root.subject}`, senderName: sender.name,
    senderLabel: sender.label, body: content.body, hasAttachment: !!files.attachmentUrl,
  }), 'familles');

  return { id: reply.id };
}

async function markThreadReadAsStaff({ teacherUserId, viewerUserId, classId, threadId }) {
  await getStaffClass({ teacherUserId, classId });
  const messages = await prisma.liaisonMessage.findMany({
    where: {
      classId,
      OR: [{ id: threadId, threadId: null }, { threadId }],
      senderType: 'FAMILY',
      reads: { none: { userId: viewerUserId } },
    },
    select: { id: true },
  });
  return { marked: await markMessagesRead({ messageIds: messages.map((m) => m.id), userId: viewerUserId }) };
}

/* ─── espace famille ────────────────────────────────────────────────────────── */

async function getFamilyStudentContext({ familyUserId, studentId }) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, family: { userId: familyUserId } },
    include: {
      family: true,
      enrollments: {
        where: { status: { in: FAMILY_VISIBLE_ENROLLMENT_STATUSES } },
        include: { class: { include: CLASS_INCLUDE } },
      },
    },
  });
  if (!student) throw httpError(404, 'Élève introuvable pour cette famille');
  const classIds = student.enrollments.map((e) => e.classId);
  return { student, classIds };
}

// Conversations visibles d'une famille pour un élève : les siennes (individuelles)
// et les messages collectifs des classes où il est inscrit ; sur une conversation
// collective, seules les réponses collectives ou adressées à cet élève.
function familyRootWhere(student, classIds) {
  return {
    threadId: null,
    OR: [{ studentId: student.id }, { studentId: null, classId: { in: classIds } }],
  };
}
function familyReplyWhere(student) {
  return { OR: [{ studentId: null }, { studentId: student.id }] };
}

async function listFamilyThreads({ familyUserId, studentId }) {
  const { student, classIds } = await getFamilyStudentContext({ familyUserId, studentId });
  const roots = await prisma.liaisonMessage.findMany({
    where: familyRootWhere(student, classIds),
    include: threadInclude(familyUserId, familyReplyWhere(student)),
  });

  const contacts = student.enrollments.map((enrollment) => ({
    classId: enrollment.classId,
    classLabel: formatClassLabel(enrollment.class),
    teacherNames: classTeacherNames(enrollment.class),
  }));

  return {
    threads: sortThreads(roots.map((root) => serializeThread(root, familyUserId, 'FAMILY'))),
    contacts,
  };
}

function familySender(familyUser, family) {
  return {
    id: familyUser.id,
    name: fullName(familyUser) || family.familyName,
    label: 'Famille',
  };
}

async function createFamilyThread({ familyUser, studentId, classId, subject, body, attachment }) {
  const { student, classIds } = await getFamilyStudentContext({ familyUserId: familyUser.id, studentId });
  if (!classId || !classIds.includes(classId)) throw httpError(400, 'Ce cours ne fait pas partie des inscriptions de cet élève');
  const content = validateContent({ subject, body, requireSubject: true });
  const classRecord = student.enrollments.find((e) => e.classId === classId).class;
  const sender = familySender(familyUser, student.family);

  const files = saveAttachment(attachment);
  const thread = await prisma.liaisonMessage.create({
    data: {
      classId,
      studentId: student.id,
      senderUserId: sender.id,
      senderType: 'FAMILY',
      senderName: sender.name,
      senderLabel: sender.label,
      subject: content.subject,
      body: content.body,
      ...files,
    },
  });

  fireAndForget(notifyTeachers({
    classRecord, student, subject: content.subject, senderName: sender.name, senderLabel: sender.label,
    body: content.body, hasAttachment: !!files.attachmentUrl,
  }), 'enseignants');

  return { id: thread.id };
}

async function replyAsFamily({ familyUser, studentId, threadId, body, attachment }) {
  const { student, classIds } = await getFamilyStudentContext({ familyUserId: familyUser.id, studentId });
  const root = await prisma.liaisonMessage.findFirst({
    where: { id: threadId, ...familyRootWhere(student, classIds) },
    include: { class: { include: CLASS_INCLUDE } },
  });
  if (!root) throw httpError(404, 'Conversation introuvable');
  const content = validateContent({ body });
  const sender = familySender(familyUser, student.family);

  const files = saveAttachment(attachment);
  const [reply] = await prisma.$transaction([
    prisma.liaisonMessage.create({
      data: {
        classId: root.classId,
        studentId: student.id,
        threadId: root.id,
        senderUserId: sender.id,
        senderType: 'FAMILY',
        senderName: sender.name,
        senderLabel: sender.label,
        body: content.body,
        ...files,
      },
    }),
    prisma.liaisonMessage.update({ where: { id: root.id }, data: { lastActivityAt: new Date() } }),
  ]);

  fireAndForget(notifyTeachers({
    classRecord: root.class, student, subject: `Re : ${root.subject}`, senderName: sender.name,
    senderLabel: sender.label, body: content.body, hasAttachment: !!files.attachmentUrl,
  }), 'enseignants');

  return { id: reply.id };
}

async function markThreadReadAsFamily({ familyUserId, studentId, threadId }) {
  const { student, classIds } = await getFamilyStudentContext({ familyUserId, studentId });
  const root = await prisma.liaisonMessage.findFirst({ where: { id: threadId, ...familyRootWhere(student, classIds) } });
  if (!root) throw httpError(404, 'Conversation introuvable');
  const messages = await prisma.liaisonMessage.findMany({
    where: {
      AND: [
        { OR: [{ id: root.id }, { threadId: root.id, ...familyReplyWhere(student) }] },
        { senderType: 'STAFF', reads: { none: { userId: familyUserId } } },
      ],
    },
    select: { id: true },
  });
  return { marked: await markMessagesRead({ messageIds: messages.map((m) => m.id), userId: familyUserId }) };
}

module.exports = {
  listStaffThreads,
  createStaffThreads,
  replyAsStaff,
  markThreadReadAsStaff,
  listFamilyThreads,
  createFamilyThread,
  replyAsFamily,
  markThreadReadAsFamily,
};
