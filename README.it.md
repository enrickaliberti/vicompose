# VisualCompose (Italiano)

**Micro-framework HTML-first + editor visuale.** Router, template, client API fluente e data binding dichiarativo. Zero dipendenze, ~5 KB gzip, nessun build obbligatorio, niente `eval`.

**[▶ Prova l'editor visuale](https://enrickaliberti.github.io/visualcompose/editor/)** · [Demo del framework](https://enrickaliberti.github.io/visualcompose/examples/basic/) · [English](README.md)

![Editor VisualCompose: scegli un elemento ripetuto, carica un JSON, mappa i campi, anteprima](docs/img/editor-demo.gif)

**Idea:** la tua pagina è già HTML, quindi *il markup è il template*. Il JavaScript dice solo da dove arrivano i dati e quale campo va dove. Funziona su siti multi-pagina (MPA) e come piccola SPA con la stessa API.

```js
const app = VisualCompose.create({ baseURL: 'https://api.example.com' });
app.route('/', { onEnter: () => app.bind('.user', 'users', { '.name': 'name' }) });
app.start();
```

## Editor visuale

Non vuoi scrivere la mappatura a mano? L'**[editor](https://enrickaliberti.github.io/visualcompose/editor/)** la costruisce con pochi click. Funziona interamente nel browser (pagina statica, nessun server né account) e mostra l'anteprima con il vero framework.

> **Stato: beta.** Oggi puoi progettare e vedere l'anteprima; l'esportazione del codice generato è in [roadmap](docs/ROADMAP.md).

**Tour in 5 passi**

1. **Prepara la pagina.** Clicca **HTML** e incolla il tuo markup. Lascia **un solo** elemento da ripetere: è lo *stampo*.
2. **Scegli la radice.** *Doppio click* sull'elemento ripetuto (la singola card, non l'intera lista): si colora di viola.
3. **Carica i dati.** Scheda **Mappatura** → **Imposta API** → URL di un JSON (o `./sample-users.json` per provare) → **Carica**. I campi vengono rilevati e proposti come "campi rapidi".
4. **Mappa i campi.** Clicca un nodo nel canvas e scrivi un'espressione (`name`, `{{name}} — {{role}}`, `params.id`, `$index`, o codice JavaScript con `item`) oppure clicca un campo rapido. Filtri opzionali: `where`, `sort`, `limit`, `unique`, `map`.
5. **Anteprima.** Premi **Visualizza** (`Ctrl+Enter`).

![Anteprima: una card per utente](docs/img/editor-preview.png)

La mappatura dell'esempio equivale a:

```js
app.bind('.member', './sample-users.json', { '.name': 'name', '.email': 'email' });
```

**Scorciatoie:** doppio click = radice · click destro = menu · `Canc` elimina · `↑/↓` seleziona · `Alt+↑/↓` sposta · `Ctrl+D` duplica · `Ctrl+Z` / `Ctrl+Shift+Z` annulla/ripeti · `Ctrl+Enter` modifica↔anteprima · `Esc` deseleziona. La bozza si salva da sola nel `localStorage` del browser.

**Da sapere:** le espressioni sono JavaScript eseguito nel tuo browser (apri solo contenuti di cui ti fidi); percorsi assoluti come `/api/users` puntano a `github.io`, usa URL completi con CORS o file JSON relativi.

## Moduli
**Router** (URL → parametri → `onEnter/onLeave`), **TemplateRegistry** (qualunque sorgente → `{content, scripts}`), **ApiClient** (query builder su `fetch` con cache), **BindingEngine** (`bind()` con stampo nel DOM oppure contenitore + `template`).

Documentazione completa in inglese: [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ROADMAP.md](docs/ROADMAP.md).
