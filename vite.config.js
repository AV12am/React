import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The public site's pages share one header and one footer: <!-- @header --> and <!-- @footer --> in a page are
// replaced at build (and in dev) with src/site/partials/*.html.
// The link preview of a site page (LinkedIn, Telegram, X, mail): its card public/og/<page>.png (scripts/og-images.cjs),
// and its title and description for og: and twitter: unless the page sets them itself.
const OG = new Set(['site', 'osint', 'risk', 'due-diligence', 'context', 'situation', 'forecasts', 'foresight', 'about', 'careers', 'contact', 'methodology', 'privacy', 'terms', 'cookies', 'news']);
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
export function shareMeta(html, name) {
  if (!OG.has(name)) return '';
  const title = (html.match(/<meta property="og:title" content="([^"]*)"/) || html.match(/<title>([^<]*)<\/title>/) || [])[1] || 'Reaction Core';
  const desc = (html.match(/<meta property="og:description" content="([^"]*)"/) || html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const img = `https://reactioncore.uk/og/${name}.png`;
  const tags = [
    !/property="og:title"/.test(html) && `<meta property="og:title" content="${attr(title)}" />`,
    !/property="og:description"/.test(html) && desc && `<meta property="og:description" content="${attr(desc)}" />`,
    !/property="og:type"/.test(html) && '<meta property="og:type" content="website" />',
    `<meta property="og:image" content="${img}" />`, '<meta property="og:image:width" content="1200" />', '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${attr(title)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />', `<meta name="twitter:title" content="${attr(title)}" />`,
    desc && `<meta name="twitter:description" content="${attr(desc)}" />`, `<meta name="twitter:image" content="${img}" />`,
  ].filter(Boolean);
  return tags.map((t) => `    ${t}\n`).join('');
}

const sitePartials = () => ({
  name: 'site-partials',
  transformIndexHtml: { order: 'pre', handler(html, ctx) {
    // Each site page names its own address (canonical) for search engines: /site.html is «/», /about.html is «/about».
    const name = String(ctx?.filename || ctx?.path || '').split('/').pop().replace(/\.html$/, '');
    // CONTEXT News is its own app (no site header) but is shared as much as any page: its preview too.
    if (name === 'news' && !html.includes('og:image')) html = html.replace('</head>', `${shareMeta(html, name)}  </head>`);
    if (html.includes('<!-- @header -->')) {
      const href = `https://reactioncore.uk/${name === 'site' ? '' : name}`;
      html = html.replace('</head>', `    <link rel="canonical" href="${href}" />\n    <meta property="og:site_name" content="Reaction Core" />\n    <meta property="og:url" content="${href}" />\n${shareMeta(html, name)}  </head>`);
    }
    // A site page also gets the language boot (public/lang-boot.js): no flash of English before the translation.
    // …and the icons search engines and phones read (a white SVG mark is invisible on a white results page).
    // The site has its own language switcher: browsers' page translation (Edge, Chrome, Safari) is turned off —
    // two translators on one page fought and froze it.
    if (html.includes('<!-- @header -->')) html = html.replace('<html lang="en">', '<html lang="en" translate="no">').replace('<head>', '<head>\n    <meta name="google" content="notranslate" />');
    if (html.includes('<!-- @header -->')) html = html.replace('</head>', '    <link rel="icon" type="image/png" sizes="96x96" href="/site-icon-96.png" />\n    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />\n    <link rel="manifest" href="/site.webmanifest" />\n    <meta name="apple-mobile-web-app-title" content="Reaction Core" />\n    <script src="/lang-boot.js"></script>\n  </head>');
    return html.replace(/<!-- @(header|footer) -->/g, (_, n) => readFileSync(fileURLToPath(new URL(`./src/site/partials/${n}.html`, import.meta.url)), 'utf8'));
  } },
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
  build: { rollupOptions: { input: { main: fileURLToPath(new URL('./app.html', import.meta.url)), news: fileURLToPath(new URL('./news.html', import.meta.url)), site: fileURLToPath(new URL('./site.html', import.meta.url)), context: fileURLToPath(new URL('./context.html', import.meta.url)), situation: fileURLToPath(new URL('./situation.html', import.meta.url)), privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)), terms: fileURLToPath(new URL('./terms.html', import.meta.url)), cookies: fileURLToPath(new URL('./cookies.html', import.meta.url)), about: fileURLToPath(new URL('./about.html', import.meta.url)), careers: fileURLToPath(new URL('./careers.html', import.meta.url)), forecasts: fileURLToPath(new URL('./forecasts.html', import.meta.url)), foresight: fileURLToPath(new URL('./foresight.html', import.meta.url)), contact: fileURLToPath(new URL('./contact.html', import.meta.url)), methodology: fileURLToPath(new URL('./methodology.html', import.meta.url)), osint: fileURLToPath(new URL('./osint.html', import.meta.url)), risk: fileURLToPath(new URL('./risk.html', import.meta.url)), dd: fileURLToPath(new URL('./due-diligence.html', import.meta.url)) } } },
  // v0 / shadcn import paths: `@/components/…`, `@/lib/utils`
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Dev server only: let v0 / Vercel sandboxes open the preview (hosts like sb-….vercel.run).
  server: { allowedHosts: ['.vercel.run', '.vusercontent.net', '.v0.app', '.v0.dev'] },
  preview: { allowedHosts: ['.vercel.run', '.vusercontent.net', '.v0.app', '.v0.dev'] },
});
