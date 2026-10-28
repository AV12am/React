// Дозволені IP-адреси доступу: a person's card may list the addresses (or networks, CIDR) of their devices;
// then they are let in only from those. Shared by the browser (checking what is typed) and the server
// functions (api/_core.js, api/passkey.js, api/signin.js); the database checks the same in core_me().

/** An address as a BigInt with its family, or null: IPv4 (1.2.3.4), IPv6 (2001:db8::1), IPv4-mapped IPv6. */
export function parseIp(s) {
  const t = String(s || '').trim().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const v4 = (x) => {
    const p = x.split('.');
    if (p.length !== 4 || p.some((n) => !/^\d{1,3}$/.test(n) || +n > 255)) return null;
    return p.reduce((a, n) => (a << 8n) + BigInt(+n), 0n);
  };
  if (/^[\d.]+$/.test(t)) { const n = v4(t); return n == null ? null : { v: 4, n }; }
  if (!/^[\da-f:.]+$/i.test(t) || !t.includes(':')) return null;
  let tail = [];
  let s6 = t;
  const m = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(t);
  if (m) { const n = v4(m[2]); if (n == null) return null; tail = [(n >> 16n) & 0xffffn, n & 0xffffn].map((x) => x.toString(16)); s6 = m[1] + tail.join(':'); }
  const halves = s6.split('::');
  if (halves.length > 2) return null;
  const part = (h) => (h ? h.split(':') : []);
  const a = part(halves[0]), b = halves.length === 2 ? part(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - a.length - b.length : 0;
  if (fill < 0 || (halves.length === 1 && a.length !== 8)) return null;
  const groups = [...a, ...Array(fill).fill('0'), ...b];
  if (groups.length !== 8 || groups.some((g) => !/^[\da-f]{1,4}$/i.test(g))) return null;
  const n = groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g, 16)), 0n);
  // ::ffff:1.2.3.4 is the IPv4 address itself.
  if (n >> 32n === 0xffffn) return { v: 4, n: n & 0xffffffffn };
  return { v: 6, n };
}

/** «1.2.3.4», «10.0.0.0/24», «2001:db8::/48» → { v, n, bits } or null. */
export function parseRule(s) {
  const [addr, len, extra] = String(s || '').trim().split('/');
  if (extra != null) return null;
  const ip = parseIp(addr);
  if (!ip) return null;
  const max = ip.v === 4 ? 32 : 128;
  const bits = len == null || len === '' ? max : /^\d{1,3}$/.test(len) ? +len : NaN;
  if (!(bits >= 0 && bits <= max)) return null;
  return { ...ip, bits };
}

export const validRule = (s) => !!parseRule(s);

/** Whether `ip` falls within the rule. */
export function ruleMatches(rule, ip) {
  const r = typeof rule === 'string' ? parseRule(rule) : rule;
  const a = typeof ip === 'string' ? parseIp(ip) : ip;
  if (!r || !a || r.v !== a.v) return false;
  const shift = BigInt((r.v === 4 ? 32 : 128) - r.bits);
  return (r.n >> shift) === (a.n >> shift);
}

/** The rules on a person's card: [{ ip, note }] (strings are accepted too). */
export const rulesOf = (person) => (Array.isArray(person?.ips) ? person.ips : [])
  .map((x) => (typeof x === 'string' ? { ip: x, note: '' } : { ip: String(x?.ip || ''), note: String(x?.note || '') }))
  .filter((x) => x.ip);

/** May this person come in from `ip`? No list — any address; a list — only those (an unknown address never). */
export function ipAllowed(person, ip) {
  const rules = rulesOf(person);
  if (!rules.length) return true;
  return !!ip && rules.some((r) => ruleMatches(r.ip, ip));
}

/** The caller's address as Vercel sees it (Vercel sets these headers itself; what the browser sends is replaced). */
export function clientIp(req) {
  const h = (k) => req.headers.get(k) || '';
  return (h('x-real-ip') || h('x-vercel-forwarded-for') || h('x-forwarded-for')).split(',')[0].trim() || null;
}
