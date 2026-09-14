async function loadZones(supabase) {
  const { data, error } = await supabase
    .from('delivery_config')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Matches a city/state to a delivery zone (fallback = "Other states").
function matchZone(zones, city, state) {
  const c = String(city || '').trim().toLowerCase();
  const s = String(state || '').trim().toLowerCase();

  for (const zone of zones) {
    if (!zone.active) continue;
    const cities = (zone.match_cities || []).map((x) => String(x).toLowerCase());
    const states = (zone.match_states || []).map((x) => String(x).toLowerCase());
    if ((c && cities.includes(c)) || (s && states.includes(s))) {
      return zone;
    }
  }

  return zones.find((z) => z.is_fallback) || zones.find((z) => z.active) || null;
}

function computeDeliveryFee(zones, city, state) {
  const zone = matchZone(zones, city, state);
  return zone ? Number(zone.fee) || 0 : 0;
}

module.exports = { loadZones, matchZone, computeDeliveryFee };