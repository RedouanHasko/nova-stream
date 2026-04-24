# Payment Gateway Setup

The landing page is already **gateway-ready**.

## Current behavior

- If no payment gateway keys are configured, the public checkout stays in **manual test mode** when `ALLOW_MANUAL_PAYMENT_TESTING=true`.
- If you configure **Stripe**, the landing page redirects clients to Stripe Hosted Checkout.
- Card details are entered only on Stripe, never on your landing page or backend.
- Stripe sends the payment result to a backend webhook, and only the backend activates the device after that server-to-server confirmation.

---

## 1) Create a Stripe account

1. Sign up at `https://stripe.com/`
2. Open the **Developers** section
3. Copy these keys:
   - **Publishable key**
   - **Secret key**
4. Create a webhook endpoint in Stripe for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
5. Point the webhook to:
   - `https://your-backend-domain/api/pricing/public/stripe/webhook`
6. Copy the **Webhook signing secret**

> Use test keys first, then switch to live keys when you are ready.

---

## 2) Add these variables to `backend/.env`

```env
PAYMENT_PROVIDER=stripe
ALLOW_MANUAL_PAYMENT_TESTING=false
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
PUBLIC_FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### For local development without Stripe yet

```env
PAYMENT_PROVIDER=manual
ALLOW_MANUAL_PAYMENT_TESTING=true
PUBLIC_FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

In this mode, the public checkout button still works, but the backend marks the activation as a development manual-test purchase instead of redirecting to Stripe.

### For production

Replace `PUBLIC_FRONTEND_URL` with your real landing-page domain, for example:

```env
PUBLIC_FRONTEND_URL=https://buy.yourdomain.com
ALLOWED_ORIGINS=https://buy.yourdomain.com,https://panel.yourdomain.com
STRIPE_WEBHOOK_SECRET=whsec_live_webhook_secret_here
```

---

## 3) Restart the backend

From the `backend` folder:

```powershell
npm run dev
```

or

```powershell
npm start
```

---

## 4) Test the public landing page

1. Open the landing page:
   - `http://localhost:3000/device/activate`
2. Select:
   - a public plan
   - an app
   - the client MAC address
   - the app device key
3. Click **Continue to Secure Payment**
4. Complete the Stripe checkout
5. After success, Stripe notifies your backend webhook
6. The backend validates the webhook signature, records the paid checkout, and activates the app for that device

---

## 5) Make sure you have data in the panel

Before selling to clients, make sure:

- you created at least one **active pricing plan** in the admin panel
- you created at least one **active application** in the admin panel

The landing page pulls both lists directly from the backend.

---

## API endpoints used by the landing page

- `GET /api/pricing/public`
- `GET /api/applications/public`
- `GET /api/pricing/public/payment-config`
- `POST /api/pricing/public/:id/checkout`
- `GET /api/pricing/public/checkout-status/:sessionId`
- `POST /api/pricing/public/stripe/webhook`

---

## Notes

- Without gateway keys, checkout can still work in **manual test mode** if `ALLOW_MANUAL_PAYMENT_TESTING=true`.
- With Stripe keys configured, the page switches automatically to **real payment mode**.
- Keep `ALLOW_MANUAL_PAYMENT_TESTING=false` in production.
- Do not build card input fields on the landing page. Use Stripe Hosted Checkout or Stripe Elements tokenization only.
- The frontend should only redirect to Stripe and read backend status. It should never decide whether a payment succeeded.
- Activations created from the public landing page are stored in the same backend so the admin can track them in the panel.
