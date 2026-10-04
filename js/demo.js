// Dati di esempio: ~40 materiali con 4 mesi di movimenti simulati, per provare subito l'app.
import { DAY, startOfDay, takeFromLots, isWorkDay, isoDate } from './logic.js';

// nome, marca, categoria, unità, pezzi/conf, nome conf, soglia, scorta ideale, consumo/giorno, prezzo conf, fornitore, ubicazione, scadenze, scenario
const P = [
  ['Articaina 4% 1:100.000', 'Septanest', 'Anestesia e farmaci', 'carpule', 50, 'scatola', 50, 150, 5.5, 42, 'Dontalia', 'Sala 1 › Carrello', true, 'scade'],
  ['Mepivacaina 3% senza vasocostrittore', 'Scandonest', 'Anestesia e farmaci', 'carpule', 50, 'scatola', 25, 100, 1.4, 38.5, 'Dental Leader', 'Sala 1 › Carrello', true, 'ok'],
  ['Aghi per carpule 30G corti', 'Septoject', 'Anestesia e farmaci', 'aghi', 100, 'scatola', 60, 300, 5, 14.9, 'Dontalia', 'Sala 1 › Carrello', false, 'ordinare'],
  ['Anestetico di superficie gel', 'Gel-Caine', 'Anestesia e farmaci', 'vasetti', 1, 'vasetto', 1, 3, 0.05, 11.5, 'Dental Today', 'Sala 1 › Carrello', true, 'ok'],
  ['Composito universale A2', 'Filtek Supreme XTE', 'Conservativa', 'siringhe', 1, 'siringa', 3, 8, 0.22, 48, 'Dental Leader', 'Sala 2 › Cassettiera', true, 'basso'],
  ['Composito universale A3', 'Filtek Supreme XTE', 'Conservativa', 'siringhe', 1, 'siringa', 2, 6, 0.14, 48, 'Dental Leader', 'Sala 2 › Cassettiera', true, 'ok'],
  ['Composito flow A2', 'Tetric EvoFlow', 'Conservativa', 'siringhe', 1, 'siringa', 2, 6, 0.12, 34, 'Umbra', 'Sala 2 › Cassettiera', true, 'esaurito'],
  ['Adesivo universale', 'Scotchbond Universal Plus', 'Conservativa', 'flaconi', 1, 'flacone', 1, 3, 0.04, 96, 'Dental Leader', 'Sala 2 › Cassettiera', true, 'scaduto'],
  ['Acido ortofosforico 37% gel', 'Etching gel', 'Conservativa', 'siringhe', 3, 'confezione', 2, 9, 0.1, 12.5, 'Dontalia', 'Sala 2 › Cassettiera', false, 'ok'],
  ['Matrici sezionali', 'Palodent V3', 'Conservativa', 'matrici', 50, 'confezione', 20, 100, 1.1, 39, 'Umbra', 'Sala 2 › Cassettiera', false, 'basso'],
  ['Cunei interdentali assortiti', 'Wedge Wands', 'Conservativa', 'cunei', 100, 'confezione', 40, 200, 1.4, 18, 'Dontalia', 'Sala 2 › Cassettiera', false, 'ok'],
  ['Diga in lattice medium', 'Hygienic', 'Conservativa', 'fogli', 36, 'scatola', 15, 72, 1.3, 11, 'Dontalia', 'Magazzino › Armadio A', false, 'ok'],
  ['Cemento vetroionomerico', 'Fuji IX GP', 'Conservativa', 'confezioni', 1, 'confezione', 1, 3, 0.03, 78, 'Eli-Dent', 'Magazzino › Armadio A', true, 'ok'],
  ['Lime NiTi reciprocanti Primary', 'WaveOne Gold', 'Endodonzia', 'lime', 6, 'blister', 6, 24, 0.45, 72, 'Dental Leader', 'Sala 2 › Carrello endo', false, 'arrivo'],
  ['Coni di guttaperca Primary', 'WaveOne Gold', 'Endodonzia', 'coni', 60, 'scatola', 30, 120, 0.9, 16, 'Dental Leader', 'Sala 2 › Carrello endo', false, 'ok'],
  ['Coni di carta Primary', 'WaveOne Gold', 'Endodonzia', 'coni', 180, 'scatola', 40, 180, 1.2, 14, 'Dental Leader', 'Sala 2 › Carrello endo', false, 'ok'],
  ['Ipoclorito di sodio 5%', 'Niclor 5', 'Endodonzia', 'flaconi', 1, 'flacone', 1, 4, 0.07, 9, 'Dontalia', 'Sala 2 › Carrello endo', false, 'basso'],
  ['Cemento canalare', 'AH Plus', 'Endodonzia', 'confezioni', 1, 'confezione', 1, 2, 0.02, 76, 'Eli-Dent', 'Sala 2 › Carrello endo', true, 'ok'],
  ['Alginato', 'Hydrogum 5', 'Impronte', 'buste', 1, 'busta', 2, 6, 0.11, 9.5, 'Dontalia', 'Magazzino › Armadio B', true, 'ok'],
  ['Silicone per impronte light', 'Elite HD+ Light Body', 'Impronte', 'cartucce', 2, 'confezione', 2, 8, 0.13, 32, 'Umbra', 'Magazzino › Armadio B', true, 'scade'],
  ['Silicone putty', 'Elite HD+ Putty', 'Impronte', 'confezioni', 1, 'confezione', 1, 3, 0.045, 45, 'Umbra', 'Magazzino › Armadio B', true, 'ok'],
  ['Cemento provvisorio', 'TempBond NE', 'Protesi', 'confezioni', 1, 'confezione', 1, 3, 0.035, 28, 'Eli-Dent', 'Magazzino › Armadio B', true, 'ok'],
  ['Resina per provvisori A2', 'Protemp 4', 'Protesi', 'cartucce', 1, 'cartuccia', 1, 3, 0.04, 85, 'Dental Leader', 'Magazzino › Armadio B', true, 'ordinare'],
  ['Carta di articolazione', 'Bausch 100 µ', 'Protesi', 'fogli', 200, 'blocchetto', 50, 300, 2.6, 9, 'Dental Today', 'Sala 1 › Cassettiera', false, 'ok'],
  ['Impianti 4.1 × 10 mm', 'Bone Level Tapered', 'Implantologia', 'impianti', 1, 'pezzo', 2, 5, 0.045, 165, 'Agente implantologia', 'Magazzino › Cassaforte', true, 'ok'],
  ['Viti di guarigione 4 mm', 'Healing abutment', 'Implantologia', 'viti', 1, 'pezzo', 3, 8, 0.055, 26, 'Agente implantologia', 'Magazzino › Cassaforte', false, 'arrivo'],
  ['Suture 4/0 riassorbibili', 'Vicryl Rapide', 'Chirurgia', 'buste', 12, 'scatola', 6, 24, 0.35, 49, 'Umbra', 'Sala 3 › Carrello chirurgia', true, 'ok'],
  ['Lame bisturi n. 15', 'Swann-Morton', 'Chirurgia', 'lame', 100, 'scatola', 20, 100, 0.55, 16.5, 'Dontalia', 'Sala 3 › Carrello chirurgia', false, 'ok'],
  ['Spugne emostatiche in collagene', 'Hemocollagene', 'Chirurgia', 'spugne', 24, 'scatola', 6, 24, 0.13, 58, 'Eli-Dent', 'Sala 3 › Carrello chirurgia', true, 'basso'],
  ['Guanti in nitrile M', 'Sempercare', 'Monouso e DPI', 'scatole', 10, 'cartone', 6, 20, 0.65, 46, 'Dontalia', 'Magazzino › Scaffale DPI', false, 'ordinare'],
  ['Guanti in nitrile S', 'Sempercare', 'Monouso e DPI', 'scatole', 10, 'cartone', 4, 15, 0.38, 46, 'Dontalia', 'Magazzino › Scaffale DPI', false, 'ok'],
  ['Mascherine chirurgiche tipo IIR', 'Monoart', 'Monouso e DPI', 'scatole', 1, 'scatola da 50', 3, 10, 0.2, 6.5, 'Dental Today', 'Magazzino › Scaffale DPI', false, 'esaurito'],
  ['Bavaglini monouso', 'Monoart', 'Monouso e DPI', 'pz', 500, 'cartone', 120, 1000, 17, 26, 'Dental Today', 'Magazzino › Scaffale DPI', false, 'ok'],
  ['Bicchierini monouso', 'Monoart', 'Monouso e DPI', 'pz', 100, 'confezione', 100, 600, 14, 4.2, 'Dental Today', 'Magazzino › Scaffale DPI', false, 'basso'],
  ['Aspirasaliva', 'Monoart', 'Monouso e DPI', 'pz', 100, 'confezione', 100, 500, 12, 5.5, 'Dontalia', 'Magazzino › Scaffale DPI', false, 'ok'],
  ['Rulli salivari in cotone', 'Celluron', 'Monouso e DPI', 'pz', 300, 'confezione', 200, 1200, 24, 6.8, 'Dontalia', 'Magazzino › Scaffale DPI', false, 'ok'],
  ['Rotoli copri-lettino', 'Monoart', 'Monouso e DPI', 'rotoli', 6, 'cartone', 4, 18, 0.28, 24, 'Dental Today', 'Magazzino › Scaffale DPI', false, 'ok'],
  ['Buste sterilizzazione 90 × 230', 'Euronda', 'Sterilizzazione', 'buste', 200, 'scatola', 100, 600, 13, 11.5, 'Eli-Dent', 'Sterilizzazione › Pensile', false, 'ordinare'],
  ['Buste sterilizzazione 135 × 280', 'Euronda', 'Sterilizzazione', 'buste', 200, 'scatola', 50, 400, 4.5, 14.5, 'Eli-Dent', 'Sterilizzazione › Pensile', false, 'ok'],
  ['Disinfettante superfici spray', 'Zeta 3 Foam', 'Sterilizzazione', 'flaconi', 1, 'flacone', 2, 8, 0.14, 9.8, 'Dontalia', 'Sterilizzazione › Pensile', true, 'ok'],
  ['Salviette disinfettanti', 'Zeta 3 Wipes', 'Sterilizzazione', 'barattoli', 6, 'cartone', 2, 8, 0.18, 48, 'Dontalia', 'Sterilizzazione › Pensile', true, 'arrivo'],
  ['Indicatori chimici classe 4', 'Euronda', 'Sterilizzazione', 'strisce', 250, 'confezione', 50, 300, 2.8, 18, 'Eli-Dent', 'Sterilizzazione › Pensile', true, 'ok'],
  ['Pasta profilattica monodose', 'Cleanic', 'Parodontologia e igiene', 'monodosi', 200, 'scatola', 40, 200, 2.3, 36, 'Umbra', 'Sala 1 › Cassettiera', true, 'ok'],
  ['Scovolini interdentali campione', 'Curaprox', 'Parodontologia e igiene', 'pz', 25, 'confezione', 20, 100, 0.9, 12, 'Dental Today', 'Sala 1 › Cassettiera', false, 'ok'],
  ['Guaine monouso per sensore RX', 'Dürr', 'Radiologia', 'guaine', 500, 'scatola', 100, 500, 3.6, 19, 'Umbra', 'Sala RX', false, 'ok'],
  ['Cera ortodontica', 'Ortho wax', 'Ortodonzia', 'pz', 50, 'scatola', 10, 50, 0.25, 22, 'Dental Today', 'Magazzino › Armadio A', false, 'ok'],
  ['Toner stampante', 'Brother TN-2420', 'Studio e cancelleria', 'pz', 1, 'pezzo', 1, 2, 0.012, 64, 'Dental Today', 'Reception', false, 'ok'],
];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function buildDemo({ now, users, categories, suppliers, uid }) {
  const R = rng(20261004);
  const poisson = (l) => { if (l <= 0) return 0; const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; };
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const workDays = [1, 2, 3, 4, 5];
  const today = startOfDay(now);
  const nowHour = new Date(now).getHours() + new Date(now).getMinutes() / 60;

  const catBy = Object.fromEntries(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const supBy = Object.fromEntries(suppliers.map((s) => [s.name.toLowerCase(), s.id]));
  const extraSuppliers = [];
  const agent = { id: uid(), name: 'Agente implantologia', agent: 'Marco', phone: '', whatsapp: '', email: '', web: '', leadDays: 5, freeShip: null, note: 'Ordini via WhatsApp all\'agente di zona', demo: true, createdAt: now };
  extraSuppliers.push(agent);
  supBy['agente implantologia'] = agent.id;
  const freeShip = { dontalia: 150, 'dental leader': 120, umbra: 100, 'dental today': 99, 'eli-dent': 150 };

  const admins = users.filter((u) => u.role === 'admin');
  const assistants = users.filter((u) => u.role !== 'admin');
  const anyUser = () => (assistants.length && R() < 0.72 ? pick(assistants) : pick(users));
  const byName = (i, role) => (role === 'admin' ? admins[i % Math.max(1, admins.length)] : assistants[i % Math.max(1, assistants.length)]) || users[0];

  // responsabili degli ordini per categoria
  const respMap = {
    'monouso e dpi': byName(0, 'a'), 'sterilizzazione': byName(0, 'a'),
    'parodontologia e igiene': byName(1, 'a'), 'impronte': byName(1, 'a'), 'studio e cancelleria': byName(1, 'a'),
    'conservativa': byName(1, 'admin'), 'endodonzia': byName(1, 'admin'),
    'implantologia': byName(0, 'admin'), 'chirurgia': byName(0, 'admin'), 'protesi': byName(0, 'admin'),
    'anestesia e farmaci': byName(2, 'admin'), 'radiologia': byName(2, 'admin'), 'ortodonzia': byName(2, 'admin'),
  };
  const categoryResp = categories.filter((c) => !c.respId && respMap[c.name.toLowerCase()]).map((c) => ({ id: c.id, respId: respMap[c.name.toLowerCase()].id }));
  const respOf = (catName) => respMap[catName.toLowerCase()] || users[0];

  const products = [], movements = [], rawOrders = [];
  const sup = (name) => [...suppliers, ...extraSuppliers].find((s) => s.id === supBy[name.toLowerCase()]);

  P.forEach((row, idx) => {
    const [name, brand, cat, unit, packSize, packLabel, min, max, rate, price, supName, location, trackExpiry, scenario] = row;
    const sid = supBy[supName.toLowerCase()] || null;
    const lead = sup(supName)?.leadDays ?? 3;
    const p = {
      id: uid() + idx, name, brand, catId: catBy[cat.toLowerCase()] || categories[0]?.id, unit, packSize, packLabel,
      qty: 0, min, max, location, respId: null, supplierId: sid, supplierCode: `${(supName.slice(0, 2)).toUpperCase()}-${String(10400 + idx * 37)}`,
      price, alts: [], codes: [], trackExpiry, lots: [], leadDays: null, note: '', photo: null,
      createdAt: today - 125 * DAY, updatedAt: now, demo: true,
    };
    // un fornitore alternativo per alcuni prodotti, per mostrare il confronto prezzi
    if (idx % 4 === 0) {
      const altName = ['Dental Today', 'Umbra', 'Eli-Dent', 'Dontalia'][idx % 3];
      if (altName !== supName && supBy[altName.toLowerCase()]) p.alts.push({ supplierId: supBy[altName.toLowerCase()], code: `ALT-${200 + idx}`, price: Math.round(price * (1.04 + R() * 0.12) * 100) / 100 });
    }
    const mv = (ts, type, qty, before, after, extra = {}) => movements.push({ id: uid() + 'm' + movements.length, ts, userId: extra.userId || anyUser().id, productId: p.id, pname: name, unit, type, qty, before, after, demo: true, ...extra });
    const shelf = () => 420 + Math.floor(R() * 420); // giorni di validità
    const newLot = (ts, qty) => ({ id: uid() + 'l' + Math.floor(R() * 1e6), lot: `${String.fromCharCode(65 + Math.floor(R() * 26))}${Math.floor(1000 + R() * 8999)}`, exp: isoDate(ts + shelf() * DAY), qty });

    // stato iniziale (125 giorni fa)
    let qty = Math.round(max * (0.55 + R() * 0.4));
    let lots = trackExpiry ? [newLot(today - 125 * DAY, qty)] : [];
    mv(today - 125 * DAY + 10 * 3600e3, 'nuovo', qty, 0, qty, { userId: (admins[0] || users[0]).id, lot: lots[0]?.lot, exp: lots[0]?.exp });
    let pending = null;

    const restock = (dayTs) => {
      const units = Math.max(packSize, Math.ceil((max - qty) / packSize) * packSize);
      const packs = units / packSize;
      const orderedBy = respOf(cat);
      const orderTs = dayTs + (9 + R() * 2) * 3600e3;
      pending = { units, packs, arrive: dayTs + (lead + (R() < 0.3 ? 1 : 0)) * DAY, orderTs, orderedBy: orderedBy.id };
    };

    for (let day = -124; day <= 0; day++) {
      const dayTs = today + day * DAY;
      if (pending && dayTs >= startOfDay(pending.arrive) && isWorkDay(dayTs, workDays)) {
        const ts = dayTs + (10 + R() * 3) * 3600e3;
        if (day < 0 || ts < now) {
          const lot = trackExpiry ? newLot(ts, pending.units) : null;
          if (lot) lots.push(lot);
          const oid = 'o' + uid() + idx + day;
          mv(ts, 'carico', pending.units, qty, qty + pending.units, { lot: lot?.lot, exp: lot?.exp, lotDelta: lot ? [{ id: lot.id, lot: lot.lot, exp: lot.exp, d: pending.units }] : [], orderId: oid, note: `Arrivo ordine ${supName}` });
          qty += pending.units;
          rawOrders.push({ oid, sid, supName, productId: p.id, name, unit, packSize, packLabel, packs: pending.packs, price, orderedBy: pending.orderedBy, createdAt: pending.orderTs, receivedAt: ts, units: pending.units });
          pending = null;
        }
      }
      if (!isWorkDay(dayTs, workDays)) continue;
      const hour = 8.5 + R() * 10;
      if (day === 0 && hour > nowHour) continue;
      const use = Math.min(qty, poisson(rate));
      if (use > 0) {
        const r = takeFromLots(lots, use);
        lots = r.lots;
        mv(dayTs + hour * 3600e3, 'scarico', -use, qty, qty - use, { lotDelta: r.delta, lot: r.delta.length === 1 ? r.delta[0].lot : undefined });
        qty -= use;
      }
      const stopReorder = (scenario === 'ordinare' || scenario === 'esaurito' || scenario === 'basso') && day > -40;
      if (qty <= min && !pending && !stopReorder) restock(dayTs);
    }

    // porta il prodotto nello stato voluto per la demo
    const lastWork = (() => { let t = today - DAY; while (!isWorkDay(t, workDays)) t -= DAY; return t; })();
    const take = (target, when = lastWork) => {
      const use = qty - target;
      if (use <= 0) return;
      const r = takeFromLots(lots, use);
      lots = r.lots;
      mv(when + (11 + R() * 6) * 3600e3, 'scarico', -use, qty, target, { lotDelta: r.delta });
      qty = target;
    };
    if (pending && scenario !== 'arrivo') {
      const ts = lastWork - 2 * DAY + 11 * 3600e3;
      const lot = trackExpiry ? newLot(ts, pending.units) : null;
      if (lot) lots.push(lot);
      const oid = 'o' + uid() + idx + 'x';
      mv(ts, 'carico', pending.units, qty, qty + pending.units, { lot: lot?.lot, exp: lot?.exp, lotDelta: lot ? [{ id: lot.id, lot: lot.lot, exp: lot.exp, d: pending.units }] : [], orderId: oid, note: `Arrivo ordine ${supName}` });
      qty += pending.units;
      rawOrders.push({ oid, sid, supName, productId: p.id, name, unit, packSize, packLabel, packs: pending.packs, price, orderedBy: pending.orderedBy, createdAt: pending.orderTs, receivedAt: ts, units: pending.units });
      pending = null;
    }
    const low = Math.ceil(min * 1.5);
    if (scenario === 'esaurito') take(0);
    else if (scenario === 'ordinare') take(Math.max(1, Math.min(qty, min - Math.floor(min * 0.3))));
    else if (scenario === 'basso') take(Math.min(qty, Math.max(min + 1, low - Math.floor((low - min) / 3))));
    else if (scenario === 'arrivo') {
      take(Math.min(qty, Math.max(1, min - 1)));
      if (!pending) {
        const units = Math.ceil((max - qty) / packSize) * packSize;
        pending = { units, packs: units / packSize, orderTs: lastWork + 10 * 3600e3, orderedBy: respOf(cat).id, arrive: today + 2 * DAY };
      }
      rawOrders.push({ oid: 'o' + uid() + idx + 'open', sid, supName, productId: p.id, name, unit, packSize, packLabel, packs: pending.packs, price, orderedBy: pending.orderedBy, createdAt: pending.orderTs, receivedAt: null, expectedAt: startOfDay(pending.arrive), units: 0 });
    } else if (qty <= low) {
      // stato "ok": c'è stato un riassortimento recente
      const units = Math.ceil((max - qty) / packSize) * packSize;
      if (units > 0) {
        const ts = lastWork - DAY + 12 * 3600e3;
        const lot = trackExpiry ? newLot(ts, units) : null;
        if (lot) lots.push(lot);
        const oid = 'o' + uid() + idx + 'r';
        mv(ts, 'carico', units, qty, qty + units, { lot: lot?.lot, exp: lot?.exp, lotDelta: lot ? [{ id: lot.id, lot: lot.lot, exp: lot.exp, d: units }] : [], orderId: oid, note: `Arrivo ordine ${supName}` });
        qty += units;
        rawOrders.push({ oid, sid, supName, productId: p.id, name, unit, packSize, packLabel, packs: units / packSize, price, orderedBy: respOf(cat).id, createdAt: ts - lead * DAY, receivedAt: ts, units });
      }
    }
    if (trackExpiry && lots.length) {
      const sorted = [...lots].sort((a, b) => a.exp.localeCompare(b.exp));
      if (scenario === 'scade') sorted[0].exp = isoDate(today + (24 + Math.floor(R() * 20)) * DAY);
      if (scenario === 'scaduto' && qty > 0) {
        const q = Math.min(1, qty);
        sorted[0].qty -= q;
        lots.push({ id: uid() + 'exp', lot: 'K' + Math.floor(1000 + R() * 8999), exp: isoDate(today - 6 * DAY), qty: q });
      }
      lots = lots.filter((l) => l.qty > 0);
    }
    p.qty = qty;
    p.lots = lots;
    products.push(p);
  });

  // raggruppa in ordini per fornitore e giorno, come avviene davvero
  const orders = [];
  const byKey = new Map();
  for (const r of rawOrders.sort((a, b) => a.createdAt - b.createdAt)) {
    const open = !r.receivedAt;
    const key = `${r.sid}:${isoDate(r.createdAt)}:${open}`;
    let o = byKey.get(key);
    if (!o) {
      o = { id: r.oid, supplierId: r.sid, supplierName: r.supName, status: open ? 'ordinato' : 'arrivato', items: [], createdAt: r.createdAt, orderedBy: r.orderedBy, expectedAt: r.expectedAt || startOfDay(r.receivedAt || now), receivedAt: r.receivedAt, note: '', text: '', demo: true };
      byKey.set(key, o);
      orders.push(o);
    } else if (r.receivedAt) {
      o.receivedAt = Math.max(o.receivedAt || 0, r.receivedAt);
      // ricollega il carico all'ordine unificato
      for (const m of movements) if (m.orderId === r.oid) m.orderId = o.id;
    }
    o.items.push({ productId: r.productId, name: r.name, unit: r.unit, packSize: r.packSize, packLabel: r.packLabel, packs: r.packs, price: r.price, receivedUnits: r.units });
  }
  for (const o of orders) o.total = o.items.reduce((s, it) => s + (it.price || 0) * it.packs, 0);
  movements.sort((a, b) => a.ts - b.ts);
  for (const o of orders) {
    if (o.status !== 'ordinato') continue;
    movements.push({ id: uid() + 'ord' + o.id, ts: o.createdAt, userId: o.orderedBy, type: 'ordine', orderId: o.id, text: `${o.items.length} ${o.items.length === 1 ? 'articolo' : 'articoli'} da ${o.supplierName}`, demo: true });
  }
  // fornitori: soglie di spedizione gratuita come esempio (solo se non impostate)
  for (const s of suppliers) {
    const f = freeShip[s.name.toLowerCase()];
    if (f && s.freeShip == null) s.freeShip = f;
  }

  return { products, movements, orders, suppliers: extraSuppliers, categoryResp };
}
