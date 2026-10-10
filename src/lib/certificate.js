// Сертифікат Академії: a one-page landscape certificate for a passed course, printed to PDF.
import { hashId } from '../../scripts/lib/match.mjs';
import { VALID_DAYS } from '../data/academy/meta.js';
import paths from '../brand/mark-paths.json' with { type: 'json' };

// The mark, large and faint behind the text.
const LOGO = `<svg class="logo" viewBox="-100 -100 200 200" aria-hidden="true"><g fill="#111" fill-rule="evenodd">${[...paths.petals, paths.core].map((d) => `<path d="${d}"/>`).join('')}</g></svg>`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const day = (iso) => new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });

/** The certificate's number: the same person, course and pass date always give the same number. */
export const certNumber = (user, courseId, at) => `RC-ACAD-${new Date(at).getFullYear()}-${hashId(`${user.id}|${courseId}|${at}`).slice(0, 8).toUpperCase()}`;

export function certificateHtml({ user, course, result, grade, track }) {
  const until = new Date(new Date(result.at).getTime() + VALID_DAYS * 86400000).toISOString();
  const no = certNumber(user, course.id, result.at);
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${esc(no)}</title><style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: #111; }
  .sheet { width: 297mm; height: 210mm; padding: 16mm 22mm; position: relative; display: grid; grid-template-rows: auto 1fr auto; }
  .frame { position: absolute; inset: 9mm; border: .6mm solid #111; }
  .frame::after { content: ''; position: absolute; inset: 2.2mm; border: .25mm solid #8c1c32; }
  .rh { display: inline-block; width: 3.2mm; height: 3.2mm; background: #8c1c32; transform: rotate(45deg); margin: 0 4mm; vertical-align: middle; }
  .top { text-align: center; letter-spacing: .45em; font-size: 10pt; color: #444; position: relative; }
  .mid { display: grid; align-content: center; justify-items: center; text-align: center; gap: 4mm; position: relative; }
  .kind { font-size: 11pt; letter-spacing: .35em; text-transform: uppercase; color: #8c1c32; }
  h1 { font-weight: 400; font-size: 34pt; margin: 2mm 0 0; }
  .name { font-size: 26pt; border-bottom: .3mm solid #999; padding: 0 12mm 2mm; margin: 3mm 0; }
  .course { font-size: 17pt; max-width: 210mm; }
  .meta { font-size: 10.5pt; color: #555; }
  .foot { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8mm; font-size: 9.5pt; color: #444; position: relative; align-items: end; }
  .foot b { display: block; font-size: 10.5pt; color: #111; font-weight: 600; }
  .foot .c { text-align: center; } .foot .r { text-align: right; }
  .logo { position: absolute; left: 50%; top: 50%; width: 120mm; height: 120mm; transform: translate(-50%, -50%); opacity: .07; }
</style></head><body><div class="sheet"><div class="frame"></div>${LOGO}
  <div class="top">REACTION<span class="rh"></span>CORE · АКАДЕМІЯ</div>
  <div class="mid">
    <div class="kind">Сертифікат</div>
    <h1>засвідчує, що</h1>
    <div class="name">${esc(user.name)}</div>
    <div class="meta">успішно пройшов(-ла) курс і склав(-ла) тест</div>
    <div class="course">«${esc(course.title)}»</div>
    <div class="meta">${esc(track)} · рівень: ${esc(grade)} · результат ${esc(result.best)}%</div>
  </div>
  <div class="foot">
    <div><b>${esc(day(result.at))}</b>дата складання</div>
    <div class="c"><b>${esc(no)}</b>номер сертифіката</div>
    <div class="r"><b>${esc(day(until))}</b>дійсний до</div>
  </div>
</div></body></html>`;
}
