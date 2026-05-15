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
        firstName: true,
        lastName: true,
        emailVerified: true,
      },
    });

    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });

    req.user = user;
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
        firstName: true,
        lastName: true,
        emailVerified: true,
      },
    });

    if (user) {
      req.user = user;
    }
  } catch (error) {
    console.warn('authenticateOptional: token ignored', error.message);
  }

  next();
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès non autorisé pour votre rôle' });
    }
    next();
  };
}

function authorizePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });

    const missing = permissions.filter((p) => !hasPermission(req.user.role, p));
    if (missing.length > 0) {
      return res.status(403).json({
        error: 'Permission insuffisante',
        required: permissions,
      });
    }

    next();
  };
}

function requireApproved(req, res, next) {
  if (req.user.validationStatus !== 'APPROVED' && req.user.role !== 'SUPER_ADMIN') {
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
  requireApproved,
};
