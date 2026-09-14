// POST /api/orders - create an order (public; used by the WhatsApp checkout flow)
// GET  /api/orders - list orders (admin only) with filters
const { getClients } = require('./_lib/supabase');
const { ok, fail, readBody, methodNotAllowed, getQuery, getAuthHeader, handleOptions } = require('./_lib/respond');
const { requireAdmin } = require('./_lib/auth');
const { computeOrder, createOrder } = require('./_lib/order');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'GET') return handleGet(req, res);

  return methodNotAllowed(res, req, ['GET', 'POST']);
};

function cleanCustomer(body) {
  return {
    name: String(body.customer_name || '').trim(),
    email: String(body.customer_email || '').trim().toLowerCase(),
    phone: String(body.customer_phone || '').trim()
  };
}

async function handlePost(req, res) {
  const { supabase, missing } = getClients();
  if (missing || !supabase) return fail(res, 'Backend is not configured yet.', 500);
  const body = await readBody(req);

  const customer = cleanCustomer(body);
  if (!customer.name || !customer.phone || !customer.email) {
    return fail(res, 'Please provide your full name, phone number and email.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return fail(res, 'Please provide a valid email address.');
  }

  const delivery = {
    address: String(body.delivery_address || ''),
    city: String(body.city || ''),
    state: String(body.state || ''),
    note: String(body.delivery_note || '')
  };

  // Resolve the customer's Supabase user id if a session was supplied.
  let customerId = null;
  const header = getAuthHeader(req) || '';
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const { data: userData } = await supabase.auth.getUser(token);
    if (userData && userData.user) customerId = userData.user.id;
  }

  let computed;
  try {
    computed = await computeOrder(supabase, body.items, delivery);
  } catch (err) {
    return fail(res, err.message, err.status || 400);
  }

  const paymentMethod = body.payment_method === 'whatsapp' ? 'whatsapp' : 'paystack';

  const result = await createOrder(supabase, {
    customer,
    delivery,
    paymentMethod,
    computed,
    customerId
  }).catch((err) => ({ err }));

  if (result && result.err) {
    return fail(res, result.err.message || 'Could not create your order.', result.err.status || 500);
  }

  return ok(res, {
    order: result.order,
    items: result.items,
    subtotal: computed.subtotal,
    delivery_fee: computed.delivery_fee,
    total_amount: computed.total
  }, 201);
}

async function handleGet(req, res) {
  const { supabase, missing } = getClients();
  if (missing || !supabase) return fail(res, 'Backend is not configured yet.', 500);
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(res, auth.error.message, auth.error.status);

  const params = getQuery(req);
  const get = (k) => (params[k] !== undefined ? String(params[k]) : null);

  let query = supabase
    .from('orders')
    .select('*, order_items(id,product_id,product_name,price,quantity,subtotal,unit,image_url)', { count: 'exact' })
    .order('created_at', { ascending: false });

  const status = get('status');
  if (status) query = query.eq('order_status', status);

  const paymentStatus = get('payment_status');
  if (paymentStatus) query = query.eq('payment_status', paymentStatus);

  const search = get('search');
  if (search) query = query.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`);

  const limit = Math.min(Math.max(Number(get('limit')) || 25, 1), 100);
  const page = Math.max(Number(get('page')) || 1, 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await query.range(from, to);
  if (error) return fail(res, 'Something went wrong while loading orders.', 500);

  return ok(res, { orders: data || [], page, limit, total: count });
}
