// POST /api/payment/verify
// Flow: server asks Paystack whether the transaction succeeded, checks
// the amount matches the stored order, marks the order PAID and only
// then decrements stock atomically per item.
const { supabase } = require('../_lib/supabase');
const { ok, fail, readBody, methodNotAllowed } = require('../_lib/respond');

const PAYSTACK_API = 'https://api.paystack.co';

module.exports = async function handler(req) {
  if (req.method === 'OPTIONS') return ok({}, 204);
  if (req.method !== 'POST') return methodNotAllowed(req, ['POST']);

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return fail('Payment is not configured yet. Please contact the store.', 500);
  }

  const body = await readBody(req);
  const reference = String(body.reference || '').trim();
  if (!reference) return fail('Missing payment reference.');

  // 1. Ask Paystack about this transaction.
  let verifyData;
  try {
    const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    verifyData = await res.json();
  } catch (err) {
    return fail('Something went wrong. Please check your connection and try again.', 500);
  }

  if (!verifyData || !verifyData.status || !verifyData.data || verifyData.data.status !== 'success') {
    // Payment did not complete - mark the order failed if we know it.
    await supabase
      .from('orders')
      .update({ payment_status: 'failed' })
      .eq('payment_reference', reference);
    return fail('Payment was not completed. Please try again.', 400);
  }

  // 2. Find the order for this reference.
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('payment_reference', reference)
    .maybeSingle();

  if (orderError || !order) {
    return fail('Order not found for this payment.', 404);
  }

  // 3. Idempotent - already verified/paid.
  if (order.payment_status === 'paid') {
    return ok({ order });
  }

  // 4. Amount must match exactly (kobo).
  const expectedKobo = Math.round(Number(order.total_amount) * 100);
  if (verifyData.data.amount !== expectedKobo) {
    return fail('Payment amount does not match the order. Please contact the store.', 400);
  }

  // 5. Mark paid.
  const { error: paidError } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', payment_reference: reference })
    .eq('id', order.id);

  if (paidError) {
    return fail('Could not confirm your payment. Please contact the store.', 500);
  }

  // 6. Decrement stock atomically for each line item.
  const stockFailures = [];
  for (const item of order.order_items || []) {
    if (!item.product_id) continue;
    const { data: okFlag, error: stockError } = await supabase.rpc('decrement_stock', {
      p_product_id: item.product_id,
      p_quantity: Number(item.quantity)
    });
    if (stockError || okFlag === false) {
      stockFailures.push(item.product_name);
    }
  }

  // Payment succeeded, so the order stands. If any stock deduction
  // failed (e.g. stock sold out in the seconds between payment and
  // verification), the admin sees the order and resolves it manually.

  // Refresh the order so the response carries final state + items.
  const { data: finalOrder } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', order.id)
    .maybeSingle();

  return ok({
    order: finalOrder || order,
    stock_warnings: stockFailures
  });
}