# Contributing
1. Fork, then `npm install`.
2. `npm test` · `npm run typecheck` · `npm run build` must all pass.
3. Add a test for every behaviour change or bug fix (`test/`).
4. Keep the project **zero-dependency** and under the size budget (see `npm run size`; CI fails above 8 KB gzip).
5. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…). Breaking changes need an RFC issue first.
6. Open a PR; fill in the template.

## Design principles
- **HTML is the source of truth** – the DOM is the template language.
- **Each module does one thing** – Router matches URLs, Registry normalises templates, ApiClient fetches, Binder renders.
- **No magic, no build step required**, no `eval`, CSP-friendly.
