// Press Row relay for Hudl Production Truck.
//
// Production Truck's built-in web view is an older Safari engine (no
// BroadcastChannel, for one). This function loads a Press Row overlay page
// server-side, routes its API calls back through krazomedia.com (see the
// /prx rewrites in vercel.json), and injects compatibility shims.
//
// Use in PT's HTML Embed:
//   https://krazomedia.com/api/pressrow?u=<Press Row overlay URL>
// Add &debug=1 to show a status box with any errors the page throws.

const HOSTS = {
  "hoops.pressrowapps.com": "hoops",
  "gridiron.pressrowapps.com": "gridiron",
};

const SHIM = (debug, gameId, prefix) => String.raw`<script>
(function(){
  var DEBUG = ${debug ? "true" : "false"}, GAME = ${JSON.stringify(gameId || "")}, PREFIX = ${JSON.stringify(prefix)};
  var st = { mode: 'starting', opened: 0, events: 0, bytes: 0, errors: 0, polls: 0, json: 'testing…', ctype: '', sample: '', empty: 0 }, log = [], box;

  // --- PT's overlay output is a hidden page: no animation frames, no resize
  // callbacks, visibilityState 'hidden'. Back them with timers. ---
  try {
    Object.defineProperty(document, 'hidden', { configurable: true, get: function(){ return false; } });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: function(){ return 'visible'; } });
  } catch (e) {}
  (function(){
    var nRAF = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
    var nCAF = window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : null;
    var seq = 0, live = {};
    window.requestAnimationFrame = function(cb){
      var id = ++seq, rec = { done: false };
      live[id] = rec;
      var run = function(t){ if (rec.done) return; rec.done = true; delete live[id]; cb(t); };
      if (nRAF) rec.n = nRAF(function(t){ run(t); });
      rec.t = setTimeout(function(){ run(performance.now()); }, 34);
      return id;
    };
    window.cancelAnimationFrame = function(id){ var r = live[id]; if (!r) return; r.done = true; clearTimeout(r.t); if (nCAF && r.n) nCAF(r.n); delete live[id]; };
  })();
  (function(){
    // Polling ResizeObserver: checks observed elements every 200 ms.
    function PRO(cb){ this.cb = cb; this.els = []; var self = this; this.iv = setInterval(function(){ self._check(false); }, 200); }
    PRO.prototype.observe = function(el){ if (this.els.some(function(x){ return x.el === el; })) return; this.els.push({ el: el, w: -1, h: -1 }); var self = this; setTimeout(function(){ self._check(true); }, 0); };
    PRO.prototype.unobserve = function(el){ this.els = this.els.filter(function(x){ return x.el !== el; }); };
    PRO.prototype.disconnect = function(){ this.els = []; clearInterval(this.iv); };
    PRO.prototype._check = function(){
      var out = [];
      this.els.forEach(function(x){ var r = x.el.getBoundingClientRect(), w = x.el.offsetWidth, h = x.el.offsetHeight;
        if (w !== x.w || h !== x.h) { x.w = w; x.h = h; out.push({ target: x.el, contentRect: { x: 0, y: 0, width: w, height: h, top: 0, left: 0, right: w, bottom: h }, borderBoxSize: [{ inlineSize: w, blockSize: h }], contentBoxSize: [{ inlineSize: w, blockSize: h }] }); } });
      if (out.length) try { this.cb(out, this); } catch (e) { if (window.console) console.error(e); }
    };
    window.ResizeObserver = PRO;
  })();

  // --- BroadcastChannel stand-in (same-page only) ---
  if (typeof window.BroadcastChannel === 'undefined') {
    var reg = {};
    window.BroadcastChannel = function(name){ this.name = String(name); this.onmessage = null; this._l = []; (reg[this.name] = reg[this.name] || []).push(this); };
    window.BroadcastChannel.prototype.postMessage = function(data){ var self = this, peers = (reg[this.name] || []).slice();
      setTimeout(function(){ peers.forEach(function(p){ if (p === self || p._closed) return; var ev = { data: data, type: 'message', target: p };
        if (typeof p.onmessage === 'function') p.onmessage(ev); p._l.forEach(function(f){ f(ev); }); }); }, 0); };
    window.BroadcastChannel.prototype.addEventListener = function(t, f){ if (t === 'message') this._l.push(f); };
    window.BroadcastChannel.prototype.removeEventListener = function(t, f){ this._l = this._l.filter(function(x){ return x !== f; }); };
    window.BroadcastChannel.prototype.close = function(){ this._closed = true; };
  }

  // --- EventSource replacement built on fetch, so it doesn't depend on PT's own ---
  // Falls back to polling the game JSON (scoreboard only) if no stream data arrives.
  function KES(url){
    var sm = String(url).match(/(\/api\/games\/[^\/?#]+\/broadcast-stream)/);
    if (sm) url = '/api/prstream?h=' + PREFIX.split('/').pop() + '&p=' + encodeURIComponent(sm[1]);
    this.url = url; this.readyState = 0; this.withCredentials = false; this._l = {};
    this.onopen = null; this.onmessage = null; this.onerror = null;
    var self = this; setTimeout(function(){ self._go(); }, 0);
  }
  KES.CONNECTING = 0; KES.OPEN = 1; KES.CLOSED = 2;
  KES.prototype.addEventListener = function(t, f){ (this._l[t] = this._l[t] || []).push(f); };
  KES.prototype.removeEventListener = function(t, f){ this._l[t] = (this._l[t] || []).filter(function(x){ return x !== f; }); };
  KES.prototype._emit = function(t, ev){ ev = ev || {}; ev.type = t; ev.target = this;
    var h = this['on' + t]; if ((t === 'open' || t === 'message' || t === 'error') && typeof h === 'function') { try { h.call(this, ev); } catch (e) { add(e); } }
    (this._l[t] || []).slice().forEach(function(f){ try { f(ev); } catch (e) { add(e); } }); };
  KES.prototype.close = function(){ this.readyState = 2; this._closed = true; if (this._ac) try { this._ac.abort(); } catch (e) {} if (this._pt) clearInterval(this._pt); };
  KES.prototype._go = function(){
    var self = this, got = false;
    self._ac = typeof AbortController === 'function' ? new AbortController() : null;
    var watchdog = setTimeout(function(){ if (!got && !self._closed) { if (self._ac) try { self._ac.abort(); } catch (e) {} self._poll(); } }, 8000);
    fetch(self.url, { headers: { Accept: 'text/event-stream' }, cache: 'no-store', signal: self._ac ? self._ac.signal : undefined })
      .then(function(r){
        if (!r.ok || !r.body || !r.body.getReader) throw new Error('stream HTTP ' + r.status);
        st.ctype = (r.headers.get('content-type') || '?') + ' · enc ' + (r.headers.get('content-encoding') || 'none') + ' · HTTP ' + r.status;
        var evBefore = st.events;
        self.readyState = 1; st.opened++; st.mode = 'stream'; self._emit('open'); draw();
        var rd = r.body.getReader(), dec = new TextDecoder(), buf = '', data = [], name = '', id = '';
        function flush(){ if (data.length) { st.events++; self._emit(name || 'message', { data: data.join('\n'), lastEventId: id }); } data = []; name = ''; }
        function handle(ln){
          if (ln === '') { flush(); return; } if (ln.charAt(0) === ':') return;
          var c = ln.indexOf(':'), f = c < 0 ? ln : ln.slice(0, c), v = c < 0 ? '' : ln.slice(c + 1); if (v.charAt(0) === ' ') v = v.slice(1);
          if (f === 'data') data.push(v); else if (f === 'event') name = v; else if (f === 'id') id = v; }
        function pump(){ return rd.read().then(function(x){
          if (x.done) { buf += dec.decode(); if (buf) { var tail = buf.split(/\r\n|\r|\n/); buf = ''; for (var j = 0; j < tail.length; j++) handle(tail[j]); } flush();
            if (st.events === evBefore) { st.empty++; if (st.empty >= 2 && !st.events) { self._poll(); return; } }
            throw new Error('stream ended'); }
          got = true; st.bytes += x.value.length; var chunk = dec.decode(x.value, { stream: true }); if (st.sample.length < 160) st.sample += chunk.slice(0, 160 - st.sample.length); buf += chunk;
          var lines = buf.split(/\r\n|\r|\n/); buf = lines.pop();
          for (var i = 0; i < lines.length; i++) handle(lines[i]);
          draw(); return pump(); }); }
        return pump();
      })
      .catch(function(e){ clearTimeout(watchdog); if (self._closed || self._polling) return; st.errors++; if (!st.events && st.errors >= 3) { self._poll(); return; } add('stream: ' + (e && e.message || e)); self.readyState = 2; self._emit('error'); draw(); });
  };
  KES.prototype._poll = function(){
    var self = this; if (self._polling || !GAME) return; self._polling = true; st.mode = 'polling (scoreboard only)'; if (self._ac) try { self._ac.abort(); } catch (e) {}
    self.readyState = 1; self._emit('open'); self._emit('air', { data: '{"onAir":true}' });
    function tick(){ fetch(PREFIX + '/api/games/' + GAME + '/json?view=graphics', { cache: 'no-store' })
      .then(function(r){ return r.text(); }).then(function(t){ st.polls++; if (!self._closed) self._emit('message', { data: t }); draw(); })
      .catch(function(e){ st.errors++; add('poll: ' + (e && e.message || e)); }); }
    tick(); self._pt = setInterval(tick, 1000);
  };
  window.EventSource = KES;

  function draw(){
    if (!DEBUG) return;
    if (!box) { if (!document.body) return; box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2147483647;background:rgba(0,0,0,.85);color:#7CFC9A;font:14px/1.35 Menlo,monospace;padding:8px 10px;border-radius:6px;max-width:70%;white-space:pre-wrap;pointer-events:none';
      document.body.appendChild(box); }
    box.textContent = 'Krazo relay v2 · ' + navigator.userAgent.replace(/.*AppleWebKit\//, 'WebKit ') +
      '\nMode: ' + st.mode + ' · opened ' + st.opened + ' · bytes ' + st.bytes + ' · events ' + st.events + ' · polls ' + st.polls + ' · errors ' + st.errors +
      '\nRelay JSON test: ' + st.json + '\n' + dom() + '\nStream reply: ' + (st.ctype || '—') + (st.sample ? '\nFirst bytes: ' + JSON.stringify(st.sample) : '') + (log.length ? '\nErrors:\n' + log.slice(-6).join('\n') : '\nNo script errors');
  }
  function add(s){ log.push(String(s && s.message ? s.message : s).slice(0, 240)); draw(); }
  window.addEventListener('error', function(e){ var t = e.target; if (t && t !== window && t.tagName) { if (t.tagName !== 'IMG') add('could not load ' + t.tagName.toLowerCase()); return; } add((e.message || 'error') + ' @line ' + (e.lineno || '?')); }, true);
  ['error','warn'].forEach(function(k){ var o = console[k]; console[k] = function(){ try { var a = [].slice.call(arguments).map(function(x){ return x && x.stack ? (x.message + ' | ' + String(x.stack).split('\n')[0]) : (x && x.message) || String(x); }); add('console.' + k + ': ' + a.join(' ')); } catch (e) {} return o && o.apply(console, arguments); }; });
  var rafN = 0; (function f(){ rafN++; if (window.requestAnimationFrame) requestAnimationFrame(f); })();
  function dom(){ var sb = document.getElementById('scoreboard-root'), stg = document.getElementById('gfx-stage'), cs = function(e){ try { return getComputedStyle(e); } catch (x) { return null; } };
    var t = stg ? (cs(stg) || {}).transform : '—';
    var board = document.querySelector('#sb-region .scoreboard, #sb-region [class*="scoreboard"]'), br = board ? board.getBoundingClientRect() : null, bs = board ? cs(board) : null;
    return 'Page ' + (document.visibilityState || '?') + ' · frames ' + rafN + ' · board ' + (br ? Math.round(br.left) + ',' + Math.round(br.top) + ' ' + Math.round(br.width) + '×' + Math.round(br.height) + ' op ' + bs.opacity + ' vis ' + bs.visibility + ' disp ' + bs.display : 'none') + '\n' +
      'Scoreboard HTML ' + (sb ? sb.innerHTML.length : 'missing') + ' chars · stage ' + (stg ? stg.offsetWidth + '×' + stg.offsetHeight + ' ' + t : 'missing') + ' · page opacity ' + (document.documentElement.style.opacity || '1') + ' · window ' + innerWidth + '×' + innerHeight; }
  window.addEventListener('unhandledrejection', function(e){ add('promise: ' + (e.reason && (e.reason.message || e.reason))); });
  if (DEBUG && GAME) fetch(PREFIX + '/api/games/' + GAME + '/json?view=graphics', { cache: 'no-store' })
    .then(function(r){ return r.json().then(function(d){ st.json = 'HTTP ' + r.status + (d && d.homeTeam ? ' · ' + d.homeTeam.name + ' ' + d.homeTeam.score + '–' + d.awayTeam.score + ' ' + d.awayTeam.name : ''); draw(); }); })
    .catch(function(e){ st.json = 'FAILED ' + (e && e.message || e); draw(); });
  document.addEventListener('DOMContentLoaded', draw); setInterval(draw, 1000);
})();
</script>`;

const ANCHORS = ["top", "top-left", "top-right", "bottom", "bottom-left", "bottom-right"];
const num = (v, lo, hi) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };

// Placement options (all optional, in 1920×1080 pixels):
//   sb=top|top-left|top-right|bottom|bottom-left|bottom-right   scoreboard corner
//   sbx, sby     nudge the scoreboard        sbscale   resize it (e.g. 0.8)
//   cardx, cardy nudge stat cards           cardscale resize them
// Test switches: &off=clip,grad,img,radius,shadow,op,pos (or all) turn drawing
// features off everywhere, to find what PT's hidden output copy drops.
const OFF = {
  clip: "*,*::before,*::after{clip-path:none!important;-webkit-clip-path:none!important}",
  grad: "*,*::before,*::after{background-image:none!important}",
  img: "img{display:none!important}",
  radius: "*,*::before,*::after{border-radius:0!important}",
  shadow: "*,*::before,*::after{box-shadow:none!important;text-shadow:none!important}",
  op: "*,*::before,*::after{opacity:1!important}",
  pos: "#stack{position:absolute!important;top:24px!important;z-index:9!important}",
};
export function offCss(v) {
  const keys = String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
  const list = keys.includes("all") ? Object.keys(OFF) : keys.filter((k) => OFF[k]);
  return list.length ? `<style id="krazo-off">${list.map((k) => OFF[k]).join("")}</style>` : "";
}

export function placementCss(o = {}) {
  const css = [];
  const sbx = num(o.sbx, -1900, 1900) || 0, sby = num(o.sby, -1060, 1060) || 0, sbs = num(o.sbscale, 0.2, 3);
  if (sbx || sby) css.push(`#stack{transform:translate(${sbx}px,${sby}px)!important}`);
  if (sbs) css.push(`#sb-region{transform:scale(${sbs})!important;transform-origin:${o.sb && /left/.test(o.sb) ? "left" : o.sb && /right/.test(o.sb) ? "right" : "center"} ${o.sb && /bottom/.test(o.sb) ? "bottom" : "top"}!important}`);
  const cx = num(o.cardx, -1900, 1900) || 0, cy = num(o.cardy, -1060, 1060) || 0, cs = num(o.cardscale, 0.2, 3);
  if (cx || cy) css.push(`#card-layer{transform:translate(${cx}px,${cy}px)!important}`);
  if (cs) css.push(`#card-region{transform:scale(calc(var(--card-scale,1.3) * ${cs}))!important}`);
  return css.length ? `<style id="krazo-placement">${css.join("")}</style>` : "";
}

export function applyAnchor(html, anchor) {
  if (!ANCHORS.includes(anchor)) return html;
  let out = html.replace(/const STACK_CONFIG = (\{[^;]*\});/, (m, j) => {
    try { const c = JSON.parse(j); c.stackAnchor = anchor; return `const STACK_CONFIG = ${JSON.stringify(c)};`; } catch { return m; }
  });
  const side = anchor.startsWith("bottom") ? "bottom" : "top";
  const x = anchor.endsWith("-left") ? "start" : anchor.endsWith("-right") ? "end" : "center";
  out = out.replace(/<body([^>]*)class="([^"]*)"/i, (m, pre, cls) => {
    const kept = cls.split(/\s+/).filter((c) => c && !/^stack-(top|bottom|x-start|x-center|x-end)$/.test(c));
    return `<body${pre}class="${[...kept, "stack-" + side, "stack-x-" + x].join(" ")}"`;
  });
  return out;
}

export function transform(html, host, debug, opts = {}) {
  const key = HOSTS[host];
  const prefix = `/prx/${key}`;
  let out = html.split(`https://${host}`).join(prefix);
  // Relative API calls inside the page (e.g. '/api/broadcast/live/...').
  out = out.replace(/(['"])\/api\//g, `$1${prefix}/api/`);
  // Drop any CSP meta that would block the injected shim.
  out = out.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");
  const gm = html.match(/const gameId = "([^"]+)"/);
  const shim = SHIM(debug, gm ? gm[1] : "", prefix);
  // PT's embedded browser doesn't run CSS animations, and Press Row's graphics
  // start invisible and fade in, so they stayed invisible. Turn animations and
  // transitions off so everything shows in its final state immediately.
  // PT's program capture also drops GPU-composited layers: Press Row's scorebug
  // has filter: drop-shadow on the whole board, so it showed in PT's preview but
  // not on the overlay. Remove filters (shadows) so it's drawn normally.
  const noAnim = '<style id="krazo-no-anim">*,*::before,*::after{animation:none!important;transition:none!important;filter:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}</style>';
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, (m) => m + shim);
  else out = shim + out;
  out = applyAnchor(out, opts.sb);
  const place = placementCss(opts) + offCss(opts.off);
  if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, noAnim + place + '</head>');
  else out = noAnim + place + out;
  return out;
}

export default async function handler(req, res) {
  const u = (req.query && req.query.u) || new URL(req.url, "http://x").searchParams.get("u");
  const debug = String((req.query && req.query.debug) || "") === "1";
  let target;
  try { target = new URL(u); } catch { res.status(400).send("Add ?u=<Press Row overlay URL>"); return; }
  if (target.protocol !== "https:" || !HOSTS[target.host]) { res.status(400).send("Only Press Row overlay URLs are allowed."); return; }
  try {
    const r = await fetch(target.toString(), { headers: { "user-agent": req.headers["user-agent"] || "Mozilla/5.0", accept: "text/html" }, cache: "no-store" });
    const html = await r.text();
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    const q = req.query || {};
    const opts = { sb: q.sb, sbx: q.sbx, sby: q.sby, sbscale: q.sbscale, cardx: q.cardx, cardy: q.cardy, cardscale: q.cardscale, off: q.off };
    res.status(r.status).send(transform(html, target.host, debug, opts));
  } catch (e) {
    res.status(502).send("Couldn't reach Press Row: " + e.message);
  }
}
