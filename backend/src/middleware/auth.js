const { verifyAccessToken } = require('../utils/jwt');
const { PrismaClient } = require('@prisma/client');
const { hasPermission } = require('../config/permissions');

const prisma = new PrismaClient();

async function authenticate(req, res, next) {
  try {
    console.log('authenticate ->', req.method, req.originalUrl, 'hasAuth=', !!req.headers.authorization);
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token d\'authentification requis' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        validationStatus: true,
        isActive: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        additionalRoles: { where: { status: 'APPROVED' }, select: { role: true } },
      },
    });

    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
    if (user.isActive === false) {
      return res.status(403).json({ error: 'Ce compte a été désactivé. Contactez un administrateur.', code: 'ACCOUNT_DISABLED' });
    }

    req.user = { ...user, roles: [user.role, ...user.additionalRoles.map((r) => r.role)] };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token invalide' });
  }
}

async function authenticateOptional(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        validationStatus: true,
        isActive: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        additionalRoles: { where: { status: 'APPROVED' }, select: { role: true } },
      },
    });

    if (user && user.isActive !== false) {
      req.user = { ...user, roles: [user.role, ...user.additionalRoles.map((r) => r.role)] };
    }
  } catch (error) {
    console.warn('authenticateOptional: token ignored', error.message);
  }

  next();
}

function userRoles(user) {
  return user.roles || [user.role];
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!userRoles(req.user).some((r) => roles.includes(r))) {
      return res.status(403).json({ error: 'Accès non autorisé pour votre rôle' });
    }
    next();
  };
}

function authorizePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });

    const roles = userRoles(req.user);
    const missing = permissions.filter((p) => !roles.some((r) => hasPermission(r, p)));
    if (missing.length > 0) {
      console.warn(`Permission insuffisante pour rôle(s) ${roles.join(',')} sur ${req.originalUrl}`, {
        required: permissions,
        userRoles: roles,
        missing,
      });
      return res.status(403).json({
        error: 'Permission insuffisante',
        required: permissions,
      });
    }

    next();
  };
}

function authorizeAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });

    const roles = userRoles(req.user);
    const hasAny = permissions.some((p) => roles.some((r) => hasPermission(r, p)));
    if (!hasAny) {
      return res.status(403).json({
        error: 'Permission insuffisante',
        required: permissions,
      });
    }

    next();
  };
}

function requireApproved(req, res, next) {
  if (req.user.validationStatus !== 'APPROVED' && !userRoles(req.user).includes('SUPER_ADMIN')) {
    return res.status(403).json({
      error: 'Votre compte est en attente de validation par l\'administration',
      code: 'ACCOUNT_PENDING',
    });
  }
  next();
}

module.exports = {
  authenticate,
  authenticateOptional,
  authorize,
  authorizePermission,
  authorizeAnyPermission,
  requireApproved,
};
