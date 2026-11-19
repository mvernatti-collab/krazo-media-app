// Every wrestling link in one place, with copy / share / QR. Used by the hub and the
// scorer's Share tab.
import qrcode from "/pt/vendor/qrcode.mjs";

export const BASE = location.origin + "/pt/wrestle/";
export function wrestlingLinks(codes = {}) {
  const k = (c) => (c ? "?k=" + c : "");
  return [
    { id: "score", title: "Scorer", who: "Table · iPad or laptop · runs the match", url: BASE + "score.html" + k(codes.score), crew: true },
    { id: "clock", title: "Clock operator", who: "Phone or iPad · start / stop and set the clock", url: BASE + "clock.html" + k(codes.clock), crew: true },
    { id: "gfx", title: "Graphics director", who: "Phone, iPad or laptop · pushes stream graphics", url: BASE + "graphics.html" + k(codes.gfx), crew: true },
    { id: "bcast", title: "Broadcast view", view: true, who: "Announcers · live bout, records, talking points", url: BASE + "broadcast.html" },
    { id: "fan", title: "Spectator view", view: true, who: "Fans and parents · live score on their phone", url: BASE + "spectator.html" },
    { id: "ovl", title: "PT overlay", view: true, who: "Paste into Production Truck · HTML Embed, full screen", url: BASE + "overlay.html", noqr: true },
    { id: "stats", title: "Season stats", view: true, who: "Coaches · records and leaders", url: BASE + "stats.html" },
  ];
}

export function qrSvg(text, cell = 4) {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const LINK_CSS = `
.lk{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.lk .c{background:#17171c;border:1px solid #2b2b32;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px;min-width:0}
.lk .t{font:400 24px Anton,Impact,sans-serif;text-transform:uppercase;letter-spacing:.02em;display:flex;align-items:center;gap:8px}
.lk .t i{font:700 10px -apple-system,Arial;font-style:normal;letter-spacing:.1em;padding:3px 7px;border-radius:999px;background:#3a2e10;color:#ffd27a}
.lk .t i.v{background:#12351f;color:#7ee2a0}
.lk .w{color:#9a9aa3;font-size:13px}
.lk .u{font:12px Menlo,monospace;color:#cfcfd6;background:#0e0e12;border:1px solid #2b2b32;border-radius:8px;padding:8px;word-break:break-all}
.lk .b{display:flex;gap:6px;flex-wrap:wrap}
.lk .b button,.lk .b a{font:600 14px -apple-system,Arial;color:#fff;background:#24242b;border:1px solid #34343c;border-radius:10px;padding:9px 12px;text-decoration:none;cursor:pointer}
.lk .q{display:none;background:#fff;border-radius:10px;padding:10px;align-self:flex-start}
.lk .q svg{width:180px;height:180px;display:block}
.lk .c.open .q{display:block}`;

export function renderLinks(el, links, toast = () => {}) {
  el.innerHTML = `<div class="lk">${links.map((l, i) => `<div class="c" data-i="${i}">
    <div class="t">${esc(l.title)} ${l.crew ? '<i>crew link</i>' : l.view ? '<i class="v">view only</i>' : ""}</div>
    <div class="w">${esc(l.who)}</div>
    <div class="u">${esc(l.url)}</div>
    <div class="b"><button data-a="copy">Copy</button>${navigator.share ? '<button data-a="share">Share</button>' : ""}${l.noqr ? "" : '<button data-a="qr">QR code</button>'}<a href="${esc(l.url)}" target="_blank" rel="noopener">Open ↗</a></div>
    <div class="q">${l.noqr ? "" : qrSvg(l.url)}</div></div>`).join("")}</div>`;
  el.onclick = async (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const c = b.closest(".c"), l = links[+c.dataset.i];
    if (b.dataset.a === "copy") { try { await navigator.clipboard.writeText(l.url); toast("Link copied"); } catch { prompt("Copy this link:", l.url); } }
    else if (b.dataset.a === "share") { try { await navigator.share({ title: l.title, url: l.url }); } catch {} }
    else if (b.dataset.a === "qr") { c.classList.toggle("open"); b.textContent = c.classList.contains("open") ? "Hide QR" : "QR code"; }
  };
}
