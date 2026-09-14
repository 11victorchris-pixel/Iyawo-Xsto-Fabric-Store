// Server-side Supabase clients (lazy - never throw at import time so
// `vercel build` and /api/health work even when env vars are missing).
// The service-role client is used for privileged operations (orders,
// admin writes, stock) - it must NEVER be exposed to the browser.
const { createClient } = require('@supabase/supabase-js');

const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
};

let cached = null;

function getClients() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || (!serviceKey && !anonKey)) {
    return { supabase: null, supabaseAnon: null, missing: true };
  }

  const supabase = createClient(url, serviceKey || anonKey, options);
  const supabaseAnon = createClient(url, anonKey || serviceKey, options);
  cached = { supabase, supabaseAnon, missing: false };
  return cached;
}

// Backward-compatible getters: `const { supabase } = require('./_lib/supabase')`
// still works, but is null until env vars exist. Prefer getClients().
const proxy = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'getClients') return getClients;
    if (prop === 'supabase' || prop === 'supabaseAnon') {
      return getClients()[prop];
    }
    if (prop === '__esModule') return false;
    return undefined;
  }
});

module.exports = proxy;
module.exports.getClients = getClients;