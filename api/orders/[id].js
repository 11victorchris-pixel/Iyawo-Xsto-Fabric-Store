// GET /api/orders/:id - full order with items (admin only)
// PUT /api/orders/:id - update order_status / payment_status (admin only)
const { getClients } = require('../_lib/supabase');
const { ok, fail, readBody, methodNotAllowed, getIdParam, handleOptions } = require('../_lib/respond');
const { requireAdmin } = require('../_lib/auth');

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'ready_for_delivery', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const { supabase, missing } = getClients();
  if (missing || !supabase) return fail(res, 'Backend is not configured yet.', 500);

  const id = getIdParam(req);
  if (!id) return fail(res, 'Missing order id.', 400);

  if (req.method === 'GET') return handleGet(req, res, supabase, id);
  if (req.method === 'PUT') return handlePut(req, res, supabase, id);

  return methodNotAllowed(res, req, ['GET', 'PUT']);
};

async function handleGet(req, res, supabase, id) {
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(res, auth.error.message, auth.error.status);

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .maybeSingle();

  if (error) return fail(res, 'Something went wrong.', 500);
  if (!data) return fail(res, 'Order not found.', 404);

  return ok(res, { order: data });
}

async function handlePut(req, res, supabase, id) {
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(res, auth.error.message, auth.error.status);

  const body = await readBody(req);
  const updates = {};

  if (body.order_status !== undefined) {
    if (!ORDER_STATUSES.includes(body.order_status)) {
      return fail(res, 'Invalid order status.');
    }
    updates.order_status = body.order_status;
  }

  if (body.payment_status !== undefined) {
    if (!PAYMENT_STATUSES.includes(body.payment_status)) {
      return fail(res, 'Invalid payment status.');
    }
    updates.payment_status = body.payment_status;
  }

  if (Object.keys(updates).length === 0) {
    return fail(res, 'Nothing to update.');
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return fail(res, 'Could not update the order. Please try again.', 500);
  return ok(res, { order: data });
}
