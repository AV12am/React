// Passkeys in the browser (Face ID, Touch ID, Windows Hello, security keys) talking to api/passkey.js.
import { startRegistration, startAuthentication, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from '@simplewebauthn/browser';
import { authHeaders } from './supabase.js';

export { browserSupportsWebAuthn, platformAuthenticatorIsAvailable };

async function call(op, body = {}) {
  const res = await fetch(new URL('api/passkey', document.baseURI), {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ op, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || `HTTP ${res.status}`), { status: res.status, code: data.error });
  return data;
}

// A short, human name for this device, stored next to the key ("iPhone · Safari").
export function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Пристрій';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${os} · ${br}` : os;
}

// What the browser says when the person cancels or the key does not match — in plain words.
export function passkeyError(e) {
  if (e?.name === 'NotAllowedError') return 'Підтвердження скасовано або час вийшов.';
  if (e?.name === 'InvalidStateError') return 'Цей пристрій уже має ключ для вашого облікового запису.';
  if (e?.name === 'NotSupportedError' || e?.name === 'SecurityError') return 'Цей браузер або адреса сайту не підтримують ключі доступу.';
  return e?.message || 'Не вдалося підтвердити.';
}

export const status = () => call('status');

/** Create a passkey on this device. `code` — from CUSTOS, or a CUSTOS recovery code. */
export async function enroll(code) {
  const { options } = await call('register-options', { code });
  const response = await startRegistration({ optionsJSON: options });
  return call('register-verify', { response, device: deviceName() });
}

/** Confirm this sign-in session with an existing passkey. */
export async function confirm() {
  const { options } = await call('login-options');
  const response = await startAuthentication({ optionsJSON: options });
  return call('login-verify', { response });
}

export const listKeys = () => call('keys');
export const removeKey = (id) => call('remove-key', { id });
export const issueCode = (memberId, reset) => call('issue-code', { memberId, reset });
