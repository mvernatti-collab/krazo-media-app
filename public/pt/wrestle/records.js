// Season stats built from every saved dual (shared by stats, announcer and graphics pages).
import { read } from "/pt/pt-sync.js";
import { derive, unpack } from "/pt/wrestle/core.js";

export const rkey = (team, name) => team + "|" + String(name || "").trim().toLowerCase();

export async function loadDuals() {
  const idx = unpack(await read("wrestle-duals").catch(() => null));
  const list = (idx && idx.list) || [];
  const duals = (await Promise.all(list.map((d) => read("wrestle-dual-" + d.id).then(unpack).catch(() => null)))).filter(Boolean);
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
export const blankGfx = () => ({ v: 0, show: { bug: true, next: false, dual: false, lt: false }, lt: { title: "", sub: "" }, rec: { h: "", a: "" } });
