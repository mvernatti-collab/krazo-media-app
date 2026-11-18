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
      '\nRelay JSON test: ' + st.json + '\nStream reply: ' + (st.ctype || '—') + (st.sample ? '\nFirst bytes: ' + JSON.stringify(st.sample) : '') + (log.length ? '\nErrors:\n' + log.slice(-6).join('\n') : '\nNo script errors');
  }
  function add(s){ log.push(String(s && s.message ? s.message : s).slice(0, 240)); draw(); }
  window.addEventListener('error', function(e){ var t = e.target; if (t && t !== window && t.tagName) { if (t.tagName !== 'IMG') add('could not load ' + t.tagName.toLowerCase()); return; } add((e.message || 'error') + ' @line ' + (e.lineno || '?')); }, true);
  window.addEventListener('unhandledrejection', function(e){ add('promise: ' + (e.reason && (e.reason.message || e.reason))); });
  if (DEBUG && GAME) fetch(PREFIX + '/api/games/' + GAME + '/json?view=graphics', { cache: 'no-store' })
    .then(function(r){ return r.json().then(function(d){ st.json = 'HTTP ' + r.status + (d && d.homeTeam ? ' · ' + d.homeTeam.name + ' ' + d.homeTeam.score + '–' + d.awayTeam.score + ' ' + d.awayTeam.name : ''); draw(); }); })
    .catch(function(e){ st.json = 'FAILED ' + (e && e.message || e); draw(); });
  document.addEventListener('DOMContentLoaded', draw); setInterval(draw, 1000);
})();
</script>`;

export function transform(html, host, debug) {
  const key = HOSTS[host];
  const prefix = `/prx/${key}`;
  let out = html.split(`https://${host}`).join(prefix);
  // Relative API calls inside the page (e.g. '/api/broadcast/live/...').
  out = out.replace(/(['"])\/api\//g, `$1${prefix}/api/`);
  // Drop any CSP meta that would block the injected shim.
  out = out.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");
  const gm = html.match(/const gameId = "([^"]+)"/);
  const shim = SHIM(debug, gm ? gm[1] : "", prefix);
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, (m) => m + shim);
  else out = shim + out;
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
    res.status(r.status).send(transform(html, target.host, debug));
  } catch (e) {
    res.status(502).send("Couldn't reach Press Row: " + e.message);
  }
}
