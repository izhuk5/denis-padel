import { supabasePublic, mediaUrl } from "../supabase/public.js";

/* Build-time reads for the public site.

   Every query goes through the publishable key, so row level security has
   already dropped unpublished rows before anything here sees them. A failed
   query throws: a broken build keeps the previous deployment live, which is
   far better than publishing a page with an empty section. */

async function query(label, request) {
  const { data, error } = await request;

  if (error) {
    throw new Error(`Supabase: could not load ${label} — ${error.message}`);
  }

  return data;
}

export function remoteImage(path, width, height) {
  return path && width && height ? { src: mediaUrl(path), width, height } : null;
}

export function getEvents() {
  return query(
    "events",
    supabasePublic.from("events").select("*").order("event_date", { ascending: true }),
  );
}

export function getTournaments() {
  return query(
    "tournaments",
    supabasePublic.from("tournaments").select("*").order("sort_order", { ascending: true }),
  );
}

export function getTrainingCards() {
  return query("training cards", supabasePublic.from("training_cards").select("*"));
}

export function getTrainingPackages() {
  return query(
    "training packages",
    supabasePublic.from("training_packages").select("*").order("sort_order", { ascending: true }),
  );
}

export async function getSetting(key) {
  const rows = await query(`setting "${key}"`, supabasePublic.from("settings").select("value").eq("key", key));
  return rows[0]?.value ?? null;
}

export function getGalleryPhotos() {
  return query(
    "gallery photos",
    supabasePublic.from("gallery_photos").select("*").order("sort_order", { ascending: true }),
  );
}

export function getJournalPosts() {
  return query(
    "journal posts",
    supabasePublic
      .from("journal_posts")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("published_at", { ascending: false }),
  );
}

export async function getSeoPage(pageKey) {
  const rows = await query(`SEO for "${pageKey}"`, supabasePublic.from("seo_pages").select("*").eq("page_key", pageKey));
  return rows[0] ?? null;
}
