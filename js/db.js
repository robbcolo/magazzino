// Archivio locale su IndexedDB (resta sull'iPad, funziona offline).
// Se IndexedDB non è disponibile l'app funziona in memoria (i dati si perdono alla chiusura).

const DB_NAME = 'magazzino-studio';
const DB_VER = 1;
export const STORES = ['users', 'products', 'suppliers', 'categories', 'movements', 'orders', 'kv'];

let db = null;
let pending = [];
let flushTimer = null;
export let persistent = false;

export function open() {
  return new Promise((resolve) => {
    try {
      if (!('indexedDB' in window)) return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      };
      req.onsuccess = () => { db = req.result; persistent = true; resolve(db); };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

export function getAll(store) {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

function schedule() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 0);
}

export function flush() {
  flushTimer = null;
  if (!db || !pending.length) { pending = []; return Promise.resolve(); }
  const ops = pending;
  pending = [];
  return new Promise((resolve) => {
    try {
      const stores = [...new Set(ops.map((o) => o.store))];
      const tx = db.transaction(stores, 'readwrite');
      for (const o of ops) {
        const os = tx.objectStore(o.store);
        if (o.type === 'put') os.put(o.value);
        else if (o.type === 'del') os.delete(o.id);
        else if (o.type === 'clear') os.clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => { console.error('Errore di salvataggio', tx.error); resolve(); };
    } catch (e) { console.error(e); resolve(); }
  });
}

export function put(store, value) { pending.push({ type: 'put', store, value: clone(value) }); schedule(); }
export function del(store, id) { pending.push({ type: 'del', store, id }); schedule(); }
export function clear(store) { pending.push({ type: 'clear', store }); schedule(); }

function clone(v) {
  try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); }
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* non supportato */ }
  return false;
}

export async function estimate() {
  try { return await navigator.storage.estimate(); } catch { return null; }
}
