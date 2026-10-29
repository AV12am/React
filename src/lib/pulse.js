// Індекс тривожності — a world «anxiety» line built from open news (GDELT: the tone and the share of
// world coverage about war, conflict, crisis, attacks, sanctions…), with the platform's own forecasts laid
// over it: resolved ones in the past, open ones ahead, and a short extrapolation of the trend.
//
// The index is relative: 50 is the usual level of the last three months, each day is placed by how far its
// tone (more negative = more anxious) and its share of coverage stand from that usual level (z-scores),
// 0–100. It shows the mood of world news, not events themselves.
import { isForecast } from './forecast.js';

export const LEVELS = [
  { id: 'calm', max: 40, label: 'Спокійно', status: 'ok' },
  { id: 'usual', max: 60, label: 'Звичайний рівень', status: 'idle' },
  { id: 'raised', max: 75, label: 'Підвищена тривожність', status: 'warn' },
  { id: 'high', max: 101, label: 'Висока тривожність', status: 'danger' },
];
export const levelOf = (v) => LEVELS.find((l) => v < l.max) || LEVELS.at(-1);

const day = (d) => String(d).slice(0, 8).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) || 1; };

/** GDELT timeline JSON → [{ date: 'YYYY-MM-DD', value }] (one value a day: the mean of that day). */
export function timeline(json) {
  const data = json?.timeline?.[0]?.data || [];
  const by = new Map();
  for (const p of data) {
    const d = day(p.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(+p.value)) continue;
    by.set(d, [...(by.get(d) || []), +p.value]);
  }
  return [...by].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, value: mean(v) }));
}

/** Tone and volume series → the daily index, 0–100 (days present in both). */
export function anxiety(tone, volume) {
  const vol = new Map(volume.map((p) => [p.date, p.value]));
  const days = tone.filter((p) => vol.has(p.date));
  if (days.length < 7) return [];
  const t = days.map((p) => -p.value);
  const v = days.map((p) => vol.get(p.date));
  const [mt, st, mv, sv] = [mean(t), sd(t), mean(v), sd(v)];
  return days.map((p, i) => {
    const z = 0.5 * ((t[i] - mt) / st) + 0.5 * ((v[i] - mv) / sv);
    return { date: p.date, value: Math.max(0, Math.min(100, Math.round((50 + 14 * z) * 10) / 10)) };
  });
}

/**
 * A straight-line continuation of the last two weeks, `days` ahead, with a band that widens with distance:
 * the spread of the recent days around their own line, growing with the horizon. A guide, not a forecast.
 */
export function project(series, days = 14) {
  const last = series.slice(-14);
  if (last.length < 7) return [];
  const xs = last.map((_, i) => i);
  const mx = mean(xs), my = mean(last.map((p) => p.value));
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (last[i].value - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const resid = sd(last.map((p, i) => p.value - (my + slope * (i - mx))));
  const start = new Date(`${series.at(-1).date}T00:00:00Z`);
  return Array.from({ length: days }, (_, k) => {
    const h = k + 1;
    const date = new Date(start.getTime() + h * 86400000).toISOString().slice(0, 10);
    const value = Math.max(0, Math.min(100, my + slope * (last.length - 1 + h - mx)));
    const spread = resid * (1 + h / 7);
    return { date, value, lo: Math.max(0, value - spread), hi: Math.min(100, value + spread) };
  });
}

/**
 * The platform's foresight on the same time line: forecasts (judgments «Прогноз») — open ones at their
 * check date, resolved ones at the date they were resolved — and products at their due date.
 * Only what the person may see.
 */
export function foresight(records, me) {
  const out = [];
  for (const r of records || []) {
    if ((+r.clearance || 0) > me.clearance) continue;
    if (isForecast(r) && (r.resolvedAt || r.due)) {
      const open = !r.outcome || r.outcome === 'Відкрито';
      out.push({ id: r.id, kind: open ? 'risk' : 'resolved', date: String(open ? r.due : (r.resolvedAt || r.due)).slice(0, 10), title: r.statement || 'Прогноз', p: r.probability != null && r.probability !== '' ? +r.probability : null, outcome: open ? null : r.outcome, rec: r });
    } else if (r.col === 'products' && r.due && r.stage !== 'Видано') {
      out.push({ id: r.id, kind: 'due', date: String(r.due).slice(0, 10), title: r.title || 'Продукт', p: null, rec: r });
    }
  }
  return out.filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.date)).sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- GDELT ---------- */

export const QUERY = '(war OR conflict OR crisis OR attack OR sanctions OR terrorism OR recession OR cyberattack OR "state of emergency") sourcelang:english';
export const cleanHeadlines = (list) => (Array.isArray(list) ? list : []).slice(0, 8)
  .map((a) => ({ title: String(a.title || '').slice(0, 200), url: String(a.url || ''), domain: String(a.domain || '').slice(0, 80), country: String(a.sourcecountry || a.country || '').slice(0, 40), at: String(a.seendate || a.at || '').slice(0, 20) }))
  .filter((a) => /^https?:\/\/[^\s]+$/.test(a.url) && a.title);

/* ---------- own measurement: world news feeds ---------- */
// Open RSS of world newsrooms, read by the server: the share of recent items about war, conflict, attacks,
// crises, sanctions… is measured each time and kept per day — the platform's own record, with no limits of
// anyone else's service. It becomes an index once a week of days is collected (z-scores against its own past).

export const FEEDS = [
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://www.aljazeera.com/xml/rss/all.xml',
  'https://rss.dw.com/rdf/rss-en-world',
  'https://www.theguardian.com/world/rss',
  'https://feeds.npr.org/1004/rss.xml',
  'https://www.france24.com/en/rss',
  'https://feeds.skynews.com/feeds/rss/world.xml',
  'https://news.un.org/feed/subscribe/en/news/all/rss.xml',
];
const CRISIS = /\b(war|wars|warfare|conflict|attack(s|ed)?|strike(s)?|air ?strikes?|missile(s)?|drone(s)?|bomb(s|ing|ed)?|explosion|shelling|killed|kills|dead|deaths?|casualt\w*|invasion|invade\w*|troops|military|offensive|sanction(s|ed)?|crisis|crises|terror\w*|hostages?|coup|riots?|clash(es)?|ceasefire|truce|escalat\w*|nuclear|threat(s|en\w*)?|emergency|famine|outbreak|epidemic|pandemic|recession|default|cyber ?attack\w*|hack(ed|ers?)?|evacuat\w*|refugees?|massacre|genocide|insurgen\w*|militants?)\b/i;

const unesc = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const tag = (block, name) => unesc((new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block) || [])[1]);

/** RSS 2.0 / RDF / Atom items → [{ title, text, url, at }]. */
export function parseFeed(xml, source = '') {
  const blocks = String(xml || '').match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) || [];
  return blocks.map((b) => {
    const href = (/<link[^>]+href="([^"]+)"/i.exec(b) || [])[1];
    const url = href || tag(b, 'link') || tag(b, 'guid');
    const when = tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'updated') || tag(b, 'published');
    const t = Date.parse(when);
    return { title: tag(b, 'title').slice(0, 200), text: tag(b, 'description') || tag(b, 'summary'), url, domain: source, at: Number.isFinite(t) ? new Date(t).toISOString() : null };
  }).filter((x) => x.title && /^https?:\/\//.test(x.url || ''));
}

/** Items of the last two days → { share, n, crisis: matching items, newest first }. */
export function crisisShare(items, now = Date.now()) {
  const recent = items.filter((x) => !x.at || now - Date.parse(x.at) < 2 * 86400000);
  const crisis = recent.filter((x) => CRISIS.test(`${x.title} ${x.text}`));
  return { share: recent.length ? crisis.length / recent.length : null, n: recent.length, crisis: crisis.sort((a, b) => String(b.at).localeCompare(String(a.at))) };
}

/** Per-day shares ({ date: { share, n } }) → the own index; a provisional value while fewer than 7 days exist. */
export function ownIndex(days) {
  const list = Object.entries(days || {}).filter(([, d]) => Number.isFinite(d?.share)).sort(([a], [b]) => a.localeCompare(b)).slice(-120);
  if (!list.length) return [];
  if (list.length < 7) {
    // Until a week is collected: a share of about a third of world news is the usual level → 50.
    return list.map(([date, d]) => ({ date, value: Math.max(0, Math.min(100, Math.round((50 + (d.share - 0.33) * 150) * 10) / 10)), provisional: true }));
  }
  const v = list.map(([, d]) => d.share);
  const [m, s] = [mean(v), sd(v)];
  return list.map(([date, d]) => ({ date, value: Math.max(0, Math.min(100, Math.round((50 + 14 * ((d.share - m) / s)) * 10) / 10)) }));
}
