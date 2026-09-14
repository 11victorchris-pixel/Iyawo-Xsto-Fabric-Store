// IYAWO XSTO - ORDER CONFIRMATION PAGE
// Owner-only unlock codes: customer NEVER sees code / copy button / unlock link.
// Shows receipt table + totals + pending panel ("Awaiting payment confirmation") when:
//   ?paid=1 OR ?via=whatsapp OR localStorage iyawo_last_paid exists.
// Buttons: Resend receipt (bi-whatsapp), Chat on WhatsApp, Track order.
// Receipt text for resend still includes `Unlock Code: IX-XXXXXX` for the owner.
(function () {
  'use strict';
  const I = window.IYAWO;
  if (!I) return;
  const U = window.IYAWO_UNLOCK || null;

  const params = new URLSearchParams(location.search);
  const orderNumber = params.get('order') || '';
  const reference = params.get('reference') || '';
  const paidParam = params.get('paid') === '1';
  const viaWhatsApp = params.get('via') === 'whatsapp';
  const codeParam = (params.get('code') || '').trim().toUpperCase();

  const content = document.getElementById('confirmationContent');
  const loading = document.getElementById('confirmationLoading');

  function getLastPaid() {
    if (U && U.getLastPaid) return U.getLastPaid();
    try {
      const raw = localStorage.getItem('iyawo_last_paid');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function resolveUnlockCode(savedOrder) {
    if (codeParam) return codeParam;
    if (savedOrder && savedOrder.unlock_code) return String(savedOrder.unlock_code).toUpperCase();
    const lp = getLastPaid();
    if (lp && lp.code) return String(lp.code).toUpperCase();
    return '';
  }

  function buildResendText(order, code) {
    const lp = getLastPaid();
    if (lp && lp.receipt) return lp.receipt;
    const items = (order.items || []).map((it) => ({
      name: it.product_name,
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 0,
      unit: it.unit || 'yard',
      line: Number(it.subtotal) || 0
    }));
    if (U && U.buildReceiptText) {
      return U.buildReceiptText({
        items,
        subtotal: Number(order.subtotal) || 0,
        delivery: Number(order.delivery_fee) || 0,
        total: Number(order.total_amount) || 0,
        unlockCode: code,
        customer: {
          name: order.customer_name || '',
          phone: order.phone || '',
          address: order.address || '',
          city: order.city || '',
          state: order.state || ''
        },
        dateStr: new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
      });
    }
    return 'Hello IYAWO XSTO! New Order\nOrder: ' + order.order_number +
      '\nGRAND TOTAL: ' + I.formatNaira(order.total_amount) +
      (code ? '\nUnlock Code: ' + code : '');
  }

  // ----------------------------------------------------------
  // If we arrived via the Paystack callback with a reference,
  // verify the payment server-side before showing anything.
  // ----------------------------------------------------------
  async function verifyIfNeeded() {
    if (!reference) return null;

    loading.hidden = false;
    try {
      const res = await I.api('/api/payment/verify', {
        method: 'POST',
        body: JSON.stringify({ reference })
      });
      const order = res.data.order;
      I.saveLastOrder({
        order_number: order.order_number,
        email: order.customer_email,
        name: order.customer_name,
        payment_method: 'paystack',
        reference
      });
      I.clearCart();
      return order;
    } catch (err) {
      return { verifyError: err.message };
    } finally {
      loading.hidden = true;
    }
  }

  function statusBadge(label, type) {
    return '<span class="status-badge ' + type + '">' + I.escapeHtml(label) + '</span>';
  }

  function unlockPanelHtml() {
    // Owner-only code: customer never sees code / copy button / unlock link with code.
    return (
      '<div class="status-card mb-4 text-center unlock-pending-panel" style="border:2px dashed #6c757d;">' +
        '<div class="mb-2"><i class="bi bi-hourglass-split fs-1 text-warning"></i></div>' +
        '<h5 class="fw-bold">Awaiting payment confirmation</h5>' +
        '<p class="small text-muted mb-3 text-break">Your receipt was sent to the store. Pay, then the owner will WhatsApp you the unlock link.</p>' +
        '<div class="d-grid gap-2">' +
          '<button type="button" class="btn btn-success w-100" id="resendReceiptBtn" aria-label="Resend receipt via WhatsApp">' +
            '<i class="bi bi-whatsapp"></i> Resend receipt</button>' +
          '<a href="https://wa.me/' + I.WHATSAPP_NUMBER + '" target="_blank" class="btn btn-outline-success w-100" aria-label="Chat on WhatsApp">' +
            '<i class="bi bi-whatsapp"></i> Chat on WhatsApp</a>' +
          '<a href="track-order.html" class="btn btn-dark w-100" aria-label="Track order">' +
            '<i class="bi bi-search"></i> Track order</a>' +
        '</div>' +
      '</div>'
    );
  }

  function render(order) {
    const items = order.items || [];
    const isWhatsApp = order.payment_method === 'whatsapp' || viaWhatsApp;
    const paid = order.payment_status === 'paid' || (paidParam && isWhatsApp);
    // Owner-only: resolve code for resend receipt text only — never render it.
    const resendCode = isWhatsApp || paidParam ? resolveUnlockCode(order._savedRef || null) : '';
    const resendText = (isWhatsApp || paidParam) ? buildResendText(order, resendCode) : '';

    document.title = 'Order ' + order.order_number + ' | IYAWO XSTO Fabric Store';

    content.innerHTML =
      '<div class="confirm-hero">' +
        '<div class="icon-circle' + (isWhatsApp ? ' whatsapp' : '') + '"><i class="bi ' +
          (isWhatsApp ? 'bi-chat-dots' : 'bi-check-lg') + '"></i></div>' +
        '<h1 class="fw-bold" style="color:var(--navy,#0a1238);">ORDER CONFIRMED</h1>' +
        '<p class="text-muted mb-0 text-break">Order number: <strong class="text-break">' + I.escapeHtml(order.order_number) + '</strong></p>' +
        (isWhatsApp
          ? '<p class="small text-muted mt-2"><i class="bi bi-hourglass-split"></i> Awaiting payment confirmation. Your receipt was sent to the store.</p>'
          : '<p class="small text-muted mt-2">Thank you, ' + I.escapeHtml(order.customer_name || '') + '! Your payment was successful.</p>') +
      '</div>' +

      '<div class="row g-4 mt-2">' +
        '<div class="col-lg-7">' +
          '<div class="status-card mb-4">' +
            '<h5 class="fw-bold"><i class="bi bi-receipt"></i> Receipt</h5>' +
            '<div class="table-responsive"><table class="table table-sm align-middle mb-0">' +
              '<thead><tr><th>Item</th><th class="text-end">Qty</th><th class="text-end">Line total</th></tr></thead>' +
              '<tbody>' +
              items.map((item) =>
                '<tr>' +
                  '<td><div class="fw-bold">' + I.escapeHtml(item.product_name) + '</div>' +
                    '<div class="small text-muted">' + I.formatNaira(item.price) + ' / ' + I.escapeHtml(item.unit || 'yard') + '</div></td>' +
                  '<td class="text-end">' + I.formatQty(item.quantity) + ' ' + I.escapeHtml(item.unit || 'yard') + '(s)</td>' +
                  '<td class="text-end"><strong>' + I.formatNaira(item.subtotal) + '</strong></td>' +
                '</tr>'
              ).join('') +
              '</tbody></table></div>' +
            '<div class="summary-row mt-2"><span>Subtotal</span><span>' + I.formatNaira(order.subtotal) + '</span></div>' +
            '<div class="summary-row"><span>Delivery fee</span><span>' + I.formatNaira(order.delivery_fee) + '</span></div>' +
            '<div class="summary-row total"><span>GRAND TOTAL</span><span>' + I.formatNaira(order.total_amount) + '</span></div>' +
          '</div>' +

          '<div class="status-card">' +
            '<h5 class="fw-bold">Delivery Information</h5>' +
            '<div class="small mb-1"><strong>Deliver to:</strong> ' + I.escapeHtml(order.address ? order.address + ', ' : '') + I.escapeHtml(order.city || '') + ', ' + I.escapeHtml(order.state || '') + '</div>' +
            (order.phone ? '<div class="small mb-1"><strong>Phone:</strong> ' + I.escapeHtml(order.phone) + '</div>' : '') +
            '<div class="small mb-3"><strong>Payment:</strong> ' +
              statusBadge(paid ? 'PAID' : String(order.payment_status || 'pending').toUpperCase(), paid ? 'paid' : 'unpaid') +
              (isWhatsApp ? ' <span class="text-muted">(receipt sent via WhatsApp)</span>' : '') +
            '</div>' +
            '<div class="small"><strong>Order status:</strong> ' +
              statusBadge(String(order.order_status || 'pending').replace(/_/g, ' ').toUpperCase(), order.order_status || 'pending') + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="col-lg-5">' +
          ((isWhatsApp || paidParam) ? unlockPanelHtml() : '') +
          '<div class="status-card">' +
            '<h5 class="fw-bold">What happens next?</h5>' +
            '<ul class="small text-muted ps-3 mb-4">' +
              '<li class="mb-2">We will confirm your order and arrange delivery.</li>' +
              '<li class="mb-2">Use your unlock code on the Unlock Package page.</li>' +
              '<li>Questions? Chat with us on WhatsApp.</li>' +
            '</ul>' +
            '<div class="d-grid gap-2">' +
              '<a href="track-order.html" class="btn btn-dark">Track My Order</a>' +
              '<a href="shop.html" class="btn btn-outline-dark">Continue Shopping</a>' +
              '<a href="https://wa.me/' + I.WHATSAPP_NUMBER + '" target="_blank" class="btn btn-success">' +
                '<i class="bi bi-whatsapp"></i> Chat on WhatsApp</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Wire pending-panel buttons (resend receipt to owner; code stays in receipt text only).
    const resendBtn = document.getElementById('resendReceiptBtn');
    if (resendBtn) resendBtn.addEventListener('click', () => {
      const text = buildResendText(order, resendCode);
      if (U && U.openWhatsAppReceipt) U.openWhatsAppReceipt(text);
      else window.open('https://wa.me/' + I.WHATSAPP_NUMBER + '?text=' + encodeURIComponent(text), '_blank');
    });
  }

  function renderVerifyError(message) {
    content.innerHTML =
      '<div class="confirm-hero">' +
        '<div class="icon-circle" style="background:#dc3545;"><i class="bi bi-exclamation-lg"></i></div>' +
        '<h1 class="fw-bold" style="color:var(--navy,#0a1238);">Payment Pending Verification</h1>' +
        '<p class="text-muted mt-3">' + I.escapeHtml(message) + '</p>' +
        '<div class="d-grid gap-2 col-md-5 mx-auto mt-4">' +
          '<a href="track-order.html" class="btn btn-dark">Track My Order</a>' +
          '<a href="https://wa.me/' + I.WHATSAPP_NUMBER + '" target="_blank" class="btn btn-success"><i class="bi bi-whatsapp"></i> Contact Us on WhatsApp</a>' +
        '</div>' +
      '</div>';
  }

  function renderMissing() {
    content.innerHTML =
      '<div class="confirm-hero">' +
        '<div class="icon-circle" style="background:#6c757d;"><i class="bi bi-question-lg"></i></div>' +
        '<h1 class="fw-bold" style="color:var(--navy,#0a1238);">Order Details</h1>' +
        '<p class="text-muted">We could not find the details for this order in this browser.</p>' +
        '<div class="d-grid gap-2 col-md-5 mx-auto mt-4">' +
          '<a href="track-order.html" class="btn btn-dark">Track My Order</a>' +
          '<a href="shop.html" class="btn btn-outline-dark">Continue Shopping</a>' +
        '</div>' +
      '</div>';
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const verified = await verifyIfNeeded();

    if (verified && verified.verifyError) {
      renderVerifyError(verified.verifyError);
      return;
    }

    // 1. Use the just-verified order if available.
    if (verified && verified.order_number) {
      render({
        order_number: verified.order_number,
        customer_name: verified.customer_name,
        payment_status: 'paid',
        payment_method: 'paystack',
        order_status: verified.order_status || 'pending',
        subtotal: verified.subtotal,
        delivery_fee: verified.delivery_fee,
        total_amount: verified.total_amount,
        city: verified.city,
        state: verified.state,
        items: verified.order_items || verified.items || []
      });
      return;
    }

    // 2. Otherwise use the saved session data.
    const saved = I.getLastOrder();
    if (saved && saved.order_number && (!orderNumber || orderNumber === saved.order_number)) {
      render({
        order_number: saved.order_number,
        customer_name: saved.name,
        phone: saved.phone || '',
        address: saved.address || '',
        payment_status: (viaWhatsApp || paidParam) ? (paidParam ? 'paid' : 'pending') : 'paid',
        payment_method: saved.payment_method,
        order_status: 'pending',
        subtotal: Number(saved.subtotal) || 0,
        delivery_fee: Number(saved.delivery_fee) || 0,
        total_amount: Number(saved.total_amount) || (Number(saved.subtotal) || 0) + (Number(saved.delivery_fee) || 0),
        city: saved.city || '',
        state: saved.state || '',
        items: saved.items || [],
        _savedRef: saved
      });
      return;
    }

    // 3. Paid-via-WhatsApp fallback: ?paid=1 / ?via=whatsapp / localStorage last_paid,
    //    even when sessionStorage was cleared (e.g. new tab).
    if (paidParam || viaWhatsApp) {
      const lp = getLastPaid();
      if (lp && lp.code) {
        const lpItems = (lp.items || []).map((it) => ({
          product_name: it.name || it.product_name,
          price: Number(it.price) || 0,
          quantity: Number(it.quantity) || 0,
          unit: it.unit || 'yard',
          subtotal: Number(it.line !== undefined ? it.line : it.subtotal) || 0
        }));
        render({
          order_number: (saved && saved.order_number) || orderNumber || ('WA-' + String(lp.code).replace('IX-', '')),
          customer_name: (lp.customer && lp.customer.name) || (saved && saved.name) || '',
          phone: (lp.customer && lp.customer.phone) || '',
          address: (lp.customer && lp.customer.address) || '',
          payment_status: 'paid',
          payment_method: 'whatsapp',
          order_status: 'pending',
          subtotal: lpItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0),
          delivery_fee: Math.max(0, (Number(lp.total) || 0) - lpItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0)),
          total_amount: Number(lp.total) || 0,
          city: (lp.customer && lp.customer.city) || '',
          state: (lp.customer && lp.customer.state) || '',
          items: lpItems,
          _savedRef: { unlock_code: lp.code }
        });
        return;
      }
      if (saved && saved.order_number) {
        render({
          order_number: saved.order_number,
          customer_name: saved.name,
          payment_status: 'paid',
          payment_method: saved.payment_method || 'whatsapp',
          order_status: 'pending',
          subtotal: Number(saved.subtotal) || 0,
          delivery_fee: Number(saved.delivery_fee) || 0,
          total_amount: Number(saved.total_amount) || 0,
          city: saved.city || '',
          state: saved.state || '',
          items: saved.items || [],
          _savedRef: saved
        });
        return;
      }
    }

    // 4. Last-paid fallback with no query params (e.g. user reopens page).
    const lpOnly = getLastPaid();
    if (lpOnly && lpOnly.code && !orderNumber && !reference) {
      const lpItems = (lpOnly.items || []).map((it) => ({
        product_name: it.name || it.product_name,
        price: Number(it.price) || 0,
        quantity: Number(it.quantity) || 0,
        unit: it.unit || 'yard',
        subtotal: Number(it.line !== undefined ? it.line : it.subtotal) || 0
      }));
      render({
        order_number: 'WA-' + String(lpOnly.code).replace('IX-', ''),
        customer_name: (lpOnly.customer && lpOnly.customer.name) || '',
        phone: (lpOnly.customer && lpOnly.customer.phone) || '',
        address: (lpOnly.customer && lpOnly.customer.address) || '',
        payment_status: 'paid',
        payment_method: 'whatsapp',
        order_status: 'pending',
        subtotal: lpItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0),
        delivery_fee: Math.max(0, (Number(lpOnly.total) || 0) - lpItems.reduce((s, it) => s + (Number(it.subtotal) || 0), 0)),
        total_amount: Number(lpOnly.total) || 0,
        city: (lpOnly.customer && lpOnly.customer.city) || '',
        state: (lpOnly.customer && lpOnly.customer.state) || '',
        items: lpItems,
        _savedRef: { unlock_code: lpOnly.code }
      });
      return;
    }

    renderMissing();
  });
})();
