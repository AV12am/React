// CONTEXT News — opened only by its link (#/news), not from the menu. Three sections, four news each: the
// thumbnail on the left, the short summary on the right; the issue is previewed and saved as PDF or Word.
import { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { Icon } from '../components/Icon.jsx';
import { InfoTip, Skeleton } from '../components/ui.jsx';
import { ContextMark, Loader } from '../brand/Mark.jsx';
import { supabaseOn, authHeaders } from '../lib/supabase.js';
import { saveFile } from '../lib/io.js';
import { ReportPreview } from './Analysis.jsx';
import { fmtWhen, issueTitle, issueFileName, thumb, newsPdf, newsDocx } from '../lib/newsExport.js';

const api = (q = '') => new URL(`api/pulse?news=1${q.replace(/^\?/, '&')}`, document.baseURI);

export function News() {
  const { toast, dispatch } = useStore();
  const [issue, setIssue] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);

  const load = async (refresh = false) => {
    if (!supabaseOn && !import.meta.env.DEV) { setErr('CONTEXT News працює на сайті із сервером (Vercel + Supabase).'); return; }
    setBusy(refresh ? 'refresh' : 'load'); setErr('');
    try {
      const res = await fetch(api(refresh ? '?refresh=1' : ''), { headers: await authHeaders() });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || `HTTP ${res.status}`);
      setIssue(j);
    } catch (e) { setErr(`Випуск недоступний: ${e.message}`); } finally { setBusy(''); }
  };
  useEffect(() => { load(); }, []);

  // The thumbnails go into the documents through the server (the sources do not let a browser read them).
  const pictures = async () => {
    const urls = [...new Set(issue.sections.flatMap((s) => s.items.map((x) => x.image)).filter(Boolean))];
    const headers = await authHeaders();
    const out = new Map();
    await Promise.all(urls.map(async (u) => {
      try {
        const res = await fetch(api(`?img=${encodeURIComponent(u)}`), { headers });
        if (res.ok) { const t = await thumb(await res.blob()); if (t) out.set(u, t); }
      } catch { /* that row goes without its picture */ }
    }));
    return out;
  };
  const make = async (kind) => {
    setBusy(kind);
    try {
      const pics = await pictures();
      const blob = kind === 'pdf' ? await newsPdf(issue, pics) : await newsDocx(issue, pics);
      setPreview({ kind, blob, name: issueFileName(issue, kind === 'pdf' ? 'pdf' : 'docx') });
    } catch (e) { toast(e.message || 'Не вдалося сформувати випуск', 'error'); } finally { setBusy(''); }
  };
  const download = async () => {
    const res = await saveFile(preview.name, preview.blob);
    if (res === 'saved') { dispatch({ type: 'news/export', format: preview.kind === 'pdf' ? 'PDF' : 'Word', label: issueTitle(issue) }); setPreview(null); }
    else if (res !== 'declined') toast('Не вдалося зберегти файл', 'error');
  };

  return (
    <div className="page news">
      <header className="page__head">
        <div>
          <div className="vx-eyebrow news__brand"><ContextMark size={18} title="" /> CONTEXT News</div>
          <h1 className="vx-h1">
            {issue ? issueTitle(issue).replace('CONTEXT News · ', '') : 'Випуск'}{' '}
            <InfoTip title="CONTEXT News">Кожен розділ збирається лише зі своїх відкритих джерел: чотири найсвіжіші матеріали за дві доби, з мініатюрою від самого видання. Стислий виклад робить CONTEXT лише за текстом джерела; повний матеріал — за посиланням. Випуск оновлюється раз на годину.</InfoTip>
          </h1>
          {issue?.at && <div className="vx-hint">{`Зібрано ${fmtWhen(issue.at)}`}{issue.stale ? ' · джерела зараз не відповідають, показано попередній випуск' : ''}</div>}
        </div>
        <div className="toolbar">
          <button className="vx-btn vx-btn--sm" disabled={!!busy} onClick={() => load(true)}>{busy === 'refresh' ? <Loader size={14} label="Оновлюю" /> : <Icon name="refresh" />} Оновити</button>
          <button className="vx-btn vx-btn--sm" disabled={!issue || !!busy} onClick={() => make('pdf')}>{busy === 'pdf' ? <Loader size={14} label="Збираю" /> : <Icon name="file" />} PDF</button>
          <button className="vx-btn vx-btn--sm" disabled={!issue || !!busy} onClick={() => make('docx')}>{busy === 'docx' ? <Loader size={14} label="Збираю" /> : <Icon name="download" />} Word</button>
        </div>
      </header>

      {err && <div className="vx-error">{err}</div>}
      {!issue && !err && <Skeleton rows={8} />}
      {issue?.sections.map((s) => (
        <section key={s.id} className="news__section">
          <h2 className="news__title">{s.title}</h2>
          {!s.items.length ? <div className="vx-hint">Свіжих матеріалів у джерелах розділу немає.</div> : (
            <div className="news__list">
              {s.items.map((x) => (
                <article key={x.url} className="news__item">
                  <a className="news__pic" href={x.url} target="_blank" rel="noopener noreferrer" aria-label={x.title}>
                    {x.image ? <img src={x.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <ContextMark size={28} title="" />}
                  </a>
                  <div className="news__text">
                    <a className="news__head" href={x.url} target="_blank" rel="noopener noreferrer" data-no-i18n="">{x.title}</a>
                    <p className="news__sum" data-no-i18n="">{x.summary}</p>
                    <div className="news__meta vx-hint">{x.domain}{x.at ? ` · ${fmtWhen(x.at)}` : ''}{x.ai ? '' : ' · текст джерела'}</div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}
      {preview && <ReportPreview p={preview} onSave={download} onClose={() => setPreview(null)} />}
    </div>
  );
}
