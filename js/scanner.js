// Fotocamera + lettura codici (ZXing-C++ in WebAssembly, funziona offline)
import { readBarcodes, prepareZXingModule } from '../vendor/zxing-reader.js';

let prepared = false;
function prepare() {
  if (prepared) return;
  prepared = true;
  const wasmUrl = new URL('../vendor/zxing_reader.wasm', import.meta.url).href;
  prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
}

export const FORMATS = ['DataMatrix', 'QRCode', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39', 'ITF', 'DataBar', 'DataBarExp'];

export const cameraSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

// Un solo flusso video condiviso: evita che iOS chieda di nuovo il permesso
// quando si passa dalla schermata Scansiona a un foglio che legge un codice.
const shared = { stream: null, refs: 0, stopTimer: null };
const live = (s) => s && s.getVideoTracks().some((t) => t.readyState === 'live');
async function acquireStream() {
  if (shared.stopTimer) { clearTimeout(shared.stopTimer); shared.stopTimer = null; }
  if (live(shared.stream)) { shared.refs++; return shared.stream; }
  shared.stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  shared.refs = 1;
  return shared.stream;
}
function releaseStream() {
  shared.refs = Math.max(0, shared.refs - 1);
  if (shared.refs) return;
  shared.stopTimer = setTimeout(() => {
    try { shared.stream?.getTracks().forEach((t) => t.stop()); } catch { /* già fermo */ }
    shared.stream = null;
  }, 1200);
}
export function stopAllCameras() {
  try { shared.stream?.getTracks().forEach((t) => t.stop()); } catch { /* già fermo */ }
  shared.stream = null;
  shared.refs = 0;
}

export class Scanner {
  constructor(video, onCodes) {
    this.video = video;
    this.onCodes = onCodes;
    this.stream = null;
    this.running = false;
    this.paused = false;
    this.busy = false;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.last = 0;
  }

  async start() {
    prepare();
    this.stream = await acquireStream();
    this.owns = true;
    const v = this.video;
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    v.muted = true;
    v.srcObject = this.stream;
    await v.play();
    this.running = true;
    this.paused = false;
    this.tick();
  }

  get track() { return this.stream?.getVideoTracks?.()[0]; }

  get torchSupported() {
    try { return !!this.track?.getCapabilities?.().torch; } catch { return false; }
  }

  async torch(on) {
    try { await this.track.applyConstraints({ advanced: [{ torch: on }] }); return true; } catch { return false; }
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  stop() {
    this.running = false;
    if (this.owns) { this.owns = false; releaseStream(); }
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  tick = () => {
    if (!this.running) return;
    requestAnimationFrame(this.tick);
    const now = performance.now();
    if (this.paused || this.busy || now - this.last < 130) return;
    const v = this.video;
    if (!v.videoWidth || v.readyState < 2) return;
    this.last = now;
    this.busy = true;
    const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * k), h = Math.round(v.videoHeight * k);
    if (this.canvas.width !== w) { this.canvas.width = w; this.canvas.height = h; }
    this.ctx.drawImage(v, 0, 0, w, h);
    const img = this.ctx.getImageData(0, 0, w, h);
    readBarcodes(img, { formats: FORMATS, tryHarder: true, maxNumberOfSymbols: 4 })
      .then((res) => {
        const texts = res.filter((r) => r.isValid && r.text).map((r) => r.text);
        if (texts.length && !this.paused) this.onCodes(texts);
      })
      .catch((e) => console.warn('Lettura codice non riuscita', e))
      .finally(() => { this.busy = false; });
  };
}

/** Legge i codici da una foto (alternativa alla fotocamera dal vivo) */
export async function decodeImage(file) {
  prepare();
  const res = await readBarcodes(file, { formats: FORMATS, tryHarder: true, maxNumberOfSymbols: 4 });
  return res.filter((r) => r.isValid && r.text).map((r) => r.text);
}

/** Precarica il motore di lettura (così la prima scansione è immediata) */
export function warmUp() {
  try {
    prepare();
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const img = c.getContext('2d').getImageData(0, 0, 8, 8);
    readBarcodes(img, { formats: ['QRCode'] }).catch(() => {});
  } catch { /* nessun problema */ }
}
