// Componenti usati da più schermate
import { html } from '../vendor/preact-htm.js';
import { S, dp, category, user, supplier, stockMove, undoMove, respFor, me, logout } from './store.js';
import {
  Icon, Avatar, StatusChip, ExpChip, Thumb, Carpule, openSheet, toast, haptic, fmtQty, fmtN, unitFor, relTime, userName,
} from './ui.js';

export function ProductRow({ p, showResp = false }) {
  const d = dp(p.id);
  if (!d) return null;
  const cat = category(p.catId);
  const resp = user(respFor(p));
  const flash = (e) => {
    const row = e.currentTarget.closest('.prow');
    row?.classList.remove('flash'); void row?.offsetWidth; row?.classList.add('flash');
  };
  const take = (e) => {
    const mv = stockMove(p.id, 'scarico', 1);
    if (!mv) { toast(`Risultano 0 ${p.unit}. Se non è così, correggi la quantità.`, { icon: 'alert-circle' }); openSheet('move', { id: p.id, mode: 'correggo' }); return; }
    haptic(); flash(e);
    toast(`Preso 1 ${unitFor(p.unit, 1)}: ${p.name}`, { undo: () => undoMove(mv.id), icon: 'minus' });
  };
  const add = (e) => {
    const mv = stockMove(p.id, 'carico', 1);
    haptic(); flash(e);
    toast(`Caricato 1 ${unitFor(p.unit, 1)}: ${p.name}`, { undo: () => undoMove(mv.id), icon: 'plus' });
  };
  const open = () => openSheet('product', { id: p.id });
  return html`<div class="prow">
    <span onClick=${open} style="cursor:pointer"><${Thumb} p=${p} size=${56} /></span>
    <div class="prow-main" onClick=${open} role="button" tabindex="0" onKeyDown=${(e) => e.key === 'Enter' && open()}>
      <div class="prow-name">${p.name}</div>
      <div class="prow-meta">${p.brand && html`<span>${p.brand}</span>`}${p.location && html`<span class="loc"><${Icon} n="map-pin" s="14" />${p.location}</span>`}${!p.brand && !p.location && html`<span>${cat?.name || ''}</span>`}</div>
      <div class="prow-chips">
        ${d.status !== 'ok' && html`<${StatusChip} status=${d.status} small />`}
        <${ExpChip} d=${d} />
        ${d.incoming > 0 && d.status !== 'arrivo' && html`<span class="chip sm st-arrivo"><${Icon} n="truck" s="14" sw="2.2" />In arrivo ${fmtN(d.incoming)}</span>`}
        ${showResp && resp && html`<span class="chip sm neutral"><${Avatar} u=${resp} size=${16} />Ordina ${resp.name}</span>`}
      </div>
    </div>
    <button class="prow-level" onClick=${() => openSheet('move', { id: p.id, mode: 'prendo' })} aria-label=${`Quantità: ${fmtQty(d.qty, p.unit)}. Tocca per inserire un numero`}>
      <${Carpule} level=${d.level} minLevel=${d.minLevel} status=${d.status} />
      <span class="prow-qty">${fmtN(d.qty)}<small>${unitFor(p.unit, d.qty)}</small></span>
      ${p.min > 0 && html`<span class="prow-thr">soglia ${fmtN(p.min)}</span>`}
    </button>
    <div class="prow-actions">
      <button class="qbtn take" onClick=${take} aria-label=${`Prendi 1 ${unitFor(p.unit, 1)}`} title="Prendo 1"><${Icon} n="minus" s="26" sw="2.6" /></button>
      <button class="qbtn" onClick=${add} aria-label=${`Carica 1 ${unitFor(p.unit, 1)}`} title="Carico 1"><${Icon} n="plus" s="26" sw="2.6" /></button>
    </div>
  </div>`;
}

export function describeMove(m) {
  const who = userName(m.userId);
  const q = Math.abs(m.qty || 0);
  const what = m.pname || 'un materiale';
  switch (m.type) {
    case 'scarico': return html`<b>${who}</b> ha preso ${fmtQty(q, m.unit)} di <b>${what}</b>`;
    case 'carico': return m.orderId
      ? html`<b>${who}</b> ha caricato ${fmtQty(q, m.unit)} di <b>${what}</b> arrivati con l'ordine`
      : html`<b>${who}</b> ha caricato ${fmtQty(q, m.unit)} di <b>${what}</b>`;
    case 'rettifica': return html`<b>${who}</b> ha corretto <b>${what}</b>: ora sono ${fmtQty(m.after, m.unit)}`;
    case 'scarto': return html`<b>${who}</b> ha eliminato ${fmtQty(q, m.unit)} scaduti di <b>${what}</b>`;
    case 'nuovo': return html`<b>${who}</b> ha aggiunto <b>${what}</b> al magazzino`;
    case 'modifica': return html`<b>${who}</b> ha modificato la scheda di <b>${what}</b>`;
    case 'elimina': return html`<b>${who}</b> ha tolto <b>${what}</b> dal magazzino`;
    case 'ordine': return html`<b>${who}</b> ha ordinato ${m.text}`;
    case 'arrivo': return html`<b>${who}</b> ha registrato l'arrivo: ${m.text?.toLowerCase()}`;
    case 'annullato': return html`<b>${who}</b>: ${m.text?.toLowerCase()}`;
    default: return html`<b>${who}</b> ${m.text || ''}`;
  }
}

const MV_ICON = { scarico: 'minus', carico: 'plus', rettifica: 'pencil', scarto: 'trash', nuovo: 'sparkles', modifica: 'pencil', elimina: 'trash', ordine: 'send', arrivo: 'package-import', annullato: 'x' };

export function ActivityRow({ m, showTime = true }) {
  const u = user(m.userId);
  const clickable = m.productId && S.products.some((p) => p.id === m.productId);
  const Tag = clickable ? 'button' : 'div';
  return html`<${Tag} class="row has-lead" onClick=${clickable ? () => openSheet('product', { id: m.productId }) : undefined}>
    <${Avatar} u=${u} size=${40} />
    <div class="row-main">
      <div class="row-title" style="font-weight:450;font-size:15.5px">${describeMove(m)}</div>
      ${showTime && html`<div class="row-sub">${relTime(m.ts)}${m.lot ? `, lotto ${m.lot}` : ''}${m.note && m.type !== 'carico' ? `, ${m.note}` : ''}</div>`}
    </div>
    <span class="row-end"><${Icon} n=${MV_ICON[m.type] || 'dots'} s="18" /></span>
  </${Tag}>`;
}

export function digits(s) { return (s || '').replace(/[^\d+]/g, '').replace(/^\+/, ''); }
export function waNumber(s) {
  let d = digits(s);
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length <= 10 && d.startsWith('3')) d = '39' + d; // cellulare italiano senza prefisso
  return d;
}

export function SupplierContacts({ s, text }) {
  if (!s) return null;
  const btns = [];
  if (s.phone) btns.push(html`<a class="icon-btn" href=${`tel:${s.phone.replace(/\s+/g, '')}`} aria-label=${`Chiama ${s.name}`} title="Chiama"><${Icon} n="phone" s="20" /></a>`);
  if (s.whatsapp) btns.push(html`<a class="icon-btn wa" href=${`https://wa.me/${waNumber(s.whatsapp)}${text ? `?text=${encodeURIComponent(text)}` : ''}`} target="_blank" rel="noopener" aria-label=${`WhatsApp ${s.name}`} title="WhatsApp"><${Icon} n="brand-whatsapp" s="20" /></a>`);
  if (s.email) btns.push(html`<a class="icon-btn" href=${`mailto:${s.email}`} aria-label=${`Email a ${s.name}`} title="Email"><${Icon} n="mail" s="20" /></a>`);
  if (s.web) btns.push(html`<a class="icon-btn" href=${s.web} target="_blank" rel="noopener" aria-label=${`Sito di ${s.name}`} title="Sito"><${Icon} n="world" s="20" /></a>`);
  return html`<div class="og-contacts">${btns}</div>`;
}

export function searchUrl(s, q) {
  if (!s) return null;
  if (s.searchUrl && s.searchUrl.includes('{q}')) return s.searchUrl.replace('{q}', encodeURIComponent(q));
  if (s.web) {
    try { const host = new URL(s.web).hostname.replace(/^www\./, ''); return `https://www.google.com/search?q=${encodeURIComponent(`site:${host} ${q}`)}`; } catch { return null; }
  }
  return null;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
}

export function MeMini() {
  const u = me();
  return html`<button class="me-mini" onClick=${() => logout()} aria-label="Cambia utente"><${Avatar} u=${u} size=${40} /></button>`;
}

export { supplier };
