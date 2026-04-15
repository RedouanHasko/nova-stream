const STRIPE_API_BASE = "https://api.stripe.com/v1";

function getPaymentProvider() {
  return (process.env.PAYMENT_PROVIDER || "manual")
    .toString()
    .trim()
    .toLowerCase();
}

function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function isGatewayConfigured() {
  const provider = getPaymentProvider();
  if (provider === "stripe") {
    return isStripeConfigured();
  }
  return false;
}

function getPublicOrigin(req) {
  return (
    process.env.PUBLIC_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");
}

function getPaymentConfig() {
  const provider = getPaymentProvider();

  return {
    provider,
    configured: isGatewayConfigured(),
    mode: isGatewayConfigured() ? "gateway" : "simulation",
    publishableKey:
      provider === "stripe" ? process.env.STRIPE_PUBLISHABLE_KEY || null : null,
  };
}

async function createStripeCheckoutSession({
  amount,
  currency,
  description,
  successUrl,
  cancelUrl,
  metadata = {},
  customerEmail,
}) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", successUrl);
  body.set("cancel_url", cancelUrl);
  body.set("line_items[0][price_data][currency]", currency.toLowerCase());
  body.set("line_items[0][price_data][product_data][name]", description);
  body.set("line_items[0][price_data][unit_amount]", String(amount));
  body.set("line_items[0][quantity]", "1");

  if (customerEmail) {
    body.set("customer_email", customerEmail);
  }

  Object.entries(metadata).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    body.set(`metadata[${key}]`, String(value));
  });

  const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || "Failed to create Stripe checkout session",
    );
  }

  return {
    provider: "stripe",
    checkoutUrl: payload.url,
    sessionId: payload.id,
    raw: payload,
  };
}

async function createCheckoutSession(req, details) {
  const provider = getPaymentProvider();

  if (provider === "stripe" && isStripeConfigured()) {
    const publicOrigin = getPublicOrigin(req);
    const session = await createStripeCheckoutSession({
      amount: details.amount,
      currency: details.currency,
      description: details.description,
      customerEmail: details.customerEmail,
      metadata: details.metadata,
      successUrl: `${publicOrigin}/activate?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${publicOrigin}/activate?checkout=cancelled`,
    });

    return {
      mode: "redirect",
      configured: true,
      provider,
      ...session,
    };
  }

  return {
    mode: "simulation",
    configured: false,
    provider,
  };
}

async function verifyCheckoutSession(sessionId) {
  const provider = getPaymentProvider();

  if (provider !== "stripe") {
    throw new Error("No live payment provider is configured yet");
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const response = await fetch(
    `${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    },
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.error?.message || "Failed to verify the checkout session",
    );
  }

  return {
    provider,
    paid: payload.payment_status === "paid" || payload.status === "complete",
    sessionId: payload.id,
    paymentStatus: payload.payment_status || payload.status || "unknown",
    customerEmail:
      payload.customer_details?.email || payload.customer_email || null,
    metadata: payload.metadata || {},
    raw: payload,
  };
}

module.exports = {
  getPaymentConfig,
  isGatewayConfigured,
  createCheckoutSession,
  verifyCheckoutSession,
};
