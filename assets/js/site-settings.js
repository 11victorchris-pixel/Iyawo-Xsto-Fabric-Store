// IYAWO XSTO - SITE SETTINGS loader (public storefront, no auth)
// Reads localStorage key `iyawo_site_settings` on DOMContentLoaded and
// applies values to elements marked with data-site="..." attributes.
// Silent fail when no settings are saved yet.
(function () {
  'use strict';

  var KEY = 'iyawo_site_settings';

  function setText(name, value) {
    if (typeof value !== 'string' || !value) return;
    var els = document.querySelectorAll('[data-site="' + name + '"]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = value;
    }
  }

  function setLink(name, href) {
    if (typeof href !== 'string' || !href) return;
    var els = document.querySelectorAll('[data-site="' + name + '"]');
    for (var j = 0; j < els.length; j++) {
      if (els[j].tagName === 'A') els[j].setAttribute('href', href);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var s = null;
    try {
      s = JSON.parse(window.localStorage.getItem(KEY));
    } catch (err) {
      return;
    }
    if (!s || typeof s !== 'object') return;

    try {
      // Announcement bar text (+ hide the bar when disabled, if marked).
      if (s.announcement && typeof s.announcement === 'object') {
        setText('announcement', s.announcement.text);
        setText('announcement-link-label', s.announcement.linkLabel);
        setLink('announcement-link', s.announcement.linkUrl);
        if (s.announcement.enabled === false) {
          var bars = document.querySelectorAll('[data-site="announcement-bar"]');
          for (var b = 0; b < bars.length; b++) bars[b].style.display = 'none';
        }
      }

      // Contact: WhatsApp link (wa.me), email (text + mailto), addresses, hours.
      if (s.contact && typeof s.contact === 'object') {
        var digits = String(s.contact.whatsapp || '').replace(/\D/g, '');
        if (digits) {
          var waEls = document.querySelectorAll('[data-site="whatsapp-link"]');
          for (var w = 0; w < waEls.length; w++) {
            if (waEls[w].tagName === 'A') waEls[w].setAttribute('href', 'https://wa.me/' + digits);
          }
        }
        setText('whatsapp-display', s.contact.display);
        if (typeof s.contact.email === 'string' && s.contact.email) {
          setText('email', s.contact.email);
          var mailEls = document.querySelectorAll('[data-site="email"]');
          for (var m = 0; m < mailEls.length; m++) {
            if (mailEls[m].tagName === 'A') mailEls[m].setAttribute('href', 'mailto:' + s.contact.email);
          }
        }
        setText('address1', s.contact.address1);
        setText('address2', s.contact.address2);
        setText('hours', s.contact.hoursWeekdays);
        setText('hours-sunday', s.contact.hoursSunday);
      }

      // Hero (applied only where the matching elements exist).
      if (s.hero && typeof s.hero === 'object') {
        setText('hero-tag', s.hero.tag);
        setText('hero-title', s.hero.title);
        setText('hero-sub', s.hero.sub);
        setText('hero-desc', s.hero.desc);
        setText('hero-cta1-label', s.hero.cta1Label);
        setLink('hero-cta1', s.hero.cta1Url);
        setText('hero-cta2-label', s.hero.cta2Label);
        setLink('hero-cta2', s.hero.cta2Url);
      }

      // Sale banner + socials (applied only where marked).
      if (s.sale && typeof s.sale === 'object') {
        setText('sale-percent', s.sale.percentText);
        setText('sale-banner', s.sale.bannerText);
      }
      if (s.socials && typeof s.socials === 'object') {
        setLink('instagram', s.socials.instagram);
        setLink('facebook', s.socials.facebook);
        setLink('tiktok', s.socials.tiktok);
      }
    } catch (err) { /* silent fail */ }
  });
})();
