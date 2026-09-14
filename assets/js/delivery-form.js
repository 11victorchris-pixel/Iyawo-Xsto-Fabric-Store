// ============================================================
// IYAWO XSTO - DELIVERY APPLICATION FORM (gated by one-time unlock)
// Keys: iyawo_unlocked, iyawo_unlock_codes, iyawo_used_codes,
//       iyawo_deliveries, iyawo_last_paid
// ============================================================
(function () {
  'use strict';

  var UNLOCKED_KEY = 'iyawo_unlocked';
  var CODES_KEY = 'iyawo_unlock_codes';
  var USED_KEY = 'iyawo_used_codes';
  var DELIVERIES_KEY = 'iyawo_deliveries';

  function readLS(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      var v = JSON.parse(raw);
      return (v === null || v === undefined) ? fallback : v;
    } catch (e) { return fallback; }
  }
  function writeLS(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function readSS(key) {
    try {
      var raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
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
      if (window.IYAWO && window.IYAWO.WHATSAPP_NUMBER) return String(window.IYAWO.WHATSAPP_NUMBER).replace(/\D/g, '') || '2347079057773';
      if (window.IYAWO_CONFIG && window.IYAWO_CONFIG.WHATSAPP_NUMBER) return String(window.IYAWO_CONFIG.WHATSAPP_NUMBER).replace(/\D/g, '') || '2347079057773';
    } catch (e) {}
    return '2347079057773';
  }
  function normalize(code) { return String(code || '').trim().toUpperCase(); }
  function toast(msg, type) {
    if (window.IYAWO && window.IYAWO.showToast) window.IYAWO.showToast(msg, type);
  }
  function states() {
    if (window.IYAWO && Array.isArray(window.IYAWO.NIGERIAN_STATES)) return window.IYAWO.NIGERIAN_STATES;
    return ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT - Abuja','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'];
  }

  // A code is a valid gate iff it exists AND is burned (used).
  // Unlock flow burns the code BEFORE redirecting here, so a fresh
  // ?code= that is still unused is rejected (must go via unlock page).
  function resolveGateCode() {
    var q = '';
    try { q = normalize(new URLSearchParams(location.search).get('code')); } catch (e) {}
    var unlocked = readSS(UNLOCKED_KEY) || readLS(UNLOCKED_KEY, null);
    var candidates = [];
    if (q) candidates.push(q);
    if (unlocked && unlocked.code) candidates.push(normalize(unlocked.code));

    var store = readLS(CODES_KEY, {});
    var usedList = readLS(USED_KEY, []);
    if (!Array.isArray(usedList)) usedList = [];

    for (var i = 0; i < candidates.length; i++) {
      var code = candidates[i];
      if (!code) continue;
      var rec = store[code];
      var burned = usedList.indexOf(code) !== -1 || (rec && rec.used === true);
      if (rec && burned) return { code: code, record: rec };
      // last_paid fallback: accept if its code is also in used ledger
      if (!rec) {
        try {
          var last = readLS('iyawo_last_paid', null);
          if (last && normalize(last.code) === code && usedList.indexOf(code) !== -1) {
            return { code: code, record: last };
          }
        } catch (e) {}
      }
    }
    return null;
  }

  function confettiBurst() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var colors = ['#f59e0b', '#0a1238', '#198754', '#ffffff', '#e11d48'];
    var parts = [];
    var cx = canvas.width / 2, cy = canvas.height * 0.3;
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

  function initTilt() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var card = document.querySelector('#deliveryForm.tilt-card');
    if (!card) return;
    var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (!fine) return;
    card.addEventListener('mousemove', function (e) {
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = 'rotateY(' + (px * 8).toFixed(2) + 'deg) rotateX(' + (-py * 8).toFixed(2) + 'deg)';
    });
    card.addEventListener('mouseleave', function () {
      card.style.transform = 'rotateY(0deg) rotateX(0deg)';
    });
  }

  function showGate(gate) {
    var locked = document.getElementById('lockedState');
    var wrap = document.getElementById('deliveryWrap');
    if (!gate) {
      if (locked) locked.hidden = false;
      if (wrap) wrap.hidden = true;
      return false;
    }
    if (locked) locked.hidden = true;
    if (wrap) wrap.hidden = false;
    var codeInput = document.getElementById('dCode');
    if (codeInput) codeInput.value = gate.code;
    // Prefill from stored customer snapshot (supports both field shapes).
    try {
      var c = (gate.record && gate.record.customer) || gate.record || {};
      var set = function (id, v) { var el = document.getElementById(id); if (el && !el.value && v) el.value = v; };
      set('dName', c.name || c.customer_name || '');
      set('dPhone', c.phone || c.customer_phone || '');
      set('dEmail', c.email || c.customer_email || '');
      set('dAddress', c.address || '');
      set('dCity', c.city || '');
      set('dState', c.state || '');
    } catch (e) {}
    return true;
  }

  function onSubmit(e, gate) {
    e.preventDefault();
    var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var name = v('dName'), phone = v('dPhone'), email = v('dEmail'),
        address = v('dAddress'), city = v('dCity'), state = v('dState'),
        method = v('dMethod'), date = v('dDate'), note = v('dNote');
    var errBox = document.getElementById('deliveryError');

    function fail(msg) {
      if (errBox) errBox.innerHTML = '<div class="alert alert-danger d-flex align-items-center gap-2 mb-0"><i class="bi bi-x-circle-fill"></i><div>' + msg + '</div></div>';
      toast(msg, 'error');
    }

    if (!name || !phone || !email || !address || !city || !state || !method) {
      fail('Please fill all required fields marked *.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fail('Please enter a valid email address.'); return; }
    if (String(phone).replace(/\D/g, '').length < 7) { fail('Please enter a valid phone number.'); return; }
    if (errBox) errBox.innerHTML = '';

    var ref = 'DLV-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
    var entry = {
      reference: ref, code: gate.code, name: name, phone: phone, email: email,
      address: address, city: city, state: state, method: method,
      preferredDate: date || '', note: note || '',
      createdAt: new Date().toISOString()
    };

    // 1. Append to deliveries ledger.
    var list = readLS(DELIVERIES_KEY, []);
    if (!Array.isArray(list)) list = [];
    list.push(entry);
    writeLS(DELIVERIES_KEY, list);

    // 2. Attach delivery info to the burned code record (audit trail).
    try {
      var store = readLS(CODES_KEY, {});
      if (store[gate.code]) {
        store[gate.code].delivery = entry;
        store[gate.code].deliveryReference = ref;
        writeLS(CODES_KEY, store);
      }
    } catch (e) {}

    // 3. Success UI + confetti + WhatsApp confirmations (owner + customer).
    var wrap = document.getElementById('deliveryWrap');
    var ok = document.getElementById('deliverySuccess');
    if (wrap) wrap.hidden = true;
    if (ok) ok.hidden = false;
    var refEl = document.getElementById('deliveryRef');
    if (refEl) refEl.textContent = ref;
    var owner = ownerNumber();
    var custDigits = normalizeNaijaPhone(phone);
    var dText = 'Hello IYAWO XSTO! Delivery details\n' +
      'Reference: ' + ref + '\n' +
      'Unlock Code: ' + gate.code + '\n' +
      'Name: ' + name + '\n' +
      'Phone: ' + phone + '\n' +
      'Address: ' + address + '\n' +
      'City: ' + city + ', ' + state + '\n' +
      'Method: ' + method + (date ? '\nPreferred date: ' + date : '') + (note ? '\nNote: ' + note : '');
    var btnWrap = document.getElementById('deliveryWaButtons');
    if (btnWrap) {
      var html = '<a href="https://wa.me/' + owner + '?text=' + encodeURIComponent(dText) + '" target="_blank" rel="noopener" class="btn btn-success">' +
        '<i class="bi bi-whatsapp"></i> Send delivery details to WhatsApp (Store)</a>';
      if (custDigits && custDigits !== owner) {
        html += '<a href="https://wa.me/' + custDigits + '?text=' + encodeURIComponent(dText) + '" target="_blank" rel="noopener" class="btn btn-outline-success">' +
          '<i class="bi bi-whatsapp"></i> Send delivery details to WhatsApp (My number)</a>';
      }
      btnWrap.innerHTML = html;
    }
    confettiBurst();
    toast('Delivery request submitted', 'success');
  }

  document.addEventListener('DOMContentLoaded', function () {
    // State select.
    var sel = document.getElementById('dState');
    if (sel) {
      states().forEach(function (s) {
        var o = document.createElement('option');
        o.value = s; o.textContent = s;
        sel.appendChild(o);
      });
    }
    initTilt();
    var gate = resolveGateCode();
    if (showGate(gate)) {
      var form = document.getElementById('deliveryForm');
      if (form) form.addEventListener('submit', function (e) { onSubmit(e, gate); });
    }
    if (window.IYAWO && window.IYAWO.updateCartBadge) window.IYAWO.updateCartBadge();
  });
})();
