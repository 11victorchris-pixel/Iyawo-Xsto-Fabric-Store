// POST /api/payment/initialize
// Flow: frontend sends the raw cart -> server re-validates products,
// stock and prices -> creates the order -> initializes a Paystack
// transaction -> returns authorization_url + access_code.
//
// The amount paid is ALWAYS recalculated on the server. Never trust
// prices or totals coming from the browser.
const { supabase } = require('../_lib/supabase');
const { ok, fail, readBody, methodNotAllowed } = require('../_lib/respond');
const { computeOrder, createOrder, makePaymentReference } = require('../_lib/order');

const PAYSTACK_API = 'https://api.paystack.co';

module.exports = async function handler(req) {
  if (req.method === 'OPTIONS') return ok({}, 204);
  if (req.method !== 'POST') return methodNotAllowed(req, ['POST']);

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return fail('Payment is not configured yet. Please contact the store.', 500);
  }

  const body = await readBody(req);

  const email = String(body.customer_email || '').trim().toLowerCase();
  const name = String(body.customer_name || '').trim();
  const phone = String(body.customer_phone || '').trim();

  if (!name || !phone || !email) {
    return fail('Please provide your full name, phone number and email.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail('Please provide a valid email address.');
  }

  const delivery = {
    address: String(body.delivery_address || ''),
    city: String(body.city || ''),
    state: String(body.state || ''),
    note: String(body.delivery_note || '')
  };

  // 1. Recalculate everything from the database.
  let computed;
  try {
    computed = await computeOrder(supabase, body.items, delivery);
  } catch (err) {
    return fail(err.message, err.status || 400);
  }

  // 2. Create the order (pending payment).
  let order;
  try {
    const result = await createOrder(supabase, {
      customer: { name, email, phone },
      delivery,
      paymentMethod: 'paystack',
      computed,
      customerId: null
    });
    order = result.order;
  } catch (err) {
    return fail(err.message, err.status || 400);
  }

  const reference = makePaymentReference();

  // 3. Initialize the Paystack transaction.
  const origin = new URL(req.url).origin;
  const callbackBase = process.env.SITE_URL || origin;
  const callbackUrl =
    `${callbackBase}/order-confirmation.html?order=${encodeURIComponent(order.order_number)}&reference=${encodeURIComponent(reference)}`;

  let paystackRes;
  try {
    paystackRes = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        amount: Math.round(computed.total * 100), // Paystack uses kobo
        currency: 'NGN',
        reference,
        callback_url: callbackUrl,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          custom_fields: [
            { display_name: 'Customer Name', variable_name: 'customer_name', value: name },
            { display_name: 'Phone', variable_name: 'customer_phone', value: phone }
          ]
        }
      })
    });
  } catch (err) {
    await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id);
    return fail('Something went wrong. Please check your connection and try again.', 500);
  }

  let paystackData;
  try {
    paystackData = await paystackRes.json();
  } catch (err) {
    await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id);
    return fail('Payment could not be started. Please try again.', 500);
  }

  if (!paystackData.status) {
    await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id);
    return fail('Payment could not be started. Please try again.', 502);
  }

  // 4. Save the reference so verification can find this order.
  await supabase
    .from('orders')
    .update({ payment_reference: reference })
    .eq('id', order.id);

  return ok({
    order_id: order.id,
    order_number: order.order_number,
    reference,
    access_code: paystackData.data.access_code,
    authorization_url: paystackData.data.authorization_url,
    subtotal: computed.subtotal,
    delivery_fee: computed.delivery_fee,
    total_amount: computed.total
  }, 201);
}