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

  image: {
    // Content images live in Supabase Storage. Allowing the bucket's public
    // path lets astro:assets fetch them at build time and emit the same AVIF
    // sources the local images got.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  env: {
    schema: {
      // `access: 'secret'` is what keeps these out of the client bundle:
      // importing them from astro:env/client is a build error, not a silent
      // leak. All of them live in .env.local, which is gitignored.
      ADMIN_PASSWORD: envField.string({ context: 'server', access: 'secret' }),
      ADMIN_SESSION_SECRET: envField.string({ context: 'server', access: 'secret' }),

      // Needed by the build — the public pages read content through it.
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret', url: true }),
      SUPABASE_PUBLISHABLE_KEY: envField.string({ context: 'server', access: 'secret' }),

      // Only needed when the admin saves. Optional so the public site can
      // still build before they are configured; the admin actions raise a
      // clear error instead.
      SUPABASE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      VERCEL_DEPLOY_HOOK_URL: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
        url: true,
      }),
    },
  },
});
