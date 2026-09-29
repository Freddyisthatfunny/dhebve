/* Injected into the Boxedwine page by sw.js.
 * - hides Boxedwine's desktop-oriented buttons/console
 * - scales the game canvas to fit the phone/tablet screen, keeping aspect ratio
 * - tracks AudioContexts so the parent page can unlock sound on iOS after a real tap
 */
(function () {
  var contexts = [];
  ['AudioContext', 'webkitAudioContext'].forEach(function (name) {
    var Orig = window[name]; if (!Orig) return;
    var Wrapped = function (opts) { var c = new Orig(opts); contexts.push(c); return c; };
    Wrapped.prototype = Orig.prototype;
    try { Object.setPrototypeOf(Wrapped, Orig); } catch (e) {}
    window[name] = Wrapped;
  });
  var muted = false;
  window.__exeplayerResumeAudio = function () {
    if (muted) return;
    contexts.forEach(function (c) { if (c.state !== 'running') c.resume().catch(function () {}); });
  };
  window.__exeplayerSetMuted = function (m) {
    muted = !!m;
    contexts.forEach(function (c) { (muted ? c.suspend() : c.resume()).catch(function () {}); });
  };

  var style = document.createElement('style');
  style.textContent =
    'html,body{margin:0!important;padding:0!important;background:#000!important;overflow:hidden!important;height:100%;}' +
    '#controls,#console,hr,#openModal,#openModalExe{display:none!important;}' +
    '.emscripten_border{border:0!important;}' +
    '#loading{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'color:#ccd;font:15px -apple-system,system-ui,sans-serif;gap:10px;z-index:1;pointer-events:none;}' +
    '#loading progress{width:60vw;max-width:360px;}' +
    'canvas.emscripten{position:fixed!important;margin:0!important;border:0!important;image-rendering:auto;touch-action:none;}';
  (document.head || document.documentElement).appendChild(style);

  // Screen modes set by the parent page: fit (smooth), sharp (fit, crisp pixels), stretch (fill the screen)
  function fit() {
    var mode = window.__exeplayerDisplay || 'fit';
    var vw = window.innerWidth, vh = window.innerHeight;
    var list = document.querySelectorAll('canvas');
    var rendering = mode === 'sharp' ? 'pixelated' : 'auto';
    for (var i = 0; i < list.length; i++) {
      var c = list[i]; if (!c.width || !c.height) continue;
      if (c.style.imageRendering !== rendering) c.style.setProperty('image-rendering', rendering, 'important');
      var s = Math.min(vw / c.width, vh / c.height);
      var w = Math.floor(c.width * s), h = Math.floor(c.height * s);
      if (mode === 'stretch') { w = vw; h = vh; }
      var W = w + 'px', H = h + 'px', L = Math.floor((vw - w) / 2) + 'px', T = Math.floor((vh - h) / 2) + 'px';
      if (c.style.width !== W) c.style.setProperty('width', W, 'important');
      if (c.style.height !== H) c.style.setProperty('height', H, 'important');
      if (c.style.left !== L) c.style.setProperty('left', L, 'important');
      if (c.style.top !== T) c.style.setProperty('top', T, 'important');
    }
  }
  // Keep WebGL frames readable so we can tell when the game has drawn (tiny cost; lets the start cover hide itself)
  var origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (/webgl/.test(String(type))) { attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true }); }
    return origGetContext.call(this, type, attrs);
  };
  // Tell the parent once the screen shows something other than black / the plain Wine desktop colour
  var probe = document.createElement('canvas'); probe.width = 24; probe.height = 18;
  var pctx = probe.getContext('2d', { willReadFrequently: true });
  var readyTimer = setInterval(function () {
    var cs = document.querySelectorAll('canvas'), best = null;
    for (var i = 0; i < cs.length; i++) if (cs[i].width > 64 && getComputedStyle(cs[i]).display !== 'none') best = cs[i];
    if (!best) return;
    try {
      pctx.clearRect(0, 0, 24, 18); pctx.drawImage(best, 0, 0, 24, 18);
      var d = pctx.getImageData(0, 0, 24, 18).data, drawn = 0;
      for (var j = 0; j < d.length; j += 4) {
        var r = d[j], g = d[j + 1], b = d[j + 2];
        var black = r + g + b < 30, desktop = Math.abs(r - 58) < 12 && Math.abs(g - 110) < 12 && Math.abs(b - 165) < 12;
        if (!black && !desktop) drawn++;
      }
      if (drawn > 20) { clearInterval(readyTimer); parent.postMessage({ exeplayer: 'ready' }, location.origin); }
    } catch (e) {}
  }, 700);
  window.__exeplayerFit = fit;
  setInterval(fit, 250);
  window.addEventListener('resize', fit);

  // let the parent know about fatal errors so it can show something useful
  window.addEventListener('error', function (e) {
    try { parent.postMessage({ exeplayer: 'error', message: String(e.message || e.error || 'error') }, location.origin); } catch (x) {}
  });
  var origLog = console.log;
  console.log = function () {
    origLog.apply(console, arguments);
    try {
      var msg = Array.prototype.join.call(arguments, ' ');
      if (/Unable to load|not found|failed/i.test(msg)) parent.postMessage({ exeplayer: 'log', message: msg }, location.origin);
    } catch (x) {}
  };
})();
