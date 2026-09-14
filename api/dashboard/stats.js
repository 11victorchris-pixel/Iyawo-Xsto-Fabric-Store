// GET /api/dashboard/stats - admin only
// Returns headline numbers for the dashboard + recent orders.
const { supabase } = require('../_lib/supabase');
const { ok, fail, methodNotAllowed } = require('../_lib/respond');
const { requireAdmin } = require('../_lib/auth');

module.exports = async function handler(req) {
  if (req.method === 'OPTIONS') return ok({}, 204);
  if (req.method !== 'GET') return methodNotAllowed(req, ['GET']);

  const auth = await requireAdmin(req, supabase);
  if (auth.error) return fail(auth.error.message, auth.error.status);

  try {
    const [
      productsRes,
      inStockRes,
      outStockRes,
      ordersRes,
      pendingOrdersRes,
      deliveredRes,
      paidRes,
      salesRes,
      recentRes,
      newOrdersRes
    ] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('stock_status', 'in_stock'),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('stock_status', 'out_of_stock'),
      supabase.from('orders').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('order_status', 'pending'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('order_status', 'delivered'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'paid'),
      supabase.from('orders').select('total_amount').eq('payment_status', 'paid'),
      supabase.from('orders').select('id,order_number,customer_name,customer_phone,total_amount,payment_status,order_status,created_at').order('created_at', { ascending: false }).limit(8),
      supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    ]);

    const totalSales = (salesRes.data || []).reduce((sum, o) => sum + Number(o.total_amount), 0);

    return ok({
      products: productsRes.count || 0,
      products_in_stock: inStockRes.count || 0,
      products_out_of_stock: outStockRes.count || 0,
      orders: ordersRes.count || 0,
      orders_pending: pendingOrdersRes.count || 0,
      orders_delivered: deliveredRes.count || 0,
      orders_paid: paidRes.count || 0,
      total_sales: totalSales,
      new_orders_24h: newOrdersRes.count || 0,
      recent_orders: recentRes.data || []
    });
  } catch (err) {
    return fail('Something went wrong while loading statistics.', 500);
  }
}