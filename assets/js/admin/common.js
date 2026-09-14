// IYAWO XSTO - ADMIN SHARED (auth guard + helpers)
// Load after supabase CDN + config.js + store-common.js
(function () {
  'use strict';
  const I = window.IYAWO;
  if (!I) return;

  const supabase = I.supabase;

  // ----------------------------------------------------------
  // Auth guard - the whole admin area requires a valid admin
  // session. Content is hidden until this passes.
  // ----------------------------------------------------------
  async function initAdmin() {
    // LOCAL-ONLY session (your computer only, never Vercel).
    // Allows previewing content/unlock/delivery managers without Supabase.
    try {
      var _p = String(location.protocol || '');
      var _h = String(location.hostname || '');
      var _isLocal = (_p === 'file:' || _h === '' || _h === 'localhost' || _h === '127.0.0.1');
      if (_isLocal && window.IYAWO_LOCAL_ADMIN && window.IYAWO_LOCAL_ADMIN.email &&
          sessionStorage.getItem('iyawo_local_admin') === '1') {
        var _email = String(window.IYAWO_LOCAL_ADMIN.email);
        window.IYAWO_ADMIN = { session: null, user: { email: _email }, email: _email, local: true };
        document.body.classList.remove('d-none');
        var _chip = document.getElementById('adminUserEmail');
        if (_chip) _chip.textContent = _email + ' (local)';
        var _av = document.getElementById('adminUserAvatar');
        if (_av) _av.textContent = (_email || 'A').charAt(0).toUpperCase();
        var _cur = location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('.admin-sidebar nav a').forEach(function (a) {
          if (a.getAttribute('href') === _cur) a.classList.add('active');
        });
        var _lo = document.getElementById('logoutBtn');
        if (_lo) _lo.addEventListener('click', function (e) {
          e.preventDefault();
          try { sessionStorage.removeItem('iyawo_local_admin'); } catch (e2) { /* ignore */ }
          location.href = 'login.html';
        });
        return;
      }
    } catch (e) { /* fall through to Supabase guard */ }

    if (!supabase) {
      location.href = 'login.html?error=config';
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData && sessionData.session;

    if (!session) {
      location.href = 'login.html?error=unauthorized';
      return;
    }

    // Confirm the user is an admin (RLS allows reading your own row).
    const { data: adminRow, error: adminError } = await supabase
      .from('admins')
      .select('id, email')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (adminError || !adminRow) {
      await supabase.auth.signOut();
      location.href = 'login.html?error=unauthorized';
      return;
    }

    window.IYAWO_ADMIN = {
      session,
      user: session.user,
      email: adminRow.email
    };

    // Reveal the page + fill the user chip + mark active nav link.
    document.body.classList.remove('d-none');

    const userChip = document.getElementById('adminUserEmail');
    if (userChip) userChip.textContent = adminRow.email;

    const initial = (adminRow.email || 'A').charAt(0).toUpperCase();
    const avatar = document.getElementById('adminUserAvatar');
    if (avatar) avatar.textContent = initial;

    const current = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.admin-sidebar nav a').forEach((a) => {
      if (a.getAttribute('href') === current) a.classList.add('active');
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await supabase.auth.signOut();
      location.href = 'login.html';
    });
  }

  // ----------------------------------------------------------
  // Admin API helper - attaches the access token.
  // ----------------------------------------------------------
  async function adminApi(path, options) {
    // Wait for the auth guard to finish before making calls.
    await window.IYAWO_ADMIN_READY;
    const admin = window.IYAWO_ADMIN;
    if (!admin || !admin.session) throw new Error('Not authenticated.');

    options = options || {};
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.headers || {},
      { Authorization: 'Bearer ' + admin.session.access_token }
    );

    let res;
    try {
      res = await fetch(path, Object.assign({}, options, { headers }));
    } catch (err) {
      throw new Error('Something went wrong. Please check your connection and try again.');
    }

    let data = {};
    try { data = await res.json(); } catch (err) { /* empty */ }

    if (!res.ok) {
      const e = new Error(data.error || 'Something went wrong. Please try again.');
      e.status = res.status;
      throw e;
    }
    return data;
  }

  // ----------------------------------------------------------
  // Storage helpers (product images)
  // ----------------------------------------------------------
  function publicImageUrl(path) {
    if (!path) return '';
    return I.cfg.SUPABASE_URL + '/storage/v1/object/public/product-images/' + encodeURI(path);
  }

  async function uploadProductImage(file, folder) {
    const admin = window.IYAWO_ADMIN;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = 'products/' + (folder || 'new') + '/' + Date.now() + '-' + safeName;

    const { error } = await supabase.storage.from('product-images').upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });
    if (error) throw new Error('Image upload failed: ' + error.message);
    return path;
  }

  async function deleteProductImage(path) {
    if (!path) return;
    const { error } = await supabase.storage.from('product-images').remove([path]);
    if (error) console.warn('Could not delete image', error.message);
  }

  // ----------------------------------------------------------
  // Small UI helpers
  // ----------------------------------------------------------
  function statusPill(status) {
    const map = {
      pending: ['orange', 'PENDING'],
      confirmed: ['blue', 'CONFIRMED'],
      processing: ['blue', 'PROCESSING'],
      ready_for_delivery: ['purple', 'READY FOR DELIVERY'],
      shipped: ['blue', 'SHIPPED'],
      delivered: ['green', 'DELIVERED'],
      cancelled: ['red', 'CANCELLED'],
      paid: ['green', 'PAID'],
      failed: ['red', 'FAILED'],
      refunded: ['purple', 'REFUNDED'],
      whatsapp: ['green', 'WHATSAPP']
    };
    const [color, label] = map[status] || ['gray', String(status || '').toUpperCase()];
    return '<span class="pill-badge ' + color + '">' + label + '</span>';
  }

  function naira(n) {
    return I.formatNaira(n);
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-NG', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  window.IYAWO_ADMIN_HELPERS = {
    adminApi,
    publicImageUrl,
    uploadProductImage,
    deleteProductImage,
    statusPill,
    naira,
    formatDate
  };

  window.IYAWO_ADMIN_READY = initAdmin();
})();