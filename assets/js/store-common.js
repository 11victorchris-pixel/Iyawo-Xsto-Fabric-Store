// ============================================================
// IYAWO XSTO - SHARED STORE LIBRARY
// Load after supabase CDN script + assets/js/config.js
// ============================================================
(function () {
  'use strict';

  const cfg = window.IYAWO_CONFIG || {};
  const SUPABASE_URL = cfg.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || '';
  const PAYSTACK_PUBLIC_KEY = cfg.PAYSTACK_PUBLIC_KEY || '';
  const WHATSAPP_NUMBER = cfg.WHATSAPP_NUMBER || '2347079057773';

  const supabase = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const CART_KEY = 'iyawo_cart_v1';
  const ORDER_KEY = 'iyawo_last_order';
  const CHECKOUT_KEY = 'iyawo_checkout_details';

  // ----------------------------------------------------------
  // Formatting helpers
  // ----------------------------------------------------------
  function formatNaira(amount) {
    const n = Number(amount) || 0;
    return '\u20A6' + n.toLocaleString('en-NG', { maximumFractionDigits: 2 });
  }

  function formatQty(q) {
    const n = Number(q) || 0;
    return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
  }

  function resolveImage(url) {
    if (!url) return '';
    if (/^(https?:|data:|blob:)/.test(url)) return url;
    return encodeURI(url);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // The price a customer pays for one unit.
  function productPrice(p) {
    if (p.is_on_sale && Number(p.sale_price) > 0) return Number(p.sale_price);
    return Number(p.price);
  }

  function parseNaira(text) {
    const cleaned = String(text || '').replace(/[^\d.]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  // ----------------------------------------------------------
  // Cart (localStorage - survives refreshes)
  // ----------------------------------------------------------
  function getCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const cart = raw ? JSON.parse(raw) : [];
      return Array.isArray(cart) ? cart : [];
    } catch (err) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
  }

  function cartCount() {
    return getCart().reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }

  function cartSubtotal() {
    return getCart().reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
  }

  function updateCartBadge() {
    const count = cartCount();
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = count > 99 ? '99+' : String(count);
      el.hidden = count <= 0;
    });
  }

  // product: a product object (or snapshot). quantity: number of units.
  function addToCart(product, quantity) {
    quantity = Number(quantity) || 1;
    const cart = getCart();
    const existing = cart.find((i) => i.product_id === product.id);
    const max = Number(product.stock_quantity) || 0;
    const wanted = (existing ? Number(existing.quantity) : 0) + quantity;

    if (max > 0 && wanted > max) {
      return { ok: false, message: 'Only ' + formatQty(max) + ' ' + (product.price_unit || 'yards') + ' are available.' };
    }

    const snapshot = {
      product_id: product.id,
      slug: product.slug,
      name: product.name,
      price: productPrice(product),
      unit: product.price_unit || 'yard',
      image_url: product.image_url || '',
      stock_quantity: max
    };

    if (existing) {
      existing.quantity = wanted;
    } else {
      cart.push(Object.assign({ quantity }, snapshot));
    }

    saveCart(cart);
    updateCartBadge();
    return { ok: true, cart };
  }

  // Set a specific quantity (used by +/- buttons). Clamps to stock.
  function setCartQuantity(productId, quantity) {
    const cart = getCart();
    const item = cart.find((i) => i.product_id === productId);
    if (!item) return { ok: false, message: 'Item not found in cart.' };

    quantity = Number(quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      removeFromCart(productId);
      return { ok: true, cart: getCart() };
    }

    const max = Number(item.stock_quantity) || 0;
    if (max > 0 && quantity > max) {
      return { ok: false, message: 'Only ' + formatQty(max) + ' ' + (item.unit || 'yards') + ' are available.' };
    }

    item.quantity = quantity;
    saveCart(cart);
    return { ok: true, cart };
  }

  function removeFromCart(productId) {
    const cart = getCart().filter((i) => i.product_id !== productId);
    saveCart(cart);
    return cart;
  }

  function clearCart() {
    localStorage.removeItem(CART_KEY);
    updateCartBadge();
  }

  // ----------------------------------------------------------
  // API helper (calls the Vercel serverless functions)
  // ----------------------------------------------------------
  async function api(path, options) {
    options = options || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});

    let res;
    try {
      res = await fetch(path, Object.assign({}, options, { headers }));
    } catch (err) {
      const e = new Error('Something went wrong. Please check your connection and try again.');
      e.status = 0;
      throw e;
    }

    let data = {};
    try { data = await res.json(); } catch (err) { /* empty body */ }

    if (!res.ok) {
      const e = new Error(data.error || 'Something went wrong. Please try again.');
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data;
  }

  // ----------------------------------------------------------
  // Delivery zones + fee estimation (display only - the server
  // always recalculates the real fee at checkout).
  // ----------------------------------------------------------
  async function loadDeliveryZones() {
    try {
      const res = await api('/api/delivery');
      return res.data && res.data.zones ? res.data.zones : [];
    } catch (err) {
      return [];
    }
  }

  function estimateDeliveryFee(zones, city, state) {
    const c = String(city || '').trim().toLowerCase();
    const s = String(state || '').trim().toLowerCase();

    for (const zone of zones) {
      if (!zone.active) continue;
      const cities = (zone.match_cities || []).map((x) => String(x).toLowerCase());
      const states = (zone.match_states || []).map((x) => String(x).toLowerCase());
      if ((c && cities.includes(c)) || (s && states.includes(s))) {
        return Number(zone.fee) || 0;
      }
    }

    const fallback = zones.find((z) => z.is_fallback) || zones.find((z) => z.active) || null;
    return fallback ? Number(fallback.fee) || 0 : 0;
  }

  // ----------------------------------------------------------
  // Toast notifications
  // ----------------------------------------------------------
  function showToast(message, type) {
    type = type || 'info';
    let container = document.querySelector('[data-toast-container]');
    if (!container) {
      container = document.createElement('div');
      container.setAttribute('data-toast-container', '');
      container.style.cssText =
        'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
        'z-index:1080;display:flex;flex-direction:column;gap:8px;align-items:center;';
      document.body.appendChild(container);
    }

    const el = document.createElement('div');
    el.className = 'toast show align-items-center border-0 text-white shadow';
    el.style.cssText = 'opacity:0.97;background:#111c5c;';
    if (type === 'success') el.style.background = '#198754';
    if (type === 'error') el.style.background = '#dc3545';
    if (type === 'warning') el.style.background = '#d97706';

    const body = document.createElement('div');
    body.className = 'd-flex';
    const text = document.createElement('div');
    text.className = 'toast-body';
    text.textContent = message;
    body.appendChild(text);
    el.appendChild(body);
    container.appendChild(el);

    setTimeout(() => {
      el.remove();
    }, 3200);
  }

  // ----------------------------------------------------------
  // Checkout details persistence (prefill on next visit)
  // ----------------------------------------------------------
  function saveCheckoutDetails(details) {
    localStorage.setItem(CHECKOUT_KEY, JSON.stringify(details));
  }

  function getCheckoutDetails() {
    try {
      const raw = localStorage.getItem(CHECKOUT_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  // Order confirmation data (current session only).
  function saveLastOrder(orderData) {
    sessionStorage.setItem(ORDER_KEY, JSON.stringify(orderData));
  }

  function getLastOrder() {
    try {
      const raw = sessionStorage.getItem(ORDER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  const NIGERIAN_STATES = [
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
    'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT - Abuja',
    'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
    'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
    'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
  ];

  window.IYAWO = {
    cfg,
    supabase,
    PAYSTACK_PUBLIC_KEY,
    WHATSAPP_NUMBER,
    formatNaira,
    formatQty,
    resolveImage,
    escapeHtml,
    productPrice,
    parseNaira,
    getCart,
    saveCart,
    cartCount,
    cartSubtotal,
    updateCartBadge,
    addToCart,
    setCartQuantity,
    removeFromCart,
    clearCart,
    api,
    loadDeliveryZones,
    estimateDeliveryFee,
    showToast,
    saveCheckoutDetails,
    getCheckoutDetails,
    saveLastOrder,
    getLastOrder,
    NIGERIAN_STATES
  };

  document.addEventListener('DOMContentLoaded', updateCartBadge);
})();