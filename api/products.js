// GET  /api/products  - public list with search/filter/sort
// POST /api/products  - create product (admin only)
const { supabase, supabaseAnon } = require('./_lib/supabase');
const { ok, fail, readBody, methodNotAllowed } = require('./_lib/respond');
const { requireAdmin } = require('./_lib/auth');
const { uniqueSlug } = require('./_lib/slugify');

const PUBLIC_FIELDS =
  'id,name,slug,category,description,price,sale_price,is_on_sale,price_unit,' +
  'stock_quantity,stock_status,image_url,additional_images,featured,' +
  'wholesale_available,retail_available,created_at,updated_at';

module.exports = async function handler(req) {
  if (req.method === 'OPTIONS') return ok({}, 204);

  if (req.method === 'GET') {
    return handleGet(req);
  }

  if (req.method === 'POST') {
    return handlePost(req);
  }

  return methodNotAllowed(req, ['GET', 'POST']);
};

async function handleGet(req) {
  const url = new URL(req.url);
  const params = url.searchParams;

  // Admin requests (valid token) see inactive products too.
  let client = supabaseAnon;
  let requireActive = true;
  const hasToken = (req.headers.get('authorization') || '').startsWith('Bearer ');
  const auth = hasToken ? await requireAdmin(req, supabase).catch(() => null) : null;
  if (auth && auth.admin) {
    client = supabase;
    requireActive = false;
  }

  let query = client
    .from('products')
    .select(PUBLIC_FIELDS, { count: 'exact' });

  if (requireActive) query = query.eq('active', true);

  const search = params.get('search');
  if (search) query = query.ilike('name', `%${search}%`);

  const category = params.get('category');
  if (category) query = query.eq('category', category);

  const sale = params.get('sale');
  if (sale === 'true') query = query.eq('is_on_sale', true);
  else if (sale === 'false') query = query.eq('is_on_sale', false);

  const availability = params.get('availability');
  if (availability) query = query.eq('stock_status', availability);

  const featured = params.get('featured');
  if (featured === 'true') query = query.eq('featured', true);
  else if (featured === 'false') query = query.eq('featured', false);

  const minPrice = Number(params.get('min_price'));
  if (Number.isFinite(minPrice)) query = query.gte('price', minPrice);

  const maxPrice = Number(params.get('max_price'));
  if (Number.isFinite(maxPrice)) query = query.lte('price', maxPrice);

  const sort = params.get('sort');
  if (sort === 'price_asc') query = query.order('price', { ascending: true });
  else if (sort === 'price_desc') query = query.order('price', { ascending: false });
  else query = query.order('created_at', { ascending: false });

  const limit = Math.min(Math.max(Number(params.get('limit')) || 24, 1), 100);
  const page = Math.max(Number(params.get('page')) || 1, 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return fail('Something went wrong while loading products.', 500);
  }

  return ok({
    products: data || [],
    page,
    limit,
    total: count,
    has_more: (data || []).length === limit
  });
}

async function handlePost(req) {
  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(auth.error.message, auth.error.status);

  const body = await readBody(req);
  const name = String(body.name || '').trim();
  if (!name) return fail('Product name is required.');
  if (!body.category) return fail('Category is required.');

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
    return fail('Could not create the product. Please try again.', 500);
  }

  return ok({ product: data }, 201);
}