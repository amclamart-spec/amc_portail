require('dotenv').config();

module.exports = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  email: {
    provider: process.env.EMAIL_PROVIDER || 'ABACUS',
    fromName: process.env.EMAIL_FROM_NAME || 'AMC Portail',
    fromEmail: process.env.EMAIL_FROM_EMAIL || 'noreply@amc.fr',
  },

  abacusEmail: {
    apiBaseUrl: process.env.ABACUS_EMAIL_API_BASE_URL || 'https://apps.abacus.ai',
    endpoint: process.env.ABACUS_EMAIL_API_ENDPOINT || '/api/v0/send-email',
    apiKey: process.env.ABACUS_API_KEY,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  payments: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    stripePublicKey: process.env.STRIPE_PUBLIC_KEY,
    goCardlessAccessToken: process.env.GOCARDLESS_ACCESS_TOKEN,
    goCardlessWebhookSecret: process.env.GOCARDLESS_WEBHOOK_SECRET,
    goCardlessEnvironment: process.env.GOCARDLESS_ENVIRONMENT || 'sandbox',
    paypalClientId: process.env.PAYPAL_CLIENT_ID,
    paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET,
    paypalMode: process.env.PAYPAL_MODE || 'sandbox',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback',
  },
};