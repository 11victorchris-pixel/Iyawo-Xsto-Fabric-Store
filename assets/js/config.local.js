// ============================================================
// LOCAL-ONLY admin fallback. NEVER commit, NEVER deploy.
// This file is git-ignored (see .gitignore) and ONLY works on
// your own computer (file:// / localhost / 127.0.0.1).
// Production (Vercel) always uses Supabase Auth instead.
// Plaintext password is NOT stored here - only a SHA-256 hash.
// ============================================================
window.IYAWO_LOCAL_ADMIN = {
  email: "88victorchris@gmail.com",
  // SHA-256 of the local password. To change it, run:
  // node -e "console.log(require('crypto').createHash('sha256').update('YOUR_NEW_PASSWORD','utf8').digest('hex'))"
  // then replace the value below. Use 12+ chars for real use.
  passHash: "70b01e2ca72a7c2abce70a56bfbb76f5687d3c117f3cb2929e811e961000553a"
};
