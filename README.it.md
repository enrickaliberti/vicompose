# VisualCompose (Italiano)

Micro-framework **HTML-first**: router, template, client API fluente e data binding dichiarativo. Zero dipendenze, ~5 KB gzip, nessun build obbligatorio, niente `eval`.

**Idea:** la tua pagina è già HTML, quindi *il markup è il template*. Il JavaScript dice solo da dove arrivano i dati e quale campo va dove. Funziona su siti multi-pagina (MPA) e come piccola SPA con la stessa API.

```js
const app = VisualCompose.create({ baseURL: 'https://api.example.com' });
app.route('/', { onEnter: () => app.bind('.user', 'users', { '.name': 'name' }) });
app.start();
```

Moduli: **Router** (solo URL → parametri → `onEnter/onLeave`), **TemplateRegistry** (qualunque sorgente → `{content, scripts}`), **ApiClient** (query builder su `fetch` con cache), **BindingEngine** (`bind()` con "stampo" nel DOM oppure contenitore + `template`).

Documentazione completa in inglese: [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ROADMAP.md](docs/ROADMAP.md).
