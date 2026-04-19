const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { PrismaClient } = require('@prisma/client');
const config = require('./index');

const prisma = new PrismaClient();

function splitDisplayName(displayName = '') {
  const tokens = displayName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { firstName: 'Utilisateur', lastName: 'Google' };
  }
  if (tokens.length === 1) {
    return { firstName: tokens[0], lastName: 'Google' };
  }
  return {
    firstName: tokens[0],
    lastName: tokens.slice(1).join(' '),
  };
}

function configurePassport() {
  if (!config.google.clientId || !config.google.clientSecret || !config.google.callbackUrl) {
    console.warn('⚠️ Google OAuth non configuré (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL manquants)');
    return passport;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const primaryEmailObject = profile.emails?.find((email) => email.verified) || profile.emails?.[0];
          const email = primaryEmailObject?.value?.toLowerCase().trim();

          if (!email) {
            return done(null, false, { message: 'Votre compte Google ne fournit pas d’email.' });
          }

          if (!primaryEmailObject?.verified) {
            return done(null, false, { message: 'Votre adresse email Google doit être vérifiée.' });
          }

          const googleId = profile.id;

          // 1) Utilisateur déjà lié via googleId
          const linkedByGoogleId = await prisma.user.findUnique({ where: { googleId } });
          if (linkedByGoogleId) {
            const updatedUser = await prisma.user.update({
              where: { id: linkedByGoogleId.id },
              data: {
                emailVerified: true,
                provider: linkedByGoogleId.provider || 'google',
                firstName: linkedByGoogleId.firstName || profile.name?.givenName || splitDisplayName(profile.displayName).firstName,
                lastName: linkedByGoogleId.lastName || profile.name?.familyName || splitDisplayName(profile.displayName).lastName,
              },
            });
            return done(null, updatedUser);
          }

          // 2) Liaison automatique si même email
          const existingEmailUser = await prisma.user.findUnique({ where: { email } });
          if (existingEmailUser) {
            const linkedUser = await prisma.user.update({
              where: { id: existingEmailUser.id },
              data: {
                googleId,
                emailVerified: true,
                provider: existingEmailUser.provider || 'local',
              },
            });
            return done(null, linkedUser, { linked: true });
          }

          // 3) Création automatique utilisateur Google
          const fallbackName = splitDisplayName(profile.displayName);
          const createdUser = await prisma.user.create({
            data: {
              email,
              googleId,
              provider: 'google',
              firstName: profile.name?.givenName || fallbackName.firstName,
              lastName: profile.name?.familyName || fallbackName.lastName,
              emailVerified: true,
              role: 'FAMILLE',
              validationStatus: 'PENDING',
            },
          });

          return done(null, createdUser, { created: true });
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => done(null, { id }));

  return passport;
}

module.exports = configurePassport;
