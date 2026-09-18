const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { applyNameCasing } = require('../lib/prismaNameMiddleware');
const { saveBase64File } = require('../utils/fileUtils');
const { sendAccountApprovedEmail, sendAccountRejectedEmail, sendVolunteerInvitationEmail, sendVolunteerRoleAddedEmail, sendRoleRequestApprovedEmail, sendRoleRequestRejectedEmail } = require('../services/emailService');
const { PERMISSIONS, hasPermission } = require('../config/permissions');

const prisma = applyNameCasing(new PrismaClient());

const USER_PUBLIC_FIELDS = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  photoUrl: true,
  role: true,
  validationStatus: true,
  isActive: true,
  createdAt: true,
};

function deleteOldPhoto(photoUrl) {
  if (!photoUrl || !photoUrl.startsWith('/uploads/')) return;
  const filePath = path.join(__dirname, '../..', photoUrl);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn('Impossible de supprimer l’ancienne photo du bénévole:', error);
  }
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

async function getDashboard(req, res) {
  try {
    const [pendingCount, activeCount, upcomingEvents] = await Promise.all([
      prisma.user.count({ where: { role: 'BENEVOLE', validationStatus: 'PENDING' } }),
      prisma.user.count({ where: { role: 'BENEVOLE', validationStatus: 'APPROVED' } }),
      prisma.volunteerEvent.findMany({ where: { startDate: { gte: new Date() } }, orderBy: { startDate: 'asc' }, take: 5 }),
    ]);
    return res.json({ pendingCount, activeCount, upcomingEvents });
  } catch (error) {
    console.error('Erreur getDashboard (volunteers):', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── BÉNÉVOLES (gestion, responsable) ──────────────────────────────────────────

async function getPendingVolunteers(req, res) {
  try {
    const volunteers = await prisma.user.findMany({
      where: { role: 'BENEVOLE', validationStatus: 'PENDING' },
      select: USER_PUBLIC_FIELDS,
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ volunteers });
  } catch (error) {
    console.error('Erreur getPendingVolunteers:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getVolunteers(req, res) {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const isVolunteer = { OR: [{ role: 'BENEVOLE' }, { additionalRoles: { some: { role: 'BENEVOLE', status: 'APPROVED' } } }] };
    const where = {
      AND: [
        isVolunteer,
        { validationStatus: 'APPROVED' },
        ...(search ? [{
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }] : []),
      ],
    };
    const [total, volunteers] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, select: USER_PUBLIC_FIELDS, skip, take: Number(limit), orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
    ]);

    // Heures effectuées et validées sur l'année civile en cours (même convention que getMyValidatedHours)
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const volunteerIds = volunteers.map((v) => v.id);
    const hoursByVolunteer = volunteerIds.length > 0
      ? await prisma.volunteerEventParticipation.groupBy({
          by: ['volunteerId'],
          where: { volunteerId: { in: volunteerIds }, hoursValidated: true, startTime: { gte: yearStart, lt: yearEnd } },
          _sum: { hoursSpent: true },
        })
      : [];
    const hoursMap = new Map(hoursByVolunteer.map((h) => [h.volunteerId, Number(h._sum.hoursSpent || 0)]));
    const volunteersWithHours = volunteers.map((v) => ({ ...v, validatedHoursCurrentYear: hoursMap.get(v.id) || 0 }));

    return res.json({ volunteers: volunteersWithHours, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) || 1 });
  } catch (error) {
    console.error('Erreur getVolunteers:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function approveVolunteer(req, res) {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'BENEVOLE') return res.status(404).json({ error: 'Bénévole introuvable' });

    const updated = await prisma.user.update({ where: { id }, data: { validationStatus: 'APPROVED' } });
    await sendAccountApprovedEmail(updated);
    return res.json({ volunteer: { id: updated.id, validationStatus: updated.validationStatus } });
  } catch (error) {
    console.error('Erreur approveVolunteer:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function rejectVolunteer(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'BENEVOLE') return res.status(404).json({ error: 'Bénévole introuvable' });

    const updated = await prisma.user.update({ where: { id }, data: { validationStatus: 'REJECTED' } });
    await sendAccountRejectedEmail(updated, reason);
    return res.json({ volunteer: { id: updated.id, validationStatus: updated.validationStatus } });
  } catch (error) {
    console.error('Erreur rejectVolunteer:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── DEMANDES DE RÔLE BÉNÉVOLE (self-service depuis "Mes rôles") ──────────────────
// Un compte existant peut demander depuis son espace à devenir Bénévole en plus de son rôle
// actuel. La demande reste PENDING (UserRole.status) jusqu'à validation par le Responsable
// Pôle Bénévoles, sans jamais bloquer la connexion avec les rôles déjà approuvés du compte.

async function getPendingVolunteerRoleRequests(req, res) {
  try {
    const requests = await prisma.userRole.findMany({
      where: { role: 'BENEVOLE', status: 'PENDING' },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ requests });
  } catch (error) {
    console.error('Erreur getPendingVolunteerRoleRequests:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function approveVolunteerRoleRequest(req, res) {
  try {
    const { id } = req.params;
    const request = await prisma.userRole.findUnique({ where: { id }, include: { user: true } });
    if (!request || request.role !== 'BENEVOLE' || request.status !== 'PENDING') {
      return res.status(404).json({ error: 'Demande introuvable' });
    }
    const updated = await prisma.userRole.update({
      where: { id },
      data: { status: 'APPROVED', decidedBy: req.user.id, decidedAt: new Date() },
    });
    await sendRoleRequestApprovedEmail(request.user, 'Bénévole');
    return res.json({ request: { id: updated.id, status: updated.status } });
  } catch (error) {
    console.error('Erreur approveVolunteerRoleRequest:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function rejectVolunteerRoleRequest(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const request = await prisma.userRole.findUnique({ where: { id }, include: { user: true } });
    if (!request || request.role !== 'BENEVOLE' || request.status !== 'PENDING') {
      return res.status(404).json({ error: 'Demande introuvable' });
    }
    const updated = await prisma.userRole.update({
      where: { id },
      data: { status: 'REJECTED', decidedBy: req.user.id, decidedAt: new Date(), rejectionReason: reason || null },
    });
    await sendRoleRequestRejectedEmail(request.user, 'Bénévole', reason);
    return res.json({ request: { id: updated.id, status: updated.status } });
  } catch (error) {
    console.error('Erreur rejectVolunteerRoleRequest:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createVolunteer(req, res) {
  try {
    const { firstName, lastName, email, phone } = req.body;
    if (!firstName || !lastName || !email) return res.status(400).json({ error: 'Prénom, nom et email sont requis' });

    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, include: { additionalRoles: { select: { role: true } } } });

    if (existing) {
      const alreadyVolunteer = existing.role === 'BENEVOLE' || existing.additionalRoles.some((r) => r.role === 'BENEVOLE');
      if (alreadyVolunteer) return res.status(409).json({ error: 'Ce compte est déjà bénévole' });

      await prisma.userRole.create({ data: { userId: existing.id, role: 'BENEVOLE' } });

      try {
        await sendVolunteerRoleAddedEmail(existing);
      } catch (emailError) {
        console.error('Erreur envoi email ajout rôle bénévole:', emailError);
      }

      return res.status(200).json({
        volunteer: { id: existing.id, email: existing.email, firstName: existing.firstName, lastName: existing.lastName },
        addedToExistingAccount: true,
      });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    const user = await prisma.user.create({
      data: {
        email,
        provider: 'local',
        firstName,
        lastName,
        phone: phone || null,
        role: 'BENEVOLE',
        validationStatus: 'APPROVED',
        emailVerified: true,
        resetPasswordToken: token,
        resetPasswordExpires: expires,
      },
    });

    try {
      await sendVolunteerInvitationEmail(user, token);
    } catch (emailError) {
      console.error('Erreur envoi email invitation bénévole:', emailError);
    }

    return res.status(201).json({ volunteer: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName } });
  } catch (error) {
    console.error('Erreur createVolunteer:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateVolunteerDetails(req, res) {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'BENEVOLE') return res.status(404).json({ error: 'Bénévole introuvable' });

    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
      if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
      },
      select: USER_PUBLIC_FIELDS,
    });
    return res.json({ volunteer: updated });
  } catch (error) {
    console.error('Erreur updateVolunteerDetails:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function generateVolunteerPassword(req, res) {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'BENEVOLE') return res.status(404).json({ error: 'Bénévole introuvable' });

    const temporaryPassword = `AMC-${crypto.randomBytes(5).toString('hex')}`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    await prisma.user.update({ where: { id }, data: { passwordHash, resetPasswordToken: null, resetPasswordExpires: null } });
    return res.json({ password: temporaryPassword });
  } catch (error) {
    console.error('Erreur generateVolunteerPassword:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function toggleVolunteerActive(req, res) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive doit être un booléen' });

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'BENEVOLE') return res.status(404).json({ error: 'Bénévole introuvable' });
    if (req.user.id === id && !isActive) return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });

    const updated = await prisma.user.update({ where: { id }, data: { isActive } });
    return res.json({ volunteer: { id: updated.id, isActive: updated.isActive } });
  } catch (error) {
    console.error('Erreur toggleVolunteerActive:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── PROFIL PERSONNEL (bénévole) ───────────────────────────────────────────────

async function getMyProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: USER_PUBLIC_FIELDS });
    if (!user) return res.status(404).json({ error: 'Profil introuvable' });
    return res.json({ volunteer: user });
  } catch (error) {
    console.error('Erreur getMyProfile:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateMyProfile(req, res) {
  try {
    const { firstName, lastName, phone, photoBase64 } = req.body;
    const current = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!current) return res.status(404).json({ error: 'Profil introuvable' });

    const data = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (phone !== undefined) data.phone = phone;
    if (photoBase64) {
      deleteOldPhoto(current.photoUrl);
      data.photoUrl = saveBase64File(photoBase64, 'volunteers', 'photo.jpg');
    }

    const updated = await prisma.user.update({ where: { id: req.user.id }, data, select: USER_PUBLIC_FIELDS });
    return res.json({ volunteer: updated });
  } catch (error) {
    console.error('Erreur updateMyProfile:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getMyValidatedHours(req, res) {
  try {
    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);

    const result = await prisma.volunteerEventParticipation.aggregate({
      where: { volunteerId: req.user.id, hoursValidated: true, startTime: { gte: start, lt: end } },
      _sum: { hoursSpent: true },
    });

    return res.json({ year, validatedHours: Number(result._sum.hoursSpent || 0) });
  } catch (error) {
    console.error('Erreur getMyValidatedHours:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── GROUPES DE BÉNÉVOLES ──────────────────────────────────────────────────────

async function getGroups(req, res) {
  try {
    const groups = await prisma.volunteerGroup.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    return res.json({
      groups: groups.map((g) => ({ id: g.id, name: g.name, description: g.description, memberCount: g._count.members, createdAt: g.createdAt })),
    });
  } catch (error) {
    console.error('Erreur getGroups:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createGroup(req, res) {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom du groupe requis' });
    const group = await prisma.volunteerGroup.create({ data: { name, description: description || null, createdBy: req.user.id } });
    return res.status(201).json({ group });
  } catch (error) {
    console.error('Erreur createGroup:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateGroup(req, res) {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const group = await prisma.volunteerGroup.update({
      where: { id },
      data: { ...(name !== undefined && { name }), ...(description !== undefined && { description }) },
    });
    return res.json({ group });
  } catch (error) {
    console.error('Erreur updateGroup:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteGroup(req, res) {
  try {
    const { id } = req.params;
    await prisma.volunteerGroup.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    console.error('Erreur deleteGroup:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getGroupMembers(req, res) {
  try {
    const { id } = req.params;
    const members = await prisma.volunteerGroupMember.findMany({
      where: { groupId: id },
      include: { volunteer: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { volunteer: { lastName: 'asc' } },
    });
    return res.json({ members: members.map((m) => m.volunteer) });
  } catch (error) {
    console.error('Erreur getGroupMembers:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateGroupMembers(req, res) {
  try {
    const { id } = req.params;
    const { volunteerIds } = req.body;
    if (!Array.isArray(volunteerIds)) return res.status(400).json({ error: 'volunteerIds doit être un tableau' });

    const group = await prisma.volunteerGroup.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });

    await prisma.$transaction([
      prisma.volunteerGroupMember.deleteMany({ where: { groupId: id } }),
      ...(volunteerIds.length
        ? [prisma.volunteerGroupMember.createMany({ data: volunteerIds.map((volunteerId) => ({ groupId: id, volunteerId })) })]
        : []),
    ]);

    const members = await prisma.volunteerGroupMember.findMany({
      where: { groupId: id },
      include: { volunteer: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { volunteer: { lastName: 'asc' } },
    });
    return res.json({ members: members.map((m) => m.volunteer) });
  } catch (error) {
    console.error('Erreur updateGroupMembers:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── ÉVÉNEMENTS ────────────────────────────────────────────────────────────────

const VOLUNTEER_EVENT_TYPES = ['JOUMOUAA', 'RAMADAN', 'AID', 'FETE', 'AUTRE'];
const EVENT_POSTER_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

function fmtEvent(event, { isBenevole } = {}) {
  const base = {
    id: event.id,
    title: event.title,
    type: event.type,
    description: event.description,
    location: event.location,
    posterUrl: event.posterUrl,
    registrationOpen: event.registrationOpen,
    startDate: event.startDate,
    endDate: event.endDate,
    createdAt: event.createdAt,
    groups: (event.groups || []).map((g) => ({ id: g.group.id, name: g.group.name })),
    creator: event.creator ? { id: event.creator.id, firstName: event.creator.firstName, lastName: event.creator.lastName } : null,
  };
  if (isBenevole) {
    base.myParticipation = event.participations?.[0] || null;
  } else {
    base.participations = event.participations || [];
  }
  return base;
}

async function getEvents(req, res) {
  try {
    const roles = req.user.roles || [req.user.role];
    const isManager = roles.some((r) => hasPermission(r, PERMISSIONS.VOLUNTEERS_MANAGE));
    const isBenevole = !isManager && roles.includes('BENEVOLE');
    let where = {};

    if (isBenevole) {
      const memberships = await prisma.volunteerGroupMember.findMany({ where: { volunteerId: req.user.id }, select: { groupId: true } });
      const myGroupIds = memberships.map((m) => m.groupId);
      where = {
        OR: [
          { groups: { none: {} } },
          ...(myGroupIds.length ? [{ groups: { some: { groupId: { in: myGroupIds } } } }] : []),
        ],
      };
    }

    const events = await prisma.volunteerEvent.findMany({
      where,
      orderBy: { startDate: 'asc' },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        groups: { include: { group: { select: { id: true, name: true } } } },
        participations: isBenevole
          ? { where: { volunteerId: req.user.id } }
          : { include: { volunteer: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });

    return res.json({ events: events.map((e) => fmtEvent(e, { isBenevole })) });
  } catch (error) {
    console.error('Erreur getEvents:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

function saveEventPoster(posterBase64, posterFilename) {
  const mime = (posterBase64.match(/^data:([a-zA-Z0-9+/.-]+\/[a-zA-Z0-9.+-]+);base64,/) || [])[1];
  if (!mime || !EVENT_POSTER_MIME_TYPES.includes(mime.toLowerCase())) {
    const err = new Error('L\'affiche doit être une image (PNG, JPEG, WEBP) ou un PDF');
    err.status = 400;
    throw err;
  }
  return saveBase64File(posterBase64, 'volunteer-events', posterFilename || 'affiche');
}

async function createEvent(req, res) {
  try {
    const { title, type, description, location, startDate, endDate, groupIds, posterBase64, posterFilename, registrationOpen } = req.body;
    if (!title || !startDate) return res.status(400).json({ error: 'Titre et date de début sont requis' });
    if (type !== undefined && !VOLUNTEER_EVENT_TYPES.includes(type)) return res.status(400).json({ error: 'Type d\'événement invalide' });

    const posterUrl = posterBase64 ? saveEventPoster(posterBase64, posterFilename) : null;

    const event = await prisma.volunteerEvent.create({
      data: {
        title,
        type: type || 'AUTRE',
        description: description || null,
        location: location || null,
        posterUrl,
        registrationOpen: registrationOpen === undefined ? true : Boolean(registrationOpen),
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        createdBy: req.user.id,
        groups: Array.isArray(groupIds) && groupIds.length
          ? { create: groupIds.map((groupId) => ({ groupId })) }
          : undefined,
      },
      include: { groups: { include: { group: { select: { id: true, name: true } } } }, creator: { select: { id: true, firstName: true, lastName: true } } },
    });
    return res.status(201).json({ event: fmtEvent(event) });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Erreur createEvent:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateEvent(req, res) {
  try {
    const { id } = req.params;
    const { title, type, description, location, startDate, endDate, groupIds, posterBase64, posterFilename, removePoster, registrationOpen } = req.body;
    if (type !== undefined && !VOLUNTEER_EVENT_TYPES.includes(type)) return res.status(400).json({ error: 'Type d\'événement invalide' });

    if (groupIds !== undefined) {
      await prisma.volunteerEventGroup.deleteMany({ where: { eventId: id } });
      if (Array.isArray(groupIds) && groupIds.length) {
        await prisma.volunteerEventGroup.createMany({ data: groupIds.map((groupId) => ({ eventId: id, groupId })) });
      }
    }

    let posterUrl;
    if (posterBase64) {
      const current = await prisma.volunteerEvent.findUnique({ where: { id }, select: { posterUrl: true } });
      posterUrl = saveEventPoster(posterBase64, posterFilename);
      deleteOldPhoto(current?.posterUrl);
    } else if (removePoster) {
      const current = await prisma.volunteerEvent.findUnique({ where: { id }, select: { posterUrl: true } });
      deleteOldPhoto(current?.posterUrl);
      posterUrl = null;
    }

    const event = await prisma.volunteerEvent.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(type !== undefined && { type }),
        ...(description !== undefined && { description }),
        ...(location !== undefined && { location }),
        ...(posterUrl !== undefined && { posterUrl }),
        ...(registrationOpen !== undefined && { registrationOpen: Boolean(registrationOpen) }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      },
      include: { groups: { include: { group: { select: { id: true, name: true } } } }, creator: { select: { id: true, firstName: true, lastName: true } } },
    });
    return res.json({ event: fmtEvent(event) });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Erreur updateEvent:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteEvent(req, res) {
  try {
    const { id } = req.params;
    const existing = await prisma.volunteerEvent.findUnique({ where: { id }, select: { posterUrl: true } });
    await prisma.volunteerEvent.delete({ where: { id } });
    deleteOldPhoto(existing?.posterUrl);
    return res.status(204).send();
  } catch (error) {
    console.error('Erreur deleteEvent:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── PARTICIPATIONS / IMPUTATIONS ──────────────────────────────────────────────

async function getEventParticipations(req, res) {
  try {
    const { id } = req.params;
    const participations = await prisma.volunteerEventParticipation.findMany({
      where: { eventId: id },
      include: {
        volunteer: { select: { id: true, firstName: true, lastName: true, email: true } },
        validator: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { volunteer: { lastName: 'asc' } },
    });
    return res.json({ participations });
  } catch (error) {
    console.error('Erreur getEventParticipations:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

function computeHours(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const ms = new Date(endTime).getTime() - new Date(startTime).getTime();
  return Math.round((ms / 3600000) * 100) / 100;
}

async function upsertMyParticipation(req, res) {
  try {
    const { id } = req.params;
    const { attendanceStatus, startTime, endTime, hoursNote } = req.body;

    const event = await prisma.volunteerEvent.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: 'Événement introuvable' });

    const ATTENDANCE_VALUES = ['PENDING', 'CONFIRMED', 'DECLINED'];
    if (attendanceStatus !== undefined && !ATTENDANCE_VALUES.includes(attendanceStatus)) {
      return res.status(400).json({ error: 'Statut de présence invalide' });
    }
    if (attendanceStatus === 'CONFIRMED' && !event.registrationOpen) {
      return res.status(400).json({ error: "Les inscriptions sont fermées pour cet événement" });
    }

    const existing = await prisma.volunteerEventParticipation.findUnique({
      where: { eventId_volunteerId: { eventId: id, volunteerId: req.user.id } },
    });

    const data = {};
    if (attendanceStatus !== undefined) data.attendanceStatus = attendanceStatus;

    const settingImputation = startTime !== undefined || endTime !== undefined;
    if (settingImputation) {
      const resultingStatus = data.attendanceStatus || existing?.attendanceStatus;
      if (resultingStatus !== 'CONFIRMED') {
        return res.status(400).json({ error: 'Vous devez confirmer votre présence avant de saisir votre imputation' });
      }

      const nextStart = startTime !== undefined ? (startTime || null) : existing?.startTime;
      const nextEnd = endTime !== undefined ? (endTime || null) : existing?.endTime;
      if (nextStart && nextEnd && new Date(nextEnd) <= new Date(nextStart)) {
        return res.status(400).json({ error: "L'heure de fin doit être après l'heure de début" });
      }

      data.startTime = nextStart ? new Date(nextStart) : null;
      data.endTime = nextEnd ? new Date(nextEnd) : null;
      data.hoursSpent = computeHours(data.startTime, data.endTime);

      // toute nouvelle saisie d'imputation repasse en attente de validation par le responsable
      if (existing?.hoursValidated) {
        data.hoursValidated = false;
        data.validatedBy = null;
        data.validatedAt = null;
      }
    }
    if (hoursNote !== undefined) data.hoursNote = hoursNote;

    const participation = existing
      ? await prisma.volunteerEventParticipation.update({ where: { id: existing.id }, data })
      : await prisma.volunteerEventParticipation.create({
        data: { eventId: id, volunteerId: req.user.id, attendanceStatus: attendanceStatus || 'PENDING', ...data },
      });

    return res.json({ participation });
  } catch (error) {
    console.error('Erreur upsertMyParticipation:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateParticipation(req, res) {
  try {
    const { participationId } = req.params;
    const { startTime, endTime, hoursValidated } = req.body;

    const existing = await prisma.volunteerEventParticipation.findUnique({ where: { id: participationId } });
    if (!existing) return res.status(404).json({ error: 'Imputation introuvable' });

    const data = {};
    if (startTime !== undefined || endTime !== undefined) {
      const nextStart = startTime !== undefined ? (startTime || null) : existing.startTime;
      const nextEnd = endTime !== undefined ? (endTime || null) : existing.endTime;
      if (nextStart && nextEnd && new Date(nextEnd) <= new Date(nextStart)) {
        return res.status(400).json({ error: "L'heure de fin doit être après l'heure de début" });
      }
      data.startTime = nextStart ? new Date(nextStart) : null;
      data.endTime = nextEnd ? new Date(nextEnd) : null;
      data.hoursSpent = computeHours(data.startTime, data.endTime);
    }
    if (hoursValidated !== undefined) {
      data.hoursValidated = Boolean(hoursValidated);
      data.validatedBy = hoursValidated ? req.user.id : null;
      data.validatedAt = hoursValidated ? new Date() : null;
    }

    const participation = await prisma.volunteerEventParticipation.update({
      where: { id: participationId },
      data,
      include: {
        volunteer: { select: { id: true, firstName: true, lastName: true, email: true } },
        validator: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return res.json({ participation });
  } catch (error) {
    console.error('Erreur updateParticipation:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getDashboard,
  getPendingVolunteers, getVolunteers, approveVolunteer, rejectVolunteer, createVolunteer,
  getPendingVolunteerRoleRequests, approveVolunteerRoleRequest, rejectVolunteerRoleRequest,
  updateVolunteerDetails, generateVolunteerPassword, toggleVolunteerActive,
  getMyProfile, updateMyProfile, getMyValidatedHours,
  getGroups, createGroup, updateGroup, deleteGroup, getGroupMembers, updateGroupMembers,
  getEvents, createEvent, updateEvent, deleteEvent,
  getEventParticipations, upsertMyParticipation, updateParticipation,
};
