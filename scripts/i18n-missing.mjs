// Interface texts in the code that have no English yet (src/i18n/en.js): run after adding new Ukrainian UI text.
//   node scripts/i18n-missing.mjs
import fs from 'node:fs'; import path from 'node:path';
const skip = /data\/academy\/(?!meta)|orgs-ua\.js|data\/geo\.js|data\/conflicts\.js|lib\/report\.js|lib\/certificate\.js|lib\/brief\.js|v0\/|i18n\//;
const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.jsx$/.test(f) && !skip.test(p)) files.push(p); } };
walk('src');
const { EXACT, TEMPLATES } = await import(new URL('../src/i18n/en.js', import.meta.url));
const have = new Set([...Object.keys(EXACT), ...TEMPLATES.map(([k]) => k)]);
const out = new Set();
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  for (const m of s.matchAll(/(?<=[>}])([^<>{}]*[А-ЯІЇЄҐа-яіїєґ][^<>{}]*)(?=[<{])/g)) {
    const v = m[1].replace(/\s+/g, ' ').trim();
    if (!v || have.has(v) || /[;=`$]|=>|\(\)|\/\*\*|label:|where:|me, '/.test(v)) continue; // code, not text
    out.add(v);
  }
}
console.log([...out].join('\n'));
