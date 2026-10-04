import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import {
  S, me, isAdmin, user, setSettings, logout, exportBackup, markBackup, importBackup, exportCSV, loadDemo, removeDemo, resetAll,
  APP_VERSION, db,
} from '../store.js';
import {
  Icon, Avatar, CatBadge, Toggle, Field, openSheet, toast, confirmDialog, shareOrDownload, readFile, plural, fmtDate,
} from '../ui.js';
import { MeMini } from '../shared.js';
import { isoDate } from '../logic.js';

const DAYS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Gio'], [5, 'Ven'], [6, 'Sab'], [0, 'Dom']];

export function Impostazioni() {
  const u = me();
  const admin = isAdmin();
  const st = S.settings;
  const [space, setSpace] = useState(null);
  useEffect(() => { db.estimate?.().then(setSpace); }, []);

  const doBackup = async () => {
    const data = JSON.stringify(exportBackup());
    const ok = await shareOrDownload(`magazzino-backup-${isoDate(Date.now())}.json`, data, 'application/json');
    if (ok) { markBackup(); toast('Backup pronto. Salvalo su iCloud Drive o invialo via email.', { icon: 'circle-check' }); }
  };
  const doRestore = async () => {
    const f = await readFile('application/json,.json');
    if (!f) return;
    let obj;
    try { obj = JSON.parse(await f.text()); } catch { toast('Il file non è leggibile.', { tone: 'err' }); return; }
    const n = obj?.data?.products?.length ?? 0;
    const ok = await confirmDialog({ title: 'Ripristinare il backup?', text: `Il backup contiene ${plural(n, 'materiale', 'materiali')} ed è del ${obj?.exportedAt ? fmtDate(Date.parse(obj.exportedAt), { day: 'numeric', month: 'long', year: 'numeric' }) : 'giorno sconosciuto'}. Tutti i dati attuali su questo iPad verranno sostituiti.`, ok: 'Ripristina', danger: true });
    if (!ok) return;
    try { await importBackup(obj); toast('Backup ripristinato.', { icon: 'circle-check' }); } catch (e) { toast(e.message, { tone: 'err' }); }
  };
  const doCSV = () => shareOrDownload(`magazzino-${isoDate(Date.now())}.csv`, exportCSV(), 'text/csv');
  const doBadge = async (on) => {
    if (on && 'Notification' in window && Notification.permission !== 'granted') {
      try { await Notification.requestPermission(); } catch { /* non supportato */ }
    }
    setSettings({ badge: on });
    if (on && !('setAppBadge' in navigator)) toast("Il numero sull'icona funziona solo con l'app aggiunta alla schermata Home (iPadOS 16.4 o successivo).", { ms: 6000 });
  };

  const backupInfo = st.lastBackup ? `Ultimo backup ${fmtDate(st.lastBackup, { day: 'numeric', month: 'long' })}` : 'Nessun backup ancora';

  return html`<div class="page">
    <header class="page-head">
      <div class="grow"><h1>Impostazioni</h1><p class="sub">${st.studioName}</p></div>
      <${MeMini} />
    </header>

    <div class="group">
      <div class="row has-lead">
        <${Avatar} u=${u} size=${48} />
        <div class="row-main"><div class="row-title">${u?.name}</div><div class="row-sub">${u?.role === 'admin' ? 'Dottore, può modificare tutto' : 'Assistente'}</div></div>
        <button class="btn small ghost" onClick=${() => openSheet('pinSet', { userId: u.id })}><${Icon} n="lock" s="18" />${u?.pin ? 'Cambia PIN' : 'Imposta PIN'}</button>
        <button class="btn small" onClick=${logout}><${Icon} n="switch-horizontal" s="18" />Cambia utente</button>
      </div>
    </div>

    ${admin && html`
      <div class="group-title" style="margin-top:22px">Studio</div>
      <div class="card form">
        <${Field} label="Nome dello studio" hint="Compare nel testo degli ordini.">
          <input class="input" value=${st.studioName} onChange=${(e) => setSettings({ studioName: e.target.value.trim() })} />
        </${Field}>
        <${Field} label="Indirizzo di consegna" hint="Facoltativo: viene aggiunto in fondo agli ordini.">
          <input class="input" value=${st.address} placeholder="Via…, Patti (ME)" onChange=${(e) => setSettings({ address: e.target.value.trim() })} />
        </${Field}>
      </div>

      <div class="group-title" style="margin-top:22px">Persone</div>
      <div class="group">
        ${S.users.map((x) => html`<button class="row has-lead" key=${x.id} onClick=${() => openSheet('userEdit', { id: x.id })}>
          <${Avatar} u=${x} size=${40} />
          <div class="row-main"><div class="row-title">${x.name}</div><div class="row-sub">${x.role === 'admin' ? 'Dottore' : 'Assistente'}${x.pin ? ', con PIN' : ''}</div></div>
          <${Icon} n="chevron-right" s="18" cls="chev" />
        </button>`)}
        <button class="row" onClick=${() => openSheet('userEdit', {})}><span class="link-btn"><${Icon} n="user-plus" s="20" />Aggiungi una persona</span></button>
      </div>

      <div class="group-title" style="margin-top:22px">Categorie e chi le ordina</div>
      <div class="group">
        ${[...S.categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((c) => {
          const r = user(c.respId);
          return html`<button class="row has-lead" key=${c.id} onClick=${() => openSheet('categoryEdit', { id: c.id })}>
            <${CatBadge} cat=${c} size=${40} />
            <div class="row-main"><div class="row-title">${c.name}</div><div class="row-sub">${plural(S.products.filter((p) => p.catId === c.id).length, 'materiale', 'materiali')}</div></div>
            <span class="row-end">${r ? html`<${Avatar} u=${r} size=${28} /><span class="ink2" style="font-size:15px">${r.name}</span>` : html`<span style="font-size:15px">Nessun responsabile</span>`}<${Icon} n="chevron-right" s="18" cls="chev" /></span>
          </button>`;
        })}
        <button class="row" onClick=${() => openSheet('categoryEdit', {})}><span class="link-btn"><${Icon} n="plus" s="20" />Nuova categoria</span></button>
      </div>

      <div class="group-title" style="margin-top:22px">Avvisi e previsioni</div>
      <div class="card form">
        <div class="form-grid">
          <${Field} label="Avvisami delle scadenze" hint="Quanto prima della data di scadenza di un lotto.">
            <select class="input" value=${st.warnDays} onChange=${(e) => setSettings({ warnDays: +e.target.value })}>
              ${[30, 45, 60, 90, 120].map((n) => html`<option value=${n}>${n} giorni prima</option>`)}
            </select>
          </${Field}>
          <${Field} label="«In esaurimento» quando" hint="Rispetto alla soglia minima di ogni materiale.">
            <select class="input" value=${st.lowPct} onChange=${(e) => setSettings({ lowPct: +e.target.value })}>
              <option value="125">sotto il 125% della soglia</option>
              <option value="150">sotto il 150% della soglia</option>
              <option value="200">sotto il doppio della soglia</option>
            </select>
          </${Field}>
          <${Field} label="Tempo di consegna predefinito" hint="Usato se il fornitore non ne ha uno.">
            <div class="input-group"><input class="input num" inputmode="numeric" value=${st.defaultLeadDays} onChange=${(e) => setSettings({ defaultLeadDays: Math.max(0, parseInt(e.target.value, 10) || 0) })} /><span class="input-suffix">giorni</span></div>
          </${Field}>
          <${Field} label="Margine di sicurezza" hint="Giorni di anticipo in più quando calcolo «ordina entro».">
            <div class="input-group"><input class="input num" inputmode="numeric" value=${st.safetyDays} onChange=${(e) => setSettings({ safetyDays: Math.max(0, parseInt(e.target.value, 10) || 0) })} /><span class="input-suffix">giorni</span></div>
          </${Field}>
        </div>
        <${Field} label="Giorni di apertura dello studio" hint="Servono a stimare quanto dura un materiale.">
          <div class="pick-grid">
            ${DAYS.map(([d, l]) => { const on = st.workDays.includes(d); return html`<button type="button" class=${`pick ${on ? 'on' : ''}`} onClick=${() => setSettings({ workDays: on ? st.workDays.filter((x) => x !== d) : [...st.workDays, d] })}>${l}</button>`; })}
          </div>
        </${Field}>
        <${Field} label="Torna a «Chi sei?» dopo" hint="Sull'iPad condiviso evita di registrare a nome di un altro.">
          <select class="input" value=${st.lockMinutes} onChange=${(e) => setSettings({ lockMinutes: +e.target.value })}>
            <option value="2">2 minuti senza tocchi</option>
            <option value="5">5 minuti senza tocchi</option>
            <option value="10">10 minuti senza tocchi</option>
            <option value="30">30 minuti senza tocchi</option>
            <option value="0">Mai</option>
          </select>
        </${Field}>
      </div>
    `}

    <div class="group-title" style="margin-top:22px">Strumenti</div>
    <div class="group">
      <button class="row has-lead" onClick=${() => openSheet('inventory')}><span class="tile-ic" style="--t-soft:var(--accent-soft);--t-ink:var(--accent);width:40px;height:40px"><${Icon} n="clipboard-check" s="22" /></span><div class="row-main"><div class="row-title">Inventario guidato</div><div class="row-sub">Conta i materiali armadio per armadio e correggi le quantità</div></div><${Icon} n="chevron-right" s="18" cls="chev" /></button>
      <button class="row has-lead" onClick=${() => openSheet('labels')}><span class="tile-ic" style="--t-soft:var(--accent-soft);--t-ink:var(--accent);width:40px;height:40px"><${Icon} n="qrcode" s="22" /></span><div class="row-main"><div class="row-title">Stampa etichette QR</div><div class="row-sub">Per materiali senza codice a barre e per armadi e cassetti</div></div><${Icon} n="chevron-right" s="18" cls="chev" /></button>
      ${admin && html`<button class="row has-lead" onClick=${() => openSheet('csvImport')}><span class="tile-ic" style="--t-soft:var(--accent-soft);--t-ink:var(--accent);width:40px;height:40px"><${Icon} n="file-import" s="22" /></span><div class="row-main"><div class="row-title">Importa materiali da Excel o Numbers</div><div class="row-sub">Carica un file CSV con l'elenco dei materiali</div></div><${Icon} n="chevron-right" s="18" cls="chev" /></button>`}
      <button class="row has-lead" onClick=${doCSV}><span class="tile-ic" style="--t-soft:var(--accent-soft);--t-ink:var(--accent);width:40px;height:40px"><${Icon} n="file-spreadsheet" s="22" /></span><div class="row-main"><div class="row-title">Esporta il magazzino in CSV</div><div class="row-sub">Si apre con Numbers o Excel</div></div><${Icon} n="chevron-right" s="18" cls="chev" /></button>
    </div>

    <div class="group-title" style="margin-top:22px">Icona dell'app</div>
    <div class="card">
      <${Toggle} checked=${st.badge} onChange=${doBadge} label="Mostra sull'icona quanti materiali sono da ordinare" hint="Come il numero rosso delle app di Apple. Richiede il permesso per le notifiche." />
    </div>

    ${admin && html`
      <div class="group-title" style="margin-top:22px">Backup</div>
      <div class="card">
        <p class="ink2" style="font-size:15.5px">I dati restano su questo iPad. Fai un backup ogni settimana e salvalo su iCloud Drive: se cambi iPad o cancelli i dati di Safari, lo ripristini da qui.</p>
        <div class="btn-row" style="margin-top:14px">
          <button class="btn primary" onClick=${doBackup}><${Icon} n="database-export" s="20" />Fai il backup</button>
          <button class="btn ghost" onClick=${doRestore}><${Icon} n="upload" s="20" />Ripristina da un backup</button>
        </div>
        <p class="muted" style="font-size:14px;margin-top:12px">${backupInfo}${space?.usage ? `. Spazio usato: ${(space.usage / 1048576).toFixed(1)} MB` : ''}.</p>
      </div>

      <div class="group-title" style="margin-top:22px">Dati di esempio</div>
      <div class="card">
        ${st.demo
          ? html`<p class="ink2" style="font-size:15.5px">Stai usando i materiali di esempio. Rimuovili quando vuoi iniziare a inserire i vostri: persone, categorie e fornitori restano.</p>
              <button class="btn soft-danger" style="margin-top:12px" onClick=${async () => { if (await confirmDialog({ title: 'Rimuovere i dati di esempio?', text: 'Spariranno i materiali, i movimenti e gli ordini di esempio. Quello che avete inserito voi resta.', ok: 'Rimuovi', danger: true })) { removeDemo(); toast('Dati di esempio rimossi.'); } }}><${Icon} n="trash" s="20" />Rimuovi i dati di esempio</button>`
          : html`<p class="ink2" style="font-size:15.5px">Carica una quarantina di materiali con 4 mesi di movimenti, per vedere come funziona l'app.</p>
              <button class="btn" style="margin-top:12px" onClick=${async () => { await loadDemo(); toast('Dati di esempio caricati.'); }}><${Icon} n="sparkles" s="20" />Carica i dati di esempio</button>`}
      </div>

      <div class="group-title" style="margin-top:22px">Ricomincia da capo</div>
      <div class="card">
        <p class="ink2" style="font-size:15.5px">Cancella tutto da questo iPad: materiali, ordini, persone e impostazioni. Fai prima un backup.</p>
        <button class="btn soft-danger" style="margin-top:12px" onClick=${async () => {
          if (!await confirmDialog({ title: 'Cancellare tutti i dati?', text: "Non si può annullare. L'app tornerà alla schermata di benvenuto.", ok: 'Cancella tutto', danger: true })) return;
          if (!await confirmDialog({ title: 'Sei sicuro?', text: 'Ultima conferma: tutti i dati di questo iPad verranno eliminati.', ok: 'Sì, cancella', danger: true })) return;
          await resetAll();
        }}><${Icon} n="trash" s="20" />Cancella tutti i dati</button>
      </div>
    `}
    ${!admin && html`<p class="muted" style="font-size:14.5px;margin-top:18px">Persone, categorie, backup e le altre impostazioni sono riservate ai dottori.</p>`}

    <p class="muted center" style="font-size:13.5px;margin-top:30px">Magazzino dello studio, versione ${APP_VERSION}. Funziona anche senza internet.</p>
  </div>`;
}
