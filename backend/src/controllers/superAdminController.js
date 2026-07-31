const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { sendAccountInvitationEmail } = require('../services/emailService');

const prisma = new PrismaClient();

const VALID_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'TRESORIER',
  'PROFESSEUR',
  'FAMILLE',
  'RESPONSABLE_POLE_CORAN',
  'RESPONSABLE_POLE_ARABE',
  'RESPONSABLE_POLE_SOUTIEN_SCO',
  'RESPONSABLE_POLE_SCIENCE_IS',
  'RESPONSABLE_POLE_SOCIAL',
  'OPERATEUR_SOCIAL',
  'RESPONSABLE_POLE_BENEVOLES',
  'BENEVOLE',
  'RESPONSABLE_RH',
  'SALARIE',
];

const USER_LIST_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  validationStatus: true,
  isActive: true,
  emailVerified: true,
  createdAt: true,
  lastLogin: true,
  additionalRoles: { select: { role: true } },
};

function fmtUser(u) {
  const { additionalRoles, ...rest } = u;
  return { ...rest, roles: [u.role, ...additionalRoles.map((r) => r.role)] };
}

// GET /api/super-admin/users — liste complète des utilisateurs, tous rôles confondus
async function getAllUsers(req, res) {
  try {
    const { status, role, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status) where.validationStatus = status;
    if (role) {
      where.OR = [{ role }, { additionalRoles: { some: { role } } }];
    }
    const name = String(req.query.name || '').trim();
    if (name) {
      const nameFilter = {
        OR: [
          { firstName: { contains: name, mode: 'insensitive' } },
          { lastName: { contains: name, mode: 'insensitive' } },
          { email: { contains: name, mode: 'insensitive' } },
        ],
      };
      // combine avec le filtre rôle éventuel (AND) sans écraser le OR déjà posé
      if (where.OR) {
        where.AND = [{ OR: where.OR }, nameFilter];
        delete where.OR;
      } else {
        Object.assign(where, nameFilter);
      }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: USER_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
        take: parseInt(limit, 10),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users: users.map(fmtUser), total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (error) {
    console.error('Erreur getAllUsers (super-admin):', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// POST /api/super-admin/users — créer un utilisateur, quel que soit le rôle
async function createUser(req, res) {
  try {
    const { firstName, lastName, email, phone, role } = req.body;
    if (!firstName || !lastName || !email || !role) {
      return res.status(400).json({ error: 'Prénom, nom, email et rôle sont requis' });
    }
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });

    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    const user = await prisma.user.create({
      data: {
        email,
        provider: 'local',
        firstName,
        lastName,
        phone: phone || null,
        role,
        validationStatus: 'APPROVED',
        emailVerified: true,
        resetPasswordToken: token,
        resetPasswordExpires: expires,
      },
    });

    if (role === 'PROFESSEUR') {
      await prisma.teacher.create({
        data: { userId: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone },
      });
    }

    try {
      await sendAccountInvitationEmail(user, token);
    } catch (emailError) {
      console.error('Erreur envoi email invitation compte:', emailError);
    }

    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        roles: [user.role],
        validationStatus: user.validationStatus,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Erreur createUser (super-admin):', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// PUT /api/super-admin/users/:id/roles — définir l'ensemble des rôles d'un utilisateur (ajout/retrait)
async function updateUserRoles(req, res) {
  try {
    const { id } = req.params;
    const { roles } = req.body;

    if (!Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ error: 'Au moins un rôle est requis' });
    }
    const uniqueRoles = [...new Set(roles)];
    const invalid = uniqueRoles.filter((r) => !VALID_ROLES.includes(r));
    if (invalid.length) return res.status(400).json({ error: `Rôle(s) invalide(s) : ${invalid.join(', ')}` });

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    if (req.user.id === id && target.role === 'SUPER_ADMIN' && !uniqueRoles.includes('SUPER_ADMIN')) {
      return res.status(400).json({ error: 'Vous ne pouvez pas retirer votre propre rôle Super Admin' });
    }

    const primary = uniqueRoles.includes(target.role) ? target.role : uniqueRoles[0];
    const additional = uniqueRoles.filter((r) => r !== primary);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { role: primary } });
      await tx.userRole.deleteMany({ where: { userId: id } });
      if (additional.length) {
        await tx.userRole.createMany({ data: additional.map((role) => ({ userId: id, role })) });
      }
    });

    const updated = await prisma.user.findUnique({ where: { id }, select: USER_LIST_SELECT });
    return res.json({ user: fmtUser(updated) });
  } catch (error) {
    console.error('Erreur updateUserRoles (super-admin):', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// PUT /api/super-admin/users/:id/active — activer ou désactiver un compte (réversible, sans perte de données)
async function toggleUserActive(req, res) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive doit être un booléen' });

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    if (req.user.id === id && !isActive) {
      return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });
    }

    const updated = await prisma.user.update({ where: { id }, data: { isActive } });
    return res.json({ user: { id: updated.id, isActive: updated.isActive } });
  } catch (error) {
    console.error('Erreur toggleUserActive (super-admin):', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

// POST /api/super-admin/users/:id/reset-password — générer un nouveau mot de passe temporaire
async function resetUserPassword(req, res) {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const temporaryPassword = `AMC-${crypto.randomBytes(5).toString('hex')}`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    await prisma.user.update({
      where: { id },
      data: { passwordHash, resetPasswordToken: null, resetPasswordExpires: null },
    });

    return res.json({ password: temporaryPassword });
  } catch (error) {
    console.error('Erreur resetUserPassword (super-admin):', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  VALID_ROLES,
  getAllUsers,
  createUser,
  updateUserRoles,
  toggleUserActive,
  resetUserPassword,
};
