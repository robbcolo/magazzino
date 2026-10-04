import { html } from '../../vendor/preact-htm.js';
import { S, derived } from '../store.js';
import { Icon, Section, Empty, navigate, openSheet, relDay, fmtDateLong } from '../ui.js';
import { ProductRow, ActivityRow, greeting, SyncPill } from '../shared.js';
import { DAY, startOfDay, STATUS } from '../logic.js';

function Tile({ cls, icon, label, n, unit, items, onClick }) {
  return html`<button class=${`tile ${cls} ${n ? '' : 'zero'}`} onClick=${onClick}>
    <span class="tile-top"><span class="tile-ic"><${Icon} n=${icon} s="20" sw="2.1" /></span>${label}</span>
    <span class="tile-n">${n}${unit && html`<small>${unit}</small>`}</span>
    <ul class="tile-list">${items.slice(0, 3).map((t) => html`<li>${t}</li>`)}${items.length > 3 && html`<li class="muted">e altri ${items.length - 3}</li>`}</ul>
    <span class="tile-bar"></span>
  </button>`;
}

export function Home() {
  const d = derived();
  const today = startOfDay(Date.now());

  const toOrderItems = d.groups.flatMap((g) => g.items.map((it) => it.p.name));
  const low = S.products.filter((p) => d.map.get(p.id)?.status === 'basso').map((p) => p.name);
  const expiring = S.products.filter((p) => { const x = d.map.get(p.id); return x && (x.expiring.length || x.expired.length); });
  const expItems = expiring.map((p) => { const x = d.map.get(p.id); return x.expired.length ? `${p.name}, scaduto` : `${p.name}, ${relDay(Date.now() + x.expiring[0].days * DAY)}`; });
  const inItems = d.open.map((o) => `${o.supplierName}, ${o.expectedAt ? (o.expectedAt < today ? 'in ritardo' : relDay(o.expectedAt)) : 'data non indicata'}`);

  // materiali che richiedono un'azione: finiti, sotto soglia o in calo, non ancora ordinati
  const attention = S.products.filter((p) => {
    const x = d.map.get(p.id);
    return x && (x.status === 'esaurito' || x.status === 'ordinare' || x.status === 'basso') && !(x.incoming > 0);
  }).sort((a, b) => STATUS[d.map.get(a.id).status].rank - STATUS[d.map.get(b.id).status].rank || a.name.localeCompare(b.name, 'it'));

  const recent = S.movements.slice(-8).reverse();

  return html`<div class="page">
    <header class="page-head">
      <div class="grow">
        <h1>${greeting()}</h1>
        <p class="sub">${fmtDateLong(Date.now())}, ${S.settings.studioName}</p>
      </div>
      <${SyncPill} />
    </header>

    <div class="today-grid">
      <${Tile} cls="t-order" icon="alert-triangle" label="Da ordinare" n=${d.toOrder} items=${toOrderItems} onClick=${() => navigate('ordini', { ord: { tab: 'lista' } })} />
      <${Tile} cls="t-low" icon="hourglass" label="In esaurimento" n=${low.length} items=${low} onClick=${() => navigate('magazzino', { mag: { status: 'basso', cat: 'all', q: '', loc: null } })} />
      <${Tile} cls="t-in" icon="truck" label="In arrivo" n=${d.open.length} unit=${d.open.length === 1 ? 'ordine' : 'ordini'} items=${inItems} onClick=${() => navigate('ordini', { ord: { tab: 'arrivo' } })} />
      <${Tile} cls="t-exp" icon="calendar-due" label="In scadenza" n=${expiring.length} items=${expItems} onClick=${() => navigate('magazzino', { mag: { status: 'scadenza', cat: 'all', q: '', loc: null } })} />
    </div>

    ${d.late.map((o) => html`<div class="banner warn">
      <${Icon} n="clock" s="24" />
      <p><b>L'ordine a ${o.supplierName} è in ritardo.</b> Era previsto per ${relDay(o.expectedAt)}. Se è arrivato, registralo; altrimenti contatta il fornitore.</p>
      <button class="btn small" onClick=${() => openSheet('receive', { orderId: o.id })}>Ricevi merce</button>
    </div>`)}

    ${S.settings.demo && html`<div class="banner">
      <${Icon} n="info-circle" s="24" />
      <p><b>Stai provando l'app con materiali di esempio.</b> Quando vuoi iniziare con il vostro magazzino, rimuovili da Impostazioni.</p>
      <button class="btn small" onClick=${() => navigate('impostazioni')}>Impostazioni</button>
    </div>`}

    <div class="home-cols">
      <${Section} title="Da sistemare" right=${attention.length > 0 && html`<button class="link-btn" onClick=${() => navigate('ordini', { ord: { tab: 'lista' } })}>Vai agli ordini<${Icon} n="chevron-right" s="18" /></button>`}>
        ${attention.length
          ? html`<div class="plist">${attention.slice(0, 6).map((p) => html`<${ProductRow} key=${p.id} p=${p} />`)}</div>
            ${attention.length > 6 && html`<button class="link-btn" style="margin-top:10px" onClick=${() => navigate('magazzino', { mag: { status: 'all', cat: 'all', q: '', loc: null, sort: 'urgenza' } })}>Vedi tutti i ${attention.length}</button>`}`
          : html`<div class="group"><${Empty} emoji="🦷" title="Niente da sistemare" text="Qui compaiono i materiali finiti, sotto soglia o in calo che non sono ancora stati ordinati." /></div>`}
      </${Section}>

      <${Section} title="Ultime attività" right=${html`<button class="link-btn" onClick=${() => navigate('attivita')}>Vedi tutto<${Icon} n="chevron-right" s="18" /></button>`}>
        ${recent.length
          ? html`<div class="group timeline">${recent.map((m) => html`<${ActivityRow} key=${m.id} m=${m} />`)}</div>`
          : html`<div class="group"><${Empty} emoji="📋" title="Ancora nessuna attività" text="Ogni prelievo, carico e ordine compare qui, da qualsiasi dispositivo sia stato fatto." /></div>`}
      </${Section}>
    </div>
  </div>`;
}
