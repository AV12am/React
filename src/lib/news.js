// CONTEXT News: an issue of short news, each section made only from its own open, free sources.
// Shared by the server (api/_news.js: reading feeds, thumbnails, summaries) and the page
// (src/news/NewsPage.jsx: the issue, PDF and Word). Pure helpers only — tested in scripts/test/news.test.mjs.

/** Things that tie a report to the Russian–Ukrainian war — for 5.1 (only these) and 5.2 (none of these). */
export const WAR = /украї|ukrain|росі|russia|kremlin|кремл|путін|putin|зеленськ|zelensk|київ|kyiv|kiev|москв|moscow|донбас|donbas|крим|crimea/i;

/** What each section is about — items that match none of it stay out (a film review is not «infospace»). */
const TOPIC = {
  infospace: /пропаганд|propagand|фейк|fake|дезінформ|дезинформ|disinform|кремл|kremlin|путін|путин|putin|війн|войн|\bwar\b|армі|арми|military|військ|военн|санкц|sanction|репрес|repress|цензур|censor|вибор|выбор|election|дум[аиі]|duma|мобіліз|мобилиз|mobili[sz]|наратив|narrative|telegram|телеграм|z-|zelensk|зеленськ|зеленск|україн|украин|ukrain|окупац|оккупац|occup/i,
  agenda: /росі|росси|russia|kremlin|кремл|путін|путин|putin|китай|china|chinese|xi\b|іран|иран|iran|кндр|north korea|pyongyang|білорус|беларус|belarus|лукашенк|lukashenk|армі|арми|army|військ|военн|military|оборон|defen[cs]e|ракет|missile|санкц|sanction|nuclear|ядерн|nato|нато|окупац|оккупац|occup/i,
  conflicts: /\bwar\b|conflict|fighting|clash|attack|strike|airstrike|shelling|ceasefire|truce|rebel|militia|insurg|troops|army|military|killed|displaced|refugee|humanitarian|hostage|coup|terror|gaza|israel|hamas|hezbollah|lebanon|iran|syria|yemen|houthi|sudan|congo|sahel|mali|somalia|ethiopia|myanmar|taiwan|kashmir|haiti|venezuela|peacekeep|sanction/i,
};
const SOFT = /гороскоп|horoscope|свят[оа] |праздник|церковн|храм|богородиц|релігійн|религиозн|погода|weather|рецепт|recipe|фільм|фильм|\bfilm\b|movie|кіно|кино|серіал|сериал|оскар|oscar|football|футбол|halloween|хелловін|хэллоуин/i;

/**
 * The sections of an issue, in order, and the open, free sources each is made from (RSS, no paywall).
 * part — the chapter heading; title — the subsection (empty when the chapter has none).
 * Section 1 («key») has no sources of its own: it is the day's key news picked from all the others.
 * The aggressor's information space is read through independent and fact-checking outlets that cover it,
 * not by relaying state propaganda.
 */
export const SECTIONS = [
  { id: 'key', code: '1', part: 'РОЗДІЛ 1 | КЛЮЧОВІ НОВИНИ ДОБИ', title: '', en: { part: 'SECTION 1 | KEY NEWS OF THE DAY', title: '' }, key: true, feeds: [] },
  {
    id: 'infospace', code: '2.1', match: TOPIC.infospace, part: 'РОЗДІЛ 2 | СПЕЦОПЕРАЦІЇ ТА АКТУАЛЬНІ ПОДІЇ', title: '2.1 ІНФОПРОСТІР КРАЇНИ-АГРЕСОРА',
    en: { part: 'SECTION 2 | SPECIAL OPERATIONS AND CURRENT EVENTS', title: '2.1 THE AGGRESSOR STATE’S INFORMATION SPACE' },
    about: 'інформаційний простір Росії: пропаганда, дезінформація, наративи й заяви кремлівських ЗМІ та посадовців, цензура, тиск на незалежні медіа',
    feeds: [
      'https://lenta.ru/rss/news',
      'https://meduza.io/rss/all',
      'https://www.themoscowtimes.com/rss/news',
      'https://www.stopfake.org/uk/feed/',
      'https://euvsdisinfo.eu/feed/',
      'https://cpd.gov.ua/feed/',
    ],
  },
  {
    id: 'media', code: '2.2', part: 'РОЗДІЛ 2 | СПЕЦОПЕРАЦІЇ ТА АКТУАЛЬНІ ПОДІЇ', title: '2.2 УКРАЇНСЬКІ ТА СВІТОВІ ЗМІ',
    en: { part: 'SECTION 2 | SPECIAL OPERATIONS AND CURRENT EVENTS', title: '2.2 UKRAINIAN AND WORLD MEDIA' },
    about: 'поточні події війни за повідомленнями українських і світових ЗМІ: удари, бойові дії, спецоперації, ураження об’єктів у Росії, евакуації, полонені',
    feeds: [
      'https://www.ukrinform.ua/rss/block-lastnews',
      'https://suspilne.media/rss/all.rss',
      'https://feeds.bbci.co.uk/ukrainian/rss.xml',
      'https://kyivindependent.com/news-archive/rss/',
      'https://www.pravda.com.ua/rss/view_news/',
      'https://mil.in.ua/uk/feed/',
      'https://www.theguardian.com/world/ukraine/rss',
    ],
  },
  {
    id: 'agenda', code: '3', match: TOPIC.agenda, first: true, part: 'РОЗДІЛ 3 | ВІЙСЬКОВО-ПОЛІТИЧНА АДЖЕНДА КРАЇНИ-АГРЕСОРА ТА САТЕЛІТІВ', title: '',
    en: { part: 'SECTION 3 | MILITARY AND POLITICAL AGENDA OF THE AGGRESSOR STATE AND ITS SATELLITES', title: '' },
    about: 'військово-політичний порядок денний Росії та її союзників (Білорусь, Іран, КНДР, Китай): армія, оборонна промисловість, військова співпраця, санкції, ядерна риторика, рішення Кремля',
    feeds: [
      'https://jamestown.org/feed/',
      'https://lenta.ru/rss/news',
      'https://mil.in.ua/uk/feed/',
      'https://feeds.bbci.co.uk/russian/rss.xml',
      'https://www.understandingwar.org/rss.xml',
      'https://belsat.eu/en/feed',
      'https://www.rferl.org/api/zrqiteuuir',
      'https://www.themoscowtimes.com/rss/news',
    ],
  },
  {
    id: 'society', code: '4.1', part: 'РОЗДІЛ 4 | ОГЛЯД ВІЙСЬКОВО-ПОЛІТИЧНИХ ПОДІЙ В УКРАЇНІ', title: '4.1 СУСПІЛЬНО-ПОЛІТИЧНІ ПОДІЇ',
    en: { part: 'SECTION 4 | MILITARY AND POLITICAL EVENTS IN UKRAINE', title: '4.1 SOCIAL AND POLITICAL EVENTS' },
    about: 'суспільно-політичне життя України: Президент, Верховна Рада, уряд, реформи, антикорупція, енергетика, економіка, соціальні рішення, дипломатія України',
    feeds: [
      'https://www.pravda.com.ua/rss/view_news/',
      'https://lb.ua/rss/ukr/news.xml',
      'https://www.ukrinform.ua/rss/rubric-polytics',
      'https://suspilne.media/rss/all.rss',
      'https://zn.ua/rss/full.rss',
    ],
  },
  {
    id: 'defence', code: '4.2', part: 'РОЗДІЛ 4 | ОГЛЯД ВІЙСЬКОВО-ПОЛІТИЧНИХ ПОДІЙ В УКРАЇНІ', title: '4.2 ОіВТ ТА ПІДТРИМКА СИЛ ОБОРОНИ УКРАЇНИ',
    en: { part: 'SECTION 4 | MILITARY AND POLITICAL EVENTS IN UKRAINE', title: '4.2 WEAPONS, MILITARY EQUIPMENT AND SUPPORT FOR UKRAINE’S DEFENCE FORCES' },
    about: 'озброєння і військова техніка та підтримка Сил оборони України: постачання зброї, пакети допомоги, оборонне виробництво, нові системи, навчання військових',
    feeds: [
      'https://mil.in.ua/uk/feed/',
      'https://armyinform.com.ua/feed/',
      'https://defence-ua.com/rss/feed.xml',
      'https://breakingdefense.com/feed/',
      'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml',
    ],
  },
  {
    id: 'abroad-war', code: '5.1', part: 'РОЗДІЛ 5 | ОГЛЯД ЗАКОРДОННИХ ЗМІ', title: '5.1 ІЗ ВПЛИВОМ НА РОСІЙСЬКО-УКРАЇНСЬКУ ВІЙНУ', match: WAR,
    en: { part: 'SECTION 5 | FOREIGN MEDIA REVIEW', title: '5.1 AFFECTING THE RUSSIAN-UKRAINIAN WAR' },
    about: 'закордонні ЗМІ про те, що впливає на війну: позиції інших держав, переговори, санкції, політика США та ЄС щодо України й Росії',
    feeds: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://www.politico.eu/feed/',
      'https://rss.dw.com/rdf/rss-en-world',
      'https://www.france24.com/en/europe/rss',
      'https://www.euronews.com/rss?level=theme&name=news',
    ],
  },
  {
    id: 'abroad-other', code: '5.2', part: 'РОЗДІЛ 5 | ОГЛЯД ЗАКОРДОННИХ ЗМІ', title: '5.2 ІНШІ МІЖНАРОДНІ КОНФЛІКТИ', skip: WAR, match: TOPIC.conflicts,
    en: { part: 'SECTION 5 | FOREIGN MEDIA REVIEW', title: '5.2 OTHER INTERNATIONAL CONFLICTS' },
    about: 'інші збройні конфлікти й кризи у світі, не пов’язані з Україною та Росією: Близький Схід, Африка, Азія, Латинська Америка',
    feeds: [
      'https://www.aljazeera.com/xml/rss/all.xml',
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml',
      'https://www.france24.com/en/rss',
      'https://www.crisisgroup.org/rss',
    ],
  },
];
/** The verified outlets of a section: the sites of its own feeds. A news goes only into a section whose list
 * holds its outlet (the key news may come from any section's list). */
export function outlets(id) {
  const s = SECTIONS.find((x) => x.id === id);
  return new Set((s?.feeds || []).map(host));
}

/** Candidates read per section; the page then holds four or five of them (fitItems). */
export const PER_SECTION = 5;
/** Fresh news read from each section's feeds before the editor sorts them. */
export const POOL = 20;
/** Light news (holidays, films, horoscopes, sport) — kept out of every section. */
export const offTopic = (x) => SOFT.test(x.title || '')
  || /^(захищено|protected|private)\s*:/i.test(x.title || '') // a password-protected post has no text to retell
  || /\/(commentisfree|opinions?|podcasts?|videos?|live)\//i.test(x.url || '') // columns, podcasts, videos, live pages: not news
  || !/[a-zа-яіїєґё]{3}/i.test(x.title || ''); // headlines in scripts the issue does not carry (Arabic, Chinese …)
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

/** The editor's question for one section: which of these news are plainly about its topic. */
export function keepPrompt(section, items) {
  return [
    {
      role: 'system',
      content: `Ти — випусковий редактор щоденного огляду новин. Розділ огляду: «${[section.part, section.title].filter(Boolean).join(' ')}». `
        + `Тема розділу: ${section.about}.\n`
        + 'Для кожної новини нижче визнач, чи вона стосується теми розділу (1) чи ні (0). '
        + 'Культура, спорт, розваги, побут, свята, внутрішня політика чи економіка інших країн без зв’язку з темою — 0. '
        + `Відповідай лише JSON без пояснень, з відповіддю для кожного номера від 1 до ${items.length}: {"keep": {"1": 1, "2": 0, …}}`,
    },
    { role: 'user', content: items.map((x, i) => `${i + 1}. ${x.title} — ${String(x.text || '').slice(0, 160)}`).join('\n') },
  ];
}
const parseJson = (raw) => {
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return typeof raw === 'object' && raw ? raw : JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
};
/** → [true | false | undefined (no answer)], or null when unreadable. */
export function readKeep(raw, items) {
  let j;
  try { j = parseJson(raw); } catch { return null; }
  const k = j?.keep;
  const at = Array.isArray(k) ? (i) => k[i] : k && typeof k === 'object' ? (i) => k[String(i + 1)] : null;
  if (!at || items.filter((_, i) => at(i) != null).length < items.length * 0.8) return null;
  return items.map((_, i) => { const v = at(i); return v == null ? undefined : v === true || v === 1 || v === '1' || /^(yes|так|true)$/i.test(String(v)); });
}

/** The editor's look at all headlines together: which tell the same event, and the day's key news. */
export function eventsPrompt(items, n = KEY_COUNT) {
  return [
    {
      role: 'system',
      content: 'Ти — випусковий редактор. Нижче заголовки новин з різних джерел і різними мовами. '
        + 'Знайди групи заголовків про ту саму подію (той самий факт, рішення, удар, заяву). '
        + `Також обери ${n} найважливіших для читача в Україні новин доби — про різні події. `
        + 'Відповідай лише JSON без пояснень: {"same": [[1, 4], [2, 9, 13]], "key": [номери від найважливішої]}',
    },
    { role: 'user', content: items.map((x, i) => `${i + 1}. ${x.title}`).join('\n') },
  ];
}
/** → { groups: [[indices]], key: [indices] }, or null when unreadable. */
export function readEvents(raw, items) {
  let j;
  try { j = parseJson(raw); } catch { return null; }
  const ok = (v) => Number.isInteger(v) && v >= 0 && v < items.length;
  const groups = (Array.isArray(j?.same) ? j.same : []).map((g) => (Array.isArray(g) ? g : []).map((v) => Number(v) - 1).filter(ok)).filter((g) => g.length > 1);
  const key = (Array.isArray(j?.key) ? j.key : []).map((v) => Number(v) - 1).filter(ok);
  return { groups, key };
}

// Same event without the model: two headlines that share two telling words (the word's first consonants,
// Cyrillic read as Latin, so «Олешки» meets «Oleshky»), or a number and a telling word. Words found in many headlines
// («Україна», «Росія») tell nothing and are left out.
const LAT = { а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', є: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'iu', я: 'ia' };
const STOP = new Set(['about', 'after', 'their', 'there', 'which', 'would', 'could', 'should', 'these', 'those', 'where', 'while', 'under', 'over', 'says', 'said', 'will', 'with', 'from', 'that', 'this', 'have', 'pisli', 'ponad', 'cherez', 'iakii', 'iakyi', 'takozh', 'mozhe', 'budut', 'bude', 'shchodo', 'pochn', 'zaiav', 'zaiai', 'novyn', 'novos', 'news', 'world', 'ukrai', 'russi', 'rosii', 'rossi', 'rosiis', 'kyiv', 'kiev', 'moskv', 'moscow']);
// Each telling word as two keys — its first five letters and its first consonants — so «evacuated» meets
// «евакуйовані» by the letters and «Oleshky» meets «Алешек» by the consonants.
function words(title) {
  const t = String(title || '').toLowerCase().replace(/[а-яёіїєґ]/g, (c) => LAT[c] ?? c).replace(/c/g, 'k').replace(/y/g, 'i');
  const out = [];
  for (const w of t.split(/[^a-z0-9]+/)) {
    if (/^\d{2,}$/.test(w) && !/^20\d\d$/.test(w)) out.push([`#${w}`]);
    else if (w.length >= 5 && !STOP.has(w.slice(0, 5)) && !STOP.has(w)) {
      const k = w.replace(/[aeiou]/g, '').replace(/(.)\1+/g, '$1').slice(0, 4);
      out.push(k.length >= 3 ? [w.slice(0, 5), `~${k}`] : [w.slice(0, 5)]);
    }
  }
  return out;
}
export function sameEvents(items) {
  const ws = items.map((x) => words(x.title));
  const df = new Map();
  ws.forEach((list) => new Set(list.flat()).forEach((key) => df.set(key, (df.get(key) || 0) + 1)));
  const common = Math.max(8, items.length * 0.15);
  const tell = ws.map((list) => list.map((keys) => keys.filter((key) => df.get(key) <= common)).filter((keys) => keys.length));
  const parent = items.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let k = i + 1; k < items.length; k++) {
      // Word to word, each word of the other headline used once («операції» and «порятунку» must not both
      // lean on «operation»).
      const free = tell[k].map((keys) => new Set(keys));
      let shared = 0;
      for (const keys of tell[i]) {
        const at = free.findIndex((f) => f && keys.some((key) => f.has(key)));
        if (at >= 0) { free[at] = null; shared++; }
      }
      if (shared >= 2) parent[root(k)] = root(i);
    }
  }
  const g = new Map();
  items.forEach((_, i) => { const r = root(i); g.set(r, [...(g.get(r) || []), i]); });
  return [...g.values()].filter((x) => x.length > 1);
}
/** How many telling words two headlines share (each word of the second used once). */
export function sharedWords(a, b, { numbers = true } = {}) {
  const pick = (t) => words(t).filter((keys) => numbers || !keys[0].startsWith('#'));
  const free = pick(b.title).map((keys) => new Set(keys));
  let n = 0;
  for (const keys of pick(a.title)) {
    const at = free.findIndex((f) => f && keys.some((key) => f.has(key)));
    if (at >= 0) { free[at] = null; n++; }
  }
  return n;
}
/** The editor's same-event groups, trusted pair by pair only where the headlines share a telling word (not a bare number) —
 * a model that lumps unrelated news together must not empty a section. */
export function checkGroups(items, groups) {
  const out = [];
  for (const g of groups) {
    for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) {
      if (sharedWords(items[g[a]], items[g[b]], { numbers: false }) >= 1) out.push([g[a], g[b]]);
    }
  }
  return out;
}

/** One news per event: from each group the pictured one, then the freshest, stays. */
export function dropRepeats(items, groups) {
  const parent = items.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (const g of groups) for (const k of g.slice(1)) parent[root(k)] = root(g[0]);
  const by = new Map();
  items.forEach((_, i) => { const r = root(i); by.set(r, [...(by.get(r) || []), i]); });
  const drop = new Set();
  for (const g of by.values()) {
    if (g.length < 2) continue;
    const keep = [...g].sort((a, b) => Number(Boolean(items[b].image)) - Number(Boolean(items[a].image)) || String(items[b].at || '').localeCompare(String(items[a].at || '')))[0];
    g.forEach((k) => { if (k !== keep) drop.add(k); });
  }
  return { drop, root };
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
const httpUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(u || '') && !/\/emoji\/|s\.w\.org\/images|pixel|spacer|1x1/i.test(u) ? u : '');

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

/** The freshest of a section: the last two days, newest first, each source at most `cap` times, pictures preferred. */
export function pickItems(items, now = Date.now(), n = PER_SECTION, cap = 4) {
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
      if ((per[x.domain] || 0) >= cap) continue;
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
      content: 'Ти — редактор стислого огляду новин. Для кожної новини напиши українською рівно 2 або 3 повні речення (до 450 знаків): що сталося, де і чому це важливо. '
        + 'Спирайся ЛИШЕ на наданий заголовок і текст — нічого не додавай від себе, не вигадуй цифр, імен чи оцінок. '
        + 'Пиши лише українською (імена й назви — українською транслітерацією). Без порожніх фраз на кшталт «Це важливо, оскільки…» чи «Це сталося в …» — '
        + 'пояснюй значення лише тоді, коли воно є в тексті. Кожне речення — нова інформація, без повторів сказаного. Відповідай лише JSON: {"summaries": ["…", "…"]} — по одному на новину, у тому ж порядку.',
    },
    { role: 'user', content: items.map((x, i) => `${i + 1}. ${RU_STATE.has(x.outlet) ? '[російське провладне ЗМІ — перекажи як твердження: «Російські ЗМІ повідомляють, що…» / «За версією російських ЗМІ…», не як факт] ' : ''}${x.title}\n${x.text || ''}`.slice(0, 1400)).join('\n\n') },
  ];
}

/** The English issue is the Ukrainian one translated — sentence for sentence, nothing added or left out. */
export function translatePrompt(texts) {
  return [
    {
      role: 'system',
      content: 'Translate each Ukrainian text into English faithfully, sentence for sentence: keep the same number of sentences, add nothing, leave nothing out. '
        + 'Use the usual English spelling of names and places (Kyiv, Kharkiv, Oleshky). For each text also give a 2–4 word English query for a news photo of its subject (a place, person or object). '
        + 'Answer with JSON only: {"t": ["…"], "q": ["…"]} — one per text, in the same order.',
    },
    { role: 'user', content: texts.map((t, i) => `${i + 1}. ${t}`).join('\n\n') },
  ];
}
/** → { t: [English text | ''], q: [query | ''] }. */
export function readTranslations(raw, texts) {
  let j = {};
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    j = typeof raw === 'object' && raw ? raw : JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  } catch { j = {}; }
  const t = texts.map((_, i) => shape(String(j?.t?.[i] || '').replace(/[Ѐ-ӿ⺀-鿿]+/g, (m) => (m.length > 2 ? m : '')).trim()).text);
  const q = texts.map((_, i) => String(j?.q?.[i] || '').replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60));
  return { t, q };
}

/** Russian pro-government outlets: read only to show the aggressor's own agenda — their news is retold as what
 * Russian media claim, never as fact. */
export const RU_STATE = new Set(['lenta.ru']);

/** Ukrainian text: Cyrillic, with no letters only Russian has. A summary in another language never stands
 * in for a Ukrainian one. */
export const isUkrainian = (t) => /[а-яіїєґ]{3}/i.test(t || '') && !/[ыэъё]/i.test(t || '') && (t.match(/[a-z]/gi) || []).length < String(t).length * 0.3;

/** Sentences of a summary — split after . ! ? … before a capital letter or a quote. */
export function sentences(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+(?=[«"„(]?[A-ZА-ЯІЇЄҐ])/u).filter(Boolean);
}
/** A summary is two or three sentences: more are cut to three, an unfinished last one is left out;
 * `n` tells how many it has. */
export function shape(text) {
  const list = sentences(text);
  if (list.length > 1 && (!/[.!?…»"')]$/.test(list.at(-1)) || /(\.\.\.|…)$/.test(list.at(-1)))) list.pop(); // unfinished or cut off with «…»
  return { text: list.slice(0, 3).join(' '), n: Math.min(list.length, 3) };
}

/** The model's answer → one summary per item; where it gave none, the item's own text, shortened. */
export function readSummaries(raw, items) {
  let list = [];
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const j = typeof raw === 'object' && raw ? raw : JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    list = Array.isArray(j?.summaries) ? j.summaries : [];
  } catch {
    // A reply cut off at the length limit: keep the summaries it finished.
    const tail = String(raw || '').split(/"summaries"\s*:\s*\[/)[1] || '';
    list = [...tail.matchAll(/"((?:[^"\\]|\\.)*)"\s*[,\]]/g)].map((m) => { try { return JSON.parse(`"${m[1]}"`); } catch { return ''; } });
  }
  return items.map((x, i) => {
    const s = String(list[i] || '')
      .replace(/[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3000-\u303F]+/g, '') // stray CJK the model sometimes slips in
      .replace(/\s*Це (важливо|сталося)[^.]*?(оскільки це|в [А-ЯІЇЄҐ][^.,]*)\.(?=\s|$)/g, '')
      .replace(/\s+/g, ' ').trim();
    if (s.length > 20 && isUkrainian(s)) return { ...shape(s), ai: true };
    const own = shape((x.text || x.title).replace(/\s+/g, ' ').trim());
    if (!isUkrainian(own.text)) return { text: own.text, n: 0, ai: false }; // not Ukrainian: not shown
    return { ...own, text: own.text.length > 420 ? `${own.text.slice(0, 420).replace(/\s\S*$/, '')}…` : own.text, ai: false };
  });
}

// ── The night's air-defence reports that open 2.1 and 2.2 ───────────────────────────────────────────────
// 2.1 opens with what the Russian defence ministry claims its air defence shot down overnight; 2.2 with the
// Ukrainian Air Force's report of the night's attack. Both are official statements published every
// morning and carried by the media; the issue takes the day's own report from the feeds it already reads.
// The model only lifts the numbers (and, for 2.1, the regions) out of the report; the text is the fixed
// wording below, so every issue says it the same way, and a report whose numbers cannot be read is left out.

const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
/** The Kyiv calendar day of a moment: «31 жовтня». */
export function kyivDay(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { day: +p.day, month: +p.month, year: +p.year, text: `${+p.day} ${MONTHS[+p.month - 1]}` };
}

export const REPORTS = {
  // The Ukrainian Air Force's morning report, as Ukrainian outlets carry it.
  ua: /(ППО|Повітрян\S* сил|протиповітрян\S* оборон)[^]*?(збил|збито|знешкод|подавл|нейтраліз)|(ворог|противник|росія|рф)[^]*?атакува\S*[^]*?(дрон|БпЛА|ракет)|збил\S* \d+ (з|із) \d+/i,
  // The Russian defence ministry's morning claim, as Russian-language and foreign outlets carry it.
  ru: /(ПВО|перехвач\S*|уничтож\S*|сбит\S*|сбил\S*)[^]*?(беспилотн|БПЛА|дрон)|(беспилотн|БПЛА|дрон)\S*[^]*?(перехвач|уничтож|сбит|сбил)|(Russia|Russian)[^]*?(downed|intercept\S*|shot down|destroyed)[^]*?(drone|UAV)/i,
};
const RU_SIDE = /Минобороны|МО РФ|ПВО|над (территори|регион)|Russia(n)? (says|claims|defen[cs]e ministry|air defen[cs]e)|над рос/i;

/** The day's report for a side: published since midnight in Kyiv, with numbers in its headline or text. */
export function findReport(items, side, now = Date.now()) {
  const today = kyivDay(now);
  const re = REPORTS[side];
  const fit = items.filter((x) => {
    if (!x.at) return false;
    const d = kyivDay(Date.parse(x.at));
    if (d.day !== today.day || d.month !== today.month || Date.parse(x.at) > now) return false;
    const t = `${x.title} ${x.text || ''}`;
    if (!re.test(x.title) || !/\d{2,}/.test(t)) return false;
    return side === 'ru' ? RU_SIDE.test(t) && !/Повітрян\S* сил/i.test(t) : /[іїєґ]/i.test(x.title);
  });
  // The earliest of the day's reports is the morning one; later items are follow-ups and corrections.
  return fit.sort((a, b) => String(a.at).localeCompare(String(b.at)))[0] || null;
}

/** What the model is asked: the numbers of the report, nothing else. */
export function reportPrompt(side, text) {
  const ask = side === 'ua'
    ? 'Це ранковий звіт Повітряних сил ЗСУ про нічну атаку. Випиши з тексту лише числа. Відповідай лише JSON: '
      + '{"ballistic": кількість балістичних ракет або 0, "cruise": кількість крилатих і інших ракет або 0, '
      + '"drones": скільки всього ударних БпЛА (Shahed, Гербера, імітаторів) запустив противник, "jet": скільки з них реактивних або null, '
      + '"downed": скільки БпЛА збито/подавлено, "downedJet": скільки з них реактивних або null, "time": "станом на" — час у форматі 09:00 або null}. '
      + 'Якщо числа в тексті немає — null. Нічого не вигадуй.'
    : 'Це заява Міноборони РФ про перехоплені за ніч безпілотники. Відповідай лише JSON: '
      + '{"count": кількість перехоплених і знищених безпілотників (число з тексту), '
      + '"regions": перелік регіонів і акваторій із тексту українською в родовому відмінку одним рядком, наприклад: '
      + '«Новгородської, Тверської, Бєлгородської областей, Краснодарського краю, ТОТ Автономної Республіки Крим та над акваторією Чорного моря» '
      + '(Крим — завжди «ТОТ Автономної Республіки Крим»; якщо регіонів у тексті немає — null)}. Нічого не вигадуй.';
  return [{ role: 'system', content: ask }, { role: 'user', content: String(text || '').slice(0, 3500) }];
}

const num = (v) => (Number.isInteger(+v) && +v > 0 ? +v : 0);
/** The model's numbers → the report's fixed wording, or '' when the numbers are not there. */
export function composeReport(side, raw, at) {
  let j;
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    j = typeof raw === 'object' && raw ? raw : JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  } catch { return ''; }
  if (side === 'ru') {
    const n = num(j?.count);
    const regions = String(j?.regions || '').replace(/\s+/g, ' ').trim().replace(/[.;]+$/, '');
    // Ukrainian forms only («Брянської області», not «Брянской области»).
    if (!n || !/[а-яіїєґ]{4}/i.test(regions) || /[ыэъё]|област[иь](?![а-яіїєґ])|ской(?![а-яіїєґ])|(?<![а-яіїєґ])края(?![а-яіїєґ])/i.test(regions) || regions.length > 600) return '';
    return `Протягом минулої ночі черговими силами ППО рф було перехоплено та знищено ${n} українських безпілотних літальних апаратів літакового типу над територіями ${regions}.`;
  }
  const drones = num(j?.drones);
  const downed = num(j?.downed);
  if (!drones || !downed || downed > drones + 100) return '';
  const jet = num(j?.jet);
  const downedJet = num(j?.downedJet);
  const time = /^\d{1,2}:\d{2}$/.test(String(j?.time || '')) ? String(j.time).padStart(5, '0') : '09:00';
  const parts = [];
  if (num(j?.ballistic)) parts.push(`${num(j.ballistic)} балістичними ракетами`);
  if (num(j?.cruise)) parts.push(`${num(j.cruise)} крилатими ракетами`);
  const uav = `${drones} ударними БпЛА типу Shahed${jet ? ` (${jet} із них — реактивні)` : ''}, Гербера, дронами-імітаторами типу «Пародія»`;
  const attack = parts.length ? `${parts.join(', ')} та ${uav}` : uav;
  return `У ніч на ${kyivDay(Date.parse(at)).text} противник атакував ${attack}. `
    + `За попередніми даними, станом на ${time}, протиповітряною обороною збито/подавлено ${downed} ворожих БпЛА типу Shahed${downedJet ? ` (${downedJet} із них — реактивні)` : ''}, Гербера та дронів інших типів.`;
}
