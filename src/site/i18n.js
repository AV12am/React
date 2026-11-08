// The public site's languages: English (the site is written in it), Deutsch, Français, Українська.
// The pages are English and SITUATION's interface is Ukrainian (it is the workspace's own); the texts on the page
// are swapped for the chosen language as they appear (src/i18n/dom.js), so every screen is covered.
// Dictionaries: src/i18n/site/<lang>.js — FROM_EN (the site's English texts) and FROM_UK (SITUATION's Ukrainian ones);
// English also takes the workspace's dictionary (src/i18n/en.js). What people type and the data (company names,
// news) are left as they are. The choice is remembered in this browser; switching reloads the page.
import { createTranslator, startTranslator } from '../i18n/dom.js';

export const LANGS = [['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'], ['uk', 'Українська']];
const KEY = 'reaction-site/lang';
const known = (l) => LANGS.some(([id]) => id === l);
export const lang = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  if (known(q)) { try { localStorage.setItem(KEY, q); } catch { /* not remembered */ } return q; }
  try { const l = localStorage.getItem(KEY); if (known(l)) return l; } catch { /* private mode */ }
  return 'en';
})();
export const setLang = (l) => { try { localStorage.setItem(KEY, l); } catch { /* not remembered */ } location.reload(); };

// English is the hub: a Ukrainian text (SITUATION, CONTEXT) is first put into English with the workspace's dictionary
// and site/en.js, then into the chosen language with its FROM_EN; a text the language lacks stays in English.
const LOAD = { de: () => import('../i18n/site/de.js'), fr: () => import('../i18n/site/fr.js'), uk: () => import('../i18n/site/uk.js') };
const LATIN = /[A-Za-z]/;
const CYR = /[А-ЯІЇЄҐа-яіїєґ]/;

/** Starts translating the page. */
export const ready = (async () => {
  document.documentElement.lang = lang;
  const uk = document.body.hasAttribute('data-uk'); // a page with Ukrainian texts (SITUATION, CONTEXT)
  if (lang === 'en' && !uk) return;
  const [siteEn, work, target] = await Promise.all([
    uk && lang !== 'uk' ? import('../i18n/site/en.js') : null,
    uk && lang !== 'uk' ? import('../i18n/en.js') : null,
    lang !== 'en' ? LOAD[lang]() : null,
  ]);
  const toEn = siteEn ? createTranslator({ EXACT: { ...work.EXACT, ...siteEn.FROM_UK }, TEMPLATES: [...siteEn.TEMPLATES_UK, ...work.TEMPLATES] }) : () => null;
  const fromEn = target ? createTranslator({ EXACT: target.FROM_EN, TEMPLATES: target.TEMPLATES_EN || [] }, { test: LATIN }) : () => null;
  const translate = (t) => {
    if (!t) return null;
    if (CYR.test(t)) { if (lang === 'uk') return null; const en = toEn(t); return en == null ? null : (fromEn(en) ?? en); }
    return fromEn(t);
  };
  startTranslator(translate, document.body, { any: true });
})().catch(() => {});

/** The switcher in the header (src/site/partials/header.html): EN ▾ and the list in each language's own name. */
export function mountSwitcher() {
  document.querySelectorAll('[data-lang-pick]').forEach((box) => {
    const btn = box.querySelector('button');
    const list = box.querySelector('ul');
    if (!btn || !list) return;
    btn.firstChild.nodeValue = lang.toUpperCase();
    list.innerHTML = LANGS.map(([id, name]) => `<li><button type="button" lang="${id}" data-l="${id}" aria-current="${id === lang}">${name}</button></li>`).join('');
    const close = () => { box.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); const o = !box.classList.contains('open'); box.classList.toggle('open', o); btn.setAttribute('aria-expanded', String(o)); });
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (b && b.dataset.l !== lang) setLang(b.dataset.l); else close(); });
    document.addEventListener('click', (e) => { if (!box.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  });
}
