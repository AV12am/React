// Резервна копія: the team's database tables, compressed and encrypted with a passphrase the company keeps
// (BACKUP_KEY). AES-256-GCM, key from scrypt — tampering or a wrong passphrase fails loudly on restore.
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

// What goes in: everything needed to rebuild the platform's data. Not: one-time codes, challenges,
// confirmations of sign-ins, push devices and session details — they are short-lived or device-bound.
export const BACKUP_TABLES = [
  ['core_members', 'select=id,email,doc'],
  ['core_docs', 'select=kind,id,doc&kind=not.in.(push,session)'],
  ['vault_files', 'select=id,doc'],
  ['vault_folders', 'select=id,doc'],
  ['core_settings', 'select=key,value'],
  ['core_passkeys', 'select=id,member_id,public_key,counter,transports,device,created_at'],
];

const KEYLEN = 32;
const derive = (pass, salt) => scryptSync(String(pass), salt, KEYLEN, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export function encryptBackup(obj, pass) {
  if (!pass || String(pass).length < 16) throw new Error('BACKUP_KEY має бути не коротшим за 16 символів');
  const salt = randomBytes(16); const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', derive(pass, salt), iv);
  const data = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(obj)))), c.final()]);
  const head = { v: 1, alg: 'aes-256-gcm+scrypt+gzip', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') };
  return Buffer.concat([Buffer.from(`${JSON.stringify(head)}\n`), data]);
}

export function decryptBackup(buf, pass) {
  const nl = buf.indexOf(10);
  const head = JSON.parse(buf.subarray(0, nl).toString());
  if (head.v !== 1) throw new Error('Невідомий формат копії');
  const d = createDecipheriv('aes-256-gcm', derive(pass, Buffer.from(head.salt, 'base64')), Buffer.from(head.iv, 'base64'));
  d.setAuthTag(Buffer.from(head.tag, 'base64'));
  return JSON.parse(gunzipSync(Buffer.concat([d.update(buf.subarray(nl + 1)), d.final()])).toString());
}
