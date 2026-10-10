// Keeps the team's shared state in step with the server: people, division records,
// access requests, comments, tasks and the audit log. Works with any backend that offers `docs`
// (watch / put / remove) — today that is Supabase (src/lib/storage.js).
//
// How it reconciles:
//   · The first answer from the server replaces what this browser had (the server is the truth).
//   · After that, a document changed here and not yet confirmed wins over the server's copy;
//     anything else takes the server's version, and documents gone from the server are removed.
//   · Local changes are pushed shortly after they happen. A change the server refuses (for example,
//     row-level security) is reverted by the next pull, and onError reports it.
//   · The audit log is append-only: entries are added, never pushed as deletions.

export const SHARED_KINDS = ['users', 'records', 'requests', 'audit', 'comments', 'tasks'];

const json = (d) => JSON.stringify(d);

// A refusal by row-level security: this sign-in no longer counts (passkey confirmation expired,
// membership suspended) — pushing more would only be refused the same way.
export const isRlsError = (e) => e?.code === '42501' || /row-level security/i.test(e?.message || '');

export function createSync({ docs, getState, dispatch, onError = () => {}, onDenied = () => {} }) {
  const known = {};   // kind → Map(id → JSON of the last version both sides agreed on)
  const pulled = {};  // kind → has the server answered at least once
  let timer = null;
  let pushing = false;
  let again = false;
  const sentAudit = new Set(); // audit entries already sent from this browser

  const stopWatch = docs.watch((kind, remote) => {
    const localArr = getState()[kind] || [];
    const prev = known[kind] || new Map();
    const remoteIds = new Set(remote.map((d) => d.id));
    let items;
    if (!pulled[kind]) {
      // The audit log only grows: entries written here before the first answer (the sign-in itself)
      // join the server's and are pushed; for everything else the server's copy wins.
      items = kind === 'audit' ? [...remote, ...localArr.filter((l) => !remoteIds.has(l.id))] : remote;
    } else {
      const local = new Map(localArr.map((d) => [d.id, d]));
      const pending = (d) => (prev.has(d.id) ? json(d) !== prev.get(d.id) : true);
      items = remote.map((d) => {
        const l = local.get(d.id);
        return l && pending(l) ? l : d;
      });
      for (const l of localArr) {
        if (remoteIds.has(l.id)) continue;
        if (prev.has(l.id)) continue;   // was agreed, now gone from the server: deleted (or out of the audit window)
        items.push(l);                  // created here, not pushed yet
      }
    }
    known[kind] = new Map(remote.map((d) => [d.id, json(d)]));
    pulled[kind] = true;
    dispatch({ type: 'shared/sync', kind, items });
    schedule();
  });

  let denied = false;
  // One refusal stops the batch; the caller re-checks the session.
  const send = async (fn, kind, d) => {
    if (denied) return;
    try { await fn(); } catch (e) {
      if (isRlsError(e)) { denied = true; onDenied(e); } else onError(e, kind, d);
    }
  };

  async function push() {
    if (pushing) { again = true; return; }
    if (denied) return;
    pushing = true;
    try {
      const st = getState();
      for (const kind of SHARED_KINDS) {
        if (!pulled[kind]) continue;
        const prev = known[kind];
        const ids = new Set();
        for (const d of st[kind] || []) {
          ids.add(d.id);
          // Audit: only this person's own entries, each sent once (the server ignores duplicates).
          if (kind === 'audit') {
            if (prev.has(d.id) || sentAudit.has(d.id) || d.actor !== st.session?.userId) continue;
            sentAudit.add(d.id);
            await send(() => docs.put(kind, d), kind, d);
            continue;
          }
          const j = json(d);
          if (prev.get(d.id) === j) continue;
          prev.set(d.id, j);
          await send(() => docs.put(kind, d), kind, d);
        }
        if (kind === 'audit') continue;
        for (const id of [...prev.keys()]) {
          if (ids.has(id)) continue;
          prev.delete(id);
          await send(() => docs.remove(kind, id), kind, { id });
        }
      }
    } finally {
      pushing = false;
      if (again) { again = false; schedule(); }
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(push, 400);
  }

  return {
    changed: schedule,
    stop() { clearTimeout(timer); stopWatch(); },
  };
}
