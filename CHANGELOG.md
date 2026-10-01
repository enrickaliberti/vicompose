# Changelog
All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

## [0.1.0] - 2026-10-01
### Added
- First public release: `Router`, `TemplateRegistry`, `ApiClient`, `BindingEngine`, `ScriptLoader`, `VisualCompose` facade.
- ESM, minified ESM and IIFE builds; TypeScript declarations generated from JSDoc.
- Test suite (vitest + jsdom), CI, GitHub Pages demo.
### Security
- Error messages rendered by `render()`/`bind()` are now HTML-escaped (they can contain user-supplied selectors/URLs).
