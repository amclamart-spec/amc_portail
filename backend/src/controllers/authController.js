const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const passport = require('passport');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const { applyNameCasing } = require('../lib/prismaNameMiddleware');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendVerificationEmail, sendResetPasswordEmail, sendRoleRequestApprovedEmail } = require('../services/emailService');
const { sendPasswordResetSms } = require('../services/smsService');
const config = require('../config');

const prisma = applyNameCasing(new PrismaClient());

const OAUTH_STATE_COOKIE = 'amc_google_oauth_state';

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
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
  if (user.validationStatus && String(user.validationStatus).toUpperCase() !== 'APPROVED') {
    throw new Error('Compte en attente d\'activation par un administrateur');
  }

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

// Rôles qu'un visiteur non authentifié peut choisir à l'inscription publique.
// N'inclut JAMAIS ADMIN/SUPER_ADMIN (ni aucun rôle de responsable de pôle) —
// une ancienne version de ce whitelist incluait 'ADMIN', permettant à quiconque
// de s'auto-créer un compte administrateur (en attente d'approbation, mais
// pouvant être approuvé par erreur par un admin ne s'attendant pas à voir ce
// rôle dans une inscription publique). Ne jamais élargir cette liste sans
// revalider explicitement ce risque.
const SELF_REGISTERABLE_ROLES = ['FAMILLE', 'PROFESSEUR', 'TRESORIER', 'BENEVOLE'];

/**
 * POST /api/auth/register
 */
async function register(req, res) {
  try {
    const { password, firstName, lastName, phone, role } = req.body;
    // Normalisé pour éviter qu'un même email crée deux comptes distincts qui ne
    // diffèrent que par la casse (ce qui rendrait la connexion insensible à la casse
    // ambiguë entre les deux) — voir login() ci-dessus.
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Téléphone requis' });
    }

    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (existing) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const emailVerifyToken = uuidv4();

    const userRole = SELF_REGISTERABLE_ROLES.includes(role) ? role : 'FAMILLE';
    const validationStatus = userRole === 'FAMILLE' ? 'APPROVED' : 'PENDING';
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        provider: 'local',
        firstName,
        lastName,
        phone,
        role: userRole,
        emailVerifyToken,
        validationStatus,
      },
    });

    let emailWarning = null;
    try {
      await sendVerificationEmail(user, emailVerifyToken);
    } catch (emailError) {
      console.error('Erreur envoi email de vérification:', emailError);
      emailWarning = 'Verification email could not be sent. Contactez l’administrateur pour activer le compte.';
    }

    const responsePayload = {
      message: userRole === 'FAMILLE'
        ? 'Inscription réussie ! Votre compte famille est activé automatiquement. Vérifiez votre email pour confirmer votre adresse.'
        : 'Inscription réussie ! Vérifiez votre email pour activer votre compte. Les comptes professeur, trésorier et bénévole doivent être validés par un administrateur.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        validationStatus: user.validationStatus,
      },
    };

    if (emailWarning) {
      responsePayload.warning = emailWarning;
    }

    res.status(201).json(responsePayload);
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
    // Comparaison insensible à la casse et aux espaces : certains comptes ont été créés
    // (inscription directe, création admin d'un professeur/bénévole/salarié...) sans
    // normaliser l'email saisi, et un findUnique strict ratait alors la correspondance
    // dès que l'utilisateur tapait son email avec une casse différente à la connexion.
    const normalizedEmail = String(email || '').trim().toLowerCase();

    let user = await prisma.user.findFirst({ where: { email: { equals: normalizedEmail, mode: 'insensitive' } }, include: { additionalRoles: { where: { status: 'APPROVED' }, select: { role: true } } } });
    // Mot de passe à vérifier : celui du compte pour une connexion par email principal,
    // ou celui dédié à l'email secondaire (Family.emailSecondaryPasswordHash) — les deux
    // adresses d'une même famille ont chacune leur propre mot de passe.
    let passwordHashToCheck = user?.passwordHash;

    // Aucun compte trouvé sur l'email principal : une famille peut aussi se
    // connecter avec son adresse email secondaire (Family.emailSecondary), à
    // condition qu'un mot de passe dédié ait été généré pour cette adresse.
    if (!user) {
      const familyBySecondaryEmail = await prisma.family.findFirst({
        where: { emailSecondary: { equals: normalizedEmail, mode: 'insensitive' } },
        select: { userId: true, emailSecondaryPasswordHash: true },
      });
      if (familyBySecondaryEmail) {
        if (!familyBySecondaryEmail.emailSecondaryPasswordHash) {
          return res.status(401).json({ error: 'Aucun mot de passe n\'a été configuré pour cette adresse email. Contactez l\'administration.' });
        }
        user = await prisma.user.findUnique({
          where: { id: familyBySecondaryEmail.userId },
          include: { additionalRoles: { where: { status: 'APPROVED' }, select: { role: true } } },
        });
        passwordHashToCheck = familyBySecondaryEmail.emailSecondaryPasswordHash;
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    if (!passwordHashToCheck) {
      return res.status(400).json({
        error: 'Ce compte est configuré pour la connexion Google. Utilisez "Se connecter avec Google".',
      });
    }

    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

    if (!isAdmin && user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({
        error: 'Compte verrouillé suite à trop de tentatives. Réessayez plus tard.',
        lockedUntil: user.lockedUntil,
      });
    }

    const isValid = await bcrypt.compare(password, passwordHashToCheck);
    if (!isValid) {
      if (!isAdmin) {
        const attempts = user.failedLoginAttempts + 1;
        const updateData = { failedLoginAttempts: attempts };
        if (attempts >= 5) {
          updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
        }
        await prisma.user.update({ where: { id: user.id }, data: updateData });
      }
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Prevent login for users not validated by admin
    if (user.validationStatus && String(user.validationStatus).toUpperCase() !== 'APPROVED') {
      return res.status(403).json({ error: "Compte en attente d'activation par un administrateur", validationStatus: user.validationStatus });
    }

    if (user.isActive === false) {
      return res.status(403).json({ error: 'Ce compte a été désactivé. Contactez un administrateur.', code: 'ACCOUNT_DISABLED' });
    }

    let accessToken;
    let refreshToken;
    try {
      ({ accessToken, refreshToken } = await issueTokensForUser(user));
    } catch (tokErr) {
      console.error('Erreur issueTokensForUser:', tokErr);
      return res.status(403).json({ error: tokErr.message || 'Compte en attente d\'activation' });
    }

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        roles: [user.role, ...user.additionalRoles.map((r) => r.role)],
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
    prompt: 'select_account',
    accessType: 'offline',
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
    console.warn('OAuth state validation failed', { expectedState, receivedState });
    return redirectWithError(res, 'Échec de vérification de sécurité OAuth. Vérifiez que les cookies sont activés et réessayez.');
  }

  return passport.authenticate('google', { session: false }, async (error, user, info) => {
    if (error) {
      console.error('Erreur OAuth Google:', error);
      const message = error?.message || 'Erreur lors de l’authentification Google.';
      return redirectWithError(res, message);
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

    if (user.validationStatus && String(user.validationStatus).toUpperCase() !== 'APPROVED') {
      return res.status(403).json({ error: 'Compte en attente d\'activation par un administrateur' });
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

    const updateData = {
      emailVerified: true,
      emailVerifyToken: null,
    };

    if (user.role === 'FAMILLE') {
      updateData.validationStatus = 'APPROVED';
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
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
        additionalRoles: { where: { status: 'APPROVED' }, select: { role: true } },
        family: {
          select: { id: true, familyName: true },
        },
      },
    });
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const { additionalRoles, ...rest } = user;
    res.json({ user: { ...rest, roles: [user.role, ...additionalRoles.map((r) => r.role)] } });
  } catch (error) {
    console.error('Erreur getMe:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/auth/change-password
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email requis' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await prisma.user.findFirst({ where: { email: { equals: normalizedEmail, mode: 'insensitive' } } });
    if (!user) {
      return res.json({ message: 'Si cet email existe dans notre système, un lien de réinitialisation a été envoyé.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 heure

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: token,
        resetPasswordExpires: expires,
      },
    });

    const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;
    try {
      await sendResetPasswordEmail(user, token);
    } catch (emailErr) {
      console.error('[forgotPassword] Echec envoi email, tentative SMS :', emailErr?.message || emailErr);
      try {
        const family = await prisma.family.findUnique({ where: { userId: user.id } });
        if (family?.phonePrimary) {
          await sendPasswordResetSms(family.phonePrimary, resetUrl);
        } else {
          console.warn('[forgotPassword] Aucun numero de telephone trouve pour cet utilisateur');
        }
      } catch (smsErr) {
        console.error('[forgotPassword] Echec envoi SMS :', smsErr?.message || smsErr);
      }
    }

    return res.json({ message: 'Si cet email existe dans notre système, un lien de réinitialisation a été envoyé.' });
  } catch (error) {
    console.error('Erreur forgotPassword:', error);
    return res.status(500).json({ error: 'Erreur serveur lors de la demande de réinitialisation' });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
    }

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre' });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'Lien de réinitialisation invalide ou expiré' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    return res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    console.error('Erreur resetPassword:', error);
    return res.status(500).json({ error: 'Erreur serveur lors de la réinitialisation du mot de passe' });
  }
}

async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
    }

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: 'Impossible de changer le mot de passe pour ce compte' });
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur changePassword:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/auth/profile
 */
async function getProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, emailVerified: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user });
  } catch (error) {
    console.error('Erreur getProfile:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * PUT /api/auth/profile
 */
async function updateProfile(req, res) {
  try {
    const { firstName, lastName, phone } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'Prénom et nom sont requis' });
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone?.trim() || null },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true },
    });
    res.json({ user: updated });
  } catch (error) {
    console.error('Erreur updateProfile:', error);
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

// ─── GESTION DE MES RÔLES (self-service) ───────────────────────────────────────
// Un compte (identifié par son email) peut cumuler plusieurs rôles en parallèle.
// Depuis son espace (rubrique "Mes rôles"), l'utilisateur déjà authentifié peut demander
// l'ajout d'un rôle supplémentaire à son propre compte — pas besoin de reprouver son identité,
// il est déjà connecté. Le rôle Famille est ajouté immédiatement (comme à l'inscription initiale) ;
// Professeur et Bénévole restent PENDING jusqu'à validation par le responsable du pôle concerné,
// sans jamais bloquer la connexion avec les rôles déjà approuvés du compte.
const SELF_REQUESTABLE_ROLES = ['FAMILLE', 'PROFESSEUR', 'BENEVOLE', 'OPERATEUR_SOCIAL'];
const SELF_REQUESTABLE_ROLE_LABEL = { FAMILLE: 'Famille', PROFESSEUR: 'Professeur', BENEVOLE: 'Bénévole', OPERATEUR_SOCIAL: 'Opérateur Social' };

async function getMyRoleRequests(req, res) {
  try {
    const roles = await prisma.userRole.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    res.json({
      primaryRole: req.user.role,
      roles: roles.map((r) => ({
        role: r.role,
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
        rejectionReason: r.rejectionReason,
      })),
      requestableRoles: SELF_REQUESTABLE_ROLES.filter((r) => r !== req.user.role),
    });
  } catch (error) {
    console.error('Erreur getMyRoleRequests:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function requestRole(req, res) {
  try {
    const { role } = req.body;
    if (!SELF_REQUESTABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Ce rôle ne peut pas être demandé depuis votre espace' });
    }
    if (req.user.role === role) {
      return res.status(409).json({ error: 'Vous avez déjà ce rôle' });
    }

    const existing = await prisma.userRole.findUnique({ where: { userId_role: { userId: req.user.id, role } } });
    if (existing?.status === 'PENDING') {
      return res.status(409).json({ error: 'Une demande pour ce rôle est déjà en attente de validation' });
    }
    if (existing?.status === 'APPROVED') {
      return res.status(409).json({ error: 'Vous avez déjà ce rôle' });
    }

    const status = role === 'FAMILLE' ? 'APPROVED' : 'PENDING';
    const data = { status, decidedBy: null, decidedAt: null, rejectionReason: null };
    const userRole = existing
      ? await prisma.userRole.update({ where: { id: existing.id }, data })
      : await prisma.userRole.create({ data: { userId: req.user.id, role, ...data } });

    if (status === 'APPROVED') {
      const me = await prisma.user.findUnique({ where: { id: req.user.id } });
      try { await sendRoleRequestApprovedEmail(me, SELF_REQUESTABLE_ROLE_LABEL[role]); } catch (e) { console.error('Erreur envoi email rôle ajouté:', e); }
    }

    res.status(201).json({
      role: userRole.role,
      status: userRole.status,
      message: status === 'APPROVED'
        ? 'Rôle ajouté à votre compte.'
        : 'Votre demande a été envoyée au responsable concerné pour validation.',
    });
  } catch (error) {
    console.error('Erreur requestRole:', error);
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
  forgotPassword,
  resetPassword,
  changePassword,
  getProfile,
  updateProfile,
  logout,
  getMyRoleRequests,
  requestRole,
};
