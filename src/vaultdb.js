// File bodies for the vault live in IndexedDB on this device; metadata lives in the app store.
const DB = 'voloshynsky-vault';
const STORE = 'blobs';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error);
  });
}

export const putBlob = (id, blob) => tx('readwrite', (s) => s.put(blob, id));
export const getBlob = (id) => tx('readonly', (s) => s.get(id));
export const deleteBlob = (id) => tx('readwrite', (s) => s.delete(id));
export const clearBlobs = () => tx('readwrite', (s) => s.clear());
