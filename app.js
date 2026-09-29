/* ExePlayer — library, importing, engine setup and launching */
(() => {
  const $ = s => document.querySelector(s);
  const APPDIR = '/home/username/.wine/dosdevices/c:/files';
  const SKIP_EXE = /(^|\/)(unins\w*|setup|install\w*|vcredist\w*|dxsetup|dxwebsetup|directx\w*|crash\w*|bugreport|report\w*|update\w*|patch\w*|redist\w*|dotnet\w*|oalinst|physx\w*)\.exe$/i;

  /* ---------------- IndexedDB ---------------- */
  let dbp;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('exeplayer', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('games')) d.createObjectStore('games', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
      if (!d.objectStoreNames.contains('engine')) d.createObjectStore('engine');
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode); const s = t.objectStore(store); let out;
      const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  };
  const put = (store, val, key) => tx(store, 'readwrite', s => s.put(val, key));
  const get = (store, key) => tx(store, 'readonly', s => s.get(key));
  const del = (store, key) => tx(store, 'readwrite', s => s.delete(key));
  const all = store => tx(store, 'readonly', s => s.getAll());
  const keys = store => tx(store, 'readonly', s => s.getAllKeys());

  /* ---------------- helpers ---------------- */
  const toastEl = $('#toast'); let toastT;
  const toast = (msg, ms = 3500) => { toastEl.style.pointerEvents = ''; toastEl.onclick = null; toastEl.textContent = msg; toastEl.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.add('hidden'), ms); };
  window.ExePlayerToast = toast;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const fmt = n => n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
  const base = p => p.split('/').pop();
  const dir = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
  const prettyName = p => base(p).replace(/\.(exe|zip)$/i, '').replace(/[_\-.]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  const hue = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const progress = (frac, label) => {
    const p = $('#importProgress');
    if (frac == null) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden'); p.querySelector('.bar').style.width = Math.round(frac * 100) + '%'; p.querySelector('.label').textContent = label;
  };

  // Look at an exe's header: 32-bit Windows, 64-bit Windows, or DOS
  function exeArch(bytes) {
    try {
      const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (v.getUint16(0, true) !== 0x5a4d) return 'unknown';
      const pe = v.getUint32(0x3c, true);
      if (pe + 6 > bytes.length || v.getUint32(pe, true) !== 0x4550) return 'dos';
      const m = v.getUint16(pe + 4, true);
      return m === 0x14c ? 'win32' : (m === 0x8664 || m === 0xaa64) ? 'win64' : 'other';
    } catch { return 'unknown'; }
  }
  const ARCH_NOTE = { win32: '', win64: '64‑bit — won\'t run', dos: 'DOS program', other: 'Non‑x86', unknown: '' };

  function rankExes(exes) {
    const score = e => (SKIP_EXE.test(e.path) ? -1000 : 0) + (e.arch === 'win64' ? -500 : 0) + (e.arch === 'win32' ? 50 : 0)
      - e.path.split('/').length * 10 + Math.log10(e.size + 1) * 5;
    return exes.slice().sort((a, b) => score(b) - score(a));
  }

  /* ---------------- engine ---------------- */
  // Wine file system: one zip, or a Linux base zip with the Wine zip layered on top
  function setFsParams(q, root, base) {
    if (base && base !== root) { q.set('root', base); q.set('overlay', root); } else q.set('root', root);
  }
  const engine = { entry: null, source: null, roots: [], base: null, root: localStorage.getItem('exeplayer.root') || 'boxedwine.zip' };
  const BASE_FS = 'wine-ready.zip';   // Wine already set up (made once by ExePlayer), layered over the Wine file system so games skip first-time setup

  async function hosted(name) {
    try { const r = await fetch('engine/' + name, { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch { return false; }
  }
  async function detectEngine() {
    const local = (await keys('engine')).map(String);
    const htmls = local.filter(n => /\.html$/i.test(n));
    engine.entry = null; engine.source = null;
    if (htmls.length) { engine.entry = htmls.includes('boxedwine.html') ? 'boxedwine.html' : htmls[0]; engine.source = 'imported'; }
    else if (await hosted('boxedwine.html')) { engine.entry = 'boxedwine.html'; engine.source = 'hosted'; }
    const roots = new Set(local.filter(n => /\.zip$/i.test(n) && n !== BASE_FS));
    if (await hosted('boxedwine.zip')) roots.add('boxedwine.zip');
    engine.base = local.includes(BASE_FS) || await hosted(BASE_FS) ? BASE_FS : null;
    engine.roots = [...roots];
    if (!engine.roots.includes(engine.root) && engine.roots.length) engine.root = engine.roots[0];
    const chip = $('#engineChip');
    const ready = engine.entry && engine.roots.length;
    chip.textContent = ready ? 'Engine ready' : 'Engine: set up';
    chip.className = 'chip ' + (ready ? 'ok' : 'bad');
    return ready;
  }

  async function renderEngineSheet() {
    await detectEngine();
    const s = $('#engineStatus');
    if (engine.entry && engine.roots.length) s.innerHTML = `✅ Ready (${engine.source === 'hosted' ? 'installed with the site' : 'imported on this device'}).`;
    else if (engine.entry) s.innerHTML = '⚠️ Engine found, but no Wine file system zip yet (e.g. <code>boxedwine.zip</code>). Import one.';
    else s.innerHTML = '⚠️ Not set up yet. Import the Boxedwine web build below.';
    const rs = $('#rootSelect');
    rs.innerHTML = engine.roots.map(r => `<option ${r === engine.root ? 'selected' : ''}>${r}</option>`).join('') || '<option value="">(none)</option>';
    const local = await keys('engine');
    $('#engineFiles').innerHTML = local.length ? local.map(k => `<li>📄 ${k}</li>`).join('') : '<li>No files imported on this device.</li>';
  }

  async function importEngine(fileList) {
    const files = [...fileList]; let n = 0;
    try {
      for (const f of files) {
        if (/\.zip$/i.test(f.name)) {
          progress(0, 'Reading ' + f.name + '…');
          const z = await JSZip.loadAsync(f);
          const names = Object.keys(z.files);
          const html = names.find(p => /(^|\/)boxedwine\.html$/i.test(p)) || names.find(p => /\.html$/i.test(p) && /boxedwine/i.test(p));
          if (html) {        // a build zip: take everything next to boxedwine.html
            const d = dir(html); const want = names.filter(p => !z.files[p].dir && dir(p) === d);
            for (const p of want) {
              progress(n / (want.length || 1), 'Installing ' + base(p));
              await put('engine', new Blob([await z.file(p).async('uint8array')]), base(p)); n++;
            }
          } else {           // no html: this is a Wine file system zip — keep it whole
            await put('engine', f, f.name); n++;
          }
        } else { await put('engine', f, f.name); n++; }
      }
      toast(`Imported ${n} engine file${n === 1 ? '' : 's'}.`);
    } catch (e) { toast('Engine import failed: ' + e.message, 6000); }
    progress(null);
    await renderEngineSheet();
  }

  /* ---------------- games ---------------- */
  async function importGames(fileList, fromFolder) {
    const files = [...fileList].filter(f => !/(^|\/)\.(DS_Store|_)/.test(f.webkitRelativePath || f.name));
    if (!files.length) return;
    const zips = files.filter(f => /\.zip$/i.test(f.name));
    try {
      if (!fromFolder && zips.length === files.length) { for (const z of zips) await importZip(z); }
      else await importLoose(files);
    } catch (e) { console.error(e); toast('Import failed: ' + e.message, 6000); }
    progress(null); render();
  }

  async function importZip(file) {
    progress(0.05, 'Reading ' + file.name + '…');
    const z = await JSZip.loadAsync(file);
    const exeNames = Object.keys(z.files).filter(p => !z.files[p].dir && /\.exe$/i.test(p) && !/^__MACOSX\//.test(p));
    if (!exeNames.length) throw new Error('No .exe found inside ' + file.name);
    const exes = [];
    for (let i = 0; i < exeNames.length; i++) {
      progress(0.1 + 0.8 * i / exeNames.length, 'Checking ' + base(exeNames[i]));
      const b = await z.file(exeNames[i]).async('uint8array');
      exes.push({ path: exeNames[i], size: b.length, arch: exeArch(b) });
    }
    await finishImport(prettyName(file.name), rankExes(exes), file);   // original zip stored as-is
  }

  async function importLoose(files) {
    // Keep the folder structure (folder picker) or put everything side by side (multi-select)
    const rel = f => (f.webkitRelativePath || f.name).replace(/^\/+/, '');
    const z = new JSZip(); const exes = [];
    let done = 0;
    for (const f of files) {
      const b = new Uint8Array(await f.arrayBuffer());
      z.file(rel(f), b, { binary: true, compression: 'STORE' });
      if (/\.exe$/i.test(f.name)) exes.push({ path: rel(f), size: b.length, arch: exeArch(b) });
      progress(0.6 * ++done / files.length, 'Packing ' + f.name);
    }
    if (!exes.length) throw new Error('No .exe in the selected files. Include the game\'s .exe (and its asset files).');
    const blob = await z.generateAsync({ type: 'blob', compression: 'STORE' }, m => progress(0.6 + 0.35 * m.percent / 100, 'Saving…'));
    const ranked = rankExes(exes);
    const top = files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : ranked[0].path;
    await finishImport(prettyName(top), ranked, blob);
  }

  async function finishImport(name, exes, blob) {
    const id = uid();
    const plausible = exes.filter(e => !SKIP_EXE.test(e.path) && e.arch !== 'win64');
    let exe = (plausible[0] || exes[0]).path;
    if (plausible.length > 1) exe = await pickExe(plausible.concat(exes.filter(e => !plausible.includes(e))), name);
    progress(0.97, 'Saving to device…');
    try { await navigator.storage?.persist?.(); } catch {}
    await put('files', blob, id + '.zip');
    const chosen = exes.find(e => e.path === exe);
    await put('games', { id, name, exes, exe, added: Date.now(), size: blob.size, fsVersion: 11,
      settings: { res: '', bpp: '32', sound: true, desktop: false, args: '' }, controls: null });
    if (chosen && chosen.arch === 'win64') toast('Heads up: that .exe is 64‑bit. The engine only runs 32‑bit Windows programs.', 7000);
    else if (chosen && chosen.arch === 'dos') toast('That .exe is a DOS program — it may not run under Wine.', 6000);
    else toast(`Added "${name}".`);
  }

  function pickExe(exes, name) {
    return new Promise(res => {
      const sheet = $('#exePick'), list = $('#exePickList');
      sheet.querySelector('h2').textContent = `Which program starts ${name}?`;
      list.innerHTML = '';
      exes.forEach(e => {
        const b = document.createElement('button'); b.type = 'button';
        b.innerHTML = `<div>${base(e.path)} <span class="small">${fmt(e.size)}${ARCH_NOTE[e.arch] ? ' · ' + ARCH_NOTE[e.arch] : ''}</span></div><div class="path">${e.path}</div>`;
        b.onclick = () => { closeSheets(); res(e.path); };
        list.append(b);
      });
      openSheet(sheet, () => res(exes[0].path));
    });
  }

  const ago = t => {
    if (!t) return 'Not played yet';
    const m = (Date.now() - t) / 60000;
    return 'Played ' + (m < 2 ? 'just now' : m < 60 ? Math.round(m) + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago');
  };
  const exeArchOf = g => ((g.exes || []).find(e => e.path === g.exe) || {}).arch;
  async function render() {
    const allGames = (await all('games')).sort((a, b) => (b.lastPlayed || b.added) - (a.lastPlayed || a.added));
    const q = $('#search').value.trim().toLowerCase();
    const sortBy = $('#sort').value;
    let games = q ? allGames.filter(g => g.name.toLowerCase().includes(q)) : allGames.slice();
    if (sortBy === 'name') games.sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'size') games.sort((a, b) => (b.size || 0) - (a.size || 0));
    $('#search').classList.toggle('hidden', allGames.length < 6 && !q);
    $('#sort').classList.toggle('hidden', allGames.length < 3);
    const grid = $('#grid'); grid.innerHTML = '';
    $('#empty').classList.toggle('hidden', allGames.length > 0);
    showStorage(); renderHero(allGames); renderBanner();
    for (const g of games) {
      const card = document.createElement('div'); card.className = 'card';
      const h = hue(g.name);
      card.innerHTML = `<div class="art" style="background:linear-gradient(135deg,hsl(${h} 60% 42%),hsl(${(h + 50) % 360} 55% 25%))">${g.name.slice(0, 1).toUpperCase()}</div>
        <div class="meta"><div style="flex:1;min-width:0"><div class="title"></div><div class="sub"></div></div><button class="more" type="button" aria-label="Settings">⋯</button></div>`;
      if (g.icon) { const im = new Image(); im.src = g.icon; im.alt = ''; const a = card.querySelector('.art'); a.textContent = ''; a.append(im); }
      if (exeArchOf(g) === 'win64') { card.classList.add('cant'); const bd = document.createElement('div'); bd.className = 'badge'; bd.textContent = '64‑bit'; card.append(bd); }
      card.querySelector('.title').textContent = g.name;
      card.querySelector('.sub').textContent = ago(g.lastPlayed) + ' · ' + fmt(g.size || 0);
      card.querySelector('.sub').title = g.exe;
      card.querySelector('.art').onclick = () => play(g.id);
      card.querySelector('.title').onclick = () => play(g.id);
      card.querySelector('.more').onclick = () => editGame(g.id);
      grid.append(card);
    }
  }

  async function showStorage() {
    try {
      const est = await navigator.storage?.estimate?.(); if (!est) return;
      $('#storage').textContent = `Using ${fmt(est.usage || 0)} of storage on this device` + (est.quota ? ` (about ${fmt(est.quota)} available)` : '');
    } catch {}
  }

  // Boxedwine keeps each game's Wine prefix + saves in IndexedDB databases named after its mount points
  const saveDbs = zipName => ['/root/app/' + encodeURIComponent(zipName), '/d_drive/app/' + encodeURIComponent(zipName)];
  const deleteDb = name => new Promise(res => { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  async function clearSaves(id) { for (const n of saveDbs(id + '.zip')) await deleteDb(n); }


  /* ---------------- one-time Windows download (with progress) ---------------- */
  const ENGINE_CACHE = 'exeplayer-engine-v3';
  const bigFiles = () => [engine.entry && engine.entry.replace(/\.html$/, '.wasm'), engine.entry && engine.entry.replace(/\.html$/, '.js'), engine.root, engine.base].filter(Boolean);
  async function missingFiles() {
    const out = [];
    let cache = null; try { cache = await caches.open(ENGINE_CACHE); } catch {}
    const local = (await keys('engine')).map(String);
    for (const n of bigFiles()) {
      if (local.includes(n)) continue;
      const hit = cache && await cache.match(new URL('engine/' + n, location.href).href);
      if (!hit) out.push(n);
    }
    return out;
  }
  let downloading = null;
  function downloadWindows(onProgress) {
    if (downloading) { downloading.listeners.push(onProgress); return downloading.p; }
    const listeners = [onProgress];
    const p = (async () => {
      const todo = await missingFiles(); if (!todo.length) return true;
      const sizes = {}; let total = 0, done = 0;
      for (const n of todo) { try { const r = await fetch('engine/' + n, { method: 'HEAD' }); sizes[n] = +r.headers.get('Content-Length') || 0; total += sizes[n]; } catch {} }
      for (const n of todo) {
        const r = await fetch('engine/' + n); if (!r.ok || !r.body) throw new Error('Could not download ' + n);
        const rd = r.body.getReader();
        for (;;) { const { done: fin, value } = await rd.read(); if (fin) break; done += value.length;
          const f = total ? Math.min(1, done / total) : 0; listeners.forEach(l => l && l(f, `Downloading Windows (first time only)… ${Math.round(f * 100)}% of ${fmt(total)}`)); }
      }
      await new Promise(r => setTimeout(r, 800));   // let the cache finish writing
      return true;
    })();
    downloading = { p, listeners };
    p.finally(() => { downloading = null; renderBanner(); });
    return p;
  }
  async function renderBanner() {
    const b = $('#dlBanner'); if (!b) return;
    if (!(await detectEngine()) || !(await missingFiles()).length) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    if (downloading) return;
    b.innerHTML = `<div class="t"><b>Download Windows once</b><span class="small">About 170 MB. After this, games start faster and work offline.</span></div><button class="primary" type="button">Download</button>`;
    b.querySelector('button').onclick = () => {
      b.innerHTML = '<div class="t"><b>Downloading Windows…</b><span class="small">0%</span></div>';
      downloadWindows((f, t) => { const s = b.querySelector('.small'); if (s) s.textContent = t; })
        .then(() => toast('Windows is downloaded. Games will start faster now.'))
        .catch(e => toast('Download failed: ' + e.message, 6000));
    };
  }
  function renderHero(games) {
    const h = $('#hero'); const g = games.find(x => x.lastPlayed);
    if (!g || $('#search').value.trim()) { h.classList.add('hidden'); return; }
    h.classList.remove('hidden');
    h.innerHTML = `<img alt=""><div class="t"><div class="k">Continue playing</div><div class="n"></div></div><button class="primary" type="button">▶ Play</button>`;
    h.querySelector('img').src = g.icon || defaultIconURL(g.name);
    h.querySelector('.n').textContent = g.name;
    h.querySelector('button').onclick = () => play(g.id);
  }

  /* ---------------- sheets ---------------- */
  let onSheetDismiss = null;
  function openSheet(el, onDismiss) { closeSheets(); $('#sheetBackdrop').classList.remove('hidden'); el.classList.remove('hidden'); onSheetDismiss = onDismiss || null; }
  function closeSheets() { document.querySelectorAll('.sheet').forEach(s => { if (s.parentElement === document.body) s.classList.add('hidden'); }); $('#sheetBackdrop').classList.add('hidden'); onSheetDismiss = null; }
  $('#sheetBackdrop').onclick = () => { const f = onSheetDismiss; closeSheets(); f && f(); };

  async function editGame(id) {
    const g = await get('games', id); if (!g) return;
    $('#gsName').value = g.name;
    $('#gsExe').innerHTML = rankExes(g.exes).map(e => `<option value="${e.path.replace(/"/g, '&quot;')}" ${e.path === g.exe ? 'selected' : ''}>${e.path}${ARCH_NOTE[e.arch] ? ' (' + ARCH_NOTE[e.arch] + ')' : ''}</option>`).join('');
    $('#gsRes').value = g.settings.res || ''; $('#gsBpp').value = g.settings.bpp || '32';
    $('#gsSound').checked = g.settings.sound !== false; $('#gsDesktop').checked = !!g.settings.desktop;
    $('#gsArgs').value = g.settings.args || ''; $('#gsPreset').value = '';
    let icon = g.icon || null;
    const showIcon = () => { $('#gsIcon').src = icon || defaultIconURL($('#gsName').value || g.name); };
    showIcon(); $('#gsName').oninput = () => { if (!icon) showIcon(); };
    $('#gsIconPick').onclick = async () => { const d = await pickIcon(); if (d) { icon = d; showIcon(); } };
    $('#gsIconClear').onclick = () => { icon = null; showIcon(); };
    $('#gsExport').onclick = async () => { await $('#gsSave').onclick(true); openExport(id); };
    $('#gsSave').onclick = async keepOpen => {
      g.icon = icon;
      g.name = $('#gsName').value.trim() || g.name; g.exe = $('#gsExe').value;
      g.settings = { res: $('#gsRes').value, bpp: $('#gsBpp').value, sound: $('#gsSound').checked, desktop: $('#gsDesktop').checked, args: $('#gsArgs').value.trim() };
      const p = $('#gsPreset').value; if (p) g.controls = TouchPresets[p]();
      await put('games', g); if (keepOpen !== true) closeSheets(); render();
    };
    $('#gsDelete').onclick = async () => {
      if (!confirm(`Delete "${g.name}" from this device?`)) return;
      await del('games', id); await del('files', id + '.zip'); await clearSaves(id); closeSheets(); render();
    };
    $('#gsResetSave').onclick = async () => {
      if (!confirm(`Erase all saved progress and settings for "${g.name}"? The game itself stays.`)) return;
      await clearSaves(id); toast('Save data reset.');
    };
    $('#gsCancel').onclick = closeSheets;
    openSheet($('#gameSheet'));
  }


  /* ---------------- icons ---------------- */
  function drawDefaultIcon(ctx, size, name) {
    const h = hue(name || '?');
    const gr = ctx.createLinearGradient(0, 0, size, size);
    gr.addColorStop(0, `hsl(${h} 60% 42%)`); gr.addColorStop(1, `hsl(${(h + 50) % 360} 55% 25%)`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(size * 0.5)}px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((name || '?').trim().slice(0, 1).toUpperCase(), size / 2, size * 0.54);
  }
  function defaultIconURL(name) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    drawDefaultIcon(c.getContext('2d'), 256, name); return c.toDataURL('image/png');
  }
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image')); i.src = src; });
  // Ask for an image and return it as a 512x512 PNG data URL, center-cropped to a square
  function pickIcon() {
    return new Promise(res => {
      const inp = $('#iconInput'); inp.value = '';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return res(null);
        const url = URL.createObjectURL(f);
        try {
          const img = await loadImg(url); const s = Math.min(img.naturalWidth, img.naturalHeight);
          const c = document.createElement('canvas'); c.width = c.height = 512;
          c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 512, 512);
          res(c.toDataURL('image/png'));
        } catch (e) { toast(e.message); res(null); } finally { URL.revokeObjectURL(url); }
      };
      inp.click();
    });
  }
  async function iconPNG(icon, name, size) {
    const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d');
    if (icon) ctx.drawImage(await loadImg(icon), 0, 0, size, size); else drawDefaultIcon(ctx, size, name);
    return new Promise(r => c.toBlob(r, 'image/png'));
  }

  /* ---------------- export as standalone website ---------------- */
  const slug = s => (s || 'game').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'game';
  const KNOWN_ENGINE_FILES = ['boxedwine.html', 'boxedwine.js', 'boxedwine.wasm', 'boxedwine.css', 'boxedwine-shell.js',
    'boxedwine.worker.js', 'boxedwine.data', 'boxedwine.zip'];

  // Every engine file this device can use: imported ones (IndexedDB) win over ones hosted with the site
  async function engineFileList() {
    const out = new Map();
    let hostedNames = [];
    try { const r = await fetch('engine-files.json', { cache: 'no-store' }); if (r.ok) hostedNames = await r.json(); } catch {}
    if (!hostedNames.length) hostedNames = KNOWN_ENGINE_FILES;
    // Hosted files are exported exactly as they sit on the site (already split into parts where needed)
    await Promise.all(hostedNames.map(async n => {
      try {
        const r = await fetch(n, { method: 'HEAD', cache: 'no-store' });
        if (r.ok) out.set(n, { name: n, size: +r.headers.get('Content-Length') || 0, get: async () => (await fetch(n, { cache: 'no-store' })).blob() });
      } catch {}
    }));
    for (const k of (await keys('engine')).map(String)) {
      const b = await get('engine', k);
      out.set(k, { name: k, size: b.size, get: async () => b });
    }
    // Only ship the Wine file system(s) in use, not every zip
    const fsOf = n => n.replace(/\.(\d{3}|parts\.json)$/, '');
    const keep = new Set([engine.root, engine.base].filter(Boolean));
    for (const n of [...out.keys()]) if (/\.zip$/i.test(fsOf(n)) && !keep.has(fsOf(n))) out.delete(n);
    for (const n of [...out.keys()]) if (/\.(map|symbols)$/i.test(n) || /^(engine-files\.json|README\.txt)$/.test(n)) out.delete(n);
    return [...out.values()];
  }

  let exportBlob = null, exportName = '';
  async function openExport(id) {
    const g = await get('games', id); if (!g) return;
    await detectEngine();
    let icon = g.icon || null;
    exportBlob = null;
    $('#exTitle').value = g.name;
    const showIcon = () => { $('#exIcon').src = icon || defaultIconURL($('#exTitle').value || g.name); };
    showIcon(); $('#exTitle').oninput = () => { if (!icon) showIcon(); };
    $('#exIconPick').onclick = async () => { const d = await pickIcon(); if (d) { icon = d; showIcon(); } };
    $('#exIconClear').onclick = () => { icon = null; showIcon(); };
    $('#exGo').textContent = 'Export .zip'; $('#exGo').disabled = false;
    $('#exProgress').classList.add('hidden');
    $('#exCancel').onclick = closeSheets;
    openSheet($('#exportSheet'));

    const gameBlob = await get('files', id + '.zip');
    const eng = await engineFileList();
    const hostedRoot = engine.roots.includes(engine.root) && await hosted(engine.root);
    const canShare = engine.source === 'hosted' && hostedRoot && /^https?:/.test(location.protocol);
    const modeSel = $('#exEngineMode');
    modeSel.querySelector('[value=shared]').disabled = !canShare;
    if (!canShare && modeSel.value === 'shared') modeSel.value = 'bundle';
    if (canShare && !modeSel.dataset.touched) modeSel.value = 'shared';
    const sizeText = () => {
      const mode = modeSel.value, withEngine = mode === 'bundle';
      $('#exEngineHint').innerHTML = mode === 'shared'
        ? `The game site loads the engine from <b>${esc(new URL('./', location.href).href)}</b>, so keep this ExePlayer site online. Works on GitHub Pages when both sites are on the same account.`
        : mode === 'bundle' ? 'The site carries its own copy of the engine and works on any host.'
        : 'Add the Boxedwine web build and file system next to <code>index.html</code> yourself.';
      const total = gameBlob.size + (withEngine ? eng.reduce((a, f) => a + f.size, 0) : 0);
      const noEngine = withEngine && !eng.some(f => /\.html$/i.test(f.name));
      const el = $('#exSize');
      el.classList.toggle('warn', noEngine);
      el.innerHTML = `About <b>${fmt(total)}</b>. Every file is kept under 24 MB (bigger ones are split into parts), so it uploads on github.com from Safari.` +
        (noEngine ? ' ⚠️ No engine found on this device — set it up first, or pick another engine option.' : '');
    };
    modeSel.onchange = () => { modeSel.dataset.touched = '1'; sizeText(); }; sizeText();

    $('#exGo').onclick = async () => {
      if (exportBlob) return saveExport();
      const btn = $('#exGo'); btn.disabled = true;
      const bar = $('#exProgress'); bar.classList.remove('hidden');
      const step = (f, l) => { bar.querySelector('.bar').style.width = Math.round(f * 100) + '%'; bar.querySelector('.label').textContent = l; };
      try {
        const title = $('#exTitle').value.trim() || g.name;
        const gameZip = slug(title) + '-game.zip';
        const PART = 24e6;   // github.com browser uploads take files up to 25 MB
        const addFile = async (name, blob) => {
          if (blob.size <= PART) { z.file(name, blob, { binary: true }); return; }
          const parts = [];
          for (let off = 0, i = 1; off < blob.size; off += PART, i++) {
            const pn = `${name}.${String(i).padStart(3, '0')}`;
            z.file(pn, blob.slice(off, off + PART), { binary: true }); parts.push({ name: pn, size: Math.min(PART, blob.size - off) });
          }
          z.file(name + '.parts.json', JSON.stringify({ file: name, size: blob.size, parts }, null, 1));
        };
        const z = new JSZip();
        const text = async p => { const r = await fetch(p, { cache: 'no-store' }); if (!r.ok) throw new Error('Missing app file: ' + p); return r.text(); };
        step(0.02, 'Adding player…');
        z.file('index.html', (await text('standalone.html')).replace(/__TITLE__/g, esc(title)));
        z.file('player.js', await text('player.js'));
        for (const f of ['controls.js', 'engine-patch.js', 'sw.js', 'style.css']) z.file(f, await text(f));
        z.file('.nojekyll', '');
        const mode = modeSel.value;
        z.file('game.json', JSON.stringify({ name: title, zip: gameZip, exe: g.exe, settings: g.settings, controls: g.controls,
          root: engine.root, base: engine.base || undefined, entry: engine.entry || 'boxedwine.html',
          engineBase: mode === 'shared' ? new URL('./', location.href).href : undefined,
          exportedFrom: 'ExePlayer', exportedAt: new Date().toISOString() }, null, 2));
        z.file('manifest.webmanifest', JSON.stringify({ name: title, short_name: title.slice(0, 12), start_url: './', scope: './',
          display: 'fullscreen', orientation: 'landscape', background_color: '#0e0f13', theme_color: '#0e0f13',
          icons: [{ src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }] }, null, 2));
        step(0.05, 'Making icons…');
        z.file('apple-touch-icon.png', await iconPNG(icon, title, 180));
        for (const s of [192, 512]) z.file(`icon-${s}.png`, await iconPNG(icon, title, s));
        z.file('favicon-32.png', await iconPNG(icon, title, 32));
        await addFile(gameZip, gameBlob);
        let engineNote = '';
        if (mode === 'bundle') {
          let i = 0;
          for (const f of eng) { step(0.08 + 0.4 * i++ / eng.length, 'Adding engine: ' + f.name); await addFile(f.name, await f.get()); }
        } else if (mode === 'shared') engineNote = '\nThe Windows engine is loaded from ' + new URL('./', location.href).href + ' — keep that ExePlayer site online.\n';
        else engineNote = '\nAdd the Boxedwine web build (boxedwine.html, .js, .wasm) and ' + engine.root + ' next to index.html.\n';
        z.file('README.txt', `${title} — standalone site made with ExePlayer\n\nEverything is in one place (no folders). Upload ALL of these files to a static\nhttps host (GitHub Pages, Netlify...). index.html is the entry page.\nOpen it in Safari and use Share > Add to Home Screen for an app icon.\n\nFiles are at most 24 MB (big ones are split into .001, .002... parts), so they\ncan be uploaded on github.com straight from Safari.\n${engineNote}`);
        exportBlob = await z.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true },
          m => step(0.5 + 0.5 * m.percent / 100, 'Building zip… ' + Math.round(m.percent) + '%'));
        exportName = slug(title) + '-website.zip';
        step(1, `Ready: ${exportName} (${fmt(exportBlob.size)})`);
        btn.textContent = 'Save .zip'; btn.disabled = false;
        g.icon = icon; await put('games', g); render();
      } catch (e) { console.error(e); toast('Export failed: ' + e.message, 7000); btn.disabled = false; bar.classList.add('hidden'); }
    };
  }
  // Called from a fresh tap so iOS allows the share sheet / download
  async function saveExport() {
    const file = new File([exportBlob], exportName, { type: 'application/zip' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: exportName }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(exportBlob); a.download = exportName;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  /* ---------------- playing ---------------- */
  let controls = null, current = null;

  async function play(id) {
    if (!navigator.serviceWorker?.controller) { toast('Finishing first-time setup — reload the page once, then try again.', 6000); return; }
    if (!(await detectEngine())) { toast('Set up the Windows engine first.'); openEngine(); return; }
    const g = await get('games', id); if (!g) return;
    if (exeArchOf(g) === 'win64') {
      const others = (g.exes || []).filter(e => e.arch === 'win32' && e.path !== g.exe);
      toast(others.length ? `${base(g.exe)} is 64‑bit and can't run here. This game also has a 32‑bit program — pick it under ⋯ → Program to run.`
        : `${base(g.exe)} is a 64‑bit program, which ExePlayer can't run. Look for a 32‑bit version of the game, or stream it with Steam Link / GeForce NOW.`, 9000);
      return;
    }
    if (g.fsVersion !== 11) { await clearSaves(g.id); g.fsVersion = 11; }   // setups from the old Wine 10 files don't fit Wine 11
    current = g; g.lastPlayed = Date.now(); put('games', g);
    const exeDir = dir(g.exe);
    const q = new URLSearchParams();
    q.set('app', g.id + '.zip'); q.set('appBase', '../games/'); q.set('auto', 'true');
    setFsParams(q, engine.root, engine.base);
    if (g.settings.desktop) q.set('desktop', 'true');
    else { q.set('p', base(g.exe)); q.set('w', APPDIR + (exeDir ? '/' + exeDir : '')); }
    if (g.settings.args) q.set('args', g.settings.args);
    if (g.settings.res) q.set('resolution', g.settings.res);
    q.set('bpp', g.settings.bpp || '32'); q.set('sound', g.settings.sound === false ? 'false' : 'true');
    // Boxedwine reads raw query values and decodes them itself; keep spaces as %20
    const url = 'engine/' + engine.entry + '?' + q.toString().replace(/\+/g, '%20');

    $('#library').classList.add('hidden'); $('#player').classList.remove('hidden'); document.body.classList.add('playing');
    const frame = $('#engineFrame');
    controls = new TouchControls({
      overlay: $('#overlay'), frame, layout: g.controls, title: g.name, icon: g.icon || defaultIconURL(g.name),
      onSave: async layout => { g.controls = layout; await put('games', g); },
      onExit: () => { if (confirm('Quit the game? Unsaved in‑game progress will be lost.')) stop(); },
    });
    if (!g.controls) { g.controls = controls.layout; put('games', g); toast('Tip: tap ✎ to move or remap buttons. Two‑finger tap = right click.', 6000); }
    try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch {}
    keepAwake(true);
    const myControls = controls;
    try {
      if ((await missingFiles()).length) await downloadWindows((f, t) => myControls.setCoverProgress(f, t));
    } catch (e) { toast('Download failed: ' + e.message + '. Check your connection and try again.', 7000); stop(); return; }
    if (controls !== myControls) return;   // quit while downloading
    myControls.setCoverProgress(1, 'Starting Windows…');
    frame.src = url;
  }
  // keep the screen on while playing
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && current) keepAwake(true); });

  function stop() {
    controls?.destroy(); controls = null; current = null; keepAwake(false);
    const frame = $('#engineFrame'); frame.src = 'about:blank';
    $('#player').classList.add('hidden'); $('#library').classList.remove('hidden'); document.body.classList.remove('playing');
    if (document.fullscreenElement) document.exitFullscreen?.();
    render();
  }

  // iOS only allows sound to start from a real tap: forward real taps to the engine's audio
  $('#overlay').addEventListener('touchend', () => { try { $('#engineFrame').contentWindow.__exeplayerResumeAudio?.(); } catch {} }, true);
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || !e.data.exeplayer) return;
    if (e.data.exeplayer === 'error') toast('Engine error: ' + e.data.message, 7000);
    if (e.data.exeplayer === 'log' && /Unable to load/i.test(e.data.message)) toast(e.data.message + ' — check engine setup.', 7000);
  });

  /* ---------------- wiring ---------------- */
  function openEngine() { renderEngineSheet(); openSheet($('#engineSheet')); }
  $('#engineChip').onclick = openEngine;
  $('#engineDone').onclick = () => { closeSheets(); detectEngine(); };
  $('#engineImportBtn').onclick = () => $('#engineInput').click();
  $('#engineInput').onchange = e => { importEngine(e.target.files); e.target.value = ''; };
  $('#engineClearBtn').onclick = async () => {
    if (!confirm('Remove engine files imported on this device?')) return;
    for (const k of await keys('engine')) await del('engine', k);
    renderEngineSheet();
  };
  $('#engineRefreshBtn').onclick = async () => {
    if (!confirm('Remove the downloaded Windows files from this device? Your games and saves stay. Windows downloads again next time you play.')) return;
    await caches.delete(ENGINE_CACHE);
    toast('Space freed. Windows will download again next time you play.'); render(); renderEngineSheet();
  };
  $('#rootSelect').onchange = e => { engine.root = e.target.value; localStorage.setItem('exeplayer.root', engine.root); };
  $('#addFilesBtn').onclick = () => $('#fileInput').click();
  $('#addFolderBtn').onclick = () => $('#folderInput').click();
  $('#fileInput').onchange = e => { importGames(e.target.files, false); e.target.value = ''; };
  $('#folderInput').onchange = e => { importGames(e.target.files, true); e.target.value = ''; };
  $('#search').oninput = () => render();
  try { $('#sort').value = localStorage.getItem('exeplayer.sort') || 'recent'; } catch {}
  $('#sort').onchange = () => { try { localStorage.setItem('exeplayer.sort', $('#sort').value); } catch {} render(); };
  // a new version of the site was uploaded: offer to reload (never mid-game)
  if (navigator.serviceWorker) {
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      if (current) return;
      const b = $('#toast'); b.textContent = 'ExePlayer was updated — tap to reload'; b.classList.remove('hidden');
      b.style.pointerEvents = 'auto'; b.onclick = () => location.reload();
    });
  }
  let dragDepth = 0;
  const lib = $('#library');
  lib.addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); dragDepth++; $('#dropHint').classList.remove('hidden'); } });
  lib.addEventListener('dragover', e => e.preventDefault());
  lib.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropHint').classList.add('hidden'); } });
  lib.addEventListener('drop', e => {
    e.preventDefault(); dragDepth = 0; $('#dropHint').classList.add('hidden');
    const files = [...(e.dataTransfer?.files || [])]; if (files.length) importGames(files, false);
  });
  if (!('webkitdirectory' in document.createElement('input'))) $('#addFolderBtn').classList.add('hidden');

  // keep the page from rubber-banding / zooming on iOS while playing
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());

  (async () => {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
        // The service worker adds the headers the engine needs; the page must be controlled by it once.
        if (!navigator.serviceWorker.controller) {
          await navigator.serviceWorker.ready;
          if (!sessionStorage.getItem('exeplayer.reloaded')) { sessionStorage.setItem('exeplayer.reloaded', '1'); location.reload(); return; }
        }
      } catch (e) { toast('Service worker failed: ' + e.message + '. Open the app over https.', 8000); }
    } else toast('This browser can\'t run ExePlayer (no service workers). Use Safari on iOS 16.4+.', 8000);
    await detectEngine(); render();
  })();
})();
