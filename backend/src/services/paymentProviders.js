const crypto = require('crypto');
const config = require('../config');

function providerConfigured(provider) {
  if (provider === 'STRIPE') return Boolean(config.payments.stripeSecretKey);
  if (provider === 'PAYPAL') return Boolean(config.payments.paypalClientId && config.payments.paypalClientSecret);
  return false;
}

async function createOnlineCheckout({ provider, amount, currency = 'EUR', paymentId, returnUrl, cancelUrl }) {
  if (!providerConfigured(provider)) {
    return {
      configured: false,
      provider,
      paymentId,
      status: 'PENDING_CONFIGURATION',
      message: `Configuration ${provider} manquante. Ajoutez les clés API pour activer le paiement en ligne.`,
    };
  }

  const fakeExternalId = `${provider.toLowerCase()}_${crypto.randomUUID()}`;
  return {
    configured: true,
    provider,
    paymentId,
    externalPaymentId: fakeExternalId,
    status: 'CHECKOUT_CREATED',
    checkoutUrl: `${returnUrl}?payment_ref=${fakeExternalId}&amount=${amount}&currency=${currency}`,
    cancelUrl,
  };
}

module.exports = {
  createOnlineCheckout,
  providerConfigured,
};
