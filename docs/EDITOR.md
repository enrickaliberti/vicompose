# VisualCompose Editor

Editor visuale single-file (`editor/index.html`): seleziona un elemento come **radice** (doppio click), carica un JSON, mappa i campi sui nodi, aggiungi filtri e controlla il risultato in **Visualizza**.

- **Online:** `https://<utente>.github.io/<repo>/editor/`
- **In locale:** `npm run serve` e apri `http://localhost:8080/editor/`
- **Framework usato nell'anteprima:** copia locale `../src/visualcompose.js`; se non disponibile, jsDelivr (`visualcompose@0.1.0`).
- **Dati di esempio:** `editor/sample-users.json` (usa `./sample-users.json` nel dialogo API).
- **Autosave:** bozza in `localStorage` (chiave `vc_editor_autosave_v1`).

Limiti noti: gli URL assoluti tipo `/api/users` puntano al dominio github.io (usa URL completi con CORS abilitato oppure file JSON relativi); Tailwind è caricato dal CDN di sviluppo.
