import { clearSessionCookie } from "../../lib/auth.js";

export const prerender = false;

/* POST-only: a plain <a href="/admin/logout"> would be triggered by any image
   or link on another site, logging the owner out at random. */
export function POST({ cookies, redirect }) {
  clearSessionCookie(cookies);
  return redirect("/admin/login");
}
