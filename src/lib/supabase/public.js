import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "astro:env/server";

/* Read-only client for the public site.

   It uses the publishable key, so row level security applies: this client
   can only ever see published rows, whatever query the site code sends. It
   runs at build time — the public pages are prerendered — so no session or
   token refresh is needed. */
export const supabasePublic = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const MEDIA_BUCKET = "site-media";

export function mediaUrl(path) {
  if (!path) return null;
  return supabasePublic.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
