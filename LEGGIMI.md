# Magazzino dello studio

App web per il magazzino dello studio dentistico: scorte, scadenze, ordini e fornitori.
Si installa sulla schermata Home di iPad e iPhone, funziona anche offline e tiene sincronizzati
tutti i dispositivi tramite Firebase (Firestore), con un unico account dello studio.

---

## 1. Crea il progetto Firebase (una volta sola, circa 10 minuti)

1. Vai su **console.firebase.google.com** e crea un nuovo progetto (es. `magazzino-studio`).
   Google Analytics non serve.
2. **Authentication** › Inizia › Metodo di accesso › **Email/password** › Abilita › Salva.
3. Sempre in Authentication › **Utenti** › Aggiungi utente: crea l'account dello studio
   (un'email e una password di almeno 6 caratteri). È quello che userete su tutti i dispositivi.
4. **Firestore Database** › Crea database.
   - Se ti chiede l'edizione, scegli **Standard**.
   - Località: una in Europa (es. `europe-west8`, Milano). Non si può cambiare dopo.
   - Avvia in **modalità di produzione**.
5. In Firestore › scheda **Regole**: cancella tutto, incolla il contenuto del file
   `firestore.rules` (è in questa cartella) e premi **Pubblica**.
6. ⚙️ **Impostazioni progetto** › Generali › Le tue app › icona **Web** (`</>`):
   dai un nome (es. Magazzino), non serve Firebase Hosting, poi copia il blocco `firebaseConfig`.

Il piano gratuito (Spark) basta: nessuna carta di credito richiesta.

## 2. Inserisci la configurazione

Apri il file **`config.js`** e sostituisci i valori con quelli copiati al punto 6, ad esempio:

```js
window.MAGAZZINO_FIREBASE = {
  apiKey: "AIza...",
  authDomain: "magazzino-studio.firebaseapp.com",
  projectId: "magazzino-studio",
  storageBucket: "magazzino-studio.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
```

Puoi farlo anche dopo aver caricato i file, direttamente su GitHub (matita ✏️ sul file).
Questi valori non sono segreti: i dati sono protetti dall'accesso e dalle regole del punto 5.

## 3. Pubblica l'app su GitHub Pages

1. Crea un repository (es. `magazzino`) e carica **tutto** il contenuto di questa cartella
   (Add file › Upload files), compresi `vendor/`, `js/`, `css/`, `icons/`, `sw.js`, `config.js` e `.nojekyll`.
2. Settings › Pages › Branch `main`, cartella `/ (root)` › Save.
3. Dopo un minuto l'app è su `https://TUO-NOME.github.io/magazzino/`.
4. In Firebase › Authentication › Impostazioni › **Domini autorizzati** aggiungi `TUO-NOME.github.io`.

## 4. Installa su ogni dispositivo

1. Apri l'indirizzo con **Safari**.
2. Condividi › **Aggiungi alla schermata Home**.
3. Apri l'app dall'icona e accedi con l'account dello studio (lo chiede una volta sola).

Il primo dispositivo configura lo studio (nome, fornitori, dati di esempio o da zero).
Gli altri entrano direttamente con gli stessi dati.

---

## Come funziona la sincronizzazione

- Ogni modifica compare sugli altri dispositivi in un paio di secondi.
- Senza internet l'app continua a funzionare: le modifiche partono da sole quando torna la rete.
  In basso a sinistra (o in alto a destra su iPhone) vedi lo stato: Sincronizzato, Invio in corso, Offline.
- Le quantità si registrano come differenze (−2, +50): se due persone prendono lo stesso materiale
  nello stesso momento, contano entrambi i prelievi.
- I movimenti degli ultimi 4 mesi restano sempre sincronizzati (servono a previsioni e grafici);
  quelli più vecchi si caricano su richiesta in Attività.

## Aggiornare l'app

Sostituisci i file sul sito con quelli nuovi (tranne `config.js`, se l'hai già compilato).
All'apertura l'app mostra «È disponibile una nuova versione»: tocca **Aggiorna**. I dati restano online.

## Codici a barre

- Legge EAN, GS1 DataMatrix (con lotto e scadenza), GS1-128, HIBC e QR.
- La prima volta che inquadri una confezione, collegala al materiale: poi la riconosce da sola, su tutti i dispositivi.
- Per i materiali senza codice: Impostazioni › Stampa etichette QR.
- Funziona anche un lettore di codici Bluetooth collegato all'iPad.

## Se qualcosa non va

- **«Collega il database»** all'avvio: `config.js` non è compilato.
- **«Email o password non corrette»**: controlla l'utente in Firebase › Authentication › Utenti.
- **Le modifiche non arrivano sull'altro dispositivo**: controlla che le regole del punto 5 siano pubblicate
  e che i due dispositivi usino lo stesso account (lo vedi in Impostazioni).

Librerie incluse (licenze libere): Firebase JS SDK (Apache 2.0), Preact e htm (MIT),
ZXing-C++/zxing-wasm (Apache 2.0 / MIT), qrcode-generator (MIT), Tabler Icons (MIT).
