/**
 * Cloud sync settings for the static site.
 *
 * The browser may hold the Supabase URL and the anon (public) key only.
 * Never put the service role key or the Google client secret in this file.
 *
 * Leave the strings empty until the one-time setup in the README.
 * allowedEmails is Larry's Google accounts (lowercase). The same addresses
 * must be inserted into public.sync_allowlist (see supabase/schema.sql).
 * The array is not the security boundary; Postgres RLS is.
 *
 * ownerId stays "larry". Rows are stored under that id, not auth.uid().
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
