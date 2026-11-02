// The morning brief as a designed PDF (attached to the letter): a report in the manner of the big threat-intelligence
// reports — the week at a glance in large figures, «Quickview» panels with charts, numbered conclusions, the projects'
// flow as a scheme, what to develop, an assessment checklist, and the day's items and key news.
// Pure pdf-lib (works on the server): fonts come in as bytes (Noto Serif, with Cyrillic). Names above LUMEN never
// appear — the analysis (src/lib/brief.js) gives only «засекречений проєкт N».
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { plainConclusions } from './brief.js';

const A4 = [595.28, 841.89];
const M = 48; // side margin
const C = {
  ink: [0.07, 0.07, 0.08], muted: [0.42, 0.42, 0.44], faint: [0.62, 0.62, 0.64], line: [0.87, 0.86, 0.84],
  paper: [0.975, 0.97, 0.96], panel: [1, 1, 1], night: [0.06, 0.07, 0.09], gold: [0.72, 0.59, 0.37],
  crimson: [0.55, 0.11, 0.2], green: [0.18, 0.42, 0.25], slate: [0.2, 0.22, 0.26],
};
const STATE_COLOR = { 'Планується': [0.62, 0.55, 0.42], 'Триває': [0.55, 0.11, 0.2], 'На паузі': [0.45, 0.47, 0.52], 'Завершено': [0.18, 0.42, 0.25] };
const DAYS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export async function briefPdf({ brief, insights: ins, ai = null, news = [], name = '', fonts: [regBytes, boldBytes] }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const F = await doc.embedFont(regBytes, { subset: true });
  const B = await doc.embedFont(boldBytes, { subset: true });
  const date = new Date(brief.until);
  const dateUa = date.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: 'numeric', month: 'long', year: 'numeric' });
  doc.setTitle(`Ранковий бриф · ${dateUa}`);
  doc.setCreator('Reaction Core');
  const col = (c) => rgb(...c);
  const W = A4[0] - 2 * M;
  let page; let y; let n = 0;

  const text = (s, x, yy, { font = F, size = 10, color = C.ink } = {}) => page.drawText(String(s), { x, y: yy, size, font, color: col(color) });
  const width = (s, size, font = F) => font.widthOfTextAtSize(String(s), size);
  const wrap = (s, size, max, font = F) => {
    const out = []; let line = '';
    for (const w of String(s || '').split(/\s+/)) {
      const t = line ? `${line} ${w}` : w;
      if (width(t, size, font) > max && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    return out;
  };
  const para = (s, x, size, max, { font = F, color = C.ink, lead = 1.45 } = {}) => {
    for (const l of wrap(s, size, max, font)) { text(l, x, y, { font, size, color }); y -= size * lead; }
  };
  const diamond = (x, yy, r, c) => page.drawSvgPath(`M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`, { x, y: yy, color: col(c) });
  const footer = () => {
    text('REACTION CORE · РАНКОВИЙ БРИФ', M, 28, { size: 7, color: C.faint, font: B });
    const p = String(++n);
    text(p, A4[0] - M - width(p, 8), 28, { size: 8, color: C.faint });
    page.drawLine({ start: { x: M, y: 40 }, end: { x: A4[0] - M, y: 40 }, thickness: 0.5, color: col(C.line) });
  };
  const newPage = (bg = C.paper) => {
    page = doc.addPage(A4);
    page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: col(bg) });
    // the brand line at the top: the gold mark and the wordmark
    diamond(M + 4, A4[1] - 31, 4, C.gold);
    text('REACTION CORE', M + 14, A4[1] - 34, { size: 8, font: B, color: bg === C.night ? C.gold : C.slate });
    y = A4[1] - 70;
    footer();
  };
  const room = (h) => { if (y - h < 56) newPage(); };
  const heading = (s, sub = '') => {
    room(60);
    text(s, M, y, { font: F, size: 20 }); y -= 16;
    if (sub) { text(sub, M, y, { size: 8.5, color: C.muted, font: B }); y -= 8; }
    y -= 12;
  };
  const panel = (h, draw) => { // a rounded white card, like the report's «Quickview» boxes
    room(h + 10);
    const top = y;
    page.drawRectangle({ x: M, y: top - h, width: W, height: h, color: col(C.panel), borderColor: col(C.line), borderWidth: 0.8 });
    draw(top);
    y = top - h - 18;
  };
  const source = (s, yy) => { page.drawRectangle({ x: M + 16, y: yy - 1, width: 1.6, height: 9, color: col(C.crimson) }); text(s, M + 22, yy, { size: 7, color: C.muted }); };

  /* ---------- Cover: the week at a glance ---------- */
  newPage(C.night);
  page.drawRectangle({ x: 0, y: A4[1] - 300, width: A4[0], height: 300, color: col([0.09, 0.08, 0.08]) });
  for (let i = 0; i < 26; i++) page.drawLine({ start: { x: 0, y: A4[1] - 300 + i * 11.5 }, end: { x: A4[0], y: A4[1] - 300 + i * 11.5 }, thickness: 0.3, color: col([0.16, 0.14, 0.13]) });
  text('РАНКОВИЙ', M, A4[1] - 150, { font: B, size: 40, color: [0.95, 0.94, 0.92] });
  text('БРИФ', M, A4[1] - 196, { font: B, size: 40, color: C.gold });
  text(`${name ? `${name} · ` : ''}${dateUa}`, M, A4[1] - 226, { size: 11, color: [0.8, 0.79, 0.76] });
  text('Аналітика, графіки, прогноз і що варто розвивати', M, A4[1] - 244, { size: 10, color: [0.6, 0.59, 0.56] });
  y = A4[1] - 340;
  text('Головне за тиждень', M, y, { size: 18, color: [0.95, 0.94, 0.92] }); y -= 30;

  // Four stat callouts: big figure, a small visual, one line of meaning.
  const f = ins.forecast;
  const stats = [
    { big: String(ins.thisWeek), label: 'дій за тиждень', note: f.activityTrend != null ? `${f.activityTrend >= 0 ? '+' : '−'}${Math.abs(f.activityTrend)}% до минулого тижня` : 'записи, зміни, робота над проєктами', viz: 'spark' },
    { big: `${ins.projects.live}/${ins.projects.total}`, label: 'проєктів у роботі', note: `${ins.develop.length} потребують рішення або розвитку`, viz: 'ring', ratio: ins.projects.total ? ins.projects.live / ins.projects.total : 0 },
    { big: String(ins.tasks.open), label: 'відкритих завдань', note: ins.tasks.overdue ? `${ins.tasks.overdue} прострочено` : 'прострочених немає', viz: 'bars' },
    { big: String(f.deadlines30), label: 'термінів за 30 днів', note: f.clearDays != null ? `черга завдань — ~${f.clearDays} дн. за темпу` : 'темп виконання ще не видно', viz: 'cal' },
  ];
  const cw = (W - 18) / 2; const ch = 118;
  stats.forEach((s, i) => {
    const x = M + (i % 2) * (cw + 18); const top = y - Math.floor(i / 2) * (ch + 16);
    page.drawRectangle({ x, y: top - ch, width: cw, height: ch, borderColor: col([0.25, 0.22, 0.2]), borderWidth: 0.8, color: col([0.08, 0.09, 0.11]) });
    text(s.big, x + 16, top - 50, { font: F, size: 32, color: [0.96, 0.95, 0.93] });
    text(s.label.toUpperCase(), x + 16, top - 68, { font: B, size: 7.5, color: C.gold });
    let ly = top - 86;
    for (const l of wrap(s.note, 9, cw - 120)) { text(l, x + 16, ly, { size: 9, color: [0.72, 0.71, 0.68] }); ly -= 12; }
    const vx = x + cw - 92; const vy = top - 92;
    if (s.viz === 'spark') {
      const vals = ins.activity.map((a) => a.created + a.updated + a.notes); const mx = Math.max(1, ...vals);
      const pts = vals.map((v, k) => `${k === 0 ? 'M' : 'L'} ${k * 12} ${-v / mx * 40}`).join(' ');
      page.drawSvgPath(`${pts} L 72 0 L 0 0 Z`, { x: vx, y: vy, color: col([0.35, 0.12, 0.16]), opacity: 0.6 });
      page.drawSvgPath(pts, { x: vx, y: vy, borderColor: col(C.crimson), borderWidth: 1.6 });
    } else if (s.viz === 'ring') {
      const r = 26; const cx = vx + 40; const cy = vy + 22;
      page.drawCircle({ x: cx, y: cy, size: r, borderColor: col([0.22, 0.22, 0.25]), borderWidth: 6 });
      const a = Math.max(0.001, Math.min(0.999, s.ratio)) * 2 * Math.PI;
      const ex = Math.sin(a) * r; const ey = -Math.cos(a) * r;
      page.drawSvgPath(`M 0 ${-r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${ex} ${ey}`, { x: cx, y: cy, borderColor: col(C.gold), borderWidth: 6 });
    } else if (s.viz === 'bars') {
      const t = ins.tasks; const vals = [t.open, t.overdue, t.newWeek, t.doneWeek]; const mx = Math.max(1, ...vals);
      const cs = [[0.9, 0.9, 0.9], C.crimson, C.gold, [0.3, 0.6, 0.4]];
      vals.forEach((v, k) => page.drawRectangle({ x: vx + k * 18, y: vy, width: 11, height: Math.max(1, v / mx * 44), color: col(cs[k]) }));
    } else {
      page.drawRectangle({ x: vx + 10, y: vy, width: 56, height: 44, borderColor: col(C.gold), borderWidth: 1 });
      page.drawRectangle({ x: vx + 10, y: vy + 34, width: 56, height: 10, color: col(C.crimson) });
      text(String(f.deadlines30), vx + 38 - width(String(f.deadlines30), 16, B) / 2, vy + 10, { font: B, size: 16, color: [0.95, 0.94, 0.92] });
    }
  });
  y -= 2 * ch + 16 + 30;
  text('Цифри — з даних платформи в межах вашого допуску. Назви записів вище LUMEN не показуються.', M, y, { size: 8, color: [0.5, 0.49, 0.47] });

  /* ---------- Conclusions ---------- */
  newPage();
  heading('Аналітичні висновки', 'КЛЮЧОВЕ ЗА ТИЖДЕНЬ');
  const cons = ai?.conclusions?.length ? ai.conclusions : plainConclusions(ins);
  cons.forEach((c, i) => {
    room(60);
    text(String(i + 1), M, y - 18, { font: F, size: 30, color: C.crimson });
    // A heading and its explanation where the sentence has «…: …» early on; else the whole sentence as the heading.
    const colon = c.indexOf(':');
    const first = colon > 10 && colon < 80 ? c.slice(0, colon + 1) : c;
    const rest = c.slice(first.length).trim();
    const top = y;
    para(first, M + 34, 11, W - 34, { font: B, color: C.slate });
    if (rest) para(rest, M + 34, 10, W - 34, { color: C.ink });
    y = Math.min(y, top - 40) - 8;
  });

  /* ---------- Quickview: charts ---------- */
  y -= 6;
  panel(250, (top) => {
    text('Quickview · активність і проєкти', M + 16, top - 26, { size: 15 });
    text(`ОСТАННІ 7 ДНІВ · ДО ${dateUa.toUpperCase()}`, M + 16, top - 40, { size: 7.5, font: B, color: C.muted });
    text(String(ins.thisWeek), M + W - 16 - width(String(ins.thisWeek), 20), top - 28, { size: 20, color: C.crimson });
    text('ДІЙ ЗА ТИЖДЕНЬ', M + W - 16 - width('ДІЙ ЗА ТИЖДЕНЬ', 7, B), top - 40, { size: 7, font: B, color: C.muted });
    // activity: vertical bars with an axis
    const bx = M + 30; const by = top - 200; const bw = W / 2 - 50; const bh = 120;
    text('Активність по днях', bx, top - 66, { size: 9.5, font: B, color: C.slate });
    const vals = ins.activity.map((a) => a.created + a.updated + a.notes); const mx = Math.max(4, Math.ceil(Math.max(...vals) / 4) * 4);
    for (let g = 0; g <= 4; g++) {
      const gy = by + (bh * g) / 4;
      page.drawLine({ start: { x: bx, y: gy }, end: { x: bx + bw, y: gy }, thickness: 0.4, color: col(C.line) });
      const lab = String(Math.round((mx * g) / 4)); text(lab, bx - 6 - width(lab, 6.5), gy - 2, { size: 6.5, color: C.faint });
    }
    const step = bw / vals.length;
    vals.forEach((v, k) => {
      const h = (v / mx) * bh;
      if (v) page.drawRectangle({ x: bx + k * step + step * 0.18, y: by, width: step * 0.64, height: h, color: col(C.crimson) });
      const d = ins.activity[k].day; const lab = `${DAYS[new Date(d).getUTCDay()]} ${+d.slice(8)}`;
      text(lab, bx + k * step + step / 2 - width(lab, 6.5) / 2, by - 11, { size: 6.5, color: C.muted });
    });
    // projects by state: a donut with labels
    const dx = M + W * 0.8; const dy = top - 140; const R = 54; const r = 30;
    text('Проєкти за станом', M + W / 2 + 20, top - 66, { size: 9.5, font: B, color: C.slate });
    const parts = ins.projects.byState.filter((s) => s.n); const total = parts.reduce((a, s) => a + s.n, 0);
    if (!total) text('Проєктів ще немає', dx - 40, dy, { size: 9, color: C.faint });
    let a0 = 0;
    for (const s of parts) {
      const a1 = a0 + (s.n / total) * 2 * Math.PI - (parts.length > 1 ? 0.0001 : 0.0002);
      const p = (ang, rad) => `${Math.sin(ang) * rad} ${-Math.cos(ang) * rad}`;
      const big = a1 - a0 > Math.PI ? 1 : 0;
      page.drawSvgPath(`M ${p(a0, R)} A ${R} ${R} 0 ${big} 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 ${big} 0 ${p(a0, r)} Z`, { x: dx, y: dy, color: col(STATE_COLOR[s.label] || C.slate) });
      a0 = a1 + 0.0001;
    }
    if (total) { const t = String(total); text(t, dx - width(t, 16) / 2, dy - 6, { size: 16 }); }
    let ly = top - 96;
    for (const s of ins.projects.byState) {
      page.drawRectangle({ x: M + W / 2 + 20, y: ly, width: 7, height: 7, color: col(STATE_COLOR[s.label] || C.slate) });
      text(`${s.label}`, M + W / 2 + 32, ly, { size: 8, color: C.ink });
      text(String(s.n), M + W / 2 + 32, ly - 11, { size: 8, font: B, color: C.crimson });
      ly -= 30;
    }
    source('Джерело: записи Reaction Core', top - 236);
  });

  // The projects' flow as a scheme: stage → stage, with counts (like the report's process diagrams).
  panel(110, (top) => {
    text('Потік проєктів', M + 16, top - 24, { size: 13 });
    const st = ins.projects.byState; const bw = (W - 32 - 3 * 26) / 4;
    st.forEach((s, i) => {
      const x = M + 16 + i * (bw + 26); const yy = top - 92;
      page.drawRectangle({ x, y: yy, width: bw, height: 50, color: col(i === 1 ? [0.98, 0.94, 0.95] : C.paper), borderColor: col(STATE_COLOR[s.label] || C.slate), borderWidth: 1 });
      text(String(s.n), x + 10, yy + 22, { size: 18, color: STATE_COLOR[s.label] || C.slate });
      text(`${i + 1}. ${s.label}`, x + 10, yy + 8, { size: 8, font: B, color: C.slate });
      if (i < st.length - 1) {
        const ax = x + bw + 4; const ay = yy + 25;
        page.drawLine({ start: { x: ax, y: ay }, end: { x: ax + 17, y: ay }, thickness: 1, color: col(C.muted) });
        page.drawSvgPath('M 0 0 L -5 3 L -5 -3 Z', { x: ax + 18, y: ay, color: col(C.muted) });
      }
    });
  });

  /* ---------- Tasks and forecast ---------- */
  panel(96, (top) => {
    text('Завдання', M + 16, top - 24, { size: 13 });
    const t = ins.tasks;
    [['відкрито', t.open, C.ink], ['прострочено', t.overdue, C.crimson], ['нових за тиждень', t.newWeek, C.gold], ['виконано за тиждень', t.doneWeek, C.green]].forEach(([l, v, c], i) => {
      const x = M + 16 + i * ((W - 32) / 4);
      text(String(v), x, top - 64, { size: 26, color: c });
      text(l.toUpperCase(), x, top - 80, { size: 6.8, font: B, color: C.muted });
    });
  });
  room(90);
  heading('Прогноз', 'ЗА ПОТОЧНОГО ТЕМПУ');
  const fc = ai?.forecast || [
    f.clearDays != null && ins.tasks.open ? `За поточного темпу (${ins.tasks.doneWeek} виконано за тиждень) відкриті завдання буде закрито приблизно за ${f.clearDays} дн.` : ins.tasks.open ? `Відкритих завдань ${ins.tasks.open}, а за тиждень жодне не закрито: без руху черга лишиться.` : 'Відкритих завдань немає.',
    f.backlogTrend > 0 ? `Черга росте: нових на ${f.backlogTrend} більше, ніж виконаних.` : '',
    f.deadlines30 ? `Найближчі 30 днів: ${f.deadlines30} термін(и) проєктів.` : '',
  ].filter(Boolean).join(' ');
  const fl = wrap(fc, 11, W - 30).length;
  page.drawRectangle({ x: M, y: y - (fl - 1) * 16 - 5, width: 3, height: (fl - 1) * 16 + 18, color: col(C.gold) });
  para(fc, M + 16, 11, W - 30, { lead: 1.45 });
  y -= 26;

  /* ---------- What to develop ---------- */
  heading('Що варто розвивати', 'ПРОЄКТИ З СИГНАЛАМИ');
  const steps = new Map((ai?.develop || []).map((x) => [x.project, x.next]));
  if (!ins.develop.length) { para('Усі проєкти рухаються за планом — нових сигналів немає.', M, 10, W, { color: C.muted }); y -= 8; }
  ins.develop.forEach((x, i) => {
    const lines = wrap(x.why, 9.5, W - 60).length + (steps.get(x.title) ? wrap(`Наступний крок: ${steps.get(x.title)}`, 9.5, W - 60).length : 0);
    const h = 34 + lines * 13;
    room(h + 8);
    page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: col(C.panel), borderColor: col(C.line), borderWidth: 0.6 });
    text(String(i + 1), M + 14, y - 26, { size: 20, color: C.crimson });
    text(x.title, M + 44, y - 20, { font: B, size: 11 });
    const chip = x.state.toUpperCase(); const cwid = width(chip, 6.5, B) + 10;
    page.drawRectangle({ x: M + 50 + width(x.title, 11, B), y: y - 23, width: cwid, height: 12, color: col(STATE_COLOR[x.state] || C.slate) });
    text(chip, M + 55 + width(x.title, 11, B), y - 19.5, { size: 6.5, font: B, color: [1, 1, 1] });
    const top = y; y -= 36;
    para(x.why, M + 44, 9.5, W - 60, { color: C.muted, lead: 1.37 });
    if (steps.get(x.title)) para(`Наступний крок: ${steps.get(x.title)}`, M + 44, 9.5, W - 60, { font: B, color: C.slate, lead: 1.37 });
    y = top - h - 8;
  });

  /* ---------- Assessment checklist (dark band) ---------- */
  const qs = [
    ins.develop.some((x) => /без руху/.test(x.why)) && 'Чи вирішено, що робити з проєктами без руху: повернутися, поставити на паузу чи закрити?',
    ins.tasks.overdue && 'Чи переглянуто прострочені завдання: закрити, перенести або передати іншому?',
    f.deadlines30 && 'Чи на всіх проєктах із терміном у найближчі 30 днів є план останніх кроків?',
    ins.develop.some((x) => /набирає темп/.test(x.why)) && 'Чи вистачає людей і ресурсів проєктам, що набирають темп?',
    'Чи всі нові матеріали тижня віднесено до проєктів?',
  ].filter(Boolean).slice(0, 4);
  const bandH = 44 + qs.length * 22;
  room(bandH + 10);
  page.drawRectangle({ x: 0, y: y - bandH, width: A4[0], height: bandH, color: col(C.night) });
  text('Оцінка стану', M, y - 26, { size: 14, color: [0.95, 0.94, 0.92] });
  qs.forEach((q, i) => {
    const qy = y - 50 - i * 22;
    page.drawRectangle({ x: M, y: qy - 2, width: 10, height: 10, borderColor: col(C.gold), borderWidth: 1 });
    text(wrap(q, 9, W - 24)[0], M + 18, qy, { size: 9, color: [0.85, 0.84, 0.81] });
  });
  y -= bandH + 24;

  /* ---------- The day and the news ---------- */
  const busy = brief.sections.filter((s) => s.total);
  if (busy.length || news.length) newPage();
  if (busy.length) {
    heading('За добу', 'ЩО ПОТРЕБУЄ УВАГИ СЬОГОДНІ');
    for (const s of busy) {
      room(40);
      diamond(M + 3.5, y + 3, 3.5, C.crimson);
      text(`${s.title.toUpperCase()} · ${s.total}`, M + 12, y, { size: 8.5, font: B, color: C.crimson }); y -= 16;
      for (const i of s.items) { room(16); para(`${i.title ?? 'запис вищого грифа — відкрийте платформу'}${i.note ? ` — ${i.note}` : ''}`, M + 12, 9.5, W - 12, { lead: 1.4 }); }
      if (s.total > s.items.length) { text(`… і ще ${s.total - s.items.length}`, M + 12, y, { size: 8.5, color: C.muted }); y -= 14; }
      y -= 8;
    }
  }
  if (news.length) {
    y -= 14;
    heading('Ключові новини доби', 'CONTEXT NEWS');
    news.forEach((t, i) => { room(30); text(String(i + 1), M, y - 2, { size: 14, color: C.gold }); para(t, M + 22, 10, W - 22); y -= 6; });
  }
  return doc.save();
}
