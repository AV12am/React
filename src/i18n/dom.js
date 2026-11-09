// Мова інтерфейсу. The interface is written in Ukrainian; for English the texts on the page are swapped for
// their translation (en.js) as they appear — text nodes and the placeholder / title / aria-label attributes —
// so every screen is covered without threading a translate() call through the code.
//
// Only interface texts are in the dictionary: what people write themselves (record titles, descriptions,
// entries, comments), company data and the Academy's lessons stay as written. A text with changing parts
// («5 хв тому», «Додано файлів: 3») is matched by its template; the parts are kept, and translated too when
// they are themselves interface words. Fields people type into are never touched.
//
// The language is chosen in «Налаштування»; switching reloads the page (src/main.jsx starts the translator).

const CYR = /[А-ЯІЇЄҐа-яіїєґ]/;
const ATTRS = ['placeholder', 'title', 'aria-label', 'data-tip'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE']);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// `test`: which texts are this dictionary's to translate (Ukrainian by default; the public site also has English ones).
export function createTranslator({ EXACT, TEMPLATES = [] }, { test = CYR } = {}) {
  const exact = new Map(Object.entries(EXACT));
  // Longer templates first, so «{} год тому» wins over «{} год».
  const templates = TEMPLATES
    .map(([src, dst]) => ({ re: new RegExp(`^${src.split('{}').map(esc).join('([\\s\\S]+?)')}$`), dst, len: src.replace(/\{\}/g, '').length }))
    .sort((a, b) => b.len - a.len);
  const cache = new Map();

  // A word in any case: «Продукти» or «продукти» (a register name lower-cased in a sentence).
  const word = (v) => {
    const t = v.trim();
    const hit = exact.get(t);
    if (hit != null) return hit;
    const up = exact.get(t.charAt(0).toUpperCase() + t.slice(1));
    return up != null ? up.charAt(0).toLowerCase() + up.slice(1) : null;
  };
  const core = (text, depth = 0) => {
    const hit = exact.get(text);
    if (hit != null) return hit;
    for (const t of templates) {
      const m = t.re.exec(text);
      if (!m) continue;
      let i = 0;
      // A part is translated when it is itself a known text (a name of a template, «Ризик країни: Україна»).
      return t.dst.replace(/\{(\d*)\}/g, (_, n) => { const v = m[n ? +n : ++i] ?? ''; return word(v) ?? (depth < 2 && test.test(v) ? core(v.trim(), depth + 1) : null) ?? v; });
    }
    // Composite labels: «NOX · ніч — Не можна…», «Опрацювання · Джерела · Методики» — when every part is known.
    if (depth < 2) {
      for (const sep of [' — ', ' · ', ': ']) {
        if (!text.includes(sep)) continue;
        const parts = text.split(sep).map((x) => (test.test(x) ? (word(x) ?? core(x.trim(), depth + 1)) : x));
        if (parts.every((x) => x != null)) return parts.join(sep);
      }
    }
    const w = word(text);
    return w;
  };

  /** The English for a Ukrainian text, or null (keeps the surrounding spaces). */
  function translate(text) {
    if (!text || !test.test(text)) return null;
    if (cache.has(text)) return cache.get(text);
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    const t = core(m[2]);
    const out = t == null ? null : `${m[1]}${t}${m[3]}`;
    if (cache.size > 20000) cache.clear();
    cache.set(text, out);
    return out;
  }
  return translate;
}

// `only`: a selector — then just the parts of the page inside it are translated (the sign-in screens are
// always in English, whatever the interface language).
let only = null;
const skipped = (node) => {
  const start = node.nodeType === 1 ? node : node.parentElement;
  if (only && !start?.closest?.(only)) return true;
  for (let el = start; el; el = el.parentElement) {
    if (SKIP.has(el.tagName) || el.isContentEditable || el.hasAttribute?.('data-no-i18n')) return true;
  }
  return false;
};

/** Translate the page now and keep translating whatever the app renders next. */
export function startTranslator(translate, root = document.body, { scope = null, any = false } = {}) {
  only = scope;
  // A text that keeps being changed back (a browser's own page translation working against this one) is left
  // alone after a few rounds: two translators must never loop and freeze the page.
  const seen = new WeakMap();
  const text = (n) => {
    const t = translate(n.nodeValue);
    if (t == null || t === n.nodeValue || skipped(n)) return;
    const k = (seen.get(n) || 0) + 1;
    if (k > 3) return;
    seen.set(n, k);
    n.nodeValue = t;
  };
  const attrs = (el) => {
    for (const a of ATTRS) {
      const v = el.getAttribute?.(a);
      if (v && (any || CYR.test(v)) && !(only && !el.closest(only))) {
        const t = translate(v);
        const key = `a:${a}`;
        const k = ((seen.get(el) || {})[key] || 0) + 1;
        if (t != null && t !== v && k <= 3) { seen.set(el, { ...(seen.get(el) || {}), [key]: k }); el.setAttribute(a, t); }
      }
    }
  };
  const walk = (node) => {
    if (node.nodeType === 3) { text(node); return; }
    if (node.nodeType !== 1) return;
    attrs(node); // a field's placeholder is translated; what is typed into it never is
    if (skipped(node)) return;
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) text(n); else attrs(n); }
  };
  walk(root);
  const titleOf = () => { if (only) return; const t = translate(document.title); if (t) document.title = t; };
  titleOf();
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') text(m.target);
      else if (m.type === 'attributes') attrs(m.target);
      else m.addedNodes.forEach(walk);
    }
    titleOf();
  });
  obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  if (only) return () => obs.disconnect();
  // Dialogs the browser draws itself.
  const { confirm, alert, prompt } = window;
  window.confirm = (msg) => confirm.call(window, translate(String(msg)) ?? msg);
  window.alert = (msg) => alert.call(window, translate(String(msg)) ?? msg);
  window.prompt = (msg, d) => prompt.call(window, translate(String(msg)) ?? msg, d);
  return () => obs.disconnect();
}
