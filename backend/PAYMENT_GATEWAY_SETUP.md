# Payment Gateway Setup

The landing page is already **gateway-ready**.

## Current behavior

- If no payment gateway keys are configured, the public checkout stays in **simulated mode**.
- If you configure **Stripe**, the landing page will redirect clients to a real hosted checkout page and then confirm the payment with the backend before activating the app.

---

## 1) Create a Stripe account

1. Sign up at `https://stripe.com/`
2. Open the **Developers** section
3. Copy these keys:
   - **Publishable key**
   - **Secret key**

> Use test keys first, then switch to live keys when you are ready.

---

## 2) Add these variables to `backend/.env`

```env
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
PUBLIC_FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### For production

Replace `PUBLIC_FRONTEND_URL` with your real landing-page domain, for example:

```env
PUBLIC_FRONTEND_URL=https://buy.yourdomain.com
ALLOWED_ORIGINS=https://buy.yourdomain.com,https://panel.yourdomain.com
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
   - `http://localhost:3000/activate`
2. Select:
   - a public plan
   - an app
   - the client MAC address
   - the app device key
3. Click **Continue to Secure Payment**
4. Complete the Stripe checkout
5. After success, the backend confirms the payment and activates the app for that device

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
- `POST /api/pricing/public/confirm-checkout`

---

## Notes

- Without gateway keys, checkout still works in **simulation mode**.
- With Stripe keys configured, the page switches automatically to **real payment mode**.
- Activations created from the public landing page are stored in the same backend so the admin can track them in the panel.
