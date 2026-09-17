import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { imageSize } from "image-size";
import { VERCEL_DEPLOY_HOOK_URL } from "astro:env/server";
import { SESSION_COOKIE, isSessionValid } from "../lib/auth.js";
import { registry, listGroup, saveItem, removeItem, reorderGroup, UserError } from "../lib/repositories/admin.js";
import { supabaseAdmin } from "../lib/supabase/server.js";
import { MEDIA_BUCKET, mediaUrl } from "../lib/supabase/public.js";

/* Actions are served from /_actions/*, which the /admin middleware does not
   cover — so every handler checks the session itself, first, before touching
   anything. */
function requireAdmin(context) {
  if (!isSessionValid(context.cookies.get(SESSION_COOKIE)?.value)) {
    throw new ActionError({ code: "UNAUTHORIZED", message: "Сессия истекла. Войдите снова." });
  }
}

/* Database and validation failures come back as readable messages instead of
   an opaque 500, so the admin can show the owner what to fix. */
async function guarded(context, work) {
  requireAdmin(context);

  try {
    return await work();
  } catch (error) {
    if (error instanceof ActionError) throw error;

    if (error instanceof UserError) {
      throw new ActionError({ code: "CONFLICT", message: error.message });
    }

    if (error instanceof z.ZodError) {
      const first = error.issues[0];
      throw new ActionError({
        code: "BAD_REQUEST",
        message: first ? `${first.path.join(".") || "Поле"}: ${first.message}` : "Проверьте поля",
      });
    }

    throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

const group = z.enum(Object.keys(registry));

const UPLOAD_FOLDERS = ["events", "gallery", "journal", "seo"];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/* The file's own bytes decide its type, not the name or the browser-supplied
   MIME type — both are whatever the uploader says they are. */
const SNIFFED_TYPES = {
  jpg: { ext: "jpg", mime: "image/jpeg" },
  png: { ext: "png", mime: "image/png" },
  webp: { ext: "webp", mime: "image/webp" },
  avif: { ext: "avif", mime: "image/avif" },
};

export const server = {
  list: defineAction({
    input: z.object({ group }),
    handler: ({ group: key }, context) => guarded(context, () => listGroup(key)),
  }),

  save: defineAction({
    input: z.object({
      group,
      id: z.string().max(100).nullable(),
      item: z.record(z.string(), z.unknown()),
    }),
    handler: ({ group: key, id, item }, context) => guarded(context, () => saveItem(key, id, item)),
  }),

  remove: defineAction({
    input: z.object({ group, id: z.string().uuid() }),
    handler: ({ group: key, id }, context) =>
      guarded(context, async () => {
        await removeItem(key, id);
        return { ok: true };
      }),
  }),

  reorder: defineAction({
    input: z.object({ group, ids: z.array(z.string().uuid()).max(500) }),
    handler: ({ group: key, ids }, context) =>
      guarded(context, async () => {
        await reorderGroup(key, ids);
        return { ok: true };
      }),
  }),

  /* Uploads never pass through this server. Serverless functions cap request
     bodies (Vercel at 4.5 MB, Astro Actions at 1 MB), well under a phone
     photo, so the browser sends the file straight to Storage through a
     one-time signed URL, and the server only issues that URL and checks the
     result afterwards. The secret key still never leaves the server. */
  uploadStart: defineAction({
    input: z.object({
      folder: z.enum(UPLOAD_FOLDERS),
      contentType: z.enum(Object.values(SNIFFED_TYPES).map((type) => type.mime), {
        message: "Поддерживаются JPG, PNG, WebP и AVIF.",
      }),
      size: z
        .number()
        .int()
        .positive("Файл пустой.")
        .max(MAX_UPLOAD_BYTES, "Файл больше 10 МБ."),
    }),
    handler: ({ folder, contentType }, context) =>
      guarded(context, async () => {
        const ext = Object.values(SNIFFED_TYPES).find((type) => type.mime === contentType).ext;

        /* A random name: uploads never collide or overwrite each other, and
           nothing from the original file name ends up in a URL. */
        const path = `${folder}/${crypto.randomUUID()}.${ext}`;

        const { data, error } = await supabaseAdmin().storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
        if (error) throw new Error(`Не удалось начать загрузку: ${error.message}`);

        return { path, signedUrl: data.signedUrl };
      }),
  }),

  uploadFinish: defineAction({
    input: z.object({
      /* Only paths uploadStart could have issued — never a seed file or
         anything else already in the bucket. */
      path: z
        .string()
        .regex(new RegExp(`^(${UPLOAD_FOLDERS.join("|")})/[0-9a-f-]{36}\\.(jpg|png|webp|avif)$`)),
    }),
    handler: ({ path }, context) =>
      guarded(context, async () => {
        const storage = supabaseAdmin().storage.from(MEDIA_BUCKET);
        const { data: blob, error } = await storage.download(path);

        if (error) throw new ActionError({ code: "BAD_REQUEST", message: "Файл не дошёл до хранилища." });

        /* The browser declared a type before uploading; the bytes decide
           whether it told the truth. Anything that is not a real image of an
           allowed type is deleted rather than left in a public bucket. */
        let dimensions = null;
        try {
          dimensions = imageSize(new Uint8Array(await blob.arrayBuffer()));
        } catch {
          dimensions = null;
        }

        const type = dimensions && SNIFFED_TYPES[dimensions.type];

        if (!type || !path.endsWith(`.${type.ext}`) || !dimensions.width || !dimensions.height) {
          await storage.remove([path]);
          throw new ActionError({ code: "BAD_REQUEST", message: "Это не похоже на изображение." });
        }

        return { path, width: dimensions.width, height: dimensions.height, url: mediaUrl(path) };
      }),
  }),

  publish: defineAction({
    handler: (_input, context) =>
      guarded(context, async () => {
        if (!VERCEL_DEPLOY_HOOK_URL) {
          throw new ActionError({
            code: "PRECONDITION_FAILED",
            message: "Публикация не настроена: не задан VERCEL_DEPLOY_HOOK_URL.",
          });
        }

        const response = await fetch(VERCEL_DEPLOY_HOOK_URL, { method: "POST" });

        if (!response.ok) {
          throw new Error(`Vercel ответил ${response.status}. Сайт не пересобран.`);
        }

        return { ok: true };
      }),
  }),
};
