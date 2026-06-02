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

async function createStripeCheckout({ amount, currency = 'eur', paymentId, returnUrl, cancelUrl, installments = 1, paymentMethodType = 'card', metadata = {}, customer = {} }) {
  if (!hasConfigValue(config.payments.stripeSecretKey)) {
    throw new Error('Clé Stripe non configurée : STRIPE_SECRET_KEY manquante ou invalide');
  }

  const normalizedInstallments = Number(installments) || 1;
  const perInstallmentAmount = normalizedInstallments > 1
    ? Math.floor((Number(amount) / normalizedInstallments) * 100) / 100
    : Number(amount);

  const isSepa = paymentMethodType === 'sepa_debit';
  const formData = {
    mode: isSepa ? 'setup' : 'payment',
    'success_url': `${returnUrl}?payment_id=${paymentId}`,
    'cancel_url': `${cancelUrl}?payment_id=${paymentId}`,
    'payment_method_types[0]': paymentMethodType,
    'metadata[payment_id]': paymentId,
    'metadata[installments]': normalizedInstallments,
    'metadata[checkout_amount]': String(amount),
    'metadata[payment_method]': paymentMethodType,
  };

  if (!isSepa) {
    formData['line_items[0][price_data][currency]'] = currency.toLowerCase();
    formData['line_items[0][price_data][product_data][name]'] = normalizedInstallments > 1
      ? `AMC Inscription #${paymentId} — 1/${normalizedInstallments}`
      : `AMC Inscription #${paymentId}`;
    formData['line_items[0][price_data][unit_amount]'] = Math.round(perInstallmentAmount * 100);
    formData['line_items[0][quantity]'] = 1;
  }

  if (isSepa) {
    formData['setup_intent_data[usage]'] = 'off_session';
    formData['setup_intent_data[metadata][payment_id]'] = paymentId;
  } else {
    formData['payment_intent_data[capture_method]'] = 'manual';
  }

  if (customer?.email) {
    formData['customer_email'] = customer.email;
    formData['payment_intent_data[receipt_email]'] = customer.email;
  }

  Object.entries(metadata || {}).forEach(([key, value]) => {
    formData[`metadata[${key}]`] = String(value);
  });

  console.log(`[DEBUG STRIPE] Creating checkout session for paymentId=${paymentId}, amount=${amount}`);
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
    console.error(`[STRIPE CHECKOUT] Erreur création session (status=${response.status}) pour paymentId=${paymentId}:`, data);
    throw new Error(data?.error?.message || `Erreur Stripe lors de la création Checkout (status=${response.status})`);
  }

  let paymentIntentId = null;
  let setupIntentId = null;

  if (data.payment_intent) {
    paymentIntentId = typeof data.payment_intent === 'string'
      ? data.payment_intent
      : data.payment_intent.id || null;
  }

  if (data.setup_intent) {
    setupIntentId = typeof data.setup_intent === 'string'
      ? data.setup_intent
      : data.setup_intent.id || null;
  }

  if ((!paymentIntentId || !setupIntentId) && data.id) {
    try {
      const session = await getStripeCheckoutSession(data.id);
      const sessionPaymentIntent = session.payment_intent;
      paymentIntentId = paymentIntentId || (typeof sessionPaymentIntent === 'string'
        ? sessionPaymentIntent
        : sessionPaymentIntent?.id || null);

      const sessionSetupIntent = session.setup_intent;
      setupIntentId = setupIntentId || (typeof sessionSetupIntent === 'string'
        ? sessionSetupIntent
        : sessionSetupIntent?.id || null);
    } catch (sessionError) {
      console.warn(`[STRIPE CHECKOUT] Impossible de récupérer payment_intent/setup_intent depuis la session ${data.id}:`, sessionError?.message || sessionError);
    }
  }

  return {
    configured: true,
    provider: 'STRIPE',
    paymentId,
    status: 'CHECKOUT_CREATED',
    externalPaymentId: data.id,
    paymentIntentId,
    setupIntentId,
    checkoutUrl: data.url,
    raw: data,
  };
}

async function createStripeCustomer({ email, firstName, lastName, metadata = {} }) {
  if (!hasConfigValue(config.payments.stripeSecretKey)) {
    throw new Error('Clé Stripe non configurée : STRIPE_SECRET_KEY manquante ou invalide');
  }

  const response = await fetch('https://api.stripe.com/v1/customers', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.payments.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: toFormUrlEncoded({
      email,
      name: `${firstName || ''} ${lastName || ''}`.trim(),
      ...Object.fromEntries(Object.entries(metadata || {}).map(([key, value]) => [`metadata[${key}]`, String(value)])),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Erreur Stripe lors de la création du client');
  }

  return data;
}

async function createStripeSepaSetupIntent({ customerId, metadata = {}, ipAddress = null, userAgent = null }) {
  if (!hasConfigValue(config.payments.stripeSecretKey)) {
    throw new Error('Clé Stripe non configurée : STRIPE_SECRET_KEY manquante ou invalide');
  }

  const body = {
    'payment_method_types[0]': 'sepa_debit',
    usage: 'off_session',
    customer: customerId,
    ...Object.fromEntries(Object.entries(metadata || {}).map(([key, value]) => [`metadata[${key}]`, String(value)])),
  };

  const response = await fetch('https://api.stripe.com/v1/setup_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.payments.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: toFormUrlEncoded(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Erreur Stripe lors de la création du SetupIntent');
  }

  return data;
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
  paymentMethodType = 'card',
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
    return createStripeCheckout({ amount, currency, paymentId, paymentMethodType, returnUrl, cancelUrl, installments, metadata, customer });
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

async function captureStripePaymentIntent(paymentIntentId) {
  if (!hasConfigValue(config.payments.stripeSecretKey)) {
    throw new Error('Clé Stripe non configurée : STRIPE_SECRET_KEY manquante ou invalide');
  }

  console.log(`[STRIPE CAPTURE] Tentative de capture du PaymentIntent: ${paymentIntentId}`);
  console.log(`[DEBUG STRIPE] About to capture paymentIntentId=${paymentIntentId}`);
  debugger;

  const response = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.payments.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const data = await response.json();
  
  console.log(`[STRIPE CAPTURE] Réponse Stripe (status=${response.status}):`, data);
  
  if (!response.ok) {
    const errorMsg = data?.error?.message || 'Erreur Stripe lors de la capture du paiement';
    console.error(`[STRIPE CAPTURE] Erreur: ${errorMsg}`, data?.error);
    throw new Error(errorMsg);
  }

  console.log(`[STRIPE CAPTURE] ✅ Capture réussie pour ${paymentIntentId}`);
  return data;
}

async function cancelStripePaymentIntent(paymentIntentId) {
  if (!hasConfigValue(config.payments.stripeSecretKey)) {
    throw new Error('Clé Stripe non configurée : STRIPE_SECRET_KEY manquante ou invalide');
  }

  const response = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.payments.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Erreur Stripe lors de l’annulation du paiement');
  }

  return data;
}

async function getStripePaymentIntent(paymentIntentId) {
  if (!hasConfigValue(config.payments.stripeSecretKey)) {
    throw new Error('Clé Stripe non configurée : STRIPE_SECRET_KEY manquante ou invalide');
  }

  const response = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.payments.stripeSecretKey}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Erreur Stripe lors de la récupération du PaymentIntent');
  }

  return data;
}

async function getStripeCheckoutSession(sessionId) {
  if (!hasConfigValue(config.payments.stripeSecretKey)) {
    throw new Error('Clé Stripe non configurée : STRIPE_SECRET_KEY manquante ou invalide');
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.payments.stripeSecretKey}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Erreur Stripe lors de la récupération de la session Checkout');
  }

  return data;
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
  createStripeCustomer,
  createStripeSepaSetupIntent,
  completeGoCardlessRedirectFlow,
  captureStripePaymentIntent,
  cancelStripePaymentIntent,
  getStripeCheckoutSession,
  getStripePaymentIntent,
  providerConfigured,
  verifyStripeWebhookSignature,
  verifyGoCardlessWebhookSignature,
  getStripeSepaMandateDetailsByChargeId,
};

async function getStripeSepaMandateDetailsByChargeId(chargeId) {
  if (!hasConfigValue(config.payments.stripeSecretKey)) {
    throw new Error('Clé Stripe non configurée : STRIPE_SECRET_KEY manquante ou invalide');
  }

  if (!chargeId) {
    throw new Error('ID de charge Stripe manquant pour récupérer le mandat SEPA');
  }

  const response = await fetch(`https://api.stripe.com/v1/charges/${encodeURIComponent(chargeId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.payments.stripeSecretKey}`,
    },
  });

  const chargeData = await response.json();
  if (!response.ok) {
    throw new Error(chargeData?.error?.message || 'Erreur Stripe lors de la récupération de la charge');
  }

  const sepaMandateId = chargeData.payment_method_details?.sepa_debit?.mandate;
  if (!sepaMandateId) {
    throw new Error('Mandat SEPA non trouvé pour cette charge');
  }

  const mandateResponse = await fetch(`https://api.stripe.com/v1/mandates/${encodeURIComponent(sepaMandateId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.payments.stripeSecretKey}`,
    },
  });

  const mandateData = await mandateResponse.json();
  if (!mandateResponse.ok) {
    throw new Error(mandateData?.error?.message || 'Erreur Stripe lors de la récupération du mandat');
  }

  return {
    charge: chargeData,
    mandate: mandateData,
    sepaMandateId,
    chargeId,
  };
}
