// POST /api/admin/register-admin
// Creates the FIRST admin account. Guarded by the ADMIN_INVITE_CODE
// environment variable so random visitors cannot create admins.
// Legacy alias: POST /api/auth/register-admin (see ../auth/register-admin.js).
// Body: { email, password, invite_code }
const { getClients } = require('../_lib/supabase');
const { ok, fail, readBody, methodNotAllowed, handleOptions } = require('../_lib/respond');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, req, ['POST']);

  const { supabase, missing } = getClients();
  if (missing || !supabase) return fail(res, 'Backend is not configured yet. Set Supabase env vars in Vercel.', 500);

  const inviteCode = process.env.ADMIN_INVITE_CODE;
  if (!inviteCode) {
    return fail(res, 'Admin registration is disabled. Set ADMIN_INVITE_CODE to enable it.', 403);
  }

  const body = await readBody(req);

  if (String(body.invite_code || '') !== inviteCode) {
    return fail(res, 'Invalid invite code.', 403);
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(res, 'Please provide a valid email address.');
  }
  if (password.length < 8) {
    return fail(res, 'Password must be at least 8 characters.');
  }

  // supabase-js v2 returns { data: { user }, error }
  const { data, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (createError) {
    // 422 / duplicate user
    return fail(res, createError.message || 'Could not create the admin user.', 400);
  }

  const newUser = data && data.user;
  if (!newUser || !newUser.id) {
    return fail(res, 'Could not create the admin user.', 500);
  }

  const { error: adminError } = await supabase
    .from('admins')
    .upsert({ user_id: newUser.id, email }, { onConflict: 'user_id', ignoreDuplicates: true });

  if (adminError) {
    return fail(res, 'Could not save the admin record.', 500);
  }

  return ok(res, { message: 'Admin account created. You can now sign in.' }, 201);
};
