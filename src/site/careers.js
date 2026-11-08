// Careers: the request form on its own page. The request goes to /api/brief?apply=1 — checked here and again on the
// server with the same rules (src/lib/apply.js).
import './site.css';
import './area.css';
import './chrome.js';
import { checkApplication } from '../lib/apply.js';


const form = document.getElementById('apply');
if (form) {
  const msg = document.getElementById('apply-msg');
  const show = (errors) => {
    for (const el of form.querySelectorAll('.err')) el.textContent = '';
    for (const el of form.querySelectorAll('.fld.bad')) el.classList.remove('bad');
    for (const [k, text] of Object.entries(errors)) {
      const e = document.getElementById(`e-${k}`);
      if (e) e.textContent = text;
      form.querySelector(`[name="${k}"]`)?.closest('.fld')?.classList.add('bad');
    }
    const first = Object.keys(errors)[0];
    if (first) form.querySelector(`[name="${first}"]`)?.focus();
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    data.consent = fd.has('consent');
    const r = checkApplication(data);
    msg.className = 'car-msg'; msg.textContent = '';
    show(r.ok ? {} : r.errors);
    if (!r.ok) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; msg.textContent = 'Sending…';
    try {
      const res = await fetch('/api/brief?apply=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...r.value, website: data.website || '' }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { form.reset(); msg.className = 'car-msg ok'; msg.textContent = 'Thank you — your request has been sent. We will reply by email.'; }
      else { if (j.errors) show(j.errors); msg.className = 'car-msg no'; msg.textContent = j.message || 'Something went wrong. Please write to info@reactioncore.uk.'; }
    } catch {
      msg.className = 'car-msg no'; msg.textContent = 'No connection. Please try again or write to info@reactioncore.uk.';
    } finally { btn.disabled = false; }
  });
}
