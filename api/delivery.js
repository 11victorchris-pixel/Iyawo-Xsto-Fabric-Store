// GET /api/delivery - active delivery zones (public, used to show estimates)
// PUT /api/delivery - replace the full zone list (admin only)
const { getClients } = require('./_lib/supabase');
const { ok, fail, readBody, methodNotAllowed, handleOptions } = require('./_lib/respond');
const { requireAdmin } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const { supabase, supabaseAnon, missing } = getClients();
  if (missing || !supabase || !supabaseAnon) {
    return fail(res, 'Backend is not configured yet. Set Supabase env vars in Vercel.', 500);
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAnon
      .from('delivery_config')
      .select('id,zone,label,fee,match_cities,match_states,is_fallback,active,sort_order')
      .order('sort_order', { ascending: true });

    if (error) return fail(res, 'Something went wrong while loading delivery fees.', 500);
    return ok(res, { zones: data || [] });
  }

  if (req.method === 'PUT') {
    const auth = await requireAdmin(req, supabase);
    if (auth.error) return fail(res, auth.error.message, auth.error.status);

    const body = await readBody(req);
    const zones = Array.isArray(body.zones) ? body.zones : null;
    if (!zones) return fail(res, 'Send a zones array.');

    // Fetch existing ids so we can remove zones that were deleted.
    const { data: existing } = await supabase.from('delivery_config').select('id');
    const existingIds = new Set((existing || []).map((z) => z.id));
    const submittedIds = new Set(zones.filter((z) => z.id).map((z) => z.id));

    for (const id of existingIds) {
      if (!submittedIds.has(id)) {
        await supabase.from('delivery_config').delete().eq('id', id);
      }
    }

    // Upsert the rest.
    let fallbackSeen = false;
    const rows = zones.map((z, i) => {
      const row = {
        zone: String(z.zone || `zone-${i}`).trim(),
        label: String(z.label || z.zone || `Zone ${i + 1}`).trim(),
        fee: Math.max(0, Number(z.fee) || 0),
        match_cities: Array.isArray(z.match_cities) ? z.match_cities : [],
        match_states: Array.isArray(z.match_states) ? z.match_states : [],
        is_fallback: Boolean(z.is_fallback),
        active: z.active === undefined ? true : Boolean(z.active),
        sort_order: i + 1
      };
      if (row.is_fallback) fallbackSeen = true;
      return row;
    });

    // Guarantee exactly one fallback zone (used for unmatched locations).
    if (!fallbackSeen && rows.length > 0) {
      rows[rows.length - 1].is_fallback = true;
    }

    const { data, error } = await supabase.from('delivery_config').upsert(rows, { onConflict: 'zone' });
    if (error) return fail(res, 'Could not save delivery settings. Please try again.', 500);

    const { data: fresh } = await supabase
      .from('delivery_config')
      .select('id,zone,label,fee,match_cities,match_states,is_fallback,active,sort_order')
      .order('sort_order', { ascending: true });

    return ok(res, { zones: fresh || data || [] });
  }

  return methodNotAllowed(res, req, ['GET', 'PUT']);
};
