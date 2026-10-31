// The standalone CONTEXT News page: five chapters, four or five news a section — the thumbnail on the left, the
// short summary on the right, justified; the issue as PDF or Word, previewed before it is saved. No sign-in: the
// issue is public news from open sources, made once a day at 17:00 Kyiv time on the server (api/_news.js).
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { ReportPreview } from '../components/viewers.jsx';
import { ContextMark, Loader } from '../brand/Mark.jsx';
import { NewsIntro } from './NewsIntro.jsx';
import { saveFile } from '../lib/io.js';
import { issueFileName, thumb, newsPdf, newsDocx, newsPptx, localize } from '../lib/newsExport.js';

// The page's own words in both languages (the platform's translator is not loaded here).
const T = {
  uk: { wait: 'Збираю випуск — перше відкриття може тривати до хвилини.', making: 'Збираю', empty: 'Свіжих матеріалів у джерелах розділу немає.', open: 'Відкрити матеріал у джерелі', down: 'Випуск зараз недоступний', fail: 'Не вдалося сформувати випуск', save: 'Не вдалося зберегти файл', lang: 'Мова випуску' },
  en: { wait: 'Putting the issue together — the first opening can take up to a minute.', making: 'Making', empty: 'No fresh material in this section’s sources.', open: 'Open the article at its source', down: 'The issue is not available right now', fail: 'Could not make the issue', save: 'Could not save the file', lang: 'Issue language' },
};
const LANG_KEY = 'context-news-lang';
const savedLang = () => { try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'uk'; } catch { return 'uk'; } };

const api = (q = '') => new URL(`api/pulse?news=1${q}`, document.baseURI);

export function NewsPage() {
  const [issue, setIssue] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);
  const [lang, setLang] = useState(savedLang);
  // The opening plays once through (about three seconds), then leaves as soon as the issue is here.
  const [introDone, setIntroDone] = useState(() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } });
  const [introGone, setIntroGone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setIntroDone(true), 3300); return () => clearTimeout(t); }, []);
  const introLeaving = introDone && (!!issue || !!err);
  useEffect(() => { if (!introLeaving) return undefined; const t = setTimeout(() => setIntroGone(true), 780); return () => clearTimeout(t); }, [introLeaving]);
  const t = T[lang];
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* the choice just is not remembered */ }
  }, [lang]);
  const shown = issue ? localize(issue, lang) : null;

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(api());
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.message || `HTTP ${res.status}`);
        if (live && j.sections?.length) { setIssue(j); setErr(''); }
        else if (live && j.making) setTimeout(load, 20000); // another reader's request is making it right now
      } catch (e) { if (live) setErr(`${T[savedLang()].down}: ${e.message}`); }
    };
    load();
    const t = setInterval(load, 60 * 60000);
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
      if (kind === 'pptx') {
        // PowerPoint has no preview here: the deck is saved straight away.
        const blob = await newsPptx(shown, pics, lang);
        const res = await saveFile(issueFileName(issue, 'pptx', lang), blob);
        if (res !== 'saved' && res !== 'declined') setErr(t.save);
        return;
      }
      const blob = kind === 'pdf' ? await newsPdf(shown, pics, lang) : await newsDocx(shown, pics, lang);
      setPreview({ kind, blob, name: issueFileName(issue, kind === 'pdf' ? 'pdf' : 'docx', lang) });
    } catch (e) { setErr(e.message || t.fail); } finally { setBusy(''); }
  };
  const download = async () => {
    const res = await saveFile(preview.name, preview.blob);
    if (res === 'saved') setPreview(null);
    else if (res !== 'declined') setErr(t.save);
  };

  return (
    <main className={`news-page ${introGone ? '' : 'is-intro'}`}>
      <header className="news-page__head">
        <h1 className="vx-h1 news__brand"><ContextMark size={26} title="" /> CONTEXT <em className="news__brand-news">News</em></h1>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label={t.lang}>
            <button className={lang === 'uk' ? 'is-active' : ''} aria-pressed={lang === 'uk'} onClick={() => setLang('uk')}>УКР</button>
            <button className={lang === 'en' ? 'is-active' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>ENG</button>
          </div>
          <button className="vx-btn vx-btn--sm" disabled={!issue || !!busy} onClick={() => make('pdf')}>{busy === 'pdf' ? <Loader size={14} label={t.making} /> : <Icon name="file" />} PDF</button>
          <button className="vx-btn vx-btn--sm" disabled={!issue || !!busy} onClick={() => make('docx')}>{busy === 'docx' ? <Loader size={14} label={t.making} /> : <Icon name="download" />} Word</button>
          <button className="vx-btn vx-btn--sm" disabled={!issue || !!busy} onClick={() => make('pptx')}>{busy === 'pptx' ? <Loader size={14} label={t.making} /> : <Icon name="download" />} PowerPoint</button>
        </div>
      </header>
      {err && <div className="vx-error">{err}</div>}
      {!issue && !err && <div className="news-page__wait"><Loader size={40} label={t.making} /><span className="vx-hint">{t.wait}</span></div>}
      {shown?.sections.map((s) => (
        <section key={s.id} className="news__section">
          <h2 className="news__title">{s.part}{s.title && <span className="news__sub">{s.title}</span>}</h2>
          {!s.items.length ? <div className="vx-hint">{t.empty}</div> : (
            <div className="news__list">
              {s.items.map((x) => (
                <article key={x.url} className="news__item">
                  <a className="news__pic" href={x.url} target="_blank" rel="noopener noreferrer" aria-label={t.open}>
                    {x.image ? <img src={x.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <ContextMark size={28} title="" />}
                  </a>
                  <p className="news__sum" lang={lang}>{x.summary}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}
      {!introGone && <NewsIntro leaving={introLeaving} onSkip={() => setIntroDone(true)} />}
      {preview && <ReportPreview p={preview} onSave={download} onClose={() => setPreview(null)} />}
    </main>
  );
}
