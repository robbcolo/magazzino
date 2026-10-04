import { html } from '../../vendor/preact-htm.js';
import { S, derived, me, isAdmin, respFor, supplier, user } from '../store.js';
import { Icon, Section, Empty, navigate, openSheet, relDay, fmtDateLong, plural } from '../ui.js';
import { ProductRow, ActivityRow, greeting, MeMini } from '../shared.js';
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
  const u = me();
  const today = startOfDay(Date.now());

  const toOrderItems = d.groups.flatMap((g) => g.items.map((it) => it.p.name));
  const low = S.products.filter((p) => d.map.get(p.id)?.status === 'basso').map((p) => p.name);
  const expiring = S.products.filter((p) => { const x = d.map.get(p.id); return x && (x.expiring.length || x.expired.length); });
  const expItems = expiring.map((p) => { const x = d.map.get(p.id); return x.expired.length ? `${p.name}, scaduto` : `${p.name}, ${relDay(Date.now() + x.expiring[0].days * DAY)}`; });
  const inItems = d.open.map((o) => `${o.supplierName}, ${o.expectedAt ? (o.expectedAt < today ? 'in ritardo' : relDay(o.expectedAt)) : 'data non indicata'}`);

  const mine = S.products.filter((p) => {
    if (respFor(p) !== u?.id) return false;
    const x = d.map.get(p.id);
    return x && (x.status === 'esaurito' || x.status === 'ordinare' || x.status === 'basso') && !(x.incoming > 0);
  }).sort((a, b) => STATUS[d.map.get(a.id).status].rank - STATUS[d.map.get(b.id).status].rank);

  const recent = S.movements.slice(-8).reverse();
  const backupDays = S.settings.lastBackup ? Math.floor((Date.now() - S.settings.lastBackup) / DAY) : null;
  const needBackup = isAdmin() && S.products.length > 0 && !S.settings.demo && (backupDays == null || backupDays >= 7);

  return html`<div class="page">
    <header class="page-head">
      <div class="grow">
        <h1>${greeting()}, ${u?.name}</h1>
        <p class="sub">${fmtDateLong(Date.now())}, ${S.settings.studioName}</p>
      </div>
      <${MeMini} />
    </header>

    <div class="today-grid">
      <${Tile} cls="t-order" icon="alert-triangle" label="Da ordinare" n=${d.toOrder} items=${toOrderItems} onClick=${() => navigate('ordini', { ord: { tab: 'lista', mine: false } })} />
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
      ${isAdmin() && html`<button class="btn small" onClick=${() => navigate('impostazioni')}>Impostazioni</button>`}
    </div>`}

    ${needBackup && html`<div class="banner">
      <${Icon} n="database-export" s="24" />
      <p><b>${backupDays == null ? 'Non hai ancora fatto un backup.' : `Ultimo backup ${backupDays} giorni fa.`}</b> I dati sono solo su questo iPad: salvane una copia su iCloud Drive o inviala via email.</p>
      <button class="btn small" onClick=${() => navigate('impostazioni')}>Fai il backup</button>
    </div>`}

    <div class="home-cols">
      <${Section} title="Tocca a te ordinare" right=${mine.length > 0 && html`<button class="link-btn" onClick=${() => navigate('ordini', { ord: { tab: 'lista', mine: true } })}>Vai agli ordini<${Icon} n="chevron-right" s="18" /></button>`}>
        ${mine.length
          ? html`<div class="plist">${mine.slice(0, 6).map((p) => html`<${ProductRow} key=${p.id} p=${p} />`)}</div>
            ${mine.length > 6 && html`<button class="link-btn" style="margin-top:10px" onClick=${() => navigate('ordini', { ord: { tab: 'lista', mine: true } })}>Vedi tutti i ${mine.length}</button>`}`
          : html`<div class="group"><${Empty} emoji="🦷" title="Niente da ordinare per te" text="Qui compaiono i materiali di cui sei responsabile quando stanno per finire." /></div>`}
      </${Section}>

      <${Section} title="Ultime attività" right=${html`<button class="link-btn" onClick=${() => navigate('attivita')}>Vedi tutto<${Icon} n="chevron-right" s="18" /></button>`}>
        ${recent.length
          ? html`<div class="group timeline">${recent.map((m) => html`<${ActivityRow} key=${m.id} m=${m} />`)}</div>`
          : html`<div class="group"><${Empty} emoji="📋" title="Ancora nessuna attività" text="Ogni volta che qualcuno prende o carica un materiale, lo vedrai qui." /></div>`}
      </${Section}>
    </div>
  </div>`;
}
