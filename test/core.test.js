import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Utils, TemplateRegistry, ApiClient, VisualCompose } from '../src/visualcompose.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => JSON.stringify(routes[key]) };
  });
  return calls;
}

describe('Utils', () => {
  it('toArray', () => {
    expect(Utils.toArray(null)).toEqual([]);
    expect(Utils.toArray(1)).toEqual([1]);
    expect(Utils.toArray([1, 2])).toEqual([1, 2]);
  });
  it('getNestedValue', () => {
    expect(Utils.getNestedValue({ a: { b: 3 } }, 'a.b')).toBe(3);
    expect(Utils.getNestedValue({ a: null }, 'a.b')).toBeUndefined();
  });
});

describe('TemplateRegistry', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  it('risolve HTML inline ed estrae gli script', async () => {
    const r = await new TemplateRegistry().resolve('<p>ciao</p><script>1</script>');
    expect(r.scripts).toHaveLength(1);
    expect(r.content.querySelector('script')).toBeNull();
  });
  it('risolve un <template> senza consumarlo', async () => {
    document.body.innerHTML = '<template id="t"><li>x</li></template>';
    const r = await new TemplateRegistry().resolve('#t');
    expect(r.content.querySelector('li')).not.toBeNull();
    expect(document.querySelector('#t')).not.toBeNull();
  });
  it('lancia errore chiaro se il template non esiste', async () => {
    await expect(new TemplateRegistry().resolve('#nope')).rejects.toThrow(/Template non trovato/);
  });
});

describe('ApiClient', () => {
  it('costruisce URL con params e query e filtra in locale', async () => {
    const calls = mockFetch({ 'http://x/users': [{ id: 2, n: 'b' }, { id: 1, n: 'a' }, { id: 3, n: 'c' }] });
    const api = new ApiClient('http://x');
    const res = await api.table('users').query({ q: 'z', tag: ['a', 'b'] }).sort('id').limit(2).get();
    expect(calls[0].url).toBe('http://x/users?q=z&tag=a&tag=b');
    expect(res.map((u) => u.id)).toEqual([1, 2]);
  });
  it('sostituisce :param', async () => {
    const calls = mockFetch({ 'http://x/users/5': { id: 5 } });
    await new ApiClient('http://x').table('users/:id').params({ id: 5 }).get();
    expect(calls[0].url).toBe('http://x/users/5');
  });
  it('cache GET e invalidazione dopo POST', async () => {
    const calls = mockFetch({ 'http://x/users': [] });
    const api = new ApiClient('http://x');
    await api.table('users').get();
    await api.table('users').get();
    expect(calls).toHaveLength(1);
    await api.table('users').body({ a: 1 }).post();
    await api.table('users').get();
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST', 'GET']);
  });
  it('non invalida endpoint con prefisso simile (users vs users-archive)', async () => {
    const calls = mockFetch({ 'http://x/users-archive': [], 'http://x/users': [] });
    const api = new ApiClient('http://x');
    await api.table('users-archive').get();
    await api.table('users').body({}).post();
    await api.table('users-archive').get();
    expect(calls.filter((c) => c.url.endsWith('users-archive'))).toHaveLength(1);
  });
  it('HTTP error -> eccezione', async () => {
    mockFetch({});
    await expect(new ApiClient('http://x').table('nope').get()).rejects.toThrow('HTTP 404');
  });
});

describe('Router', () => {
  let app;
  beforeEach(() => { history.replaceState({}, '', '/'); app = VisualCompose.create({ mode: 'spa' }); });

  it('estrae path e query params, chiama onEnter/onLeave', async () => {
    const enter = vi.fn(), leave = vi.fn();
    app.route('/users/:id', { onEnter: enter, onLeave: leave }).route('*', {});
    history.replaceState({}, '', '/users/42?tab=info');
    await app.start();
    expect(enter).toHaveBeenCalledWith({ id: '42', 'query.tab': 'info' });
    await app.navigate('/other');
    expect(leave).toHaveBeenCalledOnce();
    app.destroy();
  });
  it('la prima rotta registrata vince; * fa da 404', async () => {
    const a = vi.fn(), nf = vi.fn();
    app.route('/a', { onEnter: a }).route('*', { onEnter: nf });
    await app.start();
    await app.navigate('/a');
    await app.navigate('/boom');
    expect(a).toHaveBeenCalledOnce();
    expect(nf).toHaveBeenCalled();
    app.destroy();
  });
  it('supporta rotte hash', async () => {
    const h = vi.fn();
    app.route('#/item/:id', { onEnter: h });
    history.replaceState({}, '', '/#/item/7');
    await app.start();
    expect(h).toHaveBeenCalledWith({ id: '7' });
    app.destroy();
  });
});

describe('BindingEngine', () => {
  beforeEach(() => { document.body.innerHTML = ''; mockFetch({ 'http://x/users': [{ name: 'Ada', mail: 'a@x' }, { name: 'Bob', mail: 'b@x' }] }); });

  it('stampo in-place: clona N volte e rimuove l\'originale', async () => {
    document.body.innerHTML = '<ul><li class="u"><b class="n"></b></li></ul>';
    const app = VisualCompose.create({ baseURL: 'http://x' });
    await app.bind('.u', 'users', { '.n': 'name' });
    expect(document.querySelectorAll('li.u')).toHaveLength(2);
    expect([...document.querySelectorAll('.n')].map((e) => e.textContent)).toEqual(['Ada', 'Bob']);
  });
  it('re-bind in-place sostituisce i cloni (nessun duplicato)', async () => {
    document.body.innerHTML = '<ul><li class="u"><b class="n"></b></li></ul>';
    const app = VisualCompose.create({ baseURL: 'http://x' });
    await app.bind('.u', 'users', { '.n': 'name' });
    await app.bind('.u', 'users', { '.n': 'name' });
    expect(document.querySelectorAll('li.u')).toHaveLength(2);
  });
  it('modalità container: svuota e riempie', async () => {
    document.body.innerHTML = '<div id="c">old</div><template id="t"><p class="n"></p></template>';
    const app = VisualCompose.create({ baseURL: 'http://x' });
    await app.bind('#c', 'users', { '.n': 'name' }, { template: '#t' });
    expect(document.querySelectorAll('#c p')).toHaveLength(2);
  });
  it('mapping con oggetto: attributi, funzioni, eventi, $index', async () => {
    document.body.innerHTML = '<div id="c"></div><template id="t"><a class="l"></a></template>';
    const app = VisualCompose.create({ baseURL: 'http://x' });
    const click = vi.fn();
    await app.bind('#c', 'users', { '.l': { text: (d, i) => `${i}:${d.name}`, 'data-mail': 'mail', onclick: click } }, { template: '#t' });
    const a = document.querySelector('#c a');
    expect(a.textContent).toBe('0:Ada');
    expect(a.getAttribute('data-mail')).toBe('a@x');
    a.click(); expect(click).toHaveBeenCalled();
  });
  it('dati vuoti -> messaggio empty', async () => {
    document.body.innerHTML = '<div id="c"></div><template id="t"><p></p></template>';
    const app = VisualCompose.create();
    await app.bind('#c', () => [], {}, { template: '#t', empty: '<i id="e">vuoto</i>' });
    expect(document.querySelector('#e')).not.toBeNull();
  });
  it('errore dati -> template error e rilancio', async () => {
    document.body.innerHTML = '<div id="c"></div><template id="t"><p></p></template>';
    const app = VisualCompose.create();
    await expect(app.bind('#c', () => { throw new Error('boom'); }, {}, { template: '#t', error: '<i id="er">ko</i>' })).rejects.toThrow('boom');
    expect(document.querySelector('#er')).not.toBeNull();
  });
});

describe('Sicurezza (documenta il comportamento attuale)', () => {
  it('messaggio di errore con HTML viene escapato', async () => {
    document.body.innerHTML = '<div id="c"></div>';
    const app = VisualCompose.create();
    await app.render('#c', '<img src=x onerror="window.__xss=1">'.replace('<img', '#<img'));
    await flush();
    expect(document.querySelector('#c img')).toBeNull();
  });
});
