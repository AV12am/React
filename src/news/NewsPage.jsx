// The standalone CONTEXT News page: three sections, four news each — the thumbnail on the left, the short
// summary on the right; the issue as PDF or Word, previewed before it is saved. No sign-in: the issue is
// public news from open sources, kept an hour on the server (api/_news.js).
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { ReportPreview } from '../components/viewers.jsx';
import { ContextMark, Loader } from '../brand/Mark.jsx';
import { saveFile } from '../lib/io.js';
import { issueFileName, thumb, newsPdf, newsDocx } from '../lib/newsExport.js';

const api = (q = '') => new URL(`api/pulse?news=1${q}`, document.baseURI);

export function NewsPage() {
  const [issue, setIssue] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(api());
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.message || `HTTP ${res.status}`);
        if (live) { setIssue(j); setErr(''); }
      } catch (e) { if (live) setErr(`Випуск зараз недоступний: ${e.message}`); }
    };
    load();
    const t = setInterval(load, 30 * 60000);
    return () => { live = false; clearInterval(t); };
  }, []);

  // The thumbnails go into the documents through the server (the sources do not let a browser read them).
  const pictures = async () => {
    const urls = [...new Set(issue.sections.flatMap((s) => s.items.map((x) => x.image)).filter(Boolean))];
    const out = new Map();
    await Promise.all(urls.map(async (u) => {
      try {
        const res = await fetch(api(`&img=${encodeURIComponent(u)}`));
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
    } catch (e) { setErr(e.message || 'Не вдалося сформувати випуск'); } finally { setBusy(''); }
  };
  const download = async () => {
    const res = await saveFile(preview.name, preview.blob);
    if (res === 'saved') setPreview(null);
    else if (res !== 'declined') setErr('Не вдалося зберегти файл');
  };

  return (
    <main className="news-page">
      <header className="news-page__head">
        <h1 className="vx-h1 news__brand"><ContextMark size={26} title="" /> CONTEXT News</h1>
        <div className="toolbar">
          <button className="vx-btn vx-btn--sm" disabled={!issue || !!busy} onClick={() => make('pdf')}>{busy === 'pdf' ? <Loader size={14} label="Збираю" /> : <Icon name="file" />} PDF</button>
          <button className="vx-btn vx-btn--sm" disabled={!issue || !!busy} onClick={() => make('docx')}>{busy === 'docx' ? <Loader size={14} label="Збираю" /> : <Icon name="download" />} Word</button>
        </div>
      </header>
      {err && <div className="vx-error">{err}</div>}
      {!issue && !err && <div className="news-page__wait"><Loader size={40} label="Збираю випуск" /><span className="vx-hint">Збираю випуск — перше відкриття може тривати до хвилини.</span></div>}
      {issue?.sections.map((s) => (
        <section key={s.id} className="news__section">
          <h2 className="news__title">{s.title}</h2>
          {!s.items.length ? <div className="vx-hint">Свіжих матеріалів у джерелах розділу немає.</div> : (
            <div className="news__list">
              {s.items.map((x) => (
                <article key={x.url} className="news__item">
                  <a className="news__pic" href={x.url} target="_blank" rel="noopener noreferrer" aria-label="Відкрити матеріал у джерелі">
                    {x.image ? <img src={x.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <ContextMark size={28} title="" />}
                  </a>
                  <p className="news__sum">{x.summary}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}
      {preview && <ReportPreview p={preview} onSave={download} onClose={() => setPreview(null)} />}
    </main>
  );
}
