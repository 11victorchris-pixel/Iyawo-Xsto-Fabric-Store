// GET    /api/categories/:id-or-slug
// PUT    /api/categories/:id-or-slug - update (admin only)
// DELETE /api/categories/:id-or-slug - soft delete, active = false (admin only)
const { getClients } = require('../_lib/supabase');
const { ok, fail, readBody, methodNotAllowed, getIdParam, handleOptions } = require('../_lib/respond');
const { requireAdmin } = require('../_lib/auth');
const { uniqueSlug, isUuid } = require('../_lib/slugify');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const clients = getClients();
  if (clients.missing || !clients.supabase || !clients.supabaseAnon) {
    return fail(res, 'Backend is not configured yet. Set Supabase env vars in Vercel.', 500);
  }

  const idOrSlug = getIdParam(req);
  if (!idOrSlug) return fail(res, 'Missing category id.', 400);

  if (req.method === 'GET') return handleGet(res, clients, idOrSlug);
  if (req.method === 'PUT') return handlePut(req, res, clients, idOrSlug);
  if (req.method === 'DELETE') return handleDelete(req, res, clients, idOrSlug);

  return methodNotAllowed(res, req, ['GET', 'PUT', 'DELETE']);
};

async function findCategory(client, idOrSlug) {
  let query = client.from('categories').select('id,name,slug,description,image_url,sort_order,active');
  query = isUuid(idOrSlug) ? query.eq('id', idOrSlug) : query.eq('slug', idOrSlug);
  return query.maybeSingle();
}

async function handleGet(res, { supabaseAnon }, idOrSlug) {
  const { data, error } = await findCategory(supabaseAnon, idOrSlug);
  if (error) return fail(res, 'Something went wrong.', 500);
  if (!data || !data.active) return fail(res, 'Category not found.', 404);
  return ok(res, { category: data });
}

async function handlePut(req, res, { supabase }, idOrSlug) {
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(res, auth.error.message, auth.error.status);

  const existing = await findCategory(supabase, idOrSlug);
  if (!existing.data) return fail(res, 'Category not found.', 404);

  const body = await readBody(req);
  const updates = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return fail(res, 'Category name is required.');
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

  if (error) return fail(res, 'Could not update the category. Please try again.', 500);
  return ok(res, { category: data });
}

async function handleDelete(req, res, { supabase }, idOrSlug) {
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(res, auth.error.message, auth.error.status);

  const existing = await findCategory(supabase, idOrSlug);
  if (!existing.data) return fail(res, 'Category not found.', 404);

  const { data, error } = await supabase
    .from('categories')
    .update({ active: false })
    .eq('id', existing.data.id)
    .select()
    .single();

  if (error) return fail(res, 'Could not deactivate the category. Please try again.', 500);
  return ok(res, { category: data });
}
