// ============================================================
// IYAWO XSTO - UNLOCK CODE SHARED HELPER
// Used by: checkout.js (generation) + order-confirmation.js
//          (display) + unlock-package.html agent (validation).
// Storage keys (MUST stay in sync across all agents):
//   iyawo_unlock_codes : { code: { order_total, items_summary,
//                          customer, createdAt, used } }
//   iyawo_last_paid    : { code, total, receipt, customer,
//                          createdAt, via }
//   iyawo_used_codes   : [ code, ... ]  (spent-code ledger)
// Code format: IX-XXXXXX (6 chars, uppercase, no 0/O 1/I)
// ============================================================
(function () {
  'use strict';

  var UNLOCK_CODES_KEY = 'iyawo_unlock_codes';
  var LAST_PAID_KEY = 'iyawo_last_paid';
  var USED_CODES_KEY = 'iyawo_used_codes';

  // Excludes confusing 0/O and 1/I.
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function getWhatsAppNumber() {
    try {
      if (window.IYAWO && window.IYAWO.WHATSAPP_NUMBER) return window.IYAWO.WHATSAPP_NUMBER;
      if (window.IYAWO_CONFIG && window.IYAWO_CONFIG.WHATSAPP_NUMBER) return window.IYAWO_CONFIG.WHATSAPP_NUMBER;
    } catch (e) { /* ignore */ }
    return '2347079057773';
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
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

  function generateUnlockCode() {
    var store = readJson(UNLOCK_CODES_KEY, {});
    var code = '';
    var guard = 0;
    do {
      code = 'IX-';
      for (var i = 0; i < 6; i++) {
        code += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
      }
      guard++;
    } while (store[code] && guard < 50);
    return code;
  }

  // items: [{ name, price, quantity, unit, line }]
  // customer: { name, phone, address, city, state, email }
  function buildReceiptText(opts) {
    opts = opts || {};
    var items = opts.items || [];
    var subtotal = Number(opts.subtotal) || 0;
    var delivery = Number(opts.delivery) || 0;
    var total = (opts.total !== undefined && opts.total !== null) ? Number(opts.total) : (subtotal + delivery);
    var customer = opts.customer || {};
    var unlockCode = opts.unlockCode || opts.code || '';
    var dateStr = opts.dateStr || new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

    function naira(n) {
      if (window.IYAWO && window.IYAWO.formatNaira) return window.IYAWO.formatNaira(n);
      return '\u20A6' + (Number(n) || 0).toLocaleString('en-NG');
    }
    function qty(q) {
      if (window.IYAWO && window.IYAWO.formatQty) return window.IYAWO.formatQty(q);
      return String(Number(q) || 0);
    }

    var lines = [];
    lines.push('Hello IYAWO XSTO! New Order');
    lines.push('Date: ' + dateStr);
    lines.push('');
    items.forEach(function (item, idx) {
      var name = item.name || item.product_name || 'Item';
      var q = Number(item.quantity) || 0;
      var unit = item.unit || 'yard';
      var price = Number(item.price) || 0;
      var lineTotal = (item.line !== undefined && item.line !== null)
        ? Number(item.line)
        : ((item.subtotal !== undefined && item.subtotal !== null) ? Number(item.subtotal) : price * q);
      lines.push(
        (idx + 1) + '. ' + name +
        ' x ' + qty(q) + ' ' + unit + '(s)' +
        ' @ ' + naira(price) + '/yard = ' + naira(lineTotal)
      );
    });
    lines.push('');
    lines.push('Subtotal: ' + naira(subtotal));
    lines.push('Delivery: ' + (delivery > 0 ? naira(delivery) : 'To be confirmed'));
    lines.push('GRAND TOTAL: ' + naira(total));
    lines.push('');
    if (unlockCode) {
      lines.push('Unlock Code: ' + unlockCode);
      lines.push('');
    }
    lines.push('Name: ' + (customer.name || ''));
    lines.push('Phone: ' + (customer.phone || ''));
    lines.push('Address: ' + (customer.address || ''));
    lines.push('City: ' + (customer.city || '') + ', ' + (customer.state || ''));
    return lines.join('\n');
  }

  // Persist a freshly generated code. Returns the stored record.
  function saveUnlockCode(code, payload) {
    payload = payload || {};
    var store = readJson(UNLOCK_CODES_KEY, {});
    store[code] = {
      order_total: Number(payload.order_total) || 0,
      items_summary: payload.items_summary || '',
      customer: payload.customer || {},
      createdAt: payload.createdAt || new Date().toISOString(),
      used: false
    };
    writeJson(UNLOCK_CODES_KEY, store);
    return store[code];
  }

  function getUnlockCodes() {
    return readJson(UNLOCK_CODES_KEY, {});
  }

  function getLastPaid() {
    return readJson(LAST_PAID_KEY, null);
  }

  function saveLastPaid(record) {
    writeJson(LAST_PAID_KEY, record || {});
    return record;
  }

  function getUsedCodes() {
    var v = readJson(USED_CODES_KEY, []);
    return Array.isArray(v) ? v : [];
  }

  // Single-use check shared with the unlock agent.
  // Returns { ok, reason } where reason is one of:
  //   'not-found' | 'already-used' | 'ok'
  function checkUnlockCode(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return { ok: false, reason: 'not-found' };
    var usedList = getUsedCodes();
    if (usedList.indexOf(code) !== -1) return { ok: false, reason: 'already-used' };
    var store = getUnlockCodes();
    var rec = store[code];
    if (!rec) return { ok: false, reason: 'not-found' };
    if (rec.used === true) return { ok: false, reason: 'already-used' };
    return { ok: true, reason: 'ok', record: rec };
  }

  function markUnlockCodeUsed(code) {
    code = String(code || '').trim().toUpperCase();
    var store = getUnlockCodes();
    if (store[code]) {
      store[code].used = true;
      store[code].usedAt = new Date().toISOString();
      writeJson(UNLOCK_CODES_KEY, store);
    }
    var usedList = getUsedCodes();
    if (usedList.indexOf(code) === -1) {
      usedList.push(code);
      writeJson(USED_CODES_KEY, usedList);
    }
  }

  function openWhatsAppReceipt(receiptText) {
    var url = 'https://wa.me/' + getWhatsAppNumber() + '?text=' + encodeURIComponent(receiptText || '');
    window.open(url, '_blank');
    return url;
  }

  function copyText(text, fallbackMsg) {
    text = String(text == null ? '' : text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; });
    }
    return new Promise(function (resolve) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        resolve(true);
      } catch (e) {
        if (window.IYAWO && window.IYAWO.showToast) window.IYAWO.showToast(fallbackMsg || text, 'info');
        resolve(false);
      }
    });
  }

  window.IYAWO_UNLOCK = {
    UNLOCK_CODES_KEY: UNLOCK_CODES_KEY,
    LAST_PAID_KEY: LAST_PAID_KEY,
    USED_CODES_KEY: USED_CODES_KEY,
    generateUnlockCode: generateUnlockCode,
    buildReceiptText: buildReceiptText,
    saveUnlockCode: saveUnlockCode,
    getUnlockCodes: getUnlockCodes,
    getLastPaid: getLastPaid,
    saveLastPaid: saveLastPaid,
    getUsedCodes: getUsedCodes,
    checkUnlockCode: checkUnlockCode,
    markUnlockCodeUsed: markUnlockCodeUsed,
    openWhatsAppReceipt: openWhatsAppReceipt,
    copyText: copyText,
    getWhatsAppNumber: getWhatsAppNumber
  };
})();
