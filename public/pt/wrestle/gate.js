// Access for the wrestling pages: a director PIN plus one share code per crew role.
// Crew open their role link (…?k=<code>) with no PIN; the director signs in once per
// device. Viewer pages (broadcast, spectator, stats, overlay) stay open.
//
// This is a lock on the pages, matching the app's PIN approach. The database rules
// are still open, so it keeps casual visitors out rather than being hard security.
import { read, write } from "/pt/pt-sync.js";

export const ACCESS = "wrestle-access";
export const ROLES = { score: "Scorer", clock: "Clock operator", gfx: "Graphics director" };

export async function sha(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("krazo-wrestle:" + text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export const newCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((x) => "abcdefghjkmnpqrstuvwxyz23456789"[x % 31]).join("");
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: (k) => { try { localStorage.removeItem(k); } catch {} } };

// Stored flat (pin, c_score, c_clock, c_gfx) so the REST backup path can read it.
export async function loadAccess() {
  const d = await read(ACCESS).catch(() => null);
  if (!d || !d.pin) return d || null;
  return { pin: d.pin, v: d.v, codes: d.codes && typeof d.codes === "object" ? d.codes : { score: d.c_score, clock: d.c_clock, gfx: d.c_gfx } };
}
export async function saveAccess(a) {
  a.v = Date.now();
  await write(ACCESS, { pin: a.pin, c_score: a.codes.score, c_clock: a.codes.clock, c_gfx: a.codes.gfx, v: a.v });
  return a;
}
export function isDirector(a) { return !!(a && a.pin && ls.get("krazo-wr-dir") === a.pin); }
export function signOut() { ls.del("krazo-wr-dir"); }
export async function signIn(a, pin) { if (a && a.pin && (await sha(pin)) === a.pin) { ls.set("krazo-wr-dir", a.pin); return true; } return false; }
export const codesOf = (a) => (a && a.codes) || {};

// Resolve when this page may be used. role: "score" | "clock" | "gfx" | "director".
// Returns { director, access }.
export async function gate(role, title = "") {
  const a = await loadAccess();
  if (!a || !a.pin) return { director: true, access: a, unset: true }; // not set up yet: hub asks for a PIN
  const k = new URLSearchParams(location.search).get("k");
  const code = codesOf(a)[role];
  if (isDirector(a)) return { director: true, access: a };
  if (code && (k === code || ls.get("krazo-wr-" + role) === code)) { ls.set("krazo-wr-" + role, code); return { director: false, access: a }; }
  await pinScreen(a, title || ROLES[role] || "Director", !!(k && code));
  return { director: true, access: a };
}

function pinScreen(a, title, badLink) {
  return new Promise((done) => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;inset:0;z-index:99999;background:#0c0c0f;color:#fff;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,Helvetica,Arial,sans-serif";
    d.innerHTML = `<form style="width:100%;max-width:360px;text-align:center">
      <img src="/pt/krazo.png" alt="Krazo Media" style="height:46px;margin-bottom:18px">
      <div style="font:400 30px Anton,Impact,sans-serif;text-transform:uppercase;letter-spacing:.02em">${title}</div>
      <div style="color:#9a9aa3;margin:8px 0 18px;font-size:15px">${badLink ? "This link has expired. Ask the director for a new one, or" : "Ask the director for your link, or"} enter the director PIN.</div>
      <input type="password" inputmode="numeric" autocomplete="current-password" placeholder="Director PIN" style="width:100%;font-size:22px;padding:14px;border-radius:12px;border:1px solid #34343c;background:#17171c;color:#fff;text-align:center;letter-spacing:.3em">
      <button style="width:100%;margin-top:12px;font-size:18px;font-weight:700;padding:14px;border-radius:12px;border:0;background:#ED1C24;color:#fff">Sign in</button>
      <div class="m" style="color:#ff9a9a;margin-top:10px;min-height:20px"></div></form>`;
    document.body.appendChild(d);
    const f = d.querySelector("form"), i = d.querySelector("input");
    setTimeout(() => i.focus(), 50);
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (await signIn(a, i.value.trim())) { d.remove(); done(); } else { d.querySelector(".m").textContent = "That PIN didn't match."; i.select(); }
    };
  });
}
