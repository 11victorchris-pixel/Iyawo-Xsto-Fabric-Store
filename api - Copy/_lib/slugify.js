function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Returns a slug that does not already exist in the given table.
async function uniqueSlug(supabase, table, base, excludeId = null) {
  const root = slugify(base) || 'item';
  let candidate = root;
  let i = 2;

  for (;;) {
    let query = supabase.from(table).select('id').eq('slug', candidate);
    if (excludeId) query = query.neq('id', excludeId);

    const { data } = await query.maybeSingle();
    if (!data) return candidate;

    candidate = `${root}-${i}`;
    i += 1;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

module.exports = { slugify, uniqueSlug, isUuid };