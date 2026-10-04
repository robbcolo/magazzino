import { html, useState } from '../../vendor/preact-htm.js';
import { S, user } from '../store.js';
import { Icon, Avatar, Empty } from '../ui.js';
import { ActivityRow, MeMini } from '../shared.js';
import { startOfDay } from '../logic.js';

const TYPES = [
  { v: 'all', l: 'Tutto' },
  { v: 'scarico', l: 'Prelievi' },
  { v: 'carico', l: 'Carichi' },
  { v: 'ordini', l: 'Ordini', test: (m) => ['ordine', 'arrivo', 'annullato'].includes(m.type) },
  { v: 'correzioni', l: 'Correzioni', test: (m) => ['rettifica', 'scarto'].includes(m.type) },
  { v: 'schede', l: 'Schede', test: (m) => ['nuovo', 'modifica', 'elimina'].includes(m.type) },
];

export function Attivita() {
  const [who, setWho] = useState('all');
  const [type, setType] = useState('all');
  const [limit, setLimit] = useState(120);
  const t = TYPES.find((x) => x.v === type);
  const list = S.movements
    .filter((m) => (who === 'all' || m.userId === who) && (type === 'all' || (t.test ? t.test(m) : m.type === type)))
    .slice(-limit)
    .reverse();
  const days = new Map();
  for (const m of list) {
    const k = startOfDay(m.ts);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(m);
  }
  const today = startOfDay(Date.now());
  const label = (k) => {
    if (k === today) return 'Oggi';
    if (k === today - 864e5) return 'Ieri';
    const s = new Date(k).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const total = S.movements.filter((m) => (who === 'all' || m.userId === who) && (type === 'all' || (t.test ? t.test(m) : m.type === type))).length;
  return html`<div class="page">
    <header class="page-head">
      <div class="grow">
        <h1>Attività</h1>
        <p class="sub">Chi ha preso, caricato o ordinato cosa, e quando.</p>
      </div>
      <${MeMini} />
    </header>
    <div class="filters" style="margin-top:0">
      <button class=${`fchip ${who === 'all' ? 'on' : ''}`} onClick=${() => setWho('all')}><${Icon} n="users" s="16" />Tutti</button>
      ${S.users.map((u) => html`<button class=${`fchip ${who === u.id ? 'on' : ''}`} onClick=${() => setWho(u.id)}><${Avatar} u=${u} size=${22} />${u.name}</button>`)}
    </div>
    <div class="filters" style="margin-top:4px">
      ${TYPES.map((x) => html`<button class=${`fchip ${type === x.v ? 'on' : ''}`} onClick=${() => setType(x.v)}>${x.l}</button>`)}
    </div>
    <div style="margin-top:8px">
      ${!list.length
        ? html`<div class="group"><${Empty} emoji="📋" title="Nessuna attività" text="Cambia i filtri o torna più tardi." /></div>`
        : [...days.entries()].map(([k, ms]) => html`<div key=${k}>
            <div class="group-title">${label(k)}</div>
            <div class="group timeline">${ms.map((m) => html`<${ActivityRow} key=${m.id} m=${m} />`)}</div>
          </div>`)}
      ${total > list.length && html`<div class="center" style="margin-top:16px"><button class="btn" onClick=${() => setLimit(limit + 200)}>Mostra attività precedenti</button></div>`}
    </div>
  </div>`;
}
