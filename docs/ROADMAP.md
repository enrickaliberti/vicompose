# Roadmap & known limitations

Honest list, in priority order. Contributions welcome — open an issue before big changes.

## 0.2 – correctness & ergonomics
- [ ] `basePath` option (pathname routes break on GitHub Pages *project* sites under `/repo/`; use `#/` routes meanwhile).
- [ ] Cancel stale navigations (rapid clicks can run `onEnter` of an older route after a newer one).
- [ ] `AbortSignal` support + in-flight request de-duplication in `ApiClient`; optional cache TTL.
- [ ] Route guards (`beforeEnter` returning `false`/redirect) and lazy route modules.
- [ ] Error messages i18n (currently Italian) – default English, overridable.

## 0.3 – extensibility (what made htmx/Vue ecosystems grow)
- [ ] Lifecycle events (`vc:before-bind`, `vc:after-bind`, `vc:error`) dispatched on the DOM.
- [ ] Plugin API: `app.use(plugin)`; custom mapping directives.
- [ ] Keyed list updates (reuse nodes on re-bind instead of replacing all clones).
- [ ] Optional tiny reactive store feeding `bind()`.

## 1.0 – stability
- [ ] Frozen public API + deprecation policy, docs site, browser-run e2e tests (Playwright), npm provenance.
