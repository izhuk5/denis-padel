// One-off import of the old mock content into Supabase.
//
//   node scripts/seed-supabase.mjs
//
// Reads supabase/seed/content.json and the images in src/assets/images,
// uploads the images to Storage and writes the rows. Safe to re-run: every
// row gets a stable id derived from its old mock id, and every write is an
// upsert, so a second run updates in place instead of duplicating.
//
// Runs outside Astro, so it reads .env.local itself. Needs SUPABASE_URL and
// SUPABASE_SECRET_KEY — the publishable key cannot write.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { imageSize } from "image-size";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);

if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const content = JSON.parse(readFileSync("supabase/seed/content.json", "utf8"));
const BUCKET = "site-media";

/* The mock data has no year on its event. */
const EVENT_YEAR = 2026;

/* RFC 4122 v5-style id from a stable string, so re-runs hit the same rows. */
function stableId(name) {
  const hex = createHash("sha1").update(`alicante-paddle:${name}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hex.slice(18, 20),
    hex.slice(20, 32),
  ].join("-");
}

const cents = (price) => Math.round(Number(String(price).replace(/[^\d.]/g, "")) * 100);

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function check(label, request) {
  const { data, error } = await request;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

const uploaded = new Map();

async function upload(fileName) {
  if (uploaded.has(fileName)) return uploaded.get(fileName);

  const bytes = readFileSync(`src/assets/images/${fileName}`);
  const { width, height, type } = imageSize(bytes);
  const mime = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[type];
  const path = `seed/${fileName}`;

  await check(
    `upload ${fileName}`,
    db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true }),
  );

  const result = { path, width, height };
  uploaded.set(fileName, result);
  console.log(`  image  ${path}  ${width}x${height}`);
  return result;
}

console.log("Seeding Supabase…");

// --- Events -----------------------------------------------------------------
for (const event of content.events) {
  const image = await upload(event.image);
  const month = new Date(`${event.month} 1, 2000`).getMonth() + 1;

  await check(
    "events",
    db.from("events").upsert({
      id: stableId(event.id),
      title: event.title,
      event_date: `${EVENT_YEAR}-${String(month).padStart(2, "0")}-${event.day.padStart(2, "0")}`,
      city: event.city,
      description: event.description,
      image_path: image.path,
      image_width: image.width,
      image_height: image.height,
      image_alt: event.imageAlt,
      button_label: event.buttonLabel,
      button_url: event.buttonUrl,
      is_featured: event.featured,
      is_published: true,
    }),
  );
}
console.log(`  events ${content.events.length}`);

// --- Tournaments ------------------------------------------------------------
await check(
  "tournaments",
  db.from("tournaments").upsert(
    content.tournaments.map((t, i) => ({
      id: stableId(t.id),
      number: t.number,
      title: t.title,
      subtitle: t.subtitle,
      description: t.description,
      details: t.meta,
      join_url: t.joinUrl,
      is_highlighted: t.active,
      sort_order: i,
      is_published: true,
    })),
  ),
);
console.log(`  tournaments ${content.tournaments.length}`);

// --- Training -----------------------------------------------------------------
const [personal, group] = content.training.cards;

await check(
  "training_cards",
  db.from("training_cards").upsert(
    [
      ["personal", personal],
      ["group", group],
    ].map(([key, card]) => ({
      key,
      price_cents: cents(card.price),
      currency: "EUR",
      unit_label: card.unit,
      title: card.title,
      description: card.description,
      caption: card.caption,
      button_label: card.buttonLabel,
      button_url: card.buttonUrl,
    })),
    { onConflict: "key" },
  ),
);

await check(
  "training_packages",
  db.from("training_packages").upsert(
    content.training.packages.rows.map((row, i) => ({
      id: stableId(row.id),
      label: row.label,
      price_cents: cents(row.price),
      old_price_cents: row.oldPrice ? cents(row.oldPrice) : null,
      currency: "EUR",
      sort_order: i,
      is_published: true,
    })),
  ),
);

const { heading, note, buttonLabel, buttonUrl } = content.training.packages;
await check(
  "settings",
  db.from("settings").upsert({ key: "training_packages", value: { heading, note, buttonLabel, buttonUrl } }),
);
console.log(`  training cards 2, packages ${content.training.packages.rows.length}`);

// --- Gallery ------------------------------------------------------------------
const galleryCategoryId = stableId("gallery-category-general");
await check(
  "gallery_categories",
  db.from("gallery_categories").upsert({ id: galleryCategoryId, name: "Общее", slug: "general", sort_order: 0 }),
);

for (const [i, photo] of content.gallery.entries()) {
  const image = await upload(photo.image);

  await check(
    "gallery_photos",
    db.from("gallery_photos").upsert({
      id: stableId(photo.id),
      category_id: galleryCategoryId,
      image_path: image.path,
      image_width: image.width,
      image_height: image.height,
      alt: photo.alt,
      sort_order: i,
      is_published: true,
    }),
  );
}
console.log(`  gallery photos ${content.gallery.length}`);

// --- Journal --------------------------------------------------------------------
const journalCategoryId = stableId("journal-category-general");
await check(
  "journal_categories",
  db.from("journal_categories").upsert({ id: journalCategoryId, name: "Общее", slug: "general", sort_order: 0 }),
);

for (const [i, article] of content.journal.entries()) {
  const image = await upload(article.image);

  await check(
    "journal_posts",
    db.from("journal_posts").upsert({
      id: stableId(article.id),
      category_id: journalCategoryId,
      slug: slugify(article.title),
      title: article.title,
      excerpt: article.excerpt,
      body: "",
      cover_path: image.path,
      cover_width: image.width,
      cover_height: image.height,
      cover_alt: article.alt,
      status: "published",
      /* Stable, spaced a day apart, so the original order survives a sort
         by date as well as by sort_order. */
      published_at: new Date(Date.UTC(EVENT_YEAR, 8, 10 - i)).toISOString(),
      sort_order: i,
    }),
  );
}
console.log(`  journal posts ${content.journal.length}`);

// --- SEO ------------------------------------------------------------------------
const ogImage = await upload(content.seo.home.ogImage);
await check(
  "seo_pages",
  db.from("seo_pages").upsert({
    page_key: "home",
    title: content.seo.home.title,
    description: content.seo.home.description,
    og_image_path: ogImage.path,
  }),
);
console.log("  seo home");

console.log("Done.");
