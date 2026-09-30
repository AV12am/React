// «Звідки ми це знаємо»: the chain from a product or judgment down to intake items and sources,
// and what has happened along it since someone last looked at it.
//
// Nothing here is stored: flags are derived from the records' own `updated` times, so they sync
// with the records and clear the moment the judgment is looked at again («Переглянуто» saves it).
//
//  due    — a forecast's check date has come and its outcome is not recorded. Cleared by the outcome.
//  review — events after the last review: a basis changed or was removed, its source was regraded,
//           an indicator was observed. Cleared by a review.
//  warn   — a weak basis that stays weak until it is replaced: unreliable or suspended source,
//           doubtful credibility. Shown, not cleared.
//
// Records above the reader's clearance are never named: the reason says only that something
// above their level changed.

const LOW_RELIABILITY = /^[DE]/;
const DOUBTFUL = /^[45]/;
const OFF = ['Призупинене', 'Закрите'];

const byId = (records) => {
  const m = new Map();
  for (const r of records) m.set(r.id, r);
  return m;
};

const after = (a, b) => !!a && (!b || a > b);
const label = (r) => r.title || r.name || r.statement || 'без назви';
const mask = (r, me) => r.clearance > me.clearance;
const today = () => new Date().toISOString().slice(0, 10);

/** Basis records of a product or judgment, with each intake's source attached. */
export function chainOf(record, records) {
  const all = byId(records);
  return (record.basis || []).map((id) => {
    const r = all.get(id) || null;
    const source = r?.col === 'intake' && r.source ? all.get(r.source) || null : null;
    return { id, record: r, source };
  });
}

function basisReasons(record, records, me) {
  const out = [];
  for (const { id, record: b, source } of chainOf(record, records)) {
    if (!b) { out.push({ kind: 'review', text: 'Підставу видалено', ref: id }); continue; }
    const hidden = mask(b, me);
    const name = hidden ? 'підставу вищого грифа' : `«${label(b)}»`;
    if (after(b.updated, record.updated)) out.push({ kind: 'review', text: `Змінено ${name}`, ref: b.id, level: b.clearance });
    const src = b.col === 'sources' ? b : source;
    if (src && !mask(src, me)) {
      if (src !== b && after(src.updated, record.updated)) out.push({ kind: 'review', text: `Переоцінено джерело «${label(src)}»`, ref: src.id, level: src.clearance });
      if (LOW_RELIABILITY.test(src.reliability || '')) out.push({ kind: 'warn', text: `Ненадійне джерело «${label(src)}» (${src.reliability[0]})`, ref: src.id });
      if (OFF.includes(src.state)) out.push({ kind: 'warn', text: `Джерело «${label(src)}»: ${src.state.toLowerCase()}`, ref: src.id });
    } else if (src && after(src.updated, record.updated)) {
      out.push({ kind: 'review', text: 'Переоцінено джерело вищого грифа', ref: src.id, level: src.clearance });
    }
    if (b.col === 'intake' && !hidden && DOUBTFUL.test(b.credibility || '')) out.push({ kind: 'warn', text: `Сумнівна достовірність ${name} (${b.credibility[0]})`, ref: b.id });
  }
  return out;
}

/** Why a judgment, product or indicator-bearing record needs attention. */
export function reasonsFor(record, records, me) {
  if (!record) return [];
  let out = basisReasons(record, records, me);
  if (record.col === 'judgments') {
    for (const ind of records) {
      if (ind.col !== 'indicators' || ind.judgment !== record.id || ind.state !== 'Спостерігається') continue;
      if (!after(ind.updated, record.updated)) continue; // observed (or changed) since the judgment was last looked at
      out.push({
        kind: 'review', ref: ind.id, level: ind.clearance,
        text: mask(ind, me) ? 'Спрацював індикатор вищого грифа' : `Спрацював індикатор «${ind.name}» — ${(ind.effect || 'впливає на судження').toLowerCase()}`,
      });
    }
    if (record.kind === 'Прогноз' && isOpen(record) && record.due && record.due <= today()) {
      out.push({ kind: 'due', text: 'Настала дата перевірки — зафіксуйте, чи справдився прогноз', ref: record.id });
    }
  }
  if (record.col === 'products') {
    for (const j of records) {
      if (j.col !== 'judgments' || j.product !== record.id || mask(j, me)) continue;
      for (const r of reasonsFor(j, records, me)) if (r.kind !== 'warn') out.push({ ...r, text: `Судження «${j.statement}»: ${r.text[0].toLowerCase()}${r.text.slice(1)}`, via: j.id });
    }
  }
  // Same reason once.
  const seen = new Set();
  out = out.filter((r) => { const k = `${r.kind}|${r.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return out;
}

// «due» (a forecast waiting for its outcome) needs attention like «review», but a review does not clear it — the outcome does.
export const attention = (r) => r.kind === 'review' || r.kind === 'due';
export const needsReview = (record, records, me) => reasonsFor(record, records, me).some(attention);

/** Everything that relies on this record: judgments and products that cite it (or an intake from this source), indicators that use it as evidence. */
export function usedBy(id, records) {
  const all = byId(records);
  const target = all.get(id);
  const viaSource = target?.col === 'sources'
    ? new Set(records.filter((r) => r.col === 'intake' && r.source === id).map((r) => r.id)) : new Set();
  return records.filter((r) => {
    if (r.id === id) return false;
    const links = [...(r.basis || []), ...(r.evidence || [])];
    return links.includes(id) || links.some((x) => viaSource.has(x));
  });
}

/** All judgments and products needing review, most recent change first. */
export function reviewQueue(records, me) {
  return records
    .filter((r) => (r.col === 'judgments' || r.col === 'products') && r.clearance <= me.clearance)
    .map((r) => ({ record: r, reasons: reasonsFor(r, records, me) }))
    .filter((x) => x.reasons.length)
    .sort((a, b) => Number(b.reasons.some(attention)) - Number(a.reasons.some(attention))
      || (b.record.updated || '').localeCompare(a.record.updated || ''));
}

export const isOpen = (j) => !j.outcome || j.outcome === 'Відкрито';
