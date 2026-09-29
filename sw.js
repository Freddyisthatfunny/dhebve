/* ExePlayer service worker (shared by the main app and exported standalone game sites)
 *
 * Every real file lives at the top level of the site (no folders). The app uses two *virtual* paths:
 *   engine/<file>  -> imported engine file (IndexedDB), else <file> at the site root (or at game.json "engineBase")
 *   games/<file>   -> imported game (IndexedDB), else <file> at the site root
 * Big files can be stored as <file>.001, .002 ... plus <file>.parts.json; they're stitched back together here.
 * Downloads are cached, so games load fast and play offline after the first run.
 * COOP/COEP headers are added so SharedArrayBuffer works, and the mobile patch is injected into the engine page.
 */
const SHELL_CACHE = 'exeplayer-shell-v7';
const ENGINE_CACHE = 'exeplayer-engine-v3';   // v3 = Wine 11 (web Direct3D)
const SHELL = ['./', './index.html', './app.js', './player.js', './game.json', './controls.js', './engine-patch.js',
  './style.css', './jszip.min.js', './standalone.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE)
    .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys())
      if ((k.startsWith('exeplayer-shell-') && k !== SHELL_CACHE) || (k.startsWith('exeplayer-engine-') && k !== ENGINE_CACHE)) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => { if (e.data === 'reset-config') configP = null; });

/* ---------- IndexedDB (same schema as app.js) ---------- */
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('exeplayer', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['files', 'engine']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

/* ---------- helpers ---------- */
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', wasm: 'application/wasm',
  css: 'text/css', zip: 'application/zip', json: 'application/json', data: 'application/octet-stream',
  png: 'image/png', woff: 'font/woff', woff2: 'font/woff2', svg: 'image/svg+xml' };
const typeOf = n => TYPES[(n.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
function isolate(resp, name) {
  if (!resp || resp.status === 0 || resp.type === 'opaque') return resp;
  const h = new Headers(resp.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  const n = name || (resp.url ? new URL(resp.url).pathname : '');
  if (n && (!h.get('Content-Type') || /octet-stream|text\/plain/.test(h.get('Content-Type')))) h.set('Content-Type', typeOf(n));
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}
function blobResponse(blob, name, head) {
  return isolate(new Response(head ? null : blob, { status: 200, headers: { 'Content-Type': typeOf(name), 'Content-Length': String(blob.size) } }), name);
}
async function injectPatch(resp) {
  const html = await resp.text();
  const tag = `<script src="${new URL('engine-patch.js', self.registration.scope).pathname}"></script>`;
  const out = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + tag) : tag + html;
  const h = new Headers(resp.headers); h.set('Content-Type', 'text/html; charset=utf-8'); h.delete('Content-Length');
  return new Response(out, { status: 200, headers: h });
}

// Exported standalone sites describe themselves in game.json
let configP = null;
function siteConfig() {
  if (!configP) configP = (async () => {
    const url = new URL('game.json', self.registration.scope).href;
    try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) return await r.json(); } catch {}
    try { const c = await caches.match(url); if (c) return await c.json(); } catch {}
    return null;
  })();
  return configP;
}

const fetchOpts = (url, method) => ({ method, mode: new URL(url).origin === location.origin ? 'same-origin' : 'cors', credentials: 'omit' });

// Download a file, or its .001/.002... parts stitched together if the whole file isn't there
async function fetchWholeOrParts(remote, head) {
  const r = await fetch(remote, fetchOpts(remote, head ? 'HEAD' : 'GET'));
  if (r.ok) return r;
  const pr = await fetch(remote + '.parts.json', fetchOpts(remote, 'GET')).catch(() => null);
  if (!pr || !pr.ok) return r;
  const info = await pr.json();
  const headers = { 'Content-Type': typeOf(remote), 'Content-Length': String(info.size) };
  if (head) return new Response(null, { status: 200, headers });
  const urls = info.parts.map(p => new URL(p.name, remote).href);
  let i = 0, reader = null;
  const body = new ReadableStream({
    async pull(ctrl) {
      for (;;) {
        if (!reader) {
          if (i >= urls.length) { ctrl.close(); return; }
          const pr2 = await fetch(urls[i], fetchOpts(urls[i], 'GET'));
          if (!pr2.ok) { ctrl.error(new Error('missing part ' + urls[i])); return; }
          reader = pr2.body.getReader(); i++;
        }
        const { done, value } = await reader.read();
        if (done) { reader = null; continue; }
        ctrl.enqueue(value); return;
      }
    }
  });
  return new Response(body, { status: 200, headers });
}

// Cache-first download of a large file. `local` is the cache key, `remote` where it really lives.
async function cachedFetch(local, remote, head) {
  const cache = await caches.open(ENGINE_CACHE);
  const hit = await cache.match(local);
  if (hit) return head ? new Response(null, { status: 200, headers: hit.headers }) : hit;
  const resp = await fetchWholeOrParts(remote, head);
  if (head || !resp.ok || resp.status !== 200 || !resp.body) return resp;
  const [a, b] = resp.body.tee();
  const h = new Headers(resp.headers);
  cache.put(local, new Response(b, { status: 200, headers: h })).catch(() => {});   // storage full: still serve it
  return new Response(a, { status: 200, headers: h });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' && req.method !== 'HEAD') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  const rel = decodeURIComponent(url.pathname.slice(scope.pathname.length));
  const head = req.method === 'HEAD';
  const local = new URL(url.pathname, url.origin).href;   // cache key without query string

  // Leave icons and the manifest alone: iOS reads them directly for "Add to Home Screen"
  if (/\.(png|ico|webmanifest)$/i.test(rel) && !rel.includes('/')) return;

  if (rel.startsWith('games/')) {
    e.respondWith((async () => {
      const name = rel.slice(6);
      const blob = await idbGet('files', name).catch(() => null);
      if (blob) return blobResponse(blob, name, head);
      try { return isolate(await cachedFetch(local, new URL(name, scope).href, head), name); }
      catch { return new Response('game not found', { status: 404 }); }
    })());
    return;
  }

  if (rel.startsWith('engine/')) {
    e.respondWith((async () => {
      const name = rel.slice(7);
      let resp;
      const blob = await idbGet('engine', name).catch(() => null);
      if (blob) resp = blobResponse(blob, name, head);
      else {
        const cfg = await siteConfig();
        const base = cfg && cfg.engineBase ? cfg.engineBase : scope.href;
        try { resp = isolate(await cachedFetch(local, new URL(name, base).href, head), name); }
        catch { return new Response('engine file missing', { status: 404 }); }
      }
      if (!head && /\.html?$/i.test(name) && resp.ok) return injectPatch(resp);
      return resp;
    })());
    return;
  }

  if (head) return;
  // App shell: network first (so updates land), cache fallback (offline)
  e.respondWith((async () => {
    try {
      const resp = await fetch(req);
      if (resp.ok && SHELL.some(p => new URL(p, scope).pathname === url.pathname)) {
        const c = await caches.open(SHELL_CACHE); c.put(local, resp.clone());
      }
      return isolate(resp);
    } catch {
      const hit = await caches.match(local, { ignoreSearch: true }) || (req.mode === 'navigate' && await caches.match(new URL('./', scope).href));
      return hit ? isolate(hit) : new Response('offline', { status: 503 });
    }
  })());
});
