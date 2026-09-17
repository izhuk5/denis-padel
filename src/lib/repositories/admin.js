import { z } from "astro/zod";
import { supabaseAdmin } from "../supabase/server.js";
import { MEDIA_BUCKET, mediaUrl } from "../supabase/public.js";

/* Every table the admin panel can edit, in one registry.

   Each entry says which table backs a group of the admin UI, how a form item
   maps onto a database row (and back), and what a valid item looks like. The
   actions are generic over this registry, so there is exactly one save path,
   one delete path and one reorder path to get right — not one per table.

   Items travel between the browser and here in the admin's own shape
   (camelCase, euros, a single image object), never as raw rows: the browser
   has no business knowing column names or storing prices in cents. */

/* A refusal the owner can act on ("move the photos first"), as opposed to a
   bug. The actions report these as a 409 with the message intact, instead of
   dressing an expected "no" up as a server crash. */
export class UserError extends Error {
  name = "UserError";
}

const text = (max = 2000) => z.string().trim().max(max);
const required = (max = 2000) => text(max).min(1, "Обязательное поле");
const url = () => required(500);

const imageValue = z
  .object({
    path: z.string().min(1).max(300),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .nullable();

const euros = z.coerce
  .number({ message: "Введите число" })
  .min(0, "Цена не может быть отрицательной")
  .max(100000);

const toCents = (value) => Math.round(Number(value) * 100);
const fromCents = (cents) => (cents == null ? null : cents / 100);

function imageOut(path, width, height) {
  return path ? { path, width, height, url: mediaUrl(path) } : null;
}

/* The owner writes category and article names in Russian. Without
   transliteration every one of them collapses to an empty slug, and the
   second one collides on the unique index. */
const CYRILLIC = {
  а: "a", б: "b", в: "v", г: "g", ґ: "g", д: "d", е: "e", ё: "e", є: "ye", ж: "zh", з: "z",
  и: "i", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "",
  ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[а-яёґєії]/g, (char) => CYRILLIC[char] ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";

/* Appends -2, -3… until the slug is free, ignoring the row being saved so an
   unchanged title keeps its own slug. */
async function uniqueSlug(db, table, base, id) {
  let query = db.from(table).select("slug").like("slug", `${base}%`);
  if (id) query = query.neq("id", id);

  const { data, error } = await query;
  if (error) throw new Error(`Slug check: ${error.message}`);

  const taken = new Set(data.map((row) => row.slug));
  if (!taken.has(base)) return base;

  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export const registry = {
  events: {
    table: "events",
    imageColumn: "image_path",
    order: { column: "event_date", ascending: true },
    exclusive: "is_featured",
    input: z.object({
      title: required(200),
      eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Выберите дату"),
      city: required(100),
      description: required(),
      image: imageValue,
      imageAlt: text(300),
      buttonLabel: required(60),
      buttonUrl: url(),
      featured: z.boolean(),
      published: z.boolean(),
    }),
    toRow: (item) => ({
      title: item.title,
      event_date: item.eventDate,
      city: item.city,
      description: item.description,
      image_path: item.image?.path ?? null,
      image_width: item.image?.width ?? null,
      image_height: item.image?.height ?? null,
      image_alt: item.imageAlt,
      button_label: item.buttonLabel,
      button_url: item.buttonUrl,
      is_featured: item.featured,
      is_published: item.published,
    }),
    fromRow: (row) => ({
      id: row.id,
      title: row.title,
      eventDate: row.event_date,
      city: row.city,
      description: row.description,
      image: imageOut(row.image_path, row.image_width, row.image_height),
      imageAlt: row.image_alt,
      buttonLabel: row.button_label,
      buttonUrl: row.button_url,
      featured: row.is_featured,
      published: row.is_published,
    }),
  },

  tournaments: {
    table: "tournaments",
    order: { column: "sort_order", ascending: true },
    sortable: true,
    exclusive: "is_highlighted",
    input: z.object({
      number: required(10),
      title: required(200),
      subtitle: text(200),
      description: required(),
      meta: z
        .array(z.object({ label: required(40), value: required(80) }))
        .max(8),
      joinUrl: url(),
      active: z.boolean(),
      published: z.boolean(),
    }),
    toRow: (item) => ({
      number: item.number,
      title: item.title,
      subtitle: item.subtitle,
      description: item.description,
      details: item.meta,
      join_url: item.joinUrl,
      is_highlighted: item.active,
      is_published: item.published,
    }),
    fromRow: (row) => ({
      id: row.id,
      number: row.number,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      meta: row.details,
      joinUrl: row.join_url,
      active: row.is_highlighted,
      published: row.is_published,
    }),
  },

  trainingCards: {
    table: "training_cards",
    order: { column: "key", ascending: false }, // personal, then group
    fixed: true,
    input: z.object({
      price: euros,
      unit: required(40),
      title: required(80),
      description: required(),
      caption: text(200),
      buttonLabel: required(60),
      buttonUrl: url(),
    }),
    toRow: (item) => ({
      price_cents: toCents(item.price),
      unit_label: item.unit,
      title: item.title,
      description: item.description,
      caption: item.caption,
      button_label: item.buttonLabel,
      button_url: item.buttonUrl,
    }),
    fromRow: (row) => ({
      id: row.id,
      price: fromCents(row.price_cents),
      unit: row.unit_label,
      title: row.title,
      description: row.description,
      caption: row.caption,
      buttonLabel: row.button_label,
      buttonUrl: row.button_url,
    }),
  },

  trainingPackages: {
    table: "training_packages",
    order: { column: "sort_order", ascending: true },
    sortable: true,
    input: z
      .object({
        label: required(60),
        price: euros,
        oldPrice: z.union([euros, z.literal(""), z.null()]).transform((v) => (v === "" ? null : v)),
        published: z.boolean(),
      })
      .refine((item) => item.oldPrice == null || Number(item.oldPrice) > Number(item.price), {
        message: "Старая цена должна быть больше новой",
        path: ["oldPrice"],
      }),
    toRow: (item) => ({
      label: item.label,
      price_cents: toCents(item.price),
      old_price_cents: item.oldPrice == null ? null : toCents(item.oldPrice),
      is_published: item.published,
    }),
    fromRow: (row) => ({
      id: row.id,
      label: row.label,
      price: fromCents(row.price_cents),
      oldPrice: fromCents(row.old_price_cents) ?? "",
      published: row.is_published,
    }),
  },

  trainingPackagesCopy: {
    table: "settings",
    singleton: { keyColumn: "key", key: "training_packages" },
    input: z.object({
      heading: required(120),
      note: text(200),
      buttonLabel: required(60),
      buttonUrl: url(),
    }),
    toRow: (item) => ({ value: item }),
    fromRow: (row) => ({ id: row.key, ...row.value }),
  },

  galleryCategories: {
    table: "gallery_categories",
    order: { column: "sort_order", ascending: true },
    sortable: true,
    input: z.object({ name: required(60) }),
    toRow: (item) => ({ name: item.name, slug: slugify(item.name) }),
    fromRow: (row) => ({ id: row.id, name: row.name }),
  },

  galleryPhotos: {
    table: "gallery_photos",
    imageColumn: "image_path",
    order: { column: "sort_order", ascending: true },
    sortable: true,
    input: z.object({
      categoryId: z.string().uuid("Выберите категорию"),
      image: imageValue.refine(Boolean, "Загрузите фото"),
      alt: required(300),
      published: z.boolean(),
    }),
    toRow: (item) => ({
      category_id: item.categoryId,
      image_path: item.image.path,
      image_width: item.image.width,
      image_height: item.image.height,
      alt: item.alt,
      is_published: item.published,
    }),
    fromRow: (row) => ({
      id: row.id,
      categoryId: row.category_id,
      image: imageOut(row.image_path, row.image_width, row.image_height),
      alt: row.alt,
      published: row.is_published,
    }),
  },

  journalCategories: {
    table: "journal_categories",
    order: { column: "sort_order", ascending: true },
    sortable: true,
    input: z.object({ name: required(60) }),
    toRow: (item) => ({ name: item.name, slug: slugify(item.name) }),
    fromRow: (row) => ({ id: row.id, name: row.name }),
  },

  journalPosts: {
    table: "journal_posts",
    imageColumn: "cover_path",
    order: { column: "sort_order", ascending: true },
    sortable: true,
    input: z.object({
      categoryId: z.string().uuid("Выберите категорию"),
      title: required(200),
      slug: text(80),
      excerpt: required(400),
      body: text(50000),
      image: imageValue,
      alt: text(300),
      published: z.boolean(),
    }),
    toRow: (item, existing) => ({
      category_id: item.categoryId,
      title: item.title,
      slug: slugify(item.slug || item.title),
      excerpt: item.excerpt,
      body: item.body,
      cover_path: item.image?.path ?? null,
      cover_width: item.image?.width ?? null,
      cover_height: item.image?.height ?? null,
      cover_alt: item.alt,
      status: item.published ? "published" : "draft",
      /* The first publish stamps the date; later edits keep it, so an edited
         typo does not bump an old article to the top. */
      published_at: item.published ? (existing?.published_at ?? new Date().toISOString()) : existing?.published_at ?? null,
    }),
    fromRow: (row) => ({
      id: row.id,
      categoryId: row.category_id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      body: row.body,
      image: imageOut(row.cover_path, row.cover_width, row.cover_height),
      alt: row.cover_alt,
      published: row.status === "published",
    }),
  },

  seoHome: {
    table: "seo_pages",
    imageColumn: "og_image_path",
    singleton: { keyColumn: "page_key", key: "home" },
    input: z.object({
      title: required(70),
      description: required(200),
      image: imageValue,
    }),
    toRow: (item) => ({
      title: item.title,
      description: item.description,
      og_image_path: item.image?.path ?? null,
    }),
    fromRow: (row) => ({
      id: row.page_key,
      title: row.title,
      description: row.description,
      /* og_image has no stored dimensions — social cards do not need them. */
      image: row.og_image_path ? { path: row.og_image_path, width: 1, height: 1, url: mediaUrl(row.og_image_path) } : null,
    }),
  },
};

/* A replaced or deleted image would otherwise stay in the public bucket
   forever. Seed images are shared between rows (the gallery and the journal
   reuse the same files), so those are never removed from here. */
async function discardImage(path) {
  if (!path || path.startsWith("seed/")) return;

  const { error } = await supabaseAdmin().storage.from(MEDIA_BUCKET).remove([path]);

  /* The row change already succeeded; a leftover file is not worth failing
     the owner's save over. */
  if (error) console.warn(`Could not remove replaced image ${path}: ${error.message}`);
}

export function entryFor(group) {
  const entry = registry[group];
  if (!entry) throw new Error(`Unknown admin group "${group}"`);
  return entry;
}

function fail(label, error) {
  throw new Error(`${label}: ${error.message}`);
}

export async function listGroup(group) {
  const entry = entryFor(group);
  const db = supabaseAdmin();

  if (entry.singleton) {
    const { data, error } = await db
      .from(entry.table)
      .select("*")
      .eq(entry.singleton.keyColumn, entry.singleton.key)
      .maybeSingle();

    if (error) fail(`Load ${group}`, error);
    return data ? entry.fromRow(data) : null;
  }

  const { data, error } = await db
    .from(entry.table)
    .select("*")
    .order(entry.order.column, { ascending: entry.order.ascending });

  if (error) fail(`Load ${group}`, error);
  return data.map(entry.fromRow);
}

export async function saveItem(group, id, rawItem) {
  const entry = entryFor(group);
  const item = entry.input.parse(rawItem);
  const db = supabaseAdmin();

  if (entry.singleton) {
    const { data: previous } = await db
      .from(entry.table)
      .select("*")
      .eq(entry.singleton.keyColumn, entry.singleton.key)
      .maybeSingle();

    const { data, error } = await db
      .from(entry.table)
      .upsert({ [entry.singleton.keyColumn]: entry.singleton.key, ...entry.toRow(item) })
      .select()
      .single();

    if (error) fail(`Save ${group}`, error);

    if (entry.imageColumn && previous?.[entry.imageColumn] !== data[entry.imageColumn]) {
      await discardImage(previous?.[entry.imageColumn]);
    }

    return entry.fromRow(data);
  }

  let existing = null;

  if (id) {
    const { data, error } = await db.from(entry.table).select("*").eq("id", id).maybeSingle();
    if (error) fail(`Save ${group}`, error);
    existing = data;
  }

  const row = entry.toRow(item, existing);

  if ("slug" in row) {
    row.slug = await uniqueSlug(db, entry.table, row.slug, id);
  }

  /* The partial unique index only allows one flagged row. Clearing the flag
     on the others first keeps a "make this one featured" click from failing
     on that very constraint. */
  if (entry.exclusive && row[entry.exclusive]) {
    let clear = db.from(entry.table).update({ [entry.exclusive]: false }).eq(entry.exclusive, true);
    if (id) clear = clear.neq("id", id);
    const { error } = await clear;
    if (error) fail(`Save ${group}`, error);
  }

  if (existing) {
    const { data, error } = await db.from(entry.table).update(row).eq("id", id).select().single();
    if (error) fail(`Save ${group}`, error);

    if (entry.imageColumn && existing[entry.imageColumn] !== data[entry.imageColumn]) {
      await discardImage(existing[entry.imageColumn]);
    }

    return entry.fromRow(data);
  }

  if (entry.fixed) {
    throw new Error(`${group} has a fixed set of rows and cannot gain new ones`);
  }

  if (entry.sortable) {
    const { data: last } = await db
      .from(entry.table)
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    row.sort_order = (last?.sort_order ?? -1) + 1;
  }

  const { data, error } = await db.from(entry.table).insert(row).select().single();
  if (error) fail(`Save ${group}`, error);
  return entry.fromRow(data);
}

export async function removeItem(group, id) {
  const entry = entryFor(group);

  if (entry.singleton || entry.fixed) {
    throw new Error(`${group} rows cannot be deleted`);
  }

  const { data: deleted, error } = await supabaseAdmin()
    .from(entry.table)
    .delete()
    .eq("id", id)
    .select()
    .maybeSingle();

  if (!error && entry.imageColumn) {
    await discardImage(deleted?.[entry.imageColumn]);
  }

  if (error) {
    /* 23503: foreign key violation — the category still has photos/posts. */
    if (error.code === "23503") {
      throw new UserError("Сначала перенесите или удалите записи в этой категории.");
    }
    fail(`Delete ${group}`, error);
  }
}

export async function reorderGroup(group, ids) {
  const entry = entryFor(group);
  if (!entry.sortable) throw new Error(`${group} is not sortable`);

  const db = supabaseAdmin();

  /* One update per row. The lists are a handful of items, so a stored
     procedure for a bulk reorder would be more moving parts than it saves. */
  const results = await Promise.all(
    ids.map((id, index) => db.from(entry.table).update({ sort_order: index }).eq("id", id)),
  );

  const failed = results.find((result) => result.error);
  if (failed) fail(`Reorder ${group}`, failed.error);
}
