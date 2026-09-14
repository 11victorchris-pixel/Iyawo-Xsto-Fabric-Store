// IYAWO XSTO - CART PAGE
(function () {
  'use strict';
  const I = window.IYAWO;
  if (!I) return;

  const itemsWrap = document.getElementById('cartItems');
  const emptyState = document.getElementById('cartEmpty');
  const summaryWrap = document.getElementById('cartSummary');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const whatsappBtn = document.getElementById('whatsappBtn');

  let zones = [];

  function render() {
    const cart = I.getCart();

    if (cart.length === 0) {
      itemsWrap.innerHTML = '';
      summaryWrap.hidden = true;
      emptyState.hidden = false;
      return;
    }

    summaryWrap.hidden = false;
    emptyState.hidden = true;

    itemsWrap.innerHTML = cart.map((item) => {
      const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
      const max = Number(item.stock_quantity) || 0;
      const atMax = max > 0 && Number(item.quantity) >= max;

      return '<div class="row align-items-center g-2 g-md-3 py-3 cart-row" style="border-bottom:1px solid var(--border,#e8e5df);" data-row="' + item.product_id + '">' +
        '<div class="col-12 col-md-5">' +
          '<div class="product-cell">' +
            '<img src="' + I.escapeHtml(I.resolveImage(item.image_url)) + '" alt="' + I.escapeHtml(item.name) + '" loading="lazy">' +
            '<div class="product-cell-text">' +
              '<a href="product.html?slug=' + encodeURIComponent(item.slug || '') + '">' + I.escapeHtml(item.name) + '</a>' +
              '<div class="unit-hint">' + I.formatNaira(item.price) + ' per ' + I.escapeHtml(item.unit || 'yard') + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="col-7 col-sm-6 col-md-3">' +
          '<small class="text-muted fw-bold d-block mb-1 text-uppercase" style="font-size:0.7rem;letter-spacing:0.5px;">Yards</small>' +
          '<div class="qty-stepper">' +
            '<button type="button" class="js-minus" data-id="' + item.product_id + '" aria-label="Decrease yards for ' + I.escapeHtml(item.name) + '"><i class="bi bi-dash"></i></button>' +
            '<input type="text" value="' + I.formatQty(item.quantity) + '" data-qty-input="' + item.product_id + '" inputmode="decimal" aria-label="Number of yards for ' + I.escapeHtml(item.name) + '">' +
            '<button type="button" class="js-plus" data-id="' + item.product_id + '" aria-label="Increase yards for ' + I.escapeHtml(item.name) + '"' + (atMax ? ' disabled' : '') + '><i class="bi bi-plus"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="col-3 col-md-2 text-start text-md-end">' +
          '<small class="text-muted d-block d-md-none" style="font-size:0.7rem;">Line total</small>' +
          '<strong class="d-block text-break" data-line-total="' + item.product_id + '">' + I.formatNaira(lineTotal) + '</strong>' +
          '<small class="text-muted d-block text-break" style="font-size:0.72rem;">' + I.formatQty(item.quantity) + ' ' + I.escapeHtml(item.unit || 'yard') + '(s) &times; ' + I.formatNaira(item.price) + '</small>' +
        '</div>' +
        '<div class="col-2 col-md-2 text-end">' +
          '<button type="button" class="cart-remove js-remove" data-id="' + item.product_id + '" aria-label="Remove ' + I.escapeHtml(item.name) + ' from cart" title="Remove"><i class="bi bi-x-lg"></i></button>' +
        '</div>' +
      '</div>';
    }).join('');

    renderSummary(cart);
  }

  function renderSummary(cart) {
    const subtotal = I.cartSubtotal();
    const city = document.getElementById('deliveryCity').value.trim();
    const state = document.getElementById('deliveryState').value;
    const fee = I.estimateDeliveryFee(zones, city, state);
    const total = subtotal + fee;

    document.getElementById('sumSubtotal').textContent = I.formatNaira(subtotal);
    document.getElementById('sumDelivery').textContent = fee > 0 ? I.formatNaira(fee) : 'At checkout';
    document.getElementById('sumTotal').textContent = I.formatNaira(fee > 0 ? total : subtotal);

    checkoutBtn.disabled = false;
    whatsappBtn.disabled = false;

    // Remember location for checkout prefill
    I.saveCheckoutDetails(Object.assign(I.getCheckoutDetails(), { city, state }));
  }

  function wire() {
    itemsWrap.addEventListener('click', (e) => {
      const minus = e.target.closest('.js-minus');
      const plus = e.target.closest('.js-plus');
      const remove = e.target.closest('.js-remove');
      if (!minus && !plus && !remove) return;

      const id = (minus || plus || remove).dataset.id;
      const item = I.getCart().find((i) => i.product_id === id);
      if (!item) return;

      if (remove) {
        I.removeFromCart(id);
        render();
        return;
      }

      const qty = Number(item.quantity);
      let result;
      if (minus) result = I.setCartQuantity(id, qty - 1);
      if (plus) result = I.setCartQuantity(id, qty + 1);

      if (result && !result.ok) {
        I.showToast(result.message, 'warning');
      }
      render();
    });

    itemsWrap.addEventListener('change', (e) => {
      const input = e.target.closest('[data-qty-input]');
      if (!input) return;
      const id = input.dataset.qtyInput;
      const result = I.setCartQuantity(id, input.value);
      if (!result.ok) I.showToast(result.message, 'warning');
      render();
    });

    document.getElementById('deliveryCity').addEventListener('input', () => renderSummary(I.getCart()));
    document.getElementById('deliveryState').addEventListener('change', () => renderSummary(I.getCart()));

    checkoutBtn.addEventListener('click', () => {
      if (I.getCart().length === 0) return;
      location.href = 'checkout.html';
    });

    whatsappBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const cart = I.getCart();
      if (cart.length === 0) return;
      const city = document.getElementById('deliveryCity').value.trim();
      const state = document.getElementById('deliveryState').value;
      const subtotal = I.cartSubtotal();

      const lines = cart.map((item, i) =>
        (i + 1) + '. ' + item.name + ' x ' + I.formatQty(item.quantity) + ' ' + (item.unit || 'yard') + '(s) - ' + I.formatNaira((Number(item.price) || 0) * (Number(item.quantity) || 0))
      ).join('\n');

      const message =
        'Hello Iyawo Xsto Fabric Store! I would like to place an order:\n\n' +
        lines + '\n\n' +
        'Subtotal: ' + I.formatNaira(subtotal) + '\n' +
        'Delivery to: ' + (city ? city + ', ' : '') + (state || '') + '\n\n' +
        'Please confirm availability, delivery fee and payment details.';

      window.open('https://wa.me/' + I.WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message), '_blank');
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    zones = await I.loadDeliveryZones();
    wire();
    render();

    // Prefill city/state from saved checkout details
    const saved = I.getCheckoutDetails();
    if (saved.city) document.getElementById('deliveryCity').value = saved.city;
    if (saved.state) document.getElementById('deliveryState').value = saved.state;
    renderSummary(I.getCart());
  });
})();