// Stato dell'app, azioni e salvataggio.
import * as db from './db.js';
import {
  DEFAULT_SETTINGS, DAY, computeProduct, incomingMap, buildOrderList, takeFromLots, trimLots,
  applyLotDelta, startOfDay, norm, isoDate, priceFor,
} from './logic.js';

export const APP_VERSION = '1.0.0';

export const S = {
  ready: false,
  users: [], products: [], suppliers: [], categories: [], movements: [], orders: [],
  settings: { ...DEFAULT_SETTINGS },
  orderList: {},
  session: { userId: null, lastActive: 0 },
  v: 0,   // cambia a ogni modifica (anche di interfaccia)
  dv: 0,  // cambia solo quando cambiano i dati
};

// ---------- Notifica dei cambiamenti ----------
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
let scheduled = false;
export function emit() {
  S.v++;
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => { scheduled = false; listeners.forEach((f) => f()); });
}
function touch() { S.dv++; emit(); updateBadge(); }

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- Ricerche rapide ----------
let maps = { dv: -1 };
function M() {
  if (maps.dv !== S.dv) {
    maps = {
      dv: S.dv,
      p: new Map(S.products.map((x) => [x.id, x])),
      s: new Map(S.suppliers.map((x) => [x.id, x])),
      u: new Map(S.users.map((x) => [x.id, x])),
      c: new Map(S.categories.map((x) => [x.id, x])),
      o: new Map(S.orders.map((x) => [x.id, x])),
      code: new Map(S.products.flatMap((p) => (p.codes || []).map((k) => [k, p.id]))),
    };
  }
  return maps;
}
export const product = (id) => M().p.get(id);
export const supplier = (id) => M().s.get(id);
export const user = (id) => M().u.get(id);
export const category = (id) => M().c.get(id);
export const order = (id) => M().o.get(id);
export const productByCode = (key) => { const id = M().code.get(key); return id ? product(id) : null; };
export const me = () => user(S.session.userId);
export const isAdmin = () => me()?.role === 'admin';
export const respFor = (p) => p.respId || category(p.catId)?.respId || null;

// ---------- Dati calcolati ----------
let der = { key: '' };
export function derived() {
  const now = Date.now();
  const key = `${S.dv}:${isoDate(now)}`;
  if (der.key === key) return der;
  const inc = incomingMap(S.orders);
  const movBy = new Map();
  for (const m of S.movements) {
    if (m.type !== 'scarico') continue;
    if (!movBy.has(m.productId)) movBy.set(m.productId, []);
    movBy.get(m.productId).push(m);
  }
  const map = new Map();
  const counts = { esaurito: 0, ordinare: 0, basso: 0, arrivo: 0, ok: 0, scadenza: 0, scaduti: 0 };
  for (const p of S.products) {
    const d = computeProduct(p, { now, settings: S.settings, supplier: supplier(p.supplierId), movements: movBy.get(p.id) || [], incoming: inc.get(p.id) || 0 });
    map.set(p.id, d);
    counts[d.status]++;
    if (d.expiring.length || d.expired.length) counts.scadenza++;
    if (d.expired.length) counts.scaduti++;
  }
  const groups = buildOrderList({ products: S.products, suppliers: S.suppliers, derived: map, list: S.orderList, now });
  const toOrder = groups.reduce((s, g) => s + g.items.length, 0);
  const today = startOfDay(now);
  const open = S.orders.filter((o) => o.status === 'ordinato' || o.status === 'parziale');
  const late = open.filter((o) => o.expectedAt && o.expectedAt < today);
  der = { key, now, map, counts, groups, toOrder, open, late };
  return der;
}
export const dp = (id) => derived().map.get(id);

// ---------- Caricamento ----------
export async function load() {
  await db.open();
  const [users, products, suppliers, categories, movements, orders, kv] = await Promise.all(db.STORES.map((s) => db.getAll(s)));
  Object.assign(S, { users, products, suppliers, categories, movements, orders });
  S.movements.sort((a, b) => a.ts - b.ts);
  const kvm = Object.fromEntries(kv.map((k) => [k.id, k.data]));
  S.settings = { ...DEFAULT_SETTINGS, ...(kvm.settings || {}) };
  S.orderList = kvm.orderList || {};
  S.session = kvm.session || { userId: null, lastActive: 0 };
  if (S.session.userId && !user(S.session.userId)) S.session.userId = null;
  checkLock();
  S.ready = true;
  db.requestPersistence();
  touch();
}

const saveKV = (id, data) => db.put('kv', { id, data });

// ---------- Impostazioni e sessione ----------
export function setSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  saveKV('settings', S.settings);
  touch();
}

export function login(userId) {
  S.session = { userId, lastActive: Date.now() };
  saveKV('session', S.session);
  emit();
}
export function logout() {
  S.session = { userId: null, lastActive: 0 };
  saveKV('session', S.session);
  emit();
}
let lastSaved = 0;
export function ping() {
  if (!S.session.userId) return;
  S.session.lastActive = Date.now();
  if (Date.now() - lastSaved > 20000) { lastSaved = Date.now(); saveKV('session', S.session); }
}
export function checkLock() {
  const mins = S.settings.lockMinutes;
  if (!S.session.userId || !mins) return false;
  if (Date.now() - (S.session.lastActive || 0) > mins * 60e3) { logout(); return true; }
  return false;
}

export function pinHash(userId, pin) {
  // hash locale (FNV-1a): il PIN serve a evitare scambi di profilo, non è una protezione forte
  let h = 0x811c9dc5;
  for (const ch of `${userId}:${pin}:magazzino`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

// ---------- Registro attività ----------
function log(m) {
  const mv = { id: uid(), ts: Date.now(), userId: S.session.userId, ...m };
  S.movements.push(mv);
  db.put('movements', mv);
  return mv;
}

// ---------- Movimenti di magazzino ----------
/**
 * type: 'scarico' (amount = unità prese), 'carico' (amount = unità aggiunte),
 *       'rettifica' (amount = nuova quantità contata), 'scarto' (opts.lotId = lotto da eliminare)
 */
export function stockMove(pid, type, amount, opts = {}) {
  const p = product(pid);
  if (!p) return null;
  const before = Math.max(0, p.qty || 0);
  let lots = p.lots || [];
  let delta = 0, lotDelta = [];
  if (type === 'scarico') {
    delta = -Math.min(amount, before);
    const r = takeFromLots(lots, -delta);
    lots = r.lots; lotDelta = r.delta;
  } else if (type === 'carico') {
    delta = amount;
    if (opts.lot || opts.exp) {
      const lotName = (opts.lot || '').trim();
      let l = lots.find((x) => (x.lot || '') === lotName && (x.exp || '') === (opts.exp || ''));
      lots = lots.map((x) => ({ ...x }));
      if (l) { l = lots.find((x) => x.id === l.id); l.qty += amount; }
      else { l = { id: uid(), lot: lotName, exp: opts.exp || '', qty: amount }; lots.push(l); }
      lotDelta = [{ id: l.id, lot: l.lot, exp: l.exp, d: amount }];
    }
  } else if (type === 'rettifica') {
    delta = Math.max(0, amount) - before;
    if (delta < 0) { const r = trimLots(lots, Math.max(0, amount)); lots = r.lots; lotDelta = r.delta; }
  } else if (type === 'scarto') {
    const l = lots.find((x) => x.id === opts.lotId);
    if (!l) return null;
    delta = -Math.min(l.qty, before);
    lots = lots.filter((x) => x.id !== l.id);
    lotDelta = [{ id: l.id, lot: l.lot, exp: l.exp, d: -l.qty }];
  }
  if (delta === 0 && type !== 'rettifica') return null;
  p.qty = before + delta;
  p.lots = lots;
  p.updatedAt = Date.now();
  db.put('products', p);
  const mv = log({
    productId: pid, pname: p.name, unit: p.unit, type, qty: delta, before, after: p.qty, lotDelta,
    lot: opts.lot || (lotDelta.length === 1 ? lotDelta[0].lot : undefined),
    exp: opts.exp || undefined, note: opts.note || undefined, orderId: opts.orderId || undefined,
  });
  touch();
  return mv;
}

export function undoMove(mvId) {
  const i = S.movements.findIndex((m) => m.id === mvId);
  if (i < 0) return;
  const mv = S.movements[i];
  const p = product(mv.productId);
  if (p && typeof mv.qty === 'number') {
    p.qty = Math.max(0, (p.qty || 0) - mv.qty);
    p.lots = applyLotDelta(p.lots || [], mv.lotDelta || [], -1);
    db.put('products', p);
  }
  S.movements.splice(i, 1);
  db.del('movements', mvId);
  touch();
}

// ---------- Prodotti ----------
export function saveProduct(data) {
  const now = Date.now();
  if (!data.id) {
    const p = {
      id: uid(), name: '', brand: '', catId: S.categories[0]?.id || null, unit: 'pz', packSize: 1, packLabel: 'confezione',
      qty: 0, min: 0, max: null, location: '', respId: null, supplierId: null, supplierCode: '', price: null, alts: [],
      codes: [], trackExpiry: false, lots: [], leadDays: null, note: '', photo: null,
      ...data, createdAt: now, updatedAt: now,
    };
    p.id = uid();
    const initial = Math.max(0, +data.qty || 0);
    p.qty = initial;
    if (initial && (data.firstLot || data.firstExp)) p.lots = [{ id: uid(), lot: data.firstLot || '', exp: data.firstExp || '', qty: initial }];
    delete p.firstLot; delete p.firstExp;
    for (const k of p.codes) removeCodeElsewhere(k, p.id);
    S.products.push(p);
    db.put('products', p);
    log({ productId: p.id, pname: p.name, unit: p.unit, type: 'nuovo', qty: initial, before: 0, after: initial });
    touch();
    return p;
  }
  const p = product(data.id);
  if (!p) return null;
  const { qty, lots, firstLot, firstExp, ...rest } = data;
  Object.assign(p, rest, { updatedAt: now });
  for (const k of p.codes || []) removeCodeElsewhere(k, p.id);
  db.put('products', p);
  const last = S.movements[S.movements.length - 1];
  if (!(last && last.type === 'modifica' && last.productId === p.id && last.userId === S.session.userId && now - last.ts < 10 * 60e3)) {
    log({ productId: p.id, pname: p.name, type: 'modifica' });
  }
  touch();
  return p;
}

function removeCodeElsewhere(key, keepId) {
  for (const o of S.products) {
    if (o.id !== keepId && o.codes?.includes(key)) {
      o.codes = o.codes.filter((k) => k !== key);
      db.put('products', o);
    }
  }
}

export function linkCode(pid, key) {
  const p = product(pid);
  if (!p || !key) return;
  removeCodeElsewhere(key, pid);
  p.codes = [...new Set([...(p.codes || []), key])];
  db.put('products', p);
  touch();
}
export function unlinkCode(pid, key) {
  const p = product(pid);
  if (!p) return;
  p.codes = (p.codes || []).filter((k) => k !== key);
  db.put('products', p);
  touch();
}

export function deleteProduct(id) {
  const p = product(id);
  if (!p) return;
  S.products = S.products.filter((x) => x.id !== id);
  db.del('products', id);
  if (S.orderList[id]) { delete S.orderList[id]; saveKV('orderList', S.orderList); }
  log({ productId: id, pname: p.name, type: 'elimina' });
  touch();
}

// ---------- Fornitori ----------
export function saveSupplier(data) {
  if (!data.id) {
    const s = { name: '', web: '', email: '', phone: '', whatsapp: '', agent: '', leadDays: 3, freeShip: null, note: '', ...data, id: uid(), createdAt: Date.now() };
    S.suppliers.push(s);
    db.put('suppliers', s);
    touch();
    return s;
  }
  const s = supplier(data.id);
  Object.assign(s, data);
  db.put('suppliers', s);
  touch();
  return s;
}
export function deleteSupplier(id) {
  S.suppliers = S.suppliers.filter((s) => s.id !== id);
  db.del('suppliers', id);
  for (const p of S.products) {
    let changed = false;
    if (p.supplierId === id) { p.supplierId = null; changed = true; }
    if (p.alts?.some((a) => a.supplierId === id)) { p.alts = p.alts.filter((a) => a.supplierId !== id); changed = true; }
    if (changed) db.put('products', p);
  }
  touch();
}

// ---------- Categorie ----------
export function saveCategory(data) {
  if (!data.id) {
    const c = { name: '', emoji: '📦', color: 'sky', respId: null, order: S.categories.length, ...data, id: uid() };
    S.categories.push(c);
    db.put('categories', c);
    touch();
    return c;
  }
  const c = category(data.id);
  Object.assign(c, data);
  db.put('categories', c);
  touch();
  return c;
}
export function deleteCategory(id) {
  if (S.products.some((p) => p.catId === id)) return false;
  S.categories = S.categories.filter((c) => c.id !== id);
  db.del('categories', id);
  touch();
  return true;
}

// ---------- Persone ----------
export function saveUser(data) {
  if (!data.id) {
    const u = { name: '', fullName: '', role: 'assistente', color: 'petrol', pin: null, ...data, id: uid() };
    S.users.push(u);
    db.put('users', u);
    touch();
    return u;
  }
  const u = user(data.id);
  Object.assign(u, data);
  db.put('users', u);
  touch();
  return u;
}
export function deleteUser(id) {
  S.users = S.users.filter((u) => u.id !== id);
  db.del('users', id);
  for (const c of S.categories) if (c.respId === id) { c.respId = null; db.put('categories', c); }
  for (const p of S.products) if (p.respId === id) { p.respId = null; db.put('products', p); }
  touch();
}

// ---------- Lista da ordinare ----------
function saveList() { saveKV('orderList', S.orderList); touch(); }
export function listSet(pid, patch) {
  S.orderList[pid] = { ...(S.orderList[pid] || {}), ...patch };
  saveList();
}
export function listAdd(pid, packs) {
  S.orderList[pid] = { ...(S.orderList[pid] || {}), manual: true, packs: packs ?? S.orderList[pid]?.packs ?? null, skip: null };
  saveList();
}
export function listRemove(pid) {
  const p = product(pid);
  const e = S.orderList[pid] || {};
  const d = dp(pid);
  const auto = d && (d.status === 'esaurito' || d.status === 'ordinare');
  if (auto) S.orderList[pid] = { ...e, manual: false, skip: { at: Date.now(), qty: p?.qty } };
  else delete S.orderList[pid];
  saveList();
}
export function listRestore(pid) {
  const e = S.orderList[pid] || {};
  S.orderList[pid] = { ...e, skip: null };
  saveList();
}

// ---------- Ordini ----------
export function createOrder({ supplierId, items, expectedAt, note, text }) {
  const s = supplier(supplierId);
  const o = {
    id: uid(), supplierId: supplierId || null, supplierName: s?.name || 'Senza fornitore', status: 'ordinato',
    items: items.map((it) => ({
      productId: it.p.id, name: it.p.name, unit: it.p.unit, packSize: it.p.packSize || 1, packLabel: it.p.packLabel || 'confezione',
      packs: it.packs, price: it.price ?? null, receivedUnits: 0,
    })),
    createdAt: Date.now(), orderedBy: S.session.userId, expectedAt: expectedAt || null, note: note || '', text: text || '',
  };
  o.total = o.items.reduce((sum, it) => sum + (it.price || 0) * it.packs, 0);
  S.orders.push(o);
  db.put('orders', o);
  for (const it of items) delete S.orderList[it.p.id];
  saveKV('orderList', S.orderList);
  log({ type: 'ordine', orderId: o.id, text: `${o.items.length} ${o.items.length === 1 ? 'articolo' : 'articoli'} da ${o.supplierName}` });
  touch();
  return o;
}

export function receiveOrder(orderId, rows) {
  const o = order(orderId);
  if (!o) return;
  let units = 0;
  for (const r of rows) {
    if (!(r.units > 0)) continue;
    const it = o.items.find((x) => x.productId === r.productId);
    stockMove(r.productId, 'carico', r.units, { lot: r.lot, exp: r.exp, orderId, note: `Arrivo ordine ${o.supplierName}` });
    if (it) {
      it.receivedUnits = (it.receivedUnits || 0) + r.units;
      if (r.price != null && r.price !== '' && !Number.isNaN(+r.price)) {
        it.price = +r.price;
        const p = product(r.productId);
        if (p) {
          if (!o.supplierId || o.supplierId === p.supplierId) p.price = +r.price;
          else { const a = (p.alts || []).find((x) => x.supplierId === o.supplierId); if (a) a.price = +r.price; }
          db.put('products', p);
        }
      }
    }
    units += r.units;
  }
  const done = o.items.every((it) => (it.receivedUnits || 0) >= it.packs * it.packSize);
  o.status = done ? 'arrivato' : 'parziale';
  if (done) o.receivedAt = Date.now();
  o.total = o.items.reduce((sum, it) => sum + (it.price || 0) * it.packs, 0);
  db.put('orders', o);
  log({ type: 'arrivo', orderId, text: `${done ? 'Ordine completo' : 'Arrivo parziale'} da ${o.supplierName}` });
  touch();
}
export function closeOrder(orderId) {
  const o = order(orderId);
  o.status = 'arrivato';
  o.receivedAt = Date.now();
  o.closedPartial = true;
  db.put('orders', o);
  touch();
}
export function cancelOrder(orderId) {
  const o = order(orderId);
  o.status = 'annullato';
  db.put('orders', o);
  log({ type: 'annullato', orderId, text: `Ordine annullato (${o.supplierName})` });
  touch();
}
export function updateOrder(orderId, patch) {
  const o = order(orderId);
  Object.assign(o, patch);
  db.put('orders', o);
  touch();
}

// ---------- Primo avvio ----------
export const DEFAULT_CATEGORIES = [
  ['Conservativa', '🦷', 'sky'], ['Endodonzia', '🪡', 'lilac'], ['Protesi', '👑', 'sand'], ['Implantologia', '🔩', 'slate'],
  ['Chirurgia', '✂️', 'rose'], ['Parodontologia e igiene', '🪥', 'mint'], ['Ortodonzia', '😁', 'peach'],
  ['Anestesia e farmaci', '💉', 'coral'], ['Sterilizzazione', '🧼', 'aqua'], ['Monouso e DPI', '🧤', 'leaf'],
  ['Impronte', '🧪', 'lemon'], ['Radiologia', '🩻', 'grape'], ['Studio e cancelleria', '📎', 'stone'],
];
export const DEFAULT_SUPPLIERS = [
  { name: 'Dontalia', web: 'https://www.dontalia.it', leadDays: 3 },
  { name: 'Dental Leader', web: 'https://dental-leader.it', leadDays: 3 },
  { name: 'Umbra', web: 'https://umbra.it', leadDays: 3 },
  { name: 'Dental Today', web: 'https://www.dentaltoday.it', leadDays: 4 },
  { name: 'Eli-Dent', web: 'https://www.elidentgroup.it', leadDays: 3 },
];

export function setupStudio({ users, studioName }) {
  S.users = []; S.categories = []; S.suppliers = [];
  for (const u of users) saveUser(u);
  DEFAULT_CATEGORIES.forEach(([name, emoji, color], i) => saveCategory({ name, emoji, color, order: i }));
  for (const s of DEFAULT_SUPPLIERS) saveSupplier(s);
  setSettings({ studioName: studioName || DEFAULT_SETTINGS.studioName, setupDone: true });
}

// ---------- Dati di esempio ----------
export async function loadDemo() {
  const { buildDemo } = await import('./demo.js');
  const data = buildDemo({ now: Date.now(), users: S.users, categories: S.categories, suppliers: S.suppliers, uid });
  for (const s of S.suppliers) db.put('suppliers', s); // soglie di spedizione gratuita d'esempio
  for (const s of data.suppliers) { S.suppliers.push(s); db.put('suppliers', s); }
  for (const c of data.categoryResp) { const cat = category(c.id); if (cat) { cat.respId = c.respId; db.put('categories', cat); } }
  for (const p of data.products) { S.products.push(p); db.put('products', p); }
  for (const m of data.movements) { S.movements.push(m); db.put('movements', m); }
  S.movements.sort((a, b) => a.ts - b.ts);
  for (const o of data.orders) { S.orders.push(o); db.put('orders', o); }
  setSettings({ demo: true });
  touch();
}
export function removeDemo() {
  const ids = new Set(S.products.filter((p) => p.demo).map((p) => p.id));
  for (const id of ids) db.del('products', id);
  S.products = S.products.filter((p) => !p.demo);
  for (const m of S.movements) if (m.demo) db.del('movements', m.id);
  S.movements = S.movements.filter((m) => !m.demo);
  for (const o of S.orders) if (o.demo) db.del('orders', o.id);
  S.orders = S.orders.filter((o) => !o.demo);
  for (const s of S.suppliers) if (s.demo) db.del('suppliers', s.id);
  S.suppliers = S.suppliers.filter((s) => !s.demo);
  for (const id of ids) delete S.orderList[id];
  saveKV('orderList', S.orderList);
  setSettings({ demo: false });
  touch();
}

// ---------- Backup ----------
export function exportBackup() {
  return {
    app: 'magazzino-studio', version: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
    data: {
      users: S.users, products: S.products, suppliers: S.suppliers, categories: S.categories,
      movements: S.movements, orders: S.orders, settings: S.settings, orderList: S.orderList,
    },
  };
}
export function markBackup() { setSettings({ lastBackup: Date.now() }); }

export async function importBackup(obj) {
  if (!obj || obj.app !== 'magazzino-studio' || !obj.data) throw new Error('Il file non è un backup di questa app.');
  const d = obj.data;
  for (const s of db.STORES) db.clear(s);
  for (const k of ['users', 'products', 'suppliers', 'categories', 'movements', 'orders']) {
    S[k] = Array.isArray(d[k]) ? d[k] : [];
    for (const r of S[k]) db.put(k, r);
  }
  S.movements.sort((a, b) => a.ts - b.ts);
  S.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}), setupDone: true };
  S.orderList = d.orderList || {};
  saveKV('settings', S.settings);
  saveKV('orderList', S.orderList);
  S.session = { userId: null, lastActive: 0 };
  saveKV('session', S.session);
  await db.flush();
  touch();
}

export async function resetAll() {
  for (const s of db.STORES) db.clear(s);
  await db.flush();
  Object.assign(S, { users: [], products: [], suppliers: [], categories: [], movements: [], orders: [], orderList: {}, settings: { ...DEFAULT_SETTINGS }, session: { userId: null, lastActive: 0 } });
  touch();
}

// ---------- CSV ----------
export const CSV_COLUMNS = ['nome', 'marca', 'categoria', 'quantita', 'unita', 'pezzi_per_confezione', 'nome_confezione', 'soglia_minima', 'scorta_ideale', 'fornitore', 'codice_fornitore', 'prezzo_confezione', 'ubicazione', 'responsabile', 'codice_barre', 'controlla_scadenze', 'note'];

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function exportCSV() {
  const rows = [CSV_COLUMNS];
  for (const p of S.products) {
    rows.push([
      p.name, p.brand, category(p.catId)?.name || '', p.qty, p.unit, p.packSize, p.packLabel, p.min, p.max ?? '',
      supplier(p.supplierId)?.name || '', p.supplierCode, p.price != null ? String(p.price).replace('.', ',') : '',
      p.location, user(p.respId)?.name || '', (p.codes || []).filter((k) => k.startsWith('gtin:')).map((k) => k.slice(5)).join(' '),
      p.trackExpiry ? 'si' : 'no', p.note,
    ]);
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\n');
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split('\n')[0];
  const delim = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter((r) => r.some((c) => c.trim()));
  if (!clean.length) return { headers: [], records: [] };
  const headers = clean[0].map((h) => norm(h).trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const records = clean.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
  return { headers, records };
}

const num = (v) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(/\./g, (m, i, s) => (s.includes(',') ? '' : '.')).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const pick = (r, ...keys) => { for (const k of keys) if (r[k] != null && r[k] !== '') return r[k]; return ''; };

export function planCSV(records) {
  const out = { create: [], update: [], skip: 0 };
  for (const r of records) {
    const name = pick(r, 'nome', 'prodotto', 'articolo', 'descrizione');
    if (!name) { out.skip++; continue; }
    const brand = pick(r, 'marca', 'brand', 'produttore');
    const existing = S.products.find((p) => norm(p.name) === norm(name) && norm(p.brand) === norm(brand));
    (existing ? out.update : out.create).push({ r, name, brand, existing });
  }
  return out;
}

export function applyCSV(plan) {
  const findOrCreateCat = (name) => {
    if (!name) return S.categories[0]?.id || null;
    let c = S.categories.find((x) => norm(x.name) === norm(name));
    if (!c) c = saveCategory({ name, emoji: '📦', color: 'stone' });
    return c.id;
  };
  const findOrCreateSup = (name) => {
    if (!name) return null;
    let s = S.suppliers.find((x) => norm(x.name) === norm(name));
    if (!s) s = saveSupplier({ name });
    return s.id;
  };
  const findUser = (name) => (name ? S.users.find((u) => norm(u.name) === norm(name))?.id || null : null);
  const fields = (r) => {
    const f = {};
    const set = (k, v) => { if (v !== '' && v != null) f[k] = v; };
    set('catId', pick(r, 'categoria') ? findOrCreateCat(pick(r, 'categoria')) : undefined);
    set('unit', pick(r, 'unita', 'unita_di_misura', 'um'));
    set('packSize', num(pick(r, 'pezzi_per_confezione', 'confezione_da')));
    set('packLabel', pick(r, 'nome_confezione'));
    set('min', num(pick(r, 'soglia_minima', 'soglia', 'minimo')));
    set('max', num(pick(r, 'scorta_ideale', 'massimo', 'scorta_ottimale')));
    set('supplierId', pick(r, 'fornitore') ? findOrCreateSup(pick(r, 'fornitore')) : undefined);
    set('supplierCode', pick(r, 'codice_fornitore', 'codice_articolo', 'ref'));
    set('price', num(pick(r, 'prezzo_confezione', 'prezzo')));
    set('location', pick(r, 'ubicazione', 'posizione'));
    set('respId', findUser(pick(r, 'responsabile')));
    set('note', pick(r, 'note'));
    const te = norm(pick(r, 'controlla_scadenze', 'scadenze'));
    if (te) f.trackExpiry = ['si', 'sì', 'yes', 'x', '1', 'true'].includes(te);
    const codes = pick(r, 'codice_barre', 'ean', 'gtin').split(/[\s,]+/).filter(Boolean).map((c) => (/^\d{8,14}$/.test(c) ? `gtin:${c.padStart(14, '0')}` : `raw:${c.toUpperCase()}`));
    if (codes.length) f.codes = codes;
    return f;
  };
  let created = 0, updated = 0;
  for (const it of plan.create) {
    const f = fields(it.r);
    saveProduct({ name: it.name, brand: it.brand, ...f, qty: num(pick(it.r, 'quantita', 'qta', 'giacenza')) || 0, demo: false });
    created++;
  }
  for (const it of plan.update) {
    const f = fields(it.r);
    if (f.codes) f.codes = [...new Set([...(it.existing.codes || []), ...f.codes])];
    saveProduct({ id: it.existing.id, ...f });
    const q = num(pick(it.r, 'quantita', 'qta', 'giacenza'));
    if (q != null && q !== it.existing.qty) stockMove(it.existing.id, 'rettifica', q, { note: 'Importazione CSV' });
    updated++;
  }
  return { created, updated };
}

// ---------- Numero sull'icona ----------
export function updateBadge() {
  try {
    if (!('setAppBadge' in navigator)) return;
    if (!S.settings.badge || !S.ready) { navigator.clearAppBadge?.(); return; }
    const n = derived().toOrder;
    if (n > 0) navigator.setAppBadge(n); else navigator.clearAppBadge();
  } catch { /* non supportato */ }
}

export { db, priceFor };
