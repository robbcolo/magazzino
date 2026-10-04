import { html } from '../../vendor/preact-htm.js';
import { S, derived } from '../store.js';
import { Icon, Empty, openSheet, plural, fmtEuro } from '../ui.js';
import { SupplierContacts, SyncPill } from '../shared.js';

export function Fornitori() {
  const d = derived();
  const list = [...S.suppliers].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  return html`<div class="page">
    <header class="page-head">
      <div class="grow">
        <h1>Fornitori</h1>
        <p class="sub">Tocca un fornitore per cambiarne nome, contatti, tempi di consegna e spedizione gratuita.</p>
      </div>
      <div class="head-actions">
        <button class="btn primary" onClick=${() => openSheet('supplierEdit', {})}><${Icon} n="plus" s="20" sw="2.4" />Nuovo fornitore</button>
        <${SyncPill} />
      </div>
    </header>
    ${!list.length
      ? html`<div class="group"><${Empty} emoji="🏪" title="Nessun fornitore" text="Aggiungi i fornitori da cui acquistate: li userai per preparare gli ordini." /></div>`
      : html`<div class="group">
        ${list.map((s) => {
          const products = S.products.filter((p) => p.supplierId === s.id);
          const g = d.groups.find((x) => x.supplierId === s.id);
          const toOrder = g?.items.length || 0;
          return html`<div class="row" key=${s.id}>
            <button class="row-main" style="border:0;background:none;text-align:left;padding:0" onClick=${() => openSheet('supplierEdit', { id: s.id })}>
              <div class="row-title">${s.name}</div>
              <div class="row-sub">${plural(products.length, 'materiale', 'materiali')}${s.leadDays ? `, consegna in ${plural(s.leadDays, 'giorno', 'giorni')}` : ''}${s.freeShip ? `, gratis sopra ${fmtEuro(s.freeShip)}` : ''}${s.agent ? `, referente ${s.agent}` : ''}</div>
            </button>
            ${toOrder > 0 && html`<span class="chip sm st-ordinare"><${Icon} n="shopping-cart" s="14" />${toOrder} da ordinare</span>`}
            <${SupplierContacts} s=${s} />
            <button class="icon-btn plain" aria-label=${`Modifica ${s.name}`} onClick=${() => openSheet('supplierEdit', { id: s.id })}><${Icon} n="chevron-right" s="20" /></button>
          </div>`;
        })}
      </div>`}
    <p class="muted" style="font-size:14px;margin-top:14px">Il tasto WhatsApp apre la chat con il numero indicato; per gli agenti di zona è il modo più rapido per inviare l'ordine.</p>
  </div>`;
}
