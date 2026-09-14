// GET /api/orders/:id - full order with items (admin only)
// PUT /api/orders/:id - update order_status / payment_status (admin only)
const { supabase } = require('../_lib/supabase');
const { ok, fail, readBody, methodNotAllowed } = require('../_lib/respond');
const { requireAdmin } = require('../_lib/auth');

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'ready_for_delivery', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

module.exports = async function handler(req) {
  if (req.method === 'OPTIONS') return ok({}, 204);

  const id = decodeURIComponent(req.url.split('/').pop() || '');

  if (req.method === 'GET') return handleGet(id, req);
  if (req.method === 'PUT') return handlePut(id, req);

  return methodNotAllowed(req, ['GET', 'PUT']);
};

async function handleGet(id, req) {
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(auth.error.message, auth.error.status);

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .maybeSingle();

  if (error) return fail('Something went wrong.', 500);
  if (!data) return fail('Order not found.', 404);

  return ok({ order: data });
}

async function handlePut(id, req) {
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(auth.error.message, auth.error.status);

  const body = await readBody(req);
  const updates = {};

  if (body.order_status !== undefined) {
    if (!ORDER_STATUSES.includes(body.order_status)) {
      return fail('Invalid order status.');
    }
    updates.order_status = body.order_status;
  }

  if (body.payment_status !== undefined) {
    if (!PAYMENT_STATUSES.includes(body.payment_status)) {
      return fail('Invalid payment status.');
    }
    updates.payment_status = body.payment_status;
  }

  if (Object.keys(updates).length === 0) {
    return fail('Nothing to update.');
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return fail('Could not update the order. Please try again.', 500);
  return ok({ order: data });
}