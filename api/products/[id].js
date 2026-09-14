// GET    /api/products/:id-or-slug - public
// PUT    /api/products/:id-or-slug - update (admin only)
// DELETE /api/products/:id-or-slug - soft delete, active = false (admin only)
const { supabase, supabaseAnon } = require('../_lib/supabase');
const { ok, fail, readBody, methodNotAllowed } = require('../_lib/respond');
const { requireAdmin } = require('../_lib/auth');
const { uniqueSlug, isUuid } = require('../_lib/slugify');

const FIELDS =
  'id,name,slug,category,description,price,sale_price,is_on_sale,price_unit,' +
  'stock_quantity,stock_status,image_url,additional_images,featured,' +
  'wholesale_available,retail_available,active,created_at,updated_at';

module.exports = async function handler(req) {
  if (req.method === 'OPTIONS') return ok({}, 204);

  const idOrSlug = decodeURIComponent(req.url.split('/').pop() || '');

  if (req.method === 'GET') return handleGet(idOrSlug);
  if (req.method === 'PUT') return handlePut(idOrSlug, req);
  if (req.method === 'DELETE') return handleDelete(idOrSlug, req);

  return methodNotAllowed(req, ['GET', 'PUT', 'DELETE']);
};

async function findProduct(client, idOrSlug, activeOnly) {
  let query = client.from('products').select(FIELDS);
  query = isUuid(idOrSlug) ? query.eq('id', idOrSlug) : query.eq('slug', idOrSlug);
  if (activeOnly) query = query.eq('active', true);
  return query.maybeSingle();
}

async function handleGet(idOrSlug) {
  const { data, error } = await findProduct(supabaseAnon, idOrSlug, true);
  if (error) return fail('Something went wrong while loading the product.', 500);
  if (!data) return fail('Sorry, this product is currently unavailable.', 404);
  return ok({ product: data });
}

async function handlePut(idOrSlug, req) {
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(auth.error.message, auth.error.status);

  const existing = await findProduct(supabase, idOrSlug, false);
  if (!existing.data) return fail('Product not found.', 404);

  const body = await readBody(req);
  const updates = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return fail('Product name is required.');
    updates.name = name;
    updates.slug = await uniqueSlug(supabase, 'products', name, existing.data.id);
  }

  if (body.category !== undefined) updates.category = body.category;
  if (body.description !== undefined) updates.description = body.description;

  if (body.price !== undefined) updates.price = Math.max(0, Number(body.price) || 0);

  if (body.sale_price !== undefined) {
    const sp = body.sale_price !== '' && body.sale_price != null
      ? Math.max(0, Number(body.sale_price) || 0)
      : null;
    updates.sale_price = sp;
  }

  if (body.is_on_sale !== undefined) updates.is_on_sale = Boolean(body.is_on_sale);
  if (body.price_unit !== undefined) updates.price_unit = body.price_unit || 'yard';

  if (body.stock_quantity !== undefined) {
    const qty = Math.max(0, Number(body.stock_quantity) || 0);
    updates.stock_quantity = qty;
    updates.stock_status = qty > 0 ? 'in_stock' : 'out_of_stock';
  }

  if (body.image_url !== undefined) updates.image_url = body.image_url || null;

  if (body.additional_images !== undefined) {
    let imgs = body.additional_images;
    if (typeof imgs === 'string') {
      try { imgs = JSON.parse(imgs); } catch (err) { imgs = []; }
    }
    updates.additional_images = Array.isArray(imgs) ? imgs : [];
  }

  if (body.featured !== undefined) updates.featured = Boolean(body.featured);
  if (body.active !== undefined) updates.active = Boolean(body.active);
  if (body.wholesale_available !== undefined) updates.wholesale_available = Boolean(body.wholesale_available);
  if (body.retail_available !== undefined) updates.retail_available = Boolean(body.retail_available);

  // Keep sale price consistent with the sale flag.
  if (updates.is_on_sale && !(updates.sale_price != null && updates.sale_price > 0)) {
    updates.is_on_sale = false;
  }

  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', existing.data.id)
    .select()
    .single();

  if (error) return fail('Could not update the product. Please try again.', 500);

  return ok({ product: data });
}

async function handleDelete(idOrSlug, req) {
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(auth.error.message, auth.error.status);

  const existing = await findProduct(supabase, idOrSlug, false);
  if (!existing.data) return fail('Product not found.', 404);

  // Soft delete - keep the record for order history.
  const { data, error } = await supabase
    .from('products')
    .update({ active: false })
    .eq('id', existing.data.id)
    .select()
    .single();

  if (error) return fail('Could not deactivate the product. Please try again.', 500);

  return ok({ product: data });
}