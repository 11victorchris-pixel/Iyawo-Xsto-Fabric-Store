// ============================================================
// IYAWO XSTO FABRIC STORE - PUBLIC BROWSER CONFIG
// ------------------------------------------------------------
// Only PUBLIC keys go here - they are safe to expose in the
// browser. Secret keys (SUPABASE_SERVICE_ROLE_KEY,
// PAYSTACK_SECRET_KEY) must NEVER be placed in frontend files.
//
// HOW TO FILL THIS IN:
//   SUPABASE_URL        -> Supabase dashboard > Settings > API > Project URL
//   SUPABASE_ANON_KEY   -> Supabase dashboard > Settings > API > anon public key
//   PAYSTACK_PUBLIC_KEY -> Paystack dashboard > Settings > API Keys > Public key
//                          (use pk_test_... while testing)
// ============================================================
window.IYAWO_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_PUBLIC_KEY",
  PAYSTACK_PUBLIC_KEY: "YOUR_PAYSTACK_PUBLIC_TEST_KEY",

  // WhatsApp contact (existing store number - do not change)
  WHATSAPP_NUMBER: "2347079057773",
  WHATSAPP_DISPLAY: "0707 905 7773"
};