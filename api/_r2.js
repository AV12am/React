// Cloudflare R2 (S3-compatible, 10 ГБ безкоштовно) as the second store for attachments.
// Addresses are signed here with AWS Signature V4 (query-string form), so the keys never leave the server
// and the browser uploads and reads file bodies directly with one-off addresses.
//
// Vercel environment: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
import crypto from 'node:crypto';
import { env } from './_core.js';

const ACCOUNT = env.R2_ACCOUNT_ID || '';
const KEY_ID = env.R2_ACCESS_KEY_ID || '';
const SECRET = env.R2_SECRET_ACCESS_KEY || '';
const BUCKET = env.R2_BUCKET || '';
export const r2On = !!(ACCOUNT && KEY_ID && SECRET && BUCKET);

const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// RFC 3986, as SigV4 wants it.
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** A presigned address for `method` on object `key`, valid `expires` seconds. */
export function presign(method, key, { expires = 600, now = new Date(), host = `${ACCOUNT}.r2.cloudflarestorage.com`, bucket = BUCKET, region = 'auto', keyId = KEY_ID, secret = SECRET } = {}) {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const path = `${bucket ? `/${bucket}` : ''}/${key.split('/').map(enc).join('/')}`;
  const query = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${keyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  ].map(([k, v]) => `${enc(k)}=${enc(v)}`).sort().join('&');
  const canonical = [method, path, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const kSign = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), 's3'), 'aws4_request');
  return `https://${host}${path}?${query}&X-Amz-Signature=${hmac(kSign, toSign).toString('hex')}`;
}

/** The stored size of an object in bytes, or null when it is not there. */
export async function r2Size(key) {
  const res = await fetch(presign('HEAD', key, { expires: 60 }), { method: 'HEAD' });
  if (!res.ok) return null;
  return Number(res.headers.get('content-length')) || 0;
}

export async function r2Delete(key) {
  const res = await fetch(presign('DELETE', key, { expires: 60 }), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`r2 ${res.status}`);
}
