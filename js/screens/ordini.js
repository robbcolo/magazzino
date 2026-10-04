import { html } from '../../vendor/preact-htm.js';
import { S, derived, supplier, listSet, listRemove, listAdd, listRestore, emit } from '../store.js';
import {
  Icon, StatusChip, Thumb, Segmented, Stepper, Empty, U, openSheet, toast, fmtEuro, fmtQty, fmtN, fmtDate, relDay,
  unitFor, plural, Bars, haptic,
} from '../ui.js';
import { SupplierContacts, SyncPill } from '../shared.js';
import { startOfDay, DAY, priceFor } from '../logic.js';

export function Ordini() {
  const d = derived();
  const t = U.ord.tab;
  const setTab = (tab) => { U.ord = { ...U.ord, tab }; emit(); };
  const history = S.orders.filter((o) => o.status === 'arrivato' || o.status === 'annullato');
  return html`<div class="page">
    <header class="page-head">
      <div class="grow">
        <h1>Ordini</h1>
        <p class="sub">${d.toOrder ? `${plural(d.toOrder, 'materiale', 'materiali')} da ordinare` : 'Niente da ordinare adesso'}${d.open.length ? `, ${plural(d.open.length, 'ordine', 'ordini')} in arrivo` : ''}</p>
      </div>
      <${SyncPill} />
    </header>
    <${Segmented} value=${t} onChange=${setTab} options=${[
      { v: 'lista', l: 'Da ordinare', icon: 'shopping-cart', badge: d.toOrder || null },
      { v: 'arrivo', l: 'In arrivo', icon: 'truck', badge: d.late.length || null },
      { v: 'storico', l: 'Storico', icon: 'history' },
      { v: 'spese', l: 'Spese', icon: 'chart-bar' },
    ]} />
    <div style="margin-top:18px">
      ${t === 'lista' && html`<${DaOrdinare} />`}
      ${t === 'arrivo' && html`<${InArrivo} />`}
      ${t === 'storico' && html`<${Storico} orders=${history} />`}
      ${t === 'spese' && html`<${Spese} />`}
    </div>
  </div>`;
}

function DaOrdinare() {
  const d = derived();
  const groups = d.groups.filter((g) => g.items.length);
  const extrasOnly = d.groups.filter((g) => !g.items.length && g.extra.length);
  return html`
    ${groups.length
      ? groups.map((g) => html`<${OrderGroup} key=${g.supplierId || 'none'} g=${g} />`)
      : html`<div class="group"><${Empty} emoji="✅" title="Tutto sotto controllo"
          text="Quando un materiale scende sotto la soglia compare qui, già diviso per fornitore e con la quantità consigliata." /></div>`}
    ${extrasOnly.length > 0 && html`<div class="section">
      <div class="section-head"><h2>In esaurimento, da altri fornitori</h2></div>
      <div class="group">
        ${extrasOnly.flatMap((g) => g.extra.map((x) => html`<div class="row has-lead" key=${x.p.id}>
          <${Thumb} p=${x.p} size=${44} />
          <div class="row-main"><div class="row-title">${x.p.name}</div><div class="row-sub">${g.supplier?.name || 'Senza fornitore'}, ${x.d.qty === 1 ? 'ne resta' : 'ne restano'} ${fmtQty(x.d.qty, x.p.unit)}</div></div>
          <button class="btn small" onClick=${() => { listAdd(x.p.id, x.packs); haptic(); toast(`${x.p.name} aggiunto alla lista`); }}><${Icon} n="plus" s="18" />Aggiungi</button>
        </div>`))}
      </div>
    </div>`}`;
}

function OrderGroup({ g }) {
  const s = g.supplier;
  const free = s?.freeShip;
  const pct = free ? Math.min(100, (g.total / free) * 100) : 0;
  return html`<section class="og">
    <div class="og-head">
      <div class="grow">
        <h3>${s?.name || 'Senza fornitore'}</h3>
        <div class="og-sub">${plural(g.items.length, 'materiale', 'materiali')}${s?.leadDays ? `, consegna in circa ${plural(s.leadDays, 'giorno', 'giorni')}` : ''}${!s ? ', scegli un fornitore nella scheda di ogni materiale' : ''}</div>
      </div>
      <${SupplierContacts} s=${s} />
    </div>
    ${g.items.map((it) => html`<${OrderItem} key=${it.p.id} it=${it} />`)}
    ${g.extra.length > 0 && html`<details class="extra">
      <summary><${Icon} n="plus" s="18" />Aggiungi altri in esaurimento da ${s?.name || 'questo gruppo'} (${g.extra.length})</summary>
      ${g.extra.map((x) => html`<div class="extra-row" key=${x.p.id}>
        <${Thumb} p=${x.p} size=${40} />
        <div class="row-main"><div class="row-title">${x.p.name}</div><div class="row-sub">${x.skipped ? 'Rimandato' : `${x.d.qty === 1 ? 'Ne resta' : 'Ne restano'} ${fmtQty(x.d.qty, x.p.unit)}`}${x.price != null ? `, ${fmtEuro(x.price)} a ${x.p.packLabel || 'confezione'}` : ''}</div></div>
        <button class="btn small" onClick=${() => { if (x.skipped) listRestore(x.p.id); else listAdd(x.p.id, x.packs); haptic(); }}><${Icon} n="plus" s="18" />Aggiungi</button>
      </div>`)}
    </details>`}
    <div class="og-foot">
      ${free ? html`<div class=${`ship ${g.freeShipMissing === 0 ? 'done' : ''}`}>
        <span>${g.freeShipMissing === 0 ? 'Spedizione gratuita raggiunta' : `Mancano ${fmtEuro(g.freeShipMissing)} alla spedizione gratuita (${fmtEuro(free)})`}</span>
        <div class="ship-bar"><i style=${{ width: pct + '%' }}></i></div>
      </div>` : html`<div class="grow" style="flex:1"></div>`}
      <div class="og-total">${g.priced ? fmtEuro(g.total) : g.total ? `${fmtEuro(g.total)} circa` : ''}</div>
      <button class="btn primary" onClick=${() => openSheet('orderCompose', { supplierId: g.supplierId })} disabled=${!g.items.length}><${Icon} n="send" s="20" />Prepara ordine</button>
    </div>
  </section>`;
}

function OrderItem({ it }) {
  const { p, d } = it;
  const packName = p.packSize > 1 ? (p.packLabel || 'confezioni') : unitFor(p.unit, it.packs);
  return html`<div class="og-item">
    <span onClick=${() => openSheet('product', { id: p.id })} style="cursor:pointer"><${Thumb} p=${p} size=${48} /></span>
    <div class="row-main" onClick=${() => openSheet('product', { id: p.id })} style="cursor:pointer">
      <div class="row-title">${p.name}</div>
      <div class="row-sub">${d.qty === 1 ? 'Ne resta' : 'Ne restano'} ${fmtQty(d.qty, p.unit)}${p.min ? ` (soglia ${fmtN(p.min)})` : ''}${p.packSize > 1 ? `, ${p.packLabel || 'confezione'} da ${p.packSize}` : ''}</div>
      <div class="prow-chips">
        ${it.manual ? html`<span class="chip sm neutral"><${Icon} n="hand-grab" s="14" />Aggiunto a mano</span>` : html`<${StatusChip} status=${d.status} small />`}
      </div>
    </div>
    <div class="og-controls">
    <div class="og-qty">
      <${Stepper} value=${it.packs} min=${1} onChange=${(v) => listSet(p.id, { packs: v })} />
      <span class="muted" style="font-size:13px">${packName}</span>
    </div>
    <div class="og-price">
      <span class="price">${it.price != null ? fmtEuro(it.price * it.packs) : html`<span class="muted">prezzo?</span>`}</span>
      <button class="icon-btn plain" aria-label=${`Togli ${p.name} dalla lista`} title="Non ordinare adesso" onClick=${() => { listRemove(p.id); toast(`${p.name} tolto dalla lista`, { undo: () => (it.manual ? listAdd(p.id, it.packs) : listRestore(p.id)) }); }}><${Icon} n="x" s="20" /></button>
    </div>
    </div>
  </div>`;
}

function InArrivo() {
  const d = derived();
  const today = startOfDay(Date.now());
  const open = [...d.open].sort((a, b) => (a.expectedAt || 0) - (b.expectedAt || 0));
  if (!open.length) return html`<div class="group"><${Empty} emoji="🚚" title="Nessun ordine in arrivo" text="Quando segni un ordine come inviato, lo trovi qui finché non registri l'arrivo della merce." /></div>`;
  return open.map((o) => {
    const late = o.expectedAt && o.expectedAt < today;
    return html`<article class="oc" key=${o.id}>
      <div class="oc-head">
        <div class="grow">
          <h3 style="font-size:19px">${o.supplierName}</h3>
          <div class="row-sub" style="margin-top:4px">Ordinato ${relDay(o.createdAt)}</div>
        </div>
        ${o.status === 'parziale' && html`<span class="chip st-basso"><${Icon} n="package-import" s="16" />Arrivato in parte</span>`}
        ${late ? html`<span class="chip st-ordinare"><${Icon} n="clock" s="16" />In ritardo, previsto ${relDay(o.expectedAt)}</span>`
          : o.expectedAt ? html`<span class="chip st-arrivo"><${Icon} n="truck" s="16" />Arriva ${relDay(o.expectedAt)}</span>` : null}
      </div>
      <ul class="oc-items">
        ${o.items.map((it) => html`<li key=${it.productId}>${it.packs} × ${it.name}${it.packSize > 1 ? ` (${it.packLabel} da ${it.packSize})` : ''}${it.receivedUnits ? html` <span class="okay-text">, arrivati ${fmtQty(it.receivedUnits, it.unit)}</span>` : ''}</li>`)}
      </ul>
      <div class="oc-actions">
        <button class="btn primary" onClick=${() => openSheet('receive', { orderId: o.id })}><${Icon} n="package-import" s="20" />Ricevi merce</button>
        <button class="btn ghost" onClick=${() => openSheet('orderView', { orderId: o.id })}>Dettagli</button>
        <${SupplierContacts} s=${supplier(o.supplierId)} />
      </div>
    </article>`;
  });
}

function Storico({ orders }) {
  if (!orders.length) return html`<div class="group"><${Empty} emoji="🗂️" title="Ancora nessun ordine concluso" text="Qui trovi gli ordini arrivati o annullati, con spesa e data." /></div>`;
  const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
  const months = new Map();
  for (const o of sorted) {
    const k = new Date(o.createdAt).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    if (!months.has(k)) months.set(k, []);
    months.get(k).push(o);
  }
  return [...months.entries()].map(([m, list]) => html`<div key=${m}>
    <div class="group-title" style="text-transform:none">${m.charAt(0).toUpperCase() + m.slice(1)}, ${fmtEuro(list.filter((o) => o.status !== 'annullato').reduce((s, o) => s + (o.total || 0), 0))}</div>
    <div class="group">
      ${list.map((o) => html`<button class="row" key=${o.id} onClick=${() => openSheet('orderView', { orderId: o.id })}>
        <div class="row-main">
          <div class="row-title">${o.supplierName}</div>
          <div class="row-sub">${fmtDate(o.createdAt, { day: 'numeric', month: 'long' })}, ${plural(o.items.length, 'articolo', 'articoli')}</div>
        </div>
        <span class="row-end">
          ${o.status === 'annullato' ? html`<span class="chip sm neutral">Annullato</span>` : html`<span class="tnum" style="color:var(--ink)">${fmtEuro(o.total)}</span>`}
          <${Icon} n="chevron-right" s="18" cls="chev" />
        </span>
      </button>`)}
    </div>
  </div>`);
}

function Spese() {
  const valid = S.orders.filter((o) => o.status !== 'annullato');
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ y: dt.getFullYear(), m: dt.getMonth(), label: dt.toLocaleDateString('it-IT', { month: 'short' }), total: 0 });
  }
  for (const o of valid) {
    const dt = new Date(o.createdAt);
    const slot = months.find((x) => x.y === dt.getFullYear() && x.m === dt.getMonth());
    if (slot) slot.total += o.total || 0;
  }
  const year = now.getFullYear();
  const thisYear = valid.filter((o) => new Date(o.createdAt).getFullYear() === year);
  const bySup = new Map();
  for (const o of thisYear) bySup.set(o.supplierName, (bySup.get(o.supplierName) || 0) + (o.total || 0));
  const sup = [...bySup.entries()].sort((a, b) => b[1] - a[1]);
  const yearTotal = sup.reduce((s, x) => s + x[1], 0);
  const byCat = new Map();
  for (const o of thisYear) for (const it of o.items) {
    const p = S.products.find((x) => x.id === it.productId);
    const c = S.categories.find((x) => x.id === p?.catId);
    const k = c ? `${c.emoji} ${c.name}` : 'Altro';
    byCat.set(k, (byCat.get(k) || 0) + (it.price || 0) * it.packs);
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  if (!valid.length) return html`<div class="group"><${Empty} emoji="📊" title="Ancora nessuna spesa registrata" text="La spesa si calcola dai prezzi degli ordini. Inserisci i prezzi nelle schede dei materiali per vederla qui." /></div>`;
  return html`
    <div class="card">
      <div class="card-title">Spesa mensile, ultimi 12 mesi</div>
      <${Bars} values=${months.map((m) => Math.round(m.total))} labels=${months.map((m) => m.label)} titles=${months.map((m) => `a ${new Date(m.y, m.m, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`)} fmt=${fmtEuro} height=${150} />
    </div>
    <div class="form-grid" style="margin-top:14px;align-items:start">
      <div class="card" style="margin:0">
        <div class="card-title"><span class="grow">Per fornitore nel ${year}</span><span class="tnum">${fmtEuro(yearTotal)}</span></div>
        ${sup.map(([n, v]) => html`<${ShareRow} key=${n} label=${n} value=${v} total=${yearTotal} />`)}
      </div>
      <div class="card" style="margin:0">
        <div class="card-title">Per categoria nel ${year}</div>
        ${cats.map(([n, v]) => html`<${ShareRow} key=${n} label=${n} value=${v} total=${yearTotal} />`)}
      </div>
    </div>
    <p class="muted" style="font-size:14px;margin-top:12px">Calcolata dai prezzi inseriti negli ordini, IVA secondo come li avete registrati.</p>`;
}

function ShareRow({ label, value, total }) {
  const pct = total ? (value / total) * 100 : 0;
  return html`<div style="padding:8px 0">
    <div style="display:flex;justify-content:space-between;gap:10px;font-size:15px"><span>${label}</span><span class="tnum">${fmtEuro(value)}</span></div>
    <div class="ship-bar" style="margin-top:6px;height:6px"><i style=${{ width: pct + '%' }}></i></div>
  </div>`;
}
