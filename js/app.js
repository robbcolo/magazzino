import { html, render, useEffect, useState } from '../vendor/preact-htm.js';
import { S, boot, subscribe, derived, emit } from './store.js';
import * as store from './store.js';
import { U, Icon, navigate, SheetHost, ToastHost, DialogHost, openSheet, closeAllSheets } from './ui.js';
import { BrandMark, ConfigScreen, LoginScreen, LoadingScreen, Onboarding } from './screens/auth.js';
import { Home } from './screens/home.js';
import { Magazzino } from './screens/magazzino.js';
import { Ordini } from './screens/ordini.js';
import { Scansiona, handleCodes } from './screens/scansiona.js';
import { Fornitori } from './screens/fornitori.js';
import { Attivita } from './screens/attivita.js';
import { Impostazioni } from './screens/impostazioni.js';
import { syncInfo } from './shared.js';
import './sheets/product.js';
import './sheets/orders.js';
import './sheets/misc.js';
import { warmUp, stopAllCameras } from './scanner.js';

const SCREENS = { home: Home, magazzino: Magazzino, ordini: Ordini, scansiona: Scansiona, fornitori: Fornitori, attivita: Attivita, impostazioni: Impostazioni };

function SyncCard() {
  const s = syncInfo();
  return html`<button class=${`sync-card sync-${s.tone}`} onClick=${() => navigate('impostazioni')} aria-label=${`${s.title}. ${s.text}`}>
    <${Icon} n=${s.icon} s="24" />
    <span class="sync-text"><b>${s.title}</b><span>${s.text}</span></span>
  </button>`;
}

function Nav() {
  const d = derived();
  const items = [
    { r: 'home', l: 'Oggi', i: 'home' },
    { r: 'magazzino', l: 'Magazzino', i: 'building-warehouse' },
    { r: 'ordini', l: 'Ordini', i: 'truck-delivery', badge: d.toOrder },
    { r: 'fornitori', l: 'Fornitori', i: 'building-store' },
    { r: 'attivita', l: 'Attività', i: 'history' },
    { r: 'impostazioni', l: 'Impostazioni', i: 'settings' },
  ];
  const item = (it) => html`<button class=${`nav-item ${U.route === it.r ? 'on' : ''}`} onClick=${() => navigate(it.r)} aria-current=${U.route === it.r ? 'page' : null}>
    <${Icon} n=${it.i} s="24" /><span>${it.l}</span>${it.badge ? html`<span class="nav-badge">${it.badge}</span>` : null}
  </button>`;
  return html`
    <nav class="sidebar" aria-label="Sezioni">
      <div class="brand"><${BrandMark} /><div class="brand-text"><b>Magazzino</b><span>${S.settings.studioName}</span></div></div>
      ${items.slice(0, 3).map(item)}
      <button class=${`nav-item nav-scan ${U.route === 'scansiona' ? 'on' : ''}`} onClick=${() => navigate('scansiona')}><${Icon} n="scan" s="24" /><span>Scansiona</span></button>
      ${items.slice(3).map(item)}
      <div class="sidebar-spacer"></div>
      <${SyncCard} />
    </nav>
    <nav class="tabbar" aria-label="Sezioni">
      ${[
        { r: 'home', l: 'Oggi', i: 'home' },
        { r: 'magazzino', l: 'Magazzino', i: 'building-warehouse' },
        { r: 'scansiona', l: 'Scansiona', i: 'scan', scan: true },
        { r: 'ordini', l: 'Ordini', i: 'truck-delivery', badge: d.toOrder },
        { r: 'impostazioni', l: 'Altro', i: 'dots' },
      ].map((it) => html`<button class=${`tab ${it.scan ? 'tab-scan' : ''} ${U.route === it.r ? 'on' : ''}`} onClick=${() => navigate(it.r)}>
        ${it.scan ? html`<span class="scan-disc"><${Icon} n="scan" s="28" /></span>` : html`<${Icon} n=${it.i} s="25" />`}
        <span>${it.l}</span>
        ${it.badge ? html`<span class="nav-badge">${it.badge}</span>` : null}
      </button>`)}
    </nav>`;
}

function UpdateBar() {
  const [reg, setReg] = useState(null);
  useEffect(() => {
    const onUpd = (e) => setReg(e.detail);
    window.addEventListener('sw-update', onUpd);
    return () => window.removeEventListener('sw-update', onUpd);
  }, []);
  if (!reg) return null;
  return html`<div class="update-bar" role="status">
    <span>È disponibile una nuova versione dell'app.</span>
    <button class="btn small primary" onClick=${() => { window.__updating = true; reg.waiting?.postMessage('skipWaiting'); }}>Aggiorna</button>
  </div>`;
}

function App() {
  const [, force] = useState(0);
  useEffect(() => {
    const off = subscribe(() => force((x) => x + 1));
    force((x) => x + 1); // lo stato potrebbe essere cambiato prima della sottoscrizione
    return off;
  }, []);
  const extras = html`<${ToastHost} /><${UpdateBar} />`;
  if (S.phase === 'config') return html`<${ConfigScreen} />${extras}`;
  if (S.phase === 'login') return html`<${LoginScreen} />${extras}`;
  if (S.phase !== 'ready') return html`<${LoadingScreen} />${extras}`;
  if (!S.settingsExists || !S.settings.setupDone) return html`<${Onboarding} />${extras}`;
  const Screen = SCREENS[U.route] || Home;
  return html`
    <div class="app">
      <${Nav} />
      <main class="main"><div class="main-scroll"><${Screen} /></div></main>
    </div>
    <${SheetHost} />
    <${DialogHost} />
    ${extras}`;
}

// ---------- Avvio ----------
window.__magazzino = store; // per assistenza e test dalla console
window.__magazzinoUI = { openSheet, closeAllSheets, navigate };
render(html`<${App} />`, document.getElementById('app'));
boot();
setTimeout(warmUp, 2000);

window.addEventListener('online', emit);
window.addEventListener('offline', emit);
setInterval(emit, 60000); // aggiorna orari relativi e stato di sincronizzazione
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAllCameras();
  else emit(); // aggiorna stati legati alla data (es. nuovo giorno)
});

// Lettore di codici Bluetooth / USB (si comporta come una tastiera velocissima)
let buf = '', lastKey = 0, gaps = [];
window.addEventListener('keydown', (e) => {
  if (S.phase !== 'ready') return;
  const t = e.target;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const now = performance.now();
  if (now - lastKey > 120) { buf = ''; gaps = []; }
  if (buf) gaps.push(now - lastKey);
  lastKey = now;
  if (e.key === 'Enter') {
    const fast = gaps.length >= 5 && gaps.reduce((a, b) => a + b, 0) / gaps.length < 45;
    if (buf.length >= 6 && fast) {
      e.preventDefault();
      if (typing) t.blur();
      const code = buf;
      buf = ''; gaps = [];
      if (U.codeHandler) U.codeHandler([code]);
      else handleCodes([code], { force: true });
    }
    buf = '';
    return;
  }
  if (e.key.length === 1) buf += e.key;
  else if (e.key === 'Unidentified' || e.key === 'Dead') buf += '\x1d';
}, true);

// ---------- Service worker: funziona offline e si aggiorna ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      const notify = () => window.dispatchEvent(new CustomEvent('sw-update', { detail: reg }));
      if (reg.waiting && navigator.serviceWorker.controller) notify();
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) notify(); });
      });
      let reloaded = false;
      // ricarica solo quando l'utente ha scelto «Aggiorna» (non al primo avvio)
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (window.__updating && !reloaded) { reloaded = true; location.reload(); } });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch (e) { console.warn('Service worker non registrato', e); }
  });
}
