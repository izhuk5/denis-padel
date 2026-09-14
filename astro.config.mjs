// @ts-check
import { defineConfig, envField } from 'astro/config';
import compress from 'astro-compress';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  // The public site stays fully prerendered. Only the /admin routes opt out
  // via `export const prerender = false`, so the adapter exists purely to run
  // the login check and the session guard on a server.
  output: 'static',
  adapter: vercel(),

  integrations: [compress()],

  env: {
    schema: {
      // `access: 'secret'` is what keeps these out of the client bundle:
      // importing them from astro:env/client is a build error, not a silent
      // leak. Both live in .env.local, which is gitignored.
      ADMIN_PASSWORD: envField.string({ context: 'server', access: 'secret' }),
      ADMIN_SESSION_SECRET: envField.string({ context: 'server', access: 'secret' }),
    },
  },
});
