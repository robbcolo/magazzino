import { html, useState } from '../../vendor/preact-htm.js';
import { S, loadOlderMovements } from '../store.js';
import { Icon, Empty, toast } from '../ui.js';
import { ActivityRow, SyncPill } from '../shared.js';
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
  const [type, setType] = useState('all');
  const [limit, setLimit] = useState(150);
  const [loadingOld, setLoadingOld] = useState(false);
  const t = TYPES.find((x) => x.v === type);
  const all = [...S.olderMovements, ...S.movements].filter((m) => type === 'all' || (t.test ? t.test(m) : m.type === type));
  const list = all.slice(-limit).reverse();
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
  const older = async () => {
    setLoadingOld(true);
    try {
      const n = await loadOlderMovements();
      if (!n) toast('Non ci sono attività più vecchie.');
      setLimit(limit + 400);
    } catch { toast('Serve internet per leggere le attività più vecchie.', { icon: 'cloud-off' }); }
    setLoadingOld(false);
  };
  return html`<div class="page">
    <header class="page-head">
      <div class="grow">
        <h1>Attività</h1>
        <p class="sub">Prelievi, carichi e ordini registrati da tutti i dispositivi.</p>
      </div>
      <${SyncPill} />
    </header>
    <div class="filters" style="margin-top:0">
      ${TYPES.map((x) => html`<button class=${`fchip ${type === x.v ? 'on' : ''}`} onClick=${() => setType(x.v)}>${x.l}</button>`)}
    </div>
    <div style="margin-top:8px">
      ${!list.length
        ? html`<div class="group"><${Empty} emoji="📋" title="Nessuna attività" text="Cambia il filtro o torna più tardi." /></div>`
        : [...days.entries()].map(([k, ms]) => html`<div key=${k}>
            <div class="group-title">${label(k)}</div>
            <div class="group timeline">${ms.map((m) => html`<${ActivityRow} key=${m.id} m=${m} timeOnly />`)}</div>
          </div>`)}
      <div class="center" style="margin-top:16px">
        ${all.length > list.length
          ? html`<button class="btn" onClick=${() => setLimit(limit + 300)}>Mostra altre attività</button>`
          : html`<button class="btn ghost" disabled=${loadingOld} onClick=${older}><${Icon} n="history" s="20" />${loadingOld ? 'Carico…' : 'Carica le attività più vecchie'}</button>`}
      </div>
    </div>
  </div>`;
}
