// Shared, server-side order logic. The frontend never decides prices:
// every amount is recalculated from the database here.
const { loadZones, computeDeliveryFee } = require('./delivery');

function unitPrice(product) {
  if (product.is_on_sale && Number(product.sale_price) > 0) {
    return Number(product.sale_price);
  }
  return Number(product.price);
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function makeOrderNumber() {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `IX-${time}-${rand}`;
}

function makePaymentReference() {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `IXP-${time}-${rand}`;
}

// items: [{ product_id, quantity }]
// Returns { order_row, items, subtotal, delivery_fee, total }
// or throws { message, status } with a customer-friendly message.
async function computeOrder(supabase, items, deliveryInfo) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('Your cart is empty.');
    err.status = 400;
    throw err;
  }

  const cleanItems = [];
  for (const item of items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      const err = new Error('Please choose a valid quantity.');
      err.status = 400;
      throw err;
    }
    cleanItems.push({ product_id: String(item.product_id || item.id || ''), quantity: qty });
  }

  const ids = [...new Set(cleanItems.map((i) => i.product_id))];
  const { data: products, error } = await supabase
    .from('products')
    .select('id,name,slug,category,description,price,sale_price,is_on_sale,price_unit,' +
            'stock_quantity,stock_status,image_url,wholesale_available,retail_available,active')
    .in('id', ids);

  if (error) {
    const err = new Error('Something went wrong. Please check your connection and try again.');
    err.status = 500;
    throw err;
  }

  const byId = {};
  for (const p of products || []) byId[p.id] = p;

  const orderItems = [];
  let subtotal = 0;

  for (const item of cleanItems) {
    const product = byId[item.product_id];
    if (!product || !product.active) {
      const err = new Error('Sorry, this product is currently unavailable.');
      err.status = 400;
      throw err;
    }

    const available = Number(product.stock_quantity) || 0;
    if (product.stock_status === 'out_of_stock' || available <= 0) {
      const err = new Error(`"${product.name}" is currently out of stock.`);
      err.status = 400;
      throw err;
    }
    if (item.quantity > available) {
      const err = new Error(`Only ${available} ${product.price_unit}s of "${product.name}" are available.`);
      err.status = 400;
      throw err;
    }

    const price = unitPrice(product);
    const lineTotal = round2(price * item.quantity);
    subtotal = round2(subtotal + lineTotal);

    orderItems.push({
      product_id: product.id,
      product_name: product.name,
      product_slug: product.slug,
      price,
      quantity: item.quantity,
      subtotal: lineTotal,
      unit: product.price_unit || 'yard',
      image_url: product.image_url
    });
  }

  const zones = await loadZones(supabase);
  const deliveryFee = round2(
    computeDeliveryFee(zones, deliveryInfo && deliveryInfo.city, deliveryInfo && deliveryInfo.state)
  );
  const total = round2(subtotal + deliveryFee);

  return {
    items: orderItems,
    subtotal,
    delivery_fee: deliveryFee,
    total
  };
}

// Inserts the order + order items and returns the full order.
async function createOrder(supabase, { customer, delivery, paymentMethod, computed, customerId }) {
  const orderNumber = makeOrderNumber();
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      customer_id: customerId || null,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      delivery_address: delivery.address || '',
      city: delivery.city || '',
      state: delivery.state || '',
      delivery_note: delivery.note || '',
      subtotal: computed.subtotal,
      delivery_fee: computed.delivery_fee,
      total_amount: computed.total,
      payment_status: 'pending',
      payment_method: paymentMethod,
      order_status: 'pending'
    })
    .select()
    .single();

  if (orderError) {
    const err = new Error('Could not create your order. Please try again.');
    err.status = 500;
    throw err;
  }

  const items = computed.items.map((item) => Object.assign({}, item, { order_id: order.id }));
  const { error: itemsError } = await supabase.from('order_items').insert(items);
  if (itemsError) {
    const err = new Error('Could not save your order items. Please try again.');
    err.status = 500;
    throw err;
  }

  return { order, items };
}

module.exports = { unitPrice, round2, makeOrderNumber, makePaymentReference, computeOrder, createOrder };