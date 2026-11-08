// A request to work with REACTIONcore, sent from the Careers form on the public site: a permanent role or an
// expert collaboration. Checked here (the browser and the server use the same rules) and turned into the letter
// that goes to the team's mailbox. No database: the letter is the record.

export const KINDS = { permanent: 'Permanent role', expert: 'Expert collaboration' };
export const AREAS = ['Analysis and OSINT', 'Research', 'Forecasting', 'Engineering', 'Design', 'Other'];

const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIMITS = { name: 120, email: 160, area: 60, expertise: 300, link: 300, message: 3000 };
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, n);

/** Checks the form. Returns { ok, errors: { field: message }, value } — value is the cleaned application. */
export function checkApplication(input = {}) {
  const v = {
    kind: KINDS[input.kind] ? input.kind : '',
    name: clean(input.name, LIMITS.name),
    email: clean(input.email, LIMITS.email).toLowerCase(),
    area: AREAS.includes(input.area) ? input.area : '',
    expertise: clean(input.expertise, LIMITS.expertise),
    link: clean(input.link, LIMITS.link),
    message: clean(input.message, LIMITS.message),
    consent: input.consent === true || input.consent === 'on' || input.consent === 'true',
  };
  const errors = {};
  if (!v.kind) errors.kind = 'Choose a permanent role or an expert collaboration.';
  if (v.name.length < 2) errors.name = 'Enter your name.';
  if (!MAIL.test(v.email)) errors.email = 'Enter a valid email address.';
  if (!v.area) errors.area = 'Choose an area.';
  if (v.link && !/^https:\/\/[^\s]+\.[^\s]{2,}/i.test(v.link)) errors.link = 'Use a full https:// link, or leave it empty.';
  if (v.message.length < 20) errors.message = 'Tell us a little more (at least 20 characters).';
  if (!v.consent) errors.consent = 'We need your consent to process this request.';
  return { ok: Object.keys(errors).length === 0, errors, value: v };
}

/** True when the hidden field only a robot fills in is filled in. */
export const isBot = (input = {}) => Boolean(String(input.website ?? '').trim());

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The letter to the team: subject, plain text and HTML. */
export function applicationMail(v) {
  const rows = [
    ['Type', KINDS[v.kind]], ['Name', v.name], ['Email', v.email], ['Area', v.area],
    ['Expertise', v.expertise || '—'], ['Link', v.link || '—'],
  ];
  const subject = `Careers · ${KINDS[v.kind]} · ${v.name}`;
  const text = `${rows.map(([k, x]) => `${k}: ${x}`).join('\n')}\n\n${v.message}\n\nConsent to processing: yes`;
  const html = `<table style="font:14px/1.5 system-ui,sans-serif;border-collapse:collapse">${rows.map(([k, x]) => `<tr><td style="padding:2px 16px 2px 0;color:#666">${k}</td><td>${esc(x)}</td></tr>`).join('')}</table>`
    + `<p style="font:14px/1.6 system-ui,sans-serif;white-space:pre-wrap;margin-top:16px">${esc(v.message)}</p>`
    + '<p style="font:12px system-ui,sans-serif;color:#888">Consent to processing: yes</p>';
  return { subject, text, html };
}
