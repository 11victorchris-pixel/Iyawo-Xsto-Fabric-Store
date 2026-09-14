// GET    /api/categories/:id-or-slug
// PUT    /api/categories/:id-or-slug - update (admin only)
// DELETE /api/categories/:id-or-slug - soft delete, active = false (admin only)
const { supabase, supabaseAnon } = require('../_lib/supabase');
const { ok, fail, readBody, methodNotAllowed } = require('../_lib/respond');
const { requireAdmin } = require('../_lib/auth');
const { uniqueSlug, isUuid } = require('../_lib/slugify');

module.exports = async function handler(req) {
  if (req.method === 'OPTIONS') return ok({}, 204);

  const idOrSlug = decodeURIComponent(req.url.split('/').pop() || '');

  if (req.method === 'GET') return handleGet(idOrSlug);
  if (req.method === 'PUT') return handlePut(idOrSlug, req);
  if (req.method === 'DELETE') return handleDelete(idOrSlug, req);

  return methodNotAllowed(req, ['GET', 'PUT', 'DELETE']);
};

async function findCategory(client, idOrSlug) {
  let query = client.from('categories').select('id,name,slug,description,image_url,sort_order,active');
  query = isUuid(idOrSlug) ? query.eq('id', idOrSlug) : query.eq('slug', idOrSlug);
  return query.maybeSingle();
}

async function handleGet(idOrSlug) {
  const { data, error } = await findCategory(supabaseAnon, idOrSlug);
  if (error) return fail('Something went wrong.', 500);
  if (!data || !data.active) return fail('Category not found.', 404);
  return ok({ category: data });
}

async function handlePut(idOrSlug, req) {
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(auth.error.message, auth.error.status);

  const existing = await findCategory(supabase, idOrSlug);
  if (!existing.data) return fail('Category not found.', 404);

  const body = await readBody(req);
  const updates = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return fail('Category name is required.');
    updates.name = name;
    updates.slug = await uniqueSlug(supabase, 'categories', name, existing.data.id);
  }
  if (body.description !== undefined) updates.description = body.description;
  if (body.image_url !== undefined) updates.image_url = body.image_url || null;
  if (body.sort_order !== undefined) updates.sort_order = Math.max(0, Number(body.sort_order) || 0);
  if (body.active !== undefined) updates.active = Boolean(body.active);

  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', existing.data.id)
    .select()
    .single();

  if (error) return fail('Could not update the category. Please try again.', 500);
  return ok({ category: data });
}

async function handleDelete(idOrSlug, req) {
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(auth.error.message, auth.error.status);

  const existing = await findCategory(supabase, idOrSlug);
  if (!existing.data) return fail('Category not found.', 404);

  const { data, error } = await supabase
    .from('categories')
    .update({ active: false })
    .eq('id', existing.data.id)
    .select()
    .single();

  if (error) return fail('Could not deactivate the category. Please try again.', 500);
  return ok({ category: data });
}