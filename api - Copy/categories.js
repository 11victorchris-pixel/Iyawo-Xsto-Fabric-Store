// GET  /api/categories - public list
// POST /api/categories - create category (admin only)
const { getClients } = require('./_lib/supabase');
const { ok, fail, readBody, methodNotAllowed, getAuthHeader, handleOptions } = require('./_lib/respond');
const { requireAdmin } = require('./_lib/auth');
const { uniqueSlug } = require('./_lib/slugify');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const clients = getClients();
  if (clients.missing || !clients.supabase || !clients.supabaseAnon) {
    return fail(res, 'Backend is not configured yet. Set Supabase env vars in Vercel.', 500);
  }
  const { supabase, supabaseAnon } = clients;

  if (req.method === 'GET') {
    // Admin requests (valid token) also see inactive categories.
    const hasToken = (getAuthHeader(req) || '').startsWith('Bearer ');
    const auth = hasToken ? await requireAdmin(req, supabase).catch(() => null) : null;
    const client = auth && auth.admin ? supabase : supabaseAnon;

    let query = client
      .from('categories')
      .select('id,name,slug,description,image_url,sort_order,active');

    if (!auth || !auth.admin) query = query.eq('active', true);
    query = query.order('sort_order', { ascending: true });

    const { data, error } = await query;
    if (error) return fail(res, 'Something went wrong while loading categories.', 500);
    return ok(res, { categories: data || [] });
  }

  if (req.method === 'POST') {
    const auth = await requireAdmin(req, supabase);
    if (auth.error) return fail(res, auth.error.message, auth.error.status);

    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return fail(res, 'Category name is required.');

    const slug = await uniqueSlug(supabase, 'categories', name);

    const { data, error } = await supabase
      .from('categories')
      .insert({
        name,
        slug,
        description: body.description || '',
        image_url: body.image_url || null,
        sort_order: Math.max(0, Number(body.sort_order) || 0),
        active: body.active === undefined ? true : Boolean(body.active)
      })
      .select()
      .single();

    if (error) return fail(res, 'Could not create the category. Please try again.', 500);
    return ok(res, { category: data }, 201);
  }

  return methodNotAllowed(res, req, ['GET', 'POST']);
};
