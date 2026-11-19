// Season stats built from every saved dual (shared by stats, announcer and graphics pages).
import { read } from "/pt/pt-sync.js";
import { derive, unpack } from "/pt/wrestle/core.js";

export const rkey = (team, name) => team + "|" + String(name || "").trim().toLowerCase();

// Returns the saved duals. loadDuals.info has what happened, for status lines.
export async function loadDuals() {
  const info = { listed: 0, loaded: 0, error: "" };
  let idx = null;
  try { idx = unpack(await read("wrestle-duals")); } catch (e) { info.error = "Couldn't reach the database (" + e.message + ")"; }
  const list = ((idx && idx.list) || []).filter((d) => d && d.id);
  info.listed = list.length;
  info.missing = []; info.failed = [];
  const duals = (await Promise.all(list.map((d) => read("wrestle-dual-" + d.id).then((x) => { const u = unpack(x); if (!u || !u.bouts) info.missing.push(d); return u; }).catch((e) => { info.failed.push(d); return null; })))).filter((d) => d && d.bouts);
  info.loaded = duals.length;
  loadDuals.info = info;
  return duals.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export function buildStats(duals) {
  const map = new Map();
  for (const r of duals) for (const b of r.bouts || []) {
    const d = derive(b.ev || []);
    for (const s of ["h", "a"]) {
      const name = (s === "h" ? b.hn : b.an) || "";
      if (!name) continue; // open weight
      const team = (s === "h" ? r.home : r.away).name, o = s === "h" ? "a" : "h";
      const k = rkey(team, name);
      if (!map.has(k)) map.set(k, { name, team, wts: {}, W: 0, L: 0, FALL: 0, TF: 0, MD: 0, DEC: 0, FOR: 0, TD: 0, E: 0, R: 0, NF: 0, NFp: 0, pf: 0, pa: 0, stall: 0, pen: 0, tp: 0, m: [] });
      const st = map.get(k), won = b.w === s;
      st.wts[b.wt] = (st.wts[b.wt] || 0) + 1;
      if (won) { st.W++; st.tp += b.tp; if (st[b.type] !== undefined) st[b.type]++; } else st.L++;
      st.pf += b[s] || 0; st.pa += b[o] || 0;
      for (const e of d.list) {
        if (e.k === "TD" && e.s === s) st.TD++;
        else if (e.k === "E" && e.s === s) st.E++;
        else if (e.k === "R" && e.s === s) st.R++;
        else if (e.k.startsWith("NF") && e.s === s) { st.NF++; st.NFp += e.pts; }
        else if (e.k === "STALL" && e.s === s) st.stall++;
        else if ((e.k === "PEN" || e.k === "CAUT") && e.s === s) st.pen++;
      }
      st.m.push({ dual: r.id, date: r.date, opp: (s === "h" ? b.an : b.hn) || "Open", oppTeam: (s === "h" ? r.away : r.home).name, wt: b.wt, won, type: b.type, score: b.score, time: b.time });
    }
  }
  for (const x of map.values()) { x.wt = Object.entries(x.wts).sort((a, b) => b[1] - a[1])[0][0]; x.rec = `${x.W}-${x.L}`; }
  return map;
}

// Record string for a wrestler, or "" when we have nothing on them.
export function recOf(stats, team, name) { const x = name && stats.get(rkey(team, name)); return x ? x.rec : ""; }

// Graphics state lives in its own doc so the scorer and a remote graphics
// operator can both push without overwriting each other's scoring data.
export const GFX = "wrestle-gfx";
export const CARDS = ["next", "dual", "open", "brk", "fin"]; // full cards: only one at a time
export const blankGfx = () => ({ v: 0, show: { bug: true, next: false, dual: false, lt: false, open: false, brk: false, fin: false, spon: false }, lt: { title: "", sub: "" }, rec: { h: "", a: "" }, open: { h: "", a: "" }, layout: { pos: "", scale: 1, x: 0, y: 0 } });
// Turn one full card on (or off) and every other card off.
export function toggleCard(show, which) { const on = !show[which]; CARDS.forEach((c) => (show[c] = false)); show[which] = on; if (on) show.lt = false; }

// Season dual record for a team, not counting the dual with id `skip`.
export function dualRecord(duals, name, skip) {
  let w = 0, l = 0, t = 0;
  for (const d of duals) {
    if (d.id === skip || !(d.bouts || []).length) continue;
    const s = d.home.name === name ? "h" : d.away.name === name ? "a" : null; if (!s) continue;
    const o = s === "h" ? "a" : "h";
    if (d.team[s] > d.team[o]) w++; else if (d.team[s] < d.team[o]) l++; else t++;
  }
  return w + l + t ? `${w}-${l}${t ? "-" + t : ""}` : "";
}

// ---- Logos ----
// team.logo is a site path (built-in Ozark art) or "doc:<key>" for an uploaded
// logo stored in its own doc (pt/wrestle-logo-<key>) so the live doc stays small.
export const OZARK_LOGO = "/pt/wrestle/img/ozark-paw.png";
export const OZARK_CREST = "/pt/wrestle/img/ozark-crest.png";
const cache = {};
export async function logoSrc(team) {
  const ref = (team && team.logo) || (team && /^ozark$/i.test(team.name || "") ? OZARK_LOGO : "");
  if (!ref) return "";
  if (!ref.startsWith("doc:")) return ref;
  if (!(ref in cache)) cache[ref] = read("wrestle-logo-" + ref.slice(4).split("?")[0]).then((d) => (d && d.img) || "").catch(() => "");
  return cache[ref];
}
export const crestSrc = async (team) => (team && /^ozark$/i.test(team.name || "") && !team.logo ? OZARK_CREST : logoSrc(team));

// Shrink an uploaded image file to a small PNG data URL (fits in one Firestore doc).
export function shrinkImage(file, max = 260) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL("image/png"));
    };
    img.onerror = rej; img.src = url;
  });
}
