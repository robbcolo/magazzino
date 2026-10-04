// Logica di magazzino: stati, previsioni di consumo, quantità da ordinare, lotti.
// Funzioni pure: ricevono i dati e restituiscono risultati, senza toccare il DOM.

export const DAY = 864e5;

export const STATUS = {
  esaurito: { label: 'Esaurito', short: 'Esaurito', icon: 'circle-x', rank: 0 },
  ordinare: { label: 'Da ordinare', short: 'Ordinare', icon: 'alert-triangle', rank: 1 },
  basso: { label: 'In esaurimento', short: 'In calo', icon: 'hourglass', rank: 2 },
  arrivo: { label: 'In arrivo', short: 'In arrivo', icon: 'truck', rank: 3 },
  ok: { label: 'Disponibile', short: 'Ok', icon: 'circle-check', rank: 4 },
};

export const DEFAULT_SETTINGS = {
  studioName: 'Studio Dentistico Colombo',
  address: '',
  warnDays: 60,        // preavviso scadenze
  safetyDays: 3,       // margine di sicurezza sulle previsioni
  lowPct: 150,         // "in esaurimento" sotto il 150% della soglia
  workDays: [1, 2, 3, 4, 5],
  lockMinutes: 5,
  defaultLeadDays: 3,
  badge: false,
  setupDone: false,
  lastBackup: null,
  demo: false,
};

// ---------- Date ----------
export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const isoDate = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const parseISO = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

export function isWorkDay(t, workDays) { return workDays.includes(new Date(t).getDay()); }

export function countWorkDays(from, to, workDays) {
  let n = 0;
  let t = startOfDay(from);
  const end = startOfDay(to);
  while (t < end) {
    if (isWorkDay(t, workDays)) n++;
    t = startOfDay(t + DAY + 3 * 3600e3); // +27h poi mezzanotte: robusto ai cambi d'ora
  }
  return n;
}

export function addWorkDays(from, n, workDays) {
  if (!workDays.length) return startOfDay(from) + n * DAY;
  let t = startOfDay(from);
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    t = startOfDay(t + DAY + 3 * 3600e3);
    if (isWorkDay(t, workDays)) left--;
  }
  return t;
}

// ---------- Lotti ----------
export const lotsTotal = (lots = []) => lots.reduce((s, l) => s + (l.qty > 0 ? l.qty : 0), 0);

// ordina i lotti per scadenza (FEFO: prima quello che scade prima; senza data in fondo)
export const fefo = (lots = []) => [...lots].sort((a, b) => (a.exp || '9999') .localeCompare(b.exp || '9999'));

/** Scala n unità dai lotti in ordine FEFO. Ritorna { lots, delta: [{id, lot, exp, d}] } */
export function takeFromLots(lots = [], n) {
  const next = lots.map((l) => ({ ...l }));
  const delta = [];
  let left = n;
  for (const l of fefo(next)) {
    if (left <= 0) break;
    const take = Math.min(l.qty, left);
    if (take > 0) {
      const ref = next.find((x) => x.id === l.id);
      ref.qty -= take;
      left -= take;
      delta.push({ id: l.id, lot: l.lot, exp: l.exp, d: -take });
    }
  }
  return { lots: next.filter((l) => l.qty > 0), delta };
}

/** Riporta la somma dei lotti entro la quantità totale (es. dopo una rettifica). */
export function trimLots(lots = [], qty) {
  const excess = lotsTotal(lots) - qty;
  if (excess <= 0) return { lots, delta: [] };
  return takeFromLots(lots, excess);
}

export function applyLotDelta(lots = [], delta = [], sign = 1) {
  const next = lots.map((l) => ({ ...l }));
  for (const d of delta) {
    let l = next.find((x) => x.id === d.id);
    if (!l) { l = { id: d.id, lot: d.lot, exp: d.exp, qty: 0 }; next.push(l); }
    l.qty += sign * d.d;
  }
  return next.filter((l) => l.qty > 0);
}

// ---------- Consumi e previsioni ----------
/**
 * movements: movimenti del solo prodotto (qualsiasi ordine)
 * Ritorna { rate (unità per giorno lavorativo) | null, used90, weeks: [12 valori settimanali], reliable }
 */
export function consumption(p, movements, now, settings) {
  const wd = settings.workDays?.length ? settings.workDays : [1, 2, 3, 4, 5];
  const windowStart = now - 90 * DAY;
  const firstSeen = Math.min(p.createdAt || now, ...movements.map((m) => m.ts));
  const from = Math.max(windowStart, firstSeen);
  const weeks = new Array(12).fill(0);
  const weekStart = startOfDay(now) - ((new Date(now).getDay() + 6) % 7) * DAY; // lunedì di questa settimana
  let used = 0, events = 0;
  for (const m of movements) {
    if (m.type !== 'scarico') continue;
    const q = -m.qty;
    if (m.ts >= from) { used += q; events++; }
    const w = Math.floor((weekStart + 7 * DAY - m.ts) / (7 * DAY));
    const idx = 11 - w;
    if (idx >= 0 && idx < 12) weeks[idx] += q;
  }
  const workDaysObserved = Math.max(1, countWorkDays(from, now + DAY, wd));
  const historyDays = (now - firstSeen) / DAY;
  const reliable = historyDays >= 14 && events >= 3 && used > 0;
  return { rate: reliable ? used / workDaysObserved : null, used90: used, weeks, reliable, historyDays };
}

export function leadDaysFor(p, supplier, settings) {
  return p.leadDays ?? supplier?.leadDays ?? settings.defaultLeadDays ?? 3;
}

export function targetFor(p) {
  if (p.max && p.max > (p.min || 0)) return p.max;
  const pack = p.packSize || 1;
  return Math.max((p.min || 0) * 2, (p.min || 0) + pack, pack);
}

export function packsFor(units, packSize) {
  const ps = packSize || 1;
  return Math.max(1, Math.ceil(units / ps));
}

/**
 * Calcola tutto ciò che serve a mostrare un prodotto.
 * ctx: { now, settings, supplier, movements, incoming, respId }
 */
export function computeProduct(p, ctx) {
  const { now, settings, supplier, movements = [], incoming = 0 } = ctx;
  const wd = settings.workDays?.length ? settings.workDays : [1, 2, 3, 4, 5];
  const qty = Math.max(0, p.qty || 0);
  const min = p.min || 0;
  const lead = leadDaysFor(p, supplier, settings);
  const cons = consumption(p, movements, now, settings);

  let daysLeft = null, runOut = null, orderBy = null;
  if (cons.rate) {
    daysLeft = qty / cons.rate; // giorni lavorativi
    runOut = addWorkDays(now, daysLeft, wd);
    orderBy = startOfDay(runOut) - (lead + (settings.safetyDays ?? 3)) * DAY;
  }

  const today = startOfDay(now);
  const lowLimit = Math.ceil(min * (settings.lowPct || 150) / 100);
  const soon = orderBy != null && orderBy <= today + 7 * DAY;

  let status;
  if (qty <= 0) status = 'esaurito';
  else if (min > 0 && qty <= min) status = incoming > 0 ? 'arrivo' : 'ordinare';
  else if ((min > 0 && qty <= lowLimit) || soon) status = incoming > 0 ? 'arrivo' : 'basso';
  else status = 'ok';

  const target = targetFor(p);
  const needUnits = Math.max(0, target - qty - incoming);
  const suggestPacks = packsFor(needUnits || (p.packSize || 1), p.packSize);

  // Scadenze
  const warn = settings.warnDays ?? 60;
  const expired = [], expiring = [];
  for (const l of p.lots || []) {
    if (!l.exp || !(l.qty > 0)) continue;
    const d = daysBetween(today, parseISO(l.exp));
    if (d < 0) expired.push({ ...l, days: d });
    else if (d <= warn) expiring.push({ ...l, days: d });
  }
  expired.sort((a, b) => a.days - b.days);
  expiring.sort((a, b) => a.days - b.days);

  // Livello per l'indicatore (0..1) rispetto alla scorta ideale
  const scale = Math.max(target, qty, 1);
  const level = Math.min(1, qty / scale);
  const minLevel = min > 0 ? Math.min(1, min / scale) : null;

  // Soglia consigliata dal consumo reale (giorni di consegna + margine, in giorni lavorativi ≈ calendario * 5/7)
  let suggestedMin = null;
  if (cons.rate && cons.historyDays >= 45) {
    const cover = Math.ceil((lead + (settings.safetyDays ?? 3) + 2) * (wd.length / 7));
    suggestedMin = Math.ceil(cons.rate * Math.max(cover, 3));
    if (Math.abs(suggestedMin - min) <= Math.max(1, min * 0.2)) suggestedMin = null;
  }

  return {
    status, qty, min, incoming, lead, target,
    rate: cons.rate, weeks: cons.weeks, used90: cons.used90, reliable: cons.reliable,
    daysLeft, runOut, orderBy,
    needUnits, suggestPacks,
    expired, expiring,
    level, minLevel, suggestedMin,
  };
}

/** Unità in arrivo per prodotto dagli ordini aperti */
export function incomingMap(orders) {
  const map = new Map();
  for (const o of orders) {
    if (o.status !== 'ordinato' && o.status !== 'parziale') continue;
    for (const it of o.items) {
      const units = it.packs * (it.packSize || 1) - (it.receivedUnits || 0);
      if (units > 0) map.set(it.productId, (map.get(it.productId) || 0) + units);
    }
  }
  return map;
}

export function priceFor(p, supplierId) {
  if (!supplierId || supplierId === p.supplierId) return p.price ?? null;
  const alt = (p.alts || []).find((a) => a.supplierId === supplierId);
  return alt?.price ?? null;
}

export function codeFor(p, supplierId) {
  if (!supplierId || supplierId === p.supplierId) return p.supplierCode || '';
  const alt = (p.alts || []).find((a) => a.supplierId === supplierId);
  return alt?.code || '';
}

/**
 * Lista "da ordinare" raggruppata per fornitore.
 * list: { [productId]: { packs?, manual?, skip?: {at, qty}, supplierId? } }
 */
export function buildOrderList({ products, suppliers, derived, list, now }) {
  const groups = new Map();
  const ensure = (sid) => {
    if (!groups.has(sid)) groups.set(sid, { supplierId: sid, supplier: suppliers.find((s) => s.id === sid) || null, items: [], extra: [] });
    return groups.get(sid);
  };
  for (const p of products) {
    const d = derived.get(p.id);
    if (!d) continue;
    const entry = list[p.id] || {};
    const skipped = entry.skip && entry.skip.qty === p.qty && now - entry.skip.at < 14 * DAY;
    const auto = (d.status === 'esaurito' || d.status === 'ordinare') && d.incoming <= 0;
    const sid = entry.supplierId || p.supplierId || '';
    if ((auto && !skipped) || entry.manual) {
      const packs = entry.packs ?? d.suggestPacks;
      const price = priceFor(p, sid);
      ensure(sid).items.push({ p, d, packs, price, auto: auto && !entry.manual, manual: !!entry.manual, supplierId: sid });
    } else if (d.status === 'basso' || (auto && skipped)) {
      ensure(sid).extra.push({ p, d, packs: d.suggestPacks, price: priceFor(p, sid), skipped });
    }
  }
  const out = [];
  for (const g of groups.values()) {
    g.items.sort((a, b) => STATUS[a.d.status].rank - STATUS[b.d.status].rank || a.p.name.localeCompare(b.p.name));
    g.total = g.items.reduce((s, it) => s + (it.price || 0) * it.packs, 0);
    g.priced = g.items.every((it) => it.price != null);
    const free = g.supplier?.freeShip;
    g.freeShipMissing = free ? Math.max(0, free - g.total) : null;
    out.push(g);
  }
  // prima i gruppi con articoli, poi per nome; "senza fornitore" in fondo
  out.sort((a, b) => (b.items.length > 0) - (a.items.length > 0) || (!a.supplier) - (!b.supplier) || (a.supplier?.name || '').localeCompare(b.supplier?.name || ''));
  return out;
}

// ---------- Testo dell'ordine ----------
export function orderText({ supplier, items, settings, user }) {
  const lines = [];
  lines.push(`Buongiorno${supplier?.agent ? ' ' + supplier.agent : ''},`);
  lines.push(`vorrei ordinare per ${settings.studioName || 'lo studio'}:`);
  lines.push('');
  for (const it of items) {
    const pack = it.p.packSize > 1 ? ` (${it.p.packLabel || 'conf.'} da ${it.p.packSize} ${it.p.unit})` : '';
    const code = codeFor(it.p, supplier?.id);
    const brand = it.p.brand ? ` ${it.p.brand}` : '';
    lines.push(`• ${it.packs} × ${it.p.name}${brand}${pack}${code ? ` – cod. ${code}` : ''}`);
  }
  lines.push('');
  if (settings.address) { lines.push(`Consegna: ${settings.address}`); lines.push(''); }
  lines.push('Grazie,');
  lines.push(user?.fullName || user?.name || '');
  lines.push(settings.studioName || '');
  return lines.join('\n').trim();
}

// ---------- Ricerca ----------
export const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function matches(p, q, extra = '') {
  if (!q) return true;
  const hay = norm([p.name, p.brand, p.location, p.supplierCode, p.note, extra].join(' '));
  return norm(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
