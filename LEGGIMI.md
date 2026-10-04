# Magazzino dello studio

App web per gestire il magazzino dello studio dentistico: scorte, scadenze, ordini e fornitori.
Funziona offline e si installa sull'iPad come un'app normale. Non serve un server: sono solo file statici.

## Pubblicarla (una volta sola)

**GitHub Pages**
1. Crea un nuovo repository su GitHub (es. `magazzino`).
2. Carica tutto il contenuto di questa cartella (Add file › Upload files), compresi `vendor/`, `js/`, `css/`, `icons/`, `sw.js` e `.nojekyll`.
3. Settings › Pages › Branch: `main`, cartella `/ (root)` › Save.
4. Dopo un minuto l'app è su `https://TUO-NOME.github.io/magazzino/`.

**In alternativa, Netlify Drop**: vai su app.netlify.com/drop e trascina la cartella. Ti dà subito un indirizzo https.

Serve un indirizzo **https** (la fotocamera non funziona senza).

## Installarla sull'iPad
1. Apri l'indirizzo con **Safari**.
2. Tasto Condividi › **Aggiungi alla schermata Home** › Aggiungi.
3. Da quel momento aprila **sempre dall'icona**: Safari e l'app installata tengono i dati separati.

## Dove stanno i dati
- Restano **solo su quell'iPad**, anche senza internet.
- Fai un **backup ogni settimana** (Impostazioni › Fai il backup) e salvalo su iCloud Drive.
- Se cambi iPad o indirizzo del sito: installa l'app nuova e usa *Ripristina da un backup*.

## Aggiornare l'app
Sostituisci i file sul sito con quelli nuovi. All'apertura l'app mostra «È disponibile una nuova versione»: tocca **Aggiorna**. I dati restano.

## Codici a barre
- Legge EAN, GS1 DataMatrix (con lotto e scadenza), GS1-128, HIBC e QR.
- La prima volta che inquadri una confezione, collegala al materiale: poi la riconosce da sola.
- Per materiali senza codice: Impostazioni › Stampa etichette QR.
- Funziona anche un lettore di codici Bluetooth collegato all'iPad.

Librerie incluse (tutte con licenza libera): Preact e htm (MIT), ZXing-C++/zxing-wasm (Apache 2.0 / MIT), qrcode-generator (MIT), Tabler Icons (MIT).
