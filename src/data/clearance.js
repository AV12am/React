// Reaction classification system — the single source of truth.
//
// Three levels on one scale (how much light falls on a document) plus one category
// that sits across them. Latin names keep these apart from state classification
// markings, which carry legal meaning; this is the company's internal system.
//
// Pure, JSON-serialisable data and helpers only: imported by the app, by the
// storage index, and by v0-generated components (see V0.md).

export const LEVELS = [
  {
    id: 0,
    code: 'LUM',
    name: 'LUMEN',
    gloss: 'світло',
    tier: 'Відкритий рівень',
    rule: 'Можна передати стороннім.',
    about:
      'Документ можна показувати, цитувати, передавати назовні. Сюди належить усе, що складається з публічних джерел і власного судження без чутливих подробиць: новинні аналізи, методологічні тексти, опубліковані звіти. Позначка стоїть не для обмеження, а щоб підтвердити: перевірено, віддавати можна.',
    examples: ['Новинний аналіз', 'Методологічний текст', 'Опублікований звіт'],
    download: true,
    act: false,
  },
  {
    id: 1,
    code: 'UMB',
    name: 'UMBRA',
    gloss: 'тінь',
    tier: 'Обмежений рівень',
    rule: 'Можна передати всередині кола.',
    about:
      'Документ існує для конкретного кола й поза ним не поширюється. Тут живе більшість робочих продуктів: звіти для замовника, чернетки, дані, отримані від експертів, внутрішні оцінки. Тінь — бо предмет видно, але не всім і не при світлі.',
    examples: ['Звіт для замовника', 'Чернетка', 'Дані від експертів', 'Внутрішня оцінка'],
    download: true,
    act: false,
  },
  {
    id: 2,
    code: 'NOX',
    name: 'NOX',
    gloss: 'ніч',
    tier: 'Закритий рівень',
    rule: 'Не можна винести за межі системи.',
    about:
      'Документ не залишає системи й не існує в копіях. Сюди йде те, що розкриває джерело, метод або особу: хто саме дав відомості, як перевірено, чиї імена стоять за оцінкою. Ніч — бо доступ вимагає окремої дії, а не наявності допуску.',
    examples: ['Хто дав відомості', 'Як перевірено', 'Імена за оцінкою'],
    download: false, // never leaves the system
    act: true, // each opening is a deliberate, logged act
  },
];

// Not a fourth step of secrecy but a different category: not about harm from
// disclosure, but about whether the content is fit to be seen at all. It can sit
// over any level and is opened only on a separate basis granted per document.
export const SEAL = {
  code: 'NOH',
  name: 'NON OCULIS HOMINUM',
  short: 'NON OCULIS',
  gloss: 'не для людських очей',
  tier: 'Поверх трьох',
  rule: 'Не можна відкривати без окремої підстави.',
  about:
    'Це не четвертий ступінь таємності, а інша категорія: не про шкоду від розголошення, а про придатність змісту до сприйняття. Матеріал, який не призначений для перегляду навіть тим, хто має доступ до NOX.',
  download: false,
};

export const MAX_LEVEL = LEVELS.length - 1;

// Shape the rest of the app already uses: { id, short, full, note }.
export const CLEARANCE = LEVELS.map((l) => ({ id: l.id, short: l.name, full: `${l.name} · ${l.gloss}`, note: l.rule }));

export const levelOf = (n) => LEVELS[Math.max(0, Math.min(MAX_LEVEL, Number(n) || 0))];

/* ---------- document number: the marking travels inside the number ---------- */
// RC-UMB-2026-0007 — company, marking, year, serial. The serial never changes;
// the marking segment follows the document when its level is lowered.
const NUM_RE = /^RC-(LUM|UMB|NOX|NOH)-(\d{4})-(\d{4,})$/;

export function docNumber({ level, sealed, year, serial }) {
  const code = sealed ? SEAL.code : levelOf(level).code;
  return `RC-${code}-${year}-${String(serial).padStart(4, '0')}`;
}

export function parseNumber(num) {
  const m = NUM_RE.exec(num || '');
  return m ? { code: m[1], year: +m[2], serial: +m[3] } : null;
}

/** Next free serial for a year, given the numbers already issued. */
export function nextSerial(numbers, year) {
  let max = 0;
  for (const n of numbers) {
    const p = parseNumber(n);
    if (p && p.year === year && p.serial > max) max = p.serial;
  }
  return max + 1;
}

/** The same document number re-marked for a new level or seal state. */
export function remark(num, { level, sealed }) {
  const p = parseNumber(num);
  return p ? docNumber({ level, sealed, year: p.year, serial: p.serial }) : num;
}

/** File name as it leaves the system — the marking goes with it. */
export const exportName = (file) => (file.number ? `${file.number} ${file.name}` : file.name);

/* ---------- lowering the level ---------- */
// A rule set when the document is filed: after a date, or once a named event
// has happened. Each lowering is one step down the scale (NOX → UMBRA → LUMEN)
// and is confirmed by a person; the system only says when it is due.
export const DOWNGRADE_KINDS = [
  { id: 'none', name: 'Без зниження' },
  { id: 'date', name: 'Після дати' },
  { id: 'event', name: 'Після події' },
];

export function downgradeState(file, now = Date.now()) {
  const d = file.downgrade;
  if (!d || d.kind === 'none' || file.clearance <= 0) return null;
  const to = file.clearance - 1;
  if (d.kind === 'date') {
    const due = new Date(`${d.at}T00:00:00`).getTime() <= now;
    return { to, due, label: `після ${new Date(`${d.at}T00:00:00`).toLocaleDateString('uk-UA')}` };
  }
  return { to, due: null, label: `після події: ${d.text}` };
}

/* ---------- access ---------- */
// Seeing a document in the list and opening its content are separate questions.

/** Level and folder grants: may this person see that the document exists and read its card? */
export const canSeeLevel = (me, f) => f.clearance <= me.clearance || (me.grants || []).includes(f.folder);

/** NON OCULIS: a basis granted for this one document (the person who filed it holds one). */
export const hasBasis = (me, f) => !f.sealed || f.owner === me.id || (me.basis || []).includes(f.id);

/** May the content leave the system as a file? */
export const canExport = (f) => !f.sealed && levelOf(f.clearance).download;
