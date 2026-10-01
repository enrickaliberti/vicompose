# VisualCompose Editor

Editor visuale single-file (`editor/index.html`). Guida d'uso completa e screenshot: vedi la sezione **Visual Editor** del [README](../README.md).

- **Online:** https://enrickaliberti.github.io/visualcompose/editor/
- **In locale:** `npm run serve` → http://localhost:8080/editor/
- **Framework nell'anteprima:** `../src/visualcompose.js` (stesso commit); ripiego su jsDelivr (`visualcompose@0.1.0`).
- **Dati di esempio:** `editor/sample-users.json` (usa `./sample-users.json` nel dialogo API).
- **Autosave:** bozza in `localStorage` (chiave `vc_editor_autosave_v1`).
- **Scorciatoie da tastiera:** attive sia fuori sia dentro il canvas.

## Rigenerare screenshot e GIF
Gli asset in `docs/img/` mostrano il flusso: elimina la seconda card → doppio click sulla prima (radice) → Mappatura → `./sample-users.json` → `{{name}}` / `{{email}}` → Visualizza. Dopo modifiche all'interfaccia, rifai le catture con la stessa sequenza.

## Limiti noti
Esportazione del codice non ancora disponibile · URL assoluti tipo `/api/users` puntano a github.io · Tailwind dal CDN di sviluppo · le espressioni libere sono eseguite con `new Function` (solo contenuti attendibili).
