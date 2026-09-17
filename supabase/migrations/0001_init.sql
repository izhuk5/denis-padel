-- Alicante Paddle — content schema.
--
-- Access model, in one place:
--   * anon / authenticated (the publishable key) may only SELECT, and only
--     rows that are published. Drafts cannot reach the public site even if
--     the site's own code forgets to filter them.
--   * Nothing but the server-side secret key can write. There are no
--     insert/update/delete policies at all, so RLS denies every write that
--     does not bypass it.
--
-- Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at, maintained by the database rather than trusted from the client
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  event_date    date not null,
  city          text not null,
  description   text not null default '',
  image_path    text,
  image_width   int check (image_width > 0),
  image_height  int check (image_height > 0),
  image_alt     text not null default '',
  button_label  text not null default 'View event',
  button_url    text not null default '#contact',
  is_featured   boolean not null default false,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The public section shows exactly one featured event. Enforced here so two
-- concurrent saves from the admin cannot both win.
create unique index if not exists events_single_featured
  on public.events (is_featured) where is_featured;

-- ---------------------------------------------------------------------------
-- Weekly tournaments
-- ---------------------------------------------------------------------------

create table if not exists public.tournaments (
  id              uuid primary key default gen_random_uuid(),
  number          text not null,
  title           text not null,
  subtitle        text not null default '',
  description     text not null default '',
  -- Label/value pairs shown under the card ("When" -> "Wed · 19:00"). A short
  -- display list nobody queries by, so jsonb rather than a child table.
  details         jsonb not null default '[]'::jsonb
                  check (jsonb_typeof(details) = 'array'),
  join_url        text not null default '#contact',
  is_highlighted  boolean not null default false,
  sort_order      int not null default 0,
  is_published    boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists tournaments_single_highlighted
  on public.tournaments (is_highlighted) where is_highlighted;

-- ---------------------------------------------------------------------------
-- Training
-- ---------------------------------------------------------------------------

create table if not exists public.training_cards (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique check (key in ('personal', 'group')),
  price_cents   int not null check (price_cents >= 0),
  currency      text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  unit_label    text not null default '',
  title         text not null,
  description   text not null default '',
  caption       text not null default '',
  button_label  text not null default 'Book',
  button_url    text not null default '#contact',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.training_packages (
  id               uuid primary key default gen_random_uuid(),
  label            text not null,
  price_cents      int not null check (price_cents >= 0),
  -- The "SAVE €20" badge is derived from these two, never stored: a stored
  -- badge goes stale the first time someone edits a price and forgets it.
  old_price_cents  int check (old_price_cents is null or old_price_cents > price_cents),
  currency         text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  sort_order       int not null default 0,
  is_published     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Singleton copy blocks (e.g. the packages card heading and footnote).
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Gallery
-- ---------------------------------------------------------------------------

create table if not exists public.gallery_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.gallery_photos (
  id            uuid primary key default gen_random_uuid(),
  -- restrict: deleting a category must not silently delete its photos.
  category_id   uuid not null references public.gallery_categories (id) on delete restrict,
  image_path    text not null,
  image_width   int not null check (image_width > 0),
  image_height  int not null check (image_height > 0),
  alt           text not null default '',
  sort_order    int not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists gallery_photos_category on public.gallery_photos (category_id);

-- ---------------------------------------------------------------------------
-- Padel Journal
-- ---------------------------------------------------------------------------

create table if not exists public.journal_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.journal_posts (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references public.journal_categories (id) on delete restrict,
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title         text not null,
  excerpt       text not null default '',
  body          text not null default '',
  cover_path    text,
  cover_width   int check (cover_width > 0),
  cover_height  int check (cover_height > 0),
  cover_alt     text not null default '',
  status        text not null default 'draft' check (status in ('draft', 'published')),
  published_at  timestamptz,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A published post always has a date to sort and display by.
  constraint journal_posts_published_has_date
    check (status <> 'published' or published_at is not null)
);

create index if not exists journal_posts_category on public.journal_posts (category_id);

-- ---------------------------------------------------------------------------
-- SEO
-- ---------------------------------------------------------------------------

create table if not exists public.seo_pages (
  page_key       text primary key,
  title          text not null,
  description    text not null default '',
  og_image_path  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'events', 'tournaments', 'training_cards', 'training_packages', 'settings',
    'gallery_categories', 'gallery_photos', 'journal_categories', 'journal_posts', 'seo_pages'
  ]
  loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: read-only, published-only for the public key
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'events', 'tournaments', 'training_cards', 'training_packages', 'settings',
    'gallery_categories', 'gallery_photos', 'journal_categories', 'journal_posts', 'seo_pages'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    -- Belt and braces: even if a permissive policy were added by mistake,
    -- the public roles hold no write privilege to use it with.
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    -- The secret key acts as service_role. It bypasses RLS, but still needs
    -- plain table privileges, which newer projects no longer grant by default.
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('drop policy if exists public_read on public.%I', t);
  end loop;
end;
$$;

create policy public_read on public.events
  for select to anon, authenticated using (is_published);

create policy public_read on public.tournaments
  for select to anon, authenticated using (is_published);

create policy public_read on public.training_cards
  for select to anon, authenticated using (true);

create policy public_read on public.training_packages
  for select to anon, authenticated using (is_published);

create policy public_read on public.settings
  for select to anon, authenticated using (true);

create policy public_read on public.gallery_categories
  for select to anon, authenticated using (true);

create policy public_read on public.gallery_photos
  for select to anon, authenticated using (is_published);

create policy public_read on public.journal_categories
  for select to anon, authenticated using (true);

create policy public_read on public.journal_posts
  for select to anon, authenticated using (status = 'published');

create policy public_read on public.seo_pages
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- Public bucket: every file in it is an image already shown on the public
-- site, so reads need no policy. No write policies are created — uploads go
-- through the server with the secret key, which checks type and size first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-media',
  'site-media',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
