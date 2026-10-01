# VisualCompose

> **HTML-first micro-framework.** Router · template stamping · fluent API client · declarative data binding.
> Zero dependencies · ~5 KB gzipped · no build step · no `eval` (CSP-friendly) · ESM + types.

[![CI](https://github.com/enrickaliberti/visualcompose/actions/workflows/ci.yml/badge.svg)](https://github.com/enrickaliberti/visualcompose/actions)
[![npm](https://img.shields.io/npm/v/visualcompose)](https://www.npmjs.com/package/visualcompose)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**[Live demo](https://enrickaliberti.github.io/visualcompose/)** · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) · [Italiano](README.it.md)

## Why

Your page is already HTML. VisualCompose keeps it that way: the **markup is the template**, JavaScript only says *where the data comes from* and *which field goes where*. Use it on classic multi-page sites (MPA) or as a small SPA, with the same API.

```html
<ul id="users">
  <li class="user"><a class="link"><b class="name"></b></a></li>   <!-- the visible "mould" -->
</ul>

<script type="module">
  import { VisualCompose } from 'https://cdn.jsdelivr.net/npm/visualcompose/dist/visualcompose.min.js';

  const app = VisualCompose.create({ baseURL: 'https://api.example.com' });

  app.route('/', {
    onEnter: () => app.bind('.user', 'users', {
      '.name': 'name',
      '.link': { href: (u) => `/users/${u.id}` }
    }, { loading: 'Loading…', empty: '<p>No users</p>' })
  }).route('*', { onEnter: () => console.log('404') });

  app.start();
</script>
```

## Install

```bash
npm i visualcompose
```
or via CDN (`<script type="module">` as above; for classic scripts use `dist/visualcompose.iife.min.js`, global `VC`).

## The four pieces (each does one thing)

| Module | Responsibility |
|---|---|
| **Router** | Match URL → extract `:params` and `?query` → `onEnter` / `onLeave`. Never renders. History or `#hash` routes. `*` = 404. |
| **TemplateRegistry** | Turn *any* source (selector, `<template>`, HTML string, file URL, fragment) into `{ content, scripts }`, cached pristine. |
| **ApiClient** | `app.table('users/:id').params({id}).query({q}).where().sort().limit().get()` — fluent `fetch`, GET cache, automatic invalidation on writes. |
| **BindingEngine** | `bind(target, data, mapping, options)`: clone a mould per item, map fields to nodes, handle loading/empty/error. |

### `bind()` – two modes
- **No `template` option** → `target` is a visible mould in the DOM: cloned N times, the original is removed, re-binds replace the clones.
- **With `template`** → `target` is the container, `template` is the mould; container is refilled (`mode: 'replace' | 'append'`).

### Mapping
```js
{ '.name': 'user.name',                     // dotted path → text
  '.avatar': 'avatarUrl',                    // <img> → src, <a> → href, <input> → value
  '.row': { class: (d) => d.active ? 'on' : 'off', 'data-id': 'id', onclick: (d) => open(d) },
  '.pos': '$index',  '.who': 'params.id' }   // special sources
```
Prefer `text` over `html`: `html`/`innerHTML` insert raw markup (see [SECURITY.md](SECURITY.md)).

## Compared to…

| | VisualCompose | htmx | Alpine.js | Vue / React |
|---|---|---|---|---|
| Build step | none | none | none | usually |
| Size (min+gz) | ~5 KB | ~14 KB | ~16 KB | 30–45 KB+ |
| Template language | plain HTML | plain HTML + attrs | HTML + directives | SFC / JSX |
| Client router | ✔ built in | ✘ (server) | ✘ | add-on |
| JSON API client | ✔ fluent + cache | ✘ (HTML over the wire) | ✘ | add-on |
| Reactivity / state | ✘ (explicit `bind`) | ✘ | ✔ | ✔ |

Pick VisualCompose when you have **JSON endpoints + server-rendered or static HTML** and want routing and rendering without adopting a component model.

## Develop
```bash
npm install
npm test            # vitest + jsdom
npm run typecheck   # JSDoc types checked by tsc
npm run build       # dist/: esm, esm.min, iife.min, types
npm run serve       # then open /examples/basic/
```
See [CONTRIBUTING.md](CONTRIBUTING.md). License: [MIT](LICENSE).
