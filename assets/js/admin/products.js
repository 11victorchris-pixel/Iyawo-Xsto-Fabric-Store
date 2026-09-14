// IYAWO XSTO - ADMIN PRODUCTS
(function () {
  'use strict';
  const I = window.IYAWO;
  const H = window.IYAWO_ADMIN_HELPERS;
  if (!I || !H) return;

  const tbody = document.getElementById('productsBody');
  const searchInput = document.getElementById('productSearch');
  const form = document.getElementById('productForm');
  const modal = document.getElementById('productModal');
  const modalTitle = document.getElementById('productModalTitle');
  const mainImageInput = document.getElementById('imageInput');
  const extraImagesInput = document.getElementById('extraImagesInput');
  const uploadedMain = document.getElementById('uploadedMain');
  const uploadedExtras = document.getElementById('uploadedExtras');

  let categories = [];
  let editingId = null;
  let mainImagePath = null;
  let extraImagePaths = [];
  let currentMainImageUrl = null;
  let currentExtraUrls = [];

  const bsModal = {
    _inst: null,
    _warned: false,
    get: function () {
      if (this._inst) return this._inst;
      try {
        this._inst = new bootstrap.Modal(modal);
        return this._inst;
      } catch (err) {
        if (!this._warned) {
          this._warned = true;
          I.showToast('Popup library failed to load. Check your connection and reload.', 'error');
        }
        return null;
      }
    },
    show: function () { const m = this.get(); if (m) m.show(); },
    hide: function () { const m = this.get(); if (m) m.hide(); }
  };

  // ----------------------------------------------------------
  // Loading / listing
  // ----------------------------------------------------------
  async function loadCategories() {
    try {
      const res = await I.api('/api/categories');
      categories = (res.data && res.data.categories) || [];
    } catch (err) {
      categories = [];
    }
    const select = document.getElementById('productCategory');
    select.innerHTML = '<option value="">Select category…</option>' +
      categories.map((c) => '<option value="' + c.slug + '">' + I.escapeHtml(c.name) + '</option>').join('');
  }

  async function loadProducts(search) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Loading…</td></tr>';

    let res;
    try {
      const q = new URLSearchParams({ limit: '100' });
      if (search) q.set('search', search);
      res = await H.adminApi('/api/products?' + q.toString());
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-row text-danger">' + I.escapeHtml(err.message) + '</td></tr>';
      return;
    }

    const products = (res.data && res.data.products) || [];

    if (products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No products found.</td></tr>';
      return;
    }

    tbody.innerHTML = products.map((p) =>
      '<tr>' +
        '<td><img class="thumb" src="' + I.escapeHtml(I.resolveImage(p.image_url)) + '" alt=""></td>' +
        '<td><strong>' + I.escapeHtml(p.name) + '</strong><div class="muted small">' + I.escapeHtml(p.slug) + '</div></td>' +
        '<td>' + I.escapeHtml(p.category) + '</td>' +
        '<td>' + (p.is_on_sale && Number(p.sale_price) > 0
          ? '<del class="muted small">' + I.formatNaira(p.price) + '</del><br><strong>' + I.formatNaira(p.sale_price) + '</strong>'
          : '<strong>' + I.formatNaira(p.price) + '</strong>') + '</td>' +
        '<td>' + I.formatQty(p.stock_quantity) + ' ' + I.escapeHtml(p.price_unit || 'yard') + '</td>' +
        '<td>' + (p.stock_status === 'in_stock' ? H.statusPill('paid') : H.statusPill('failed')) + '</td>' +
        '<td>' + (p.featured ? '<i class="bi bi-star-fill text-warning"></i>' : '<span class="text-muted">-</span>') + '</td>' +
        '<td>' + (p.active ? H.statusPill('delivered') : H.statusPill('cancelled')) + '</td>' +
        '<td class="text-nowrap">' +
          '<button class="btn-admin-outline btn-sm me-1" data-action="edit" data-id="' + p.id + '"><i class="bi bi-pencil"></i></button>' +
          '<button class="btn-admin-danger btn-sm" data-action="delete" data-id="' + p.id + '"><i class="bi bi-trash"></i></button>' +
        '</td>' +
      '</tr>'
    ).join('');
  }

  // ----------------------------------------------------------
  // Modal open (add / edit)
  // ----------------------------------------------------------
  function openAdd() {
    editingId = null;
    mainImagePath = null;
    extraImagePaths = [];
    currentMainImageUrl = null;
    currentExtraUrls = [];
    modalTitle.textContent = 'Add Product';
    form.reset();
    document.getElementById('productActive').checked = true;
    document.getElementById('productRetail').checked = true;
    document.getElementById('uploadedMain').innerHTML = '';
    document.getElementById('uploadedExtras').innerHTML = '';
    bsModal.show();
  }

  async function openEdit(id) {
    let res;
    try {
      res = await H.adminApi('/api/products/' + id);
    } catch (err) {
      I.showToast(err.message, 'error');
      return;
    }

    const p = res.data.product;
    editingId = p.id;
    currentMainImageUrl = p.image_url || null;
    mainImagePath = p.image_url && p.image_url.indexOf('/storage/v1/object/public/product-images/') === 0
      ? decodeURIComponent(p.image_url.split('/product-images/')[1])
      : null;
    const allExtras = p.additional_images || [];
    extraImagePaths = allExtras.filter((x) =>
      x.indexOf('/storage/v1/object/public/product-images/') === 0
    ).map((x) => decodeURIComponent(x.split('/product-images/')[1]));
    currentExtraUrls = allExtras.filter((x) =>
      x.indexOf('/storage/v1/object/public/product-images/') !== 0
    );

    modalTitle.textContent = 'Edit Product';
    form.reset();

    document.getElementById('productName').value = p.name;
    document.getElementById('productCategory').value = p.category;
    document.getElementById('productDescription').value = p.description || '';
    document.getElementById('productPrice').value = p.price;
    document.getElementById('productSalePrice').value = p.sale_price != null ? p.sale_price : '';
    document.getElementById('productSale').checked = Boolean(p.is_on_sale);
    document.getElementById('productUnit').value = p.price_unit || 'yard';
    document.getElementById('productStock').value = p.stock_quantity;
    document.getElementById('productFeatured').checked = Boolean(p.featured);
    document.getElementById('productWholesale').checked = Boolean(p.wholesale_available);
    document.getElementById('productRetail').checked = p.retail_available !== false;
    document.getElementById('productActive').checked = p.active !== false;

    renderUploadedImages(p.image_url);
    bsModal.show();
  }

  function renderUploadedImages(mainUrl) {
    uploadedMain.innerHTML = mainUrl
      ? '<div class="d-flex align-items-center gap-2 mb-2">' +
          '<img src="' + I.escapeHtml(I.resolveImage(mainUrl)) + '" style="width:64px;height:64px;object-fit:cover;border-radius:8px;">' +
          '<span class="small muted">Current main image</span>' +
        '</div>'
      : '';

    uploadedExtras.innerHTML = extraImagePaths.length
      ? extraImagePaths.map((path, i) =>
          '<div class="d-flex align-items-center gap-2 mb-1">' +
            '<img src="' + I.escapeHtml(H.publicImageUrl(path)) + '" style="width:48px;height:48px;object-fit:cover;border-radius:6px;">' +
            '<span class="small muted flex-grow-1">' + I.escapeHtml(path.split('/').pop()) + '</span>' +
            '<button type="button" class="btn-admin-danger btn-sm" data-remove-extra="' + i + '">✕</button>' +
          '</div>'
        ).join('')
      : '<div class="small muted">No additional images.</div>';
  }

  // ----------------------------------------------------------
  // Save
  // ----------------------------------------------------------
  async function onSave(e) {
    e.preventDefault();

    const name = document.getElementById('productName').value.trim();
    const category = document.getElementById('productCategory').value;

    if (!name) return I.showToast('Product name is required.', 'warning');
    if (!category) return I.showToast('Please select a category.', 'warning');

    const salePriceRaw = document.getElementById('productSalePrice').value.trim();
    const salePrice = salePriceRaw === '' ? null : Number(salePriceRaw);
    const isOnSale = document.getElementById('productSale').checked;

    const payload = {
      name,
      category,
      description: document.getElementById('productDescription').value.trim(),
      price: Number(document.getElementById('productPrice').value) || 0,
      sale_price: salePrice,
      is_on_sale: isOnSale && salePrice > 0,
      price_unit: document.getElementById('productUnit').value || 'yard',
      stock_quantity: Number(document.getElementById('productStock').value) || 0,
      featured: document.getElementById('productFeatured').checked,
      wholesale_available: document.getElementById('productWholesale').checked,
      retail_available: document.getElementById('productRetail').checked,
      active: document.getElementById('productActive').checked,
      image_url: mainImagePath ? H.publicImageUrl(mainImagePath) : currentMainImageUrl,
      additional_images: extraImagePaths.map((p) => H.publicImageUrl(p)).concat(currentExtraUrls)
    };

    const btn = document.getElementById('saveProductBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      if (editingId) {
        await H.adminApi('/api/products/' + editingId, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await H.adminApi('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      bsModal.hide();
      I.showToast('Product saved.', 'success');
      loadProducts(searchInput.value.trim());
    } catch (err) {
      I.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'SAVE PRODUCT';
    }
  }

  // ----------------------------------------------------------
  // Delete (soft)
  // ----------------------------------------------------------
  async function onDelete(id) {
    if (!confirm('Deactivate this product? It will no longer appear on the website.')) return;

    try {
      await H.adminApi('/api/products/' + id, { method: 'DELETE' });
      I.showToast('Product deactivated.', 'success');
      loadProducts(searchInput.value.trim());
    } catch (err) {
      I.showToast(err.message, 'error');
    }
  }

  // ----------------------------------------------------------
  // Wiring
  // ----------------------------------------------------------
  function wire() {
    document.getElementById('addProductBtn').addEventListener('click', openAdd);

    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'edit') openEdit(btn.dataset.id);
      if (btn.dataset.action === 'delete') onDelete(btn.dataset.id);
    });

    searchInput.addEventListener('input', debounce(() => loadProducts(searchInput.value.trim()), 400));

    form.addEventListener('submit', onSave);

    mainImageInput.addEventListener('change', async () => {
      const file = mainImageInput.files[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        I.showToast('Image is too large. Maximum 4MB.', 'warning');
        mainImageInput.value = '';
        return;
      }
      try {
        const path = await H.uploadProductImage(file, editingId || 'new');
        if (mainImagePath) H.deleteProductImage(mainImagePath).catch(() => {});
        mainImagePath = path;
        uploadedMain.innerHTML =
          '<div class="d-flex align-items-center gap-2 mb-2">' +
            '<img src="' + I.escapeHtml(H.publicImageUrl(path)) + '" style="width:64px;height:64px;object-fit:cover;border-radius:8px;">' +
            '<span class="small text-success">New main image uploaded</span>' +
          '</div>';
      } catch (err) {
        I.showToast(err.message, 'error');
      }
      mainImageInput.value = '';
    });

    extraImagesInput.addEventListener('change', async () => {
      const files = Array.from(extraImagesInput.files);
      if (!files.length) return;
      for (const file of files) {
        if (file.size > 4 * 1024 * 1024) {
          I.showToast('Image "' + file.name + '" is too large (max 4MB).', 'warning');
          continue;
        }
        try {
          const path = await H.uploadProductImage(file, editingId || 'new');
          extraImagePaths.push(path);
        } catch (err) {
          I.showToast(err.message, 'error');
        }
      }
      extraImagesInput.value = '';
      renderUploadedImages(mainImagePath ? H.publicImageUrl(mainImagePath) : null);
    });

    uploadedExtras.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-extra]');
      if (!btn) return;
      const idx = Number(btn.dataset.removeExtra);
      const [path] = extraImagePaths.splice(idx, 1);
      H.deleteProductImage(path).catch(() => {});
      renderUploadedImages(mainImagePath ? H.publicImageUrl(mainImagePath) : null);
    });
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadCategories();
    wire();
    loadProducts('');
  });
})();