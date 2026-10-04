// Componenti condivisi dell'interfaccia
import { html, useState, useEffect, useRef } from '../vendor/preact-htm.js';
import { ICONS } from './icons.js';
import { S, emit, category } from './store.js';
import { STATUS, DAY, startOfDay } from './logic.js';

// ---------- Stato dell'interfaccia ----------
export const U = {
  route: 'home',
  sheets: [],
  toasts: [],
  dialog: null,
  mag: { q: '', status: 'all', cat: 'all', sort: 'urgenza', loc: null, mine: false },
  ord: { tab: 'lista', mine: false },
  scanMode: 'prendo',
  pendingCode: null,   // lotto/scadenza letti da un codice secondario
  codeHandler: null,   // callback quando un foglio aspetta un codice
};

export function navigate(route, patch) {
  U.route = route;
  if (patch?.mag) U.mag = { ...U.mag, ...patch.mag };
  if (patch?.ord) U.ord = { ...U.ord, ...patch.ord };
  U.sheets = [];
  emit();
  requestAnimationFrame(() => document.querySelector('.main-scroll')?.scrollTo({ top: 0 }));
}

// ---------- Fogli (finestre) ----------
export const SHEETS = {};
export function openSheet(type, props = {}) {
  U.sheets = [...U.sheets, { key: Math.random().toString(36).slice(2), type, props }];
  emit();
}
export function closeSheet(key) {
  if (key) U.sheets = U.sheets.filter((s) => s.key !== key);
  else U.sheets = U.sheets.slice(0, -1);
  emit();
}
export function closeAllSheets() { U.sheets = []; emit(); }

// ---------- Avvisi ----------
let toastId = 0;
export function toast(text, opts = {}) {
  const t = { id: ++toastId, text, ...opts };
  U.toasts = [t]; // un avviso alla volta: «Annulla» si riferisce sempre all'ultima azione
  emit();
  setTimeout(() => { U.toasts = U.toasts.filter((x) => x.id !== t.id); emit(); }, opts.ms || (opts.undo ? 5500 : 3200));
}

export function confirmDialog({ title, text, ok = 'Conferma', cancel = 'Annulla', danger = false }) {
  return new Promise((resolve) => {
    U.dialog = { title, text, ok, cancel, danger, resolve: (v) => { U.dialog = null; emit(); resolve(v); } };
    emit();
  });
}

// ---------- Feedback tattile e sonoro ----------
let hapticEl = null;
export function haptic() {
  try {
    if (navigator.vibrate) { navigator.vibrate(12); return; }
    // iOS 18+: l'interruttore nativo produce un feedback tattile
    if (!hapticEl) {
      hapticEl = document.createElement('label');
      hapticEl.setAttribute('aria-hidden', 'true');
      hapticEl.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
      hapticEl.innerHTML = '<input type="checkbox" switch>';
      document.body.appendChild(hapticEl);
    }
    hapticEl.click();
  } catch { /* nessun supporto */ }
}
let actx = null;
export function beep(ok = true) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine';
    o.frequency.value = ok ? 1320 : 330;
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, actx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (ok ? 0.12 : 0.25));
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + 0.3);
  } catch { /* audio non disponibile */ }
}

// ---------- Formattazione ----------
const SING = {
  carpule: 'carpula', siringhe: 'siringa', flaconi: 'flacone', scatole: 'scatola', buste: 'busta', confezioni: 'confezione',
  cartucce: 'cartuccia', lime: 'lima', coni: 'cono', aghi: 'ago', matrici: 'matrice', cunei: 'cuneo', fogli: 'foglio',
  vasetti: 'vasetto', impianti: 'impianto', viti: 'vite', lame: 'lama', spugne: 'spugna', rotoli: 'rotolo', barattoli: 'barattolo',
  strisce: 'striscia', monodosi: 'monodose', guaine: 'guaina', pezzi: 'pezzo', tubetti: 'tubetto', cartoni: 'cartone', blister: 'blister',
  fiale: 'fiala', compresse: 'compressa', frese: 'fresa', rulli: 'rullo', bottiglie: 'bottiglia', paia: 'paio', kit: 'kit',
};
export const unitFor = (unit, n) => (n === 1 ? SING[(unit || '').toLowerCase()] || unit : unit) || 'pz';
export const fmtN = (n) => (n == null ? '–' : Number(n).toLocaleString('it-IT', { maximumFractionDigits: 1 }));
export const fmtQty = (n, unit) => `${fmtN(n)} ${unitFor(unit, n)}`;
export const fmtEuro = (n) => (n == null ? '–' : Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }));
export const fmtDate = (t, opts = { day: 'numeric', month: 'short' }) => (t == null ? '–' : new Date(t).toLocaleDateString('it-IT', opts));
export const fmtDateLong = (t) => fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtTime = (t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
export const fmtExp = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
export function relDay(t) {
  const d = Math.round((startOfDay(t) - startOfDay(Date.now())) / DAY);
  if (d === 0) return 'oggi';
  if (d === 1) return 'domani';
  if (d === -1) return 'ieri';
  if (d > 1 && d < 7) return fmtDate(t, { weekday: 'long' });
  return fmtDate(t, { day: 'numeric', month: 'short' });
}
export function relTime(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'adesso';
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  if (startOfDay(t) === startOfDay(Date.now())) return `oggi alle ${fmtTime(t)}`;
  if (startOfDay(t) === startOfDay(Date.now()) - DAY) return `ieri alle ${fmtTime(t)}`;
  return `${fmtDate(t)} alle ${fmtTime(t)}`;
}
export function daysLabel(n) {
  if (n == null) return '–';
  if (n < 0) return `scaduto da ${-n} ${-n === 1 ? 'giorno' : 'giorni'}`;
  if (n === 0) return 'scade oggi';
  return `tra ${n} ${n === 1 ? 'giorno' : 'giorni'}`;
}
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------- Componenti base ----------
export function Icon({ n, s = 22, sw = 1.9, cls = '' }) {
  return html`<svg class=${'ic ' + cls} width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: ICONS[n] || '' }}></svg>`;
}

export const AVATAR_COLORS = ['petrol', 'gum', 'ochre', 'lavender', 'sky', 'sage', 'coral'];
export function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}
export function Avatar({ u, size = 36, ring = false }) {
  if (!u) return html`<span class="avatar av-none" style=${{ width: size + 'px', height: size + 'px', fontSize: size * 0.4 + 'px' }}>?</span>`;
  return html`<span class=${`avatar av-${u.color || 'petrol'} ${ring ? 'ring' : ''}`} style=${{ width: size + 'px', height: size + 'px', fontSize: size * 0.4 + 'px' }} title=${u.name}>${initials(u.name)}</span>`;
}

export function StatusChip({ status, small = false }) {
  const s = STATUS[status];
  if (!s) return null;
  return html`<span class=${`chip st-${status} ${small ? 'sm' : ''}`}><${Icon} n=${s.icon} s=${small ? 14 : 16} sw="2.2" />${s.label}</span>`;
}
export function ExpChip({ d, small = true }) {
  if (d.expired.length) return html`<span class=${`chip st-scaduto ${small ? 'sm' : ''}`}><${Icon} n="calendar-exclamation" s="14" sw="2.2" />Scaduto</span>`;
  if (d.expiring.length) return html`<span class=${`chip st-scade ${small ? 'sm' : ''}`}><${Icon} n="calendar-due" s="14" sw="2.2" />Scade ${d.expiring[0].days <= 1 ? (d.expiring[0].days === 0 ? 'oggi' : 'domani') : `tra ${d.expiring[0].days} gg`}</span>`;
  return null;
}

export function CatBadge({ cat, size = 44 }) {
  const c = cat || { emoji: '📦', color: 'stone' };
  return html`<span class=${`cat-badge cat-${c.color || 'stone'}`} style=${{ width: size + 'px', height: size + 'px', fontSize: size * 0.5 + 'px' }}>${c.emoji || '📦'}</span>`;
}

export function Thumb({ p, size = 52 }) {
  if (p?.photo) return html`<img class="thumb" src=${p.photo} alt="" style=${{ width: size + 'px', height: size + 'px' }} />`;
  return html`<${CatBadge} cat=${category(p?.catId)} size=${size} />`;
}

/**
 * Indicatore a carpula: il pistone avanza verso il tappo man mano che il materiale finisce.
 * level: 0..1, minLevel: posizione della soglia, status: colore del liquido
 */
export function Carpule({ level = 0, minLevel = null, status = 'ok', big = false, label }) {
  const W = 160, H = 30, x0 = 6, x1 = 138, tubeY = 5, tubeH = 20;
  const len = x1 - x0;
  const liquidW = Math.max(0, Math.min(1, level)) * len;
  const plungerX = x1 - liquidW - 8;
  const thr = minLevel != null ? x1 - minLevel * len : null;
  return html`<svg class=${`carpule st-${status} ${big ? 'big' : ''}`} viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${label || ''} preserveAspectRatio="xMinYMid meet">
    <rect class="cp-glass" x=${x0} y=${tubeY} width=${len} height=${tubeH} rx="10" />
    ${liquidW > 0 && html`<rect class="cp-liquid" x=${x1 - liquidW} y=${tubeY + 2} width=${liquidW} height=${tubeH - 4} rx="3" />`}
    ${liquidW > 0 && html`<rect class="cp-shine" x=${x1 - liquidW + 2} y=${tubeY + 4} width=${Math.max(0, liquidW - 6)} height="3" rx="1.5" />`}
    <rect class="cp-plunger" x=${Math.max(x0 + 1, plungerX)} y=${tubeY + 1.5} width="8" height=${tubeH - 3} rx="2.5" />
    ${thr != null && html`<line class="cp-thr" x1=${thr} x2=${thr} y1=${tubeY - 3} y2=${tubeY + tubeH + 3} />`}
    <rect class="cp-neck" x=${x1 - 1} y=${tubeY + 4} width="6" height=${tubeH - 8} rx="1.5" />
    <rect class="cp-cap" x=${x1 + 4} y=${tubeY + 1} width="16" height=${tubeH - 2} rx="4" />
    <rect class="cp-cap-hi" x=${x1 + 7} y=${tubeY + 4} width="10" height="3" rx="1.5" />
  </svg>`;
}

export function Segmented({ value, options, onChange, cls = '' }) {
  return html`<div class=${'segmented ' + cls} role="tablist">
    ${options.map((o) => html`<button type="button" role="tab" aria-selected=${value === o.v} class=${value === o.v ? 'on' : ''} onClick=${() => { haptic(); onChange(o.v); }}>
      ${o.icon && html`<${Icon} n=${o.icon} s="18" />`}<span>${o.l}</span>${o.badge ? html`<b class="seg-badge">${o.badge}</b>` : null}
    </button>`)}
  </div>`;
}

export function Field({ label, hint, children, cls = '' }) {
  return html`<label class=${'field ' + cls}>
    ${label && html`<span class="field-label">${label}</span>`}
    ${children}
    ${hint && html`<span class="field-hint">${hint}</span>`}
  </label>`;
}

export function Toggle({ checked, onChange, label, hint }) {
  return html`<label class="toggle-row">
    <span class="toggle-text"><span>${label}</span>${hint && html`<small>${hint}</small>`}</span>
    <input type="checkbox" class="toggle" checked=${checked} onChange=${(e) => { haptic(); onChange(e.target.checked); }} />
  </label>`;
}

/** Campo numerico che accetta la virgola e non "mangia" i decimali mentre si scrive */
export function NumberInput({ value, onInput, min = 0, placeholder, inputmode = 'decimal', id, autofocus }) {
  const fmt = (v) => (v == null || Number.isNaN(v) ? '' : String(v).replace('.', ','));
  const parse = (t) => {
    const s = String(t).trim().replace(/\s/g, '').replace(',', '.');
    if (s === '' || s === '.') return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.max(min, n) : null;
  };
  const [text, setText] = useState(fmt(value));
  useEffect(() => { if (parse(text) !== (value ?? null)) setText(fmt(value)); }, [value]);
  return html`<input id=${id} class="input num" type="text" inputmode=${inputmode} value=${text} placeholder=${placeholder}
    autoFocus=${autofocus} autocomplete="off"
    onInput=${(e) => { const t = e.target.value.replace(/[^0-9.,]/g, ''); setText(t); onInput(parse(t)); }} />`;
}

export function Stepper({ value, onChange, min = 0, big = false, unit }) {
  const set = (v) => { haptic(); onChange(Math.max(min, v)); };
  return html`<div class=${`stepper ${big ? 'big' : ''}`}>
    <button type="button" class="step-btn" aria-label="Meno" onClick=${() => set((value || 0) - 1)} disabled=${(value || 0) <= min}><${Icon} n="minus" s=${big ? 30 : 20} sw="2.4" /></button>
    <div class="step-val">
      <input type="text" inputmode="numeric" pattern="[0-9]*" value=${value ?? 0} aria-label="Quantità"
        onFocus=${(e) => e.target.select()}
        onInput=${(e) => { const v = parseInt(e.target.value, 10); onChange(Number.isFinite(v) ? Math.max(min, v) : min); }} />
      ${unit && html`<span class="step-unit">${unit}</span>`}
    </div>
    <button type="button" class="step-btn" aria-label="Più" onClick=${() => set((value || 0) + 1)}><${Icon} n="plus" s=${big ? 30 : 20} sw="2.4" /></button>
  </div>`;
}

export function Empty({ emoji = '🦷', title, text, action }) {
  return html`<div class="empty">
    <div class="empty-emoji" aria-hidden="true">${emoji}</div>
    <h3>${title}</h3>
    ${text && html`<p>${text}</p>`}
    ${action}
  </div>`;
}

export function Section({ title, right, children, cls = '' }) {
  return html`<section class=${'section ' + cls}>
    ${(title || right) && html`<div class="section-head"><h2>${title}</h2>${right}</div>`}
    ${children}
  </section>`;
}

/** Grafico a barre semplice (una serie): tocca una barra per leggerne il valore */
export function Bars({ values, labels, titles, fmt = fmtN, height = 120 }) {
  const [sel, setSel] = useState(null);
  const max = Math.max(1, ...values);
  const n = values.length;
  const show = sel ?? n - 1;
  const names = titles || labels;
  const step = Math.ceil(n / 6);
  return html`<div class="bars">
    <div class="bars-readout"><b>${fmt(values[show])}</b> <span>${names[show] || ''}</span></div>
    <div class="bars-plot" style=${{ height: height + 'px' }}>
      ${values.map((v, i) => html`<button type="button" class=${'bar-col ' + (i === show ? 'on' : '')} onClick=${() => setSel(i)} onPointerEnter=${() => setSel(i)} aria-label=${`${names[i]}: ${fmt(v)}`}>
        <span class=${'bar ' + (v > 0 ? '' : 'zero')} style=${{ height: v > 0 ? Math.max(3, (v / max) * (height - 4)) + 'px' : '2px' }}></span>
      </button>`)}
    </div>
    <div class="bars-axis" aria-hidden="true">${labels.map((l, i) => html`<span class=${i === show ? 'on' : ''}>${i % step === 0 || i === n - 1 ? l : ''}</span>`)}</div>
  </div>`;
}

// ---------- Contenitori globali ----------
export function SheetHost() {
  const stack = U.sheets;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && U.sheets.length) closeSheet(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return html`${stack.map((s, i) => {
    const C = SHEETS[s.type];
    if (!C) return null;
    const top = i === stack.length - 1;
    return html`<div key=${s.key} class=${`sheet-layer ${top ? 'top' : 'under'}`}>
      <div class="sheet-backdrop" onClick=${() => top && closeSheet(s.key)}></div>
      <${C} ...${s.props} sheetKey=${s.key} close=${() => closeSheet(s.key)} />
    </div>`;
  })}`;
}

/** Struttura di un foglio: intestazione, contenuto scorrevole, barra azioni */
export function Sheet({ title, sub, close, children, footer, wide = false, cls = '', left }) {
  const ref = useRef();
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return html`<div class=${`sheet ${wide ? 'wide' : ''} ${cls}`} role="dialog" aria-modal="true" aria-label=${title} tabindex="-1" ref=${ref}>
    <div class="sheet-grab" aria-hidden="true"></div>
    <header class="sheet-head">
      ${left || html`<span class="sheet-head-spacer"></span>`}
      <div class="sheet-title"><h2>${title}</h2>${sub && html`<p>${sub}</p>`}</div>
      <button class="icon-btn" onClick=${close} aria-label="Chiudi"><${Icon} n="x" s="22" /></button>
    </header>
    <div class="sheet-body">${children}</div>
    ${footer && html`<footer class="sheet-foot">${footer}</footer>`}
  </div>`;
}

export function ToastHost() {
  return html`<div class="toasts" aria-live="polite">
    ${U.toasts.map((t) => html`<div key=${t.id} class=${`toast ${t.tone || ''}`}>
      ${t.icon && html`<${Icon} n=${t.icon} s="20" />`}
      <span>${t.text}</span>
      ${t.undo && html`<button class="toast-undo" onClick=${() => { t.undo(); U.toasts = U.toasts.filter((x) => x.id !== t.id); emit(); }}><${Icon} n="arrow-back-up" s="18" />Annulla</button>`}
    </div>`)}
  </div>`;
}

export function DialogHost() {
  const d = U.dialog;
  if (!d) return null;
  return html`<div class="dialog-layer">
    <div class="sheet-backdrop" onClick=${() => d.resolve(false)}></div>
    <div class="dialog" role="alertdialog" aria-modal="true">
      <h3>${d.title}</h3>
      ${d.text && html`<p>${d.text}</p>`}
      <div class="dialog-actions">
        <button class="btn ghost" onClick=${() => d.resolve(false)}>${d.cancel}</button>
        <button class=${`btn ${d.danger ? 'danger' : 'primary'}`} onClick=${() => d.resolve(true)} autoFocus>${d.ok}</button>
      </div>
    </div>
  </div>`;
}

// ---------- Utilità ----------
export function shareOrDownload(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const file = new File([blob], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file], title: filename }).then(() => true).catch((e) => (e?.name === 'AbortError' ? false : download(blob, filename)));
  }
  return Promise.resolve(download(blob, filename));
}
function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return true;
}

export function readFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = () => resolve(inp.files?.[0] || null);
    inp.click();
  });
}

/** Ridimensiona una foto per salvarla leggera (lato max 480 px) */
export async function photoToDataURL(file, max = 480) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.78);
  } finally { URL.revokeObjectURL(url); }
}

export { STATUS, S };
