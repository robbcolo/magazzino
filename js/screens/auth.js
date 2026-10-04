// Schermate di avvio: configurazione di Firebase, accesso, caricamento e primo avvio dello studio
import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { S, cloud, setupStudio, importBackup, readLegacyLocalData, DEFAULT_SUPPLIERS, emit } from '../store.js';
import { Icon, Carpule, Field, toast, readFile } from '../ui.js';
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

function Shell({ children, wide = false }) {
  return html`<div class="onb"><div class="onb-card" style=${wide ? { width: 'min(720px, 100%)' } : null}>${children}</div></div>`;
}

// ---------- Configurazione mancante ----------
export function ConfigScreen() {
  const [text, setText] = useState('');
  const [err, setErr] = useState(S.configError || '');
  const save = () => {
    const cfg = cloud.parseConfigText(text);
    if (!cfg) { setErr('Non trovo apiKey e projectId nel testo incollato. Copia tutto il blocco firebaseConfig dalla console di Firebase.'); return; }
    cloud.saveDeviceConfig(cfg);
    location.reload();
  };
  return html`<${Shell}>
    <${BrandMark} size=${56} />
    <h1 style="margin-top:14px">Collega il database</h1>
    <p class="lead">L'app salva i dati su Firebase, così iPad e iPhone restano sincronizzati. Manca la configurazione del vostro progetto.</p>
    <ol class="ink2" style="padding-left:22px;display:grid;gap:8px;margin:18px 0 0">
      <li>Il modo consigliato: apri il file <b>config.js</b> nel repository GitHub, incolla lì la configurazione e salva. Così vale per tutti i dispositivi.</li>
      <li>In alternativa incollala qui sotto: vale solo per questo dispositivo.</li>
    </ol>
    <div style="margin-top:16px">
      <${Field} label="Configurazione di Firebase" hint="La trovi in Firebase › Impostazioni progetto › Le tue app › Configurazione SDK.">
        <textarea class="input" rows="7" value=${text} onInput=${(e) => setText(e.target.value)} placeholder=${'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  projectId: "…",\n  …\n};'} style="font-family:ui-monospace,Menlo,monospace;font-size:14px"></textarea>
      </${Field}>
    </div>
    ${err && html`<p class="warn-text" style="margin-top:10px">${err}</p>`}
    <div class="onb-actions"><button class="btn primary big" onClick=${save} disabled=${!text.trim()}>Salva e continua</button></div>
  </${Shell}>`;
}

// ---------- Accesso ----------
export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const msg = await cloud.signIn(email, pw);
    setBusy(false);
    if (msg) setErr(msg);
  };
  return html`<${Shell}>
    <${BrandMark} size=${56} />
    <h1 style="margin-top:14px">Accedi al magazzino</h1>
    <p class="lead">Usa l'account dello studio creato su Firebase. Lo chiede una volta sola per dispositivo.</p>
    <form class="form" style="margin-top:20px" onSubmit=${submit}>
      <${Field} label="Email"><input class="input" type="email" autocomplete="username" autocapitalize="off" value=${email} onInput=${(e) => setEmail(e.target.value)} required /></${Field}>
      <${Field} label="Password"><input class="input" type="password" autocomplete="current-password" value=${pw} onInput=${(e) => setPw(e.target.value)} required /></${Field}>
      ${err && html`<p class="warn-text">${err}</p>`}
      <button class="btn primary big block" type="submit" disabled=${busy || !email || !pw}><${Icon} n="login" s="22" />${busy ? 'Accesso in corso…' : 'Accedi'}</button>
    </form>
    ${S.configSource === 'device' && html`<button class="link-btn" style="margin-top:14px" onClick=${() => { cloud.clearDeviceConfig(); location.reload(); }}>Cambia la configurazione di Firebase</button>`}
  </${Shell}>`;
}

// ---------- Caricamento ----------
export function LoadingScreen() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 7000); return () => clearTimeout(t); }, []);
  return html`<div class="onb"><div class="center" style="display:grid;justify-items:center;gap:14px">
    <${BrandMark} size=${64} />
    <p class="ink2" style="font-size:17px">Carico il magazzino…</p>
    ${slow && html`<p class="muted" style="max-width:380px">${navigator.onLine ? 'Ci sta mettendo più del solito. La prima volta su un nuovo dispositivo deve scaricare tutti i dati.' : 'Sei offline. La prima volta su un nuovo dispositivo serve internet per scaricare i dati.'}</p>
      <button class="btn ghost" onClick=${() => cloud.signOutDevice()}>Esci e accedi di nuovo</button>`}
  </div></div>`;
}

// ---------- Primo avvio dello studio ----------
export function Onboarding() {
  const [step, setStep] = useState(0);
  const [studio, setStudio] = useState(DEFAULT_SETTINGS.studioName);
  const [signature, setSignature] = useState('');
  const [sups, setSups] = useState(DEFAULT_SUPPLIERS.map((s) => ({ ...s })));
  const [start, setStart] = useState('demo');
  const [legacy, setLegacy] = useState(null);
  const [backup, setBackup] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { readLegacyLocalData().then((d) => { if (d) { setLegacy(d); setStart('legacy'); } }); }, []);

  const updSup = (i, patch) => setSups(sups.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const pickBackup = async () => {
    const f = await readFile('application/json,.json');
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (obj?.app !== 'magazzino-studio') throw new Error();
      setBackup(obj); setStart('backup');
    } catch { toast('Il file non è un backup di questa app.', { tone: 'err' }); }
  };
  const finish = async () => {
    setBusy(true);
    try {
      if (start === 'legacy' && legacy) {
        await importBackup({ ...legacy, data: { ...legacy.data, settings: { ...legacy.data.settings, studioName: studio, signature } } }, { wipe: false });
      } else if (start === 'backup' && backup) {
        await importBackup(backup, { wipe: false });
      } else {
        await setupStudio({ studioName: studio.trim(), signature: signature.trim(), suppliers: sups, demo: start === 'demo' });
      }
    } catch (e) { toast(e.message || 'Qualcosa è andato storto.', { tone: 'err' }); setBusy(false); }
  };

  return html`<${Shell} wide=${step === 1}>
    <div class="onb-steps">${[0, 1, 2].map((i) => html`<i class=${i <= step ? 'on' : ''}></i>`)}</div>
    ${step === 0 && html`
      <div class="onb-hero"><${Carpule} level=${0.62} minLevel=${0.3} status="ok" big /></div>
      <h1>Il magazzino dello studio, sotto controllo</h1>
      <p class="lead">Ogni materiale è una carpula: il pistone avanza man mano che finisce, e il colore ti dice quando è ora di ordinare. Tutto resta sincronizzato tra iPad e iPhone.</p>
      <ul class="onb-points">
        <li><${Icon} n="hourglass" s="24" /><span><b>Vedi subito cosa sta finendo</b>, con la data entro cui ordinarlo calcolata sui vostri consumi.</span></li>
        <li><${Icon} n="building-store" s="24" /><span><b>Ordini già divisi per fornitore</b>, con il testo pronto da mandare via WhatsApp o email.</span></li>
        <li><${Icon} n="scan" s="24" /><span><b>Prendi un materiale con un tocco</b> o inquadrando il codice sulla confezione, anche il DataMatrix con lotto e scadenza.</span></li>
      </ul>
      <div class="onb-actions"><button class="btn primary big" onClick=${() => setStep(1)}>Iniziamo</button></div>`}

    ${step === 1 && html`
      <h1>Studio e fornitori</h1>
      <p class="lead">I fornitori si possono cambiare, aggiungere o togliere anche dopo, dalla sezione Fornitori.</p>
      <div class="form" style="margin-top:18px">
        <div class="form-grid">
          <${Field} label="Nome dello studio"><input class="input" value=${studio} onInput=${(e) => setStudio(e.target.value)} /></${Field}>
          <${Field} label="Firma negli ordini" hint="Facoltativa, es. Dott. Roberto Colombo"><input class="input" value=${signature} onInput=${(e) => setSignature(e.target.value)} /></${Field}>
        </div>
        <div>
          <span class="field-label" style="display:block;margin-bottom:8px">Fornitori</span>
          <div class="group">
            ${sups.map((s, i) => html`<div class="sup-edit" key=${i}>
              <input class="input" value=${s.name} placeholder="Nome del fornitore" onInput=${(e) => updSup(i, { name: e.target.value })} aria-label="Nome del fornitore" />
              <input class="input" value=${s.web || ''} placeholder="Sito (facoltativo)" onInput=${(e) => updSup(i, { web: e.target.value })} aria-label="Sito" autocapitalize="off" />
              <button type="button" class="icon-btn plain" aria-label=${`Togli ${s.name || 'fornitore'}`} onClick=${() => setSups(sups.filter((_, j) => j !== i))}><${Icon} n="trash" s="20" /></button>
            </div>`)}
          </div>
          <button type="button" class="link-btn" style="margin-top:8px" onClick=${() => setSups([...sups, { name: '', web: '', leadDays: 3 }])}><${Icon} n="plus" s="18" />Aggiungi un fornitore</button>
        </div>
      </div>
      <div class="onb-actions">
        <button class="btn ghost big" onClick=${() => setStep(0)}>Indietro</button>
        <button class="btn primary big" onClick=${() => setStep(2)}>Avanti</button>
      </div>`}

    ${step === 2 && html`
      <h1>Come vuoi iniziare?</h1>
      <p class="lead">Quello che scegli qui comparirà su tutti i dispositivi collegati.</p>
      <div class="choice">
        ${legacy && html`<button class=${start === 'legacy' ? 'on' : ''} onClick=${() => setStart('legacy')}><span class="em" aria-hidden="true">📲</span><span><b>Con i dati già su questo dispositivo</b><span>Ho trovato ${legacy.data.products.length} materiali salvati dalla versione precedente: li carico online.</span></span></button>`}
        <button class=${start === 'demo' ? 'on' : ''} onClick=${() => setStart('demo')}><span class="em" aria-hidden="true">🧪</span><span><b>Con materiali di esempio</b><span>Una quarantina di materiali con 4 mesi di movimenti. Li rimuovi con un tocco quando vuoi.</span></span></button>
        <button class=${start === 'empty' ? 'on' : ''} onClick=${() => setStart('empty')}><span class="em" aria-hidden="true">📦</span><span><b>Da zero</b><span>Inserite subito i vostri materiali, a mano, inquadrando i codici o importando un file.</span></span></button>
        <button class=${start === 'backup' ? 'on' : ''} onClick=${backup ? () => setStart('backup') : pickBackup}><span class="em" aria-hidden="true">🗂️</span><span><b>Da un backup</b><span>${backup ? `Backup scelto: ${backup.data?.products?.length || 0} materiali.` : 'Scegli un file di backup salvato in precedenza.'}</span></span></button>
      </div>
      <div class="onb-actions">
        <button class="btn ghost big" onClick=${() => setStep(1)}>Indietro</button>
        <button class="btn primary big" disabled=${busy} onClick=${finish}>${busy ? 'Preparo il magazzino…' : 'Apri il magazzino'}</button>
      </div>`}
  </${Shell}>`;
}
