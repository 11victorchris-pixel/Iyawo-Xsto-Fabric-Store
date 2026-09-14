// IYAWO XSTO - ADMIN LOGIN
(function () {
  'use strict';
  const I = window.IYAWO;
  if (!I) return;

  const supabase = I.supabase;

  // ----------------------------------------------------------
  // LOCAL-ONLY fallback (your computer only, never Vercel).
  // Active only on file:// / localhost / 127.0.0.1 AND when
  // assets/js/config.local.js (git-ignored) is present.
  // ----------------------------------------------------------
  var LOCAL_FLAG = 'iyawo_local_admin';

  function isLocalHost() {
    try {
      var p = String(location.protocol || '');
      var h = String(location.hostname || '');
      return p === 'file:' || h === '' || h === 'localhost' || h === '127.0.0.1';
    } catch (e) { return false; }
  }

  function hasLocalConfig() {
    return !!(window.IYAWO_LOCAL_ADMIN && window.IYAWO_LOCAL_ADMIN.email && window.IYAWO_LOCAL_ADMIN.passHash);
  }

  function sha256Hex(str) {
    try {
      if (window.crypto && window.crypto.subtle) {
        return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
          var arr = Array.prototype.slice.call(new Uint8Array(buf));
          return arr.map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        });
      }
    } catch (e) { /* fall through */ }
    return Promise.resolve('');
  }

  async function init() {
    // Local session already active? Go straight to the dashboard.
    try {
      if (isLocalHost() && hasLocalConfig() && sessionStorage.getItem(LOCAL_FLAG) === '1') {
        location.href = 'index.html';
        return;
      }
    } catch (e) { /* ignore */ }
    // Already signed in? Go straight to the dashboard.
    if (supabase) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData && sessionData.session) {
        const { data: adminRow } = await supabase
          .from('admins')
          .select('id')
          .eq('user_id', sessionData.session.user.id)
          .maybeSingle();
        if (adminRow) {
          location.href = 'index.html';
          return;
        }
      }
    }

    const params = new URLSearchParams(location.search);
    const error = params.get('error');
    if (error === 'unauthorized') {
      showError('You are not authorized to access the admin area.');
    } else if (error === 'config') {
      showError('Store configuration is incomplete. Check assets/js/config.js.');
    }

    document.getElementById('loginForm').addEventListener('submit', onLogin);
    document.getElementById('registerForm').addEventListener('submit', onRegister);

    // "First time? Create admin account" toggle (was never wired - button did nothing).
    var toggleBtn = document.getElementById('toggleRegister');
    var regForm = document.getElementById('registerForm');
    if (toggleBtn && regForm) {
      toggleBtn.addEventListener('click', function () {
        regForm.hidden = !regForm.hidden;
        if (!regForm.hidden) {
          try { regForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { /* ignore */ }
          var first = document.getElementById('regEmail');
          if (first) first.focus();
        }
      });
    }
  }

  function showError(message) {
    const okBox = document.getElementById('loginSuccess');
    if (okBox) okBox.hidden = true;
    const box = document.getElementById('loginError');
    box.hidden = false;
    box.textContent = message;
  }

  function showSuccess(message) {
    hideError();
    const box = document.getElementById('loginSuccess');
    if (box) {
      box.hidden = false;
      box.textContent = message;
    } else {
      showError(message);
    }
  }

  function hideError() {
    document.getElementById('loginError').hidden = true;
  }

  async function onLogin(e) {
    e.preventDefault();
    hideError();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Signing in…';

    // LOCAL-ONLY path first (localhost only, never production).
    try {
      if (isLocalHost() && hasLocalConfig()) {
        var wantEmail = String(window.IYAWO_LOCAL_ADMIN.email || '').trim().toLowerCase();
        if (email.toLowerCase() === wantEmail) {
          var hex = await sha256Hex(password);
          if (hex && hex === String(window.IYAWO_LOCAL_ADMIN.passHash).toLowerCase()) {
            try { sessionStorage.setItem(LOCAL_FLAG, '1'); } catch (e) { /* ignore */ }
            location.href = 'index.html';
            return;
          }
        }
      }
    } catch (e) { /* fall through to Supabase */ }

    if (!supabase) {
      showError('Store configuration is incomplete. Check assets/js/config.js.');
      btn.disabled = false;
      btn.textContent = 'Sign In';
      return;
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error('Invalid email or password.');

      const { data: adminRow, error: adminError } = await supabase
        .from('admins')
        .select('id, email')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (adminError || !adminRow) {
        await supabase.auth.signOut();
        throw new Error('This account is not an admin.');
      }

      location.href = 'index.html';
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }

  async function onRegister(e) {
    e.preventDefault();
    hideError();

    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const invite = document.getElementById('regInvite').value.trim();
    const btn = document.getElementById('registerBtn');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creating…';

    try {
      // Correct route is /api/admin/register-admin (matches
      // api/admin/register-admin.js). Fall back to the legacy
      // /api/auth/register-admin alias on 404 for old deployments.
      var payload = JSON.stringify({ email: email, password: password, invite_code: invite });
      try {
        await I.api('/api/admin/register-admin', { method: 'POST', body: payload });
      } catch (err) {
        if (err && err.status === 404) {
          await I.api('/api/auth/register-admin', { method: 'POST', body: payload });
        } else {
          throw err;
        }
      }
      showSuccess('Admin account created. You can now sign in with the details above.');
      var regForm = document.getElementById('registerForm');
      if (regForm) regForm.hidden = true;
      var toggleBtn = document.getElementById('toggleRegister');
      if (toggleBtn) toggleBtn.textContent = 'Account created — sign in above';
      btn.disabled = false;
      btn.textContent = 'Create Admin Account';
    } catch (err) {
      if (err && (err.status === 0 || /connection|network|fetch|failed/i.test(err.message || ''))) {
        showError('Cannot reach the server. Deploy the backend first (see README), or on this computer use Sign In with your local admin details.');
      } else {
        showError(err.message);
      }
      btn.disabled = false;
      btn.textContent = 'Create Admin Account';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();