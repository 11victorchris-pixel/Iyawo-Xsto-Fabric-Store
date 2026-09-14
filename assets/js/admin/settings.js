// IYAWO XSTO - ADMIN SETTINGS (delivery fees)
(function () {
  'use strict';
  const I = window.IYAWO;
  const H = window.IYAWO_ADMIN_HELPERS;
  if (!I || !H) return;

  const rowsWrap = document.getElementById('deliveryRows');
  const form = document.getElementById('deliveryForm');

  function rowHtml(z, index) {
    const cities = (z.match_cities || []).join(', ');
    const states = (z.match_states || []).join(', ');
    return '<div class="row g-2 align-items-end mb-2 delivery-row" data-index="' + index + '">' +
      '<div class="col-md-2">' +
        '<label class="form-label">Zone Key</label>' +
        '<input type="text" class="form-control zone-key" value="' + I.escapeHtml(z.zone || '') + '" placeholder="e.g. Ilorin">' +
      '</div>' +
      '<div class="col-md-2">' +
        '<label class="form-label">Label</label>' +
        '<input type="text" class="form-control zone-label" value="' + I.escapeHtml(z.label || '') + '" placeholder="e.g. Ilorin">' +
      '</div>' +
      '<div class="col-md-2">' +
        '<label class="form-label">Fee (₦)</label>' +
        '<input type="number" step="0.01" min="0" class="form-control zone-fee" value="' + (z.fee || 0) + '">' +
      '</div>' +
      '<div class="col-md-3">' +
        '<label class="form-label">Cities (comma separated)</label>' +
        '<input type="text" class="form-control zone-cities" value="' + I.escapeHtml(cities) + '" placeholder="e.g. Ilorin, Offa">' +
      '</div>' +
      '<div class="col-md-2">' +
        '<label class="form-label">States (comma separated)</label>' +
        '<input type="text" class="form-control zone-states" value="' + I.escapeHtml(states) + '" placeholder="e.g. Kwara">' +
      '</div>' +
      '<div class="col-md-1 d-flex gap-2">' +
        '<div class="form-check mt-4" title="Used when no other zone matches">' +
          '<input type="checkbox" class="form-check-input zone-fallback" ' + (z.is_fallback ? 'checked' : '') + '>' +
          '<label class="form-check-label small">Fallback</label>' +
        '</div>' +
        '<button type="button" class="btn-admin-danger btn-sm mt-4 js-remove-row" title="Remove zone">✕</button>' +
      '</div>' +
    '</div>';
  }

  async function load() {
    let zones;
    try {
      const res = await I.api('/api/delivery');
      zones = (res.data && res.data.zones) || [];
    } catch (err) {
      zones = [];
    }

    rowsWrap.innerHTML = zones.length
      ? zones.map((z, i) => rowHtml(z, i)).join('')
      : '<div class="text-muted small py-3">No delivery zones configured.</div>';
  }

  function collect() {
    return Array.from(rowsWrap.querySelectorAll('.delivery-row')).map((row) => ({
      zone: row.querySelector('.zone-key').value.trim() || 'zone',
      label: row.querySelector('.zone-label').value.trim() || row.querySelector('.zone-key').value.trim(),
      fee: Number(row.querySelector('.zone-fee').value) || 0,
      match_cities: row.querySelector('.zone-cities').value.split(',').map((s) => s.trim()).filter(Boolean),
      match_states: row.querySelector('.zone-states').value.split(',').map((s) => s.trim()).filter(Boolean),
      is_fallback: row.querySelector('.zone-fallback').checked
    }));
  }

  async function onSave(e) {
    e.preventDefault();
    const zones = collect();
    if (zones.length === 0) return I.showToast('Add at least one delivery zone.', 'warning');

    const btn = document.getElementById('saveDeliveryBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      await H.adminApi('/api/delivery', {
        method: 'PUT',
        body: JSON.stringify({ zones })
      });
      I.showToast('Delivery settings saved.', 'success');
      load();
    } catch (err) {
      I.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Delivery Settings';
    }
  }

  function wire() {
    document.getElementById('addZoneBtn').addEventListener('click', () => {
      const html = rowsWrap.querySelector('.delivery-row');
      rowsWrap.insertAdjacentHTML('beforeend', rowHtml(
        html ? {} : { zone: '', label: '', fee: 0, match_cities: [], match_states: [], is_fallback: false },
        rowsWrap.querySelectorAll('.delivery-row').length
      ));
    });

    rowsWrap.addEventListener('click', (e) => {
      if (e.target.closest('.js-remove-row')) {
        e.target.closest('.delivery-row').remove();
      }
    });

    form.addEventListener('submit', onSave);
  }

  document.addEventListener('DOMContentLoaded', () => {
    wire();
    load();
  });
})();