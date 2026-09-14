# IYAWO XSTO — API Reference

All endpoints live under the Vercel deployment (e.g. `https://your-store.vercel.app`).
Admin endpoints require `Authorization: Bearer <supabase_access_token>` from an
admin user. Public endpoints need no token.

Responses are always JSON: `{ "success": true, "data": ... }` or
`{ "success": false, "error": "message" }`.

---

## Health

### `GET /api/health`
Liveness check. No auth.

---

## Products

### `GET /api/products`
Public. Returns active products.

Query parameters:
| Param | Values |
| --- | --- |
| `search` | text, matches product name (case-insensitive) |
| `category` | category slug, e.g. `swiss-lace` |
| `sale` | `true` / `false` |
| `availability` | `in_stock` / `out_of_stock` |
| `featured` | `true` / `false` |
| `min_price` / `max_price` | numbers (on the normal price) |
| `sort` | `newest` (default), `price_asc`, `price_desc` |
| `page` | page number, default `1` |
| `limit` | 1–100, default `24` |

Admin token optional — when supplied, inactive products are included too.

### `GET /api/products/:id` or `/api/products/:slug`
Public. Single active product.

### `POST /api/products`
**Admin.** Create a product. Auto-generates the slug. Body fields:

`name*`, `category*` (slug), `description`, `price*`, `sale_price`,
`is_on_sale`, `price_unit` (default `yard`), `stock_quantity`,
`image_url`, `additional_images` (array), `featured`, `active`,
`wholesale_available`, `retail_available`.

### `PUT /api/products/:id`
**Admin.** Update any of the above fields. Recomputes `stock_status` from
`stock_quantity`.

### `DELETE /api/products/:id`
**Admin.** Soft delete — sets `active = false`.

---

## Categories

### `GET /api/categories`
Public. Active categories ordered by `sort_order`.

### `POST /api/categories`
**Admin.** Body: `name*`, `description`, `image_url`, `sort_order`, `active`.

### `GET /api/categories/:id-or-slug`
Public.

### `PUT /api/categories/:id`
**Admin.** Update fields. Slug auto-generated from name when renamed.

### `DELETE /api/categories/:id`
**Admin.** Soft delete (`active = false`).

---

## Orders

### `POST /api/orders`
Public. Creates an order (used by the WhatsApp checkout flow). The server
re-validates items and prices.

Body:
```json
{
  "items": [{ "product_id": "uuid", "quantity": 3 }],
  "customer_name": "...",
  "customer_phone": "...",
  "customer_email": "...",
  "delivery_address": "...",
  "city": "...",
  "state": "...",
  "delivery_note": "...",
  "payment_method": "whatsapp"
}
```
Returns the created order, items, and server-computed `subtotal`,
`delivery_fee`, `total_amount`. Stock is **not** deducted for WhatsApp orders —
the admin confirms manually.

### `GET /api/orders`
**Admin.** List orders (newest first), including items.

Query params: `status` (order status), `payment_status`, `search`
(order number / name / email), `page`, `limit` (default 25, max 100).

### `GET /api/orders/:id`
**Admin.** Full order with items and delivery details.

### `PUT /api/orders/:id`
**Admin.** Update status. Body:
```json
{ "order_status": "processing" }
```
Allowed statuses: `pending, confirmed, processing, ready_for_delivery,
shipped, delivered, cancelled`. Also accepts `payment_status`
(`pending, paid, failed, refunded`).

### `POST /api/orders/track`
Public. Customer-facing lookup. Body: `{ "order_number": "...", "email": "..." }`.
Returns a safe summary (status, items, totals) — no payment references or
full addresses.

---

## Payments

### `POST /api/payment/initialize`
Public. The full secure checkout entry point:

1. Re-validates every item against the database (active, stock, current price).
2. Applies sale price when applicable; computes subtotal.
3. Computes the delivery fee from the delivery zones (by city/state).
4. Creates the order (`payment_status = pending`) + order items (snapshot).
5. Calls Paystack `transaction/initialize` (amount = total × 100 kobo).
6. Saves the Paystack reference on the order.

Body: same shape as `POST /api/orders` (no `payment_method` needed — defaults to `paystack`).

Response: `{ order_id, order_number, reference, access_code,
authorization_url, subtotal, delivery_fee, total_amount }`.

### `POST /api/payment/verify`
Public. Body: `{ "reference": "..." }`.

1. Verifies the transaction with Paystack.
2. Fails if `status !== "success"` → order marked `failed`.
3. Fails if the paid amount ≠ stored order total.
4. Marks the order `paid` (idempotent — calling twice is safe).
5. Deducts stock atomically per line item via the `decrement_stock` DB function.

Response: the paid order with items.

---

## Delivery

### `GET /api/delivery`
Public. Active delivery zones (used by the cart/checkout pages to show an
estimate; the real fee is always recomputed server-side).

### `PUT /api/delivery`
**Admin.** Replaces the full zone list. Body:
```json
{ "zones": [
  { "zone": "Ilorin", "label": "Ilorin", "fee": 3000,
    "match_cities": ["ilorin"], "match_states": ["kwara"],
    "is_fallback": false, "active": true }
] }
```
One fallback zone is enforced (used when no zone matches).

---

## Dashboard & Admin

### `GET /api/dashboard/stats`
**Admin.** `products`, `products_in_stock`, `products_out_of_stock`, `orders`,
`orders_pending`, `orders_delivered`, `orders_paid`, `total_sales` (paid),
`new_orders_24h` (used for the in-dashboard notification banner),
`recent_orders` (8 latest).

### `GET /api/admin/customers`
**Admin.** Aggregated customers from orders: name, email, phone,
`order_count`, `total_spent` (paid orders only), `last_order_at`.

### `POST /api/admin/register-admin`
Public but guarded by the `ADMIN_INVITE_CODE` env var. Body:
`{ "email", "password", "invite_code" }`. Creates the Supabase user
(auto-confirmed) and adds them to the `admins` table. Disable afterwards by
removing the env var. Legacy alias: `POST /api/auth/register-admin`.

---

## Error messages (customer-safe)

| Situation | Message |
| --- | --- |
| Product unavailable / deleted | `Sorry, this product is currently unavailable.` |
| Not enough stock | `Only 3 yards of "..." are available.` |
| Payment failed / cancelled | `Payment was not completed. Please try again.` |
| Network failure | `Something went wrong. Please check your connection and try again.` |

Technical database errors are never returned to customers.

---

## Supabase pieces used

- **PostgreSQL tables**: `categories`, `products`, `orders`, `order_items`,
  `delivery_config`, `admins`.
- **Row Level Security**: public reads limited to active rows; writes and admin
  reads restricted to `admins` rows.
- **Auth**: Supabase email/password for admins (customer checkout is guest-based;
  `customer_id` is stored when a logged-in user orders).
- **Storage**: public bucket `product-images`, admin-only writes via RLS.
- **Edge logic**: `decrement_stock()` DB function (atomic, service-role only);
  `is_admin()` for RLS policies.