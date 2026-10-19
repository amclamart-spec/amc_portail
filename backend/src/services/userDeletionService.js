const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Suppression définitive d'un compte (espace Super Admin). Les données propres à la
// personne partent en cascade (contraintes ON DELETE CASCADE de la base) : famille,
// parents, enfants, inscriptions, paiements, présences, notes, cahier de liaison,
// profil professeur/salarié/bénévole, messages… En revanche, les enregistrements que
// la personne a produits pour l'association (distributions sociales, événements
// bénévoles, mailings, bulletins de paie déposés…) bloquent la suppression
// (ON DELETE RESTRICT) : les supprimer effacerait l'historique de l'association.
// Dans ce cas, la suppression est refusée et il faut désactiver le compte.

const COUNTED_ENROLLMENT_STATUSES = ['PENDING', 'CONFIRMED'];

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Enregistrements dont l'utilisateur est l'auteur et qui empêchent sa suppression.
const BLOCKERS = [
  { label: 'codes de remboursement générés', count: (id) => prisma.refundSecurityCode.count({ where: { generatedBy: id } }) },
  { label: 'bénéficiaires sociaux créés', count: (id) => prisma.socialBeneficiary.count({ where: { createdBy: id } }) },
  { label: 'dossiers sociaux créés', count: (id) => prisma.socialCase.count({ where: { createdBy: id } }) },
  { label: 'décisions sur dossiers sociaux', count: (id) => prisma.caseDecision.count({ where: { userId: id } }) },
  { label: 'mouvements de stock', count: (id) => prisma.stockMovement.count({ where: { userId: id } }) },
  { label: 'distributions', count: (id) => prisma.distribution.count({ where: { userId: id } }) },
  { label: 'collectes', count: (id) => prisma.socialCollection.count({ where: { userId: id } }) },
  { label: 'achats', count: (id) => prisma.purchase.count({ where: { userId: id } }) },
  { label: 'budgets sociaux', count: (id) => prisma.socialBudget.count({ where: { userId: id } }) },
  { label: 'documents de bénéficiaires déposés', count: (id) => prisma.socialBeneficiaryDocument.count({ where: { uploadedBy: id } }) },
  { label: 'événements bénévoles créés', count: (id) => prisma.volunteerEvent.count({ where: { createdBy: id } }) },
  { label: 'groupes de bénévoles créés', count: (id) => prisma.volunteerGroup.count({ where: { createdBy: id } }) },
  { label: 'bulletins de paie déposés', count: (id) => prisma.payslip.count({ where: { uploadedBy: id } }) },
  { label: 'mailings envoyés', count: (id) => prisma.mailLog.count({ where: { sentById: id } }) },
];

async function loadUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      additionalRoles: { select: { role: true } },
      family: { include: { students: { select: { id: true, firstName: true, lastName: true } } } },
      teacherProfile: { select: { id: true } },
      employeeProfile: { select: { id: true } },
    },
  });
  if (!user) throw httpError(404, 'Utilisateur introuvable');
  return user;
}

async function findBlockers(userId) {
  const counts = await Promise.all(BLOCKERS.map((b) => b.count(userId)));
  return BLOCKERS.map((b, i) => ({ label: b.label, count: counts[i] })).filter((b) => b.count > 0);
}

async function assertDeletable(user, actorId) {
  if (user.id === actorId) throw httpError(400, 'Vous ne pouvez pas supprimer votre propre compte');
  const isSuperAdmin = user.role === 'SUPER_ADMIN' || user.additionalRoles.some((r) => r.role === 'SUPER_ADMIN');
  if (isSuperAdmin) {
    const superAdmins = await prisma.user.count({
      where: { OR: [{ role: 'SUPER_ADMIN' }, { additionalRoles: { some: { role: 'SUPER_ADMIN' } } }] },
    });
    if (superAdmins <= 1) throw httpError(400, 'Impossible de supprimer le dernier Super Admin');
  }
}

// Aperçu affiché dans la fenêtre de confirmation, avant toute suppression.
async function getDeletionImpact({ userId, actorId }) {
  const user = await loadUser(userId);
  const familyId = user.family?.id;
  const studentIds = (user.family?.students || []).map((s) => s.id);
  const teacherId = user.teacherProfile?.id;
  const employeeId = user.employeeProfile?.id;

  const [
    enrollments, payments, paymentsTotal, evaluations, liaisonMessages, chatMessages,
    homeworks, appreciations, classesTaught, payslips, leaveRequests, volunteerParticipations, blockers,
  ] = await Promise.all([
    studentIds.length ? prisma.enrollment.count({ where: { studentId: { in: studentIds } } }) : 0,
    familyId ? prisma.payment.count({ where: { familyId } }) : 0,
    familyId ? prisma.payment.aggregate({ where: { familyId }, _sum: { totalAmount: true } }) : null,
    studentIds.length ? prisma.evaluation.count({ where: { studentId: { in: studentIds } } }) : 0,
    prisma.liaisonMessage.count({ where: { OR: [{ senderUserId: userId }, ...(studentIds.length ? [{ studentId: { in: studentIds } }] : [])] } }),
    prisma.chatMessage.count({ where: { OR: [{ senderId: userId }, { recipientId: userId }] } }),
    teacherId ? prisma.homeworkMessage.count({ where: { teacherId } }) : 0,
    teacherId ? prisma.appreciationReguliere.count({ where: { teacherId } }) : 0,
    teacherId ? prisma.class.count({ where: { teacherId } }) : 0,
    employeeId ? prisma.payslip.count({ where: { employeeId } }) : 0,
    employeeId ? prisma.leaveRequest.count({ where: { employeeId } }) : 0,
    prisma.volunteerEventParticipation.count({ where: { volunteerId: userId } }),
    findBlockers(userId),
  ]);

  let refusal = null;
  try {
    await assertDeletable(user, actorId);
  } catch (error) {
    refusal = error.message;
  }

  const items = [
    user.family && { label: `Famille « ${user.family.familyName} » et ses parents`, count: 1 },
    studentIds.length && { label: `Enfant(s) : ${user.family.students.map((s) => `${s.firstName} ${s.lastName}`).join(', ')}`, count: studentIds.length },
    enrollments && { label: 'Inscription(s)', count: enrollments },
    payments && { label: `Paiement(s) (total ${Number(paymentsTotal?._sum?.totalAmount || 0).toFixed(2)} €) avec échéances, transactions et remboursements`, count: payments },
    evaluations && { label: 'Présences / absences / notes', count: evaluations },
    liaisonMessages && { label: 'Message(s) du cahier de liaison', count: liaisonMessages },
    chatMessages && { label: 'Message(s) de messagerie', count: chatMessages },
    teacherId && { label: 'Profil professeur', count: 1 },
    homeworks && { label: 'Devoir(s) publié(s) pour ses classes', count: homeworks },
    appreciations && { label: 'Appréciation(s) données aux élèves', count: appreciations },
    classesTaught && { label: 'Classe(s) dont il/elle est référent(e) — conservées, sans professeur', count: classesTaught },
    employeeId && { label: 'Profil salarié', count: 1 },
    payslips && { label: 'Bulletin(s) de paie', count: payslips },
    leaveRequests && { label: 'Demande(s) de congé', count: leaveRequests },
    volunteerParticipations && { label: 'Participation(s) bénévole', count: volunteerParticipations },
  ].filter(Boolean);

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: [user.role, ...user.additionalRoles.map((r) => r.role)],
    },
    items,
    blockers,
    canDelete: !refusal && blockers.length === 0,
    refusal,
  };
}

async function deleteUserCompletely({ userId, actorId, confirmEmail }) {
  const user = await loadUser(userId);
  await assertDeletable(user, actorId);
  if (String(confirmEmail || '').trim().toLowerCase() !== user.email.toLowerCase()) {
    throw httpError(400, 'L\'email de confirmation ne correspond pas au compte à supprimer');
  }
  const blockers = await findBlockers(userId);
  if (blockers.length > 0) {
    throw httpError(409, `Suppression impossible : ce compte est l'auteur de ${blockers.map((b) => `${b.count} ${b.label}`).join(', ')}. Désactivez-le plutôt.`);
  }

  const studentIds = (user.family?.students || []).map((s) => s.id);
  const familyId = user.family?.id;

  const [countedEnrollments, payments, liaisonAttachmentRows] = await Promise.all([
    studentIds.length
      ? prisma.enrollment.findMany({
        where: { studentId: { in: studentIds }, status: { in: COUNTED_ENROLLMENT_STATUSES }, isWaitlist: false },
        select: { classId: true },
      })
      : [],
    familyId ? prisma.payment.findMany({ where: { familyId }, select: { metadata: true } }) : [],
    prisma.liaisonMessage.findMany({
      where: { attachmentId: { not: null }, OR: [{ senderUserId: userId }, ...(studentIds.length ? [{ studentId: { in: studentIds } }] : [])] },
      select: { attachmentId: true },
    }),
  ]);

  // Effectifs des classes : une inscription active (hors liste d'attente) compte dans
  // Class.enrolledCount, qui n'est pas recalculé automatiquement.
  const seatsByClass = new Map();
  countedEnrollments.forEach(({ classId }) => seatsByClass.set(classId, (seatsByClass.get(classId) || 0) + 1));
  const ribFileIds = payments.map((p) => p.metadata?.bankDebitRibFileId).filter(Boolean);
  const attachmentIds = [...new Set(liaisonAttachmentRows.map((m) => m.attachmentId))];
  const draftEmails = [user.email, user.family?.emailSecondary].filter(Boolean);

  await prisma.$transaction(async (tx) => {
    for (const [classId, seats] of seatsByClass) {
      const cls = await tx.class.findUnique({ where: { id: classId }, select: { enrolledCount: true, status: true } });
      if (!cls) continue;
      await tx.class.update({
        where: { id: classId },
        data: {
          enrolledCount: Math.max(0, cls.enrolledCount - seats),
          ...(cls.status === 'FULL' ? { status: 'OPEN' } : {}),
        },
      });
    }
    // Champs dénormalisés sans contrainte de clé étrangère.
    await tx.class.updateMany({ where: { teacherUserId: userId }, data: { teacherUserId: null } });
    await tx.enrollmentDraft.deleteMany({ where: { email: { in: draftEmails, mode: 'insensitive' } } });

    await tx.user.delete({ where: { id: userId } });

    // Fichiers stockés en base qui ne sont référencés que par des données supprimées.
    if (ribFileIds.length) await tx.ribFile.deleteMany({ where: { id: { in: ribFileIds } } });
    if (attachmentIds.length) await tx.liaisonAttachment.deleteMany({ where: { id: { in: attachmentIds }, messages: { none: {} } } });
  }, { timeout: 30000 });

  // Pas de table de journal d'activité en base : trace dans les logs serveur.
  console.info('[SUPER_ADMIN] Compte supprimé définitivement', {
    deletedUserId: user.id,
    deletedEmail: user.email,
    deletedName: `${user.firstName} ${user.lastName}`,
    students: studentIds.length,
    actorId,
    at: new Date().toISOString(),
  });

  return { deleted: true };
}

module.exports = { getDeletionImpact, deleteUserCompletely };
