// ============================================================
// IYAWO XSTO - PACKAGE UNLOCK (one-time code -> delivery form)
// Storage keys:
//   iyawo_unlock_codes : { code: { total|order_total, items|items_summary,
//                          customer, createdAt, used } }
//   iyawo_last_paid    : { code, total, ... }  (fallback lookup)
//   iyawo_used_codes   : [ code, ... ]
//   iyawo_unlocked     : { code, unlockedAt } (sessionStorage + localStorage)
// ============================================================
(function () {
  'use strict';

  var CODES_KEY = 'iyawo_unlock_codes';
  var LAST_PAID_KEY = 'iyawo_last_paid';
  var USED_KEY = 'iyawo_used_codes';
  var UNLOCKED_KEY = 'iyawo_unlocked';

  var CODE_RE = /^IX-[A-Z2-9]{6}$/;
  var DELIVERIES_KEY = 'iyawo_deliveries';

  function readLS(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      var v = JSON.parse(raw);
      return (v === null || v === undefined) ? fallback : v;
    } catch (e) { return fallback; }
  }
  function isWellFormed(code) { return CODE_RE.test(code); }

  // Normalize Nigerian numbers to wa.me format (234...):
  // strip non-digits; 080.../070... -> 234...; 234... keep; 10-digit 7/8/9... -> 234...
  function normalizeNaijaPhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.charAt(0) === '0') return '234' + d.slice(1);
    if (d.indexOf('234') === 0) return d;
    if (d.length === 10 && /^[789]/.test(d)) return '234' + d;
    return d;
  }

  function resolveCustomerContact(code, record) {
    var name = '';
    var phone = '';
    try {
      var c = (record && record.customer) || {};
      // Support both {name,phone} and {customer_name,customer_phone} shapes,
      // plus flat last_paid-style records.
      name = c.name || c.customer_name || record.name || record.customer_name || '';
      phone = c.phone || c.customer_phone || record.phone || record.customer_phone || '';
    } catch (e) {}
    if (!phone || !name) {
      try {
        var last = readLS(LAST_PAID_KEY, null);
        if (last) {
          var lc = last.customer || {};
          var lastCode = normalize(last.code);
          if (!phone && (lastCode === code || !lastCode)) phone = lc.phone || lc.customer_phone || last.phone || '';
          if (!name && (lastCode === code || !name)) name = lc.name || lc.customer_name || last.name || '';
          if (!phone) phone = lc.phone || '';
        }
      } catch (e) {}
    }
    if (!phone) {
      try {
        var list = readLS(DELIVERIES_KEY, []);
        if (Array.isArray(list)) {
          for (var i = list.length - 1; i >= 0; i--) {
            var d = list[i] || {};
            if (normalize(d.code) === code && d.phone) {
              phone = d.phone;
              if (!name && d.name) name = d.name;
              break;
            }
          }
        }
      } catch (e) {}
    }
    return { name: name || 'there', phone: phone || '' };
  }

  // Owner-granted cross-device links: well-formed but unknown on this device.
  // Create a stub so single-use burn/ledger logic still applies.
  function ensureOwnerGrantedStub(code) {
    var store = readLS(CODES_KEY, {});
    if (store && store[code]) return store[code];
    var last = readLS(LAST_PAID_KEY, null);
    if (last && normalize(last.code) === code) return last;
    var stub = {
      order_total: 0,
      customer: {},
      createdAt: new Date().toISOString(),
      used: false,
      ownerGranted: true
    };
    store[code] = stub;
    writeLS(CODES_KEY, store);
    return stub;
  }
  function writeLS(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function normalize(code) {
    return String(code || '').trim().toUpperCase();
  }
  function toast(msg, type) {
    if (window.IYAWO && window.IYAWO.showToast) window.IYAWO.showToast(msg, type);
  }

  function lookup(code) {
    // 1. Primary store
    var store = readLS(CODES_KEY, {});
    if (store && store[code]) {
      return { source: 'store', record: store[code], store: store };
    }
    // 2. Fallback: last paid receipt (single-code shape)
    var last = readLS(LAST_PAID_KEY, null);
    if (last && normalize(last.code) === code) {
      return {
        source: 'last_paid', record: last,
        store: store
      };
    }
    return null;
  }

  function isUsed(code, record) {
    var usedList = readLS(USED_KEY, []);
    if (Array.isArray(usedList) && usedList.indexOf(code) !== -1) return true;
    if (record && record.used === true) return true;
    return false;
  }

  function markUsed(code) {
    // Prefer shared helper when available (keeps keys in sync).
    if (window.IYAWO_UNLOCK && window.IYAWO_UNLOCK.markUnlockCodeUsed) {
      window.IYAWO_UNLOCK.markUnlockCodeUsed(code);
      return;
    }
    var store = readLS(CODES_KEY, {});
    if (store[code]) {
      store[code].used = true;
      store[code].usedAt = new Date().toISOString();
      writeLS(CODES_KEY, store);
    }
    var usedList = readLS(USED_KEY, []);
    if (!Array.isArray(usedList)) usedList = [];
    if (usedList.indexOf(code) === -1) {
      usedList.push(code);
      writeLS(USED_KEY, usedList);
    }
  }

  // ---- Confetti burst (~40 lines, reduced-motion aware) ----
  function confettiBurst() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var colors = ['#f59e0b', '#0a1238', '#198754', '#ffffff', '#e11d48'];
    var parts = [];
    var cx = canvas.width / 2, cy = canvas.height * 0.35;
    for (var i = 0; i < 120; i++) {
      var a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
      parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, s: 4 + Math.random() * 5, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, c: colors[i % colors.length], life: 70 + Math.random() * 40 });
    }
    var frames = 0;
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var alive = false;
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        if (p.life <= 0) continue;
        alive = true;
        p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.vx *= 0.99; p.r += p.vr; p.life--;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
      frames++;
      if (alive && frames < 200) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(tick);
  }

  // ---- Subtle 3D perspective tilt on the package card ----
  function initTilt() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var card = document.getElementById('packageCard');
    if (!card) return;
    var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (!fine) return;
    card.addEventListener('mousemove', function (e) {
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = 'rotateY(' + (px * 10).toFixed(2) + 'deg) rotateX(' + (-py * 10).toFixed(2) + 'deg)';
    });
    card.addEventListener('mouseleave', function () {
      card.style.transform = 'rotateY(0deg) rotateX(0deg)';
    });
  }

  function showError(msg) {
    var box = document.getElementById('unlockFeedback');
    if (box) {
      box.innerHTML = '<div class="alert alert-danger d-flex align-items-center gap-2 mb-0" role="alert">' +
        '<i class="bi bi-x-circle-fill fs-5"></i><div>' + msg + '</div></div>';
    }
    toast(msg, 'error');
  }

  function showSuccess(code, contact, waUrl) {
    var box = document.getElementById('unlockFeedback');
    if (box) {
      var html = '<div class="alert alert-success mb-0" role="alert">' +
        '<div class="d-flex align-items-center gap-2"><i class="bi bi-unlock-fill fs-5"></i>' +
        '<div><strong>Unlocked.</strong> Code <strong>' + code +
        '</strong> accepted. Redirecting to the delivery form…</div></div>';
      if (waUrl) {
        html += '<div class="d-grid mt-2"><a href="' + waUrl + '" target="_blank" rel="noopener" class="btn btn-success">' +
          '<i class="bi bi-whatsapp"></i> Send confirmation to my WhatsApp</a></div>' +
          '<div class="small mt-1">Confirmation goes to your number only.</div>';
      }
      html += '</div>';
      box.innerHTML = html;
    }
    toast('Package unlocked', 'success');
  }

  function verify() {
    var input = document.getElementById('unlockCodeInput');
    var code = normalize(input ? input.value : '');
    if (!code) { showError('Please enter your unlock code.'); return; }
    if (!isWellFormed(code)) {
      showError('Invalid code format. Codes look like IX-XXXXXX. Use the unlock link sent by the owner.');
      return;
    }

    // Single-use enforcement: spent ledger first, then record flag.
    var usedList = readLS(USED_KEY, []);
    if (Array.isArray(usedList) && usedList.indexOf(code) !== -1) {
      showError('Code already used. Each code works once only — contact us on WhatsApp if you need help.');
      return;
    }

    var found = lookup(code);
    if (!found) {
      // Owner-granted cross-device link: well-formed but unknown here — stub it.
      var stub = ensureOwnerGrantedStub(code);
      found = { source: 'owner-granted', record: stub };
    }
    if (isUsed(code, found.record)) {
      showError('Code already used. Each code works once only — contact us on WhatsApp if you need help.');
      return;
    }

    // Re-read stub record after creation so contact resolution sees it.
    var record = found.record;
    try {
      var fresh = readLS(CODES_KEY, {});
      if (fresh && fresh[code]) record = fresh[code];
    } catch (e) {}

    // Valid -> burn it (single-use), then persist unlock session.
    markUsed(code);
    var payload = { code: code, unlockedAt: new Date().toISOString() };
    writeLS(UNLOCKED_KEY, payload);
    try { sessionStorage.setItem(UNLOCKED_KEY, JSON.stringify(payload)); } catch (e) {}

    // Notify the CUSTOMER's phone (from checkout/application/delivery records).
    // Never message the owner number here.
    var contact = resolveCustomerContact(code, record);
    var custDigits = normalizeNaijaPhone(contact.phone);
    var waUrl = '';
    var text = 'Hello ' + (contact.name || 'there') + ', your IYAWO XSTO package ' + code + ' has been UNLOCKED. Fill delivery form to complete.';
    if (custDigits) {
      waUrl = 'https://wa.me/' + custDigits + '?text=' + encodeURIComponent(text);
      try { window.open(waUrl, '_blank'); } catch (e) {}
    }

    showSuccess(code, contact, waUrl);
    confettiBurst();
    setTimeout(function () {
      location.href = 'application-form.html?code=' + encodeURIComponent(code);
    }, 4000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTilt();
    // Prefill from ?code= for convenience.
    try {
      var q = new URLSearchParams(location.search).get('code');
      if (q && document.getElementById('unlockCodeInput')) {
        document.getElementById('unlockCodeInput').value = normalize(q);
      }
    } catch (e) {}
    var btn = document.getElementById('verifyBtn');
    if (btn) btn.addEventListener('click', verify);
    var input = document.getElementById('unlockCodeInput');
    if (input) input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); verify(); }
    });
    if (window.IYAWO && window.IYAWO.updateCartBadge) window.IYAWO.updateCartBadge();
  });
})();
