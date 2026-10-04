import { html, useState } from '../../vendor/preact-htm.js';
import { S, login, pinHash, setupStudio, loadDemo } from '../store.js';
import { Icon, Avatar, AVATAR_COLORS, Carpule, haptic, Field } from '../ui.js';
import { DEFAULT_SETTINGS } from '../logic.js';

export function BrandMark({ size = 42 }) {
  return html`<svg class="brand-mark" width=${size} height=${size} viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="16" fill="#0A6B68" />
    <g transform="rotate(-32 32 32)">
      <rect x="7" y="25" width="38" height="14" rx="7" fill="#EAF6F4" />
      <rect x="25" y="27.5" width="19" height="9" rx="2" fill="#4CC3BA" />
      <rect x="19" y="26.5" width="6" height="11" rx="2" fill="#123432" />
      <rect x="44.5" y="28" width="3.5" height="8" rx="1" fill="#B7C7C8" />
      <rect x="47.5" y="26" width="10" height="12" rx="3" fill="#D7E2E3" />
    </g>
  </svg>`;
}

function PinPad({ u, onDone, onBack }) {
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  const press = (d) => {
    haptic();
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      if (pinHash(u.id, next) === u.pin) onDone();
      else { setBad(true); setTimeout(() => { setBad(false); setPin(''); }, 450); }
    }
  };
  return html`<div>
    <${Avatar} u=${u} size=${84} />
    <h1 style="margin-top:12px">Ciao ${u.name}</h1>
    <p class="sub">Inserisci il tuo PIN</p>
    <div class=${`pin-dots ${bad ? 'shake' : ''}`}>${[0, 1, 2, 3].map((i) => html`<i class=${i < pin.length ? 'on' : ''}></i>`)}</div>
    <div class="pinpad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => html`<button onClick=${() => press(String(n))}>${n}</button>`)}
      <button class="plain" onClick=${onBack}>Indietro</button>
      <button onClick=${() => press('0')}>0</button>
      <button class="plain" aria-label="Cancella" onClick=${() => setPin(pin.slice(0, -1))}><${Icon} n="backspace" s="26" /></button>
    </div>
  </div>`;
}

export function LockScreen() {
  const [sel, setSel] = useState(null);
  const u = sel && S.users.find((x) => x.id === sel);
  const choose = (x) => { haptic(); if (x.pin) setSel(x.id); else login(x.id); };
  return html`<div class="lock">
    <div class="lock-inner">
      ${u
        ? html`<${PinPad} u=${u} onDone=${() => login(u.id)} onBack=${() => setSel(null)} />`
        : html`
          <${BrandMark} size=${64} />
          <h1>Chi sta usando l'iPad?</h1>
          <p class="sub">Così ogni prelievo e ogni ordine porta il nome giusto.</p>
          <div class="people">
            ${S.users.map((x) => html`<button class="person" key=${x.id} onClick=${() => choose(x)}>
              <${Avatar} u=${x} size=${78} />
              <b>${x.name}</b>
              <small>${x.role === 'admin' ? 'Dottore' : 'Assistente'}</small>
              ${x.pin && html`<${Icon} n="lock" s="16" cls="lock-ic" />`}
            </button>`)}
          </div>`}
    </div>
  </div>`;
}

const DEFAULT_PEOPLE = [
  { name: 'Roberto', fullName: 'Dott. Roberto Colombo', role: 'admin', color: 'petrol' },
  { name: 'Aurora', fullName: 'Dott.ssa Aurora Colombo', role: 'admin', color: 'gum' },
  { name: 'Alfredo', fullName: 'Dott. Alfredo Colombo', role: 'admin', color: 'ochre' },
  { name: 'Assistente 1', fullName: '', role: 'assistente', color: 'lavender' },
  { name: 'Assistente 2', fullName: '', role: 'assistente', color: 'sky' },
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [people, setPeople] = useState(DEFAULT_PEOPLE);
  const [studio, setStudio] = useState(DEFAULT_SETTINGS.studioName);
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const upd = (i, patch) => setPeople(people.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const valid = people.filter((p) => p.name.trim()).length > 0 && people.some((p) => p.role === 'admin' && p.name.trim());

  const finish = async () => {
    setBusy(true);
    setupStudio({ users: people.filter((p) => p.name.trim()).map((p) => ({ ...p, name: p.name.trim() })), studioName: studio.trim() });
    if (demo) await loadDemo();
  };

  return html`<div class="onb">
    <div class="onb-card">
      <div class="onb-steps">${[0, 1, 2].map((i) => html`<i class=${i <= step ? 'on' : ''}></i>`)}</div>
      ${step === 0 && html`
        <div class="onb-hero">
          <${Carpule} level=${0.62} minLevel=${0.3} status="ok" big />
        </div>
        <h1>Il magazzino dello studio, sotto controllo</h1>
        <p class="lead">Ogni materiale è una carpula: il pistone avanza man mano che finisce, e il colore ti dice quando è ora di ordinare.</p>
        <ul class="onb-points">
          <li><${Icon} n="hourglass" s="24" /><span><b>Vedi subito cosa sta finendo</b>, con la data entro cui ordinarlo calcolata sui vostri consumi.</span></li>
          <li><${Icon} n="users" s="24" /><span><b>Sai chi deve ordinare e da chi</b>: ogni categoria ha un responsabile e ogni materiale il suo fornitore.</span></li>
          <li><${Icon} n="scan" s="24" /><span><b>Prendi un materiale con un tocco</b> o inquadrando il codice sulla confezione, anche il DataMatrix con lotto e scadenza.</span></li>
        </ul>
        <div class="onb-actions"><button class="btn primary big" onClick=${() => setStep(1)}>Iniziamo</button></div>`}

      ${step === 1 && html`
        <h1>Chi usa l'app?</h1>
        <p class="lead">I dottori possono modificare tutto; le assistenti prendono, caricano e ordinano. Potrai cambiare tutto più avanti.</p>
        <div class="form" style="margin-top:20px">
          <${Field} label="Nome dello studio"><input class="input" value=${studio} onInput=${(e) => setStudio(e.target.value)} /></${Field}>
          <div>
            <span class="field-label" style="display:block;margin-bottom:8px">Persone</span>
            ${people.map((p, i) => html`<div class="person-edit" key=${i}>
              <button type="button" class="icon-btn plain" style="width:auto;height:auto" aria-label="Cambia colore" onClick=${() => upd(i, { color: AVATAR_COLORS[(AVATAR_COLORS.indexOf(p.color) + 1) % AVATAR_COLORS.length] })}><${Avatar} u=${{ ...p, name: p.name || '?' }} size=${44} /></button>
              <input class="input" value=${p.name} placeholder="Nome" onInput=${(e) => upd(i, { name: e.target.value })} aria-label="Nome" />
              <select class="input" value=${p.role} onChange=${(e) => upd(i, { role: e.target.value })} aria-label="Ruolo">
                <option value="admin">Dottore</option>
                <option value="assistente">Assistente</option>
              </select>
            </div>`)}
            <button type="button" class="link-btn" style="margin-top:8px" onClick=${() => setPeople([...people, { name: '', fullName: '', role: 'assistente', color: AVATAR_COLORS[people.length % AVATAR_COLORS.length] }])}><${Icon} n="user-plus" s="18" />Aggiungi una persona</button>
            <p class="field-hint" style="margin-top:6px">Tocca un cerchio per cambiarne il colore. Lascia vuoto il nome per togliere una persona.</p>
          </div>
        </div>
        <div class="onb-actions">
          <button class="btn ghost big" onClick=${() => setStep(0)}>Indietro</button>
          <button class="btn primary big" disabled=${!valid} onClick=${() => setStep(2)}>Avanti</button>
        </div>`}

      ${step === 2 && html`
        <h1>Come vuoi iniziare?</h1>
        <p class="lead">Categorie e fornitori principali (Dontalia, Dental Leader, Umbra, Dental Today, Eli-Dent) sono già pronti.</p>
        <div class="choice">
          <button class=${demo ? 'on' : ''} onClick=${() => setDemo(true)}><span class="em" aria-hidden="true">🧪</span><span><b>Con materiali di esempio</b><span>Una quarantina di materiali con 4 mesi di movimenti. Li rimuovi con un tocco quando vuoi.</span></span></button>
          <button class=${!demo ? 'on' : ''} onClick=${() => setDemo(false)}><span class="em" aria-hidden="true">📦</span><span><b>Da zero</b><span>Inserite subito i vostri materiali, a mano, inquadrando i codici o importando un file.</span></span></button>
        </div>
        <div class="onb-actions">
          <button class="btn ghost big" onClick=${() => setStep(1)}>Indietro</button>
          <button class="btn primary big" disabled=${busy} onClick=${finish}>${busy ? 'Preparo il magazzino…' : 'Apri il magazzino'}</button>
        </div>`}
    </div>
  </div>`;
}
