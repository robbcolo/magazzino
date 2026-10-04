import { html, render, useEffect, useState } from '../vendor/preact-htm.js';
import { S, load, subscribe, derived, me, logout, ping, checkLock, emit } from './store.js';
import { U, Icon, Avatar, navigate, SheetHost, ToastHost, DialogHost, closeAllSheets } from './ui.js';
import { BrandMark, LockScreen, Onboarding } from './screens/lock.js';
import { Home } from './screens/home.js';
import { Magazzino } from './screens/magazzino.js';
import { Ordini } from './screens/ordini.js';
import { Scansiona, handleCodes } from './screens/scansiona.js';
import { Fornitori } from './screens/fornitori.js';
import { Attivita } from './screens/attivita.js';
import { Impostazioni } from './screens/impostazioni.js';
import './sheets/product.js';
import './sheets/orders.js';
import './sheets/misc.js';
import { warmUp, stopAllCameras } from './scanner.js';

const SCREENS = { home: Home, magazzino: Magazzino, ordini: Ordini, scansiona: Scansiona, fornitori: Fornitori, attivita: Attivita, impostazioni: Impostazioni };

function Nav() {
  const d = derived();
  const u = me();
  const items = [
    { r: 'home', l: 'Oggi', i: 'home' },
    { r: 'magazzino', l: 'Magazzino', i: 'building-warehouse' },
    { r: 'ordini', l: 'Ordini', i: 'truck-delivery', badge: d.toOrder },
    { r: 'fornitori', l: 'Fornitori', i: 'building-store' },
    { r: 'attivita', l: 'Attività', i: 'history' },
    { r: 'impostazioni', l: 'Impostazioni', i: 'settings' },
  ];
  return html`
    <nav class="sidebar" aria-label="Sezioni">
      <div class="brand"><${BrandMark} /><div class="brand-text"><b>Magazzino</b><span>${S.settings.studioName}</span></div></div>
      ${items.slice(0, 3).map((it) => html`<button class=${`nav-item ${U.route === it.r ? 'on' : ''}`} onClick=${() => navigate(it.r)} aria-current=${U.route === it.r ? 'page' : null}>
        <${Icon} n=${it.i} s="24" /><span>${it.l}</span>${it.badge ? html`<span class="nav-badge">${it.badge}</span>` : null}
      </button>`)}
      <button class=${`nav-item nav-scan ${U.route === 'scansiona' ? 'on' : ''}`} onClick=${() => navigate('scansiona')}><${Icon} n="scan" s="24" /><span>Scansiona</span></button>
      ${items.slice(3).map((it) => html`<button class=${`nav-item ${U.route === it.r ? 'on' : ''}`} onClick=${() => navigate(it.r)} aria-current=${U.route === it.r ? 'page' : null}>
        <${Icon} n=${it.i} s="24" /><span>${it.l}</span>
      </button>`)}
      <div class="sidebar-spacer"></div>
      <button class="me-card" onClick=${logout} aria-label="Cambia utente">
        <${Avatar} u=${u} size=${40} />
        <span class="me-text"><b>${u?.name}</b><span>Cambia utente</span></span>
        <${Icon} n="switch-horizontal" s="20" />
      </button>
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
    force((x) => x + 1); // i dati potrebbero essere già pronti prima della sottoscrizione
    return off;
  }, []);
  if (!S.ready) return null;
  if (!S.settings.setupDone || !S.users.length) return html`<${Onboarding} /><${ToastHost} />`;
  if (!S.session.userId || !me()) return html`<${LockScreen} /><${ToastHost} /><${UpdateBar} />`;
  const Screen = SCREENS[U.route] || Home;
  return html`
    <div class="app">
      <${Nav} />
      <main class="main"><div class="main-scroll"><${Screen} /></div></main>
    </div>
    <${SheetHost} />
    <${DialogHost} />
    <${ToastHost} />
    <${UpdateBar} />`;
}

// ---------- Avvio ----------
render(html`<${App} />`, document.getElementById('app'));
load().then(() => { setTimeout(warmUp, 1500); });

// Attività dell'utente: rimanda il blocco automatico
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, ping, { passive: true, capture: true }));
setInterval(() => { if (checkLock()) { closeAllSheets(); stopAllCameras(); } }, 15000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    if (checkLock()) closeAllSheets();
    emit(); // aggiorna stati legati alla data (es. nuovo giorno)
  } else {
    stopAllCameras();
  }
});

// Lettore di codici Bluetooth / USB (si comporta come una tastiera velocissima)
let buf = '', lastKey = 0, gaps = [];
window.addEventListener('keydown', (e) => {
  if (!S.session.userId) return;
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
