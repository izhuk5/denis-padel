import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SECRET_KEY } from "astro:env/server";

/* Privileged client for admin writes.

   The secret key bypasses row level security entirely, so this module must
   never be imported by anything that ships to the browser. astro:env/server
   with access: 'secret' turns that mistake into a build error.

   Every caller is an Astro Action that has already verified the admin
   session — this client performs no authorisation of its own. */

let client = null;

export function supabaseAdmin() {
  if (!SUPABASE_SECRET_KEY) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. Add it to .env.local and to the Vercel project's " +
        "environment variables — the admin panel cannot save without it.",
    );
  }

  client ??= createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}
