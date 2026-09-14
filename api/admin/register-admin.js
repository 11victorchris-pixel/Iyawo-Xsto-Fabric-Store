// POST /api/admin/register-admin
// Creates the FIRST admin account. Guarded by the ADMIN_INVITE_CODE
// environment variable so random visitors cannot create admins.
// Legacy alias: POST /api/auth/register-admin (see ../auth/register-admin.js).
// Body: { email, password, invite_code }
const { supabase } = require('../_lib/supabase');
const { ok, fail, readBody, methodNotAllowed } = require('../_lib/respond');

module.exports = async function handler(req) {
  if (req.method === 'OPTIONS') return ok({}, 204);
  if (req.method !== 'POST') return methodNotAllowed(req, ['POST']);

  const inviteCode = process.env.ADMIN_INVITE_CODE;
  if (!inviteCode) {
    return fail('Admin registration is disabled. Set ADMIN_INVITE_CODE to enable it.', 403);
  }

  const body = await readBody(req);

  if (String(body.invite_code || '') !== inviteCode) {
    return fail('Invalid invite code.', 403);
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail('Please provide a valid email address.');
  }
  if (password.length < 8) {
    return fail('Password must be at least 8 characters.');
  }

  const { data: user, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (createError) {
    // 422 / duplicate user
    return fail(createError.message || 'Could not create the admin user.', 400);
  }

  const { error: adminError } = await supabase
    .from('admins')
    .insert({ user_id: user.id, email })
    .onConflict('user_id')
    .ignore();

  if (adminError) {
    return fail('Could not save the admin record.', 500);
  }

  return ok({ message: 'Admin account created. You can now sign in.' }, 201);
}