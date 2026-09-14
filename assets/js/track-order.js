// IYAWO XSTO - TRACK ORDER PAGE
(function () {
  'use strict';
  const I = window.IYAWO;
  if (!I) return;

  const form = document.getElementById('trackForm');
  const result = document.getElementById('trackResult');
  const orderNumberInput = document.getElementById('orderNumber');
  const emailInput = document.getElementById('email');

  const STATUS_STEPS = ['pending', 'confirmed', 'processing', 'ready_for_delivery', 'shipped', 'delivered'];

  function statusBadge(label, type) {
    return '<span class="status-badge ' + type + '">' + I.escapeHtml(label) + '</span>';
  }

  function renderTimeline(order) {
    const currentIndex = STATUS_STEPS.indexOf(order.order_status);
    const cancelled = order.order_status === 'cancelled';

    const steps = STATUS_STEPS.map((step, i) => {
      const done = !cancelled && currentIndex >= 0 && i <= currentIndex;
      const current = !cancelled && i === currentIndex;
      return (
        '<div class="d-flex align-items-center mb-3">' +
          '<span style="width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:800;flex-shrink:0;' +
            (done ? 'background:#198754;color:#fff;' : 'background:#eee;color:#888;') + '">' +
            (done ? '✓' : i + 1) +
          '</span>' +
          '<div class="ms-3">' +
            '<div class="fw-bold" style="' + (current ? 'color:#d97706;' : '') + '">' +
              I.escapeHtml(step.replace(/_/g, ' ').toUpperCase()) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    if (cancelled) {
      return '<div class="alert alert-danger">This order was cancelled.</div>';
    }
    return steps;
  }

  async function onSubmit(e) {
    e.preventDefault();

    const orderNumber = orderNumberInput.value.trim();
    const email = emailInput.value.trim();

    if (!orderNumber || !email) {
      I.showToast('Please enter your order number and email.', 'warning');
      return;
    }

    result.innerHTML =
      '<div class="text-center py-4"><div class="spinner-border text-warning" role="status">' +
      '<span class="visually-hidden">Loading...</span></div></div>';

    let res;
    try {
      res = await I.api('/api/orders/track', {
        method: 'POST',
        body: JSON.stringify({ order_number: orderNumber, email })
      });
    } catch (err) {
      result.innerHTML =
        '<div class="alert alert-danger">' + I.escapeHtml(err.message) + '</div>';
      return;
    }

    const o = res.data;

    result.innerHTML =
      '<div class="row g-4">' +
        '<div class="col-lg-6">' +
          '<div class="status-card">' +
            '<h5 class="fw-bold mb-3">' + I.escapeHtml(o.order_number) + '</h5>' +
            '<div class="mb-2">' +
              statusBadge(o.order_status.replace(/_/g, ' ').toUpperCase(), o.order_status) + ' ' +
              statusBadge(o.payment_status.toUpperCase(), o.payment_status === 'paid' ? 'paid' : 'unpaid') +
            '</div>' +
            '<div class="small text-muted mb-1">Placed on ' + new Date(o.created_at).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' }) + '</div>' +
            '<div class="small text-muted mb-3">Deliver to: ' + I.escapeHtml(o.city || '') + ', ' + I.escapeHtml(o.state || '') + '</div>' +
            '<div class="summary-row"><span>Subtotal</span><span>' + I.formatNaira(o.subtotal) + '</span></div>' +
            '<div class="summary-row"><span>Delivery</span><span>' + I.formatNaira(o.delivery_fee) + '</span></div>' +
            '<div class="summary-row total"><span>Total</span><span>' + I.formatNaira(o.total_amount) + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="col-lg-6">' +
          '<div class="status-card">' +
            '<h5 class="fw-bold mb-4">Order Progress</h5>' +
            renderTimeline(o) +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="text-center mt-4">' +
        '<a href="shop.html" class="btn btn-dark me-2">Continue Shopping</a>' +
        '<a href="https://wa.me/' + I.WHATSAPP_NUMBER + '" target="_blank" class="btn btn-success"><i class="bi bi-whatsapp"></i> Questions? WhatsApp Us</a>' +
      '</div>';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(location.search);
    const order = params.get('order');
    if (order) orderNumberInput.value = order;
    form.addEventListener('submit', onSubmit);
  });
})();