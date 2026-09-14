// IYAWO XSTO - ADMIN ORDERS
(function () {
  'use strict';
  const I = window.IYAWO;
  const H = window.IYAWO_ADMIN_HELPERS;
  if (!I || !H) return;

  const tbody = document.getElementById('ordersBody');
  const statusFilter = document.getElementById('orderStatusFilter');
  const searchInput = document.getElementById('orderSearch');
  const detailBody = document.getElementById('orderDetailBody');

  const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'ready_for_delivery', 'shipped', 'delivered', 'cancelled'];

  async function loadOrders() {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Loading…</td></tr>';

    const q = new URLSearchParams({ limit: '100' });
    const status = statusFilter.value;
    if (status) q.set('status', status);
    const search = searchInput.value.trim();
    if (search) q.set('search', search);

    let res;
    try {
      res = await H.adminApi('/api/orders?' + q.toString());
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-row text-danger">' + I.escapeHtml(err.message) + '</td></tr>';
      return;
    }

    const orders = (res.data && res.data.orders) || [];

    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No orders found.</td></tr>';
      return;
    }

    tbody.innerHTML = orders.map((o) => {
      const itemCount = (o.order_items || []).length;
      return '<tr>' +
        '<td><strong>' + I.escapeHtml(o.order_number) + '</strong><div class="muted small">' + H.formatDate(o.created_at) + '</div></td>' +
        '<td>' + I.escapeHtml(o.customer_name) + '<div class="muted small">' + I.escapeHtml(o.customer_email) + '</div></td>' +
        '<td>' + I.escapeHtml(o.customer_phone) + '</td>' +
        '<td>' + (itemCount ? itemCount + ' item(s)' : '—') + '</td>' +
        '<td><strong>' + H.naira(o.total_amount) + '</strong></td>' +
        '<td>' + H.statusPill(o.payment_status) + (o.payment_method === 'whatsapp' ? ' ' + H.statusPill('whatsapp') : '') + '</td>' +
        '<td>' + H.statusPill(o.order_status) + '</td>' +
        '<td class="text-nowrap"><button class="btn-admin-outline btn-sm" data-view="' + o.id + '">View</button></td>' +
      '</tr>';
    }).join('');
  }

  async function openDetail(id) {
    let res;
    try {
      res = await H.adminApi('/api/orders/' + id);
    } catch (err) {
      I.showToast(err.message, 'error');
      return;
    }

    const o = res.data.order;
    const items = o.order_items || [];

    detailBody.innerHTML =
      '<div class="row g-3 mb-3">' +
        '<div class="col-md-4"><div class="muted small">ORDER NUMBER</div><strong>' + I.escapeHtml(o.order_number) + '</strong></div>' +
        '<div class="col-md-4"><div class="muted small">DATE</div><strong>' + H.formatDate(o.created_at) + '</strong></div>' +
        '<div class="col-md-4"><div class="muted small">PAYMENT</div>' +
          H.statusPill(o.payment_status) + ' ' + (o.payment_method === 'whatsapp' ? H.statusPill('whatsapp') : '') +
          (o.payment_reference ? '<div class="muted small mt-1">' + I.escapeHtml(o.payment_reference) + '</div>' : '') +
        '</div>' +
      '</div>' +

      '<h6 class="fw-bold mt-3">Items</h6>' +
      items.map((item) =>
        '<div class="d-flex justify-content-between align-items-center py-2" style="border-bottom:1px dashed #e6e2da;">' +
          '<div>' +
            '<div class="fw-bold">' + I.escapeHtml(item.product_name) + '</div>' +
            '<div class="muted small">' + H.naira(item.price) + ' / ' + I.escapeHtml(item.unit || 'yard') +
              ' × ' + I.formatQty(item.quantity) + '</div>' +
          '</div>' +
          '<strong>' + H.naira(item.subtotal) + '</strong>' +
        '</div>'
      ).join('') +

      '<div class="d-flex justify-content-between py-2"><span class="muted">Subtotal</span><span>' + H.naira(o.subtotal) + '</span></div>' +
      '<div class="d-flex justify-content-between py-2"><span class="muted">Delivery</span><span>' + H.naira(o.delivery_fee) + '</span></div>' +
      '<div class="d-flex justify-content-between py-2 fw-bold"><span>Total</span><span>' + H.naira(o.total_amount) + '</span></div>' +

      '<h6 class="fw-bold mt-4">Customer</h6>' +
      '<div class="small">' + I.escapeHtml(o.customer_name) + '</div>' +
      '<div class="small">' + I.escapeHtml(o.customer_phone) + '</div>' +
      '<div class="small">' + I.escapeHtml(o.customer_email) + '</div>' +

      '<h6 class="fw-bold mt-4">Delivery</h6>' +
      '<div class="small">' + I.escapeHtml(o.delivery_address || '—') + '</div>' +
      '<div class="small">' + I.escapeHtml(o.city || '') + ', ' + I.escapeHtml(o.state || '') + '</div>' +
      (o.delivery_note ? '<div class="small muted mt-1">Note: ' + I.escapeHtml(o.delivery_note) + '</div>' : '') +

      '<h6 class="fw-bold mt-4">Update Status</h6>' +
      '<div class="d-flex gap-2 flex-wrap">' +
        ORDER_STATUSES.map((s) =>
          '<button class="btn-admin-outline btn-sm status-btn' + (s === o.order_status ? ' active' : '') + '" data-order="' + o.id + '" data-status="' + s + '">' +
            s.replace(/_/g, ' ').toUpperCase() + '</button>'
        ).join('') +
      '</div>';

    const modal = new bootstrap.Modal(document.getElementById('orderModal'));
    modal.show();

    detailBody.querySelectorAll('.status-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await H.adminApi('/api/orders/' + btn.dataset.order, {
            method: 'PUT',
            body: JSON.stringify({ order_status: btn.dataset.status })
          });
          I.showToast('Order status updated.', 'success');
          modal.hide();
          loadOrders();
        } catch (err) {
          I.showToast(err.message, 'error');
        }
      });
    });
  }

  function wire() {
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (btn) openDetail(btn.dataset.view);
    });

    statusFilter.addEventListener('change', loadOrders);
    searchInput.addEventListener('input', debounce(loadOrders, 400));
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    wire();
    loadOrders();
  });
})();