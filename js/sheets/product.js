import { html, useState } from '../../vendor/preact-htm.js';
import {
  S, product, dp, category, supplier, stockMove, undoMove, saveProduct, deleteProduct,
  listAdd, listRemove, unlinkCode, linkCode, derived,
} from '../store.js';
import {
  SHEETS, Sheet, Icon, Thumb, CatBadge, Carpule, StatusChip, ExpChip, Segmented, Stepper, Field, Toggle, Bars, Empty,
  openSheet, closeSheet, toast, confirmDialog, haptic, fmtQty, fmtN, fmtEuro, fmtDate, fmtExp, relDay, unitFor, daysLabel,
  plural, readFile, photoToDataURL, navigate, NumberInput,
} from '../ui.js';
import { ActivityRow, searchUrl } from '../shared.js';
import { DAY, startOfDay, fefo, codeFor } from '../logic.js';
import { describeCode } from '../codes.js';

// ---------------- Scheda del materiale ----------------
function ProductSheet({ id, close }) {
  const p = product(id);
  if (!p) return html`<${Sheet} title="Materiale non trovato" close=${close}><${Empty} emoji="🤷" title="Questo materiale non c'è più" /></${Sheet}>`;
  const d = dp(id);
  const cat = category(p.catId);
  const sup = supplier(p.supplierId);
  const inList = S.orderList[p.id]?.manual || derived().groups.some((g) => g.items.some((it) => it.p.id === p.id));
  const moves = S.movements.filter((m) => m.productId === p.id).slice(-15).reverse();
  const weekStart = startOfDay(Date.now()) - ((new Date().getDay() + 6) % 7) * DAY;
  const weekLabels = d.weeks.map((_, i) => fmtDate(weekStart - (11 - i) * 7 * DAY, { day: 'numeric', month: 'short' }));
  const lots = fefo(p.lots || []);
  const today = startOfDay(Date.now());

  const toggleList = () => {
    if (inList) { listRemove(p.id); toast(`${p.name} tolto dalla lista degli ordini`); }
    else { listAdd(p.id, d.suggestPacks); haptic(); toast(`${p.name} aggiunto agli ordini`, { icon: 'shopping-cart' }); }
  };
  const discard = async (l) => {
    if (!await confirmDialog({ title: `Eliminare il lotto ${l.lot || ''}?`, text: `${fmtQty(l.qty, p.unit)} ${l.days < 0 ? 'scaduti' : 'in scadenza'} verranno tolti dal magazzino.`, ok: 'Elimina', danger: true })) return;
    const mv = stockMove(p.id, 'scarto', 0, { lotId: l.id });
    if (mv) toast('Lotto eliminato', { undo: () => undoMove(mv.id) });
  };
  const del = async () => {
    if (!await confirmDialog({ title: `Eliminare ${p.name}?`, text: 'La scheda sparisce dal magazzino. Lo storico delle attività resta.', ok: 'Elimina', danger: true })) return;
    deleteProduct(p.id);
    close();
    toast('Materiale eliminato');
  };

  const pack = p.packSize > 1 ? `${p.packLabel || 'confezione'} da ${p.packSize} ${p.unit}` : (p.packLabel || 'confezione');
  const sources = [
    sup && { s: sup, code: p.supplierCode, price: p.price, main: true },
    ...(p.alts || []).map((a) => ({ s: supplier(a.supplierId), code: a.code, price: a.price })).filter((x) => x.s),
  ].filter(Boolean);
  const best = sources.filter((x) => x.price != null).sort((a, b) => a.price - b.price)[0];

  return html`<${Sheet} title=${p.name} sub=${p.brand} close=${close} wide cls="tall"
    footer=${html`
      <button class="btn soft-danger" onClick=${del}><${Icon} n="trash" s="20" />Elimina</button>
      <span class="grow"></span>
      <button class="btn" onClick=${() => openSheet('productEdit', { id: p.id })}><${Icon} n="pencil" s="20" />Modifica scheda</button>`}>
    <div class="pd-head">
      <${Thumb} p=${p} size=${72} />
      <div class="row-main">
        <div class="row-sub" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <span>${cat ? `${cat.emoji} ${cat.name}` : 'Senza categoria'}</span>
          ${p.location && html`<span style="display:inline-flex;gap:4px;align-items:center"><${Icon} n="map-pin" s="16" />${p.location}</span>`}
        </div>
        <div class="prow-chips" style="margin-top:8px">
          <${StatusChip} status=${d.status} />
          <${ExpChip} d=${d} small=${false} />
          ${d.incoming > 0 && html`<span class="chip st-arrivo"><${Icon} n="truck" s="16" />In arrivo ${fmtQty(d.incoming, p.unit)}</span>`}
        </div>
      </div>
    </div>

    <div class="pd-level">
      <${Carpule} level=${d.level} minLevel=${d.minLevel} status=${d.status} big label=${`${fmtQty(d.qty, p.unit)} su una scorta ideale di ${d.target}`} />
      <div class="pd-qty">${fmtN(d.qty)}<small>${unitFor(p.unit, d.qty)}</small></div>
      <div class="pd-thr">${p.min ? html`La linea tratteggiata è la soglia: ${fmtQty(p.min, p.unit)}. Scorta ideale: ${fmtN(d.target)}.` : 'Nessuna soglia impostata: imposta una soglia minima per ricevere gli avvisi.'}</div>
    </div>

    <div class="pd-actions">
      <button class="btn primary" onClick=${() => openSheet('move', { id: p.id, mode: 'prendo' })}><${Icon} n="minus" s="24" sw="2.4" />Prendo</button>
      <button class="btn" onClick=${() => openSheet('move', { id: p.id, mode: 'carico' })}><${Icon} n="plus" s="24" sw="2.4" />Carico</button>
      <button class="btn" onClick=${() => openSheet('move', { id: p.id, mode: 'correggo' })}><${Icon} n="pencil" s="24" />Correggo</button>
      <button class="btn" onClick=${toggleList}><${Icon} n=${inList ? 'check' : 'shopping-cart'} s="24" />${inList ? 'Negli ordini' : 'Aggiungi agli ordini'}</button>
    </div>

    <div class="facts">
      <div class=${`fact ${d.status === 'ordinare' || d.status === 'esaurito' ? 'alert' : ''}`}>
        <span>Da ordinare entro</span>
        ${d.status === 'ordinare' || d.status === 'esaurito'
          ? html`<b>${d.incoming > 0 ? 'Già ordinato' : 'Adesso'}</b><small>${d.status === 'esaurito' ? 'È finito' : 'È sotto la soglia'}</small>`
          : d.orderBy != null
            ? html`<b>${d.orderBy <= today ? 'Adesso' : relDay(d.orderBy)}</b><small>${fmtDate(d.orderBy, { weekday: 'long', day: 'numeric', month: 'long' })}</small>`
            : html`<b>Quando scende a ${fmtN(p.min)}</b><small>La previsione arriva dopo qualche settimana di utilizzo</small>`}
      </div>
      <div class="fact">
        <span>Basta per</span>
        ${d.daysLeft != null
          ? html`<b>${d.daysLeft < 1 ? 'Meno di un giorno' : `Circa ${plural(Math.round(d.daysLeft), 'giorno', 'giorni')} di studio`}</b><small>Fino a ${fmtDate(d.runOut, { weekday: 'short', day: 'numeric', month: 'short' })}</small>`
          : html`<b>Non ancora stimabile</b><small>Servono almeno 2 settimane di prelievi</small>`}
      </div>
      <div class="fact">
        <span>Consumo medio</span>
        ${d.rate ? html`<b>${fmtN(d.rate < 1 ? Math.round(d.rate * 5 * 10) / 10 : Math.round(d.rate * 10) / 10)} ${unitFor(p.unit, 2)} ${d.rate < 1 ? 'a settimana' : 'al giorno'}</b><small>${fmtQty(d.used90, p.unit)} negli ultimi 90 giorni</small>` : html`<b>–</b><small>${fmtQty(d.used90, p.unit)} presi finora</small>`}
      </div>
      <div class="fact">
        <span>Da chi si ordina</span>
        ${sup ? html`<b>${sup.name}</b><small>${pack}${p.price != null ? `, ${fmtEuro(p.price)}` : ''}</small>` : html`<b>Nessun fornitore</b><small>Aggiungilo modificando la scheda</small>`}
      </div>
      <div class="fact">
        <span>Tempo di consegna</span>
        <b>${plural(d.lead, 'giorno', 'giorni')}</b><small>${p.leadDays != null ? 'Impostato per questo materiale' : sup ? `Come ${sup.name}` : 'Valore predefinito'}</small>
      </div>
    </div>

    ${d.suggestedMin && html`<div class="suggest">
      <${Icon} n="sparkles" s="22" />
      <p>Dai prelievi degli ultimi mesi, una soglia di <b>${fmtN(d.suggestedMin)}</b> basterebbe a coprire la consegna con margine (ora è ${fmtN(p.min)}).</p>
      <button class="btn small" onClick=${() => { saveProduct({ id: p.id, min: d.suggestedMin, max: p.max && p.max <= d.suggestedMin ? null : p.max }); toast('Soglia aggiornata'); }}>Usa ${fmtN(d.suggestedMin)}</button>
    </div>`}

    <div class="card" style="margin-top:16px">
      <div class="card-title">Prelievi nelle ultime 12 settimane</div>
      <${Bars} values=${d.weeks} labels=${weekLabels} titles=${weekLabels.map((l) => `nella settimana del ${l}`)} fmt=${(v) => fmtQty(v, p.unit)} />
    </div>

    ${(p.trackExpiry || lots.length > 0) && html`<div class="card">
      <div class="card-title">Lotti e scadenze</div>
      ${lots.length
        ? html`<div>${lots.map((l) => {
            const days = l.exp ? Math.round((startOfDay(Date.parse(l.exp + 'T12:00')) - today) / DAY) : null;
            const tone = days == null ? '' : days < 0 ? 'warn-text' : days <= S.settings.warnDays ? 'warn-text' : '';
            return html`<div class="row" style="padding-left:0;padding-right:0" key=${l.id}>
              <div class="row-main">
                <div class="row-title">${l.lot ? `Lotto ${l.lot}` : 'Lotto non indicato'}</div>
                <div class=${`row-sub ${tone}`}>${l.exp ? `Scade il ${fmtExp(l.exp)}, ${daysLabel(days)}` : 'Senza data di scadenza'}</div>
              </div>
              <span class="tnum" style="font-weight:650">${fmtQty(l.qty, p.unit)}</span>
              ${days != null && days <= S.settings.warnDays && html`<button class="btn small soft-danger" onClick=${() => discard({ ...l, days })}>Elimina</button>`}
            </div>`;
          })}
          ${(p.qty - lots.reduce((s, l) => s + l.qty, 0)) > 0 && html`<p class="muted" style="font-size:14px;margin-top:8px">${fmtQty(p.qty - lots.reduce((s, l) => s + l.qty, 0), p.unit)} senza lotto registrato.</p>`}
          <p class="muted" style="font-size:14px;margin-top:6px">Quando prendi un materiale scalo prima dal lotto che scade prima.</p></div>`
        : html`<p class="ink2" style="font-size:15px">Nessun lotto registrato. Quando carichi la merce, inserisci lotto e scadenza (o inquadra il DataMatrix sulla confezione).</p>`}
    </div>`}

    <div class="card">
      <div class="card-title">Fornitori e prezzi</div>
      ${sources.length
        ? sources.map((x) => html`<div class="row" style="padding-left:0;padding-right:0" key=${x.s.id}>
            <div class="row-main">
              <div class="row-title">${x.s.name}${x.main ? html` <span class="chip sm neutral">Principale</span>` : ''}${best && best.s.id === x.s.id && sources.length > 1 ? html` <span class="chip sm st-ok">Il più economico</span>` : ''}</div>
              <div class="row-sub">${x.code ? `Codice ${x.code}` : 'Codice articolo non indicato'}</div>
            </div>
            <span class="tnum" style="font-weight:650">${x.price != null ? fmtEuro(x.price) : '–'}</span>
            ${searchUrl(x.s, `${p.name} ${p.brand || ''}`.trim()) && html`<a class="btn small ghost" href=${searchUrl(x.s, x.code || `${p.name} ${p.brand || ''}`.trim())} target="_blank" rel="noopener"><${Icon} n="search" s="18" />Cerca sul sito</a>`}
          </div>`)
        : html`<p class="ink2" style="font-size:15px">Nessun fornitore indicato.</p>`}
    </div>

    <div class="card">
      <div class="card-title"><span class="grow">Codici della confezione</span>
        <button class="btn small ghost" onClick=${() => openSheet('labels', { preselect: [p.id] })}><${Icon} n="qrcode" s="18" />Etichetta QR</button>
        <button class="btn small" onClick=${() => openSheet('scanCode', { title: 'Collega un codice', onCode: (c) => { if (!c.key) { toast('Questo codice contiene solo lotto e scadenza. Inquadra il codice del prodotto.'); return false; } linkCode(p.id, c.key); toast('Codice collegato'); return true; } })}><${Icon} n="barcode" s="18" />Collega</button>
      </div>
      ${(p.codes || []).length
        ? html`<div style="display:flex;gap:8px;flex-wrap:wrap">${p.codes.map((k) => html`<span class="code-pill" key=${k} style="display:inline-flex;gap:6px;align-items:center">${k.replace(/^(gtin|raw|hibc|id):/, '')}<button class="icon-btn plain" style="width:22px;height:22px" aria-label="Scollega codice" onClick=${() => unlinkCode(p.id, k)}><${Icon} n="x" s="14" /></button></span>`)}</div>`
        : html`<p class="ink2" style="font-size:15px">Collega il codice a barre della confezione: la prossima volta basterà inquadrarlo per riconoscere il materiale.</p>`}
    </div>

    ${p.note && html`<div class="card"><div class="card-title">Note</div><p style="white-space:pre-wrap">${p.note}</p></div>`}

    <div class="section" style="margin-top:20px">
      <div class="section-head"><h2>Ultimi movimenti</h2></div>
      ${moves.length ? html`<div class="group timeline">${moves.map((m) => html`<${ActivityRow} key=${m.id} m=${{ ...m, productId: null }} />`)}</div>` : html`<p class="muted">Nessun movimento.</p>`}
    </div>
  </${Sheet}>`;
}

// ---------------- Prendo / Carico / Correggo ----------------
function MoveSheet({ id, mode: initial = 'prendo', lot = '', exp = '', close }) {
  const p = product(id);
  const [mode, setMode] = useState(initial);
  const [n, setN] = useState(initial === 'correggo' ? p?.qty ?? 0 : initial === 'carico' ? p?.packSize || 1 : 1);
  const [lotV, setLot] = useState(lot || '');
  const [expV, setExp] = useState(exp || '');
  const [note, setNote] = useState('');
  const [showLot, setShowLot] = useState(!!(lot || exp || p?.trackExpiry));
  if (!p) return null;
  const d = dp(id);
  const change = (m) => { setMode(m); setN(m === 'correggo' ? p.qty : m === 'carico' ? p.packSize || 1 : 1); };
  const firstLot = fefo(p.lots || [])[0];
  const after = mode === 'prendo' ? Math.max(0, p.qty - n) : mode === 'carico' ? p.qty + n : n;
  const quick = mode === 'prendo'
    ? [1, 2, 3, 5, 10].map((x) => ({ v: x, l: String(x) })).concat(p.packSize > 1 ? [{ v: p.packSize, l: `1 ${p.packLabel || 'confezione'} (${p.packSize})` }] : [])
    : mode === 'carico'
      ? (p.packSize > 1 ? [1, 2, 3, 5].map((k) => ({ v: k * p.packSize, l: `${k} ${k === 1 ? (p.packLabel || 'conf.') : 'conf.'} (${k * p.packSize})` })) : [1, 2, 5, 10, 20].map((x) => ({ v: x, l: String(x) })))
      : [];

  const confirm = () => {
    if (mode !== 'correggo' && !(n > 0)) return;
    let mv;
    if (mode === 'prendo') mv = stockMove(p.id, 'scarico', n, { note });
    else if (mode === 'carico') mv = stockMove(p.id, 'carico', n, { lot: showLot ? lotV.trim() : '', exp: showLot ? expV : '', note });
    else mv = stockMove(p.id, 'rettifica', n, { note });
    close();
    haptic();
    if (!mv && mode === 'correggo') { toast('La quantità era già corretta'); return; }
    if (!mv) { toast(`Non risultano ${p.unit} da prendere. Correggi la quantità se serve.`, { icon: 'alert-circle' }); return; }
    const txt = mode === 'prendo' ? `Preso ${fmtQty(-mv.qty, p.unit)}: ${p.name}` : mode === 'carico' ? `Caricato ${fmtQty(mv.qty, p.unit)}: ${p.name}` : `${p.name}: ora sono ${fmtQty(p.qty, p.unit)}`;
    toast(txt, { undo: () => undoMove(mv.id), icon: mode === 'prendo' ? 'minus' : mode === 'carico' ? 'plus' : 'pencil' });
  };

  const label = mode === 'prendo' ? `Prendi ${fmtQty(Math.min(n, p.qty) || n, p.unit)}` : mode === 'carico' ? `Carica ${fmtQty(n, p.unit)}` : `Imposta a ${fmtQty(n, p.unit)}`;

  return html`<${Sheet} title=${p.name} sub=${`Adesso: ${fmtQty(p.qty, p.unit)}`} close=${close}
    footer=${html`<span class="grow"></span>
      <button class="btn primary big" onClick=${confirm} disabled=${mode !== 'correggo' && !(n > 0)}>${label}</button>`}>
    <${Segmented} cls="full" value=${mode} onChange=${change} options=${[
      { v: 'prendo', l: 'Prendo', icon: 'minus' },
      { v: 'carico', l: 'Carico', icon: 'plus' },
      { v: 'correggo', l: 'Correggo', icon: 'pencil' },
    ]} />
    <div style="margin:22px 0 10px;text-align:center">
      ${mode === 'correggo' && html`<p class="ink2" style="margin-bottom:10px">Quanti ce ne sono adesso, contandoli?</p>`}
      <${Stepper} big value=${n} onChange=${setN} min=${0} unit=${unitFor(p.unit, n)} />
    </div>
    ${quick.length > 0 && html`<div class="quick">${quick.map((q) => html`<button type="button" onClick=${() => { haptic(); setN(q.v); }}>${q.l}</button>`)}</div>`}
    <div style="margin:18px auto 0;max-width:420px">
      <${Carpule} level=${Math.min(1, after / Math.max(d.target, after, 1))} minLevel=${d.minLevel} status=${after <= 0 ? 'esaurito' : after <= p.min ? 'ordinare' : 'ok'} big />
      <p class="center muted" style="font-size:14.5px;margin-top:6px">Dopo: ${fmtQty(after, p.unit)}${p.min && after <= p.min && mode !== 'carico' ? ', sotto la soglia: comparirà negli ordini' : ''}</p>
    </div>
    ${mode === 'prendo' && n > p.qty && html`<p class="center warn-text" style="margin-top:8px">Ne risultano solo ${fmtQty(p.qty, p.unit)}. Se il numero è sbagliato usa «Correggo».</p>`}
    ${mode === 'prendo' && firstLot?.lot && html`<p class="center muted" style="font-size:14px;margin-top:8px">Scalo dal lotto ${firstLot.lot}${firstLot.exp ? `, che scade il ${fmtExp(firstLot.exp)}` : ''}.</p>`}
    ${mode === 'carico' && html`<div style="margin-top:18px">
      ${showLot
        ? html`<div class="form-grid three" style="align-items:end">
            <${Field} label="Lotto"><input class="input" value=${lotV} onInput=${(e) => setLot(e.target.value)} placeholder="Es. A1234" autocapitalize="characters" /></${Field}>
            <${Field} label="Scadenza"><input class="input" type="date" value=${expV} onInput=${(e) => setExp(e.target.value)} /></${Field}>
            <button type="button" class="btn ghost" onClick=${() => openSheet('scanCode', { title: 'Leggi lotto e scadenza', onCode: (c) => { if (c.lot) setLot(c.lot); if (c.exp) setExp(c.exp); if (!c.lot && !c.exp) { toast('In questo codice non ci sono lotto o scadenza.'); return false; } return true; } })}><${Icon} n="barcode" s="20" />Dal codice</button>
          </div>`
        : html`<button type="button" class="link-btn" onClick=${() => setShowLot(true)}><${Icon} n="calendar-due" s="18" />Aggiungi lotto e scadenza</button>`}
    </div>`}
    <div style="margin-top:14px">
      <${Field} label="Nota (facoltativa)"><input class="input" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder=${mode === 'prendo' ? 'Es. per la chirurgia delle 11' : 'Es. campioni omaggio'} /></${Field}>
    </div>
  </${Sheet}>`;
}

// ---------------- Nuovo / modifica materiale ----------------
const UNITS = ['pz', 'carpule', 'siringhe', 'flaconi', 'scatole', 'buste', 'confezioni', 'cartucce', 'lime', 'frese', 'coni', 'aghi', 'fogli', 'rotoli', 'tubetti', 'paia', 'kit'];
const PACKS = ['confezione', 'scatola', 'cartone', 'blister', 'flacone', 'pezzo', 'busta', 'kit'];

function ProductEditSheet({ id, code, name: preName, close }) {
  const existing = id ? product(id) : null;
  const [f, setF] = useState(() => existing
    ? { ...existing, alts: (existing.alts || []).map((a) => ({ ...a })), codes: [...(existing.codes || [])] }
    : {
      name: preName || '', brand: '', catId: S.categories[0]?.id || null, unit: 'pz', packSize: 1, packLabel: 'confezione', qty: 0, min: null, max: null,
      location: '', supplierId: null, supplierCode: '', price: null, alts: [], codes: code?.key ? [code.key] : [],
      trackExpiry: !!(code?.exp || code?.lot), leadDays: null, note: '', photo: null, firstLot: code?.lot || '', firstExp: code?.exp || '',
    });
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const cat = category(f.catId);
  const locations = [...new Set(S.products.map((p) => p.location).filter(Boolean))].sort();
  const sup = supplier(f.supplierId);
  const valid = f.name.trim().length > 0;

  const takePhoto = async () => {
    const file = await readFile('image/*');
    if (!file) return;
    try { set({ photo: await photoToDataURL(file) }); } catch { toast('Non riesco a leggere la foto.'); }
  };
  const save = () => {
    if (!valid) return;
    const data = { ...f, name: f.name.trim(), brand: (f.brand || '').trim(), min: f.min || 0, packSize: Math.max(1, f.packSize || 1), alts: f.alts.filter((a) => a.supplierId) };
    const saved = saveProduct(data);
    close();
    toast(existing ? 'Scheda salvata' : `${saved.name} aggiunto al magazzino`, { icon: 'circle-check' });
  };

  return html`<${Sheet} title=${existing ? 'Modifica materiale' : 'Nuovo materiale'} close=${close} wide cls="tall"
    footer=${html`<span class="grow"></span><button class="btn ghost" onClick=${close}>Annulla</button><button class="btn primary" disabled=${!valid} onClick=${save}><${Icon} n="check" s="20" />Salva</button>`}>
    <div class="form">
      <div style="display:flex;gap:14px;align-items:center">
        <button type="button" onClick=${takePhoto} style="border:0;background:none;padding:0;position:relative" aria-label="Foto del materiale">
          ${f.photo ? html`<img class="thumb" src=${f.photo} style="width:84px;height:84px" alt="" />` : html`<span class="cat-badge cat-stone" style="width:84px;height:84px;display:grid;place-items:center;color:var(--ink-3)"><${Icon} n="camera" s="30" /></span>`}
        </button>
        <div style="flex:1;display:grid;gap:8px">
          <input class="input" value=${f.name} onInput=${(e) => set({ name: e.target.value })} placeholder="Nome, es. Articaina 4% 1:100.000" aria-label="Nome" style="font-weight:650" />
          <input class="input" value=${f.brand} onInput=${(e) => set({ brand: e.target.value })} placeholder="Marca o prodotto, es. Septanest" aria-label="Marca" />
        </div>
      </div>
      ${f.photo && html`<button type="button" class="link-btn" onClick=${() => set({ photo: null })}><${Icon} n="trash" s="16" />Togli la foto</button>`}

      <${Field} label="Categoria">
        <div class="pick-grid">${S.categories.map((c) => html`<button type="button" class=${`pick ${f.catId === c.id ? 'on' : ''}`} onClick=${() => set({ catId: c.id })}><span class="em">${c.emoji}</span>${c.name}</button>`)}</div>
      </${Field}>

      <div class="form-grid">
        ${!existing && html`<${Field} label="Quantità che avete adesso"><${NumberInput} value=${f.qty} onInput=${(v) => set({ qty: v ?? 0 })} /></${Field}>`}
        <${Field} label="Si conta in" hint="L'unità che prendete dall'armadio.">
          <input class="input" list="units" value=${f.unit} onInput=${(e) => set({ unit: e.target.value })} />
          <datalist id="units">${UNITS.map((x) => html`<option value=${x} />`)}</datalist>
        </${Field}>
        <${Field} label="Soglia minima" hint="Quando ne restano così pochi, compare in «Da ordinare».">
          <${NumberInput} value=${f.min} onInput=${(v) => set({ min: v })} placeholder="Es. 50" />
        </${Field}>
        <${Field} label="Scorta ideale" hint="Quanti averne dopo un ordine. Se vuoto, il doppio della soglia.">
          <${NumberInput} value=${f.max} onInput=${(v) => set({ max: v })} placeholder="Es. 150" />
        </${Field}>
      </div>

      <${Field} label="Si compra a" hint=${`Serve a calcolare quante confezioni ordinare. Esempio: scatola da 50 ${f.unit}.`}>
        <div class="input-group">
          <input class="input" list="packs" value=${f.packLabel} onInput=${(e) => set({ packLabel: e.target.value })} style="max-width:200px" />
          <datalist id="packs">${PACKS.map((x) => html`<option value=${x} />`)}</datalist>
          <span class="input-suffix">da</span>
          <${NumberInput} value=${f.packSize} onInput=${(v) => set({ packSize: v })} inputmode="numeric" />
          <span class="input-suffix">${f.unit || 'pz'}</span>
        </div>
      </${Field}>

      <${Field} label="Dove si trova">
        <input class="input" list="locs" value=${f.location} onInput=${(e) => set({ location: e.target.value })} placeholder="Es. Magazzino › Armadio A" />
        <datalist id="locs">${locations.map((x) => html`<option value=${x} />`)}</datalist>
      </${Field}>

      <div class="hr"></div>
      <div class="form-grid three">
        <${Field} label="Fornitore principale">
          <select class="input" value=${f.supplierId || ''} onChange=${(e) => {
            if (e.target.value === '__new') { e.target.value = f.supplierId || ''; openSheet('supplierEdit', { onSaved: (s) => set({ supplierId: s.id }) }); return; }
            set({ supplierId: e.target.value || null });
          }}>
            <option value="">Nessuno</option>
            ${[...S.suppliers].sort((a, b) => a.name.localeCompare(b.name, 'it')).map((s) => html`<option value=${s.id}>${s.name}</option>`)}
            <option value="__new">+ Nuovo fornitore…</option>
          </select>
        </${Field}>
        <${Field} label="Codice articolo"><input class="input" value=${f.supplierCode} onInput=${(e) => set({ supplierCode: e.target.value })} placeholder="Facoltativo" /></${Field}>
        <${Field} label=${`Prezzo per ${f.packLabel || 'confezione'}`}><div class="input-group"><${NumberInput} value=${f.price} onInput=${(v) => set({ price: v })} placeholder="0,00" /><span class="input-suffix">€</span></div></${Field}>
      </div>
      ${f.alts.map((a, i) => html`<div class="form-grid three" key=${i} style="align-items:end">
        <${Field} label=${`Alternativa ${i + 1}`}>
          <select class="input" value=${a.supplierId || ''} onChange=${(e) => {
            const setAlt = (sid) => setF((x) => ({ ...x, alts: x.alts.map((y, j) => (j === i ? { ...y, supplierId: sid } : y)) }));
            if (e.target.value === '__new') { e.target.value = a.supplierId || ''; openSheet('supplierEdit', { onSaved: (s) => setAlt(s.id) }); return; }
            setAlt(e.target.value);
          }}>
            <option value="">Scegli…</option>
            ${S.suppliers.filter((s) => s.id !== f.supplierId).sort((x, y) => x.name.localeCompare(y.name, 'it')).map((s) => html`<option value=${s.id}>${s.name}</option>`)}
            <option value="__new">+ Nuovo fornitore…</option>
          </select>
        </${Field}>
        <${Field} label="Codice"><input class="input" value=${a.code || ''} onInput=${(e) => set({ alts: f.alts.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)) })} /></${Field}>
        <div class="input-group">
          <${NumberInput} value=${a.price} onInput=${(v) => set({ alts: f.alts.map((x, j) => (j === i ? { ...x, price: v } : x)) })} placeholder="Prezzo" />
          <button type="button" class="icon-btn" aria-label="Togli alternativa" onClick=${() => set({ alts: f.alts.filter((_, j) => j !== i) })}><${Icon} n="trash" s="18" /></button>
        </div>
      </div>`)}
      <button type="button" class="link-btn" onClick=${() => set({ alts: [...f.alts, { supplierId: '', code: '', price: null }] })}><${Icon} n="plus" s="18" />Aggiungi un fornitore alternativo, per confrontare i prezzi</button>

      <div class="form-grid">
        <${Field} label="Tempo di consegna" hint=${sup ? `Se vuoto: ${plural(sup.leadDays ?? S.settings.defaultLeadDays, 'giorno', 'giorni')}, come ${sup.name}.` : 'Se vuoto, usa il valore del fornitore.'}>
          <div class="input-group"><${NumberInput} value=${f.leadDays} onInput=${(v) => set({ leadDays: v })} inputmode="numeric" /><span class="input-suffix">giorni</span></div>
        </${Field}>
      </div>

      <div class="card" style="box-shadow:none;border:1px solid var(--line)">
        <${Toggle} checked=${f.trackExpiry} onChange=${(v) => set({ trackExpiry: v })} label="Controlla lotti e scadenze" hint="Per anestetici, compositi, adesivi, materiali da impronta, impianti…" />
        ${!existing && f.trackExpiry && (f.qty || 0) > 0 && html`<div class="form-grid" style="margin-top:10px">
          <${Field} label="Lotto attuale"><input class="input" value=${f.firstLot} onInput=${(e) => set({ firstLot: e.target.value })} /></${Field}>
          <${Field} label="Scadenza"><input class="input" type="date" value=${f.firstExp} onInput=${(e) => set({ firstExp: e.target.value })} /></${Field}>
        </div>`}
      </div>

      <${Field} label="Codici della confezione" hint="Inquadra il codice a barre o il DataMatrix: dopo basterà scansionarlo per trovare il materiale.">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${f.codes.map((k) => html`<span class="code-pill" key=${k} style="display:inline-flex;gap:6px;align-items:center">${k.replace(/^(gtin|raw|hibc|id):/, '')}<button type="button" class="icon-btn plain" style="width:22px;height:22px" aria-label="Togli codice" onClick=${() => set({ codes: f.codes.filter((x) => x !== k) })}><${Icon} n="x" s="14" /></button></span>`)}
          <button type="button" class="btn small" onClick=${() => openSheet('scanCode', { title: 'Inquadra il codice', onCode: (c) => {
            if (!c.key) { toast('Questo codice ha solo lotto e scadenza: inquadra quello del prodotto.'); return false; }
            setF((x) => ({ ...x, codes: [...new Set([...x.codes, c.key])], firstLot: x.firstLot || c.lot || '', firstExp: x.firstExp || c.exp || '', trackExpiry: x.trackExpiry || !!c.exp }));
            return true;
          } })}><${Icon} n="barcode" s="18" />Scansiona un codice</button>
        </div>
      </${Field}>

      <${Field} label="Note"><textarea class="input" value=${f.note} onInput=${(e) => set({ note: e.target.value })} placeholder="Es. usare prima quelli nel cassetto di sinistra"></textarea></${Field}>
    </div>
  </${Sheet}>`;
}

Object.assign(SHEETS, { product: ProductSheet, move: MoveSheet, productEdit: ProductEditSheet });
