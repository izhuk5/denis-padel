-- Table privileges for the server-side secret key.
--
-- The secret key acts as the service_role, which bypasses row level security
-- — but RLS is only the second gate. The first is ordinary table privileges,
-- and newer Supabase projects no longer grant those automatically on tables
-- created from the SQL editor. 0001 granted SELECT to the public roles and
-- nothing to service_role, so every admin write failed with
-- "permission denied for table".
--
-- Safe to re-run.

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.events,
  public.tournaments,
  public.training_cards,
  public.training_packages,
  public.settings,
  public.gallery_categories,
  public.gallery_photos,
  public.journal_categories,
  public.journal_posts,
  public.seo_pages
to service_role;
