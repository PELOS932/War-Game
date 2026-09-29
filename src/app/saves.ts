/** Game saves live in IndexedDB (saves are several MB, too big for localStorage). */
const DB = 'sovereign-command-saves';
const STORE = 'saves';
const FLAG = 'sovereign-command-2030:has-save';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeSave(key: string, json: string): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  const ok = await new Promise<boolean>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(json, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
  if (ok) try { localStorage.setItem(FLAG, '1'); } catch { /* ignore */ }
  return ok;
}

export async function readSave(key: string): Promise<string | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
    req.onerror = () => resolve(null);
  });
}

export function hasSaveFlag(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}
