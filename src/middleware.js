import { defineMiddleware } from "astro:middleware";
import { SESSION_COOKIE, isSessionValid } from "./lib/auth.js";

/* Every /admin route is closed unless the request carries a valid session
   cookie. The check lives here rather than in each page so a new admin page
   is protected by existing, not by remembering to add a guard to it. */

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/logout"];

export const onRequest = defineMiddleware((context, next) => {
  const path = context.url.pathname.replace(/\/+$/, "") || "/";

  /* Prerendered pages run this at build time, where there is no real request
     to authorise — and the public site is entirely prerendered, so skipping
     them costs nothing. */
  if (context.isPrerendered) return next();
  if (!path.startsWith("/admin")) return next();
  if (PUBLIC_ADMIN_PATHS.includes(path)) return next();

  if (!isSessionValid(context.cookies.get(SESSION_COOKIE)?.value)) {
    /* Where the visitor was headed, so login can send them back there
       instead of dumping everyone on the dashboard. */
    const next_ = encodeURIComponent(context.url.pathname + context.url.search);
    return context.redirect(`/admin/login?next=${next_}`);
  }

  return next();
});
