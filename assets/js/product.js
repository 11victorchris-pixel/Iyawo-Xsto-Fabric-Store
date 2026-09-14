// IYAWO XSTO - PRODUCT DETAIL PAGE
(function () {
  'use strict';
  const I = window.IYAWO;
  if (!I) return;

  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || '';
  const content = document.getElementById('productContent');
  const errorBox = document.getElementById('productError');

  let product = null;
  let quantity = 1;

  async function loadProduct() {
    if (!slug) {
      showError('Product not found.');
      return;
    }

    content.innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-warning" role="status">' +
      '<span class="visually-hidden">Loading...</span></div></div>';

    let res;
    try {
      res = await I.api('/api/products/' + encodeURIComponent(slug));
    } catch (err) {
      showError(err.message);
      return;
    }

    product = res.data.product;
    document.title = product.name + ' | IYAWO XSTO Fabric Store';
    render();
  }

  function showError(message) {
    content.hidden = true;
    errorBox.hidden = false;
    errorBox.innerHTML =
      '<p>' + I.escapeHtml(message) + '</p>' +
      '<a href="shop.html" class="btn btn-dark mt-2">Back to Shop</a>';
  }

  function galleryImages() {
    const images = [product.image_url].concat(product.additional_images || []).filter(Boolean);
    return images.length ? images : ['assets/logo/logo.png'];
  }

  function render() {
    const out = product.stock_status === 'out_of_stock' || Number(product.stock_quantity) <= 0;
    const images = galleryImages();
    const price = I.productPrice(product);
    const available = Number(product.stock_quantity) || 0;

    content.innerHTML =
      '<div class="row g-4 g-lg-5 product-detail-row">' +
        '<div class="col-12 col-lg-6 order-1">' +
          '<div class="product-gallery-main"><img id="mainImage" src="' + I.escapeHtml(I.resolveImage(images[0])) + '" alt="' + I.escapeHtml(product.name) + '" class="img-fluid w-100"></div>' +
          (images.length > 1
            ? '<div class="gallery-thumbs d-flex flex-nowrap" style="overflow-x:auto;">' +
                images.map((img, i) =>
                  '<img src="' + I.escapeHtml(I.resolveImage(img)) + '" data-index="' + i + '" class="' + (i === 0 ? 'active' : '') + '" alt="View ' + (i + 1) + ' of ' + I.escapeHtml(product.name) + '" loading="lazy">'
                ).join('') +
              '</div>'
            : '') +
        '</div>' +

        '<div class="col-12 col-lg-6 order-2">' +
          '<div class="product-detail-info">' +
            '<span class="product-category">' + I.escapeHtml(product.category) + '</span>' +
            '<h1 class="mb-3">' + I.escapeHtml(product.name) + '</h1>' +

            '<div class="mb-3">' +
              (out
                ? '<span class="stock-badge out-of-stock">OUT OF STOCK</span>'
                : '<span class="stock-badge in-stock">IN STOCK - ' + I.formatQty(available) + ' ' + I.escapeHtml(product.price_unit || 'yard') + 's available</span>') +
            '</div>' +

            '<div class="mb-3">' +
              (product.featured ? '<span class="feature-tag"><i class="bi bi-star-fill"></i> FEATURED</span>' : '') +
              (product.wholesale_available ? '<span class="feature-tag">WHOLESALE AVAILABLE</span>' : '') +
              (product.retail_available ? '<span class="feature-tag">RETAIL AVAILABLE</span>' : '') +
            '</div>' +

            '<p class="text-muted mb-4">' + I.escapeHtml(product.description || '') + '</p>' +

            '<small class="text-uppercase text-muted" style="font-size:0.7rem;font-weight:700;letter-spacing:1px;">' +
              'PRICE PER ' + I.escapeHtml(String(product.price_unit || 'yard').toUpperCase()) + '</small>' +

            '<div class="product-price mb-4" style="font-size:1.8rem;">' +
              (product.is_on_sale && Number(product.sale_price) > 0
                ? '<del style="font-size:1.2rem;">' + I.formatNaira(product.price) + '</del><strong>' + I.formatNaira(price) + '</strong>'
                : '<strong>' + I.formatNaira(price) + '</strong>') +
            '</div>' +

            (out
              ? '<button class="btn btn-secondary btn-lg w-100" disabled>Currently Out of Stock</button>' +
                '<p class="mt-2 small text-muted">This product cannot be purchased right now. Contact us on WhatsApp for availability.</p>'
              : '<label class="form-label fw-bold small" for="qtyInput">Number of yards</label>' +
                '<div class="d-flex gap-2 mb-2 align-items-center flex-wrap product-qty-row">' +
                  '<div class="qty-stepper">' +
                    '<button type="button" id="qtyMinus" aria-label="Decrease yards"><i class="bi bi-dash"></i></button>' +
                    '<input type="text" id="qtyInput" value="1" inputmode="decimal" aria-label="Number of yards">' +
                    '<button type="button" id="qtyPlus" aria-label="Increase yards"><i class="bi bi-plus"></i></button>' +
                  '</div>' +
                  '<div class="ms-auto text-end product-line-total">' +
                    '<small class="text-muted d-block" style="font-size:0.72rem;">Line total (<span id="lineYards">1 yard</span>)</small>' +
                    '<strong id="lineTotal" class="d-block text-break" style="font-size:1.25rem;">' + I.formatNaira(price) + '</strong>' +
                    '<small class="text-muted d-block" style="font-size:0.72rem;">' + I.formatNaira(price) + ' per ' + I.escapeHtml(product.price_unit || 'yard') + '</small>' +
                  '</div>' +
                '</div>' +
                '<div class="d-grid gap-2 product-cta">' +
                  '<button class="btn btn-dark btn-lg w-100" id="addToCartBtn" aria-label="Add to cart"><i class="bi bi-cart-plus"></i> ADD TO CART</button>' +
                  '<button class="btn btn-warning btn-lg w-100" id="buyNowBtn" aria-label="Buy now">BUY NOW <i class="bi bi-arrow-right"></i></button>' +
                '</div>' +
                '<a class="btn btn-outline-success w-100 mt-2" id="whatsappBtn" href="#" target="_blank">' +
                  '<i class="bi bi-whatsapp"></i> ORDER VIA WHATSAPP</a>') +

            '<div class="mt-4 pt-3" style="border-top:1px solid var(--border,#e8e5df);">' +
              '<a href="shop.html?category=' + encodeURIComponent(product.category) + '" class="link-muted"><i class="bi bi-arrow-left"></i> Back to ' + I.escapeHtml(product.category.replace(/-/g, ' ')) + '</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    wireDetail(images, out, available, price);
  }

  function wireDetail(images, out, available, price) {
    // Gallery
    const mainImage = document.getElementById('mainImage');
    document.querySelectorAll('.gallery-thumbs img').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        mainImage.src = thumb.src;
        document.querySelectorAll('.gallery-thumbs img').forEach((t) => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });

    if (out) return;

    const input = document.getElementById('qtyInput');
    const minus = document.getElementById('qtyMinus');
    const plus = document.getElementById('qtyPlus');

    function clamp(value) {
      const max = available > 0 ? available : 99999;
      let n = Number(String(value).replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) n = 1;
      if (max > 0 && n > max) {
        I.showToast('Only ' + I.formatQty(max) + ' ' + (product.price_unit || 'yards') + ' are available.', 'warning');
        n = max;
      }
      return Math.round(n * 100) / 100;
    }

    function setQuantity(value) {
      quantity = clamp(value);
      input.value = I.formatQty(quantity);
      const totalEl = document.getElementById('lineTotal');
      if (totalEl) totalEl.textContent = I.formatNaira(price * quantity);
      const yardsEl = document.getElementById('lineYards');
      if (yardsEl) yardsEl.textContent = I.formatQty(quantity) + (Number(quantity) === 1 ? ' yard' : ' yards');
      updateWhatsapp();
    }

    function updateWhatsapp() {
      const wa = document.getElementById('whatsappBtn');
      if (!wa) return;
      const message =
        'Hello Iyawo Xsto Fabric Store! I would like to order:\n\n' +
        '- ' + product.name + ' x ' + I.formatQty(quantity) + ' ' + (product.price_unit || 'yard') + '(s)\n' +
        'Price: ' + I.formatNaira(price) + ' per ' + (product.price_unit || 'yard') + '\n' +
        'Total: ' + I.formatNaira(price * quantity) + '\n\n' +
        'Please confirm availability and delivery.';
      wa.href = 'https://wa.me/' + I.WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message);
    }

    minus.addEventListener('click', () => setQuantity(quantity - 1));
    plus.addEventListener('click', () => setQuantity(quantity + 1));
    input.addEventListener('change', () => setQuantity(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') setQuantity(input.value);
    });

    const addBtn = document.getElementById('addToCartBtn');
    const buyBtn = document.getElementById('buyNowBtn');

    function doAdd() {
      const result = I.addToCart(product, quantity);
      if (!result.ok) {
        I.showToast(result.message, 'warning');
        setQuantity(available);
        return false;
      }
      I.showToast(product.name + ' (' + I.formatQty(quantity) + (Number(quantity) === 1 ? ' yard' : ' yards') + ') added to your cart.', 'success');
      return true;
    }

    addBtn.addEventListener('click', () => {
      const original = addBtn.innerHTML;
      addBtn.disabled = true;
      addBtn.textContent = 'Adding...';
      doAdd();
      setTimeout(() => {
        addBtn.disabled = false;
        addBtn.innerHTML = original;
      }, 900);
    });

    buyBtn.addEventListener('click', () => {
      if (doAdd()) location.href = 'checkout.html';
    });

    // WhatsApp order with quantity (live-updated via updateWhatsapp)
    updateWhatsapp();
  }

  document.addEventListener('DOMContentLoaded', loadProduct);
})();