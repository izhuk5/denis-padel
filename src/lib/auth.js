import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { ADMIN_PASSWORD, ADMIN_SESSION_SECRET } from "astro:env/server";

/* Session handling for the admin panel.

   There is no user table and no database — a single shared password unlocks
   a signed cookie. The cookie carries no secrets of its own: just an expiry
   and a random id, signed with ADMIN_SESSION_SECRET, so it cannot be forged
   or extended by whoever holds it. */

export const SESSION_COOKIE = "ap_admin_session";

/* Eight hours: long enough to edit a page of content without re-typing the
   password, short enough that a forgotten open laptop stops mattering. */
const SESSION_MAX_AGE = 60 * 60 * 8;

function sign(payload) {
  return createHmac("sha256", ADMIN_SESSION_SECRET).update(payload).digest("base64url");
}

/* Both comparisons below run in constant time. A plain === leaks how much of
   the value matched through its timing, which is enough to recover a secret
   byte by byte over many attempts. */
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  /* timingSafeEqual throws on a length mismatch, so the lengths are compared
     first — and still every branch does the same amount of work. */
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }

  return timingSafeEqual(left, right);
}

export function isPasswordCorrect(candidate) {
  return safeEqual(candidate ?? "", ADMIN_PASSWORD);
}

export function createSessionToken() {
  const expires = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = `${expires}.${randomBytes(12).toString("base64url")}`;

  return `${payload}.${sign(payload)}`;
}

export function isSessionValid(token) {
  if (!token) return false;

  const parts = String(token).split(".");
  if (parts.length !== 3) return false;

  const [expires, nonce, signature] = parts;
  const payload = `${expires}.${nonce}`;

  if (!safeEqual(signature, sign(payload))) return false;

  /* An expired but correctly signed cookie is still a rejection — the
     signature only proves the token was issued here, not that it is current. */
  return Number(expires) > Date.now();
}

export function setSessionCookie(cookies) {
  cookies.set(SESSION_COOKIE, createSessionToken(), {
    path: "/",
    httpOnly: true, // unreadable from JavaScript, so an XSS cannot steal it
    sameSite: "lax", // not sent on cross-site POSTs, which blocks CSRF on the forms
    secure: import.meta.env.PROD, // https-only in production; plain http locally
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearSessionCookie(cookies) {
  cookies.delete(SESSION_COOKIE, { path: "/" });
}
