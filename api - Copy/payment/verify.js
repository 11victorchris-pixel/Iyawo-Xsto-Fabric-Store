// POST /api/payment/verify
// Flow: server asks Paystack whether the transaction succeeded, checks
// the amount matches the stored order, marks the order PAID and only
// then decrements stock atomically per item.
const { getClients } = require('../_lib/supabase');
const { ok, fail, readBody, methodNotAllowed, handleOptions } = require('../_lib/respond');

const PAYSTACK_API = 'https://api.paystack.co';

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, req, ['POST']);

  const { supabase, missing } = getClients();
  if (missing || !supabase) return fail(res, 'Backend is not configured yet.', 500);

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return fail(res, 'Payment is not configured yet. Please contact the store.', 500);
  }

  const body = await readBody(req);
  const reference = String(body.reference || '').trim();
  if (!reference) return fail(res, 'Missing payment reference.');

  // 1. Ask Paystack about this transaction.
  let verifyData;
  try {
    const r = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    verifyData = await r.json();
  } catch (err) {
    return fail(res, 'Something went wrong. Please check your connection and try again.', 500);
  }

  if (!verifyData || !verifyData.status || !verifyData.data || verifyData.data.status !== 'success') {
    // Payment did not complete - mark the order failed if we know it.
    await supabase
      .from('orders')
      .update({ payment_status: 'failed' })
      .eq('payment_reference', reference);
    return fail(res, 'Payment was not completed. Please try again.', 400);
  }

  // 2. Find the order for this reference.
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('payment_reference', reference)
    .maybeSingle();

  if (orderError || !order) {
    return fail(res, 'Order not found for this payment.', 404);
  }

  // 3. Idempotent - already verified/paid.
  if (order.payment_status === 'paid') {
    return ok(res, { order });
  }

  // 4. Amount must match exactly (kobo).
  const expectedKobo = Math.round(Number(order.total_amount) * 100);
  if (verifyData.data.amount !== expectedKobo) {
    return fail(res, 'Payment amount does not match the order. Please contact the store.', 400);
  }

  // 5. Mark paid.
  const { error: paidError } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', payment_reference: reference })
    .eq('id', order.id);

  if (paidError) {
    return fail(res, 'Could not confirm your payment. Please contact the store.', 500);
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

  return ok(res, {
    order: finalOrder || order,
    stock_warnings: stockFailures
  });
};
