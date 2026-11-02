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
    supabaseUrl: 'https://zmmcldktmrkxaxxyvxra.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbWNsZGt0bXJreGF4eHl2eHJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1OTY4MjgsImV4cCI6MjEwOTE3MjgyOH0.TTWD4fD2BMZquqIF2c3lwm_T4ZnHWKFzak4ZmZIWNQY',
    ownerId: 'larry',
    allowedEmails: ['larryleungtsz@gmail.com'],
  };
})(typeof window !== 'undefined' ? window : globalThis);
