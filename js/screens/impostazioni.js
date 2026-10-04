import { html, useState } from '../../vendor/preact-htm.js';
import {
  S, cloud, setSettings, exportBackup, markBackup, importBackup, exportCSV, loadDemo, removeDemo, resetAll, APP_VERSION,
} from '../store.js';
import {
  Icon, CatBadge, Toggle, Field, openSheet, toast, confirmDialog, shareOrDownload, readFile, plural, fmtDate, navigate, relTime,
} from '../ui.js';
import { SyncPill, syncInfo } from '../shared.js';
import { isoDate } from '../logic.js';

const DAYS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Gio'], [5, 'Ven'], [6, 'Sab'], [0, 'Dom']];

function ToolRow({ icon, title, sub, onClick }) {
  return html`<button class="row has-lead" onClick=${onClick}>
    <span class="tool-ic"><${Icon} n=${icon} s="22" /></span>
    <div class="row-main"><div class="row-title">${title}</div><div class="row-sub">${sub}</div></div>
    <${Icon} n="chevron-right" s="18" cls="chev" />
  </button>`;
}

export function Impostazioni() {
  const st = S.settings;
  const sync = syncInfo();
  const [busy, setBusy] = useState('');

  const doBackup = async () => {
    setBusy('backup');
    const data = JSON.stringify(await exportBackup());
    setBusy('');
    const ok = await shareOrDownload(`magazzino-backup-${isoDate(Date.now())}.json`, data, 'application/json');
    if (ok) { markBackup(); toast('Backup pronto. Salvalo su iCloud Drive o invialo via email.', { icon: 'circle-check' }); }
  };
  const doRestore = async () => {
    const f = await readFile('application/json,.json');
    if (!f) return;
    let obj;
    try { obj = JSON.parse(await f.text()); } catch { toast('Il file non è leggibile.', { tone: 'err' }); return; }
    const n = obj?.data?.products?.length ?? 0;
    const ok = await confirmDialog({ title: 'Ripristinare il backup?', text: `Il backup contiene ${plural(n, 'materiale', 'materiali')} ed è del ${obj?.exportedAt ? fmtDate(Date.parse(obj.exportedAt), { day: 'numeric', month: 'long', year: 'numeric' }) : 'giorno sconosciuto'}. I dati attuali verranno sostituiti su tutti i dispositivi.`, ok: 'Ripristina', danger: true });
    if (!ok) return;
    try { setBusy('restore'); await importBackup(obj); toast('Backup ripristinato.', { icon: 'circle-check' }); } catch (e) { toast(e.message, { tone: 'err' }); }
    setBusy('');
  };
  const doCSV = () => shareOrDownload(`magazzino-${isoDate(Date.now())}.csv`, exportCSV(), 'text/csv');
  const doBadge = async (on) => {
    if (on && 'Notification' in window && Notification.permission !== 'granted') {
      try { await Notification.requestPermission(); } catch { /* non supportato */ }
    }
    setSettings({ badge: on });
    if (on && !('setAppBadge' in navigator)) toast("Il numero sull'icona funziona solo con l'app aggiunta alla schermata Home (iPadOS 16.4 o successivo).", { ms: 6000 });
  };
  const signOut = async () => {
    if (!await confirmDialog({ title: 'Uscire da questo dispositivo?', text: 'I dati restano online. Per rientrare servono email e password dello studio.', ok: 'Esci' })) return;
    await cloud.signOutDevice();
  };

  return html`<div class="page">
    <header class="page-head">
      <div class="grow"><h1>Impostazioni</h1><p class="sub">${st.studioName}</p></div>
      <${SyncPill} />
    </header>

    <div class="group-title">Account e sincronizzazione</div>
    <div class="group">
      <div class="row has-lead">
        <span class=${`sync-dot sync-${sync.tone}`}><${Icon} n=${sync.icon} s="24" /></span>
        <div class="row-main">
          <div class="row-title">${sync.title}</div>
          <div class="row-sub">${sync.text}${cloud.C.lastServerAt ? `. Ultimo aggiornamento ${relTime(cloud.C.lastServerAt)}` : ''}</div>
        </div>
      </div>
      <div class="row has-lead">
        <span class="tool-ic"><${Icon} n="user" s="22" /></span>
        <div class="row-main"><div class="row-title">${S.account?.email || '—'}</div><div class="row-sub">Lo stesso account su tutti i dispositivi dello studio</div></div>
        <button class="btn small ghost" onClick=${signOut}><${Icon} n="logout" s="18" />Esci</button>
      </div>
    </div>

    <div class="group-title" style="margin-top:22px">Studio</div>
    <div class="card form">
      <div class="form-grid">
        <${Field} label="Nome dello studio" hint="Compare nel testo degli ordini.">
          <input class="input" value=${st.studioName} onChange=${(e) => setSettings({ studioName: e.target.value.trim() })} />
        </${Field}>
        <${Field} label="Firma negli ordini" hint="Facoltativa, es. Dott. Roberto Colombo">
          <input class="input" value=${st.signature || ''} onChange=${(e) => setSettings({ signature: e.target.value.trim() })} />
        </${Field}>
      </div>
      <${Field} label="Indirizzo di consegna" hint="Facoltativo: viene aggiunto in fondo agli ordini.">
        <input class="input" value=${st.address} placeholder="Via…, Patti (ME)" onChange=${(e) => setSettings({ address: e.target.value.trim() })} />
      </${Field}>
    </div>

    <div class="group-title" style="margin-top:22px">Fornitori</div>
    <div class="group">
      ${[...S.suppliers].sort((a, b) => a.name.localeCompare(b.name, 'it')).map((s) => html`<button class="row" key=${s.id} onClick=${() => openSheet('supplierEdit', { id: s.id })}>
        <div class="row-main"><div class="row-title">${s.name}</div><div class="row-sub">${plural(S.products.filter((p) => p.supplierId === s.id).length, 'materiale', 'materiali')}${s.leadDays ? `, consegna in ${plural(s.leadDays, 'giorno', 'giorni')}` : ''}</div></div>
        <span class="row-end"><span style="font-size:15px">Modifica</span><${Icon} n="chevron-right" s="18" cls="chev" /></span>
      </button>`)}
      <button class="row" onClick=${() => openSheet('supplierEdit', {})}><span class="link-btn"><${Icon} n="plus" s="20" />Aggiungi un fornitore</span></button>
    </div>

    <div class="group-title" style="margin-top:22px">Categorie</div>
    <div class="group">
      ${[...S.categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((c) => html`<button class="row has-lead" key=${c.id} onClick=${() => openSheet('categoryEdit', { id: c.id })}>
        <${CatBadge} cat=${c} size=${40} />
        <div class="row-main"><div class="row-title">${c.name}</div><div class="row-sub">${plural(S.products.filter((p) => p.catId === c.id).length, 'materiale', 'materiali')}</div></div>
        <${Icon} n="chevron-right" s="18" cls="chev" />
      </button>`)}
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
    </div>

    <div class="group-title" style="margin-top:22px">Strumenti</div>
    <div class="group">
      <${ToolRow} icon="clipboard-check" title="Inventario guidato" sub="Conta i materiali armadio per armadio e correggi le quantità" onClick=${() => openSheet('inventory')} />
      <${ToolRow} icon="qrcode" title="Stampa etichette QR" sub="Per materiali senza codice a barre e per armadi e cassetti" onClick=${() => openSheet('labels')} />
      <${ToolRow} icon="file-import" title="Importa materiali da Excel o Numbers" sub="Carica un file CSV con l'elenco dei materiali" onClick=${() => openSheet('csvImport')} />
      <${ToolRow} icon="file-spreadsheet" title="Esporta il magazzino in CSV" sub="Si apre con Numbers o Excel" onClick=${doCSV} />
    </div>

    <div class="group-title" style="margin-top:22px">Icona dell'app</div>
    <div class="card">
      <${Toggle} checked=${st.badge} onChange=${doBadge} label="Mostra sull'icona quanti materiali sono da ordinare" hint="Come il numero rosso delle app di Apple. Richiede il permesso per le notifiche, su ogni dispositivo." />
    </div>

    <div class="group-title" style="margin-top:22px">Backup</div>
    <div class="card">
      <p class="ink2" style="font-size:15.5px">I dati sono già al sicuro online. Un backup ogni tanto serve in più per tornare indietro se qualcosa viene cancellato per errore.</p>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn primary" disabled=${!!busy} onClick=${doBackup}><${Icon} n="database-export" s="20" />${busy === 'backup' ? 'Preparo…' : 'Fai il backup'}</button>
        <button class="btn ghost" disabled=${!!busy} onClick=${doRestore}><${Icon} n="upload" s="20" />${busy === 'restore' ? 'Ripristino…' : 'Ripristina da un backup'}</button>
      </div>
      <p class="muted" style="font-size:14px;margin-top:12px">${st.lastBackup ? `Ultimo backup ${fmtDate(st.lastBackup, { day: 'numeric', month: 'long' })}` : 'Nessun backup ancora'}.</p>
    </div>

    <div class="group-title" style="margin-top:22px">Dati di esempio</div>
    <div class="card">
      ${st.demo
        ? html`<p class="ink2" style="font-size:15.5px">Stai usando i materiali di esempio. Rimuovili quando vuoi iniziare a inserire i vostri: categorie e fornitori restano.</p>
            <button class="btn soft-danger" style="margin-top:12px" disabled=${!!busy} onClick=${async () => { if (await confirmDialog({ title: 'Rimuovere i dati di esempio?', text: 'Spariranno i materiali, i movimenti e gli ordini di esempio da tutti i dispositivi. Quello che avete inserito voi resta.', ok: 'Rimuovi', danger: true })) { setBusy('demo'); await removeDemo(); setBusy(''); toast('Dati di esempio rimossi.'); } }}><${Icon} n="trash" s="20" />${busy === 'demo' ? 'Rimuovo…' : 'Rimuovi i dati di esempio'}</button>`
        : html`<p class="ink2" style="font-size:15.5px">Carica una quarantina di materiali con 4 mesi di movimenti, per vedere come funziona l'app.</p>
            <button class="btn" style="margin-top:12px" disabled=${!!busy} onClick=${async () => { setBusy('demo'); await loadDemo(); setBusy(''); toast('Dati di esempio caricati.'); }}><${Icon} n="sparkles" s="20" />Carica i dati di esempio</button>`}
    </div>

    <div class="group-title" style="margin-top:22px">Ricomincia da capo</div>
    <div class="card">
      <p class="ink2" style="font-size:15.5px">Cancella tutto: materiali, ordini, attività, fornitori e impostazioni, su tutti i dispositivi. Fai prima un backup.</p>
      <button class="btn soft-danger" style="margin-top:12px" onClick=${async () => {
        if (!await confirmDialog({ title: 'Cancellare tutti i dati?', text: "Non si può annullare. L'app tornerà alla schermata di benvenuto su tutti i dispositivi.", ok: 'Cancella tutto', danger: true })) return;
        if (!await confirmDialog({ title: 'Sei sicuro?', text: 'Ultima conferma: tutti i dati dello studio verranno eliminati.', ok: 'Sì, cancella', danger: true })) return;
        await resetAll();
        navigate('home');
      }}><${Icon} n="trash" s="20" />Cancella tutti i dati</button>
    </div>

    <p class="muted center" style="font-size:13.5px;margin-top:30px">Magazzino dello studio, versione ${APP_VERSION}. Funziona anche senza internet e si sincronizza da solo.</p>
  </div>`;
}
