// The link previews of the public site (LinkedIn, Telegram, X, mail): one 1200×630 card per page in the site's own
// look — the mark and the wordmark, the page's name in Cormorant, one line about it, an engraved plate (scripts/plates.mjs)
// on the right. Rendered by the browser with the site's own fonts; written to public/og/<page>.png.
// Run: node scripts/og-images.cjs   (needs Playwright's Chromium; vite.config.js adds the meta tags to each page)
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'og');
const PLATES = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'plates.mjs')], { encoding: 'utf8' }));
// fonts go in as data (a page set from a string may not read local files)
const font = (f) => `url(data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'public', 'fonts', f)).toString('base64')}) format('truetype')`;
const PETAL = 'M0 -96L13.44 -57.6L2.4 -23.04L0 -26.88L-2.4 -23.04L-13.44 -57.6Z';
const MARK = `<svg viewBox="-100 -100 200 200" width="44" height="44"><g fill="#ededed">${Array.from({ length: 8 }, (_, i) => `<path d="${PETAL}" transform="rotate(${i * 45})"/>`).join('')}<path d="M0 -8.64L8.64 0L0 8.64L-8.64 0Z"/></g></svg>`;

// page → eyebrow, title, line, plate
const CARDS = {
  site: ['Independent analysis', 'Open sources. One picture.', 'Open sources gathered and verified, brought into one picture, with a conclusion you can act on.', 'seal'],
  osint: ['Service · I', 'Open-source intelligence', 'Media, registries and social networks — collected, verified and brought together.', 'triangulation'],
  risk: ['Service · II', 'Risk analysis', 'Political, economic and security factors for the countries and markets you work in.', 'survey'],
  'due-diligence': ['Service · III', 'Due diligence', 'Owners, links, tenders and sanctions — before you sign.', 'seal'],
  context: ['Product', 'CONTEXT', 'The daily digest of key events and analytical articles, at 17:00 Kyiv.', 'broadsheet'],
  news: ['Product', 'CONTEXT News', 'The day’s issue in full: the key news, the aggressor’s information space, the world’s media.', 'broadsheet'],
  situation: ['Product', 'SITUATION', 'Dashboards on countries, companies and sectors — indicators, trends, a map, a link graph.', 'survey'],
  forecasts: ['Open to all', 'Forecasts', 'What will happen, and when — with a probability, a date to check it against and a public record.', 'ledger'],
  foresight: ['Open to all', 'Foresight', 'What could happen over the years ahead — the drivers, several futures and the signposts to watch.', 'fan'],
  about: ['Company', 'About', 'An independent analytical project working with open sources.', 'seal'],
  careers: ['Company', 'Careers', 'A permanent role or expert collaboration.', 'seal'],
  contact: ['Company', 'Contact', 'Tell us what you need to find out.', 'seal'],
  methodology: ['Method', 'Methodology', 'How sources are found, verified and weighed — and how forecasts are scored.', 'triangulation'],
  privacy: ['Legal', 'Privacy policy', 'What is kept, for how long, and your rights.', 'seal'],
  terms: ['Legal', 'Terms of use', 'The rules for using the site and its products.', 'seal'],
  cookies: ['Legal', 'Cookies', 'What this site keeps in your browser — and what it does not.', 'seal'],
};

const CSS = `
@font-face{font-family:Corm;src:${font('CormorantGaramond-Medium.ttf')}}
@font-face{font-family:Cinzel;src:${font('Cinzel-Medium.ttf')}}
@font-face{font-family:Inter;src:${font('Inter-Regular.ttf')}}
@font-face{font-family:Mono;src:${font('JetBrainsMono-Regular.ttf')}}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0a0a0a;color:#ededed;font-family:Inter;overflow:hidden;position:relative}
.grid{position:absolute;inset:0;background-image:linear-gradient(#141414 1px,transparent 1px),linear-gradient(90deg,#141414 1px,transparent 1px);background-size:60px 60px;opacity:.55}
.frame{position:absolute;inset:28px;border:1px solid #232323}
.brand{position:absolute;left:72px;top:68px;display:flex;align-items:center;gap:18px}
.wm{font-family:Cinzel;font-size:26px;letter-spacing:.32em}
.wm sup{font-family:Mono;font-size:13px;letter-spacing:.08em;color:#8c8c8c;margin-left:-.1em;vertical-align:super}
.eye{position:absolute;left:72px;top:212px;font-family:Mono;font-size:17px;letter-spacing:.2em;text-transform:uppercase;color:#8c8c8c}
h1{position:absolute;left:72px;top:250px;width:640px;font-family:Corm;font-weight:500;font-size:76px;line-height:80px;letter-spacing:.01em}
p{position:absolute;left:72px;bottom:118px;width:600px;font-size:24px;line-height:34px;color:#a3a3a3}
.url{position:absolute;left:72px;bottom:62px;font-family:Mono;font-size:16px;letter-spacing:.16em;color:#6b6b6b}
.pl{position:absolute;right:72px;top:150px;width:390px}
.cap{position:absolute;right:72px;bottom:62px;font-family:Mono;font-size:15px;letter-spacing:.14em;color:#6b6b6b}
.cap i{font-family:Corm;font-size:22px;letter-spacing:.02em;color:#a3a3a3}
.plate{display:block;width:100%;height:auto;overflow:visible}
.plate line,.plate path,.plate rect,.plate circle{vector-effect:non-scaling-stroke}
.pl-r{fill:none;stroke:#6a6a6a;stroke-width:1.4}.pl-fine{stroke:#353535}.pl-fine-l{stroke:#2c2c2c;stroke-width:1.2}
.pl-tick{stroke:#6a6a6a;stroke-width:1.4}.pl-grid{stroke:#1e1e1e;stroke-width:1.2}.pl-line{stroke:#3c3c3c;stroke-width:1.3}
.pl-head{fill:#6a6a6a}.ht{stroke:#4c4c4c;stroke-width:.7}.pl-s{fill:none;stroke:#8c8c8c;stroke-width:1.4}
.pl-m{font-family:Mono;font-size:6px;letter-spacing:.14em;fill:#7a7a7a}.pl-ring{font-size:5.6px;letter-spacing:.22em;fill:#8c8c8c}
.pm{fill:#ededed}.pl-d{fill:none;stroke:#a3a3a3;stroke-width:1.4}.pl-today{stroke:#ededed;stroke-width:1.3;stroke-dasharray:3 4}
.pl-dia,.pl-hit{fill:#ededed}.pl-contour{fill:none;stroke:#444;stroke-width:1.3}.pl-pin{fill:#0a0a0a;stroke:#ededed;stroke-width:1.4}.pl-stamp{fill:#0a0a0a}
`;
const NAMES = { seal: ['III', 'The seal'], triangulation: ['I', 'Triangulation'], record: ['II', 'The record'], broadsheet: ['I', 'The broadsheet'], survey: ['II', 'The survey'], ledger: ['III', 'The ledger'], fan: ['IV', 'The fan'] };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  for (const [page, [eye, title, line, plate]] of Object.entries(CARDS)) {
    const [n, name] = NAMES[plate];
    const html = `<!doctype html><meta charset="utf-8"><style>${CSS}</style><div class="grid"></div><div class="frame"></div>
<div class="brand">${MARK}<span class="wm">REACTION<sup>core</sup></span></div>
<div class="eye">${esc(eye)}</div><h1>${esc(title)}</h1><p>${esc(line)}</p><div class="url">REACTIONCORE.UK</div>
<div class="pl">${PLATES[plate]}</div><div class="cap">Pl. ${n} · <i>${name}</i></div>`;
    await p.setContent(html, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    // a 64-colour palette keeps the card ~25 KB with no visible loss (it is greys and one white)
    const shot = await p.screenshot();
    await require('sharp')(shot).png({ palette: true, colours: 64, compressionLevel: 9 }).toFile(path.join(OUT, `${page}.png`));
    console.log('og', page);
  }
  await b.close();
})();
