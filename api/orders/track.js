// POST /api/orders/track - customer-facing order status lookup.
// Body: { order_number, email }
// Returns only safe fields - never payment references or full addresses.
const { supabase } = require('../_lib/supabase');
const { ok, fail, readBody, methodNotAllowed } = require('../_lib/respond');

module.exports = async function handler(req) {
  if (req.method === 'OPTIONS') return ok({}, 204);

  if (req.method !== 'POST') return methodNotAllowed(req, ['POST']);

  const body = await readBody(req);
  const orderNumber = String(body.order_number || '').trim().toUpperCase();
  const email = String(body.email || '').trim().toLowerCase();

  if (!orderNumber || !email) {
    return fail('Please enter your order number and email.');
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('id,order_number,customer_name,customer_email,city,state,subtotal,delivery_fee,total_amount,payment_status,payment_method,order_status,created_at, order_items(id,product_name,price,quantity,subtotal,unit,image_url)')
    .eq('order_number', orderNumber)
    .ilike('customer_email', email)
    .maybeSingle();

  if (error) return fail('Something went wrong. Please try again.', 500);
  if (!order) {
    return fail('Order not found. Check the order number and email and try again.', 404);
  }

  return ok({
    order_number: order.order_number,
    customer_name: order.customer_name,
    city: order.city,
    state: order.state,
    subtotal: order.subtotal,
    delivery_fee: order.delivery_fee,
    total_amount: order.total_amount,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    order_status: order.order_status,
    created_at: order.created_at,
    items: order.order_items || []
  });
}