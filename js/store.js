// Stato dell'app e azioni. I dati arrivano da Firestore (cloud.js) e ogni modifica viene
// applicata subito qui (per una risposta immediata) e inviata al cloud.
import * as cloud from './cloud.js';
import {
  DEFAULT_SETTINGS, DAY, computeProduct, incomingMap, buildOrderList, takeFromLots, trimLots,
  startOfDay, norm, isoDate, priceFor,
} from './logic.js';

export const APP_VERSION = '2.0.0';

export const S = {
  phase: 'boot',        // boot | config | login | loading | ready
  products: [], suppliers: [], categories: [], movements: [], olderMovements: [], orders: [],
  settings: { ...DEFAULT_SETTINGS },
  settingsExists: false,
  orderList: {},
  loaded: {},
  loadingSince: 0,
  v: 0, dv: 0,
};
const COLLECTIONS = ['products', 'suppliers', 'categories', 'orders', 'log', 'settings', 'orderList'];

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
      c: new Map(S.categories.map((x) => [x.id, x])),
      o: new Map(S.orders.map((x) => [x.id, x])),
      code: new Map(S.products.flatMap((p) => (p.codes || []).map((k) => [k, p.id]))),
    };
  }
  return maps;
}
export const product = (id) => M().p.get(id);
export const supplier = (id) => M().s.get(id);
export const category = (id) => M().c.get(id);
export const order = (id) => M().o.get(id);
export const productByCode = (key) => { const id = M().code.get(key); return id ? product(id) : null; };

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

// ---------- Avvio ----------
export function boot() {
  const cfg = cloud.readConfig();
  if (!cfg) { S.phase = 'config'; emit(); return; }
  S.configSource = cfg.source;
  try {
    cloud.init(cfg, {
      onAuth(user) {
        S.account = user;
        S.loaded = {};
        if (!user) { S.phase = 'login'; resetData(); emit(); return; }
        S.phase = 'loading';
        S.loadingSince = Date.now();
        emit();
      },
      onCollection(name, docs, meta) {
        if (name === 'log') {
          S.movements = docs.flatMap((d) => d.m.map((m) => ({ ...m, day: m.day || d.day }))).sort((a, b) => a.ts - b.ts);
        } else {
          S[name] = docs;
        }
        markLoaded(name, meta);
        touch();
      },
      onDoc(name, data, meta) {
        if (name === 'settings') {
          // un documento assente dalla sola copia locale non basta per dire che lo studio è nuovo
          if (!data && meta.fromCache) { markLoaded(name, meta, false); emit(); return; }
          S.settingsExists = !!data;
          S.settings = { ...DEFAULT_SETTINGS, ...(data || {}) };
        } else if (name === 'orderList') {
          S.orderList = data?.items || {};
        }
        markLoaded(name, meta);
        touch();
      },
      onWriteError(what, e) {
        S.lastWriteError = { what, code: e.code, at: Date.now() };
        emit();
      },
      onError(name, e) {
        S.lastListenError = { name, code: e.code, at: Date.now() };
        emit();
      },
    });
  } catch (e) {
    console.error(e);
    S.phase = 'config';
    S.configError = 'La configurazione di Firebase non è valida.';
    emit();
  }
}
function markLoaded(name, meta, ok = true) {
  if (ok) S.loaded[name] = true;
  if (S.phase === 'loading' && COLLECTIONS.every((c) => S.loaded[c])) S.phase = 'ready';
}
function resetData() {
  Object.assign(S, { products: [], suppliers: [], categories: [], movements: [], olderMovements: [], orders: [], settings: { ...DEFAULT_SETTINGS }, settingsExists: false, orderList: {} });
  S.dv++;
}
export const syncState = () => ({ pending: cloud.C.pending, online: navigator.onLine, serverSeen: cloud.C.serverSeen, lastServerAt: cloud.C.lastServerAt });
export { cloud };

// ---------- Impostazioni ----------
export function setSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  S.settingsExists = true;
  cloud.mergeDoc('meta', 'settings', patch);
  touch();
}

// ---------- Registro attività (raggruppato per giorno in Firestore) ----------
function log(m) {
  const ts = Date.now();
  const mv = cloud.clean({ id: uid(), ts, day: cloud.dayKey(ts), ...m });
  S.movements.push(mv);
  cloud.appendLog(mv);
  return mv;
}

// ---------- Movimenti di magazzino ----------
/**
 * type: 'scarico' (amount = unità prese), 'carico' (amount = unità aggiunte),
 *       'rettifica' (amount = nuova quantità contata), 'scarto' (opts.lotId = lotto da eliminare)
 * Le quantità si inviano come incrementi: se due dispositivi registrano insieme, contano entrambi.
 */
export function stockMove(pid, type, amount, opts = {}) {
  const p = product(pid);
  if (!p) return null;
  const before = Math.max(0, p.qty || 0);
  let lots = p.lots || [];
  let delta = 0, lotDelta = [], newLots = [];
  if (type === 'scarico') {
    delta = -Math.min(amount, before);
    const r = takeFromLots(lots, -delta);
    lots = r.lots; lotDelta = r.delta;
  } else if (type === 'carico') {
    delta = amount;
    if (opts.lot || opts.exp) {
      const lotName = (opts.lot || '').trim();
      lots = lots.map((x) => ({ ...x }));
      let l = lots.find((x) => (x.lot || '') === lotName && (x.exp || '') === (opts.exp || ''));
      if (l) l.qty += amount;
      else { l = { id: uid(), lot: lotName, exp: opts.exp || '', qty: amount }; lots.push(l); newLots.push(l.id); }
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
  if (delta === 0 && !lotDelta.length) return null;
  // risposta immediata in locale
  p.qty = before + delta;
  p.lots = lots;
  p.updatedAt = Date.now();
  // invio al cloud come incrementi
  const fields = { qty: cloud.inc(delta), updatedAt: p.updatedAt };
  for (const d of lotDelta) {
    fields[`lots.${d.id}.qty`] = cloud.inc(d.d);
    if (type === 'carico') { fields[`lots.${d.id}.lot`] = d.lot || ''; fields[`lots.${d.id}.exp`] = d.exp || ''; }
  }
  cloud.patchDoc('products', pid, fields);
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
    const fields = { qty: cloud.inc(-mv.qty), updatedAt: Date.now() };
    const lots = (p.lots || []).map((l) => ({ ...l }));
    for (const d of mv.lotDelta || []) {
      fields[`lots.${d.id}.qty`] = cloud.inc(-d.d);
      fields[`lots.${d.id}.lot`] = d.lot || '';
      fields[`lots.${d.id}.exp`] = d.exp || '';
      let l = lots.find((x) => x.id === d.id);
      if (!l) { l = { id: d.id, lot: d.lot, exp: d.exp, qty: 0 }; lots.push(l); }
      l.qty -= d.d;
    }
    p.lots = lots.filter((l) => l.qty > 0);
    cloud.patchDoc('products', p.id, fields);
  }
  S.movements.splice(i, 1);
  cloud.removeLog(mv);
  touch();
}

// ---------- Prodotti ----------
const EDITABLE = ['name', 'brand', 'catId', 'unit', 'packSize', 'packLabel', 'min', 'max', 'location', 'supplierId', 'supplierCode', 'price', 'alts', 'codes', 'trackExpiry', 'leadDays', 'note', 'photo'];

export function saveProduct(data) {
  const now = Date.now();
  if (!data.id) {
    const initial = Math.max(0, +data.qty || 0);
    const p = {
      name: '', brand: '', catId: S.categories[0]?.id || null, unit: 'pz', packSize: 1, packLabel: 'confezione',
      min: 0, max: null, location: '', supplierId: null, supplierCode: '', price: null, alts: [],
      codes: [], trackExpiry: false, leadDays: null, note: '', photo: null,
      ...Object.fromEntries(Object.entries(data).filter(([k]) => EDITABLE.includes(k) || k === 'demo')),
      id: uid(), qty: initial, lots: [], createdAt: now, updatedAt: now,
    };
    if (initial && (data.firstLot || data.firstExp)) p.lots = [{ id: uid(), lot: data.firstLot || '', exp: data.firstExp || '', qty: initial }];
    for (const k of p.codes) removeCodeElsewhere(k, p.id);
    S.products.push(p);
    cloud.putDoc('products', p.id, p);
    log({ productId: p.id, pname: p.name, unit: p.unit, type: 'nuovo', qty: initial, before: 0, after: initial });
    touch();
    return p;
  }
  const p = product(data.id);
  if (!p) return null;
  const fields = { updatedAt: now };
  for (const k of EDITABLE) if (k in data) { p[k] = data[k]; fields[k] = data[k] ?? null; }
  for (const lid of p._zeroLots || []) fields[`lots.${lid}`] = cloud.del(); // pulizia dei lotti esauriti
  p._zeroLots = [];
  for (const k of p.codes || []) removeCodeElsewhere(k, p.id);
  cloud.patchDoc('products', p.id, fields);
  const last = S.movements[S.movements.length - 1];
  if (!(last && last.type === 'modifica' && last.productId === p.id && now - last.ts < 10 * 60e3)) {
    log({ productId: p.id, pname: p.name, type: 'modifica' });
  }
  touch();
  return p;
}

function removeCodeElsewhere(key, keepId) {
  for (const o of S.products) {
    if (o.id !== keepId && o.codes?.includes(key)) {
      o.codes = o.codes.filter((k) => k !== key);
      cloud.patchDoc('products', o.id, { codes: o.codes });
    }
  }
}
export function linkCode(pid, key) {
  const p = product(pid);
  if (!p || !key) return;
  removeCodeElsewhere(key, pid);
  p.codes = [...new Set([...(p.codes || []), key])];
  cloud.patchDoc('products', pid, { codes: p.codes });
  touch();
}
export function unlinkCode(pid, key) {
  const p = product(pid);
  if (!p) return;
  p.codes = (p.codes || []).filter((k) => k !== key);
  cloud.patchDoc('products', pid, { codes: p.codes });
  touch();
}
export function deleteProduct(id) {
  const p = product(id);
  if (!p) return;
  S.products = S.products.filter((x) => x.id !== id);
  cloud.removeDoc('products', id);
  if (S.orderList[id]) { delete S.orderList[id]; cloud.mergeDoc('meta', 'orderList', { items: { [id]: cloud.del() } }); }
  log({ productId: id, pname: p.name, type: 'elimina' });
  touch();
}

// ---------- Fornitori ----------
export function saveSupplier(data) {
  if (!data.id) {
    const s = { name: '', web: '', email: '', phone: '', whatsapp: '', agent: '', leadDays: 3, freeShip: null, note: '', searchUrl: '', ...data, id: uid(), createdAt: Date.now() };
    S.suppliers.push(s);
    cloud.putDoc('suppliers', s.id, s);
    touch();
    return s;
  }
  const s = supplier(data.id);
  Object.assign(s, data);
  cloud.putDoc('suppliers', s.id, s);
  touch();
  return s;
}
export function deleteSupplier(id) {
  S.suppliers = S.suppliers.filter((s) => s.id !== id);
  cloud.removeDoc('suppliers', id);
  for (const p of S.products) {
    const fields = {};
    if (p.supplierId === id) { p.supplierId = null; fields.supplierId = null; }
    if (p.alts?.some((a) => a.supplierId === id)) { p.alts = p.alts.filter((a) => a.supplierId !== id); fields.alts = p.alts; }
    if (Object.keys(fields).length) cloud.patchDoc('products', p.id, fields);
  }
  touch();
}

// ---------- Categorie ----------
export function saveCategory(data) {
  if (!data.id) {
    const c = { name: '', emoji: '📦', color: 'sky', order: S.categories.length, ...data, id: uid() };
    S.categories.push(c);
    cloud.putDoc('categories', c.id, c);
    touch();
    return c;
  }
  const c = category(data.id);
  Object.assign(c, data);
  cloud.putDoc('categories', c.id, c);
  touch();
  return c;
}
export function deleteCategory(id) {
  if (S.products.some((p) => p.catId === id)) return false;
  S.categories = S.categories.filter((c) => c.id !== id);
  cloud.removeDoc('categories', id);
  touch();
  return true;
}

// ---------- Lista da ordinare ----------
function setListItem(pid, value) {
  if (value == null) delete S.orderList[pid]; else S.orderList[pid] = value;
  cloud.mergeDoc('meta', 'orderList', { items: { [pid]: value == null ? cloud.del() : value } });
  touch();
}
export function listSet(pid, patch) { setListItem(pid, { ...(S.orderList[pid] || {}), ...patch }); }
export function listAdd(pid, packs) {
  setListItem(pid, { ...(S.orderList[pid] || {}), manual: true, packs: packs ?? S.orderList[pid]?.packs ?? null, skip: null });
}
export function listRemove(pid) {
  const p = product(pid);
  const e = S.orderList[pid] || {};
  const d = dp(pid);
  const auto = d && (d.status === 'esaurito' || d.status === 'ordinare');
  if (auto) setListItem(pid, { ...e, manual: false, skip: { at: Date.now(), qty: p?.qty } });
  else setListItem(pid, null);
}
export function listRestore(pid) { setListItem(pid, { ...(S.orderList[pid] || {}), skip: null }); }

// ---------- Ordini ----------
export function createOrder({ supplierId, items, expectedAt, note, text }) {
  const s = supplier(supplierId);
  const o = {
    id: uid(), supplierId: supplierId || null, supplierName: s?.name || 'Senza fornitore', status: 'ordinato',
    items: items.map((it) => ({
      productId: it.p.id, name: it.p.name, unit: it.p.unit, packSize: it.p.packSize || 1, packLabel: it.p.packLabel || 'confezione',
      packs: it.packs, price: it.price ?? null, receivedUnits: 0,
    })),
    createdAt: Date.now(), expectedAt: expectedAt || null, note: note || '', text: text || '',
  };
  o.total = o.items.reduce((sum, it) => sum + (it.price || 0) * it.packs, 0);
  S.orders.push(o);
  cloud.putDoc('orders', o.id, o);
  const patch = {};
  for (const it of items) { delete S.orderList[it.p.id]; patch[it.p.id] = cloud.del(); }
  cloud.mergeDoc('meta', 'orderList', { items: patch });
  log({ type: 'ordine', orderId: o.id, text: `${o.items.length} ${o.items.length === 1 ? 'articolo' : 'articoli'} da ${o.supplierName}` });
  touch();
  return o;
}

export function receiveOrder(orderId, rows) {
  const o = order(orderId);
  if (!o) return;
  for (const r of rows) {
    if (!(r.units > 0)) continue;
    const it = o.items.find((x) => x.productId === r.productId);
    stockMove(r.productId, 'carico', r.units, { lot: r.lot, exp: r.exp, orderId, note: `Arrivo ordine ${o.supplierName}` });
    if (it) {
      it.receivedUnits = (it.receivedUnits || 0) + r.units;
      if (r.price != null && r.price !== '' && !Number.isNaN(+r.price) && +r.price !== it.price) {
        it.price = +r.price;
        const p = product(r.productId);
        if (p) {
          if (!o.supplierId || o.supplierId === p.supplierId) { p.price = +r.price; cloud.patchDoc('products', p.id, { price: p.price }); }
          else {
            const a = (p.alts || []).find((x) => x.supplierId === o.supplierId);
            if (a) { a.price = +r.price; cloud.patchDoc('products', p.id, { alts: p.alts }); }
          }
        }
      }
    }
  }
  const done = o.items.every((it) => (it.receivedUnits || 0) >= it.packs * it.packSize);
  o.status = done ? 'arrivato' : 'parziale';
  if (done) o.receivedAt = Date.now();
  o.total = o.items.reduce((sum, it) => sum + (it.price || 0) * it.packs, 0);
  cloud.putDoc('orders', o.id, o);
  log({ type: 'arrivo', orderId, text: `${done ? 'Ordine completo' : 'Arrivo parziale'} da ${o.supplierName}` });
  touch();
}
export function closeOrder(orderId) {
  const o = order(orderId);
  Object.assign(o, { status: 'arrivato', receivedAt: Date.now(), closedPartial: true });
  cloud.putDoc('orders', o.id, o);
  touch();
}
export function cancelOrder(orderId) {
  const o = order(orderId);
  o.status = 'annullato';
  cloud.putDoc('orders', o.id, o);
  log({ type: 'annullato', orderId, text: `Ordine annullato (${o.supplierName})` });
  touch();
}
export function updateOrder(orderId, patch) {
  const o = order(orderId);
  Object.assign(o, patch);
  cloud.putDoc('orders', o.id, o);
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

export async function setupStudio({ studioName, signature, suppliers, demo }) {
  const ops = [];
  const cats = DEFAULT_CATEGORIES.map(([name, emoji, color], i) => ({ id: uid() + i, name, emoji, color, order: i }));
  const sups = suppliers.filter((s) => s.name.trim()).map((s, i) => ({
    email: '', phone: '', whatsapp: '', agent: '', freeShip: null, note: '', searchUrl: '', leadDays: 3, ...s, name: s.name.trim(), id: uid() + 's' + i, createdAt: Date.now(),
  }));
  for (const c of cats) ops.push({ type: 'set', name: 'categories', id: c.id, data: c });
  for (const s of sups) ops.push({ type: 'set', name: 'suppliers', id: s.id, data: s });
  const settings = { ...DEFAULT_SETTINGS, studioName: studioName || DEFAULT_SETTINGS.studioName, signature: signature || '', setupDone: true };
  ops.push({ type: 'set', name: 'meta', id: 'settings', data: settings });
  S.categories = cats; S.suppliers = sups; S.settings = settings; S.settingsExists = true;
  await cloud.batchWrite(ops);
  touch();
  if (demo) await loadDemo();
}

// ---------- Dati di esempio ----------
function groupByDay(movs) {
  const by = new Map();
  for (const m of movs) {
    const day = m.day || cloud.dayKey(m.ts);
    if (!by.has(day)) by.set(day, []);
    by.get(day).push(cloud.clean({ ...m, day }));
  }
  return by;
}
export async function loadDemo() {
  const { buildDemo } = await import('./demo.js');
  const data = buildDemo({ now: Date.now(), categories: S.categories, suppliers: S.suppliers, uid });
  const ops = [];
  for (const s of S.suppliers) if (s.freeShip != null) ops.push({ type: 'merge', name: 'suppliers', id: s.id, data: { freeShip: s.freeShip } });
  for (const s of data.suppliers) { S.suppliers.push(s); ops.push({ type: 'set', name: 'suppliers', id: s.id, data: s }); }
  for (const p of data.products) { S.products.push(p); ops.push({ type: 'set', name: 'products', id: p.id, data: p }); }
  for (const o of data.orders) { S.orders.push(o); ops.push({ type: 'set', name: 'orders', id: o.id, data: o }); }
  for (const [day, items] of groupByDay(data.movements)) {
    ops.push({ type: 'logAdd', name: 'log', id: day, items });
    S.movements.push(...items);
  }
  S.movements.sort((a, b) => a.ts - b.ts);
  ops.push({ type: 'merge', name: 'meta', id: 'settings', data: { demo: true } });
  S.settings = { ...S.settings, demo: true };
  await cloud.batchWrite(ops);
  touch();
}
export async function removeDemo() {
  const ops = [];
  for (const p of S.products) if (p.demo) ops.push({ type: 'delete', name: 'products', id: p.id });
  for (const o of S.orders) if (o.demo) ops.push({ type: 'delete', name: 'orders', id: o.id });
  for (const s of S.suppliers) if (s.demo) ops.push({ type: 'delete', name: 'suppliers', id: s.id });
  const demoIds = new Set(S.products.filter((p) => p.demo).map((p) => p.id));
  const items = {};
  for (const id of demoIds) if (S.orderList[id]) { items[id] = cloud.del(); delete S.orderList[id]; }
  if (Object.keys(items).length) ops.push({ type: 'merge', name: 'meta', id: 'orderList', data: { items } });
  // i movimenti di esempio sono mescolati per giorno: li rimuovo da tutti i giorni, anche quelli più vecchi
  let logs = [];
  try { logs = await cloud.getAll('log'); } catch { logs = []; }
  for (const d of logs) {
    const demoItems = (d.data.m || []).filter((m) => m.demo);
    if (demoItems.length) ops.push({ type: 'logRemove', name: 'log', id: d.id, items: demoItems });
  }
  ops.push({ type: 'merge', name: 'meta', id: 'settings', data: { demo: false } });
  S.products = S.products.filter((p) => !p.demo);
  S.orders = S.orders.filter((o) => !o.demo);
  S.suppliers = S.suppliers.filter((s) => !s.demo);
  S.movements = S.movements.filter((m) => !m.demo);
  S.settings = { ...S.settings, demo: false };
  await cloud.batchWrite(ops);
  touch();
}

// ---------- Attività più vecchie (lette solo quando servono) ----------
export async function loadOlderMovements() {
  const oldest = [...S.olderMovements, ...S.movements].reduce((m, x) => Math.min(m, x.ts), Date.now());
  const before = cloud.dayKey(Math.min(oldest, Date.now() - cloud.LOG_DAYS * DAY));
  const docs = await cloud.getAll('log', before);
  const all = docs.flatMap((d) => (d.data.m || []).map((m) => ({ ...m, day: m.day || d.id })));
  const seen = new Set(S.movements.map((m) => m.id));
  S.olderMovements = all.filter((m) => !seen.has(m.id)).sort((a, b) => a.ts - b.ts);
  touch();
  return S.olderMovements.length;
}

// ---------- Backup ----------
export async function exportBackup() {
  let movements = S.movements;
  try {
    const docs = await cloud.getAll('log');
    movements = docs.flatMap((d) => (d.data.m || []).map((m) => ({ ...m, day: m.day || d.id }))).sort((a, b) => a.ts - b.ts);
  } catch { /* offline: esporto quelli in memoria */ }
  const strip = (p) => { const { _zeroLots, rawQty, ...rest } = p; return rest; };
  return {
    app: 'magazzino-studio', version: 2, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
    data: {
      products: S.products.map(strip), suppliers: S.suppliers, categories: S.categories,
      movements, orders: S.orders, settings: S.settings, orderList: S.orderList,
    },
  };
}
export function markBackup() { setSettings({ lastBackup: Date.now() }); }

export async function importBackup(obj, { wipe = true } = {}) {
  if (!obj || obj.app !== 'magazzino-studio' || !obj.data) throw new Error('Il file non è un backup di questa app.');
  const d = obj.data;
  if (wipe) await cloud.wipeAll();
  const ops = [];
  const products = (d.products || []).map((p) => ({ ...p, lots: (p.lots || []).filter((l) => l.qty > 0) }));
  for (const p of products) ops.push({ type: 'set', name: 'products', id: p.id, data: p });
  for (const s of d.suppliers || []) ops.push({ type: 'set', name: 'suppliers', id: s.id, data: s });
  for (const c of d.categories || []) { const { respId, ...rest } = c; ops.push({ type: 'set', name: 'categories', id: c.id, data: rest }); }
  for (const o of d.orders || []) { const { orderedBy, ...rest } = o; ops.push({ type: 'set', name: 'orders', id: o.id, data: rest }); }
  const movs = (d.movements || []).map(({ userId, ...m }) => m);
  for (const [day, items] of groupByDay(movs)) ops.push({ type: 'logAdd', name: 'log', id: day, items });
  const { lockMinutes, ...settings } = d.settings || {};
  ops.push({ type: 'set', name: 'meta', id: 'settings', data: { ...DEFAULT_SETTINGS, ...settings, setupDone: true } });
  ops.push({ type: 'set', name: 'meta', id: 'orderList', data: { items: d.orderList || {} } });
  // aggiorno subito lo stato locale; gli ascolti di Firestore confermeranno
  S.products = products; S.suppliers = d.suppliers || []; S.categories = (d.categories || []);
  S.orders = d.orders || []; S.movements = [...groupByDay(movs).values()].flat().sort((a, b) => a.ts - b.ts);
  S.settings = { ...DEFAULT_SETTINGS, ...settings, setupDone: true }; S.settingsExists = true; S.orderList = d.orderList || {};
  await cloud.batchWrite(ops);
  touch();
}

/** Dati della versione precedente (solo su questo dispositivo), se presenti */
export async function readLegacyLocalData() {
  try {
    if (indexedDB.databases) {
      const list = await indexedDB.databases();
      if (!list.some((x) => x.name === 'magazzino-studio')) return null;
    }
    const db = await new Promise((res) => {
      const r = indexedDB.open('magazzino-studio');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onupgradeneeded = () => { r.transaction.abort(); res(null); };
    });
    if (!db) return null;
    const get = (s) => new Promise((res) => {
      try { const q = db.transaction(s, 'readonly').objectStore(s).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); } catch { res([]); }
    });
    const [products, suppliers, categories, movements, orders, kv] = await Promise.all(['products', 'suppliers', 'categories', 'movements', 'orders', 'kv'].map(get));
    db.close();
    if (!products.length) return null;
    const kvm = Object.fromEntries(kv.map((k) => [k.id, k.data]));
    return { app: 'magazzino-studio', version: 1, data: { products, suppliers, categories, movements, orders, settings: kvm.settings || {}, orderList: kvm.orderList || {} } };
  } catch { return null; }
}

export async function resetAll() {
  await cloud.wipeAll();
  resetData();
  S.settingsExists = false;
  touch();
}

// ---------- CSV ----------
export const CSV_COLUMNS = ['nome', 'marca', 'categoria', 'quantita', 'unita', 'pezzi_per_confezione', 'nome_confezione', 'soglia_minima', 'scorta_ideale', 'fornitore', 'codice_fornitore', 'prezzo_confezione', 'ubicazione', 'codice_barre', 'controlla_scadenze', 'note'];

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
      p.location, (p.codes || []).filter((k) => k.startsWith('gtin:')).map((k) => k.slice(5)).join(' '),
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
  const cleanRows = rows.filter((r) => r.some((c) => c.trim()));
  if (!cleanRows.length) return { headers: [], records: [] };
  const headers = cleanRows[0].map((h) => norm(h).trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const records = cleanRows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
  return { headers, records };
}

const num = (v) => {
  if (v == null || v === '') return null;
  let s = String(v).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};
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
    set('note', pick(r, 'note'));
    const te = norm(pick(r, 'controlla_scadenze', 'scadenze'));
    if (te) f.trackExpiry = ['si', 'sì', 'yes', 'x', '1', 'true'].includes(te);
    const codes = pick(r, 'codice_barre', 'ean', 'gtin').split(/[\s,]+/).filter(Boolean).map((c) => (/^\d{8,14}$/.test(c) ? `gtin:${c.padStart(14, '0')}` : `raw:${c.toUpperCase()}`));
    if (codes.length) f.codes = codes;
    return f;
  };
  let created = 0, updated = 0;
  for (const it of plan.create) {
    saveProduct({ name: it.name, brand: it.brand, ...fields(it.r), qty: num(pick(it.r, 'quantita', 'qta', 'giacenza')) || 0 });
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
    if (!S.settings.badge || S.phase !== 'ready') { navigator.clearAppBadge?.(); return; }
    const n = derived().toOrder;
    if (n > 0) navigator.setAppBadge(n); else navigator.clearAppBadge();
  } catch { /* non supportato */ }
}

export { priceFor };
