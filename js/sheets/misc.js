import { html, useState, useEffect, render } from '../../vendor/preact-htm.js';
import qrcode from '../../vendor/qrcode.js';
import {
  S, product, supplier, user, category, me, isAdmin, saveSupplier, deleteSupplier, saveUser, deleteUser, saveCategory,
  deleteCategory, pinHash, linkCode, stockMove, CSV_COLUMNS, parseCSV, planCSV, applyCSV,
} from '../store.js';
import {
  SHEETS, Sheet, Icon, Avatar, AVATAR_COLORS, CatBadge, Thumb, Field, Segmented, Empty, NumberInput, openSheet, toast,
  confirmDialog, haptic, fmtQty, plural, U, readFile, shareOrDownload, unitFor,
} from '../ui.js';
import { CameraView, handleCodes } from '../screens/scansiona.js';
import { parseCode, mergeCodes, describeCode } from '../codes.js';
import { matches, norm } from '../logic.js';

// ---------------- Fornitore ----------------
function SupplierEditSheet({ id, close }) {
  const ex = id ? supplier(id) : null;
  const [f, setF] = useState(() => (ex ? { ...ex } : { name: '', agent: '', phone: '', whatsapp: '', email: '', web: '', searchUrl: '', leadDays: 3, freeShip: null, note: '' }));
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = () => { saveSupplier({ ...f, name: f.name.trim() }); close(); toast(ex ? 'Fornitore salvato' : `${f.name.trim()} aggiunto`); };
  const del = async () => {
    const n = S.products.filter((p) => p.supplierId === id).length;
    if (!await confirmDialog({ title: `Eliminare ${ex.name}?`, text: n ? `${plural(n, 'materiale resterà', 'materiali resteranno')} senza fornitore principale.` : 'Il fornitore verrà rimosso.', ok: 'Elimina', danger: true })) return;
    deleteSupplier(id); close();
  };
  return html`<${Sheet} title=${ex ? ex.name : 'Nuovo fornitore'} close=${close} wide
    footer=${html`${ex && isAdmin() && html`<button class="btn soft-danger" onClick=${del}><${Icon} n="trash" s="20" />Elimina</button>`}<span class="grow"></span><button class="btn ghost" onClick=${close}>Annulla</button><button class="btn primary" disabled=${!f.name.trim()} onClick=${save}><${Icon} n="check" s="20" />Salva</button>`}>
    <div class="form">
      <div class="form-grid">
        <${Field} label="Nome"><input class="input" value=${f.name} onInput=${(e) => set({ name: e.target.value })} placeholder="Es. Dontalia" /></${Field}>
        <${Field} label="Referente o agente" hint="Usato nel saluto dell'ordine."><input class="input" value=${f.agent} onInput=${(e) => set({ agent: e.target.value })} placeholder="Es. Marco" /></${Field}>
        <${Field} label="Telefono"><input class="input" type="tel" value=${f.phone} onInput=${(e) => set({ phone: e.target.value })} /></${Field}>
        <${Field} label="WhatsApp" hint="Numero a cui inviare gli ordini, anche senza +39."><input class="input" type="tel" value=${f.whatsapp} onInput=${(e) => set({ whatsapp: e.target.value })} /></${Field}>
        <${Field} label="Email ordini"><input class="input" type="email" value=${f.email} onInput=${(e) => set({ email: e.target.value })} autocapitalize="off" /></${Field}>
        <${Field} label="Sito"><input class="input" type="url" value=${f.web} onInput=${(e) => set({ web: e.target.value })} placeholder="https://" autocapitalize="off" /></${Field}>
        <${Field} label="Tempo di consegna"><div class="input-group"><${NumberInput} value=${f.leadDays} onInput=${(v) => set({ leadDays: v })} inputmode="numeric" /><span class="input-suffix">giorni</span></div></${Field}>
        <${Field} label="Spedizione gratuita da" hint="Ti mostro quanto manca mentre prepari l'ordine."><div class="input-group"><${NumberInput} value=${f.freeShip} onInput=${(v) => set({ freeShip: v })} placeholder="Es. 150" /><span class="input-suffix">€</span></div></${Field}>
      </div>
      <${Field} label="Indirizzo di ricerca sul sito (facoltativo)" hint="Copia l'indirizzo di una ricerca sul sito e sostituisci la parola cercata con {q}. Se vuoto, cerco con Google dentro il sito.">
        <input class="input" value=${f.searchUrl || ''} onInput=${(e) => set({ searchUrl: e.target.value })} placeholder="https://www.sito.it/cerca?q={q}" autocapitalize="off" />
      </${Field}>
      <${Field} label="Note"><textarea class="input" value=${f.note} onInput=${(e) => set({ note: e.target.value })} placeholder="Es. ordini entro le 12 per la consegna il giorno dopo"></textarea></${Field}>
    </div>
  </${Sheet}>`;
}

// ---------------- Persona ----------------
function UserEditSheet({ id, close }) {
  const ex = id ? user(id) : null;
  const [f, setF] = useState(() => (ex ? { ...ex } : { name: '', fullName: '', role: 'assistente', color: AVATAR_COLORS[S.users.length % AVATAR_COLORS.length], pin: null }));
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const admins = S.users.filter((u) => u.role === 'admin');
  const lastAdmin = ex?.role === 'admin' && admins.length === 1;
  const save = () => {
    if (lastAdmin && f.role !== 'admin') { toast('Serve almeno un dottore con tutti i permessi.'); return; }
    saveUser({ ...f, name: f.name.trim() }); close(); toast('Salvato');
  };
  const del = async () => {
    if (ex.id === me()?.id) { toast('Non puoi eliminare il profilo che stai usando.'); return; }
    if (lastAdmin) { toast('Serve almeno un dottore con tutti i permessi.'); return; }
    if (!await confirmDialog({ title: `Eliminare ${ex.name}?`, text: 'Le sue attività passate restano nello storico.', ok: 'Elimina', danger: true })) return;
    deleteUser(ex.id); close();
  };
  return html`<${Sheet} title=${ex ? ex.name : 'Nuova persona'} close=${close}
    footer=${html`${ex && html`<button class="btn soft-danger" onClick=${del}><${Icon} n="trash" s="20" />Elimina</button>`}<span class="grow"></span><button class="btn primary" disabled=${!f.name.trim()} onClick=${save}><${Icon} n="check" s="20" />Salva</button>`}>
    <div class="form">
      <div style="display:flex;justify-content:center;margin:6px 0"><${Avatar} u=${{ ...f, name: f.name || '?' }} size=${84} /></div>
      <${Field} label="Colore"><div class="pick-grid">${AVATAR_COLORS.map((c) => html`<button type="button" class=${`pick ${f.color === c ? 'on' : ''}`} onClick=${() => set({ color: c })} aria-label=${c} style="padding:0 10px"><span class=${`avatar av-${c}`} style="width:26px;height:26px"></span></button>`)}</div></${Field}>
      <${Field} label="Nome che compare nell'app"><input class="input" value=${f.name} onInput=${(e) => set({ name: e.target.value })} /></${Field}>
      <${Field} label="Nome per firmare gli ordini" hint="Es. Dott. Roberto Colombo"><input class="input" value=${f.fullName || ''} onInput=${(e) => set({ fullName: e.target.value })} /></${Field}>
      <${Field} label="Ruolo" hint="I dottori possono modificare persone, categorie, impostazioni ed eliminare schede.">
        <${Segmented} cls="full" value=${f.role} onChange=${(v) => set({ role: v })} options=${[{ v: 'admin', l: 'Dottore' }, { v: 'assistente', l: 'Assistente' }]} />
      </${Field}>
      ${ex && html`<button type="button" class="btn ghost" onClick=${() => openSheet('pinSet', { userId: ex.id })}><${Icon} n="lock" s="20" />${ex.pin ? 'Cambia o togli il PIN' : 'Imposta un PIN'}</button>`}
    </div>
  </${Sheet}>`;
}

function PinSetSheet({ userId, close }) {
  const u = user(userId);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const ok = /^\d{4}$/.test(a) && a === b;
  return html`<${Sheet} title=${`PIN di ${u?.name}`} sub="4 cifre, da inserire quando si sceglie questo profilo." close=${close}
    footer=${html`${u?.pin && html`<button class="btn soft-danger" onClick=${() => { saveUser({ id: userId, pin: null }); close(); toast('PIN tolto'); }}>Togli il PIN</button>`}<span class="grow"></span><button class="btn primary" disabled=${!ok} onClick=${() => { saveUser({ id: userId, pin: pinHash(userId, a) }); close(); toast('PIN impostato'); }}>Salva PIN</button>`}>
    <div class="form-grid">
      <${Field} label="Nuovo PIN"><input class="input num" type="password" inputmode="numeric" maxlength="4" value=${a} onInput=${(e) => setA(e.target.value.replace(/\D/g, ''))} autocomplete="new-password" /></${Field}>
      <${Field} label="Ripeti il PIN"><input class="input num" type="password" inputmode="numeric" maxlength="4" value=${b} onInput=${(e) => setB(e.target.value.replace(/\D/g, ''))} autocomplete="new-password" /></${Field}>
    </div>
    ${b.length === 4 && a !== b && html`<p class="warn-text" style="margin-top:10px">I due PIN non coincidono.</p>`}
  </${Sheet}>`;
}

// ---------------- Categoria ----------------
const EMOJIS = ['🦷', '🪥', '💉', '💊', '🧤', '😷', '✂️', '🔩', '👑', '🧪', '🩻', '🧼', '🫧', '📎', '🪡', '🩹', '🧴', '🧻', '📦', '🔬', '🦴', '🧲', '⚙️', '🧯', '🧽', '🪒', '🔦', '🖨️', '😁', '🫙'];
const CAT_COLORS = ['sky', 'lilac', 'sand', 'slate', 'rose', 'mint', 'peach', 'coral', 'aqua', 'leaf', 'lemon', 'grape', 'stone'];
function CategoryEditSheet({ id, close }) {
  const ex = id ? category(id) : null;
  const [f, setF] = useState(() => (ex ? { ...ex } : { name: '', emoji: '📦', color: 'sky', respId: null }));
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const n = ex ? S.products.filter((p) => p.catId === ex.id).length : 0;
  const del = async () => {
    if (n) { toast(`Sposta prima i ${n} materiali in un'altra categoria.`); return; }
    if (!await confirmDialog({ title: `Eliminare ${ex.name}?`, ok: 'Elimina', danger: true })) return;
    deleteCategory(ex.id); close();
  };
  return html`<${Sheet} title=${ex ? ex.name : 'Nuova categoria'} close=${close}
    footer=${html`${ex && html`<button class="btn soft-danger" onClick=${del}><${Icon} n="trash" s="20" />Elimina</button>`}<span class="grow"></span><button class="btn primary" disabled=${!f.name.trim()} onClick=${() => { saveCategory({ ...f, name: f.name.trim() }); close(); }}><${Icon} n="check" s="20" />Salva</button>`}>
    <div class="form">
      <div style="display:flex;gap:14px;align-items:center"><${CatBadge} cat=${f} size=${64} /><input class="input" value=${f.name} onInput=${(e) => set({ name: e.target.value })} placeholder="Nome della categoria" style="flex:1" /></div>
      <${Field} label="Icona"><div class="pick-grid">${EMOJIS.map((e) => html`<button type="button" class=${`pick ${f.emoji === e ? 'on' : ''}`} onClick=${() => set({ emoji: e })} style="padding:0 10px"><span class="em">${e}</span></button>`)}</div></${Field}>
      <${Field} label="Colore"><div class="pick-grid">${CAT_COLORS.map((c) => html`<button type="button" class=${`pick ${f.color === c ? 'on' : ''}`} onClick=${() => set({ color: c })} style="padding:0 8px" aria-label=${c}><span class=${`cat-badge cat-${c}`} style="width:28px;height:28px;border-radius:8px;background:var(--c)"></span></button>`)}</div></${Field}>
      <${Field} label="Chi ordina i materiali di questa categoria" hint="Si può cambiare per il singolo materiale nella sua scheda.">
        <select class="input" value=${f.respId || ''} onChange=${(e) => set({ respId: e.target.value || null })}>
          <option value="">Nessuno</option>
          ${S.users.map((u) => html`<option value=${u.id}>${u.name}</option>`)}
        </select>
      </${Field}>
    </div>
  </${Sheet}>`;
}

// ---------------- Lettura di un codice per un foglio ----------------
function ScanCodeSheet({ title, onCode, close }) {
  const [manual, setManual] = useState('');
  const deliver = (texts) => {
    const parsed = texts.map(parseCode).filter(Boolean);
    if (!parsed.length) return;
    const c = mergeCodes(parsed);
    if (onCode(c) !== false) { haptic(); close(); }
  };
  useEffect(() => {
    const prev = U.codeHandler;
    U.codeHandler = deliver;
    return () => { U.codeHandler = prev; };
  }, []);
  return html`<${Sheet} title=${title || 'Inquadra il codice'} close=${close}>
    <${CameraView} onCodes=${deliver} compact />
    <form style="margin-top:14px" onSubmit=${(e) => { e.preventDefault(); if (manual.trim()) deliver([manual.trim()]); }}>
      <${Field} label="Oppure scrivilo">
        <div class="input-group"><input class="input" value=${manual} onInput=${(e) => setManual(e.target.value)} placeholder="Codice a barre o codice del fornitore" autocapitalize="off" /><button class="btn primary" type="submit">Usa</button></div>
      </${Field}>
    </form>
  </${Sheet}>`;
}

// ---------------- Codice sconosciuto ----------------
function UnknownCodeSheet({ code, close }) {
  const [q, setQ] = useState('');
  const list = q.trim() ? S.products.filter((p) => matches(p, q)).slice(0, 30) : [];
  const link = (p) => {
    linkCode(p.id, code.key);
    close();
    toast(`Codice collegato a ${p.name}. La prossima volta lo riconosco subito.`, { icon: 'circle-check', ms: 4500 });
    const mode = U.route === 'scansiona' ? U.scanMode : 'prendo';
    if (mode === 'info') openSheet('product', { id: p.id });
    else openSheet('move', { id: p.id, mode: mode === 'carico' ? 'carico' : 'prendo', lot: code.lot, exp: code.exp });
  };
  return html`<${Sheet} title="Codice non ancora conosciuto" sub=${describeCode(code)} close=${close} cls="tall">
    <p class="ink2">Collegalo una volta al materiale giusto: dalla prossima scansione lo riconosco da solo.</p>
    <button class="btn primary block big" style="margin-top:16px" onClick=${() => { close(); openSheet('productEdit', { code }); }}><${Icon} n="plus" s="22" />È un materiale nuovo: crea la scheda</button>
    <div class="hr"></div>
    <${Field} label="Oppure è un materiale che c'è già? Cercalo">
      <label class="search"><${Icon} n="search" s="20" /><input type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Nome o marca" autofocus /></label>
    </${Field}>
    <div class="group" style="margin-top:12px">
      ${list.map((p) => html`<button class="row has-lead" key=${p.id} onClick=${() => link(p)}>
        <${Thumb} p=${p} size=${40} />
        <div class="row-main"><div class="row-title">${p.name}</div><div class="row-sub">${p.brand || category(p.catId)?.name || ''}</div></div>
        <span class="link-btn">Collega</span>
      </button>`)}
      ${q.trim() && !list.length && html`<${Empty} emoji="🔍" title="Nessun materiale trovato" text="Crea una nuova scheda con il pulsante qui sopra." />`}
    </div>
  </${Sheet}>`;
}

// ---------------- Inventario guidato ----------------
function InventorySheet({ close }) {
  const [by, setBy] = useState('loc');
  const keyOf = (p) => (by === 'loc' ? p.location || 'Ubicazione non indicata' : category(p.catId)?.name || 'Senza categoria');
  const groups = [...new Set(S.products.map(keyOf))].sort((a, b) => a.localeCompare(b, 'it'));
  const [sel, setSel] = useState(groups[0] || null);
  const [counts, setCounts] = useState({});
  const current = sel && groups.includes(sel) ? sel : groups[0];
  const items = S.products.filter((p) => keyOf(p) === current).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const changed = Object.entries(counts).filter(([pid, v]) => v != null && product(pid) && v !== product(pid).qty);
  const save = () => {
    for (const [pid, v] of changed) stockMove(pid, 'rettifica', v, { note: 'Inventario' });
    toast(`Inventario salvato: ${plural(changed.length, 'quantità corretta', 'quantità corrette')}.`, { icon: 'circle-check' });
    setCounts({});
  };
  if (!S.products.length) return html`<${Sheet} title="Inventario" close=${close}><${Empty} emoji="📦" title="Il magazzino è vuoto" /></${Sheet}>`;
  return html`<${Sheet} title="Inventario guidato" sub="Conta i materiali e scrivi il numero: lascia vuoto se è già giusto." close=${close} wide cls="tall"
    footer=${html`<span class="muted" style="font-size:14.5px">${changed.length ? `${plural(changed.length, 'differenza', 'differenze')} da salvare` : 'Nessuna differenza'}</span><span class="grow"></span><button class="btn primary" disabled=${!changed.length} onClick=${save}><${Icon} n="check" s="20" />Salva conteggio</button>`}>
    <${Segmented} value=${by} onChange=${(v) => { setBy(v); setSel(null); }} options=${[{ v: 'loc', l: 'Per ubicazione', icon: 'map-pin' }, { v: 'cat', l: 'Per categoria', icon: 'category' }]} />
    <div class="filters">${groups.map((g) => html`<button class=${`fchip ${g === current ? 'on' : ''}`} onClick=${() => setSel(g)}>${g}</button>`)}</div>
    <div style="margin-top:8px">
      ${items.map((p) => {
        const v = counts[p.id];
        const diff = v != null && v !== p.qty;
        return html`<div class=${`inv-row ${diff ? 'changed' : ''}`} key=${p.id}>
          <${Thumb} p=${p} size=${44} />
          <div class="row-main">
            <div class="row-title">${p.name}</div>
            <div class="row-sub">Nell'app: ${fmtQty(p.qty, p.unit)}${diff ? html`, <b class=${v < p.qty ? 'warn-text' : 'okay-text'}>${v > p.qty ? '+' : ''}${v - p.qty}</b>` : ''}</div>
          </div>
          <input class="input" type="text" inputmode="numeric" pattern="[0-9]*" placeholder=${String(p.qty)} value=${v ?? ''} aria-label=${`Contati: ${p.name}`}
            onInput=${(e) => { const n = parseInt(e.target.value, 10); setCounts({ ...counts, [p.id]: Number.isFinite(n) ? Math.max(0, n) : null }); }} />
        </div>`;
      })}
    </div>
  </${Sheet}>`;
}

// ---------------- Etichette QR ----------------
function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}
function LabelsSheet({ preselect = [], close }) {
  const [kind, setKind] = useState('prodotti');
  const [size, setSize] = useState('small');
  const [cat, setCat] = useState('all');
  const [sel, setSel] = useState(() => new Set(preselect));
  const [locSel, setLocSel] = useState(() => new Set());
  const locs = [...new Set(S.products.map((p) => p.location).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
  const list = S.products.filter((p) => cat === 'all' || p.catId === cat).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const toggle = (setFn, s, id) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); setFn(n); };
  const count = kind === 'prodotti' ? sel.size : locSel.size;
  const print = () => {
    const labels = kind === 'prodotti'
      ? [...sel].map((id) => product(id)).filter(Boolean).map((p) => ({ t: `MAG:P:${p.id}`, title: p.name, sub: [p.brand, p.location].filter(Boolean).join(', ') }))
      : [...locSel].map((l) => ({ t: `MAG:L:${encodeURIComponent(l)}`, title: l, sub: 'Inquadra per vedere cosa contiene' }));
    let area = document.getElementById('print-area');
    if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area); }
    render(html`<div class=${`labels ${size === 'big' ? 'big' : ''}`}>${labels.map((l) => html`<div class="label"><span dangerouslySetInnerHTML=${{ __html: qrSvg(l.t) }}></span><div><b>${l.title}</b><span>${l.sub}</span></div></div>`)}</div>`, area);
    setTimeout(() => window.print(), 80);
  };
  return html`<${Sheet} title="Etichette QR" sub="Stampale su carta adesiva e attaccale a scatole, armadi e cassetti." close=${close} wide cls="tall"
    footer=${html`<${Segmented} value=${size} onChange=${setSize} options=${[{ v: 'small', l: 'Piccole' }, { v: 'big', l: 'Grandi' }]} /><span class="grow"></span><button class="btn primary" disabled=${!count} onClick=${print}><${Icon} n="printer" s="20" />Stampa ${count || ''}</button>`}>
    <${Segmented} value=${kind} onChange=${setKind} options=${[{ v: 'prodotti', l: 'Materiali', icon: 'package' }, { v: 'ubicazioni', l: 'Armadi e cassetti', icon: 'map-pin' }]} />
    ${kind === 'prodotti' ? html`
      <div class="filters">
        <button class=${`fchip ${cat === 'all' ? 'on' : ''}`} onClick=${() => setCat('all')}>Tutte</button>
        ${S.categories.map((c) => html`<button class=${`fchip ${cat === c.id ? 'on' : ''}`} onClick=${() => setCat(c.id)}>${c.emoji} ${c.name}</button>`)}
      </div>
      <div style="display:flex;gap:10px;margin:6px 0 10px">
        <button class="btn small ghost" onClick=${() => setSel(new Set([...sel, ...list.map((p) => p.id)]))}>Seleziona tutti</button>
        <button class="btn small ghost" onClick=${() => setSel(new Set())}>Nessuno</button>
      </div>
      <div class="group">${list.map((p) => html`<label class="row has-lead" key=${p.id} style="cursor:pointer">
        <input type="checkbox" checked=${sel.has(p.id)} onChange=${() => toggle(setSel, sel, p.id)} style="width:22px;height:22px;accent-color:var(--accent)" />
        <div class="row-main"><div class="row-title">${p.name}</div><div class="row-sub">${p.location || ''}</div></div>
        ${p.codes?.some((k) => !k.startsWith('id:')) && html`<span class="chip sm neutral">ha già un codice</span>`}
      </label>`)}</div>`
    : html`<div class="group" style="margin-top:12px">${locs.length ? locs.map((l) => html`<label class="row" key=${l} style="cursor:pointer">
        <input type="checkbox" checked=${locSel.has(l)} onChange=${() => toggle(setLocSel, locSel, l)} style="width:22px;height:22px;accent-color:var(--accent)" />
        <div class="row-main"><div class="row-title">${l}</div><div class="row-sub">${plural(S.products.filter((p) => p.location === l).length, 'materiale', 'materiali')}</div></div>
      </label>`) : html`<${Empty} emoji="🗄️" title="Nessuna ubicazione" text="Indica dove si trova ogni materiale nella sua scheda." />`}</div>`}
    <p class="muted" style="font-size:14px;margin-top:12px">Dal foglio di stampa dell'iPad puoi anche salvare in PDF.</p>
  </${Sheet}>`;
}

// ---------------- Importazione CSV ----------------
function CsvImportSheet({ close }) {
  const [plan, setPlan] = useState(null);
  const [name, setName] = useState('');
  const template = () => {
    const rows = [CSV_COLUMNS.join(';'),
      'Articaina 4% 1:100.000;Septanest;Anestesia e farmaci;120;carpule;50;scatola;50;150;Dontalia;12345;42,00;Sala 1 › Carrello;Roberto;;si;',
      'Guanti in nitrile M;Sempercare;Monouso e DPI;8;scatole;10;cartone;6;20;Dontalia;;46,00;Magazzino › Scaffale DPI;;;no;'];
    shareOrDownload('modello-magazzino.csv', '﻿' + rows.join('\n'), 'text/csv');
  };
  const pick = async () => {
    const f = await readFile('.csv,text/csv,text/plain');
    if (!f) return;
    const { records } = parseCSV(await f.text());
    setName(f.name);
    setPlan(planCSV(records));
  };
  const run = async () => {
    const n = plan.create.length + plan.update.length;
    if (!await confirmDialog({ title: `Importare ${plural(n, 'riga', 'righe')}?`, text: `${plural(plan.create.length, 'nuovo materiale', 'nuovi materiali')}, ${plural(plan.update.length, 'già presente da aggiornare', 'già presenti da aggiornare')}.`, ok: 'Importa' })) return;
    const r = applyCSV(plan);
    close();
    toast(`Importazione completata: ${r.created} nuovi, ${r.updated} aggiornati.`, { icon: 'circle-check', ms: 5000 });
  };
  return html`<${Sheet} title="Importa da Excel o Numbers" close=${close} wide
    footer=${plan ? html`<button class="btn ghost" onClick=${() => setPlan(null)}>Scegli un altro file</button><span class="grow"></span><button class="btn primary" disabled=${!(plan.create.length + plan.update.length)} onClick=${run}><${Icon} n="file-import" s="20" />Importa</button>` : null}>
    ${!plan ? html`
      <ol class="ink2" style="padding-left:20px;display:grid;gap:10px;margin:0">
        <li>Scarica il modello e aprilo con Numbers o Excel.</li>
        <li>Scrivi un materiale per riga. Basta il nome; le altre colonne sono facoltative.</li>
        <li>Esporta come CSV e sceglilo qui. I materiali con lo stesso nome e marca vengono aggiornati, non duplicati.</li>
      </ol>
      <div class="btn-row" style="margin-top:18px">
        <button class="btn" onClick=${template}><${Icon} n="download" s="20" />Scarica il modello</button>
        <button class="btn primary" onClick=${pick}><${Icon} n="file-import" s="20" />Scegli il file CSV</button>
      </div>
      <p class="muted" style="font-size:14px;margin-top:14px">Colonne riconosciute: ${CSV_COLUMNS.join(', ')}. Categorie e fornitori che non esistono vengono creati.</p>`
    : html`
      <p class="ink2"><b>${name}</b>: ${plural(plan.create.length, 'nuovo materiale', 'nuovi materiali')}, ${plural(plan.update.length, 'da aggiornare', 'da aggiornare')}${plan.skip ? `, ${plural(plan.skip, 'riga senza nome ignorata', 'righe senza nome ignorate')}` : ''}.</p>
      <div class="group" style="margin-top:14px">
        ${[...plan.create.map((x) => ({ ...x, isNew: true })), ...plan.update].slice(0, 12).map((x, i) => html`<div class="row" key=${i}>
          <div class="row-main"><div class="row-title">${x.name}</div><div class="row-sub">${[x.brand, x.r.categoria, x.r.fornitore, x.r.quantita ? `quantità ${x.r.quantita}` : ''].filter(Boolean).join(', ')}</div></div>
          <span class=${`chip sm ${x.isNew ? 'st-ok' : 'neutral'}`}>${x.isNew ? 'Nuovo' : 'Aggiorna'}</span>
        </div>`)}
      </div>
      ${plan.create.length + plan.update.length > 12 && html`<p class="muted" style="margin-top:10px">e altre ${plan.create.length + plan.update.length - 12} righe.</p>`}`}
  </${Sheet}>`;
}

Object.assign(SHEETS, {
  supplierEdit: SupplierEditSheet, userEdit: UserEditSheet, pinSet: PinSetSheet, categoryEdit: CategoryEditSheet,
  scanCode: ScanCodeSheet, unknownCode: UnknownCodeSheet, inventory: InventorySheet, labels: LabelsSheet, csvImport: CsvImportSheet,
});
