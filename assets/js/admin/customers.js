// IYAWO XSTO - ADMIN CUSTOMERS
(function () {
  'use strict';
  const I = window.IYAWO;
  const H = window.IYAWO_ADMIN_HELPERS;
  if (!I || !H) return;

  const tbody = document.getElementById('customersBody');

  async function load() {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Loading…</td></tr>';

    let res;
    try {
      res = await H.adminApi('/api/admin/customers');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row text-danger">' + I.escapeHtml(err.message) + '</td></tr>';
      return;
    }

    const customers = (res.data && res.data.customers) || [];

    if (customers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No customers yet.</td></tr>';
      return;
    }

    tbody.innerHTML = customers.map((c, i) =>
      '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td><strong>' + I.escapeHtml(c.name || '—') + '</strong></td>' +
        '<td>' + I.escapeHtml(c.email || '—') + '</td>' +
        '<td>' + I.escapeHtml(c.phone || '—') + '</td>' +
        '<td>' + c.order_count + '</td>' +
        '<td><strong>' + H.naira(c.total_spent) + '</strong><div class="muted small">Last order: ' + H.formatDate(c.last_order_at) + '</div></td>' +
      '</tr>'
    ).join('');
  }

  document.addEventListener('DOMContentLoaded', load);
})();