// Ask the server to push a notification to these people (api/push.js). Best-effort: silent without push.
import { supabaseOn, authHeaders } from './supabase.js';

export async function notify(to, title, body, url) {
  if (!to?.length || !supabaseOn) return;
  try {
    await fetch(new URL('api/push', document.baseURI), { method: 'POST', headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ to, title, body, url }) });
  } catch { /* push is best-effort */ }
}
