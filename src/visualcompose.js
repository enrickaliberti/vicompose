// @ts-check
/**
 * VisualCompose
 * -----------------------------------------------------------------------
 * Micro-framework per pagine "normali" (MPA) o SPA con:
 *  - Router:   SOLO matching URL + estrazione parametri (path + query),
 *              più onEnter/onLeave. Non renderizza nulla da sé.
 *  - Templates: normalizza QUALSIASI sorgente HTML in { content, scripts }.
 *              È l'unico percorso di trasformazione "in stampo".
 *  - ApiClient: query builder fluente su fetch, con cache in-memory.
 *  - Binder:   due casi, scelti dalla presenza di `options.template`:
 *                - ASSENTE  -> il target è uno stampo visibile nel DOM.
 *                  Al primo bind viene catturato in memoria, clonato N
 *                  volte, i cloni vengono inseriti al posto dell'originale,
 *                  e l'originale viene RIMOSSO dal DOM. Il parent viene
 *                  salvato in cache per i bind successivi.
 *                - PRESENTE -> il target è il CONTENITORE, `template` è
 *                  lo stampo (elemento, <template>, file). Il container
 *                  viene svuotato e ripopolato ad ogni bind.
 *
 * Configurazione: il costruttore accetta `{ mode: 'mpa' | 'spa', baseURL? }`.
 * `create()` è una factory statica.
 *
 * File in ESM + JSDoc.
 */

// =========================================================================
// TIPI
// =========================================================================

/** @typedef {Object.<string, string>} RouteParams */

/** @typedef {Object} ScriptDescriptor
 *  @property {string|null} src
 *  @property {string} type
 *  @property {boolean} async
 *  @property {boolean} defer
 *  @property {string} content
 */

/** @typedef {Object} ResolvedTemplate
 *  @property {DocumentFragment} content
 *  @property {ScriptDescriptor[]} scripts
 *  @property {true} __vcTemplate
 *  @property {Element|null} sourceEl     Elemento vivo da cui è stato
 *           catturato lo stampo (visibile nel DOM). null per <template>,
 *           HTML, file, DocumentFragment.
 *  @property {Node|null} __vcParent      Parent salvato al primo bind
 *           (dove inserire i cloni ai bind successivi). null finché non
 *           è stato fatto un primo bind con successo.
 */

/** @typedef {string|Element|HTMLTemplateElement|DocumentFragment|ResolvedTemplate} TemplateSource */

/** @typedef {Object} RouteOptions
 *  @property {(params: RouteParams) => (void|Promise<void>)} [onEnter]
 *  @property {(params: RouteParams) => (void|Promise<void>)} [onLeave]
 */

/** @typedef {Object} BindOptions
 *  @property {TemplateSource} [template]
 *  @property {string} [loading]
 *  @property {TemplateSource} [empty]
 *  @property {TemplateSource} [error]
 *  @property {'replace'|'append'} [mode]
 *  @property {(clone: Element, item: any, index: number) => void} [onClone]
 *  @property {'once'|'per-clone'|'never'} [runScripts]
 */

/** @typedef {Object} RenderOptions
 *  @property {TemplateSource} [error]
 */

/** @typedef {Object} AppConfig
 *  @property {'mpa'|'spa'} [mode]
 *  @property {string} [baseURL]
 */

// =========================================================================
// UTILS
// =========================================================================

export const Utils = {
    /** @param {any} data @returns {any[]} */
    toArray(data) {
        if (data === null || data === undefined) return [];
        return Array.isArray(data) ? data : [data];
    },

    /** @param {any} obj @param {string} path @returns {any} */
    getNestedValue(obj, path) {
        if (typeof path !== 'string') return path;
        return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
    },

    /** Escapa HTML per inserire testo non fidato in innerHTML. @param {any} str */
    escapeHTML(str) {
        return String(str).replace(/[&<>"']/g, (c) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    },

    /** @param {string} str */
    escapeRegex(str) {
        return str.replace(/[.*+?^=!:${}()|[\]\\/]/g, '\\$&');
    },

    /** @param {string} html @returns {DocumentFragment} */
    parseHTML(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const fragment = document.createDocumentFragment();
        while (doc.body.firstChild) fragment.appendChild(doc.body.firstChild);
        return fragment;
    },

    /** @param {Element|DocumentFragment} container @returns {ScriptDescriptor[]} */
    extractScripts(container) {
        /** @type {ScriptDescriptor[]} */
        const scripts = [];
        container.querySelectorAll('script').forEach((s) => {
            scripts.push({
                src: s.getAttribute('src'),
                type: s.getAttribute('type') || 'text/javascript',
                async: s.hasAttribute('async'),
                defer: s.hasAttribute('defer'),
                content: s.textContent || ''
            });
            s.remove();
        });
        return scripts;
    }
};

// =========================================================================
// SCRIPT LOADER
// -------------------------------------------------------------------------
// Niente eval(): ogni script viene rieseguito ricreando un vero tag
// <script>. Mantiene `let/const/class` scoped al singolo tag e non rompe
// la CSP.
//
// Dedup per `src` è opt-in (dedupe:true): da usare SOLO per librerie
// globali caricate una tantum. Gli script legati a un template dati
// girano con dedupe:false di default, perché devono reinizializzare ogni
// nuovo blocco di contenuto/clone.
// =========================================================================

class ScriptLoaderImpl {
    constructor() {
        /** @type {Set<string>} */
        this._loadedSrcs = new Set();
    }

    /** @param {ScriptDescriptor[]} scripts @param {Element|ShadowRoot} [target] @param {{dedupe?: boolean}} [options] */
    async load(scripts, target = document.head, { dedupe = false } = {}) {
        for (const script of scripts) {
            if (script.src) {
                if (dedupe && this._loadedSrcs.has(script.src)) continue;
                if (dedupe) this._loadedSrcs.add(script.src);
                await this._loadExternal(script, target);
            } else if (script.content.trim()) {
                this._execInline(script, target);
            }
        }
    }

    /** @param {string} src @param {Element|ShadowRoot} [target] */
    loadLibrary(src, target = document.head) {
        return this.load(
            [{ src, type: 'text/javascript', async: false, defer: false, content: '' }],
            target,
            { dedupe: true }
        );
    }

    /** @param {ScriptDescriptor} script @param {Element|ShadowRoot} target */
    _loadExternal(script, target) {
        return new Promise((resolve, reject) => {
            const el = document.createElement('script');
            if (script.src) el.src = script.src;
            el.type = script.type;
            if (script.async) el.async = true;
            if (script.defer) el.defer = true;
            el.onload = () => {
                if (el.parentNode) el.parentNode.removeChild(el);
                resolve(undefined);
            };
            el.onerror = () => {
                if (el.parentNode) el.parentNode.removeChild(el);
                reject(new Error(`Failed to load script: ${script.src}`));
            };
            target.appendChild(el);
        });
    }

    /** @param {ScriptDescriptor} script @param {Element|ShadowRoot} target */
    _execInline(script, target) {
        const el = document.createElement('script');
        el.type = script.type;
        el.textContent = script.content;
        target.appendChild(el);
        if (script.type !== 'module') el.remove();
    }

    reset() { this._loadedSrcs.clear(); }
}

export const ScriptLoader = new ScriptLoaderImpl();

// =========================================================================
// TEMPLATE REGISTRY
// -------------------------------------------------------------------------
// Il registry NON modifica il DOM. Cattura lo stampo (clone in memoria) e
// restituisce un ResolvedTemplate con il riferimento all'elemento originale
// (sourceEl). Chi decide cosa fare dell'originale è il Binder:
//  - se è un elemento visibile e va usato come stampo "in place" -> lo
//    rimuove dopo aver inserito i cloni;
//  - se è un <template> -> lo lascia dov'è (è già invisibile);
//  - se è un file/HTML/fragment -> sourceEl è null, non c'è nulla da
//    rimuovere.
//
// La cache è permanente per nome/selettore/URL: bind ripetuti sullo stesso
// riferimento riusano lo STESSO stampo pristine, mai un clone già
// renderizzato.
// =========================================================================

export class TemplateRegistry {
    constructor() {
        /** @type {Map<string, ResolvedTemplate>} */
        this.templates = new Map();
    }

    /** @param {TemplateSource} ref @returns {Promise<ResolvedTemplate>} */
    async resolve(ref) {
        if (ref && /** @type {ResolvedTemplate} */ (ref).__vcTemplate) {
            return /** @type {ResolvedTemplate} */ (ref);
        }

        if (ref instanceof HTMLTemplateElement) return this._fromTemplateEl(ref);
        if (ref instanceof DocumentFragment) {
            return {
                content: ref,
                scripts: [],
                __vcTemplate: true,
                sourceEl: null,
                __vcParent: null
            };
        }
        if (ref instanceof Element) return this._fromElement(ref);

        if (typeof ref === 'string') {
            const trimmed = ref.trim();

            if (this.templates.has(trimmed)) {
                return /** @type {ResolvedTemplate} */ (this.templates.get(trimmed));
            }

            if (trimmed.startsWith('<')) return this._fromHTML(trimmed);

            // URL prima del selettore, così "./user.html" non arriva mai a
            // querySelector (lancierebbe SyntaxError).
            if (this._looksLikeURL(trimmed)) {
                const resolved = await this._fetch(trimmed);
                this.templates.set(trimmed, resolved);
                return resolved;
            }

            const el = this._querySelector(trimmed);
            if (el) {
                const resolved = el instanceof HTMLTemplateElement
                    ? this._fromTemplateEl(el)
                    : this._fromElement(el);
                this.templates.set(trimmed, resolved);
                return resolved;
            }
        }

        throw new Error(
            `Template non trovato: "${String(ref)}" non è un selettore esistente, ` +
            `né un nome registrato, né un URL valido.`
        );
    }

    /** @param {string} name @param {ResolvedTemplate} resolved */
    register(name, resolved) {
        this.templates.set(name, resolved);
        return resolved;
    }

    /** @param {string} name */
    has(name) { return this.templates.has(name); }

    clear() { this.templates.clear(); }

    // --- Internals ---

    /** @param {string} ref */
    _looksLikeURL(ref) {
        if (/^(https?:)?\/\//.test(ref)) return true;
        if (ref.startsWith('/') || ref.startsWith('./') || ref.startsWith('../')) return true;
        if (/^[\w./-]+\.(html?|json|xml|svg|txt|md|css|js)($|\?)/i.test(ref)) return true;
        return false;
    }

    /** @param {string} ref */
    _querySelector(ref) {
        try { return document.querySelector(ref); }
        catch { return null; }
    }

    /** @param {string} url */
    async _fetch(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} per ${url}`);
        const html = await res.text();
        return this._fromHTML(html);
    }

    /** @param {HTMLTemplateElement} el */
    _fromTemplateEl(el) {
        const clone = /** @type {DocumentFragment} */ (el.content.cloneNode(true));
        const wrapper = document.createElement('div');
        wrapper.appendChild(clone);
        const scripts = Utils.extractScripts(wrapper);
        const content = document.createDocumentFragment();
        while (wrapper.firstChild) content.appendChild(wrapper.firstChild);
        return {
            content,
            scripts,
            __vcTemplate: /** @type {true} */ (true),
            sourceEl: el,      // il <template> tag come riferimento per il binder
            __vcParent: null
        };
    }

    /** @param {Element} el */
    _fromElement(el) {
        const clone = /** @type {Element} */ (el.cloneNode(true));
        // Pulisci eventuali residui di bind precedenti
        clone.removeAttribute('hidden');
        clone.removeAttribute('data-vc-hidden');

        const scripts = Utils.extractScripts(clone);
        const content = document.createDocumentFragment();
        content.appendChild(clone);

        return {
            content,
            scripts,
            __vcTemplate: /** @type {true} */ (true),
            sourceEl: el,
            __vcParent: null
        };
    }

    /** @param {string} html */
    _fromHTML(html) {
        const fragment = Utils.parseHTML(html);
        const wrapper = document.createElement('div');
        wrapper.appendChild(fragment);
        const scripts = Utils.extractScripts(wrapper);
        const content = document.createDocumentFragment();
        while (wrapper.firstChild) content.appendChild(wrapper.firstChild);
        return {
            content,
            scripts,
            __vcTemplate: /** @type {true} */ (true),
            sourceEl: null,
            __vcParent: null
        };
    }
}

// =========================================================================
// RENDER HELPER CONDIVISO
// =========================================================================

/** @param {TemplateRegistry} templates @param {Element} container @param {TemplateSource} source @param {{error?: TemplateSource|null}} [options] */
async function renderInto(templates, container, source, { error = null } = {}) {
    try {
        const resolved = await templates.resolve(source);
        container.replaceChildren(resolved.content.cloneNode(true));
        await ScriptLoader.load(resolved.scripts, container, { dedupe: false });
        return resolved;
    } catch (err) {
        const message = /** @type {Error} */ (err).message;
        if (!error) {
            container.innerHTML = `<div class="vc-error">${Utils.escapeHTML(message)}</div>`;
            return null;
        }
        try {
            const resolvedError = await templates.resolve(error);
            container.replaceChildren(resolvedError.content.cloneNode(true));
            await ScriptLoader.load(resolvedError.scripts, container, { dedupe: false });
        } catch (err2) {
            container.innerHTML = `<div class="vc-error">${Utils.escapeHTML(/** @type {Error} */ (err2).message)}</div>`;
        }
        return null;
    }
}

// =========================================================================
// ROUTER
// -------------------------------------------------------------------------
// Responsabilità UNICA: capire "in che URL siamo" e "con che parametri",
// poi far partire onEnter/onLeave. Nessun rendering, nessun container.
// Il 404 è una rotta come le altre ('*' o '#/*' in modalità hash).
//
// MPA vs SPA: l'unica differenza è il comportamento di `navigate()` e la
// registrazione del listener sui click. Tutto il resto è identico.
// =========================================================================

export class Router {
    /** @param {VisualCompose} app */
    constructor(app) {
        this.app = app;
        /** @type {Array<{pattern:string, regex:RegExp, keys:string[]} & RouteOptions>} */
        this.routes = [];
        /** @type {(typeof this.routes[number])|null} */
        this.currentRoute = null;
        /** @type {RouteParams} */
        this.currentParams = {};
        /** @type {'mpa'|'spa'} */
        this.mode = 'mpa';
        this._started = false;
        this._linkHandlerAttached = false;
        this._warnedNoMatch = false;
        this._onPopState = () => { this._handleRouteChange(); };
        /** @type {((e: MouseEvent) => void)|null} */
        this._onClick = null;
    }

    /** @param {'mpa'|'spa'} mode */
    setMode(mode) {
        this.mode = mode === 'spa' ? 'spa' : 'mpa';
        // Se il router è già partito e passiamo a SPA, registra i link ora.
        if (this._started && this.mode === 'spa' && !this._linkHandlerAttached) {
            this._setupLinkHandling();
            this._linkHandlerAttached = true;
        }
        return this;
    }

    /** @param {string} pattern @param {RouteOptions} [options] */
    add(pattern, options = {}) {
        if (this.routes.some((r) => r.pattern === pattern)) {
            console.warn(`[VisualCompose] Route già registrata: "${pattern}" — la prima vince.`);
        }
        const { regex, keys } = this._patternToRegex(pattern);
        this.routes.push({
            pattern, regex, keys,
            onEnter: options.onEnter,
            onLeave: options.onLeave
        });
        return this;
    }

    async start() {
        if (this._started) return;
        this._started = true;

        window.addEventListener('popstate', this._onPopState);

        if (this.mode === 'spa' && !this._linkHandlerAttached) {
            this._setupLinkHandling();
            this._linkHandlerAttached = true;
        }

        await this._handleRouteChange();
    }

    destroy() {
        window.removeEventListener('popstate', this._onPopState);
        if (this._onClick) document.removeEventListener('click', this._onClick);
        this._onClick = null;
        this._started = false;
        this._linkHandlerAttached = false;
        this._warnedNoMatch = false;
        this.currentRoute = null;
        this.currentParams = {};
    }

    _setupLinkHandling() {
        /** @param {MouseEvent} e */
        this._onClick = (e) => {
            if (this.mode !== 'spa') return;
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

            const target = /** @type {Element} */ (e.target);
            const link = target.closest ? target.closest('a') : null;
            if (!link) return;
            if (link.target && link.target !== '_self') return;
            if (link.hasAttribute('download')) return;
            if (/** @type {HTMLElement} */ (link).dataset.noSpa !== undefined) return;

            const href = link.getAttribute('href');
            if (!href || href.startsWith('#')) return;

            const url = new URL(link.href, location.origin);
            if (url.origin !== location.origin) return;

            e.preventDefault();
            this.navigate(url.pathname + url.search + url.hash);
        };
        document.addEventListener('click', this._onClick);
    }

    /** @param {string} pattern */
    _patternToRegex(pattern) {
        /** @type {string[]} */
        const keys = [];
        const parts = pattern.split(/([#/])/);
        let regexStr = '';

        for (const part of parts) {
            if (part === '/' || part === '#') { regexStr += Utils.escapeRegex(part); continue; }
            if (part === '*') { keys.push('wildcard'); regexStr += '(.*)'; continue; }
            if (part.startsWith(':')) { keys.push(part.slice(1)); regexStr += '([^/#?]+)'; continue; }
            regexStr += Utils.escapeRegex(part);
        }

        return {
            regex: new RegExp('^(?:/)?' + regexStr + '/?(?:[?].*)?$', 'i'),
            keys
        };
    }

    _buildCandidates() {
        const pathname = window.location.pathname.replace(/\/$/, '') || '/';
        const hash = window.location.hash || '#/';
        const search = window.location.search || '';
        return [...new Set([pathname + search, pathname, hash])];
    }

    _findMatch() {
        const candidates = this._buildCandidates();
        const queryParams = new URLSearchParams(window.location.search);

        for (const candidate of candidates) {
            for (const route of this.routes) {
                const match = candidate.match(route.regex);
                if (!match) continue;

                /** @type {RouteParams} */
                const params = {};
                route.keys.forEach((key, i) => {
                    params[key] = decodeURIComponent(match[i + 1] || '');
                });
                queryParams.forEach((value, key) => {
                    params[`query.${key}`] = value;
                });

                return { route, params };
            }
        }
        return null;
    }

    async _handleRouteChange() {
        const match = this._findMatch();

        if (this.currentRoute?.onLeave) {
            try { await this.currentRoute.onLeave(this.currentParams); }
            catch (e) { console.error('onLeave error:', e); }
        }

        if (!match) {
            if (!this._warnedNoMatch) {
                console.warn(
                    '[VisualCompose] Nessuna rotta combacia con l\'URL corrente. ' +
                    'Registra una rotta jolly ("*" oppure "#/*" in modalità hash) come ULTIMA rotta per gestire i 404.'
                );
                this._warnedNoMatch = true;
            }
            this.currentRoute = null;
            this.currentParams = {};
            return;
        }

        this.currentRoute = match.route;
        this.currentParams = match.params;

        if (match.route.onEnter) {
            try { await match.route.onEnter(match.params); }
            catch (e) { console.error('onEnter error:', e); }
        }
    }

    /** @param {string} path @param {{replace?: boolean}} [options] */
    async navigate(path, options = {}) {
        if (this.mode === 'spa') {
            if (options.replace) history.replaceState({}, '', path);
            else history.pushState({}, '', path);
            await this._handleRouteChange();
        } else {
            window.location.href = path;
        }
    }

    /** @param {string} key */
    getParam(key) { return this.currentParams?.[key] ?? null; }
}

// =========================================================================
// API CLIENT
// -------------------------------------------------------------------------
// `table()` accetta endpoint relativo (richiede setBaseURL) oppure URL
// completo (assoluto o ./...). Solo un identificatore nudo ("users") viene
// combinato con baseURL.
//
// Invalidazione cache: confronta il prefisso STATICO dell'endpoint (prima
// del primo ":param") e matcha solo al boundary di path/query.
// =========================================================================

export class ApiClient {
    /** @param {string} [baseURL] */
    constructor(baseURL = '') {
        this.baseURL = baseURL;
        /** @type {Map<string, any>} */
        this.cache = new Map();
        this.defaultHeaders = { 'Content-Type': 'application/json' };
    }

    /** @param {string} url */
    setBaseURL(url) { this.baseURL = url; return this; }

    /** @param {string} staticPrefix */
    _invalidateRelatedCache(staticPrefix) {
        const escaped = Utils.escapeRegex(staticPrefix);
        const regex = new RegExp('^' + escaped + '(?:/|\\?|$)');
        for (const key of [...this.cache.keys()]) {
            const colonIndex = key.indexOf(':');
            const url = colonIndex >= 0 ? key.slice(colonIndex + 1) : key;
            if (regex.test(url)) this.cache.delete(key);
        }
    }

    /** @param {string} endpoint */
    table(endpoint) {
        const isPathLike =
            endpoint.startsWith('http') || endpoint.startsWith('/') ||
            endpoint.startsWith('./') || endpoint.startsWith('../');
        const base = isPathLike ? endpoint : `${this.baseURL}/${endpoint}`;
        const staticPrefix = base.replace(/:\w+.*$/, '').replace(/\/$/, '');

        const state = {
            params: /** @type {Record<string, any>} */ ({}),
            query: /** @type {Record<string, any>} */ ({}),
            body: /** @type {any} */ (null),
            method: 'GET',
            /** @type {Array<{type:string, [k:string]: any}>} */
            filters: []
        };

        const buildURL = () => {
            let url = base.replace(/:\w+/g, (m) => {
                const key = m.slice(1);
                return state.params[key] !== undefined ? encodeURIComponent(state.params[key]) : m;
            });
            const qs = new URLSearchParams();
            Object.entries(state.query).forEach(([k, v]) => {
                if (v === undefined || v === null) return;
                if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
                else qs.append(k, v);
            });
            const queryString = qs.toString();
            if (queryString) url += (url.includes('?') ? '&' : '?') + queryString;
            return url;
        };

        /** @param {any} data */
        const applyFilters = (data) => {
            let result = Utils.toArray(data);
            for (const f of state.filters) {
                switch (f.type) {
                    case 'where': result = result.filter(f.predicate); break;
                    case 'sort': result = [...result].sort((a, b) => {
                        if (f.comparator) return f.comparator(a, b);
                        const av = a[f.key], bv = b[f.key];
                        if (av === bv) return 0;
                        return f.ascending ? (av > bv ? 1 : -1) : (bv > av ? 1 : -1);
                    }); break;
                    case 'limit': result = result.slice(0, f.count); break;
                    case 'map': result = result.map(f.mapper); break;
                    case 'unique': {
                        const seen = new Set();
                        result = result.filter((item) => {
                            const k = item[f.key];
                            if (k === undefined || k === null || seen.has(k)) return false;
                            seen.add(k);
                            return true;
                        });
                        break;
                    }
                }
            }
            return result;
        };

        const execute = async () => {
            const url = buildURL();
            const cacheKey = `${state.method}:${url}`;

            if (state.method === 'GET' && this.cache.has(cacheKey)) {
                return applyFilters(this.cache.get(cacheKey));
            }

            const hasBody = ['POST', 'PUT', 'PATCH'].includes(state.method);
            /** @type {RequestInit} */
            const options = {
                method: state.method,
                headers: hasBody ? { ...this.defaultHeaders } : {}
            };
            if (state.body && hasBody) options.body = JSON.stringify(state.body);

            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            // Prova sempre JSON, indipendentemente dal Content-Type
            // (un .json servito "grezzo" potrebbe non dichiararlo).
            const rawText = await response.text();
            let data;
            try { data = JSON.parse(rawText); } catch { data = rawText; }

            if (state.method === 'GET') this.cache.set(cacheKey, data);
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(state.method)) {
                this._invalidateRelatedCache(staticPrefix);
            }
            return applyFilters(data);
        };

        const api = {
            /** @param {Record<string, any>} p */
            params: (p) => { Object.assign(state.params, p); return api; },
            /** @param {Record<string, any>} q */
            query: (q) => { Object.assign(state.query, q); return api; },
            /** @param {any} b */
            body: (b) => { state.body = b; return api; },
            /** @param {(item: any) => boolean} fn */
            where: (fn) => { state.filters.push({ type: 'where', predicate: fn }); return api; },
            /** @param {string|((a:any,b:any)=>number)} keyOrFn @param {boolean} [ascending] */
            sort: (keyOrFn, ascending = true) => {
                state.filters.push(typeof keyOrFn === 'function'
                    ? { type: 'sort', comparator: keyOrFn }
                    : { type: 'sort', key: keyOrFn, ascending });
                return api;
            },
            /** @param {number} n */
            limit: (n) => { state.filters.push({ type: 'limit', count: n }); return api; },
            /** @param {(item:any)=>any} fn */
            map: (fn) => { state.filters.push({ type: 'map', mapper: fn }); return api; },
            /** @param {string} key */
            unique: (key) => { state.filters.push({ type: 'unique', key }); return api; },
            get: () => { state.method = 'GET'; return execute(); },
            post: () => { state.method = 'POST'; return execute(); },
            put: () => { state.method = 'PUT'; return execute(); },
            patch: () => { state.method = 'PATCH'; return execute(); },
            delete: () => { state.method = 'DELETE'; return execute(); }
        };
        return api;
    }

    clearCache() { this.cache.clear(); }

    /** @param {string} endpoint */
    invalidateCache(endpoint) {
        this._invalidateRelatedCache(endpoint.replace(/:\w+.*$/, '').replace(/\/$/, ''));
    }
}

// =========================================================================
// BINDING ENGINE
// -------------------------------------------------------------------------
// Due casi, scelti dalla presenza di `options.template`:
//
// 1) ASSENTE -> il target è uno stampo NEL DOM. Al primo bind:
//      - risolve lo stampo dal registry (sourceEl = target);
//      - cattura parent e nextSibling dell'originale;
//      - inserisce i cloni subito dopo l'originale;
//      - RIMUOVE l'originale.
//    Ai bind successivi il registry è in cache: si usa `resolved.__vcParent`
//    e i cloni marcati con `__vcStamp === resolved` come punto di
//    riferimento. I cloni vecchi vengono rimossi, i nuovi inseriti.
//    Il DOM visibile contiene SOLO cloni.
//
//    Il `<template>` tag come target (caso 1) NON viene rimosso: è già
//    invisibile al browser, e la sua posizione può servire ad altri. I
//    cloni vengono inseriti dopo di lui.
//
// 2) PRESENTE -> il target è il CONTAINER, `template` è lo stampo. Il
//    container viene svuotato e ripopolato ad ogni bind (mode:'replace')
//    o accodato (mode:'append'). Il template non viene toccato.
// =========================================================================

export class BindingEngine {
    /** @param {VisualCompose} app */
    constructor(app) { this.app = app; }

    /**
     * @param {string|Element} target
     * @param {string|(() => any)|Promise<any>|{get: () => any}} dataSource
     * @param {Record<string, any>} [mapping]
     * @param {BindOptions} [options]
     */
    async bind(target, dataSource, mapping = {}, options = {}) {
        const {
            template = null,
            loading = null,
            empty = null,
            error = null,
            mode = 'replace',
            onClone = null,
            runScripts = 'once'
        } = options;

        const targetIsTemplate = !template;

        /** @type {ResolvedTemplate} */
        let resolved;
        /** @type {Node} */
        let parent;
        /** @type {Node|null} */
        let insertBefore = null;
        /** @type {Element|null} */
        let originalToRemove = null;

        if (targetIsTemplate) {
            resolved = await this.app.templates.resolve(target);

            if (resolved.__vcParent && resolved.__vcParent.isConnected) {
                // --- Bind successivo: l'originale è già stato rimosso ----
                parent = resolved.__vcParent;

                const prevClones = Array.from(parent.childNodes)
                    .filter((n) => /** @type {any} */ (n).__vcStamp === resolved);

                if (mode !== 'append') {
                    prevClones.forEach((n) => n.remove());
                    insertBefore = null;   // in coda
                } else {
                    const last = prevClones[prevClones.length - 1] || null;
                    insertBefore = last ? last.nextSibling : null;
                }
            } else {
                // --- Primo bind: l'originale è nel DOM -------------------
                const original = resolved.sourceEl;
                if (!original || !original.isConnected) {
                    throw new Error(
                        `Target "${String(target)}" non trovato nel DOM. ` +
                        `Se l'elemento è già stato consumato, il registry dovrebbe ` +
                        `avere un __vcParent in cache — controlla clearTemplates().`
                    );
                }
                parent = /** @type {Node} */ (original.parentNode);
                insertBefore = original.nextSibling;
                resolved.__vcParent = parent;

                // Nasconde subito l'originale (sincrono, PRIMA di qualunque
                // fetch/await): altrimenti la card "grezza" resterebbe
                // visibile insieme al messaggio di loading finché i dati
                // non arrivano. La rimozione fisica dal DOM resta più
                // avanti (dopo l'inserimento dei cloni, o nel ramo "dati
                // vuoti"); qui la nascondiamo e basta.
                if (original.tagName !== 'TEMPLATE') {
                    /** @type {HTMLElement} */ (original).hidden = true;
                }

                // Il <template> tag non va rimosso: è già invisibile, e la
                // sua posizione può servire ad altri.
                if (original.tagName !== 'TEMPLATE') {
                    originalToRemove = /** @type {Element} */ (original);
                }
            }
        } else {
            // --- Container esplicito -------------------------------------
            const container = this._resolveElement(target);
            if (!container) throw new Error(`Target non trovato: ${String(target)}`);
            resolved = await this.app.templates.resolve(template);
            parent = container;
            insertBefore = null;

            if (mode !== 'append') {
                container.replaceChildren();
            }
        }

        const scripts = resolved.scripts;

        // --- Stato transitorio (loading/empty/error) -------------------
        /** @type {Element|null} */
        let statusHost = null;
        const ensureStatusHost = () => {
            if (statusHost) return statusHost;
            statusHost = document.createElement('div');
            statusHost.className = 'vc-status';
            if (insertBefore && insertBefore.parentNode === parent) {
                parent.insertBefore(statusHost, insertBefore);
            } else {
                parent.appendChild(statusHost);
            }
            return statusHost;
        };

        if (loading) {
            ensureStatusHost().innerHTML = `<div class="vc-loading">${loading}</div>`;
        }

        // --- Risoluzione dati ------------------------------------------
        /** @type {any[]} */
        let items;
        try {
            const data = await this._resolveDataSource(dataSource);
            items = Utils.toArray(data);
        } catch (err) {
            await renderInto(
                this.app.templates,
                ensureStatusHost(),
                error || this._defaultErrorTemplate(/** @type {Error} */ (err))
            );
            // Non rimuoviamo l'originale in caso di errore: il prossimo
            // bind può riprovare.
            throw err;
        }

        // --- Dati vuoti -------------------------------------------------
        if (items.length === 0) {
            const host = ensureStatusHost();
            if (empty) await renderInto(this.app.templates, host, empty);
            else host.innerHTML = '<div class="vc-no-data">Nessun dato disponibile</div>';

            // Anche con dati vuoti, se era il primo bind, rimuoviamo
            // l'originale: altrimenti il prossimo bind non saprebbe dove
            // mettersi (l'originale è stato "consumato").
            if (originalToRemove) originalToRemove.remove();

            return [];
        }

        if (statusHost) statusHost.remove();

        // --- Costruzione cloni ------------------------------------------
        const fragment = document.createDocumentFragment();
        items.forEach((item, index) => {
            const clone = /** @type {Element} */ (resolved.content.cloneNode(true));
            this._applyMapping(clone, item, mapping, index);
            if (onClone) {
                try { onClone(clone, item, index); }
                catch (e) { console.error('onClone error:', e); }
            }
            // FIX: resolved.content è SEMPRE un DocumentFragment, quindi
            // anche il suo clone lo è (nodeType 11, mai 1). Marcare `clone`
            // stesso non serve a nulla: al momento dell'inserimento un
            // fragment viene "srotolato" (i suoi figli si spostano nel DOM,
            // il fragment stesso resta vuoto) e qualunque proprietà scritta
            // sul fragment va persa. Va marcato ogni FIGLIO reale del
            // fragment, PRIMA di appenderlo — sono quei nodi, non il
            // fragment, a sopravvivere nel DOM ed essere ritrovabili al
            // bind successivo.
            Array.from(clone.childNodes).forEach((n) => {
                if (n.nodeType === 1) /** @type {any} */ (n).__vcStamp = resolved;
            });
            fragment.appendChild(clone);
        });

        // --- Inserimento ------------------------------------------------
        if (insertBefore && insertBefore.parentNode === parent) {
            parent.insertBefore(fragment, insertBefore);
        } else {
            parent.appendChild(fragment);
        }

        // --- Rimozione originale (solo primo bind, elemento visibile) ---
        if (originalToRemove) originalToRemove.remove();

        // --- Script -----------------------------------------------------
        if (scripts.length > 0 && runScripts !== 'never') {
            if (runScripts === 'once') {
                await ScriptLoader.load(scripts, /** @type {Element} */ (parent), { dedupe: false });
            } else if (runScripts === 'per-clone') {
                const clones = Array.from(parent.childNodes)
                    .filter((n) => /** @type {any} */ (n).__vcStamp === resolved)
                    .slice(-items.length);
                for (const clone of clones) {
                    if (clone.nodeType === 1) {
                        await ScriptLoader.load(scripts, /** @type {Element} */ (clone), { dedupe: false });
                    }
                }
            }
        }

        return items;
    }

    /** @param {Error} err */
    _defaultErrorTemplate(err) {
        return `<div class="vc-error">${Utils.escapeHTML(err.message)}</div>`;
    }

    /** @param {string|Element} ref @returns {Element|null} */
    _resolveElement(ref) {
        if (ref instanceof Element) return ref;
        if (typeof ref === 'string') {
            try { return document.querySelector(ref); }
            catch { return null; }
        }
        return null;
    }

    /** @param {string|(() => any)|Promise<any>|{get: () => any}} source */
    async _resolveDataSource(source) {
        if (typeof source === 'string') return this.app.api.table(source).get();
        if (typeof source === 'function') return source();
        if (source && typeof (/** @type {any} */ (source)).then === 'function') return source;
        if (source && typeof (/** @type {any} */ (source)).get === 'function') {
            return (/** @type {any} */ (source)).get();
        }
        return source;
    }

    /** @param {Element} root @param {any} data @param {Record<string, any>} mapping @param {number} index */
    _applyMapping(root, data, mapping, index) {
        const params = this.app.router.currentParams || {};
        for (const [selector, valueSource] of Object.entries(mapping)) {
            const elements = this._findElements(root, selector);
            elements.forEach((el) => this._applyElementBinding(el, data, valueSource, index, params));
        }
    }

    /** @param {Element} el @param {any} data @param {any} valueSource @param {number} index @param {RouteParams} params */
    _applyElementBinding(el, data, valueSource, index, params) {
        if (typeof valueSource === 'object' && valueSource !== null && !Array.isArray(valueSource)) {
            for (const [prop, val] of Object.entries(valueSource)) {
                this._setElementProperty(el, prop, this._resolveValue(data, val, index, params));
            }
        } else {
            this._applyElementValue(el, this._resolveValue(data, valueSource, index, params));
        }
    }

    /** @param {Element} el @param {string} prop @param {any} value */
    _setElementProperty(el, prop, value) {
        if (value === null || value === undefined) return;
        const lower = prop.toLowerCase();

        if (lower.startsWith('on') && typeof value === 'function') {
            el.addEventListener(lower.slice(2), value);
            return;
        }

        const anyEl = /** @type {any} */ (el);
        switch (lower) {
            case 'text': case 'textcontent': el.textContent = value; break;
            case 'html': case 'innerhtml': el.innerHTML = value; break;
            case 'value': anyEl.value = value; break;
            case 'href': anyEl.href = value; break;
            case 'src': anyEl.src = value; break;
            case 'alt': anyEl.alt = value; break;
            case 'title': anyEl.title = value; break;
            case 'class': case 'classname':
                anyEl.className = Array.isArray(value) ? value.join(' ') : value;
                break;
            case 'style': anyEl.style.cssText = value; break;
            case 'disabled': anyEl.disabled = !!value; break;
            case 'checked': anyEl.checked = !!value; break;
            case 'selected': anyEl.selected = !!value; break;
            default:
                if (value === false) el.removeAttribute(prop);
                else el.setAttribute(prop, value === true ? '' : value);
        }
    }

    /** @param {Element} el @param {any} value */
    _applyElementValue(el, value) {
        if (value === null || value === undefined) return;
        const tag = el.tagName.toLowerCase();
        const anyEl = /** @type {any} */ (el);
        if (tag === 'input' || tag === 'textarea' || tag === 'select') { anyEl.value = value; return; }
        if (tag === 'img') { anyEl.src = value; return; }
        if (tag === 'a') {
            anyEl.href = value;
            if (!el.textContent?.trim()) el.textContent = value;
            return;
        }
        el.textContent = value;
    }

    /** @param {any} data @param {any} valueSource @param {number} index @param {RouteParams} params */
    _resolveValue(data, valueSource, index, params) {
        if (typeof valueSource === 'function') return valueSource(data, index, params);
        if (typeof valueSource === 'string') {
            if (valueSource.startsWith('params.')) return Utils.getNestedValue(params, valueSource.slice(7));
            if (valueSource === '$index') return index;
        }
        return Utils.getNestedValue(data, valueSource);
    }

    /** @param {Element} root @param {string} selector */
    _findElements(root, selector) {
        /** @type {Element[]} */
        const results = [];
        try {
            if (root.nodeType === 1 && root.matches?.(selector)) results.push(root);
        } catch { /* selettore non valido per matches, ignora */ }
        try {
            root.querySelectorAll?.(selector).forEach((el) => results.push(el));
        } catch { /* selettore non valido per querySelectorAll, ignora */ }
        return results;
    }
}

// =========================================================================
// VISUALCOMPOSE — facciata pubblica
// =========================================================================

export class VisualCompose {
    /** @param {AppConfig} [config] */
    constructor(config = {}) {
        this.templates = new TemplateRegistry();
        this.api = new ApiClient();
        this.router = new Router(this);
        this.binding = new BindingEngine(this);

        if (config.mode) this.router.setMode(config.mode);
        if (config.baseURL) this.api.setBaseURL(config.baseURL);
    }

    /** @param {AppConfig} [config] */
    init(config = {}) {
        if (config.mode) this.router.setMode(config.mode);
        if (config.baseURL) this.api.setBaseURL(config.baseURL);
        return this;
    }

    // --- Routing ---------------------------------------------------
    /** @param {string} pattern @param {RouteOptions} [options] */
    route(pattern, options) { this.router.add(pattern, options); return this; }

    // --- Dati ------------------------------------------------------
    /** @param {string} endpoint */
    table(endpoint) { return this.api.table(endpoint); }
    /** @param {string} url */
    setBaseURL(url) { this.api.setBaseURL(url); return this; }
    clearCache() { return this.api.clearCache(); }
    /** @param {string} pattern */
    invalidateCache(pattern) { return this.api.invalidateCache(pattern); }

    // --- Templates -------------------------------------------------
    /** @param {TemplateSource} source @param {string|null} [name] */
    async loadTemplate(source, name = null) {
        const resolved = await this.templates.resolve(source);
        if (name) this.templates.register(name, resolved);
        return resolved;
    }
    clearTemplates() { this.templates.clear(); return this; }

    // --- Rendering -------------------------------------------------
    /**
     * @param {string|Element} target
     * @param {string|(() => any)|Promise<any>|{get: () => any}} dataSource
     * @param {Record<string, any>} [mapping]
     * @param {BindOptions} [options]
     */
    bind(target, dataSource, mapping, options) {
        return this.binding.bind(target, dataSource, mapping, options);
    }

    /**
     * @param {string|Element} target
     * @param {TemplateSource} source
     * @param {RenderOptions} [options]
     */
    async render(target, source, options = {}) {
        const targetEl = typeof target === 'string' ? document.querySelector(target) : target;
        if (!targetEl) throw new Error(`Target non trovato: ${String(target)}`);
        return renderInto(this.templates, targetEl, source, options);
    }

    // --- Runtime ---------------------------------------------------
    /** @param {string} path @param {{replace?: boolean}} [options] */
    navigate(path, options) { return this.router.navigate(path, options); }
    /** @param {string} key */
    getParam(key) { return this.router.getParam(key); }

    // --- Ciclo di vita ---------------------------------------------
    start() { return this.router.start(); }
    destroy() {
        this.router.destroy();
        this.templates.clear();
        this.api.clearCache();
    }

    /** @param {AppConfig} [config] */
    static create(config = {}) {
        return new VisualCompose(config);
    }
}

export default VisualCompose;