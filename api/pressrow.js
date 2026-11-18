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

const SHIM = (debug) => `<script>
(function(){
  // --- BroadcastChannel stand-in (same-page only) ---
  if (typeof window.BroadcastChannel === 'undefined') {
    var reg = {};
    window.BroadcastChannel = function(name){
      this.name = String(name); this.onmessage = null; this._l = [];
      (reg[this.name] = reg[this.name] || []).push(this);
    };
    window.BroadcastChannel.prototype.postMessage = function(data){
      var self = this, peers = (reg[this.name] || []).slice();
      setTimeout(function(){ peers.forEach(function(p){
        if (p === self || p._closed) return;
        var ev = { data: data, type: 'message', target: p };
        if (typeof p.onmessage === 'function') p.onmessage(ev);
        p._l.forEach(function(f){ f(ev); });
      }); }, 0);
    };
    window.BroadcastChannel.prototype.addEventListener = function(t, f){ if (t === 'message') this._l.push(f); };
    window.BroadcastChannel.prototype.removeEventListener = function(t, f){ this._l = this._l.filter(function(x){ return x !== f; }); };
    window.BroadcastChannel.prototype.close = function(){ this._closed = true; };
  }
  ${debug ? `
  // --- on-screen debug box ---
  var log = [], es = { opened: 0, msgs: 0, errors: 0, named: 0 }, box;
  function draw(){
    if (!box) { box = document.createElement('div'); box.id = 'krazo-relay-debug';
      box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2147483647;background:rgba(0,0,0,.85);color:#7CFC9A;font:14px/1.35 Menlo,monospace;padding:8px 10px;border-radius:6px;max-width:70%;white-space:pre-wrap;pointer-events:none';
      (document.body || document.documentElement).appendChild(box); }
    box.textContent = 'Krazo relay · ' + navigator.userAgent.replace(/.*AppleWebKit\\//,'WebKit ') +
      '\\nStream: opened ' + es.opened + ' · messages ' + es.msgs + ' · named events ' + es.named + ' · errors ' + es.errors +
      (log.length ? '\\nErrors:\\n' + log.slice(-8).join('\\n') : '\\nNo script errors');
  }
  function add(s){ log.push(String(s).slice(0, 300)); draw(); }
  window.addEventListener('error', function(e){ var t = e.target; if (t && t !== window && t.tagName) { add('could not load ' + t.tagName.toLowerCase() + ': ' + (t.src || t.href || '')); return; } add((e.message || 'error') + ' @line ' + (e.lineno || '?') + ':' + (e.colno || '?')); }, true);
  window.addEventListener('unhandledrejection', function(e){ add('promise: ' + (e.reason && (e.reason.message || e.reason))); });
  var oe = console.error; console.error = function(){ try { add('console: ' + [].slice.call(arguments).join(' ')); } catch(x){} return oe.apply(console, arguments); };
  if (window.EventSource) {
    var ES = window.EventSource;
    window.EventSource = function(url, opts){
      var s = new ES(url, opts);
      s.addEventListener('open', function(){ es.opened++; draw(); });
      s.addEventListener('message', function(){ es.msgs++; draw(); });
      s.addEventListener('error', function(){ es.errors++; draw(); });
      var ael = s.addEventListener.bind(s);
      s.addEventListener = function(t, f, o){ if (t !== 'open' && t !== 'message' && t !== 'error') { ael(t, function(ev){ es.named++; draw(); }); } return ael(t, f, o); };
      return s;
    };
    window.EventSource.prototype = ES.prototype;
    window.EventSource.CONNECTING = 0; window.EventSource.OPEN = 1; window.EventSource.CLOSED = 2;
  } else { add('EventSource is missing'); }
  document.addEventListener('DOMContentLoaded', draw);
  setInterval(draw, 1000);` : ""}
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
  const shim = SHIM(debug);
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
