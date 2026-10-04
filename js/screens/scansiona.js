import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { S, product, productByCode, emit } from '../store.js';
import { Icon, Segmented, U, openSheet, toast, beep, haptic, navigate, readFile, relTime, Thumb, closeSheet } from '../ui.js';
import { MeMini } from '../shared.js';
import { parseCode, mergeCodes, describeCode } from '../codes.js';
import { Scanner, cameraSupported, decodeImage } from '../scanner.js';
import { matches } from '../logic.js';

let lastSig = '', lastAt = 0;
U.recentScans = [];

/** Punto unico in cui arrivano i codici letti (fotocamera, foto, lettore Bluetooth, digitati) */
export function handleCodes(texts, { force = false } = {}) {
  const parsed = texts.map(parseCode).filter(Boolean);
  if (!parsed.length) return false;
  const sig = parsed.map((p) => p.raw).sort().join('|');
  if (!force && sig === lastSig && Date.now() - lastAt < 2500) return false;
  lastSig = sig; lastAt = Date.now();

  // prima un codice con prodotto riconosciuto, poi gli altri (lotto/scadenza)
  parsed.sort((a, b) => (b.key && productByCode(b.key) ? 1 : 0) - (a.key && productByCode(a.key) ? 1 : 0));
  const c = mergeCodes(parsed);
  if (U.pendingCode && Date.now() - U.pendingCode.at < 60000) {
    c.lot = c.lot || U.pendingCode.lot;
    c.exp = c.exp || U.pendingCode.exp;
  }
  beep(true); haptic();

  if (c.kind === 'location' && c.location) {
    navigate('magazzino', { mag: { loc: c.location, status: 'all', cat: 'all', q: '' } });
    toast(`Materiali in ${c.location}`, { icon: 'map-pin' });
    return true;
  }
  const p = c.productId ? product(c.productId) : c.key ? productByCode(c.key) : null;
  if (p) {
    U.pendingCode = null;
    U.recentScans = [{ id: p.id, at: Date.now() }, ...U.recentScans.filter((x) => x.id !== p.id)].slice(0, 6);
    const mode = U.route === 'scansiona' ? U.scanMode : 'prendo';
    if (mode === 'info') openSheet('product', { id: p.id });
    else openSheet('move', { id: p.id, mode: mode === 'carico' ? 'carico' : 'prendo', lot: c.lot, exp: c.exp });
    emit();
    return true;
  }
  if (!c.key) {
    U.pendingCode = { lot: c.lot, exp: c.exp, at: Date.now() };
    emit();
    toast(`Letto ${describeCode(c)}. Ora inquadra il codice del prodotto.`, { icon: 'barcode', ms: 5000 });
    return true;
  }
  openSheet('unknownCode', { code: c });
  return true;
}

/** Riquadro fotocamera riutilizzabile */
export function CameraView({ onCodes, paused = false, compact = false }) {
  const video = useRef();
  const scanner = useRef(null);
  const [state, setState] = useState(cameraSupported() ? 'starting' : 'unsupported');
  const [err, setErr] = useState('');
  const [torch, setTorch] = useState(false);
  const [hit, setHit] = useState(false);
  const cb = useRef(onCodes);
  cb.current = onCodes;

  const start = async () => {
    if (!cameraSupported()) { setState('unsupported'); return; }
    setState('starting');
    try {
      scanner.current?.stop();
      const s = new Scanner(video.current, (texts) => {
        setHit(true); setTimeout(() => setHit(false), 450);
        cb.current(texts);
      });
      scanner.current = s;
      await s.start();
      setState('on');
    } catch (e) {
      console.warn(e);
      setErr(e?.name === 'NotAllowedError' ? 'Permesso alla fotocamera negato.' : 'Non riesco ad accendere la fotocamera.');
      setState('error');
    }
  };

  useEffect(() => {
    start();
    const onVis = () => { if (document.hidden) { scanner.current?.stop(); setState('off'); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); scanner.current?.stop(); };
  }, []);

  useEffect(() => {
    if (!scanner.current) return;
    if (paused) scanner.current.pause(); else scanner.current.resume();
  }, [paused]);

  return html`<div class=${`viewfinder ${hit ? 'vf-hit' : ''}`} style=${compact ? { aspectRatio: '4 / 3' } : null}>
    <video ref=${video} playsinline muted autoplay></video>
    ${state === 'on' && html`<div class="vf-frame"></div><div class="vf-laser"></div>`}
    ${state === 'on' && scanner.current?.torchSupported && html`<div class="vf-tools">
      <button class="icon-btn" aria-label="Torcia" onClick=${async () => { const v = !torch; if (await scanner.current.torch(v)) setTorch(v); }}><${Icon} n="bolt" s="20" /></button>
    </div>`}
    ${state === 'on' && html`<div class="vf-status"><span>${paused ? 'In pausa' : 'Inquadra il codice a barre o il quadratino DataMatrix'}</span></div>`}
    ${state !== 'on' && html`<div class="vf-idle">
      <${Icon} n=${state === 'error' || state === 'unsupported' ? 'alert-circle' : 'camera'} s="44" sw="1.6" />
      ${state === 'starting' && html`<p>Accendo la fotocamera…</p>`}
      ${state === 'off' && html`<p>Fotocamera in pausa.</p>`}
      ${state === 'error' && html`<p>${err} Controlla in Impostazioni di iPadOS che il sito possa usare la fotocamera, poi riprova.</p>`}
      ${state === 'unsupported' && html`<p>Questo browser non permette di usare la fotocamera. Apri l'app dall'icona sulla schermata Home, oppure usa una foto o un lettore Bluetooth.</p>`}
      ${(state === 'off' || state === 'error') && html`<button class="btn primary" onClick=${start}><${Icon} n="camera" s="20" />Accendi la fotocamera</button>`}
    </div>`}
  </div>`;
}

export function Scansiona() {
  const [manual, setManual] = useState('');
  const paused = U.sheets.length > 0;

  const submitManual = (e) => {
    e.preventDefault();
    const q = manual.trim();
    if (!q) return;
    const c = parseCode(q);
    const p = c?.key ? productByCode(c.key) : null;
    if (p) { handleCodes([q], { force: true }); setManual(''); return; }
    const found = S.products.filter((x) => matches(x, q, (x.codes || []).join(' ')));
    if (found.length === 1) { handleCodes([`MAG:P:${found[0].id}`], { force: true }); setManual(''); return; }
    if (found.length > 1) { navigate('magazzino', { mag: { q, status: 'all', cat: 'all', loc: null } }); return; }
    handleCodes([q], { force: true });
    setManual('');
  };

  const fromPhoto = async () => {
    const f = await readFile('image/*');
    if (!f) return;
    try {
      const texts = await decodeImage(f);
      if (!texts.length) { beep(false); toast('Nessun codice trovato nella foto. Avvicinati e assicurati che sia a fuoco.', { icon: 'alert-circle' }); return; }
      handleCodes(texts, { force: true });
    } catch (e) { toast('Non riesco a leggere la foto.', { icon: 'alert-circle' }); }
  };

  return html`<div class="page">
    <header class="page-head">
      <div class="grow">
        <h1>Scansiona</h1>
        <p class="sub">Scegli cosa stai facendo, poi inquadra la confezione.</p>
      </div>
      <${MeMini} />
    </header>
    <${Segmented} cls="full" value=${U.scanMode} onChange=${(v) => { U.scanMode = v; emit(); }} options=${[
      { v: 'prendo', l: 'Prendo', icon: 'minus' },
      { v: 'carico', l: 'Carico', icon: 'plus' },
      { v: 'info', l: 'Solo informazioni', icon: 'info-circle' },
    ]} />
    <div class="scan-layout" style="margin-top:16px">
      <${CameraView} onCodes=${(t) => handleCodes(t)} paused=${paused} />
      <div class="scan-side">
        ${U.pendingCode && html`<div class="pending-code">
          <${Icon} n="barcode" s="22" />
          <span style="flex:1">Ho letto ${describeCode(U.pendingCode)}. Inquadra il codice del prodotto per abbinarli.</span>
          <button class="icon-btn plain" aria-label="Annulla" onClick=${() => { U.pendingCode = null; emit(); }}><${Icon} n="x" s="18" /></button>
        </div>`}
        <form class="card" onSubmit=${submitManual}>
          <div class="card-title">Scrivi il codice o il nome</div>
          <div class="input-group">
            <input class="input" value=${manual} onInput=${(e) => setManual(e.target.value)} placeholder="Es. 8001234567897 o articaina" autocapitalize="off" autocomplete="off" />
            <button class="btn primary" type="submit">Cerca</button>
          </div>
          <div class="spacer"></div>
          <button type="button" class="btn ghost block" onClick=${fromPhoto}><${Icon} n="photo" s="20" />Leggi il codice da una foto</button>
        </form>
        <div class="card">
          <div class="kbd-hint"><${Icon} n="keyboard" s="20" /><p>Funziona anche con un lettore di codici Bluetooth: collegalo all'iPad e scansiona da qualsiasi schermata dell'app.</p></div>
        </div>
        ${U.recentScans.length > 0 && html`<div>
          <div class="group-title">Scansionati poco fa</div>
          <div class="group">
            ${U.recentScans.map((r) => { const p = product(r.id); return p && html`<button class="row has-lead" key=${r.id} onClick=${() => openSheet('product', { id: p.id })}>
              <${Thumb} p=${p} size=${40} />
              <div class="row-main"><div class="row-title clip">${p.name}</div><div class="row-sub">${relTime(r.at)}</div></div>
              <${Icon} n="chevron-right" s="18" cls="chev" />
            </button>`; })}
          </div>
        </div>`}
      </div>
    </div>
  </div>`;
}
