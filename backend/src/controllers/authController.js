const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const passport = require('passport');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendVerificationEmail } = require('../services/emailService');
const config = require('../config');

const prisma = new PrismaClient();

const OAUTH_STATE_COOKIE = 'amc_google_oauth_state';

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/',
  };
}

function buildFrontendRedirect(pathname = '/login') {
  return new URL(pathname, config.frontendUrl);
}

function redirectWithError(res, message) {
  const url = buildFrontendRedirect('/auth/google/callback');
  url.searchParams.set('error', message);
  return res.redirect(url.toString());
}

async function issueTokensForUser(user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      refreshToken,
      lastLogin: new Date(),
    },
  });

  return { accessToken, refreshToken };
}

/**
 * POST /api/auth/register
 */
async function register(req, res) {
  try {
    const { email, password, firstName, lastName, phone, role } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const emailVerifyToken = uuidv4();

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        provider: 'local',
        firstName,
        lastName,
        phone,
        role: ['FAMILLE', 'PROFESSEUR', 'ADMIN', 'TRESORIER'].includes(role) ? role : 'FAMILLE',
        emailVerifyToken,
        validationStatus: 'PENDING',
      },
    });

    await sendVerificationEmail(user, emailVerifyToken);

    res.status(201).json({
      message: 'Inscription réussie ! Vérifiez votre email pour activer votre compte. Votre compte sera ensuite validé par l\'administration.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        validationStatus: user.validationStatus,
      },
    });
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur serveur lors de l\'inscription' });
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    if (!user.passwordHash) {
      return res.status(400).json({
        error: 'Ce compte est configuré pour la connexion Google. Utilisez "Se connecter avec Google".',
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({
        error: 'Compte verrouillé suite à trop de tentatives. Réessayez plus tard.',
        lockedUntil: user.lockedUntil,
      });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      const attempts = user.failedLoginAttempts + 1;
      const updateData = { failedLoginAttempts: attempts };
      if (attempts >= 5) {
        updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      }
      await prisma.user.update({ where: { id: user.id }, data: updateData });
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const { accessToken, refreshToken } = await issueTokensForUser(user);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        validationStatus: user.validationStatus,
        emailVerified: user.emailVerified,
      },
    });
  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
}

/**
 * GET /api/auth/google
 */
function googleAuth(req, res, next) {
  if (!config.google.clientId || !config.google.clientSecret || !config.google.callbackUrl) {
    return res.status(503).json({
      error: 'Authentification Google non configurée sur le serveur',
      code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
    });
  }

  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, getCookieOptions());

  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state,
  })(req, res, next);
}

/**
 * GET /api/auth/google/callback
 */
function googleCallback(req, res, next) {
  const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
  const receivedState = req.query?.state;

  res.clearCookie(OAUTH_STATE_COOKIE, getCookieOptions());

  if (!expectedState || !receivedState || expectedState !== receivedState) {
    return redirectWithError(res, 'Échec de vérification de sécurité OAuth. Veuillez réessayer.');
  }

  return passport.authenticate('google', { session: false }, async (error, user, info) => {
    if (error) {
      console.error('Erreur OAuth Google:', error);
      return redirectWithError(res, 'Erreur lors de l’authentification Google.');
    }

    if (!user) {
      const reason = info?.message || 'Connexion Google refusée.';
      return redirectWithError(res, reason);
    }

    try {
      const { accessToken, refreshToken } = await issueTokensForUser(user);
      const url = buildFrontendRedirect('/auth/google/callback');
      url.searchParams.set('accessToken', accessToken);
      url.searchParams.set('refreshToken', refreshToken);
      return res.redirect(url.toString());
    } catch (tokenError) {
      console.error('Erreur génération token OAuth:', tokenError);
      return redirectWithError(res, 'Impossible de finaliser la connexion Google.');
    }
  })(req, res, next);
}

/**
 * POST /api/auth/refresh
 */
async function refreshToken(req, res) {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Refresh token requis' });
    }

    const decoded = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ error: 'Refresh token invalide' });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (error) {
    console.error('Erreur refresh token:', error);
    res.status(401).json({ error: 'Refresh token invalide ou expiré' });
  }
}

/**
 * GET /api/auth/verify-email/:token
 */
async function verifyEmail(req, res) {
  try {
    const { token } = req.params;

    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: token },
    });

    if (!user) {
      return res.status(400).json({ error: 'Lien de vérification invalide ou expiré' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null },
    });

    res.json({ message: 'Email vérifié avec succès !' });
  } catch (error) {
    console.error('Erreur vérification email:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/auth/me
 */
async function getMe(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        validationStatus: true,
        emailVerified: true,
        provider: true,
        createdAt: true,
        lastLogin: true,
        family: {
          select: { id: true, familyName: true },
        },
      },
    });
    res.json({ user });
  } catch (error) {
    console.error('Erreur getMe:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/auth/logout
 */
async function logout(req, res) {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { refreshToken: null },
    });
    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  register,
  login,
  googleAuth,
  googleCallback,
  refreshToken,
  verifyEmail,
  getMe,
  logout,
};
