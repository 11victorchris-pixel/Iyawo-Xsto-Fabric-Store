// IYAWO XSTO - ADMIN DELIVERIES MANAGER
// Sources: iyawo_deliveries (primary ledger) + iyawo_unlock_codes[*].delivery (enrichment)
(function () {
  'use strict';

  var DELIVERIES_KEY = 'iyawo_deliveries';
  var CODES_KEY = 'iyawo_unlock_codes';

  function I() {
    return window.IYAWO || {};
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      var val = JSON.parse(raw);
      return (val === null || val === undefined) ? fallback : val;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function toast(msg, type) {
    var api = I();
    if (api.showToast) api.showToast(msg, type || 'info');
  }

  function esc(s) {
    var api = I();
    if (api.escapeHtml) return api.escapeHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '\u2014';
    try {
      return new Date(iso).toLocaleString('en-NG', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return String(iso);
    }
  }

  function normalizeNaijaPhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.charAt(0) === '0') return '234' + d.slice(1);
    if (d.indexOf('234') === 0) return d;
    if (d.length === 10 && /^[789]/.test(d)) return '234' + d;
    return d;
  }

  function ownerNumber() {
    try {
      var api = I();
      if (api.WHATSAPP_NUMBER) return String(api.WHATSAPP_NUMBER).replace(/\D/g, '') || '2347079057773';
      if (window.IYAWO_CONFIG && window.IYAWO_CONFIG.WHATSAPP_NUMBER) {
        return String(window.IYAWO_CONFIG.WHATSAPP_NUMBER).replace(/\D/g, '') || '2347079057773';
      }
      if (window.IYAWO_UNLOCK && window.IYAWO_UNLOCK.getWhatsAppNumber) {
        return String(window.IYAWO_UNLOCK.getWhatsAppNumber()).replace(/\D/g, '') || '2347079057773';
      }
    } catch (e) { /* ignore */ }
    return '2347079057773';
  }

  // Merge primary ledger with delivery objects attached to unlock-code records.
  function loadRows() {
    var list = readJson(DELIVERIES_KEY, []);
    if (!Array.isArray(list)) list = [];
    var rows = list.slice();

    try {
      var store = readJson(CODES_KEY, {});
      Object.keys(store || {}).forEach(function (code) {
        var rec = store[code] || {};
        var d = rec.delivery;
        if (d && d.reference) {
          var exists = rows.some(function (r) { return r && r.reference === d.reference; });
          if (!exists) {
            var copy = {};
            Object.keys(d).forEach(function (k) { copy[k] = d[k]; });
            if (!copy.code) copy.code = code;
            copy._fromUnlockStore = true;
            rows.push(copy);
          }
        }
      });
    } catch (e) { /* ignore */ }

    rows.sort(function (a, b) {
      var da = a && a.createdAt ? Date.parse(a.createdAt) : 0;
      var db = b && b.createdAt ? Date.parse(b.createdAt) : 0;
      return db - da;
    });
    return rows;
  }

  function statusOf(entry) {
    var s = entry && entry.status ? String(entry.status).toLowerCase() : 'pending';
    if (s === 'delivered') return 'delivered';
    return 'pending';
  }

  function statusPill(status) {
    if (status === 'delivered') return '<span class="pill-badge green">DELIVERED</span>';
    return '<span class="pill-badge orange">PENDING</span>';
  }

  function buildDeliveryText(d) {
    return 'Hello IYAWO XSTO! Delivery details\n' +
      'Reference: ' + (d.reference || '') + '\n' +
      'Unlock Code: ' + (d.code || '') + '\n' +
      'Name: ' + (d.name || '') + '\n' +
      'Phone: ' + (d.phone || '') + '\n' +
      'Address: ' + (d.address || '') + '\n' +
      'City: ' + (d.city || '') + ', ' + (d.state || '') + '\n' +
      'Method: ' + (d.method || '') +
      (d.preferredDate ? '\nPreferred date: ' + d.preferredDate : '') +
      (d.note ? '\nNote: ' + d.note : '');
  }

  function markDelivered(reference) {
    var list = readJson(DELIVERIES_KEY, []);
    if (!Array.isArray(list)) list = [];
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].reference === reference) {
        list[i].status = 'delivered';
        list[i].deliveredAt = new Date().toISOString();
        found = true;
      }
    }
    if (found) writeJson(DELIVERIES_KEY, list);

    // Mirror status onto the unlock-store copy (audit trail).
    try {
      var store = readJson(CODES_KEY, {});
      Object.keys(store || {}).forEach(function (code) {
        var rec = store[code];
        if (rec && rec.delivery && rec.delivery.reference === reference) {
          rec.delivery.status = 'delivered';
          rec.delivery.deliveredAt = rec.delivery.deliveredAt || new Date().toISOString();
        }
      });
      writeJson(CODES_KEY, store);
    } catch (e) { /* ignore */ }
    return found;
  }

  function render() {
    var tbody = document.getElementById('deliveriesBody');
    var searchEl = document.getElementById('deliverySearch');
    var filterEl = document.getElementById('deliveryStatusFilter');
    if (!tbody) return;

    var q = searchEl ? searchEl.value.trim().toLowerCase() : '';
    var statusFilter = filterEl ? filterEl.value : '';
    var owner = ownerNumber();
    var rows = loadRows();

    var filtered = rows.filter(function (d) {
      if (!d) return false;
      if (statusFilter && statusOf(d) !== statusFilter) return false;
      if (q) {
        var hay = [d.reference, d.code, d.name, d.phone, d.city, d.state].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="12" class="empty-row">No deliveries found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(function (d) {
      var custDigits = normalizeNaijaPhone(d.phone);
      var text = buildDeliveryText(d);
      var ownerUrl = 'https://wa.me/' + owner + '?text=' + encodeURIComponent(text);
      var custUrl = custDigits ? 'https://wa.me/' + custDigits + '?text=' + encodeURIComponent(text) : '';
      var st = statusOf(d);
      return '<tr>' +
        '<td><strong>' + esc(d.reference || '\u2014') + '</strong></td>' +
        '<td>' + esc(d.code || '\u2014') + '</td>' +
        '<td>' + (esc(d.name) || '\u2014') + '</td>' +
        '<td>' + (esc(d.phone) || '\u2014') + '</td>' +
        '<td class="small">' + (esc(d.address) || '\u2014') + '</td>' +
        '<td>' + (esc(d.city) || '\u2014') + '</td>' +
        '<td>' + (esc(d.state) || '\u2014') + '</td>' +
        '<td>' + (esc(d.method) || '\u2014') + '</td>' +
        '<td class="small">' + (esc(d.preferredDate) || '\u2014') + '</td>' +
        '<td class="muted small">' + esc(formatDate(d.createdAt)) + '</td>' +
        '<td>' + statusPill(st) + '</td>' +
        '<td class="text-nowrap"><div class="d-flex gap-1 flex-wrap">' +
          '<a class="btn-admin-outline btn-sm" target="_blank" rel="noopener" href="' + ownerUrl + '" title="WhatsApp owner"><i class="bi bi-whatsapp"></i> Owner</a>' +
          (custUrl
            ? '<a class="btn-admin-outline btn-sm" target="_blank" rel="noopener" href="' + custUrl + '" title="WhatsApp customer"><i class="bi bi-whatsapp"></i> Customer</a>'
            : '<button class="btn-admin-outline btn-sm" disabled title="No customer phone"><i class="bi bi-whatsapp"></i> Customer</button>') +
          (st === 'delivered'
            ? '<span class="btn-admin-outline btn-sm" style="opacity:.6;"><i class="bi bi-check2-all"></i> Done</span>'
            : '<button class="btn-admin-outline btn-sm" data-delivered="' + esc(d.reference || '') + '" title="Mark delivered"><i class="bi bi-check2-circle"></i> Delivered</button>') +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  function wire() {
    var tbody = document.getElementById('deliveriesBody');
    var searchEl = document.getElementById('deliverySearch');
    var filterEl = document.getElementById('deliveryStatusFilter');

    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-delivered]');
        if (!btn) return;
        var ref = btn.getAttribute('data-delivered') || '';
        if (!ref) return;
        var ok = markDelivered(ref);
        toast(ok ? 'Marked delivered: ' + ref : 'Delivery not found in local ledger: ' + ref, ok ? 'success' : 'error');
        render();
      });
    }

    var t = null;
    function debounced() {
      if (t) clearTimeout(t);
      t = setTimeout(render, 300);
    }
    if (searchEl) searchEl.addEventListener('input', debounced);
    if (filterEl) filterEl.addEventListener('change', render);
  }

  document.addEventListener('DOMContentLoaded', function () {
    wire();
    render();
  });
})();
