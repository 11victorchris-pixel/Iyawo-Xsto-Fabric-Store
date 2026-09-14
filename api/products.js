// GET  /api/products  - public list with search/filter/sort
// POST /api/products  - create product (admin only)
const { getClients } = require('./_lib/supabase');
const { ok, fail, readBody, methodNotAllowed, getQuery, getAuthHeader, handleOptions } = require('./_lib/respond');
const { requireAdmin } = require('./_lib/auth');
const { uniqueSlug } = require('./_lib/slugify');

const PUBLIC_FIELDS =
  'id,name,slug,category,description,price,sale_price,is_on_sale,price_unit,' +
  'stock_quantity,stock_status,image_url,additional_images,featured,' +
  'wholesale_available,retail_available,created_at,updated_at';

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return methodNotAllowed(res, req, ['GET', 'POST']);
};

function requireEnv(res) {
  const { supabase, supabaseAnon, missing } = getClients();
  if (missing || !supabase || !supabaseAnon) {
    fail(res, 'Backend is not configured yet. Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in Vercel.', 500);
    return null;
  }
  return { supabase, supabaseAnon };
}

async function handleGet(req, res) {
  const clients = requireEnv(res);
  if (!clients) return;
  const { supabase, supabaseAnon } = clients;
  const params = getQuery(req);
  const get = (k) => (params[k] !== undefined ? String(params[k]) : null);

  // Admin requests (valid token) see inactive products too.
  let client = supabaseAnon;
  let requireActive = true;
  const hasToken = (getAuthHeader(req) || '').startsWith('Bearer ');
  const auth = hasToken ? await requireAdmin(req, supabase).catch(() => null) : null;
  if (auth && auth.admin) {
    client = supabase;
    requireActive = false;
  }

  let query = client
    .from('products')
    .select(PUBLIC_FIELDS, { count: 'exact' });

  if (requireActive) query = query.eq('active', true);

  const search = get('search');
  if (search) query = query.ilike('name', `%${search}%`);

  const category = get('category');
  if (category) query = query.eq('category', category);

  const sale = get('sale');
  if (sale === 'true') query = query.eq('is_on_sale', true);
  else if (sale === 'false') query = query.eq('is_on_sale', false);

  const availability = get('availability');
  if (availability) query = query.eq('stock_status', availability);

  const featured = get('featured');
  if (featured === 'true') query = query.eq('featured', true);
  else if (featured === 'false') query = query.eq('featured', false);

  const minPrice = Number(get('min_price'));
  if (get('min_price') !== null && Number.isFinite(minPrice)) query = query.gte('price', minPrice);

  const maxPrice = Number(get('max_price'));
  if (get('max_price') !== null && Number.isFinite(maxPrice)) query = query.lte('price', maxPrice);

  const sort = get('sort');
  if (sort === 'price_asc') query = query.order('price', { ascending: true });
  else if (sort === 'price_desc') query = query.order('price', { ascending: false });
  else query = query.order('created_at', { ascending: false });

  const limit = Math.min(Math.max(Number(get('limit')) || 24, 1), 100);
  const page = Math.max(Number(get('page')) || 1, 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return fail(res, 'Something went wrong while loading products.', 500);
  }

  return ok(res, {
    products: data || [],
    page,
    limit,
    total: count,
    has_more: (data || []).length === limit
  });
}

async function handlePost(req, res) {
  const clients = requireEnv(res);
  if (!clients) return;
  const { supabase } = clients;
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(res, auth.error.message, auth.error.status);

  const body = await readBody(req);
  const name = String(body.name || '').trim();
  if (!name) return fail(res, 'Product name is required.');
  if (!body.category) return fail(res, 'Category is required.');

  const slug = await uniqueSlug(supabase, 'products', name);

  const price = Math.max(0, Number(body.price) || 0);
  const salePrice = body.sale_price !== '' && body.sale_price != null
    ? Math.max(0, Number(body.sale_price) || 0)
    : null;
  const isOnSale = Boolean(body.is_on_sale) && salePrice != null && salePrice > 0;
  const stockQuantity = Math.max(0, Number(body.stock_quantity) || 0);

  let additionalImages = body.additional_images;
  if (typeof additionalImages === 'string') {
    try { additionalImages = JSON.parse(additionalImages); } catch (err) { additionalImages = []; }
  }
  if (!Array.isArray(additionalImages)) additionalImages = [];

  const row = {
    name,
    slug,
    category: body.category,
    description: body.description || '',
    price,
    sale_price: salePrice,
    is_on_sale: isOnSale,
    price_unit: body.price_unit || 'yard',
    stock_quantity: stockQuantity,
    stock_status: stockQuantity > 0 ? 'in_stock' : 'out_of_stock',
    image_url: body.image_url || null,
    additional_images: additionalImages,
    featured: Boolean(body.featured),
    active: body.active === undefined ? true : Boolean(body.active),
    wholesale_available: Boolean(body.wholesale_available),
    retail_available: body.retail_available === undefined ? true : Boolean(body.retail_available)
  };

  const { data, error } = await supabase.from('products').insert(row).select().single();
  if (error) {
    return fail(res, 'Could not create the product. Please try again.', 500);
  }

  return ok(res, { product: data }, 201);
}
