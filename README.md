# IYAWO XSTO FABRIC STORE — E-Commerce Backend

This adds a complete backend + e-commerce layer to the **existing** Iyawo Xsto static website.
The original design, branding and pages are preserved. No framework migration was made.

```
CUSTOMER
   ↓
IYAWO XSTO FRONTEND (existing static pages + new shop/cart/checkout pages)
   ↓
VERCEL SERVERLESS API  (/api/*)  ← keeps PAYSTACK_SECRET_KEY server-side
   ↓
SUPABASE  (PostgreSQL + Auth + Storage + Row Level Security)
```

## What was added

| Area | Files |
| --- | --- |
| Database schema + RLS + seed | `supabase/migrations/001_init.sql` |
| Secure backend (Vercel functions) | `api/**` |
| Dynamic shop / product pages | `shop.html`, `product.html` + `assets/js/shop.js`, `product.js` |
| Cart | `cart.html` + `assets/js/cart.js` (localStorage) |
| Checkout + Paystack | `checkout.html` + `assets/js/checkout.js` |
| Order confirmation + tracking | `order-confirmation.html`, `track-order.html` |
| Admin dashboard | `admin/*` (login, dashboard, products, orders, customers, categories, delivery) |
| Browser config | `assets/js/config.js` (public keys only) |

The existing pages (`index.html`, `sale.html`, category pages, contact, about, etc.) are untouched
except for `index.html`, which got a small cart link + badge in the navbar (no design change).

---

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard and create a project named **Iyawo Xsto Fabric Store**.
   The free plan is enough to start.
2. Open **SQL Editor** and run the whole file `supabase/migrations/001_init.sql`.
   This creates all tables, indexes, triggers, RLS policies, the `product-images` storage
   bucket, and seeds the categories, delivery zones and sample products (16 products using
   the prices already shown on the website).
3. Copy these values from **Project Settings → API**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (public)
   - `SUPABASE_SERVICE_ROLE_KEY` (SECRET — never expose in the browser)

## 2. Paystack (TEST mode first)

1. Create a Paystack account and go to **Settings → API Keys & Webhooks**.
2. Copy the **TEST** keys:
   - `PAYSTACK_PUBLIC_KEY` (starts with `pk_test_`)
   - `PAYSTACK_SECRET_KEY` (starts with `sk_test_`)
3. No bank details are hard-coded anywhere. Payment configuration happens in your
   Paystack account only.

## 3. Configure the frontend (public keys only)

Edit `assets/js/config.js` and paste:

```js
window.IYAWO_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_ANON_PUBLIC_KEY",
  PAYSTACK_PUBLIC_KEY: "YOUR_PAYSTACK_PUBLIC_TEST_KEY",
  WHATSAPP_NUMBER: "2347079057773",   // existing store number - do not change
  WHATSAPP_DISPLAY: "0707 905 7773"
};
```

Only public keys go in this file. It is safe to commit, but never put
`SUPABASE_SERVICE_ROLE_KEY` or `PAYSTACK_SECRET_KEY` in any frontend file.

## 4. Deploy to Vercel

1. Push this repository to GitHub and import it in Vercel, **or** keep using your
   existing Vercel project and replace the files.
2. In **Project → Settings → Environment Variables**, add:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (secret) |
| `PAYSTACK_PUBLIC_KEY` | Paystack test public key |
| `PAYSTACK_SECRET_KEY` | Paystack test secret key |
| `ADMIN_INVITE_CODE` | a one-time code, e.g. `iyawo-admin-2026` |
| `SITE_URL` | optional — your production URL, e.g. `https://iyawo-xsto-fabric-store-49ey.vercel.app` |

3. Redeploy. The `package.json` + `vercel.json` are already set up so Vercel
   compiles the `/api` functions automatically. No framework config needed.
4. Open `/api/health` — you should see `{"success":true,"data":{"status":"ok",...}}`.

## 5. Create the first admin

Option A (recommended, invite code):
1. Go to `/admin/login` (or `/admin`).
2. Click **"First time? Create admin account"**.
3. Enter the admin email, a password (min 8 chars), and the `ADMIN_INVITE_CODE` value.
4. Sign in with those details.

Option B (manual, via Supabase):
1. Supabase dashboard → **Authentication → Users → Add user** (email + password,
   confirm email).
2. In the SQL editor run:
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'you@yourstore.com';
   ```

After creating the admin, remove `ADMIN_INVITE_CODE` from Vercel env vars to lock
down registration.

## 6. Verify the flow

See the checklist below. The seeded products appear on `/shop` immediately after
deployment. Add your own products from **Admin → Products**.

---

## Security notes (how this spec is satisfied)

- **Secrets never reach the browser.** The service-role key and Paystack secret key
  only exist as Vercel environment variables, used by `/api` functions.
- **Prices are never trusted from the frontend.** `/api/payment/initialize` reloads
  each product from the database, checks `active`, checks stock, applies the current
  sale price, computes subtotal + delivery fee, and only then creates the order and
  the Paystack transaction with that amount.
- **Orders are only PAID after server-side verification.** `/api/payment/verify`
  asks Paystack for the transaction, confirms `status === "success"` and that the
  amount matches the stored order (in kobo), then marks the order paid.
- **Stock is deducted atomically after payment** via a database function
  (`decrement_stock`) guarded so only the service role can call it. The check
  `WHERE stock_quantity >= p_quantity` prevents overselling.
- **Row Level Security** is enabled on every table. Anonymous users can only read
  active products/categories/delivery zones and their own orders. Only rows in the
  `admins` table can write or see admin data.
- **Order items snapshot** the product name, price, unit and image at purchase time,
  so later price changes never alter historical orders.
- **Soft deletion** — products/categories are deactivated (`active = false`), never
  hard-deleted, so order history stays intact.
- **No bank details in the frontend.** Payment setup is done in the Paystack account.

## Optional: notify the admin of new orders

In-dashboard notifications are built in (Admin → Dashboard banner for orders in the
last 24 hours). To extend to WhatsApp/email later, add a step to the
`/api/payment/verify` and `/api/orders` functions (e.g. call the WhatsApp Business
API or Resend) — no paid service is introduced in this version.

---

## Testing checklist (from the spec)

### Products
- [ ] Admin can add a product (Admin → Products → Add Product)
- [ ] Product appears on `/shop` and its category page
- [ ] Admin can edit a product (price, stock, sale, images)
- [ ] Admin can deactivate a product — it disappears from the website
- [ ] Product images upload to Supabase Storage and display
- [ ] Categories work and new categories can be added from Admin → Categories
- [ ] Sale pricing shows crossed-out original + sale price
- [ ] Stock: quantity 0 shows OUT OF STOCK and blocks purchase

### Cart
- [ ] Add to cart works from shop + product pages
- [ ] Remove works
- [ ] + / − quantity works and never exceeds stock (message shown)
- [ ] Cart survives refresh (localStorage)
- [ ] Subtotal + delivery + total calculate correctly

### Checkout
- [ ] Customer details form works and validates
- [ ] Order is created with correct products, prices and quantities
- [ ] WhatsApp order option opens WhatsApp with the prepared message
- [ ] The order appears in Admin → Orders

### Payment (Paystack TEST mode)
- [ ] PAY NOW opens the Paystack test checkout
- [ ] Failed payment handled with a friendly message
- [ ] Successful payment verified server-side
- [ ] Order becomes PAID only after verification
- [ ] Stock decreases after a successful payment
- [ ] Order confirmation page shows order number, items, amount, status

### Admin
- [ ] Admin login works
- [ ] Non-admin users cannot access `/admin` (redirected to login)
- [ ] Orders appear with customer, items, amounts, payment status
- [ ] Admin can update order status
- [ ] Products can be managed

### Security
- [ ] No secret keys in frontend code (check `assets/js/config.js`)
- [ ] Customers cannot modify products or payment status (RLS + API auth)
- [ ] Customers cannot read other customers' data (order tracking requires
      order number + email; admin APIs require an admin token)

---

## Project structure

```
api/                  Vercel serverless functions (secure backend)
  _lib/               shared helpers (supabase client, auth, orders, delivery)
  products.js         GET (public filters) / POST (admin)
  products/[id].js    GET / PUT / DELETE (soft)
  categories.js       GET / POST
  categories/[id].js  GET / PUT / DELETE (soft)
  orders.js           POST (WhatsApp order) / GET (admin list)
  orders/[id].js      GET / PUT (status) - admin
  orders/track.js     POST - customer tracking lookup
  payment/initialize.js   validates + creates order + starts Paystack
  payment/verify.js       verifies with Paystack + marks paid + deducts stock
  delivery.js         GET (public zones) / PUT (admin)
  dashboard/stats.js  GET - admin dashboard numbers
  admin/customers.js  GET - aggregated customers
  admin/register-admin.js  POST - first admin via invite code
  health.js           liveness check
supabase/migrations/001_init.sql   full schema + RLS + seed
admin/                admin dashboard pages
assets/js/            store frontend scripts
assets/css/           shop.css + admin.css (new)
```

See `API.md` for the full API reference.