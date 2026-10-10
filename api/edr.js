// Vercel Function: «Перевірити ЄДР» from a company card (scripts/lib/edr.mjs).
//
// POST /api/edr  { codes: ["40075815", …] }   Authorization: Bearer <Supabase access token>
//   Returns each company's current register snapshot; the app compares it with the one on the record,
//   stores the new one and files an intake item for any change (through row-level security, as the caller).
// The daily check of watched companies runs inside the conveyor's cron (api/watch.js GET).
// Needs EDR_API_KEY (Opendatabot corporate key); EDR_API_URL may override the endpoint ({code}, {key}).
import { env, json, caller, SB_URL, SERVICE } from './_core.js';
import { normalizeEdr, edrUrl, EDR_DEFAULT_URL } from '../scripts/lib/edr.mjs';

export const config = { maxDuration: 30 };
const KEY = env.EDR_API_KEY || '';
const URL_T = env.EDR_API_URL || EDR_DEFAULT_URL;

export async function fetchEdr(code) {
  const res = await fetch(edrUrl(code, { url: URL_T, key: KEY }), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout?.(15_000) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'ключ API не прийнято' : res.status === 404 ? 'компанію не знайдено' : `HTTP ${res.status}`);
  const data = normalizeEdr(await res.json());
  if (!data?.name) throw new Error('порожня відповідь реєстру');
  return data;
}

export async function POST(req) {
  if (!KEY) return json(503, { error: 'not_configured', message: 'Перевірка ЄДР не налаштована: додайте EDR_API_KEY (ключ Opendatabot) у Vercel' });
  try {
    if (SB_URL && SERVICE && !(await caller(req))) return json(401, { error: 'signin', message: 'Потрібен вхід із підтвердженням ключем' });
    const body = await req.json().catch(() => ({}));
    const codes = [...new Set((Array.isArray(body.codes) ? body.codes : []).map(String).filter((c) => /^\d{8}$/.test(c)))].slice(0, 20);
    if (!codes.length) return json(400, { error: 'codes', message: 'Потрібен код ЄДРПОУ (8 цифр)' });
    const out = [];
    for (const code of codes) {
      try { out.push({ code, data: await fetchEdr(code) }); } catch (e) { out.push({ code, error: e.message }); }
    }
    return json(200, { checked: new Date().toISOString(), results: out });
  } catch (e) {
    return json(500, { error: 'error', message: e.message });
  }
}
