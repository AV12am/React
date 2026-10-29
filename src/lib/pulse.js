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
const GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function askGdelt(params, headers = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GDELT}?${new URLSearchParams({ query: QUERY, format: 'json', ...params })}`, { headers });
    const text = await res.text();
    // GDELT allows one request every five seconds per address: wait and ask once more.
    if ((res.status === 429 || /limit requests/i.test(text)) && attempt < 1) { await wait(6000); continue; }
    if (!res.ok) throw new Error(`GDELT ${res.status}`);
    try { return JSON.parse(text); } catch { throw new Error(`GDELT: ${text.slice(0, 120)}`); }
  }
}

/** The index and the day's articles from GDELT: three questions, five seconds apart. */
export async function fetchPulse(headers = {}) {
  const tone = timeline(await askGdelt({ mode: 'timelinetone', timespan: '3months', TIMELINESMOOTH: '3' }, headers));
  await wait(5500);
  const volume = timeline(await askGdelt({ mode: 'timelinevol', timespan: '3months', TIMELINESMOOTH: '3' }, headers));
  await wait(5500);
  const arts = await askGdelt({ mode: 'artlist', timespan: '24h', maxrecords: '8', sort: 'hybridrel' }, headers).catch(() => ({}));
  return { at: new Date().toISOString(), index: anxiety(tone, volume), headlines: cleanHeadlines(arts.articles), source: 'GDELT Project' };
}

export const cleanHeadlines = (list) => (Array.isArray(list) ? list : []).slice(0, 8)
  .map((a) => ({ title: String(a.title || '').slice(0, 200), url: String(a.url || ''), domain: String(a.domain || '').slice(0, 80), country: String(a.sourcecountry || a.country || '').slice(0, 40), at: String(a.seendate || a.at || '').slice(0, 20) }))
  .filter((a) => /^https?:\/\/[^\s]+$/.test(a.url) && a.title);

/** An index sent by a browser, checked before it is kept for the team: dates and values 0–100 only. */
export function cleanIndex(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(-200).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p?.date) && Number.isFinite(+p.value) && +p.value >= 0 && +p.value <= 100)
    .map((p) => ({ date: p.date, value: Math.round(+p.value * 10) / 10 }));
}
