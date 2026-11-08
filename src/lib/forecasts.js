// The public forecast record (public/data/forecasts.json → /context): which entries show, and the track record.
// A forecast is open until its check date; then its status is set by hand to «happened» or «not».

export const RESOLVED = { happened: 1, not: 0 };

/** Entries to show: drafts only when asked for (?drafts=1), newest first. */
export function visibleForecasts(list = [], drafts = false) {
  return list.filter((f) => f && typeof f.p === 'number' && (drafts || !f.draft))
    .sort((a, b) => String(b.published).localeCompare(String(a.published)) || (b.no || 0) - (a.no || 0));
}

/** Brier score of one resolved forecast: (p − outcome)², 0 is perfect, 0.25 is a coin toss. */
export const brier = (f) => (f.status in RESOLVED ? (f.p - RESOLVED[f.status]) ** 2 : null);

/** The record: how many published, open, resolved, and the mean Brier score of the resolved ones. */
export function trackRecord(list = []) {
  const scores = list.map(brier).filter((x) => x !== null);
  return {
    published: list.length,
    open: list.filter((f) => !(f.status in RESOLVED)).length,
    resolved: scores.length,
    brier: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
  };
}

/** How far between publication and the check date «now» is, 0…1. */
export function elapsed(f, now = Date.now()) {
  const a = Date.parse(f.published); const b = Date.parse(f.check);
  if (!(b > a)) return 0;
  return Math.max(0, Math.min(1, (now - a) / (b - a)));
}
