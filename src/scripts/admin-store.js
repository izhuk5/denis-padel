// @ts-nocheck — project is plain JS

/* Mock-stage storage.

   The published site is static: it reads src/data/content.json at build time.
   There is no server to POST to yet, so the admin keeps the owner's edits in
   localStorage and hands back a content.json file to drop into the repo.

   Everything below is deliberately isolated behind load/save/publish so that
   swapping localStorage for a real API later touches this file only. */

const STORAGE_KEY = "alicante-admin-draft-v1";

/* The content.json that the current build was made from. Edits are diffed
   against it so the UI can tell the owner what is still unpublished. */
let baseline = null;

export function initStore(baselineContent) {
  baseline = structuredClone(baselineContent);
}

function readDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    /* Private windows and cleared site data both land here. A missing draft
       is not an error — the baseline is always a valid starting point. */
    return null;
  }
}

export function load() {
  return readDraft() ?? structuredClone(baseline);
}

export function save(content) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
    return true;
  } catch {
    return false;
  }
}

export function discardDraft() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing to discard if storage is unavailable. */
  }
}

export function hasUnpublishedChanges(content) {
  return JSON.stringify(content) !== JSON.stringify(baseline);
}

/* Which top-level sections differ from the published build, so the sidebar
   can mark them. */
export function changedSections(content) {
  return Object.keys(baseline).filter(
    (key) => JSON.stringify(content[key]) !== JSON.stringify(baseline[key]),
  );
}

export function publish(content) {
  const blob = new Blob([JSON.stringify(content, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "content.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ids only have to be unique inside their own list. */
export function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
