// CONTEXT News: an issue of short news, each section made only from its own open, free sources.
// Shared by the server function (api/news.js: reading feeds, thumbnails, summaries) and the page
// (src/views/News.jsx: the issue, PDF and Word). Pure helpers only — tested in scripts/test/news.test.mjs.

/** The sections of an issue and the sources each one is made from (open RSS, no paywall). */
export const SECTIONS = [
  {
    id: 'world', title: 'Світ',
    feeds: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://www.theguardian.com/world/rss',
      'https://www.france24.com/en/rss',
      'https://www.aljazeera.com/xml/rss/all.xml',
    ],
  },
  {
    id: 'ukraine', title: 'Україна',
    feeds: [
      'https://www.ukrinform.ua/rss/block-lastnews',
      'https://suspilne.media/rss/all.rss',
      'https://kyivindependent.com/news-archive/rss/',
      'https://www.pravda.com.ua/rss/view_news/',
    ],
  },
  {
    id: 'analysis', title: 'Аналітика',
    feeds: [
      'https://www.atlanticcouncil.org/feed/',
      'https://www.brookings.edu/feed/',
      'https://www.bruegel.org/rss.xml',
      'https://ecfr.eu/feed/',
    ],
  },
];
export const PER_SECTION = 4;

const unesc = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#8217;/g, "'")
  .replace(/&#8211;|&#8212;/g, '—').replace(/&nbsp;|&#160;/g, ' ');
const plain = (s) => unesc(unesc(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (block, name) => (new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block) || [])[1] || '';
const attr = (block, re) => (re.exec(block) || [])[1] || '';
export const host = (url) => { try { return new URL(url).hostname.replace(/^(www|feeds|rss|news)\./, ''); } catch { return ''; } };
const httpUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(u || '') ? u : '');

/** The thumbnail an item carries: media:thumbnail / media:content / an image enclosure / the first <img>. */
export function itemImage(block) {
  const pick = (u) => httpUrl(unesc(u).trim());
  return pick(attr(block, /<media:thumbnail[^>]*\burl="([^"]+)"/i))
    || pick(attr(block, /<media:content[^>]*\burl="([^"]+)"[^>]*(?:medium="image"|type="image\/)/i))
    || pick(attr(block, /<media:content[^>]*(?:medium="image"|type="image\/)[^>]*\burl="([^"]+)"/i))
    || pick(attr(block, /<enclosure[^>]*\burl="([^"]+)"[^>]*type="image\//i))
    || pick(attr(block, /<enclosure[^>]*type="image\/[^"]*"[^>]*\burl="([^"]+)"/i))
    || pick(attr(unesc(block), /<img[^>]+src="([^"]+)"/i));
}

/** RSS 2.0 / RDF / Atom → [{ title, text, url, domain, at, image }]. */
export function parseNewsFeed(xml) {
  const blocks = String(xml || '').match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) || [];
  return blocks.map((b) => {
    const href = attr(b, /<link[^>]+href="([^"]+)"/i);
    const url = httpUrl(unesc(href || plain(tag(b, 'link')) || plain(tag(b, 'guid'))).trim());
    const when = plain(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'updated') || tag(b, 'published'));
    const t = Date.parse(when);
    const text = plain(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content'));
    return { title: plain(tag(b, 'title')).slice(0, 220), text: text.slice(0, 1200), url, domain: host(url), at: Number.isFinite(t) ? new Date(t).toISOString() : null, image: itemImage(b) };
  }).filter((x) => x.title && x.url);
}

/** The four freshest of a section: the last two days, newest first, each source at most twice, pictures preferred. */
export function pickItems(items, now = Date.now(), n = PER_SECTION) {
  const seen = new Set();
  const fresh = items
    .filter((x) => !x.at || now - Date.parse(x.at) < 2 * 86400000)
    .filter((x) => { const k = x.url.split('?')[0]; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const out = [];
  const per = {};
  for (const pass of [true, false]) {
    for (const x of fresh) {
      if (out.length >= n) break;
      if (out.includes(x) || (pass && !x.image)) continue;
      if ((per[x.domain] || 0) >= 2) continue;
      per[x.domain] = (per[x.domain] || 0) + 1;
      out.push(x);
    }
  }
  return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

/** The page's own preview picture (og:image / twitter:image), for an item whose feed carries none. */
export function pageImage(html) {
  const h = String(html || '').slice(0, 300000);
  return httpUrl(unesc(attr(h, /<meta[^>]+property="og:image(?::url)?"[^>]+content="([^"]+)"/i)
    || attr(h, /<meta[^>]+content="([^"]+)"[^>]+property="og:image(?::url)?"/i)
    || attr(h, /<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i)).trim());
}

/** What the model is asked: a short retelling of each item from its own text only, in Ukrainian. */
export function summaryPrompt(items) {
  return [
    {
      role: 'system',
      content: 'Ти — редактор стислого огляду новин. Для кожної новини напиши українською 2–3 речення: що сталося, де і чому це важливо. '
        + 'Спирайся ЛИШЕ на наданий заголовок і текст — нічого не додавай від себе, не вигадуй цифр, імен чи оцінок. '
        + 'Якщо тексту мало — перекажи заголовок одним реченням. Відповідай лише JSON: {"summaries": ["…", "…"]} — по одному на новину, у тому ж порядку.',
    },
    { role: 'user', content: items.map((x, i) => `${i + 1}. ${x.title}\n${x.text || ''}`.slice(0, 1400)).join('\n\n') },
  ];
}

/** The model's answer → one summary per item; where it gave none, the item's own text, shortened. */
export function readSummaries(raw, items) {
  let list = [];
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const j = typeof raw === 'object' && raw ? raw : JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    list = Array.isArray(j?.summaries) ? j.summaries : [];
  } catch { list = []; }
  return items.map((x, i) => {
    const s = String(list[i] || '').trim();
    if (s.length > 20) return { text: s.slice(0, 600), ai: true };
    const own = (x.text || x.title).replace(/\s+/g, ' ').trim();
    return { text: own.length > 320 ? `${own.slice(0, 320).replace(/\s\S*$/, '')}…` : own, ai: false };
  });
}
