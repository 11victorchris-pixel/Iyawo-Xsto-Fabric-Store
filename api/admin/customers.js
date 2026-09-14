// GET /api/admin/customers - admin only
// Aggregates customers from orders: name, email, phone, order count,
// total spent (paid orders only), last order date.
const { getClients } = require('../_lib/supabase');
const { ok, fail, methodNotAllowed, getQuery, handleOptions } = require('../_lib/respond');
const { requireAdmin } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return methodNotAllowed(res, req, ['GET']);

  const { supabase, missing } = getClients();
  if (missing || !supabase) return fail(res, 'Backend is not configured yet.', 500);

  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(res, auth.error.message, auth.error.status);

  const params = getQuery(req);
  const limit = Math.min(Math.max(Number(params.limit) || 500, 1), 2000);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('customer_email,customer_name,customer_phone,total_amount,payment_status,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return fail(res, 'Something went wrong while loading customers.', 500);

  const map = new Map();

  for (const o of orders || []) {
    const key = String(o.customer_email || '').trim().toLowerCase() || o.customer_name || 'unknown';
    const entry = map.get(key) || {
      email: o.customer_email || '',
      name: o.customer_name || '',
      phone: o.customer_phone || '',
      order_count: 0,
      total_spent: 0,
      last_order_at: null
    };

    entry.order_count += 1;
    entry.name = o.customer_name || entry.name;
    entry.phone = o.customer_phone || entry.phone;
    if (o.payment_status === 'paid') entry.total_spent += Number(o.total_amount) || 0;
    if (!entry.last_order_at || o.created_at > entry.last_order_at) entry.last_order_at = o.created_at;

    map.set(key, entry);
  }

  const customers = [...map.values()]
    .sort((a, b) => b.total_spent - a.total_spent || b.order_count - a.order_count)
    .map((c) => ({
      email: c.email,
      name: c.name,
      phone: c.phone,
      order_count: c.order_count,
      total_spent: Math.round(c.total_spent * 100) / 100,
      last_order_at: c.last_order_at
    }));

  return ok(res, { customers });
};
