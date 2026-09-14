// Verifies the Authorization header (Supabase access token) and
// confirms the user exists in the admins table.
const { getAuthHeader } = require('./respond');

async function requireAdmin(req, supabase) {
  const header = getAuthHeader(req) || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return { error: { status: 401, message: 'Authentication required.' } };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData || !userData.user) {
    return { error: { status: 401, message: 'Invalid or expired session.' } };
  }

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('id, email')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminError || !admin) {
    return { error: { status: 403, message: 'You are not authorized to access this area.' } };
  }

  return { user: userData.user, admin };
}

module.exports = { requireAdmin };