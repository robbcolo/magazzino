// Collegamento a Firebase: accesso con l'account dello studio e sincronizzazione Firestore.
// Tutti i dati stanno sotto studi/{uid}/… e le regole di sicurezza permettono l'accesso solo a quell'account.
// Firestore tiene una copia locale (IndexedDB): l'app funziona anche offline e invia le modifiche quando torna la rete.
import * as F from '../vendor/firebase.js';

const DAY = 864e5;
export const LOG_DAYS = 130;      // giorni di movimenti tenuti sincronizzati (servono a previsioni e grafici)
export const ORDER_DAYS = 400;    // ordini degli ultimi ~13 mesi

let app = null, auth = null, db = null, uid = null;
let subs = [];
let H = {};                       // gestori forniti dallo store

export const C = {
  user: null,
  pending: false,                 // ci sono modifiche non ancora arrivate al server
  serverSeen: false,              // almeno un aggiornamento è arrivato dal server
  lastServerAt: 0,
  error: null,
};
const pendingBy = {};

// ---------- Configurazione ----------
const LS_KEY = 'magazzino-firebase-config';
const FIELDS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];

export function parseConfigText(text) {
  if (!text) return null;
  const cfg = {};
  for (const m of String(text).matchAll(/["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g)) if (FIELDS.includes(m[1])) cfg[m[1]] = m[2].trim();
  return cfg.apiKey && cfg.projectId ? cfg : null;
}
export function readConfig() {
  const w = typeof window !== 'undefined' ? window.MAGAZZINO_FIREBASE : null;
  if (w && w.apiKey && w.projectId && !/INCOLLA|TUO|xxx/i.test(w.apiKey)) return { ...w, source: 'file' };
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (s && s.apiKey && s.projectId) return { ...s, source: 'device' };
  } catch { /* niente */ }
  return null;
}
export function saveDeviceConfig(cfg) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch { /* niente */ }
}
export function clearDeviceConfig() {
  try { localStorage.removeItem(LS_KEY); } catch { /* niente */ }
}

// ---------- Avvio e accesso ----------
export function init(cfg, handlers) {
  H = handlers;
  const { source, ...conf } = cfg;
  app = F.initializeApp(conf);
  auth = F.initializeAuth(app, { persistence: [F.indexedDBLocalPersistence, F.browserLocalPersistence] });
  try {
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentSingleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch (e) {
    console.warn('Archivio locale non disponibile, uso la memoria', e);
    db = F.initializeFirestore(app, { localCache: F.memoryLocalCache(), ignoreUndefinedProperties: true });
  }
  F.onAuthStateChanged(auth, (u) => {
    stop();
    C.user = u ? { uid: u.uid, email: u.email } : null;
    uid = u ? u.uid : null;
    H.onAuth?.(C.user);
    if (u) start();
  });
}

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Email o password non corrette.',
  'auth/wrong-password': 'Email o password non corrette.',
  'auth/user-not-found': 'Email o password non corrette.',
  'auth/invalid-email': "L'indirizzo email non è valido.",
  'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',
  'auth/network-request-failed': 'Serve una connessione a internet per il primo accesso.',
  'auth/user-disabled': "Questo account è stato disattivato nella console di Firebase.",
  'auth/operation-not-allowed': "L'accesso con email e password non è attivo: abilitalo in Firebase › Authentication.",
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'La configurazione di Firebase non è valida: ricontrolla apiKey.',
  'auth/invalid-api-key': 'La configurazione di Firebase non è valida: ricontrolla apiKey.',
};
export async function signIn(email, password) {
  try {
    await F.signInWithEmailAndPassword(auth, email.trim(), password);
    return null;
  } catch (e) {
    return AUTH_ERRORS[e.code] || `Accesso non riuscito (${e.code || e.message}).`;
  }
}
export async function signOutDevice() {
  stop();
  await F.signOut(auth);
}

// ---------- Percorsi ----------
const base = () => `studi/${uid}`;
const col = (name) => F.collection(db, `${base()}/${name}`);
const ref = (name, id) => F.doc(db, `${base()}/${name}/${id}`);
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ---------- Conversioni ----------
/** Rimuove i valori undefined (Firestore non li accetta e servono confronti esatti per arrayRemove) */
export function clean(v) {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = clean(x);
    return o;
  }
  return v;
}
export function productToCloud(p) {
  const { id, lots, _zeroLots, ...rest } = p;
  const lotsMap = {};
  for (const l of lots || []) lotsMap[l.id] = { lot: l.lot || '', exp: l.exp || '', qty: l.qty || 0 };
  return clean({ ...rest, lots: lotsMap });
}
export function productFromCloud(id, d) {
  const lots = [], zero = [];
  for (const [lid, l] of Object.entries(d.lots || {})) {
    if (l && l.qty > 0) lots.push({ id: lid, lot: l.lot || '', exp: l.exp || '', qty: l.qty });
    else zero.push(lid);
  }
  return {
    ...d, id, qty: Math.max(0, Number(d.qty) || 0), rawQty: Number(d.qty) || 0, lots, _zeroLots: zero,
    codes: d.codes || [], alts: d.alts || [],
  };
}

// ---------- Ascolto delle modifiche ----------
function trackMeta(name, s) {
  pendingBy[name] = s.metadata.hasPendingWrites;
  C.pending = Object.values(pendingBy).some(Boolean);
  if (!s.metadata.fromCache) { C.serverSeen = true; C.lastServerAt = Date.now(); }
}
function listen(name, target, mapFn, isDoc = false) {
  const onErr = (e) => { console.warn('Ascolto', name, e); C.error = e.code || e.message; H.onError?.(name, e); };
  const cb = (s) => {
    trackMeta(name, s);
    const meta = { fromCache: s.metadata.fromCache, pending: s.metadata.hasPendingWrites };
    if (isDoc) H.onDoc?.(name, s.exists() ? s.data() : null, meta);
    else H.onCollection?.(name, s.docs.map((d) => mapFn(d.id, d.data())), meta);
  };
  subs.push(F.onSnapshot(target, { includeMetadataChanges: true }, cb, onErr));
}
function start() {
  const now = Date.now();
  listen('products', col('products'), productFromCloud);
  listen('suppliers', col('suppliers'), (id, d) => ({ ...d, id }));
  listen('categories', col('categories'), (id, d) => ({ ...d, id }));
  listen('orders', F.query(col('orders'), F.where('createdAt', '>=', now - ORDER_DAYS * DAY)), (id, d) => ({ ...d, id }));
  listen('log', F.query(col('log'), F.where(F.documentId(), '>=', dayKey(now - LOG_DAYS * DAY))), (id, d) => ({ day: id, m: d.m || [] }));
  listen('settings', ref('meta', 'settings'), null, true);
  listen('orderList', ref('meta', 'orderList'), null, true);
}
function stop() {
  subs.forEach((u) => { try { u(); } catch { /* già chiuso */ } });
  subs = [];
}

// ---------- Scritture (non si aspetta il server: con la rete assente restano in coda) ----------
const report = (what) => (e) => { console.warn('Scrittura non riuscita', what, e); H.onWriteError?.(what, e); };
export const inc = (n) => F.increment(n);
export const del = () => F.deleteField();

export function putDoc(name, id, data) {
  const d = name === 'products' ? productToCloud(data) : clean(stripId(data));
  F.setDoc(ref(name, id), d).catch(report(name));
}
export function mergeDoc(name, id, data) {
  F.setDoc(ref(name, id), clean(data), { merge: true }).catch(report(name));
}
export function patchDoc(name, id, fields) {
  F.updateDoc(ref(name, id), clean(fields)).catch(report(name));
}
export function removeDoc(name, id) {
  F.deleteDoc(ref(name, id)).catch(report(name));
}
export function appendLog(mv) {
  F.setDoc(ref('log', mv.day), { m: F.arrayUnion(clean(mv)) }, { merge: true }).catch(report('log'));
}
export function removeLog(mv) {
  F.updateDoc(ref('log', mv.day), { m: F.arrayRemove(clean(mv)) }).catch(report('log'));
}
function stripId(d) { const { id, ...rest } = d; return rest; }

/** Molte scritture insieme (in blocchi da 400). ops: {type: 'set'|'merge'|'update'|'delete'|'logAdd'|'logRemove', name, id, data, items} */
export async function batchWrite(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = F.writeBatch(db);
    for (const o of ops.slice(i, i + 400)) {
      const r = ref(o.name, o.id);
      if (o.type === 'set') b.set(r, o.name === 'products' ? productToCloud(o.data) : clean(stripId(o.data)));
      else if (o.type === 'merge') b.set(r, clean(o.data), { merge: true });
      else if (o.type === 'update') b.update(r, clean(o.data));
      else if (o.type === 'delete') b.delete(r);
      else if (o.type === 'logAdd') b.set(r, { m: F.arrayUnion(...o.items.map(clean)) }, { merge: true });
      else if (o.type === 'logRemove') b.update(r, { m: F.arrayRemove(...o.items.map(clean)) });
    }
    b.commit().catch(report('batch'));
  }
}

/** Lettura una tantum (backup, attività più vecchie) */
export async function getAll(name, beforeDay) {
  const q = beforeDay ? F.query(col(name), F.where(F.documentId(), '<', beforeDay)) : col(name);
  const s = await F.getDocs(q);
  return s.docs.map((d) => ({ id: d.id, data: d.data() }));
}

/** Cancella tutti i dati dello studio (usato da «Ricomincia da capo» e dal ripristino di un backup) */
export async function wipeAll() {
  const ops = [];
  for (const name of ['products', 'suppliers', 'categories', 'orders', 'log']) {
    for (const d of await getAll(name)) ops.push({ type: 'delete', name, id: d.id });
  }
  ops.push({ type: 'delete', name: 'meta', id: 'settings' }, { type: 'delete', name: 'meta', id: 'orderList' });
  await batchWrite(ops);
}

export const isReady = () => !!db && !!uid;
