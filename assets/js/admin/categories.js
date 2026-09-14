// IYAWO XSTO - ADMIN CATEGORIES
(function () {
  'use strict';
  const I = window.IYAWO;
  const H = window.IYAWO_ADMIN_HELPERS;
  if (!I || !H) return;

  const tbody = document.getElementById('categoriesBody');
  const form = document.getElementById('categoryForm');
  const modalTitle = document.getElementById('categoryModalTitle');
  let editingId = null;

  const bsModal = {
    _inst: null,
    _warned: false,
    get: function () {
      if (this._inst) return this._inst;
      try {
        this._inst = new bootstrap.Modal(document.getElementById('categoryModal'));
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

  async function load() {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Loading…</td></tr>';

    let res;
    try {
      // Admin endpoint returns active + inactive when authorized.
      res = await H.adminApi('/api/categories');
    } catch (err) {
      // Fall back to public list (active only) for read-only view.
      try {
        const pub = await I.api('/api/categories');
        res = { data: pub.data };
      } catch (err2) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row text-danger">' + I.escapeHtml(err.message) + '</td></tr>';
        return;
      }
    }

    const categories = (res.data && res.data.categories) || [];

    if (categories.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No categories yet.</td></tr>';
      return;
    }

    tbody.innerHTML = categories.map((c) =>
      '<tr>' +
        '<td><img class="thumb" src="' + I.escapeHtml(I.resolveImage(c.image_url)) + '" alt=""></td>' +
        '<td><strong>' + I.escapeHtml(c.name) + '</strong><div class="muted small">' + I.escapeHtml(c.slug) + '</div></td>' +
        '<td>' + I.escapeHtml(c.description || '—') + '</td>' +
        '<td>' + c.sort_order + '</td>' +
        '<td class="text-nowrap">' +
          (c.active !== false ? H.statusPill('delivered') : H.statusPill('cancelled')) + ' ' +
          '<button class="btn-admin-outline btn-sm ms-1" data-action="edit" data-id="' + c.id + '"><i class="bi bi-pencil"></i></button>' +
          '<button class="btn-admin-danger btn-sm ms-1" data-action="delete" data-id="' + c.id + '"><i class="bi bi-trash"></i></button>' +
        '</td>' +
      '</tr>'
    ).join('');
  }

  function openAdd() {
    editingId = null;
    modalTitle.textContent = 'Add Category';
    form.reset();
    bsModal.show();
  }

  async function openEdit(id) {
    let res;
    try {
      res = await H.adminApi('/api/categories/' + id);
    } catch (err) {
      I.showToast(err.message, 'error');
      return;
    }
    const c = res.data.category;
    editingId = c.id;
    modalTitle.textContent = 'Edit Category';
    form.reset();
    document.getElementById('categoryName').value = c.name;
    document.getElementById('categoryDescription').value = c.description || '';
    document.getElementById('categoryImage').value = c.image_url || '';
    document.getElementById('categorySort').value = c.sort_order || 0;
    bsModal.show();
  }

  async function onSave(e) {
    e.preventDefault();

    const payload = {
      name: document.getElementById('categoryName').value.trim(),
      description: document.getElementById('categoryDescription').value.trim(),
      image_url: document.getElementById('categoryImage').value.trim() || null,
      sort_order: Number(document.getElementById('categorySort').value) || 0
    };

    if (!payload.name) return I.showToast('Category name is required.', 'warning');

    const btn = document.getElementById('saveCategoryBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      if (editingId) {
        await H.adminApi('/api/categories/' + editingId, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await H.adminApi('/api/categories', { method: 'POST', body: JSON.stringify(payload) });
      }
      bsModal.hide();
      I.showToast('Category saved.', 'success');
      load();
    } catch (err) {
      I.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'SAVE CATEGORY';
    }
  }

  async function onDelete(id) {
    if (!confirm('Deactivate this category? Existing products will remain but this category will be hidden.')) return;
    try {
      await H.adminApi('/api/categories/' + id, { method: 'DELETE' });
      I.showToast('Category deactivated.', 'success');
      load();
    } catch (err) {
      I.showToast(err.message, 'error');
    }
  }

  function wire() {
    document.getElementById('addCategoryBtn').addEventListener('click', openAdd);
    form.addEventListener('submit', onSave);

    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'edit') openEdit(btn.dataset.id);
      if (btn.dataset.action === 'delete') onDelete(btn.dataset.id);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    wire();
    load();
  });
})();