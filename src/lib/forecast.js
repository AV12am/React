// Forecast tracking and calibration.
//
// A forecast is a judgment of kind «Прогноз» with a probability (0–100) and a date by which it can be
// checked. Once its outcome is recorded («Сталося» / «Не сталося»), it counts:
//   Brier score = mean of (p − outcome)², p in 0..1, outcome 1 or 0. 0 is perfect; always saying
//                 50% scores 0.25; confident and wrong approaches 1.
//   Skill       = 1 − Brier / 0.25: share of the «always 50%» error removed. Above 0 — better than a coin.
//   Calibration = in each probability band, how often the event really happened. A calibrated
//                 analyst's 70% forecasts come true about 70% of the time.
// «Скасовано» (the question stopped making sense) is left out of every score.

export const WORDS = [
  [5, 'майже неможливо'], [20, 'дуже малоймовірно'], [45, 'малоймовірно'], [55, 'приблизно рівні шанси'],
  [80, 'ймовірно'], [95, 'дуже ймовірно'], [100, 'майже напевно'],
];
/** The estimative-language word for a probability in percent. */
export const wordFor = (p) => (p == null || p === '' ? '' : WORDS.find(([max]) => +p <= max)[1]);

export const isForecast = (r) => r.col === 'judgments' && r.kind === 'Прогноз';
export const outcomeValue = (r) => (r.outcome === 'Сталося' ? 1 : r.outcome === 'Не сталося' ? 0 : null);
const scored = (list) => list.filter((r) => isForecast(r) && outcomeValue(r) != null && r.probability != null && r.probability !== '');

export function brier(list) {
  const s = scored(list);
  if (!s.length) return null;
  return s.reduce((a, r) => a + (r.probability / 100 - outcomeValue(r)) ** 2, 0) / s.length;
}
export const skill = (b) => (b == null ? null : 1 - b / 0.25);

/** Ten bands of 10 points: forecasts in the band, their mean probability and how often they came true. */
export function calibration(list) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, n: 0, p: 0, hit: 0 }));
  for (const r of scored(list)) {
    const i = Math.min(9, Math.floor(r.probability / 10));
    bins[i].n += 1; bins[i].p += r.probability / 100; bins[i].hit += outcomeValue(r);
  }
  return bins.map((b) => ({ ...b, mean: b.n ? b.p / b.n : null, freq: b.n ? b.hit / b.n : null }));
}

/**
 * Over- or under-confidence: how sure the forecasts sounded (the probability given to the side they chose)
 * minus how often that side was right. Positive — too sure, negative — too cautious. Meaningful from ~20.
 */
export function overconfidence(list) {
  const s = scored(list);
  if (s.length < 5) return null;
  const sure = s.reduce((a, r) => a + Math.max(r.probability, 100 - r.probability) / 100, 0) / s.length;
  const right = s.reduce((a, r) => a + ((r.probability >= 50 ? 1 : 0) === outcomeValue(r) ? 1 : 0), 0) / s.length;
  return sure - right;
}

export function summary(records, now = new Date()) {
  const f = records.filter(isForecast);
  const today = now.toISOString().slice(0, 10);
  const open = f.filter((r) => !r.outcome || r.outcome === 'Відкрито');
  return {
    total: f.length,
    open: open.length,
    due: open.filter((r) => r.due && r.due <= today).length,
    resolved: scored(f).length,
    brier: brier(f),
  };
}

/** Per analyst: count, Brier, skill, over-confidence. */
export function byAnalyst(records) {
  const groups = new Map();
  for (const r of records.filter(isForecast)) {
    const k = r.analyst || r.owner || '—';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.entries()].map(([analyst, list]) => {
    const b = brier(list);
    return { analyst, total: list.length, resolved: scored(list).length, brier: b, skill: skill(b), over: overconfidence(list) };
  }).sort((a, b) => (a.brier ?? 9) - (b.brier ?? 9));
}
