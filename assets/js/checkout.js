// IYAWO XSTO - CHECKOUT PAGE
// Primary: Pay & Send Receipt via WhatsApp (payNowBtn) -> receipt +
//          one-time unlock code (IX-XXXXXX), localStorage-backed,
//          graceful without backend.
// Alternative: Pay Online via Paystack (whatsappBtn) if key present.
(function () {
  'use strict';
  const I = window.IYAWO;
  if (!I) return;
  const U = window.IYAWO_UNLOCK || null;

  let zones = [];
  let busy = false;
  let lastReceiptText = '';
  let lastCode = '';

  // ----------------------------------------------------------
  // Guard: empty cart -> cart page
  // ----------------------------------------------------------
  function guard() {
    const cart = I.getCart();
    if (cart.length === 0) {
      location.href = 'cart.html';
      return false;
    }
    return true;
  }

  function cartForApi() {
    return I.getCart().map((item) => ({
      product_id: item.product_id,
      quantity: Number(item.quantity)
    }));
  }

  function readForm() {
    return {
      customer_name: document.getElementById('fullName').value.trim(),
      customer_phone: document.getElementById('phone').value.trim(),
      customer_email: document.getElementById('email').value.trim(),
      delivery_address: document.getElementById('address').value.trim(),
      city: document.getElementById('city').value.trim(),
      state: document.getElementById('state').value,
      delivery_note: document.getElementById('note').value.trim()
    };
  }

  function validate(form) {
    if (!form.customer_name) return 'Please enter your full name.';
    if (!form.customer_phone) return 'Please enter your phone number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customer_email)) return 'Please enter a valid email address.';
    if (!form.delivery_address) return 'Please enter your delivery address.';
    if (!form.city) return 'Please enter your city.';
    if (!form.state) return 'Please select your state.';
    return '';
  }

  // ----------------------------------------------------------
  // Totals (server always recalculates; this is for display)
  // ----------------------------------------------------------
  function currentTotals() {
    const cityEl = document.getElementById('city');
    const stateEl = document.getElementById('state');
    const city = cityEl ? cityEl.value.trim() : '';
    const state = stateEl ? stateEl.value : '';
    const subtotal = I.cartSubtotal();
    const fee = I.estimateDeliveryFee(zones, city, state);
    const grand = fee > 0 ? subtotal + fee : subtotal;
    return { subtotal, fee, grand };
  }

  function refreshTotals() {
    const { subtotal, fee } = currentTotals();
    document.getElementById('checkoutSubtotal').textContent = I.formatNaira(subtotal);
    document.getElementById('checkoutDelivery').textContent = fee > 0 ? I.formatNaira(fee) : 'To be confirmed';
    document.getElementById('checkoutTotal').textContent = I.formatNaira(fee > 0 ? subtotal + fee : subtotal);
    return { subtotal, fee, total: fee > 0 ? subtotal + fee : subtotal };
  }

  function renderItems() {
    const wrap = document.getElementById('checkoutItems');
    const cart = I.getCart();
    wrap.innerHTML = cart.map((item) =>
      '<div class="mini-item">' +
        '<img src="' + I.escapeHtml(I.resolveImage(item.image_url)) + '" alt="' + I.escapeHtml(item.name) + '">' +
        '<div class="flex-grow-1">' +
          '<div class="mini-name">' + I.escapeHtml(item.name) + '</div>' +
          '<div class="mini-sub">' + I.formatNaira(item.price) + ' / ' + I.escapeHtml(item.unit || 'yard') +
            ' × ' + I.formatQty(item.quantity) + '</div>' +
        '</div>' +
        '<strong>' + I.formatNaira((Number(item.price) || 0) * (Number(item.quantity) || 0)) + '</strong>' +
      '</div>'
    ).join('');
  }

  // ----------------------------------------------------------
  // PRIMARY: Pay & Send Receipt via WhatsApp + unlock code
  // ----------------------------------------------------------
  function localItemsSnapshot() {
    return I.getCart().map((item) => ({
      name: item.name,
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 0,
      unit: item.unit || 'yard',
      line: (Number(item.price) || 0) * (Number(item.quantity) || 0)
    }));
  }

  function itemsSummaryText(items) {
    return items.map((it) => it.name + ' x ' + it.quantity).join('; ');
  }

  function generateCode() {
    if (U && U.generateUnlockCode) return U.generateUnlockCode();
    // Fallback (same alphabet, no 0/O 1/I)
    const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let c = 'IX-';
    for (let i = 0; i < 6; i++) c += alpha.charAt(Math.floor(Math.random() * alpha.length));
    return c;
  }

  function persistCode(code, total, items, form) {
    const createdAt = new Date().toISOString();
    const summary = itemsSummaryText(items);
    const customer = {
      name: form.customer_name,
      phone: form.customer_phone,
      email: form.customer_email,
      address: form.delivery_address,
      city: form.city,
      state: form.state
    };
    if (U) {
      U.saveUnlockCode(code, { order_total: total, items_summary: summary, customer, createdAt });
      U.saveLastPaid({
        code,
        total,
        receipt: lastReceiptText,
        customer,
        items,
        createdAt,
        via: 'whatsapp'
      });
    } else {
      try {
        const store = JSON.parse(localStorage.getItem('iyawo_unlock_codes') || '{}');
        store[code] = { order_total: total, items_summary: summary, customer, createdAt, used: false };
        localStorage.setItem('iyawo_unlock_codes', JSON.stringify(store));
        localStorage.setItem('iyawo_last_paid', JSON.stringify({
          code, total, receipt: lastReceiptText, customer, items, createdAt, via: 'whatsapp'
        }));
      } catch (e) { /* storage unavailable */ }
    }
  }

  function buildReceipt(items, subtotal, delivery, grand, form, code) {
    if (U && U.buildReceiptText) {
      return U.buildReceiptText({
        items,
        subtotal,
        delivery,
        total: grand,
        unlockCode: code,
        customer: {
          name: form.customer_name,
          phone: form.customer_phone,
          address: form.delivery_address,
          city: form.city,
          state: form.state
        },
        dateStr: new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
      });
    }
    const lines = items.map((it, i) =>
      (i + 1) + '. ' + it.name + ' x ' + it.quantity + ' ' + (it.unit || 'yard') + '(s) @ ' +
      I.formatNaira(it.price) + '/yard = ' + I.formatNaira(it.line)
    ).join('\n');
    return 'Hello IYAWO XSTO! New Order\nDate: ' + new Date().toLocaleString() + '\n\n' +
      lines + '\n\nSubtotal: ' + I.formatNaira(subtotal) + '\nDelivery: ' +
      (delivery > 0 ? I.formatNaira(delivery) : 'To be confirmed') +
      '\nGRAND TOTAL: ' + I.formatNaira(grand) + '\n\nUnlock Code: ' + code +
      '\n\nName: ' + form.customer_name + '\nPhone: ' + form.customer_phone +
      '\nAddress: ' + form.delivery_address + '\nCity: ' + form.city + ', ' + form.state;
  }

  function openReceipt(text) {
    if (U && U.openWhatsAppReceipt) return U.openWhatsAppReceipt(text);
    window.open('https://wa.me/2347079057773?text=' + encodeURIComponent(text), '_blank');
  }

  function showCodeModal(codeOrGrand, maybeGrand) {
    // Owner-only code: NEVER render the unlock code to the customer.
    // First arg may be (code, grand) from legacy calls — treat last numeric arg as total.
    let grand = maybeGrand;
    if (grand === undefined) grand = codeOrGrand;
    const totalEl = document.getElementById('payUnlockTotal');
    if (totalEl) totalEl.textContent = I.formatNaira(grand);
    const modalEl = document.getElementById('paySuccessModal');
    if (modalEl && window.bootstrap && window.bootstrap.Modal) {
      const m = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      m.show();
    }
  }

  async function payViaWhatsApp(e) {
    if (e) e.preventDefault();
    if (busy) return;
    busy = true;

    const form = readForm();
    const error = validate(form);
    if (error) {
      I.showToast(error, 'warning');
      busy = false;
      return;
    }

    const cart = I.getCart();
    if (cart.length === 0) {
      I.showToast('Your cart is empty.', 'warning');
      busy = false;
      return;
    }

    setButtons(false, 'Preparing receipt...');

    // Try backend order creation first (graceful fallback to local-only).
    let serverOrder = null;
    let serverItems = null;
    let serverTotals = null;
    try {
      const res = await I.api('/api/orders', {
        method: 'POST',
        body: JSON.stringify(Object.assign({}, form, { items: cartForApi(), payment_method: 'whatsapp' }))
      });
      serverOrder = res.data && res.data.order ? res.data.order : null;
      serverItems = res.data && res.data.items ? res.data.items : null;
      serverTotals = res.data || null;
    } catch (err) {
      serverOrder = null; // local-only flow continues below
    }

    const { subtotal: localSub, fee: localFee, grand: localGrand } = currentTotals();

    let items;
    let subtotal = localSub;
    let delivery = localFee;
    let grand = localGrand;
    if (serverItems && serverItems.length) {
      items = serverItems.map((it) => ({
        name: it.product_name,
        price: Number(it.price) || 0,
        quantity: Number(it.quantity) || 0,
        unit: it.unit || 'yard',
        line: Number(it.subtotal) || 0
      }));
      subtotal = Number(serverTotals.subtotal) || localSub;
      delivery = Number(serverTotals.delivery_fee) || localFee;
      grand = Number(serverTotals.total_amount) || localGrand;
    } else {
      items = localItemsSnapshot();
    }

    const code = generateCode();
    lastCode = code;
    lastReceiptText = buildReceipt(items, subtotal, delivery, grand, form, code);
    persistCode(code, grand, items, form);

    I.saveCheckoutDetails(form);
    if (serverOrder) {
      I.saveLastOrder({
        order_number: serverOrder.order_number,
        email: form.customer_email,
        name: form.customer_name,
        payment_method: 'whatsapp',
        items: items.map((it) => ({
          product_name: it.name, price: it.price, quantity: it.quantity, unit: it.unit, subtotal: it.line
        })),
        subtotal, delivery_fee: delivery, total_amount: grand,
        city: form.city, state: form.state,
        unlock_code: code
      });
    } else {
      // Local-only confirmation payload (no backend).
      I.saveLastOrder({
        order_number: 'WA-' + code.replace('IX-', ''),
        email: form.customer_email,
        name: form.customer_name,
        payment_method: 'whatsapp',
        items: items.map((it) => ({
          product_name: it.name, price: it.price, quantity: it.quantity, unit: it.unit, subtotal: it.line
        })),
        subtotal, delivery_fee: delivery, total_amount: grand,
        city: form.city, state: form.state,
        unlock_code: code,
        address: form.delivery_address,
        phone: form.customer_phone
      });
    }

    // Open WhatsApp with the full receipt as a new message.
    // Receipt text (owner copy) still includes `Unlock Code: IX-XXXXXX`.
    openReceipt(lastReceiptText);

    // Owner-only code: show receipt-sent modal (no code rendered) + clear cart.
    showCodeModal(grand);
    I.clearCart();
    renderItems();
    refreshTotals();

    setButtons(true, '');
    busy = false;

    // Continue / auto-redirect to confirmation page (owner-only: strip code from URL).
    const goConfirm = () => {
      location.href = 'order-confirmation.html?paid=1&via=whatsapp';
    };
    const contBtn = document.getElementById('payContinueBtn');
    if (contBtn) contBtn.onclick = goConfirm;
    setTimeout(() => {
      const modalOpen = document.querySelector('#paySuccessModal.show');
      if (!modalOpen) goConfirm();
    }, 12000);
  }

  // ----------------------------------------------------------
  // ALTERNATIVE: Paystack payment (kept, secondary button)
  // ----------------------------------------------------------
  function loadPaystackScript() {
    return new Promise((resolve, reject) => {
      if (window.PaystackPop) return resolve();
      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the payment system. Please try again.'));
      document.head.appendChild(script);
    });
  }

  async function verifyPayment(reference) {
    return I.api('/api/payment/verify', {
      method: 'POST',
      body: JSON.stringify({ reference })
    });
  }

  async function startPaystackPayment(e) {
    if (e) e.preventDefault();
    if (busy) return;
    busy = true;

    const form = readForm();
    const error = validate(form);
    if (error) {
      I.showToast(error, 'warning');
      busy = false;
      return;
    }

    setButtons(false, 'Processing...');

    let init;
    try {
      init = await I.api('/api/payment/initialize', {
        method: 'POST',
        body: JSON.stringify(Object.assign(form, { items: cartForApi() }))
      });
    } catch (err) {
      setButtons(true, '');
      I.showToast(err.message, 'error');
      busy = false;
      return;
    }

    I.saveCheckoutDetails(form);

    try {
      await loadPaystackScript();
      const handler = window.PaystackPop.setup({
        key: I.PAYSTACK_PUBLIC_KEY,
        email: form.customer_email,
        amount: Math.round(Number(init.data.total_amount) * 100),
        currency: 'NGN',
        ref: init.data.reference,
        metadata: {
          custom_fields: [
            { display_name: 'Order Number', variable_name: 'order_number', value: init.data.order_number },
            { display_name: 'Phone', variable_name: 'phone', value: form.customer_phone }
          ]
        },
        onClose: () => {
          setButtons(true, '');
          busy = false;
        },
        callback: (response) => {
          finishPayment(init.data, response.reference || init.data.reference);
        }
      });
      handler.openIframe();
    } catch (err) {
      // Fallback: redirect to Paystack checkout page.
      window.location.href = init.data.authorization_url;
    }
  }

  async function finishPayment(initData, reference) {
    setButtons(false, 'Verifying payment...');
    try {
      const res = await verifyPayment(reference);
      const order = res.data.order;
      I.saveLastOrder({
        order_number: order.order_number,
        email: order.customer_email,
        name: order.customer_name,
        payment_method: 'paystack',
        reference
      });
      I.clearCart();
      location.href = 'order-confirmation.html?order=' + encodeURIComponent(order.order_number) + '&paid=1';
    } catch (err) {
      // Payment may still have succeeded - offer re-verification.
      setButtons(true, '');
      I.showToast(err.message, 'error');
      busy = false;
    }
  }

  function setButtons(enabled, label) {
    const payBtn = document.getElementById('payNowBtn');
    const waBtn = document.getElementById('whatsappBtn');
    if (payBtn) {
      if (label) payBtn.innerHTML = I.escapeHtml(label);
      else payBtn.innerHTML = '<i class="bi bi-whatsapp"></i> Pay &amp; Send Receipt via WhatsApp';
      payBtn.disabled = !enabled;
    }
    if (waBtn) {
      waBtn.innerHTML = '<i class="bi bi-credit-card"></i> Pay Online (Paystack)';
      waBtn.disabled = !enabled;
      // Hide Paystack alternative when no public key is configured.
      const hasKey = !!(I.PAYSTACK_PUBLIC_KEY && !/YOUR_PAYSTACK/i.test(I.PAYSTACK_PUBLIC_KEY));
      waBtn.hidden = !hasKey;
    }
  }

  // ----------------------------------------------------------
  // Init
  // ----------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    if (!guard()) return;

    try {
      zones = await I.loadDeliveryZones();
    } catch (e) {
      zones = [];
    }
    renderItems();
    refreshTotals();

    // Populate the Nigerian states dropdown
    const stateSelect = document.getElementById('state');
    stateSelect.innerHTML = '<option value="">Select state…</option>' +
      I.NIGERIAN_STATES.map((s) => '<option value="' + I.escapeHtml(s) + '">' + I.escapeHtml(s) + '</option>').join('');

    // Prefill saved details
    const saved = I.getCheckoutDetails();
    if (saved.customer_name) document.getElementById('fullName').value = saved.customer_name;
    if (saved.customer_phone) document.getElementById('phone').value = saved.customer_phone;
    if (saved.customer_email) document.getElementById('email').value = saved.customer_email;
    if (saved.delivery_address) document.getElementById('address').value = saved.delivery_address;
    if (saved.city) document.getElementById('city').value = saved.city;
    if (saved.state) document.getElementById('state').value = saved.state;

    document.getElementById('city').addEventListener('input', refreshTotals);
    document.getElementById('state').addEventListener('change', refreshTotals);

    // Primary: WhatsApp receipt + unlock code. Alternative: Paystack.
    document.getElementById('payNowBtn').addEventListener('click', payViaWhatsApp);
    document.getElementById('whatsappBtn').addEventListener('click', startPaystackPayment);
    setButtons(true, '');

    // Modal helpers: resend receipt to owner (code stays inside receipt text only).
    const resendBtn = document.getElementById('payResendBtn');
    if (resendBtn) resendBtn.addEventListener('click', () => {
      if (lastReceiptText) openReceipt(lastReceiptText);
    });
  });
})();
