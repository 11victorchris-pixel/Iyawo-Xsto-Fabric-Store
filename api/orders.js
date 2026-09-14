// POST /api/orders - create an order (public; used by the WhatsApp checkout flow)
// GET  /api/orders - list orders (admin only) with filters
const { supabase, supabaseAnon } = require('./_lib/supabase');
const { ok, fail, readBody, methodNotAllowed } = require('./_lib/respond');
const { requireAdmin } = require('./_lib/auth');
const { computeOrder, createOrder } = require('./_lib/order');

module.exports = async function handler(req) {
  if (req.method === 'OPTIONS') return ok({}, 204);

  if (req.method === 'POST') return handlePost(req);
  if (req.method === 'GET') return handleGet(req);

  return methodNotAllowed(req, ['GET', 'POST']);
};

function cleanCustomer(body) {
  return {
    name: String(body.customer_name || '').trim(),
    email: String(body.customer_email || '').trim().toLowerCase(),
    phone: String(body.customer_phone || '').trim()
  };
}

async function handlePost(req) {
  const body = await readBody(req);

  const customer = cleanCustomer(body);
  if (!customer.name || !customer.phone || !customer.email) {
    return fail('Please provide your full name, phone number and email.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return fail('Please provide a valid email address.');
  }

  const delivery = {
    address: String(body.delivery_address || ''),
    city: String(body.city || ''),
    state: String(body.state || ''),
    note: String(body.delivery_note || '')
  };

  // Resolve the customer's Supabase user id if a session was supplied.
  let customerId = null;
  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const { data: userData } = await supabase.auth.getUser(token);
    if (userData && userData.user) customerId = userData.user.id;
  }

  let computed;
  try {
    computed = await computeOrder(supabase, body.items, delivery);
  } catch (err) {
    return fail(err.message, err.status || 400);
  }

  const paymentMethod = body.payment_method === 'whatsapp' ? 'whatsapp' : 'paystack';

  const result = await createOrder(supabase, {
    customer,
    delivery,
    paymentMethod,
    computed,
    customerId
  });

  return ok({
    order: result.order,
    items: result.items,
    subtotal: computed.subtotal,
    delivery_fee: computed.delivery_fee,
    total_amount: computed.total
  }, 201);
}

async function handleGet(req) {
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(auth.error.message, auth.error.status);

  const url = new URL(req.url);
  const params = url.searchParams;

  let query = supabase
    .from('orders')
    .select('*, order_items(id,product_id,product_name,price,quantity,subtotal,unit,image_url)', { count: 'exact' })
    .order('created_at', { ascending: false });

  const status = params.get('status');
  if (status) query = query.eq('order_status', status);

  const paymentStatus = params.get('payment_status');
  if (paymentStatus) query = query.eq('payment_status', paymentStatus);

  const search = params.get('search');
  if (search) query = query.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`);

  const limit = Math.min(Math.max(Number(params.get('limit')) || 25, 1), 100);
  const page = Math.max(Number(params.get('page')) || 1, 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await query.range(from, to);
  if (error) return fail('Something went wrong while loading orders.', 500);

  return ok({ orders: data || [], page, limit, total: count });
}