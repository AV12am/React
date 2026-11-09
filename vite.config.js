import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The public site's pages share one header and one footer: <!-- @header --> and <!-- @footer --> in a page are
// replaced at build (and in dev) with src/site/partials/*.html.
const sitePartials = () => ({
  name: 'site-partials',
  transformIndexHtml(html) {
    // A site page also gets the language boot (public/lang-boot.js): no flash of English before the translation.
    // …and the icons search engines and phones read (a white SVG mark is invisible on a white results page).
    if (html.includes('<!-- @header -->')) html = html.replace('</head>', '    <link rel="icon" type="image/png" sizes="96x96" href="/site-icon-96.png" />\n    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />\n    <script src="/lang-boot.js"></script>\n  </head>');
    return html.replace(/<!-- @(header|footer) -->/g, (_, n) => readFileSync(fileURLToPath(new URL(`./src/site/partials/${n}.html`, import.meta.url)), 'utf8'));
  },
});

export default defineConfig({
  plugins: [sitePartials(), react(), tailwindcss()],
  base: './',
  // Which commit this build is (shown in «Налаштування»): Vercel sets VERCEL_GIT_COMMIT_SHA.
  define: { __BUILD__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7)) },
  // VITE_* as usual; NEXT_PUBLIC_* too, so the Supabase integration of v0 / Vercel works as it is
  // (it sets NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY). Only public values use these prefixes.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  worker: { format: 'es' },
  // Pages: the platform (app.html — no index.html, so that «/» is decided by the host: vercel.json) and CONTEXT News on its own (news.html, served at /news).
  build: { rollupOptions: { input: { main: fileURLToPath(new URL('./app.html', import.meta.url)), news: fileURLToPath(new URL('./news.html', import.meta.url)), site: fileURLToPath(new URL('./site.html', import.meta.url)), context: fileURLToPath(new URL('./context.html', import.meta.url)), situation: fileURLToPath(new URL('./situation.html', import.meta.url)), privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)), terms: fileURLToPath(new URL('./terms.html', import.meta.url)), cookies: fileURLToPath(new URL('./cookies.html', import.meta.url)), about: fileURLToPath(new URL('./about.html', import.meta.url)), careers: fileURLToPath(new URL('./careers.html', import.meta.url)), time: fileURLToPath(new URL('./time.html', import.meta.url)), contact: fileURLToPath(new URL('./contact.html', import.meta.url)), methodology: fileURLToPath(new URL('./methodology.html', import.meta.url)) } } },
  // v0 / shadcn import paths: `@/components/…`, `@/lib/utils`
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Dev server only: let v0 / Vercel sandboxes open the preview (hosts like sb-….vercel.run).
  server: { allowedHosts: ['.vercel.run', '.vusercontent.net', '.v0.app', '.v0.dev'] },
  preview: { allowedHosts: ['.vercel.run', '.vusercontent.net', '.v0.app', '.v0.dev'] },
});
