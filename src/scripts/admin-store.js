// @ts-nocheck — project is plain JS

import { actions } from "astro:actions";

/* The admin's only door to the server. Each call goes through an Astro Action,
   which checks the session and validates the input before Supabase sees it.

   Errors are rethrown as plain Errors carrying the server's readable message,
   so the UI can show "Старая цена должна быть больше новой" rather than a
   status code. */

async function call(action, input) {
  const { data, error } = await action(input);

  if (error) {
    /* An expired session cannot be fixed from inside the form — send the
       owner to log in, and back to this page afterwards. */
    if (error.code === "UNAUTHORIZED") {
      location.href = `/admin/login?next=${encodeURIComponent(location.pathname)}`;
    }

    /* Input validation failures carry their issues separately; the message
       itself is a JSON dump meant for developers, not for the owner. */
    const readable = error.issues?.[0]?.message ?? error.message;
    throw new Error(readable || "Не удалось выполнить действие");
  }

  return data;
}

const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const saveItem = (group, id, item) => call(actions.save, { group, id, item });

export const removeItem = (group, id) => call(actions.remove, { group, id });

export const reorderGroup = (group, ids) => call(actions.reorder, { group, ids });

/* Three steps, so the file itself never travels through the server — see
   uploadStart in src/actions/index.js for why. */
export async function uploadImage(folder, file) {
  /* Checked here first so a wrong file fails instantly, without a round
     trip. The server repeats both checks — this one is only for speed. */
  if (!UPLOAD_TYPES.includes(file.type)) {
    throw new Error("Поддерживаются JPG, PNG, WebP и AVIF.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Файл больше 10 МБ.");
  }

  const { path, signedUrl } = await call(actions.uploadStart, {
    folder,
    contentType: file.type,
    size: file.size,
  });

  const response = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: {
      "content-type": file.type,
      "cache-control": "max-age=31536000",
      "x-upsert": "false",
    },
  });

  if (!response.ok) {
    throw new Error(`Загрузка не удалась (${response.status}).`);
  }

  return call(actions.uploadFinish, { path });
}

export const publishSite = () => call(actions.publish, {});
