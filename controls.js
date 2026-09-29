/* ExePlayer touch controls
 * Turns touches into Windows keyboard + mouse input for the game running in the engine iframe.
 *  - background touches = mouse (trackpad mode or direct-touch mode)
 *  - on-screen D-pad / buttons = keys (fully remappable, draggable, resizable, saved per game)
 *  - keyboard button = iOS keyboard typing into the game
 */
(function () {
  // DOM KeyboardEvent.code -> [key, keyCode, label]
  const KEYS = {};
  const add = (code, key, keyCode, label) => { KEYS[code] = { key, keyCode, label: label || key }; };
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(c => add('Key' + c, c.toLowerCase(), c.charCodeAt(0), c));
  '0123456789'.split('').forEach(d => add('Digit' + d, d, 48 + +d, d));
  for (let i = 1; i <= 12; i++) add('F' + i, 'F' + i, 111 + i, 'F' + i);
  [['ArrowUp','ArrowUp',38,'↑'],['ArrowDown','ArrowDown',40,'↓'],['ArrowLeft','ArrowLeft',37,'←'],['ArrowRight','ArrowRight',39,'→'],
   ['Space',' ',32,'Space'],['Enter','Enter',13,'Enter'],['Escape','Escape',27,'Esc'],['Tab','Tab',9,'Tab'],
   ['Backspace','Backspace',8,'⌫'],['ShiftLeft','Shift',16,'Shift'],['ControlLeft','Control',17,'Ctrl'],
   ['AltLeft','Alt',18,'Alt'],['ShiftRight','Shift',16,'R‑Shift'],['ControlRight','Control',17,'R‑Ctrl'],
   ['CapsLock','CapsLock',20,'Caps'],['Insert','Insert',45,'Ins'],['Delete','Delete',46,'Del'],['Home','Home',36,'Home'],
   ['End','End',35,'End'],['PageUp','PageUp',33,'PgUp'],['PageDown','PageDown',34,'PgDn'],['Pause','Pause',19,'Pause'],
   ['Minus','-',189],['Equal','=',187],['BracketLeft','[',219],['BracketRight',']',221],['Backslash','\\',220],
   ['Semicolon',';',186],['Quote',"'",222],['Comma',',',188],['Period','.',190],['Slash','/',191],['Backquote','`',192],
   ['NumpadEnter','Enter',13,'Num Enter'],['NumpadAdd','+',107,'Num +'],['NumpadSubtract','-',109,'Num −'],
   ['Numpad0','0',96,'Num 0'],['Numpad1','1',97,'Num 1'],['Numpad2','2',98,'Num 2'],['Numpad3','3',99,'Num 3'],
   ['Numpad4','4',100,'Num 4'],['Numpad5','5',101,'Num 5'],['Numpad6','6',102,'Num 6'],['Numpad7','7',103,'Num 7'],
   ['Numpad8','8',104,'Num 8'],['Numpad9','9',105,'Num 9']].forEach(a => add(...a));
  KEYS.Mouse0 = { label: 'L‑Click', mouse: 0 };
  KEYS.Mouse2 = { label: 'R‑Click', mouse: 2 };

  // typed character -> [code, shift]
  const CHAR = {};
  'abcdefghijklmnopqrstuvwxyz'.split('').forEach(c => { CHAR[c] = ['Key' + c.toUpperCase(), false]; CHAR[c.toUpperCase()] = ['Key' + c.toUpperCase(), true]; });
  '0123456789'.split('').forEach(d => CHAR[d] = ['Digit' + d, false]);
  Object.assign(CHAR, { ' ': ['Space', false], '\n': ['Enter', false], '-': ['Minus', false], '_': ['Minus', true],
    '=': ['Equal', false], '+': ['Equal', true], '[': ['BracketLeft', false], '{': ['BracketLeft', true],
    ']': ['BracketRight', false], '}': ['BracketRight', true], '\\': ['Backslash', false], '|': ['Backslash', true],
    ';': ['Semicolon', false], ':': ['Semicolon', true], "'": ['Quote', false], '"': ['Quote', true],
    ',': ['Comma', false], '<': ['Comma', true], '.': ['Period', false], '>': ['Period', true],
    '/': ['Slash', false], '?': ['Slash', true], '`': ['Backquote', false], '~': ['Backquote', true],
    '!': ['Digit1', true], '@': ['Digit2', true], '#': ['Digit3', true], '$': ['Digit4', true], '%': ['Digit5', true],
    '^': ['Digit6', true], '&': ['Digit7', true], '*': ['Digit8', true], '(': ['Digit9', true], ')': ['Digit0', true],
    '’': ['Quote', false], '‘': ['Quote', false], '“': ['Quote', true], '”': ['Quote', true] });

  const uid = () => Math.random().toString(36).slice(2, 9);

  const PRESETS = {
    arcade: () => ({ mouseMode: 'touch', opacity: 0.8, display: 'fit', items: [
      { id: uid(), type: 'dpad', x: 0.14, y: 0.72, size: 170, keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } },
      { id: uid(), type: 'button', key: 'Space', x: 0.88, y: 0.78, size: 78 },
      { id: uid(), type: 'button', key: 'ControlLeft', x: 0.78, y: 0.86, size: 64 },
      { id: uid(), type: 'button', key: 'AltLeft', x: 0.93, y: 0.60, size: 64 },
      { id: uid(), type: 'button', key: 'Enter', x: 0.80, y: 0.64, size: 64 },
      { id: uid(), type: 'button', key: 'Escape', x: 0.06, y: 0.16, size: 52, wide: true },
    ] }),
    wasd: () => ({ mouseMode: 'trackpad', opacity: 0.8, display: 'fit', items: [
      { id: uid(), type: 'dpad', x: 0.14, y: 0.72, size: 170, keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' } },
      { id: uid(), type: 'button', key: 'Mouse0', x: 0.90, y: 0.72, size: 84 },
      { id: uid(), type: 'button', key: 'Mouse2', x: 0.78, y: 0.84, size: 64 },
      { id: uid(), type: 'button', key: 'Space', x: 0.80, y: 0.60, size: 60 },
      { id: uid(), type: 'button', key: 'KeyE', x: 0.92, y: 0.52, size: 52 },
      { id: uid(), type: 'button', key: 'ShiftLeft', x: 0.30, y: 0.86, size: 52, wide: true },
      { id: uid(), type: 'button', key: 'Escape', x: 0.06, y: 0.16, size: 52, wide: true },
    ] }),
    mouse: () => ({ mouseMode: 'touch', opacity: 0.8, display: 'fit', items: [
      { id: uid(), type: 'button', key: 'Mouse2', x: 0.93, y: 0.84, size: 64 },
      { id: uid(), type: 'button', key: 'Escape', x: 0.06, y: 0.16, size: 52, wide: true },
    ] }),
  };

  class TouchControls {
    constructor({ overlay, frame, layout, onSave, onExit, title, icon }) {
      this.overlay = overlay; this.frame = frame; this.onSave = onSave; this.onExit = onExit;
      this.title = title || 'Game'; this.icon = icon || null;
      this.layout = layout && layout.items ? layout : PRESETS.arcade();
      this.editing = false; this.hidden = false;
      this.cursor = { x: innerWidth / 2, y: innerHeight / 2 };
      this.mouseDown = 0;           // bitmask of held mouse buttons
      this.heldKeys = new Map();    // code -> hold count
      this.build();
      this.bindBackground();
      this.bindHardwareKeys();
      this.bindGamepads();
      this._vis = () => { if (document.hidden) this.releaseAll(); };
      document.addEventListener('visibilitychange', this._vis);
      window.addEventListener('blur', this._vis);
      this._frameLoad = () => { this.applyDisplay(); if (this.muted) setTimeout(() => this.setMuted(true), 1500); };
      this.frame.addEventListener('load', this._frameLoad);
      this.fadeTimer = null; this.poke();
    }

    /* ---------------- injection into the engine iframe ---------------- */
    get win() { try { return this.frame.contentWindow; } catch { return null; } }
    canvas() {
      const doc = this.win && this.win.document; if (!doc) return null;
      let best = null, area = 0;
      doc.querySelectorAll('canvas').forEach(c => {
        const r = c.getBoundingClientRect(), a = r.width * r.height;
        if (a > area && getComputedStyle(c).display !== 'none') { area = a; best = c; }
      });
      return best;
    }
    key(code, down) {
      const k = KEYS[code]; if (!k) return;
      if (k.mouse !== undefined) return this.mouseButton(k.mouse, down);
      const n = (this.heldKeys.get(code) || 0) + (down ? 1 : -1);
      // several controls may share a key: only send the real edge
      if (down && n > 1) { this.heldKeys.set(code, n); return; }
      if (!down && n > 0) { this.heldKeys.set(code, n); return; }
      this.heldKeys.set(code, Math.max(0, n));
      this.sendKey(code, down);
    }
    sendKey(code, down, extra = {}) {
      const w = this.win; const k = KEYS[code]; if (!w || !k) return;
      const ev = new w.KeyboardEvent(down ? 'keydown' : 'keyup', {
        key: k.key, code, bubbles: true, cancelable: true, ...extra });
      Object.defineProperty(ev, 'keyCode', { get: () => k.keyCode });
      Object.defineProperty(ev, 'which', { get: () => k.keyCode });
      (w.document.activeElement && w.document.activeElement !== w.document.body ? w.document.activeElement : w.document).dispatchEvent(ev);
    }
    tapKey(code, shift) {
      if (shift) this.sendKey('ShiftLeft', true, { shiftKey: true });
      this.sendKey(code, true, { shiftKey: !!shift });
      setTimeout(() => {
        this.sendKey(code, false, { shiftKey: !!shift });
        if (shift) this.sendKey('ShiftLeft', false);
      }, 30);
    }
    mouse(type, x, y, button = 0) {
      const w = this.win, c = this.canvas(); if (!w || !c) return;
      const r = this.frame.getBoundingClientRect();
      const ev = new w.MouseEvent(type, { clientX: x - r.left, clientY: y - r.top, screenX: x, screenY: y,
        button, buttons: this.mouseDown, bubbles: true, cancelable: true, view: w });
      c.dispatchEvent(ev);
    }
    moveTo(x, y) { this.cursor.x = x; this.cursor.y = y; this.drawCursor(); this.mouse('mousemove', x, y); }
    mouseButton(b, down) {
      const bit = b === 2 ? 2 : b === 1 ? 4 : 1;
      if (down) { if (this.mouseDown & bit) return; this.mouseDown |= bit; this.mouse('mousedown', this.cursor.x, this.cursor.y, b); }
      else { if (!(this.mouseDown & bit)) return; this.mouseDown &= ~bit; this.mouse('mouseup', this.cursor.x, this.cursor.y, b); }
    }
    click(b = 0) { this.mouseButton(b, true); setTimeout(() => this.mouseButton(b, false), 40); }
    clampToCanvas(x, y) {
      const c = this.canvas(); if (!c) return { x, y };
      const fr = this.frame.getBoundingClientRect(), r = c.getBoundingClientRect();
      return { x: Math.min(fr.left + r.right - 1, Math.max(fr.left + r.left, x)),
               y: Math.min(fr.top + r.bottom - 1, Math.max(fr.top + r.top, y)) };
    }
    releaseAll() {
      this.padState = {};
      for (const [code, n] of this.heldKeys) if (n > 0) this.sendKey(code, false);
      this.heldKeys.clear();
      [0, 2, 1].forEach(b => this.mouseButton(b, false));
      this.overlay.querySelectorAll('.pressed').forEach(e => e.classList.remove('pressed'));
    }

    /* ---------------- UI ---------------- */
    build() {
      const o = this.overlay; o.innerHTML = ''; o.className = '';
      this.cursorEl = el('div', 'tc-cursor'); o.append(this.cursorEl);
      this.buildCover();
      this.kbd = el('textarea', 'tc-kbd');
      this.kbd.setAttribute('autocapitalize', 'off'); this.kbd.setAttribute('autocorrect', 'off');
      this.kbd.setAttribute('autocomplete', 'off'); this.kbd.setAttribute('spellcheck', 'false');
      o.append(this.kbd); this.bindTyping();

      const tb = this.toolbar = el('div', 'tc-toolbar');
      const b = (txt, title, fn) => { const x = el('button'); x.type = 'button'; x.textContent = txt; x.title = title;
        x.addEventListener('click', e => { e.stopPropagation(); fn(x); this.poke(); }); tb.append(x); return x; };
      b('✕', 'Exit game', () => this.onExit());
      b('↻', 'Restart game', () => { if (confirm('Restart the game? Unsaved in‑game progress will be lost.')) this.restart(); });
      this.muteBtn = b('🔊', 'Mute', () => this.setMuted(!this.muted));
      this.modeBtn = b('', 'Mouse mode', () => { this.layout.mouseMode = this.layout.mouseMode === 'trackpad' ? 'touch' : 'trackpad'; this.syncMode(); this.save(); });
      b('⌨︎', 'Keyboard', () => { this.kbd.value = ''; this.kbd.focus(); });
      this.dispBtn = b('', 'Screen mode', () => {
        const order = ['fit', 'sharp', 'stretch'];
        this.layout.display = order[(order.indexOf(this.layout.display || 'fit') + 1) % order.length];
        this.applyDisplay(); this.save(); this.toast({ fit: 'Screen: fit', sharp: 'Screen: fit, sharp pixels', stretch: 'Screen: stretch to fill' }[this.layout.display]);
      });
      b('✎', 'Edit controls', () => this.setEditing(!this.editing));
      this.hideBtn = b('◐', 'Show/hide controls', () => { this.hidden = !this.hidden; o.classList.toggle('tc-hidden', this.hidden); this.hideBtn.classList.toggle('on', this.hidden); });
      b('⛶', 'Fullscreen', () => { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); });
      tb.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
      o.append(tb);

      this.ctrlEls = [];
      this.layout.items.forEach(item => this.addControl(item));
      this.applyOpacity(); this.syncMode(); this.applyDisplay();
      window.addEventListener('resize', this._onResize = () => this.place());
    }
    // "Starting…" cover: hides by itself when the game draws, or when tapped
    buildCover() {
      const c = this.cover = el('div', 'tc-cover');
      const img = el('img', 'tc-cover-icon'); if (this.icon) img.src = this.icon; else img.style.display = 'none';
      const h = el('div', 'tc-cover-title'); h.textContent = this.title;
      const st = this.coverStatus = el('div', 'tc-cover-status'); st.textContent = 'Starting…';
      const bar = el('div', 'tc-cover-bar'); this.coverFill = el('div'); bar.append(this.coverFill);
      const tip = el('div', 'tc-cover-tip'); tip.textContent = 'Windows is starting up. This usually takes about a minute.';
      const skip = el('button'); skip.type = 'button'; skip.textContent = 'Show screen now';
      skip.onclick = e => { e.stopPropagation(); this.hideCover(); };
      c.append(img, h, st, bar, tip, skip);
      c.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
      this.overlay.append(c);
      const t0 = Date.now();
      this.coverTick = setInterval(() => {
        const s = Math.round((Date.now() - t0) / 1000);
        if (!this.coverDownloading) st.textContent = `Starting Windows… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        if (!this.coverDownloading) this.coverFill.style.width = Math.min(95, 100 * (1 - Math.exp(-s / 45))) + '%';
        if (s > 180) this.hideCover();
      }, 1000);
      this._onReady = e => { if (e.data && e.data.exeplayer === 'ready') { this.coverFill.style.width = '100%'; setTimeout(() => this.hideCover(), 250); } };
      window.addEventListener('message', this._onReady);
    }
    setCoverProgress(frac, text) {
      if (!this.cover) return;
      this.coverDownloading = frac < 1;
      this.coverFill.style.width = Math.round(frac * 100) + '%'; this.coverStatus.textContent = text;
    }
    hideCover() {
      if (!this.cover) return;
      clearInterval(this.coverTick); window.removeEventListener('message', this._onReady);
      this.cover.classList.add('gone'); const c = this.cover; this.cover = null; setTimeout(() => c.remove(), 400);
      this.poke();
    }
    restart() {
      this.releaseAll();
      const src = this.frame.src; this.frame.src = 'about:blank';
      if (this.cover) this.hideCover();
      this.buildCover(); this.setCoverProgress(1, 'Restarting…');
      setTimeout(() => { this.frame.src = src; }, 150);
    }
    setMuted(m) {
      this.muted = m; this.muteBtn.textContent = m ? '🔇' : '🔊'; this.muteBtn.classList.toggle('on', m);
      try { this.win.__exeplayerSetMuted && this.win.__exeplayerSetMuted(m); } catch {}
    }
    syncMode() {
      const tp = this.layout.mouseMode === 'trackpad';
      this.modeBtn.textContent = tp ? '🖱 Trackpad' : '👆 Touch';
      this.cursorEl.style.display = tp ? '' : 'none';
      this.drawCursor();
    }
    applyDisplay() {
      const m = this.layout.display || 'fit';
      this.dispBtn.textContent = { fit: '▣ Fit', sharp: '▦ Sharp', stretch: '⬚ Stretch' }[m];
      try { this.win.__exeplayerDisplay = m; this.win.__exeplayerFit && this.win.__exeplayerFit(); } catch {}
    }
    drawCursor() { this.cursorEl.style.left = this.cursor.x + 'px'; this.cursorEl.style.top = this.cursor.y + 'px'; }
    applyOpacity() { this.ctrlEls.forEach(({ node }) => node.style.opacity = this.layout.opacity ?? 0.8); }
    poke() { this.toolbar.classList.remove('faded'); clearTimeout(this.fadeTimer); this.fadeTimer = setTimeout(() => this.toolbar.classList.add('faded'), 3000); }
    place() {
      this.ctrlEls.forEach(({ item, node }) => {
        node.style.left = (item.x * innerWidth) + 'px'; node.style.top = (item.y * innerHeight) + 'px';
        const s = item.size; node.style.width = (item.wide ? s * 1.6 : s) + 'px'; node.style.height = s + 'px';
        if (item.type === 'button') node.style.fontSize = Math.max(11, s * (label(item).length > 3 ? 0.2 : 0.3)) + 'px';
      });
    }
    addControl(item) {
      let node;
      if (item.type === 'dpad') {
        node = el('div', 'tc-ctrl tc-dpad');
        const arms = {}; ['up', 'down', 'left', 'right'].forEach(d => { arms[d] = el('div', 'arm ' + d); node.append(arms[d]); });
        this.bindDpad(item, node, arms);
      } else {
        node = el('div', 'tc-ctrl tc-btn' + (item.wide ? ' wide' : ''));
        node.textContent = label(item);
        this.bindButton(item, node);
      }
      this.overlay.append(node);
      this.ctrlEls.push({ item, node });
      this.place(); this.applyOpacity();
    }
    rebuildControls() { this.ctrlEls.forEach(c => c.node.remove()); this.ctrlEls = []; this.layout.items.forEach(i => this.addControl(i)); }

    bindButton(item, node) {
      const touches = new Set();
      node.addEventListener('touchstart', e => {
        e.preventDefault(); e.stopPropagation(); this.poke();
        if (this.editing) return this.editDrag(e, item, node);
        for (const t of e.changedTouches) touches.add(t.identifier);
        if (!node.classList.contains('pressed')) { node.classList.add('pressed'); this.key(item.key, true); }
      }, { passive: false });
      const up = e => {
        e.preventDefault(); e.stopPropagation(); if (this.editing) return;
        for (const t of e.changedTouches) touches.delete(t.identifier);
        if (!touches.size && node.classList.contains('pressed')) { node.classList.remove('pressed'); this.key(item.key, false); }
      };
      node.addEventListener('touchend', up, { passive: false });
      node.addEventListener('touchcancel', up, { passive: false });
    }
    bindDpad(item, node, arms) {
      let held = new Set(), active = null;
      const update = (t) => {
        const r = node.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = t ? t.clientX - cx : 0, dy = t ? t.clientY - cy : 0, dist = Math.hypot(dx, dy);
        const next = new Set();
        if (t && dist > r.width * 0.12) {
          const a = Math.atan2(dy, dx) * 180 / Math.PI; // -180..180, 0 = right, 90 = down
          if (a > -67.5 && a < 67.5) next.add('right');
          if (a > 112.5 || a < -112.5) next.add('left');
          if (a > 22.5 && a < 157.5) next.add('down');
          if (a < -22.5 && a > -157.5) next.add('up');
        }
        for (const d of held) if (!next.has(d)) { this.key(item.keys[d], false); arms[d].classList.remove('pressed'); }
        for (const d of next) if (!held.has(d)) { this.key(item.keys[d], true); arms[d].classList.add('pressed'); }
        held = next;
      };
      node.addEventListener('touchstart', e => {
        e.preventDefault(); e.stopPropagation(); this.poke();
        if (this.editing) return this.editDrag(e, item, node);
        const t = e.changedTouches[0]; active = t.identifier; update(t);
      }, { passive: false });
      node.addEventListener('touchmove', e => {
        e.preventDefault(); e.stopPropagation(); if (this.editing) return;
        for (const t of e.changedTouches) if (t.identifier === active) update(t);
      }, { passive: false });
      const end = e => {
        e.preventDefault(); e.stopPropagation(); if (this.editing) return;
        for (const t of e.changedTouches) if (t.identifier === active) { active = null; update(null); }
      };
      node.addEventListener('touchend', end, { passive: false });
      node.addEventListener('touchcancel', end, { passive: false });
    }

    /* ---------------- mouse from background touches ---------------- */
    bindBackground() {
      const o = this.overlay;
      let g = null;          // current gesture
      let lastTapEnd = 0, lastTapPos = null;
      o.addEventListener('touchstart', e => {
        if (e.target !== o && e.target !== this.cursorEl) return;
        e.preventDefault(); this.poke();
        if (this.editing) return;
        const ts = [...e.touches].filter(t => t.target === o || t.target === this.cursorEl);
        if (ts.length >= 2) {           // second finger: this gesture becomes a right click
          if (g && g.dragging) this.mouseButton(0, false);
          if (g) { g.two = true; g.dragging = false; }
          return;
        }
        const t = e.changedTouches[0];
        g = { id: t.identifier, sx: t.clientX, sy: t.clientY, lx: t.clientX, ly: t.clientY, t0: performance.now(), moved: false, two: false, dragging: false };
        if (this.layout.mouseMode === 'touch') {
          this.moveTo(t.clientX, t.clientY);
          g.pressTimer = setTimeout(() => { if (g && !g.two) { g.dragging = true; this.mouseButton(0, true); } }, 70);
        } else if (lastTapPos && performance.now() - lastTapEnd < 300 && Math.hypot(t.clientX - lastTapPos.x, t.clientY - lastTapPos.y) < 40) {
          g.dragging = true; this.mouseButton(0, true);   // tap-then-hold = drag in trackpad mode
        }
      }, { passive: false });
      o.addEventListener('touchmove', e => {
        if (!g) return; e.preventDefault();
        const t = [...e.changedTouches].find(t => t.identifier === g.id); if (!t) return;
        if (Math.hypot(t.clientX - g.sx, t.clientY - g.sy) > 8) g.moved = true;
        if (g.two) return;
        if (this.layout.mouseMode === 'touch') {
          if (!g.dragging) { clearTimeout(g.pressTimer); g.dragging = true; this.mouseButton(0, true); }
          this.moveTo(t.clientX, t.clientY);
        } else {
          const dx = t.clientX - g.lx, dy = t.clientY - g.ly;
          const speed = 1 + Math.min(2.5, Math.hypot(dx, dy) / 12);  // acceleration
          const p = this.clampToCanvas(this.cursor.x + dx * speed * 1.4, this.cursor.y + dy * speed * 1.4);
          this.moveTo(p.x, p.y);
        }
        g.lx = t.clientX; g.ly = t.clientY;
      }, { passive: false });
      const end = e => {
        if (!g) return;
        const mine = [...e.changedTouches].some(t => t.identifier === g.id) || g.two;
        if (!mine) return;
        e.preventDefault();
        // only fingers on the background count; fingers resting on buttons/D-pad are ignored
        const left = [...e.touches].filter(t => t.target === o || t.target === this.cursorEl);
        if (left.length) return;          // wait for all background fingers (two-finger tap)
        clearTimeout(g.pressTimer);
        const quick = performance.now() - g.t0 < 350;
        if (g.two) { if (quick || !g.moved) this.click(2); }
        else if (this.layout.mouseMode === 'touch') {
          if (g.dragging) this.mouseButton(0, false); else this.click(0);
        } else {
          if (g.dragging) this.mouseButton(0, false);
          else if (!g.moved && quick) { this.click(0); lastTapEnd = performance.now(); lastTapPos = { x: g.sx, y: g.sy }; }
        }
        g = null;
      };
      o.addEventListener('touchend', end, { passive: false });
      o.addEventListener('touchcancel', end, { passive: false });
    }

    /* ---------------- typing ---------------- */
    bindTyping() {
      const k = this.kbd;
      k.addEventListener('beforeinput', e => {
        e.preventDefault();
        if (e.inputType === 'deleteContentBackward') return this.tapKey('Backspace');
        if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') return this.tapKey('Enter');
        const text = e.data || '';
        let i = 0; const step = () => { if (i >= text.length) return; const m = CHAR[text[i++]]; if (m) this.tapKey(m[0], m[1]); setTimeout(step, 45); };
        step();
      });
      k.addEventListener('input', () => { k.value = ''; });
      k.addEventListener('keydown', e => {  // keys that don't produce beforeinput (arrows, Esc, Tab with hardware keyboard)
        if (KEYS[e.code] && !['Backspace', 'Enter'].includes(e.code) && e.key.length !== 1) { e.preventDefault(); this.sendKey(e.code, true); }
      });
      k.addEventListener('keyup', e => { if (KEYS[e.code] && e.key.length !== 1 && !['Backspace', 'Enter'].includes(e.code)) this.sendKey(e.code, false); });
    }
    bindHardwareKeys() {  // iPad with a hardware keyboard: forward keys when the page (not the iframe) has focus
      this._hk = e => {
        if (e.target === this.kbd || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
        if (!KEYS[e.code]) return; e.preventDefault();
        this.sendKey(e.code, e.type === 'keydown', { shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey });
      };
      document.addEventListener('keydown', this._hk); document.addEventListener('keyup', this._hk);
    }

    /* ---------------- Bluetooth / MFi game controllers ---------------- */
    // D-pad & left stick -> the on-screen D-pad's keys, face/shoulder buttons -> on-screen buttons in order,
    // right stick moves the mouse, RT = left click, LT = right click, Start = Enter, Back = Esc
    bindGamepads() {
      this.padState = {};
      this._padOn = e => { this.toast('🎮 Controller connected: ' + (e.gamepad.id || 'gamepad').replace(/\(.*\)/, '').trim()); this.pollPads(); };
      window.addEventListener('gamepadconnected', this._padOn);
      if (navigator.getGamepads && [...navigator.getGamepads()].some(Boolean)) this.pollPads();
    }
    padMap() {
      const dpad = this.layout.items.find(i => i.type === 'dpad');
      const dk = dpad ? dpad.keys : { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
      const btns = this.layout.items.filter(i => i.type === 'button' && i.key !== 'Escape');
      const pick = n => btns[n] ? btns[n].key : null;
      return { 12: dk.up, 13: dk.down, 14: dk.left, 15: dk.right,
        0: pick(0) || 'Space', 1: pick(1) || 'ControlLeft', 2: pick(2) || 'AltLeft', 3: pick(3) || 'Enter',
        4: pick(4) || 'ShiftLeft', 5: pick(5) || 'Tab', 6: 'Mouse2', 7: 'Mouse0', 8: 'Escape', 9: 'Enter', 10: null, 11: null,
        stick: dk };
    }
    pollPads() {
      if (this._padRaf) return;
      const loop = () => {
        this._padRaf = null;
        const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
        if (!pads.length || this.destroyed) return;
        const map = this.padMap(), want = new Set();
        for (const p of pads) {
          p.buttons.forEach((b, i) => { if ((b.pressed || b.value > 0.5) && map[i]) want.add(map[i]); });
          const [lx = 0, ly = 0, rx = 0, ry = 0] = p.axes;
          if (lx < -0.5) want.add(map.stick.left); if (lx > 0.5) want.add(map.stick.right);
          if (ly < -0.5) want.add(map.stick.up); if (ly > 0.5) want.add(map.stick.down);
          const dz = v => Math.abs(v) < 0.15 ? 0 : v;
          if (dz(rx) || dz(ry)) {
            const pt = this.clampToCanvas(this.cursor.x + dz(rx) * 14, this.cursor.y + dz(ry) * 14);
            this.moveTo(pt.x, pt.y);
          }
        }
        if (!this.editing) {
          for (const k of Object.keys(this.padState)) if (!want.has(k)) { this.key(k, false); delete this.padState[k]; }
          for (const k of want) if (!this.padState[k]) { this.padState[k] = true; this.key(k, true); }
        }
        this._padRaf = requestAnimationFrame(loop);
      };
      this._padRaf = requestAnimationFrame(loop);
    }

    /* ---------------- layout editor ---------------- */
    setEditing(on) {
      this.editing = on; this.releaseAll();
      this.overlay.classList.toggle('tc-edit', on);
      document.body.classList.toggle('editing', on);
      if (this.editbar) { this.editbar.remove(); this.editbar = null; }
      if (!on) { this.save(); return; }
      const bar = this.editbar = el('div', 'tc-editbar');
      const btn = (t, fn) => { const b = el('button'); b.type = 'button'; b.textContent = t; b.onclick = e => { e.stopPropagation(); fn(); }; bar.append(b); };
      btn('+ Button', () => { const it = { id: uid(), type: 'button', key: 'Space', x: 0.5, y: 0.5, size: 64 }; this.layout.items.push(it); this.addControl(it); this.openItem(it); });
      btn('+ D‑pad', () => { const it = { id: uid(), type: 'dpad', x: 0.5, y: 0.6, size: 160, keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } }; this.layout.items.push(it); this.addControl(it); });
      const ps = el('select');
      ps.innerHTML = '<option value="">Preset…</option><option value="arcade">Arrows + buttons</option><option value="wasd">WASD + mouse</option><option value="mouse">Mouse only</option>';
      ps.onchange = () => {
        const p = ps.value; ps.value = ''; if (!PRESETS[p]) return;
        const keep = { display: this.layout.display, opacity: this.layout.opacity };
        this.layout = Object.assign(PRESETS[p](), keep); this.rebuildControls(); this.syncMode(); this.applyOpacity();
      };
      bar.append(ps);
      const op = el('label'); op.textContent = 'Opacity';
      const r = el('input'); r.type = 'range'; r.min = 0.15; r.max = 1; r.step = 0.05; r.value = this.layout.opacity ?? 0.8;
      r.oninput = () => { this.layout.opacity = +r.value; this.applyOpacity(); }; op.append(r); bar.append(op);
      btn('✓ Done', () => this.setEditing(false));
      bar.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
      this.overlay.append(bar);
      this.toast('Drag controls to move them. Tap one to change its key or size.');
    }
    editDrag(e, item, node) {
      const t = e.changedTouches[0], sx = t.clientX, sy = t.clientY, ox = item.x, oy = item.y; let moved = false;
      const mv = ev => { const u = [...ev.changedTouches].find(u => u.identifier === t.identifier); if (!u) return; ev.preventDefault();
        if (Math.hypot(u.clientX - sx, u.clientY - sy) > 6) moved = true;
        item.x = Math.min(0.98, Math.max(0.02, ox + (u.clientX - sx) / innerWidth));
        item.y = Math.min(0.98, Math.max(0.02, oy + (u.clientY - sy) / innerHeight)); this.place(); };
      const up = ev => { if (![...ev.changedTouches].some(u => u.identifier === t.identifier)) return;
        node.removeEventListener('touchmove', mv); node.removeEventListener('touchend', up);
        if (!moved) this.openItem(item); };
      node.addEventListener('touchmove', mv, { passive: false }); node.addEventListener('touchend', up);
    }
    openItem(item) {
      const panel = el('div', 'sheet'); panel.style.zIndex = 70;
      const keyOptions = sel => Object.entries(KEYS).map(([c, k]) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${k.label}</option>`).join('');
      if (item.type === 'dpad') {
        panel.innerHTML = `<h2>D‑pad</h2>
          <label>Keys <select data-f="scheme"><option value="arrows">Arrow keys</option><option value="wasd">W A S D</option><option value="numpad">Numpad 8 4 6 2</option></select></label>`;
        const s = panel.querySelector('[data-f=scheme]');
        s.value = item.keys.up === 'KeyW' ? 'wasd' : item.keys.up === 'Numpad8' ? 'numpad' : 'arrows';
        s.onchange = () => { item.keys = { arrows: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
          wasd: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }, numpad: { up: 'Numpad8', down: 'Numpad2', left: 'Numpad4', right: 'Numpad6' } }[s.value]; };
      } else {
        panel.innerHTML = `<h2>Button</h2>
          <label>Sends <select data-f="key">${keyOptions(item.key)}</select></label>
          <label>Label (optional) <input type="text" data-f="label" value="${item.label || ''}" maxlength="8"></label>
          <label class="check"><input type="checkbox" data-f="wide" ${item.wide ? 'checked' : ''}> Wide shape</label>`;
        panel.querySelector('[data-f=key]').onchange = e => { item.key = e.target.value; this.rebuildControls(); };
        panel.querySelector('[data-f=label]').oninput = e => { item.label = e.target.value.trim(); this.rebuildControls(); };
        panel.querySelector('[data-f=wide]').onchange = e => { item.wide = e.target.checked; this.rebuildControls(); };
      }
      const sz = el('label'); sz.textContent = 'Size';
      const r = el('input'); r.type = 'range'; r.min = 36; r.max = 260; r.value = item.size; r.style.width = '100%';
      r.oninput = () => { item.size = +r.value; this.place(); }; sz.append(r); panel.append(sz);
      const acts = el('div', 'sheet-actions');
      acts.innerHTML = `<button class="danger" type="button">Remove</button><span class="spacer"></span><button class="primary" type="button">Done</button>`;
      acts.children[0].onclick = () => { this.layout.items = this.layout.items.filter(i => i !== item); this.rebuildControls(); panel.remove(); };
      acts.children[2].onclick = () => panel.remove();
      panel.append(acts);
      panel.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
      this.overlay.append(panel);
    }
    toast(msg) { if (window.ExePlayerToast) window.ExePlayerToast(msg); }
    save() { this.onSave && this.onSave(this.layout); }
    destroy() {
      this.destroyed = true; this.releaseAll(); clearTimeout(this.fadeTimer); clearInterval(this.coverTick); window.removeEventListener('message', this._onReady);
      document.body.classList.remove('editing');
      cancelAnimationFrame(this._padRaf);
      window.removeEventListener('gamepadconnected', this._padOn);
      document.removeEventListener('visibilitychange', this._vis); window.removeEventListener('blur', this._vis);
      this.frame.removeEventListener('load', this._frameLoad);
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('keydown', this._hk); document.removeEventListener('keyup', this._hk);
      this.overlay.innerHTML = '';
    }
  }

  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function label(item) { return item.label || (KEYS[item.key] ? KEYS[item.key].label : item.key); }

  window.TouchControls = TouchControls;
  window.TouchPresets = PRESETS;
})();
