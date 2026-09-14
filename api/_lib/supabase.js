// Server-side Supabase clients.
// The service-role client is used for privileged operations (orders,
// admin writes, stock) - it must NEVER be exposed to the browser.
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url) {
  throw new Error('Missing SUPABASE_URL environment variable.');
}

const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
};

// Privileged client (bypasses RLS). Server-side only.
const supabase = createClient(url, serviceKey || anonKey, options);

// Public client (respects RLS - only sees active/approved rows).
const supabaseAnon = createClient(url, anonKey || 'public-anon-key', options);

module.exports = { supabase, supabaseAnon };