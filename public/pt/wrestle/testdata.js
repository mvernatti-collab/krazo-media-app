// Fictional teams, rosters and finished duals for testing. Everything made here is
// flagged test:true so "Remove test data" can take it all back out.
import { read, write } from "/pt/pt-sync.js";
import { WEIGHTS, RESULTS, suggestResult, blankMatch, defaultState, pack, unpack, derive, other, DOC, fmtElapsed } from "/pt/wrestle/core.js";

export const TEST_TEAMS = {
  "ozark-test": { name: "Ozark Test", short: "OZT", color: "#ED1C24", logo: "/pt/wrestle/img/ozark-paw.png" },
  "brightwater": { name: "Brightwater", short: "BRW", color: "#1F4FA0" },
  "kestrel-valley": { name: "Kestrel Valley", short: "KSV", color: "#0F766E" },
  "ironwood-prairie": { name: "Ironwood Prairie", short: "IWP", color: "#6B21A8" },
  "stonebrook": { name: "Stonebrook", short: "STB", color: "#EA580C" },
};
const FIRST = ["Mason", "Eli", "Carter", "Owen", "Wyatt", "Landon", "Brody", "Gavin", "Colton", "Jace", "Ryder", "Easton", "Kade", "Tucker", "Beau", "Silas", "Rhett", "Nolan", "Cole", "Trey", "Dax", "Hayden", "Bryce", "Gage", "Reid", "Asher", "Knox", "Luke", "Cash", "Jett", "Maddox", "Tate"];
const LAST = ["Harlan", "Whitfield", "Kessler", "Branson", "Calloway", "Dempsey", "Fairbanks", "Garrity", "Holloway", "Ingram", "Jessup", "Kincaid", "Lockhart", "Mayfield", "Norwood", "Oakes", "Prewitt", "Quinlan", "Radford", "Sutter", "Talbot", "Underhill", "Vance", "Westbrook", "Yardley", "Ashby", "Barlow", "Crandall", "Dunmore", "Ellery", "Fenwick", "Gaines"];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const keyOf = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function makeRoster(r) {
  const used = new Set(), roster = [];
  const name = () => { for (;;) { const n = FIRST[Math.floor(r() * FIRST.length)] + " " + LAST[Math.floor(r() * LAST.length)]; if (!used.has(n)) { used.add(n); return n; } } };
  WEIGHTS.boys.forEach((w) => { roster.push({ wt: w, name: name() }); if (r() < 0.25) roster.push({ wt: w, name: name() }); });
  return roster;
}

// A believable match: takedowns put the scorer on top, escapes and reversals from the bottom.
function simBout(r, pH = 0.5) {
  const ev = []; let pos = "N", per = 1, t = 120000;
  const add = (k, s) => ev.push({ k, s, p: String(per), c: Math.max(0, Math.round(t)) });
  for (let step = 0; step < 14; step++) {
    t -= 8000 + r() * 22000;
    if (t <= 0) { if (per === 3) break; per++; t = 120000; pos = per === 2 ? (r() < 0.5 ? "h" : "a") : (r() < 0.5 ? "N" : "h"); ev.push({ k: "POS", s: pos, p: String(per), c: 120000 }); continue; }
    if (pos === "N") { const s = r() < pH ? "h" : "a"; add("TD", s); pos = s; }
    else { const top = pos, bot = other(top), x = r();
      if (x < 0.35) { add("E", bot); pos = "N"; }
      else if (x < 0.5) { add("R", bot); pos = bot; }
      else if (x < 0.75) { add(["NF2", "NF3", "NF4"][Math.floor(r() * 3)], top); }
      else if (x < 0.85) { add("STALL", bot); }
      else if (x < 0.93) return { ev, fall: top, time: 360000 - (3 - per) * 120000 - t };
    }
  }
  return { ev };
}

function simDual(r, id, date, hk, ak, rosters) {
  const H = TEST_TEAMS[hk], A = TEST_TEAMS[ak], ws = WEIGHTS.boys, lineup = {}, bouts = [], team = { h: 0, a: 0 };
  for (const w of ws) {
    const pick = (k) => { const at = rosters[k].filter((x) => x.wt === w); return at.length ? at[Math.floor(r() * at.length)].name : ""; };
    lineup[w] = { h: r() < 0.06 ? "" : pick(hk), a: r() < 0.08 ? "" : pick(ak) };
    const l = lineup[w];
    if (!l.h && !l.a) continue;
    if (!l.h || !l.a) { const w2 = l.h ? "h" : "a"; team[w2] += 6; bouts.push({ wt: w, w: w2, type: "FOR", tp: 6, score: "", time: "", hn: l.h, an: l.a, h: 0, a: 0, per: "1", ev: [] }); continue; }
    const sim = simBout(r, hk === "ozark-test" ? 0.66 : ak === "ozark-test" ? 0.34 : 0.5), d = derive(sim.ev);
    let w2, type;
    if (sim.fall) { w2 = sim.fall; type = "FALL"; }
    else if (d.h === d.a) { w2 = r() < 0.5 ? "h" : "a"; type = "DEC"; sim.ev.push({ k: "TD", s: w2, p: "SV", c: 30000 }); }
    else { w2 = d.h > d.a ? "h" : "a"; type = suggestResult(d.h, d.a) || "DEC"; }
    const f = derive(sim.ev), tp = RESULTS[type].tp; team[w2] += tp;
    bouts.push({ wt: w, w: w2, type, tp, score: ["DEC", "MD", "TF"].includes(type) ? `${Math.max(f.h, f.a)}-${Math.min(f.h, f.a)}` : "", time: type === "FALL" ? fmtElapsed(sim.time) : "", hn: l.h, an: l.a, h: f.h, a: f.a, per: "3", ev: sim.ev });
  }
  return { id, date, division: "boys", test: true, final: true, finalAt: Date.parse(date), home: H, away: A, weights: ws, lineup, team, bouts };
}

export async function loadTestData({ liveDual = false } = {}) {
  const r = rng(2026);
  const rosters = {}; for (const k of Object.keys(TEST_TEAMS)) rosters[k] = makeRoster(r);
  // teams
  const T = unpack(await read("wrestle-teams").catch(() => null)) || {};
  const teams = T.teams || {};
  for (const [k, t] of Object.entries(TEST_TEAMS)) teams[k] = { ...t, roster: rosters[k], test: true };
  await write("wrestle-teams", pack({ v: Date.now(), teams }));
  // three finished duals so records, stats and the opening card have data
  const games = [["test-d1", "2026-11-05", "ozark-test", "brightwater"], ["test-d2", "2026-11-10", "kestrel-valley", "ozark-test"], ["test-d3", "2026-11-12", "ironwood-prairie", "stonebrook"], ["test-d4", "2026-11-14", "ozark-test", "ironwood-prairie"]];
  const I = unpack(await read("wrestle-duals").catch(() => null)) || {};
  let list = (I.list || []).filter((d) => !String(d.id).startsWith("test-"));
  for (const [id, date, hk, ak] of games) {
    const d = simDual(r, id, date, hk, ak, rosters);
    await write("wrestle-dual-" + id, pack(d));
    list.push({ id, date, home: d.home.name, away: d.away.name, hs: d.team.h, as: d.team.a, n: d.bouts.length, test: true, final: true });
  }
  list.sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  await write("wrestle-duals", pack({ v: Date.now(), list }));
  // optional: put a fresh test dual on the mat
  if (liveDual) {
    const S = defaultState(), hk = "ozark-test", ak = "stonebrook";
    S.home = { ...TEST_TEAMS[hk] }; S.away = { ...TEST_TEAMS[ak] }; S.homeKey = hk; S.awayKey = ak;
    S.dualId = "test-live"; S.date = new Date().toLocaleDateString("en-CA"); S.v = Date.now();
    S.lineup = {}; S.weights.forEach((w) => { S.lineup[w] = { h: (rosters[hk].find((x) => x.wt === w) || {}).name || "", a: (rosters[ak].find((x) => x.wt === w) || {}).name || "" }; });
    S.m = blankMatch();
    await write(DOC, pack(S));
  }
  return { teams: Object.keys(TEST_TEAMS).length, duals: games.length };
}

export async function removeTestData() {
  const T = unpack(await read("wrestle-teams").catch(() => null)) || {};
  const teams = T.teams || {};
  for (const k of Object.keys(teams)) if (teams[k].test) delete teams[k];
  await write("wrestle-teams", pack({ v: Date.now(), teams }));
  const I = unpack(await read("wrestle-duals").catch(() => null)) || {};
  const gone = (I.list || []).filter((d) => String(d.id).startsWith("test-"));
  await write("wrestle-duals", pack({ v: Date.now(), list: (I.list || []).filter((d) => !String(d.id).startsWith("test-")) }));
  for (const d of gone) await write("wrestle-dual-" + d.id, pack({ removed: true })).catch(() => {});
  return gone.length;
}
