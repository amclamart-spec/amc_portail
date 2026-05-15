const crypto = require('crypto');
const config = require('../config');

function hasConfigValue(value) {
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized !== '' && normalized !== 'undefined' && normalized !== 'null';
}

function providerConfigured(provider) {
  if (provider === 'STRIPE') return hasConfigValue(config.payments.stripeSecretKey);
  if (provider === 'GOCARDLESS') return hasConfigValue(config.payments.goCardlessAccessToken);
  if (provider === 'PAYPAL') return hasConfigValue(config.payments.paypalClientId) && hasConfigValue(config.payments.paypalClientSecret);
  return false;
}

function getGoCardlessBaseUrl() {
  return config.payments.goCardlessEnvironment === 'live'
    ? 'https://api.gocardless.com'
    : 'https://api-sandbox.gocardless.com';
}

function toFormUrlEncoded(payload = {}) {
  return Object.entries(payload)
    .flatMap(([key, value]) => {
      if (value === undefined || value === null) return [];
      return [`${encodeURIComponent(key)}=${encodeURIComponent(value)}`];
    })
    .join('&');
}

async function createStripeCheckout({ amount, currency = 'eur', paymentId, returnUrl, cancelUrl, installments = 1, metadata = {} }) {
  if (!hasConfigValue(config.payments.stripeSecretKey)) {
    throw new Error('Clé Stripe non configurée : STRIPE_SECRET_KEY manquante ou invalide');
  }

  const formData = {
    mode: 'payment',
    'success_url': `${returnUrl}?payment_id=${paymentId}`,
    'cancel_url': `${cancelUrl}?payment_id=${paymentId}`,
    'line_items[0][price_data][currency]': currency.toLowerCase(),
    'line_items[0][price_data][product_data][name]': `AMC Inscription #${paymentId}`,
    'line_items[0][price_data][unit_amount]': Math.round(Number(amount) * 100),
    'line_items[0][quantity]': 1,
    'metadata[payment_id]': paymentId,
    'metadata[installments]': installments,
  };

  Object.entries(metadata || {}).forEach(([key, value]) => {
    formData[`metadata[${key}]`] = String(value);
  });

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.payments.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: toFormUrlEncoded(formData),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Erreur Stripe lors de la création Checkout');
  }

  return {
    configured: true,
    provider: 'STRIPE',
    paymentId,
    status: 'CHECKOUT_CREATED',
    externalPaymentId: data.id,
    checkoutUrl: data.url,
    raw: data,
  };
}

async function createGoCardlessRedirectFlow({ paymentId, amount, currency = 'EUR', returnUrl, customer, metadata = {} }) {
  const baseUrl = getGoCardlessBaseUrl();
  const sessionToken = crypto.randomUUID();

  const payload = {
    redirect_flows: {
      description: `AMC inscription ${paymentId}`,
      session_token: sessionToken,
      success_redirect_url: `${returnUrl}?payment_id=${paymentId}`,
      prefilled_customer: {
        given_name: customer?.firstName || 'Parent',
        family_name: customer?.lastName || 'AMC',
        email: customer?.email,
      },
      metadata: {
        payment_id: paymentId,
        amount: String(amount),
        currency,
        ...metadata,
      },
    },
  };

  const response = await fetch(`${baseUrl}/redirect_flows`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.payments.goCardlessAccessToken}`,
      'Content-Type': 'application/json',
      'GoCardless-Version': '2015-07-06',
      'Idempotency-Key': `amc-${paymentId}-${Date.now()}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    const firstError = data?.error?.errors?.[0]?.message;
    throw new Error(firstError || 'Erreur GoCardless lors de la création du mandat');
  }

  const flow = data.redirect_flows;
  return {
    configured: true,
    provider: 'GOCARDLESS',
    paymentId,
    status: 'MANDATE_REDIRECT_CREATED',
    externalPaymentId: flow.id,
    checkoutUrl: flow.redirect_url,
    sessionToken,
    raw: flow,
  };
}

async function createOnlineCheckout({
  provider,
  amount,
  currency = 'EUR',
  paymentId,
  returnUrl,
  cancelUrl,
  installments = 1,
  customer = null,
  metadata = {},
}) {
  if (!providerConfigured(provider)) {
    return {
      configured: false,
      provider,
      paymentId,
      status: 'PENDING_CONFIGURATION',
      message: `Configuration ${provider} manquante. Ajoutez les clés API pour activer le paiement en ligne.`,
    };
  }

  if (provider === 'STRIPE') {
    return createStripeCheckout({ amount, currency, paymentId, returnUrl, cancelUrl, installments, metadata });
  }

  if (provider === 'GOCARDLESS') {
    return createGoCardlessRedirectFlow({
      paymentId,
      amount,
      currency,
      returnUrl,
      customer,
      metadata: {
        installments,
        ...metadata,
      },
    });
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

async function completeGoCardlessRedirectFlow({ redirectFlowId, sessionToken }) {
  const baseUrl = getGoCardlessBaseUrl();

  const response = await fetch(`${baseUrl}/redirect_flows/${redirectFlowId}/actions/complete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.payments.goCardlessAccessToken}`,
      'Content-Type': 'application/json',
      'GoCardless-Version': '2015-07-06',
      'Idempotency-Key': `amc-gocardless-complete-${redirectFlowId}-${Date.now()}`,
    },
    body: JSON.stringify({ session_token: sessionToken }),
  });

  const data = await response.json();
  if (!response.ok) {
    const firstError = data?.error?.errors?.[0]?.message;
    throw new Error(firstError || 'Erreur GoCardless lors de la finalisation du mandat');
  }

  const flow = data.redirect_flows;
  return {
    configured: true,
    provider: 'GOCARDLESS',
    redirectFlowId,
    flow,
  };
}

function verifyStripeWebhookSignature(rawBody, signatureHeader) {
  if (!config.payments.stripeWebhookSecret) return true;
  if (!signatureHeader) return false;

  const payload = rawBody.toString('utf8');
  const elements = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [k, v] = part.split('=');
      return [k, v];
    }),
  );

  if (!elements.t || !elements.v1) return false;
  const signedPayload = `${elements.t}.${payload}`;
  const expected = crypto
    .createHmac('sha256', config.payments.stripeWebhookSecret)
    .update(signedPayload)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(elements.v1));
}

function verifyGoCardlessWebhookSignature(rawBody, signatureHeader) {
  if (!config.payments.goCardlessWebhookSecret) return true;
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', config.payments.goCardlessWebhookSecret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

module.exports = {
  createOnlineCheckout,
  completeGoCardlessRedirectFlow,
  providerConfigured,
  verifyStripeWebhookSignature,
  verifyGoCardlessWebhookSignature,
};
