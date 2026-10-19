import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../tools/serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync(process.execPath, ['build.mjs'], { cwd: root });
const html = await readFile(path.join(root, 'build/index.html'), 'utf8');
const worker = await readFile(path.join(root, 'build/service-worker.js'), 'utf8');
const app = await readFile(path.join(root, 'src/app.js'), 'utf8');

function page({ stored = {}, blocked = false, hostname = 'example.github.io' } = {}) {
  const values = new Map(Object.entries(stored));
  const elements = Object.fromEntries(['phone', 'places', 'datetime', 'reset'].map(id => [id, {
    textContent: '',
    listeners: {},
    addEventListener(event, callback) { this.listeners[event] = callback; },
  }]));
  let input = null;
  let confirmed = true;
  const registrations = [];
  vm.runInNewContext(app.replace('import.meta.url', '"https://example.github.io/trip-card/app.js"'), {
    document: { getElementById: id => elements[id] },
    localStorage: {
      getItem(key) { if (blocked) throw Error('Blocked'); return values.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error('Blocked'); values.set(key, value); },
      removeItem(key) { if (blocked) throw Error('Blocked'); values.delete(key); },
    },
    window: { prompt: () => input, confirm: () => confirmed },
    navigator: { serviceWorker: { register: (...args) => { registrations.push(args); return Promise.resolve(); } } },
    location: { hostname }, URL, console,
  });
  return {
    elements, values, registrations,
    edit(id, value) { input = value; elements[id].listeners.click(); },
    reset(confirm = true) { confirmed = confirm; elements.reset.listeners.click(); },
  };
}

function serviceWorker({ offline = false } = {}) {
  const listeners = {};
  const scope = 'https://example.github.io/trip-card/';
  const prefix = `trip-card:${scope}:`;
  const old = `${prefix}old`;
  const unrelated = 'another-app-cache';
  const stores = new Map([[old, new Map()], [unrelated, new Map()]]);
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async key => stores.delete(key),
    open: async key => {
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key);
      return {
        async addAll(requests) { for (const request of requests) store.set(request.url, new Response(request.url)); },
        async match(request, { ignoreSearch } = {}) {
          const url = new URL(typeof request === 'string' ? request : request.url);
          if (ignoreSearch) url.search = '';
          return store.get(url.href)?.clone();
        },
      };
    },
  };
  vm.runInNewContext(worker, {
    self: {
      registration: { scope },
      addEventListener: (type, callback) => { listeners[type] = callback; },
      skipWaiting: async () => {}, clients: { claim: async () => {} },
    },
    caches, URL, Request,
    fetch: async () => { if (offline) throw Error('Offline'); return new Response('network'); },
  });
  return { listeners, stores, old, unrelated, scope };
}

async function lifecycle(listener) {
  let pending;
  listener({ waitUntil(promise) { pending = promise; } });
  await pending;
}

function dispatchFetch(sw, request) {
  let response;
  sw.listeners.fetch({ request, respondWith(promise) { response = promise; } });
  return response;
}

test('build produces a single-page site with valid JavaScript and deterministic assets', async () => {
  assert.deepEqual((await readdir(path.join(root, 'build'))).sort(), ['.nojekyll', 'app.css', 'app.js', 'index.html', 'manifest.json', 'service-worker.js', 'static']);
  assert.doesNotMatch(worker, /__VERSION__|__ASSETS__/);
  new vm.Script(worker);
  execFileSync(process.execPath, ['--check', 'build/app.js'], { cwd: root });
  execFileSync(process.execPath, ['build.mjs'], { cwd: root });
  assert.equal(await readFile(path.join(root, 'build/service-worker.js'), 'utf8'), worker);
  const manifest = JSON.parse(await readFile(path.join(root, 'build/manifest.json'), 'utf8'));
  assert.equal(manifest.scope, './');
  assert.equal(manifest.start_url, './');
});

test('site and every referenced asset load at root and GitHub Pages subpath', async () => {
  for (const base of ['/', '/trip-card/']) {
    const server = createStaticServer({ directory: path.join(root, 'build'), base });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const response = await fetch(origin + base);
      assert.equal(response.status, 200);
      const resources = [...html.matchAll(/(?:href|src)="(\.\/[^\"]+)"/g)].map(match => match[1]);
      resources.push('./service-worker.js');
      for (const resource of resources) {
        const asset = await fetch(new URL(resource, origin + base));
        assert.equal(asset.status, 200, resource);
        await asset.arrayBuffer();
      }
      assert.equal((await fetch(origin + base + 'missing')).status, 404);
      assert.equal((await fetch(origin + base, { method: 'POST' })).status, 405);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('editing persists values, normalizes separators and renders input as text', () => {
  const p = page();
  assert.equal(p.elements.phone.textContent, '138****0000');
  assert.match(p.elements.datetime.textContent, /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/);
  p.edit('phone', '13912345678');
  assert.equal(p.elements.phone.textContent, '139****5678');
  assert.equal(p.values.get('_phone'), '13912345678');
  p.edit('places', '<img src=x onerror=alert(1)>，上海市');
  assert.equal(p.elements.places.textContent, '<img src=x onerror=alert(1)>,上海市');
  assert.equal(p.elements.places.innerHTML, undefined);
  p.edit('places', null);
  assert.equal(p.values.get('_trip_card_places'), '<img src=x onerror=alert(1)>，上海市');
  p.edit('places', '  ');
  assert.equal(p.elements.places.textContent, '北京市');
  assert.equal(p.values.has('_trip_card_places'), false);
});

test('reset affects only this app fields and respects cancellation', () => {
  const p = page({ stored: { _phone: '13912345678', _trip_card_places: '上海市', unrelated: 'keep' } });
  p.reset(false);
  assert.equal(p.elements.places.textContent, '上海市');
  p.reset();
  assert.equal(p.elements.phone.textContent, '138****0000');
  assert.equal(p.elements.places.textContent, '北京市');
  assert.deepEqual([...p.values], [['unrelated', 'keep']]);
});

test('editing works with blocked storage and localhost skips registration', () => {
  const p = page({ blocked: true, hostname: 'localhost' });
  p.edit('places', '上海市');
  assert.equal(p.elements.places.textContent, '上海市');
  p.reset();
  assert.equal(p.elements.places.textContent, '北京市');
  assert.equal(p.registrations.length, 0);
  const production = page();
  assert.equal(production.registrations[0][0].href, 'https://example.github.io/trip-card/service-worker.js');
});

test('worker precaches all resources and removes only its own obsolete caches', async () => {
  const sw = serviceWorker();
  await lifecycle(sw.listeners.install);
  await lifecycle(sw.listeners.activate);
  assert.equal(sw.stores.has(sw.old), false);
  assert.equal(sw.stores.has(sw.unrelated), true);
  const current = [...sw.stores.entries()].find(([key]) => key !== sw.unrelated)[1];
  for (const match of html.matchAll(/(?:href|src)="(\.\/[^\"]+)"/g)) {
    assert.ok(current.has(new URL(match[1], sw.scope).href), match[1]);
  }
});

test('worker serves offline navigations and assets in the project scope only', async () => {
  const sw = serviceWorker({ offline: true });
  await lifecycle(sw.listeners.install);
  for (const pathname of ['', 'index.html', '?from=homescreen']) {
    const response = await dispatchFetch(sw, { url: sw.scope + pathname, method: 'GET', mode: 'navigate' });
    assert.equal(await response.text(), sw.scope + 'index.html');
  }
  const image = await dispatchFetch(sw, new Request(sw.scope + 'static/g2.png?v=1'));
  assert.equal(await image.text(), sw.scope + 'static/g2.png');
  assert.equal(dispatchFetch(sw, new Request('https://example.github.io/other/')), undefined);
  assert.equal(dispatchFetch(sw, new Request('https://external.example/image.png')), undefined);
  assert.equal(dispatchFetch(sw, new Request(sw.scope, { method: 'POST' })), undefined);
});

test('worker prefers the network when online', async () => {
  const sw = serviceWorker();
  await lifecycle(sw.listeners.install);
  const response = await dispatchFetch(sw, new Request(sw.scope));
  assert.equal(await response.text(), 'network');
});
