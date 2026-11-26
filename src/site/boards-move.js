// The dashboards and tables made while SITUATION was open to everyone stayed in this browser, owned by «local». On the
// first sign-in they move into the person's account (src/site/situation-main.jsx), the owner set to them. The browser's
// copy is kept and marked moved for that person, so it is never brought in twice; a move that fails half-way leaves no
// mark and is tried again on the next visit (a row written twice is the same row: user_id + id).
export const MOVED = 'reaction-site/boards-moved';

export async function bringLocal(uid, putRow, rows, store) {
  let done = false;
  try { done = store?.getItem(MOVED) === uid; } catch { /* private mode */ }
  const list = Object.entries(rows || {}).filter(([, doc]) => doc && typeof doc === 'object');
  if (!uid || done || !list.length) return 0;
  for (const [key, doc] of list) {
    await putRow(uid, key, { ...doc, owner: !doc.owner || doc.owner === 'local' ? uid : doc.owner, updated: new Date().toISOString() });
  }
  try { store?.setItem(MOVED, uid); } catch { /* private mode */ }
  return list.length;
}
