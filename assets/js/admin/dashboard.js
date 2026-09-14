// IYAWO XSTO - ADMIN DASHBOARD
(function () {
  'use strict';
  const I = window.IYAWO;
  const H = window.IYAWO_ADMIN_HELPERS;
  if (!I || !H) return;

  async function load() {
    let stats;
    try {
      const res = await H.adminApi('/api/dashboard/stats');
      stats = res.data;
    } catch (err) {
      document.getElementById('statsRow').innerHTML =
        '<div class="col-12"><div class="panel text-danger">' + I.escapeHtml(err.message) + '</div></div>';
      return;
    }

    document.getElementById('statProducts').textContent = stats.products;
    document.getElementById('statInStock').textContent = stats.products_in_stock;
    document.getElementById('statOutStock').textContent = stats.products_out_of_stock;
    document.getElementById('statOrders').textContent = stats.orders;
    document.getElementById('statPending').textContent = stats.orders_pending;
    document.getElementById('statDelivered').textContent = stats.orders_delivered;
    document.getElementById('statPaid').textContent = stats.orders_paid;
    document.getElementById('statSales').textContent = H.naira(stats.total_sales);

    // Notifications (in-dashboard only, per spec)
    const notifBox = document.getElementById('notificationBox');
    if (stats.new_orders_24h > 0) {
      notifBox.hidden = false;
      notifBox.innerHTML =
        '<i class="bi bi-bell"></i> ' + stats.new_orders_24h +
        ' new order(s) in the last 24 hours. <a href="orders.html" class="fw-bold text-decoration-underline">Review now</a>';
    } else {
      notifBox.hidden = true;
    }

    // Recent orders
    const tbody = document.getElementById('recentOrders');
    const orders = stats.recent_orders || [];

    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No orders yet.</td></tr>';
      return;
    }

    tbody.innerHTML = orders.map((o) =>
      '<tr>' +
        '<td><strong>' + o.order_number + '</strong></td>' +
        '<td>' + I.escapeHtml(o.customer_name) + '</td>' +
        '<td>' + I.escapeHtml(o.customer_phone) + '</td>' +
        '<td>' + H.naira(o.total_amount) + '</td>' +
        '<td>' + H.statusPill(o.payment_status) + '</td>' +
        '<td>' + H.statusPill(o.order_status) + '</td>' +
      '</tr>'
    ).join('');
  }

  document.addEventListener('DOMContentLoaded', load);
})();