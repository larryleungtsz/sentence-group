/**
 * Copy of the sync config template.
 * The site loads js/sync-config.js (same shape). Fill that file, not this one.
 *
 *   supabaseUrl      https://YOUR_PROJECT.supabase.co
 *   supabaseAnonKey  Project Settings → API → anon public key
 *                    (role must be "anon"; a service_role key is refused)
 *   ownerId          fixed: larry
 *   allowedEmails    Google accounts allowed to sign in
 *
 * Google client secret stays in the Supabase dashboard, not in git.
 */
(function (global) {
  global.SYNC_CONFIG = {
    supabaseUrl: '',
    supabaseAnonKey: '',
    ownerId: 'larry',
    allowedEmails: [
      // 'larry@gmail.com',
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
