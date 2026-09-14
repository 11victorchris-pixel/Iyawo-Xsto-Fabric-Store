// IYAWO XSTO - SHOP PAGE
(function () {
  'use strict';
  const I = window.IYAWO;
  if (!I) return;

  const params = new URLSearchParams(location.search);
  const grid = document.getElementById('productGrid');
  const emptyState = document.getElementById('emptyState');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const productCountLabel = document.getElementById('productCount');

  const state = {
    category: params.get('category') || '',
    search: '',
    sort: 'newest',
    sale: '',
    availability: '',
    page: 1,
    hasMore: false
  };

  let productMap = {};
  let categoryNames = {};

  // ----------------------------------------------------------
  // Categories
  // ----------------------------------------------------------
  async function loadCategories() {
    const container = document.getElementById('categoryPills');
    try {
      const res = await I.api('/api/categories');
      const categories = (res.data && res.data.categories) || [];
      categoryNames = {};
      categories.forEach((c) => { categoryNames[c.slug] = c.name; });
      container.innerHTML = '';

      const all = document.createElement('a');
      all.className = 'pill' + (state.category ? '' : ' active');
      all.href = 'shop.html';
      all.textContent = 'All Products';
      container.appendChild(all);

      categories.forEach((cat) => {
        const a = document.createElement('a');
        a.className = 'pill' + (state.category === cat.slug ? ' active' : '');
        a.href = 'shop.html?category=' + encodeURIComponent(cat.slug);
        a.textContent = cat.name;
        container.appendChild(a);
      });
    } catch (err) {
      container.innerHTML = '<span class="text-muted small">Categories could not be loaded.</span>';
    }
  }

  // ----------------------------------------------------------
  // Products
  // ----------------------------------------------------------
  function buildQuery() {
    const q = new URLSearchParams();
    if (state.category) q.set('category', state.category);
    if (state.search) q.set('search', state.search);
    if (state.sale) q.set('sale', state.sale);
    if (state.availability) q.set('availability', state.availability);
    q.set('sort', state.sort);
    q.set('page', String(state.page));
    q.set('limit', '24');
    return q.toString();
  }

  async function fetchProducts(reset) {
    const loading = spinner();

    if (reset) {
      state.page = 1;
      grid.innerHTML = '';
    }
    grid.appendChild(loading);

    let res;
    try {
      res = await I.api('/api/products?' + buildQuery());
    } catch (err) {
      loading.remove();
      if (reset) grid.innerHTML = '';
      emptyState.innerHTML =
        '<span class="empty-icon"><i class="bi bi-wifi-off"></i></span><p>' + I.escapeHtml(err.message) + '</p>' +
        '<button class="btn btn-dark mt-2" onclick="location.reload()">Try Again</button>';
      emptyState.hidden = false;
      return;
    }

    const products = (res.data && res.data.products) || [];
    products.forEach((p) => { productMap[p.id] = p; });

    loading.remove();
    products.forEach((p) => grid.appendChild(productCard(p)));

    state.hasMore = Boolean(res.data && res.data.has_more);
    loadMoreBtn.hidden = !state.hasMore;

    if (productCountLabel) {
      productCountLabel.textContent =
        products.length > 0
          ? 'Showing ' + products.length + (state.hasMore ? '+' : '') + ' products'
          : '';
    }

    if (products.length === 0) {
      emptyState.hidden = false;
      emptyState.innerHTML =
        '<span class="empty-icon"><i class="bi bi-scissors"></i></span><p>No products found. Try a different search or category.</p>';
    } else {
      emptyState.hidden = true;
    }
  }

  function spinner() {
    const wrap = document.createElement('div');
    wrap.className = 'text-center py-5';
    wrap.innerHTML = '<div class="spinner-border text-warning" role="status"><span class="visually-hidden">Loading...</span></div>';
    return wrap;
  }

  function productCard(p) {
    const out = p.stock_status === 'out_of_stock' || Number(p.stock_quantity) <= 0;
    const price = I.productPrice(p);
    const categoryName = categoryNames[p.category] || p.category;
    const col = document.createElement('div');
    col.className = 'col-12 col-sm-6 col-md-6 col-lg-4';

    let yardOptions = '';
    for (let y = 1; y <= 10; y++) {
      yardOptions += '<option value="' + y + '"' + (y === 2 ? ' selected' : '') + '>' + y + (y === 1 ? ' yard' : ' yards') + '</option>';
    }

    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML =
      '<div class="product-image' + (out ? ' dimmed' : '') + '">' +
        (p.is_on_sale && !out ? '<span class="sale-badge">SALE</span>' : '') +
        (out ? '<span class="out-of-stock-badge">OUT OF STOCK</span>' : '') +
        '<a href="product.html?slug=' + encodeURIComponent(p.slug) + '">' +
          '<img src="' + I.escapeHtml(I.resolveImage(p.image_url)) + '" alt="' + I.escapeHtml(p.name) + '" loading="lazy">' +
        '</a>' +
      '</div>' +
      '<div class="product-info">' +
        '<span class="product-category">' + I.escapeHtml(categoryName) + '</span>' +
        '<h4>' + I.escapeHtml(p.name) + '</h4>' +
        '<p>' + I.escapeHtml(p.description || '') + '</p>' +
        '<small>PRICE PER ' + I.escapeHtml(String(p.price_unit || 'yard').toUpperCase()) + '</small>' +
        '<div class="product-price">' +
          (p.is_on_sale && Number(p.sale_price) > 0
            ? '<del>' + I.formatNaira(p.price) + '</del><strong>' + I.formatNaira(price) + '</strong>'
            : '<strong>' + I.formatNaira(price) + '</strong>') +
        '</div>' +
        (out
          ? '<button class="btn btn-secondary w-100" disabled>Out of Stock</button>'
          : '<div class="d-flex gap-2 mb-2 flex-wrap shop-buy-row">' +
              '<select class="form-select yard-select flex-fill w-100" style="max-width:115px;min-height:44px;" aria-label="Number of yards">' + yardOptions + '</select>' +
              '<button class="btn btn-dark flex-grow-1 flex-fill w-100 js-add-cart" style="min-height:44px;" data-id="' + p.id + '" aria-label="Add ' + I.escapeHtml(p.name) + ' to cart"><i class="bi bi-cart-plus"></i> ADD TO CART</button>' +
            '</div>' +
            '<a href="product.html?slug=' + encodeURIComponent(p.slug) + '" class="btn btn-warning w-100">View Details <i class="bi bi-arrow-right"></i></a>') +
      '</div>';

    col.appendChild(card);
    return col;
  }

  // ----------------------------------------------------------
  // Events
  // ----------------------------------------------------------
  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function wire() {
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-add-cart');
      if (!btn) return;
      const product = productMap[btn.dataset.id];
      if (!product) return;

      const card = btn.closest('.product-info');
      const yardSelect = card ? card.querySelector('.yard-select') : null;
      let yards = yardSelect ? Number(yardSelect.value) : 2;
      if (!Number.isFinite(yards) || yards < 1) yards = 1;
      if (yards > 10) yards = 10;

      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = 'Adding...';

      const result = I.addToCart(product, yards);
      if (result.ok) {
        btn.innerHTML = '<i class="bi bi-check"></i> Added';
      } else {
        btn.innerHTML = original;
      }
      setTimeout(() => {
        btn.innerHTML = original;
        btn.disabled = false;
      }, 1400);

      I.showToast(
        result.ok
          ? product.name + ' (' + yards + (yards === 1 ? ' yard' : ' yards') + ') added to your cart.'
          : result.message,
        result.ok ? 'success' : 'warning'
      );
    });

    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', debounce(() => {
      state.search = searchInput.value.trim();
      fetchProducts(true);
    }, 400));

    document.getElementById('sortSelect').addEventListener('change', (e) => {
      state.sort = e.target.value;
      fetchProducts(true);
    });

    document.getElementById('saleFilter').addEventListener('change', (e) => {
      state.sale = e.target.checked ? 'true' : '';
      fetchProducts(true);
    });

    document.getElementById('stockFilter').addEventListener('change', (e) => {
      state.availability = e.target.checked ? 'in_stock' : '';
      fetchProducts(true);
    });

    loadMoreBtn.addEventListener('click', () => {
      state.page += 1;
      fetchProducts(false);
    });
  }

  // ----------------------------------------------------------
  // Init
  // ----------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    loadCategories();
    wire();
    fetchProducts(true);
  });
})();