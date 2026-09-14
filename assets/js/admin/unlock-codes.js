// IYAWO XSTO - ADMIN UNLOCK CODES MANAGER
// Storage keys: iyawo_unlock_codes, iyawo_used_codes, iyawo_last_paid
// Single-use preserved: burn writes used:true + usedAt + ledger push
// (reuses IYAWO_UNLOCK.markUnlockCodeUsed when available).
(function () {
  'use strict';

  var CODES_KEY = 'iyawo_unlock_codes';
  var USED_KEY = 'iyawo_used_codes';
  var LAST_PAID_KEY = 'iyawo_last_paid';

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

  function naira(n) {
    var api = I();
    if (api.formatNaira) return api.formatNaira(n);
    return '\u20A6' + (Number(n) || 0).toLocaleString('en-NG');
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

  // Normalize NG phones: 0XXXXXXXXXX -> 234XXXXXXXXXX (for wa.me links).
  function normalizeNaijaPhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.charAt(0) === '0') return '234' + d.slice(1);
    if (d.indexOf('234') === 0) return d;
    if (d.length === 10 && /^[789]/.test(d)) return '234' + d;
    return d;
  }

  function unlockPageUrl(code) {
    var base = location.href.replace(/admin\/[^/]*$/, '');
    return base + 'unlock-package.html?code=' + encodeURIComponent(code);
  }

  function copyText(text) {
    text = String(text == null ? '' : text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return fallbackCopy(text); }
      );
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch (e) {
      return false;
    }
  }

  // Merge iyawo_last_paid as a row when it is not already in the store.
  function loadRows() {
    var store = readJson(CODES_KEY, {});
    if (!store || typeof store !== 'object') store = {};
    var usedList = readJson(USED_KEY, []);
    if (!Array.isArray(usedList)) usedList = [];

    var rows = Object.keys(store).map(function (code) {
      var rec = store[code] || {};
      var customer = rec.customer || {};
      var used = rec.used === true || usedList.indexOf(code) !== -1;
      return {
        code: code,
        name: customer.name || customer.customer_name || rec.customerName || '',
        phone: customer.phone || customer.customer_phone || rec.customerPhone || '',
        total: Number(rec.order_total != null ? rec.order_total : rec.total) || 0,
        createdAt: rec.createdAt || '',
        used: used,
        source: 'store'
      };
    });

    try {
      var last = readJson(LAST_PAID_KEY, null);
      if (last && last.code) {
        var lc = String(last.code).trim().toUpperCase();
        var exists = rows.some(function (r) { return r.code === lc; });
        if (!exists && lc) {
          var lUsed = usedList.indexOf(lc) !== -1;
          var lcust = last.customer || {};
          rows.push({
            code: lc,
            name: lcust.name || last.customerName || last.name || '',
            phone: lcust.phone || last.customerPhone || last.phone || '',
            total: Number(last.total != null ? last.total : last.order_total) || 0,
            createdAt: last.createdAt || '',
            used: lUsed,
            source: 'last_paid'
          });
        }
      }
    } catch (e) { /* ignore */ }

    rows.sort(function (a, b) {
      var da = a.createdAt ? Date.parse(a.createdAt) : 0;
      var db = b.createdAt ? Date.parse(b.createdAt) : 0;
      return db - da;
    });
    return rows;
  }

  function burnCode(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return;
    if (window.IYAWO_UNLOCK && window.IYAWO_UNLOCK.markUnlockCodeUsed) {
      window.IYAWO_UNLOCK.markUnlockCodeUsed(code);
      return;
    }
    var store = readJson(CODES_KEY, {});
    if (store[code]) {
      store[code].used = true;
      store[code].usedAt = new Date().toISOString();
      writeJson(CODES_KEY, store);
    }
    var usedList = readJson(USED_KEY, []);
    if (!Array.isArray(usedList)) usedList = [];
    if (usedList.indexOf(code) === -1) {
      usedList.push(code);
      writeJson(USED_KEY, usedList);
    }
  }

  function reopenCode(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return;
    var store = readJson(CODES_KEY, {});
    if (store[code]) {
      store[code].used = false;
      try { delete store[code].usedAt; } catch (e) { store[code].usedAt = undefined; }
      writeJson(CODES_KEY, store);
    }
    var usedList = readJson(USED_KEY, []);
    if (Array.isArray(usedList) && usedList.indexOf(code) !== -1) {
      usedList = usedList.filter(function (c) { return c !== code; });
      writeJson(USED_KEY, usedList);
    }
  }

  function statusPill(used) {
    if (used) return '<span class="pill-badge gray">USED</span>';
    return '<span class="pill-badge green">ACTIVE</span>';
  }

  function render() {
    var tbody = document.getElementById('codesBody');
    var searchEl = document.getElementById('codeSearch');
    var filterEl = document.getElementById('codeStatusFilter');
    if (!tbody) return;

    var q = searchEl ? searchEl.value.trim().toLowerCase() : '';
    var status = filterEl ? filterEl.value : '';
    var rows = loadRows();

    var filtered = rows.filter(function (r) {
      if (status === 'active' && r.used) return false;
      if (status === 'used' && !r.used) return false;
      if (q) {
        var hay = (r.code + ' ' + r.name + ' ' + r.phone).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No unlock codes found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(function (r) {
      var waDigits = normalizeNaijaPhone(r.phone);
      var waUrl = waDigits
        ? 'https://wa.me/' + waDigits + '?text=' + encodeURIComponent(
            'Hello ' + (r.name || 'there') + '! Your IYAWO XSTO unlock link: ' + unlockPageUrl(r.code) + ' (Code: ' + r.code + ')'
          )
        : '';
      return '<tr>' +
        '<td><strong>' + esc(r.code) + '</strong></td>' +
        '<td>' + (esc(r.name) || '\u2014') + '</td>' +
        '<td>' + (esc(r.phone) || '\u2014') + '</td>' +
        '<td><strong>' + naira(r.total) + '</strong></td>' +
        '<td class="muted small">' + esc(formatDate(r.createdAt)) + '</td>' +
        '<td>' + statusPill(r.used) + '</td>' +
        '<td class="text-nowrap">' +
          '<div class="d-flex gap-1 flex-wrap">' +
            '<button class="btn-admin-outline btn-sm" data-act="copy-code" data-code="' + esc(r.code) + '" title="Copy code"><i class="bi bi-clipboard"></i></button>' +
            '<button class="btn-admin-outline btn-sm" data-act="copy-link" data-code="' + esc(r.code) + '" title="Copy unlock link"><i class="bi bi-link-45deg"></i></button>' +
            (waUrl
              ? '<a class="btn-admin-outline btn-sm" target="_blank" rel="noopener" href="' + waUrl + '" title="Send link via WhatsApp"><i class="bi bi-whatsapp"></i></a>'
              : '<button class="btn-admin-outline btn-sm" disabled title="No customer phone"><i class="bi bi-whatsapp"></i></button>') +
            (r.used
              ? '<button class="btn-admin-outline btn-sm" data-act="reopen" data-code="' + esc(r.code) + '" title="Reopen code"><i class="bi bi-arrow-counterclockwise"></i> Reopen</button>'
              : '<button class="btn-admin-outline btn-sm" data-act="burn" data-code="' + esc(r.code) + '" title="Mark used"><i class="bi bi-check2-circle"></i> Mark used</button>') +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function generateCode(name, phone, total) {
    var code = '';
    if (window.IYAWO_UNLOCK && window.IYAWO_UNLOCK.generateUnlockCode) {
      code = window.IYAWO_UNLOCK.generateUnlockCode();
    } else {
      var alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      var guard = 0;
      var store = readJson(CODES_KEY, {});
      do {
        code = 'IX-';
        for (var i = 0; i < 6; i++) {
          code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        }
        guard++;
      } while (store[code] && guard < 50);
    }
    var payload = {
      order_total: Number(total) || 0,
      items_summary: 'Manual admin entry',
      customer: { name: name, phone: phone },
      createdAt: new Date().toISOString(),
      used: false
    };
    if (window.IYAWO_UNLOCK && window.IYAWO_UNLOCK.saveUnlockCode) {
      window.IYAWO_UNLOCK.saveUnlockCode(code, payload);
    } else {
      var store2 = readJson(CODES_KEY, {});
      store2[code] = payload;
      writeJson(CODES_KEY, store2);
    }
    return code;
  }

  function wire() {
    var tbody = document.getElementById('codesBody');
    var searchEl = document.getElementById('codeSearch');
    var filterEl = document.getElementById('codeStatusFilter');
    var form = document.getElementById('generateCodeForm');

    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        var act = btn.getAttribute('data-act');
        var code = btn.getAttribute('data-code') || '';

        if (act === 'copy-code') {
          copyText(code).then(function (ok) {
            toast(ok ? 'Code copied: ' + code : code, ok ? 'success' : 'info');
          });
        } else if (act === 'copy-link') {
          var link = unlockPageUrl(code);
          copyText(link).then(function (ok) {
            toast(ok ? 'Unlock link copied.' : link, ok ? 'success' : 'info');
          });
        } else if (act === 'burn') {
          burnCode(code);
          toast('Code marked as used: ' + code, 'success');
          render();
        } else if (act === 'reopen') {
          reopenCode(code);
          toast('Code reopened: ' + code, 'success');
          render();
        }
      });
    }

    var t = null;
    function debounced() {
      if (t) clearTimeout(t);
      t = setTimeout(render, 300);
    }
    if (searchEl) searchEl.addEventListener('input', debounced);
    if (filterEl) filterEl.addEventListener('change', render);

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var nameEl = document.getElementById('genName');
        var phoneEl = document.getElementById('genPhone');
        var totalEl = document.getElementById('genTotal');
        var name = nameEl ? nameEl.value.trim() : '';
        var phone = phoneEl ? phoneEl.value.trim() : '';
        var total = totalEl ? Number(totalEl.value) : 0;
        if (!name || !phone) {
          toast('Please enter customer name and phone.', 'error');
          return;
        }
        if (!(total >= 0) || (totalEl && totalEl.value === '')) {
          toast('Please enter a valid total.', 'error');
          return;
        }
        var code = generateCode(name, phone, total);
        toast('Code created: ' + code, 'success');
        form.reset();
        var modalEl = document.getElementById('generateCodeModal');
        try {
          if (modalEl && window.bootstrap && window.bootstrap.Modal) {
            var inst = window.bootstrap.Modal.getInstance(modalEl) || new window.bootstrap.Modal(modalEl);
            inst.hide();
          }
        } catch (err) { /* ignore */ }
        render();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    wire();
    render();
  });
})();
