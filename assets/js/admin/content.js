// IYAWO XSTO - ADMIN CONTENT (website settings)
// Storage: localStorage key `iyawo_site_settings` + optional Supabase
// table `site_settings` (single row id=1). Works local-only when the
// table / backend endpoint is unavailable.
(function () {
  'use strict';
  const I = window.IYAWO;
  const H = window.IYAWO_ADMIN_HELPERS;
  if (!I) return;

  const KEY = 'iyawo_site_settings';
  const form = document.getElementById('contentForm');

  function defaults() {
    return {
      announcement: {
        enabled: true,
        text: 'New Season Sale — up to 20% off selected laces',
        linkLabel: 'Shop Sale',
        linkUrl: 'sale.html'
      },
      hero: {
        tag: 'PREMIUM FABRICS & LACE',
        title: 'Dress With Elegance.',
        sub: 'Your outlook is our priority.',
        desc: 'Discover premium lace, Ankara, Damask, Swiss lace, beaded fabrics and more — available for both wholesale and retail.',
        cta1Label: 'Shop Now',
        cta1Url: 'sale.html',
        cta2Label: 'Discover Our Story',
        cta2Url: 'about-us.html'
      },
      contact: {
        whatsapp: '2347079057773',
        display: '+234 707 905 7773',
        email: '11victorchris@gmail.com',
        address1: 'No. 1 Fagba Street, Ago Market, Ilorin, Kwara State.',
        address2: 'No. 2 Bolanta Street, Zambari Market, Ilorin, Kwara State.',
        hoursWeekdays: 'Mon–Sat: 8:00am – 7:00pm',
        hoursSunday: 'Sunday: Closed'
      },
      sale: {
        percentText: 'Up to 20% off',
        countdownEnd: '',
        bannerText: 'END-OF-MONTH SALE • UP TO 20% OFF'
      },
      socials: {
        instagram: 'https://www.instagram.com/',
        facebook: 'https://www.facebook.com/',
        tiktok: 'https://www.tiktok.com/'
      }
    };
  }

  // [setting path, element id, kind]
  const FIELDS = [
    ['announcement.enabled', 'f-ann-enabled', 'check'],
    ['announcement.text', 'f-ann-text', 'text'],
    ['announcement.linkLabel', 'f-ann-link-label', 'text'],
    ['announcement.linkUrl', 'f-ann-link-url', 'text'],
    ['hero.tag', 'f-hero-tag', 'text'],
    ['hero.title', 'f-hero-title', 'text'],
    ['hero.sub', 'f-hero-sub', 'text'],
    ['hero.desc', 'f-hero-desc', 'text'],
    ['hero.cta1Label', 'f-cta1-label', 'text'],
    ['hero.cta1Url', 'f-cta1-url', 'text'],
    ['hero.cta2Label', 'f-cta2-label', 'text'],
    ['hero.cta2Url', 'f-cta2-url', 'text'],
    ['contact.whatsapp', 'f-wa-number', 'text'],
    ['contact.display', 'f-wa-display', 'text'],
    ['contact.email', 'f-email', 'text'],
    ['contact.address1', 'f-addr1', 'text'],
    ['contact.address2', 'f-addr2', 'text'],
    ['contact.hoursWeekdays', 'f-hours-weekdays', 'text'],
    ['contact.hoursSunday', 'f-hours-sunday', 'text'],
    ['sale.percentText', 'f-sale-percent', 'text'],
    ['sale.countdownEnd', 'f-sale-end', 'text'],
    ['sale.bannerText', 'f-sale-banner', 'text'],
    ['socials.instagram', 'f-ig', 'text'],
    ['socials.facebook', 'f-fb', 'text'],
    ['socials.tiktok', 'f-tiktok', 'text']
  ];

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!o[keys[i]] || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  }

  function merge(base, overlay) {
    if (!overlay || typeof overlay !== 'object') return base;
    Object.keys(base).forEach((section) => {
      if (overlay[section] && typeof overlay[section] === 'object') {
        Object.assign(base[section], overlay[section]);
      }
    });
    return base;
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function fillForm(settings) {
    FIELDS.forEach(([path, id, kind]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const value = getPath(settings, path);
      if (kind === 'check') {
        el.checked = value !== false;
      } else {
        el.value = value === undefined || value === null ? '' : String(value);
      }
    });
  }

  function collect() {
    const settings = defaults();
    FIELDS.forEach(([path, id, kind]) => {
      const el = document.getElementById(id);
      if (!el) return;
      setPath(settings, path, kind === 'check' ? el.checked : el.value.trim());
    });

    const digits = String(settings.contact.whatsapp || '').replace(/\D/g, '');
    if (!/^\d{10,15}$/.test(digits)) {
      I.showToast('WhatsApp number must be 10–15 digits (e.g. 2347079057773).', 'warning');
      return null;
    }
    settings.contact.whatsapp = digits;
    return settings;
  }

  async function loadRemote() {
    // Preferred: backend API (same pattern as delivery settings).
    if (H && H.adminApi) {
      try {
        const res = await H.adminApi('/api/site-settings');
        if (res && res.data && typeof res.data.settings === 'object') return res.data.settings;
      } catch (err) { /* endpoint may not exist yet — try direct Supabase */ }
    }
    // Fallback: direct Supabase single-row read.
    try {
      if (!I.supabase) return null;
      const { data, error } = await I.supabase
        .from('site_settings')
        .select('data')
        .eq('id', 1)
        .maybeSingle();
      if (error) return null;
      if (data && data.data && typeof data.data === 'object') return data.data;
    } catch (err) { /* table missing or offline — local-only */ }
    return null;
  }

  async function saveRemote(settings) {
    // Preferred: backend API (same pattern as delivery settings).
    if (H && H.adminApi) {
      try {
        await H.adminApi('/api/site-settings', {
          method: 'PUT',
          body: JSON.stringify({ id: 1, settings })
        });
        return 'server';
      } catch (err) { /* endpoint may not exist yet — try direct Supabase */ }
    }
    // Fallback: direct Supabase single-row upsert.
    try {
      if (!I.supabase) return false;
      if (window.IYAWO_ADMIN_READY) await window.IYAWO_ADMIN_READY;
      const { error } = await I.supabase
        .from('site_settings')
        .upsert({ id: 1, data: settings, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) return false;
      return 'supabase';
    } catch (err) {
      return false;
    }
  }

  async function load() {
    if (!form) return;
    const settings = merge(defaults(), readLocal());
    fillForm(settings);
    const remote = await loadRemote();
    if (remote) fillForm(merge(defaults(), remote));
  }

  async function onSave(e) {
    e.preventDefault();
    const settings = collect();
    if (!settings) return;

    const btn = document.getElementById('saveContentBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving…';
    }

    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
      const synced = await saveRemote(settings);
      I.showToast(
        synced ? 'Website content saved and synced.' : 'Saved on this device (cloud sync unavailable).',
        'success'
      );
    } catch (err) {
      I.showToast(err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-lg"></i> Save Changes';
      }
    }
  }

  function onReset() {
    fillForm(defaults());
    I.showToast('Form reset to defaults. Click Save to apply.', 'info');
  }

  function wire() {
    if (!form) return;
    form.addEventListener('submit', onSave);
    const resetBtn = document.getElementById('resetContentBtn');
    if (resetBtn) resetBtn.addEventListener('click', onReset);
  }

  document.addEventListener('DOMContentLoaded', () => {
    wire();
    load();
  });
})();
