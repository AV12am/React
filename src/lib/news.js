// CONTEXT News: an issue of short news, each section made only from its own open, free sources.
// Shared by the server (api/_news.js: reading feeds, thumbnails, summaries) and the page
// (src/news/NewsPage.jsx: the issue, PDF and Word). Pure helpers only — tested in scripts/test/news.test.mjs.

/** Things that tie a report to the Russian–Ukrainian war — for 5.1 (only these) and 5.2 (none of these). */
export const WAR = /украї|ukrain|росі|russia|kremlin|кремл|путін|putin|зеленськ|zelensk|київ|kyiv|kiev|москв|moscow|донбас|donbas|крим|crimea/i;

/**
 * The sections of an issue, in order, and the open, free sources each is made from (RSS, no paywall).
 * part — the chapter heading; title — the subsection (empty when the chapter has none).
 * Section 1 («key») has no sources of its own: it is the day's key news picked from all the others.
 * The aggressor's information space is read through independent and fact-checking outlets that cover it,
 * not by relaying state propaganda.
 */
export const SECTIONS = [
  { id: 'key', part: 'РОЗДІЛ 1 | КЛЮЧОВІ НОВИНИ ДОБИ', title: '', key: true, feeds: [] },
  {
    id: 'infospace', part: 'РОЗДІЛ 2 | СПЕЦОПЕРАЦІЇ ТА АКТУАЛЬНІ ПОДІЇ', title: '2.1 ІНФОПРОСТІР КРАЇНИ-АГРЕСОРА',
    feeds: [
      'https://meduza.io/rss/all',
      'https://www.themoscowtimes.com/rss/news',
      'https://www.stopfake.org/uk/feed/',
      'https://euvsdisinfo.eu/feed/',
      'https://cpd.gov.ua/feed/',
    ],
  },
  {
    id: 'media', part: 'РОЗДІЛ 2 | СПЕЦОПЕРАЦІЇ ТА АКТУАЛЬНІ ПОДІЇ', title: '2.2 УКРАЇНСЬКІ ТА СВІТОВІ ЗМІ',
    feeds: [
      'https://www.ukrinform.ua/rss/block-lastnews',
      'https://suspilne.media/rss/all.rss',
      'https://feeds.bbci.co.uk/ukrainian/rss.xml',
      'https://kyivindependent.com/news-archive/rss/',
      'https://www.theguardian.com/world/ukraine/rss',
    ],
  },
  {
    id: 'agenda', part: 'РОЗДІЛ 3 | ВІЙСЬКОВО-ПОЛІТИЧНА АДЖЕНДА КРАЇНИ-АГРЕСОРА ТА САТЕЛІТІВ', title: '',
    feeds: [
      'https://www.understandingwar.org/rss.xml',
      'https://jamestown.org/feed/',
      'https://belsat.eu/en/feed',
      'https://www.rferl.org/api/zrqiteuuir',
      'https://www.themoscowtimes.com/rss/news',
    ],
  },
  {
    id: 'society', part: 'РОЗДІЛ 4 | ОГЛЯД ВІЙСЬКОВО-ПОЛІТИЧНИХ ПОДІЙ В УКРАЇНІ', title: '4.1 СУСПІЛЬНО-ПОЛІТИЧНІ ПОДІЇ',
    feeds: [
      'https://www.pravda.com.ua/rss/view_news/',
      'https://lb.ua/rss/ukr/news.xml',
      'https://www.ukrinform.ua/rss/rubric-polytics',
      'https://suspilne.media/rss/all.rss',
      'https://zn.ua/rss/full.rss',
    ],
  },
  {
    id: 'defence', part: 'РОЗДІЛ 4 | ОГЛЯД ВІЙСЬКОВО-ПОЛІТИЧНИХ ПОДІЙ В УКРАЇНІ', title: '4.2 ОіВТ ТА ПІДТРИМКА СИЛ ОБОРОНИ УКРАЇНИ',
    feeds: [
      'https://mil.in.ua/uk/feed/',
      'https://armyinform.com.ua/feed/',
      'https://defence-ua.com/rss/feed.xml',
      'https://breakingdefense.com/feed/',
      'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml',
    ],
  },
  {
    id: 'abroad-war', part: 'РОЗДІЛ 5 | ОГЛЯД ЗАКОРДОННИХ ЗМІ', title: '5.1 ІЗ ВПЛИВОМ НА РОСІЙСЬКО-УКРАЇНСЬКУ ВІЙНУ', match: WAR,
    feeds: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://www.politico.eu/feed/',
      'https://rss.dw.com/rdf/rss-en-world',
      'https://www.france24.com/en/europe/rss',
      'https://www.euronews.com/rss?level=theme&name=news',
    ],
  },
  {
    id: 'abroad-other', part: 'РОЗДІЛ 5 | ОГЛЯД ЗАКОРДОННИХ ЗМІ', title: '5.2 ІНШІ МІЖНАРОДНІ КОНФЛІКТИ', skip: WAR,
    feeds: [
      'https://www.aljazeera.com/xml/rss/all.xml',
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml',
      'https://www.france24.com/en/rss',
      'https://www.crisisgroup.org/rss',
    ],
  },
];
/** Candidates read per section; the page then holds four or five of them (fitItems). */
export const PER_SECTION = 6;
export const KEY_COUNT = 5;

/** The time the current issue belongs to: the latest 17:00 in Kyiv at or before `now`. */
export function issueTime(now = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offset = local - Math.floor(now / 1000) * 1000; // Kyiv minus UTC
  const day = Date.UTC(+p.year, +p.month - 1, +p.day, 17, 0, 0) - (+p.hour < 17 ? 86400000 : 0);
  return day - offset;
}

/** How much of an A4 page a row takes in the PDF (src/lib/newsExport.js) — the page, PDF and Word show the same rows. */
export const PAGE = { budget: 650, perLine: 54, line: 15, pic: 112, gap: 16 };
const rowHeight = (x) => Math.max(PAGE.pic, Math.ceil(String(x.summary || '').length / PAGE.perLine) * PAGE.line) + PAGE.gap;
/** Four news always; a fifth only when it still fits on the section's page. */
export function fitItems(items, min = 4, max = 5) {
  const out = [];
  let used = 0;
  for (const x of items) {
    if (out.length >= max) break;
    const h = rowHeight(x);
    if (out.length >= min && used + h > PAGE.budget) break;
    out.push(x); used += h;
  }
  return out;
}

/** What the model is asked when choosing the day's key news from the headlines of all sections. */
export function keyPrompt(items, n = KEY_COUNT) {
  return [
    {
      role: 'system',
      content: `Ти — випусковий редактор. З поданого списку обери ${n} найважливіших новин доби для читача в Україні: `
        + 'війна, безпека, політика, міжнародна підтримка. Не обирай дві новини про ту саму подію. '
        + `Відповідай лише JSON: {"pick": [номери]} — ${n} номерів зі списку, від найважливішої.`,
    },
    { role: 'user', content: items.map((x, i) => `${i + 1}. ${x.title}`).join('\n') },
  ];
}
/** The model's choice → indices into items; where it gave too few, the first news of each section in turn. */
export function readPick(raw, items, n = KEY_COUNT, fallback = []) {
  let list = [];
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const j = typeof raw === 'object' && raw ? raw : JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    list = Array.isArray(j?.pick) ? j.pick : [];
  } catch { list = []; }
  const out = [];
  for (const k of [...list.map((v) => Number(v) - 1), ...fallback]) {
    if (out.length >= n) break;
    if (Number.isInteger(k) && k >= 0 && k < items.length && !out.includes(k)) out.push(k);
  }
  return out;
}

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

/** The freshest of a section: the last two days, newest first, each source at most twice, pictures preferred. */
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
      content: 'Ти — редактор стислого огляду новин. Для кожної новини напиши українською 2–3 речення (до 450 знаків): що сталося, де і чому це важливо. '
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
    if (s.length > 20) return { text: s.length > 560 ? `${s.slice(0, 560).replace(/\s\S*$/, '')}…` : s, ai: true };
    const own = (x.text || x.title).replace(/\s+/g, ' ').trim();
    return { text: own.length > 320 ? `${own.slice(0, 320).replace(/\s\S*$/, '')}…` : own, ai: false };
  });
}
