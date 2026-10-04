import { html } from '../../vendor/preact-htm.js';
import { S, derived, category, emit } from '../store.js';
import { Icon, Empty, U, openSheet, CatBadge, plural } from '../ui.js';
import { ProductRow, SyncPill } from '../shared.js';
import { STATUS, matches, norm } from '../logic.js';

const FILTERS = [
  { v: 'all', l: 'Tutti' },
  { v: 'ordinare', l: 'Da ordinare', dot: 'var(--order)', test: (d) => d.status === 'ordinare' || d.status === 'esaurito' },
  { v: 'basso', l: 'In esaurimento', dot: 'var(--low)', test: (d) => d.status === 'basso' },
  { v: 'arrivo', l: 'In arrivo', dot: 'var(--in)', test: (d) => d.incoming > 0 || d.status === 'arrivo' },
  { v: 'scadenza', l: 'In scadenza', dot: 'var(--exp)', test: (d) => d.expiring.length > 0 || d.expired.length > 0 },
  { v: 'ok', l: 'Disponibili', dot: 'var(--ok)', test: (d) => d.status === 'ok' },
];

export function Magazzino() {
  const d = derived();
  const f = U.mag;
  const set = (patch) => { U.mag = { ...U.mag, ...patch }; emit(); };

  const base = S.products.filter((p) => !f.loc || norm(p.location).startsWith(norm(f.loc)));
  const searched = base.filter((p) => matches(p, f.q, `${category(p.catId)?.name || ''} ${(p.codes || []).join(' ')}`));
  const filterDef = FILTERS.find((x) => x.v === f.status) || FILTERS[0];
  const byStatus = filterDef.test ? searched.filter((p) => filterDef.test(d.map.get(p.id))) : searched;
  const list = f.cat === 'all' ? byStatus : byStatus.filter((p) => p.catId === f.cat);

  const rank = (p) => STATUS[d.map.get(p.id).status].rank;
  const byName = (a, b) => a.name.localeCompare(b.name, 'it');
  let groups;
  if (f.sort === 'categoria') {
    const cats = [...S.categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    groups = cats.map((c) => ({ key: c.id, title: html`<${CatBadge} cat=${c} size=${24} />${c.name}`, items: list.filter((p) => p.catId === c.id).sort(byName) }));
    const orphans = list.filter((p) => !category(p.catId));
    if (orphans.length) groups.push({ key: 'none', title: 'Senza categoria', items: orphans.sort(byName) });
  } else if (f.sort === 'ubicazione') {
    const locs = [...new Set(list.map((p) => p.location || ''))].sort((a, b) => (a || '~').localeCompare(b || '~', 'it'));
    groups = locs.map((l) => ({ key: l, title: html`<${Icon} n="map-pin" s="16" />${l || 'Ubicazione non indicata'}`, items: list.filter((p) => (p.location || '') === l).sort(byName) }));
  } else if (f.sort === 'nome') {
    groups = [{ key: 'all', items: [...list].sort(byName) }];
  } else {
    groups = [{ key: 'all', items: [...list].sort((a, b) => rank(a) - rank(b) || byName(a, b)) }];
  }
  groups = groups.filter((g) => g.items.length);

  const attention = S.products.filter((p) => { const x = d.map.get(p.id); return x.status !== 'ok' || x.expired.length || x.expiring.length; }).length;
  const catCounts = Object.fromEntries(S.categories.map((c) => [c.id, byStatus.filter((p) => p.catId === c.id).length]));

  return html`<div class="page">
    <header class="page-head">
      <div class="grow">
        <h1>Magazzino</h1>
        <p class="sub">${plural(S.products.length, 'materiale', 'materiali')}${attention ? `, ${attention} da tenere d'occhio` : ''}</p>
      </div>
      <div class="head-actions">
        <button class="btn ghost" onClick=${() => openSheet('inventory')}><${Icon} n="clipboard-check" s="20" />Inventario</button>
        <button class="btn primary" onClick=${() => openSheet('productEdit', {})}><${Icon} n="plus" s="20" sw="2.4" />Nuovo materiale</button>
        <${SyncPill} />
      </div>
    </header>

    <div class="toolbar">
      <label class="search">
        <${Icon} n="search" s="20" />
        <input type="search" placeholder="Cerca per nome, marca, codice, ubicazione" value=${f.q} onInput=${(e) => set({ q: e.target.value })} aria-label="Cerca materiali" />
        ${f.q && html`<button class="icon-btn plain" style="width:32px;height:32px" onClick=${() => set({ q: '' })} aria-label="Cancella ricerca"><${Icon} n="x" s="18" /></button>`}
      </label>
      <select class="input" style="width:auto;min-width:190px" value=${f.sort} onChange=${(e) => set({ sort: e.target.value })} aria-label="Ordina per">
        <option value="urgenza">Prima i più urgenti</option>
        <option value="nome">Per nome</option>
        <option value="categoria">Per categoria</option>
        <option value="ubicazione">Per ubicazione</option>
      </select>
    </div>

    <div class="filters" role="group" aria-label="Filtra per stato">
      ${FILTERS.map((x) => {
        const n = x.test ? searched.filter((p) => x.test(d.map.get(p.id))).length : searched.length;
        return html`<button class=${`fchip ${f.status === x.v ? 'on' : ''}`} onClick=${() => set({ status: x.v })}>
          ${x.dot && html`<i class="dot" style=${{ background: x.dot }}></i>`}${x.l} <span class="count">${n}</span>
        </button>`;
      })}
      ${f.loc && html`<button class="fchip on" onClick=${() => set({ loc: null })}><${Icon} n="map-pin" s="16" />${f.loc}<${Icon} n="x" s="16" /></button>`}
    </div>
    <div class="filters" role="group" aria-label="Filtra per categoria" style="margin-top:4px">
      <button class=${`fchip ${f.cat === 'all' ? 'on' : ''}`} onClick=${() => set({ cat: 'all' })}>Tutte le categorie</button>
      ${S.categories.filter((c) => catCounts[c.id] > 0 || f.cat === c.id).map((c) => html`<button class=${`fchip ${f.cat === c.id ? 'on' : ''}`} onClick=${() => set({ cat: f.cat === c.id ? 'all' : c.id })}>
        <span aria-hidden="true">${c.emoji}</span>${c.name} <span class="count">${catCounts[c.id]}</span>
      </button>`)}
    </div>

    <div style="margin-top:14px">
      ${!S.products.length
        ? html`<div class="group"><${Empty} emoji="📦" title="Il magazzino è vuoto" text="Aggiungi i materiali uno alla volta, inquadrando il codice a barre, oppure importali tutti insieme da un file CSV in Impostazioni."
            action=${html`<div class="btn-row" style="justify-content:center"><button class="btn primary" onClick=${() => openSheet('productEdit', {})}><${Icon} n="plus" s="20" />Aggiungi il primo materiale</button></div>`} /></div>`
        : !groups.length
          ? html`<div class="group"><${Empty} emoji="🔍" title="Nessun materiale trovato" text="Prova a cambiare la ricerca o i filtri." action=${html`<button class="btn" onClick=${() => set({ q: '', status: 'all', cat: 'all', loc: null })}>Mostra tutto</button>`} /></div>`
          : groups.map((g) => html`<div key=${g.key}>
              ${g.title && html`<div class="cat-sep">${g.title}</div>`}
              <div class="plist">${g.items.map((p) => html`<${ProductRow} key=${p.id} p=${p} />`)}</div>
            </div>`)}
    </div>
  </div>`;
}
