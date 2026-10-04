import { html, useState } from '../../vendor/preact-htm.js';
import { S, derived, supplier, user, me, order, product, createOrder, receiveOrder, cancelOrder, closeOrder, updateOrder } from '../store.js';
import {
  SHEETS, Sheet, Icon, Avatar, Field, Stepper, Empty, openSheet, toast, confirmDialog, haptic, fmtEuro, fmtQty, fmtDate, relDay,
  unitFor, plural, NumberInput,
} from '../ui.js';
import { waNumber } from '../shared.js';
import { orderText, isoDate, parseISO, addWorkDays, startOfDay, DAY } from '../logic.js';

// ---------------- Preparare e inviare un ordine ----------------
function OrderComposeSheet({ supplierId, close }) {
  const g = derived().groups.find((x) => (x.supplierId || '') === (supplierId || ''));
  const s = supplier(supplierId);
  const u = me();
  const items = g?.items || [];
  const [text, setText] = useState(() => orderText({ supplier: s, items, settings: S.settings, user: u }));
  const lead = s?.leadDays ?? S.settings.defaultLeadDays ?? 3;
  const [expected, setExpected] = useState(isoDate(addWorkDays(Date.now(), lead, S.settings.workDays)));
  const [sent, setSent] = useState(false);
  if (!items.length) return html`<${Sheet} title="Ordine" close=${close}><${Empty} emoji="✅" title="Non ci sono più materiali da ordinare a questo fornitore" /></${Sheet}>`;

  const total = items.reduce((t, it) => t + (it.price || 0) * it.packs, 0);
  const subject = `Ordine ${S.settings.studioName}`;
  const wa = s?.whatsapp ? `https://wa.me/${waNumber(s.whatsapp)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
  const mail = `mailto:${s?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast('Testo copiato. Incollalo nel modulo del fornitore o in un messaggio.', { icon: 'copy' }); setSent(true); }
    catch { toast('Non riesco a copiare: tieni premuto sul testo e scegli Copia.'); }
  };
  const share = async () => {
    try { await navigator.share({ title: subject, text }); setSent(true); } catch { /* annullato */ }
  };
  const confirm = () => {
    const o = createOrder({ supplierId, items, expectedAt: parseISO(expected), text });
    haptic();
    close();
    toast(`Ordine a ${o.supplierName} registrato. Lo trovi in «In arrivo».`, { icon: 'circle-check', ms: 4500 });
  };

  return html`<${Sheet} title=${`Ordine a ${s?.name || 'fornitore'}`} sub=${`${plural(items.length, 'materiale', 'materiali')}${total ? `, ${fmtEuro(total)}` : ''}`} close=${close} wide
    footer=${html`
      <${Field} label="Arrivo previsto" cls="grow"><input class="input" type="date" value=${expected} onInput=${(e) => setExpected(e.target.value)} style="max-width:220px" /></${Field}>
      <button class="btn primary big" onClick=${confirm}><${Icon} n="check" s="22" />Segna come ordinato</button>`}>
    <ol class="ink2" style="margin:0 0 14px;padding-left:22px;display:grid;gap:4px">
      <li>Invia il testo al fornitore nel modo che preferisci.</li>
      <li>Poi tocca «Segna come ordinato»: così nessun altro lo ordina una seconda volta.</li>
    </ol>
    <div class="share-grid">
      <a class="btn" href=${wa} target="_blank" rel="noopener" onClick=${() => setSent(true)}><${Icon} n="brand-whatsapp" s="26" cls="wa" />${s?.whatsapp ? `WhatsApp a ${s.agent || s.name}` : 'WhatsApp'}</a>
      <a class="btn" href=${mail} onClick=${() => setSent(true)}><${Icon} n="mail" s="26" />Email</a>
      <button class="btn" onClick=${copy}><${Icon} n="copy" s="26" />Copia testo</button>
      ${navigator.share && html`<button class="btn" onClick=${share}><${Icon} n="share" s="26" />Condividi</button>`}
      ${s?.web && html`<a class="btn" href=${s.web} target="_blank" rel="noopener" onClick=${() => { navigator.clipboard?.writeText(text).catch(() => {}); setSent(true); }}><${Icon} n="world" s="26" />Ordina sul sito</a>`}
      ${s?.phone && html`<a class="btn" href=${`tel:${s.phone.replace(/\s+/g, '')}`} onClick=${() => setSent(true)}><${Icon} n="phone" s="26" />Chiama</a>`}
    </div>
    <div style="margin-top:16px">
      <${Field} label="Testo dell'ordine" hint="Puoi modificarlo prima di inviarlo.">
        <textarea class="order-text" value=${text} onInput=${(e) => setText(e.target.value)} rows="10"></textarea>
      </${Field}>
    </div>
  </${Sheet}>`;
}

// ---------------- Ricevere la merce ----------------
function ReceiveSheet({ orderId, close }) {
  const o = order(orderId);
  const [rows, setRows] = useState(() => (o?.items || []).map((it) => {
    const p = product(it.productId);
    const remaining = Math.max(0, it.packs * it.packSize - (it.receivedUnits || 0));
    return { productId: it.productId, name: it.name, unit: it.unit, packSize: it.packSize, packLabel: it.packLabel, ordered: it.packs * it.packSize, received: it.receivedUnits || 0, units: remaining, lot: '', exp: '', price: it.price, track: !!p?.trackExpiry, exists: !!p };
  }));
  if (!o) return null;
  const set = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const any = rows.some((r) => r.units > 0 && r.exists);
  const confirm = () => {
    receiveOrder(o.id, rows.filter((r) => r.exists));
    haptic();
    close();
    const done = order(o.id).status === 'arrivato';
    toast(done ? `Merce caricata in magazzino. Ordine a ${o.supplierName} completato.` : 'Merce caricata. L\'ordine resta aperto per i materiali mancanti.', { icon: 'package-import', ms: 4500 });
  };
  return html`<${Sheet} title=${`Ricevi merce da ${o.supplierName}`} sub="Controlla le quantità arrivate. Lotto e scadenza si leggono anche dal codice sulla confezione." close=${close} wide
    footer=${html`<span class="grow"></span><button class="btn ghost" onClick=${close}>Annulla</button><button class="btn primary big" onClick=${confirm} disabled=${!any}><${Icon} n="package-import" s="22" />Carica in magazzino</button>`}>
    ${rows.map((r, i) => html`<div class="recv-row" key=${r.productId}>
      <div>
        <div class="row-title">${r.name}</div>
        <div class="row-sub">Ordinati ${fmtQty(r.ordered, r.unit)}${r.packSize > 1 ? ` (${r.ordered / r.packSize} × ${r.packLabel} da ${r.packSize})` : ''}${r.received ? `, già arrivati ${r.received}` : ''}</div>
        ${!r.exists && html`<div class="row-sub warn-text">Questo materiale è stato eliminato dal magazzino.</div>`}
      </div>
      <${Stepper} value=${r.units} onChange=${(v) => set(i, { units: v })} unit=${unitFor(r.unit, r.units)} />
      ${r.exists && html`<div class="recv-lot">
        <input class="input" value=${r.lot} onInput=${(e) => set(i, { lot: e.target.value })} placeholder=${r.track ? 'Lotto' : 'Lotto (facoltativo)'} aria-label="Lotto" autocapitalize="characters" />
        <input class="input" type="date" value=${r.exp} onInput=${(e) => set(i, { exp: e.target.value })} aria-label="Scadenza" />
        <button type="button" class="btn ghost" onClick=${() => openSheet('scanCode', { title: `Lotto e scadenza di ${r.name}`, onCode: (c) => {
          if (!c.lot && !c.exp) { toast('In questo codice non ci sono lotto o scadenza.'); return false; }
          setRows((rs) => rs.map((x, j) => (j === i ? { ...x, lot: c.lot || x.lot, exp: c.exp || x.exp } : x)));
          return true;
        } })}><${Icon} n="barcode" s="20" />Leggi</button>
      </div>`}
    </div>`)}
  </${Sheet}>`;
}

// ---------------- Dettaglio di un ordine ----------------
function OrderViewSheet({ orderId, close }) {
  const o = order(orderId);
  if (!o) return null;
  const by = user(o.orderedBy);
  const open = o.status === 'ordinato' || o.status === 'parziale';
  const statusLabel = { ordinato: 'In arrivo', parziale: 'Arrivato in parte', arrivato: o.closedPartial ? 'Chiuso (arrivato in parte)' : 'Arrivato', annullato: 'Annullato' }[o.status];
  return html`<${Sheet} title=${`Ordine a ${o.supplierName}`} sub=${`${statusLabel}, ${fmtDate(o.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}`} close=${close} wide
    footer=${open ? html`
      <button class="btn soft-danger" onClick=${async () => { if (await confirmDialog({ title: 'Annullare l\'ordine?', text: 'I materiali torneranno nella lista «Da ordinare» se sono ancora sotto la soglia.', ok: 'Annulla ordine', cancel: 'Indietro', danger: true })) { cancelOrder(o.id); close(); toast('Ordine annullato'); } }}>Annulla ordine</button>
      ${o.status === 'parziale' && html`<button class="btn ghost" onClick=${async () => { if (await confirmDialog({ title: 'Chiudere l\'ordine?', text: 'Usalo se il resto non arriverà: i materiali mancanti torneranno da ordinare.', ok: 'Chiudi ordine' })) { closeOrder(o.id); close(); } }}>Il resto non arriva</button>`}
      <span class="grow"></span>
      <button class="btn primary" onClick=${() => { close(); openSheet('receive', { orderId: o.id }); }}><${Icon} n="package-import" s="20" />Ricevi merce</button>` : null}>
    <div class="facts" style="margin-top:0">
      <div class="fact"><span>Ordinato da</span><b style="display:flex;gap:8px;align-items:center"><${Avatar} u=${by} size=${24} />${by?.name || '—'}</b><small>${fmtDate(o.createdAt, { weekday: 'long', day: 'numeric', month: 'long' })}</small></div>
      <div class="fact"><span>${o.receivedAt ? 'Arrivato' : 'Arrivo previsto'}</span><b>${o.receivedAt ? fmtDate(o.receivedAt, { day: 'numeric', month: 'long' }) : o.expectedAt ? relDay(o.expectedAt) : '–'}</b>
        ${open && html`<small><input class="input" type="date" style="min-height:40px;padding:6px 10px;margin-top:6px;font-size:15px" value=${o.expectedAt ? isoDate(o.expectedAt) : ''} onChange=${(e) => updateOrder(o.id, { expectedAt: parseISO(e.target.value) })} aria-label="Cambia data prevista" /></small>`}
      </div>
      <div class="fact"><span>Totale</span><b>${fmtEuro(o.total)}</b><small>${plural(o.items.length, 'articolo', 'articoli')}</small></div>
    </div>
    <div class="group" style="margin-top:16px">
      ${o.items.map((it) => html`<div class="row" key=${it.productId}>
        <div class="row-main">
          <div class="row-title">${it.packs} × ${it.name}</div>
          <div class="row-sub">${it.packSize > 1 ? `${it.packLabel} da ${it.packSize} ${it.unit}, ` : ''}arrivati ${fmtQty(it.receivedUnits || 0, it.unit)} su ${it.packs * it.packSize}</div>
        </div>
        <span class="tnum">${it.price != null ? fmtEuro(it.price * it.packs) : '–'}</span>
      </div>`)}
    </div>
    ${o.text && html`<div class="card" style="margin-top:16px"><div class="card-title">Testo inviato</div><p style="white-space:pre-wrap;font-size:15px" class="ink2">${o.text}</p></div>`}
  </${Sheet}>`;
}

Object.assign(SHEETS, { orderCompose: OrderComposeSheet, receive: ReceiveSheet, orderView: OrderViewSheet });
