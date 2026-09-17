import {
  getEvents,
  getTournaments,
  getTrainingCards,
  getTrainingPackages,
  getSetting,
  getGalleryPhotos,
  getJournalPosts,
  getSeoPage,
  remoteImage,
} from "./repositories/public.js";

/* Assembles everything the public site renders, from Supabase, into the same
   shape the components were written against when this came from a JSON file.
   Keeping the shape stable is what lets the components stay almost untouched.

   Pages are prerendered, so this runs once per build. The promise is memoised
   because several components ask for it during the same build — without it,
   every section would re-query the whole database. */

let pending = null;

export function getSiteContent() {
  pending ??= load();
  return pending;
}

function money(cents, currency) {
  const whole = cents % 100 === 0;

  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

function dayAndMonth(isoDate) {
  /* UTC on both ends: a bare date string is midnight UTC, and formatting it
     in a local zone west of Greenwich would print the day before. */
  const date = new Date(`${isoDate}T00:00:00Z`);

  return {
    day: String(date.getUTCDate()),
    month: date.toLocaleString("en", { month: "short", timeZone: "UTC" }),
  };
}

async function load() {
  const [events, tournaments, cards, packageRows, packagesCopy, photos, posts, seoHome] =
    await Promise.all([
      getEvents(),
      getTournaments(),
      getTrainingCards(),
      getTrainingPackages(),
      getSetting("training_packages"),
      getGalleryPhotos(),
      getJournalPosts(),
      getSeoPage("home"),
    ]);

  const byKey = Object.fromEntries(cards.map((card) => [card.key, card]));

  return {
    seo: {
      home: {
        title: seoHome?.title ?? "Alicante Paddle",
        description: seoHome?.description ?? "",
        ogImagePath: seoHome?.og_image_path ?? null,
      },
    },

    tournaments: tournaments.map((row) => ({
      id: row.id,
      number: row.number,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      meta: row.details,
      active: row.is_highlighted,
      joinUrl: row.join_url,
    })),

    training: {
      /* The section is designed around exactly these two cards, in this
         order — a missing one is a data error worth failing the build over. */
      cards: ["personal", "group"].map((key) => {
        const card = byKey[key];
        if (!card) throw new Error(`Supabase: training card "${key}" is missing`);

        return {
          id: card.id,
          price: money(card.price_cents, card.currency),
          unit: card.unit_label,
          title: card.title,
          description: card.description,
          caption: card.caption,
          buttonLabel: card.button_label,
          buttonUrl: card.button_url,
        };
      }),

      packages: {
        heading: packagesCopy?.heading ?? "",
        note: packagesCopy?.note ?? "",
        buttonLabel: packagesCopy?.buttonLabel ?? "Choose package",
        buttonUrl: packagesCopy?.buttonUrl ?? "#contact",
        rows: packageRows.map((row) => ({
          id: row.id,
          label: row.label,
          price: money(row.price_cents, row.currency),
          oldPrice: row.old_price_cents ? money(row.old_price_cents, row.currency) : "",
          /* Derived, never stored — see the migration. */
          save: row.old_price_cents
            ? `SAVE ${money(row.old_price_cents - row.price_cents, row.currency)}`
            : "",
        })),
      },
    },

    events: events.map((row) => ({
      id: row.id,
      ...dayAndMonth(row.event_date),
      city: row.city,
      title: row.title,
      description: row.description,
      image: remoteImage(row.image_path, row.image_width, row.image_height),
      imageAlt: row.image_alt,
      buttonLabel: row.button_label,
      buttonUrl: row.button_url,
      featured: row.is_featured,
    })),

    gallery: photos.map((row) => ({
      id: row.id,
      image: remoteImage(row.image_path, row.image_width, row.image_height),
      alt: row.alt,
    })),

    journal: posts.map((row, i) => ({
      id: row.id,
      index: String(i + 1).padStart(2, "0"),
      title: row.title,
      excerpt: row.excerpt,
      image: remoteImage(row.cover_path, row.cover_width, row.cover_height),
      alt: row.cover_alt,
      /* There are no article pages yet, so every card still points at the
         journal section. Switches to /journal/<slug> once those pages exist. */
      url: "#journal",
    })),
  };
}
