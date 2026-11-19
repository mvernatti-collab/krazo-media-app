// Krazo Wrestling — shared state + rules for the scorer and the overlay.
// State lives in one Firestore doc (pt/wrestle) as a JSON string, so the
// REST fallback in pt-sync.js can carry it too.

export const DOC = "wrestle";

export const WEIGHTS = {
  boys: ["106", "113", "120", "126", "132", "138", "144", "150", "157", "165", "175", "190", "215", "285"],
  girls: ["100", "105", "110", "115", "120", "125", "130", "135", "140", "145", "155", "170", "190", "235"],
};

// Periods: regulation 2:00 each; overtime per NFHS.
export const PERIODS = [
  { id: "1", label: "P1", ms: 120000 },
  { id: "2", label: "P2", ms: 120000 },
  { id: "3", label: "P3", ms: 120000 },
  { id: "SV", label: "SV", ms: 60000 },
  { id: "TB1", label: "TB1", ms: 30000 },
  { id: "TB2", label: "TB2", ms: 30000 },
  { id: "UTB", label: "UTB", ms: 30000 },
];
export const periodById = (id) => PERIODS.find((p) => p.id === id) || PERIODS[0];

// Dual team points by result type.
export const RESULTS = {
  DEC: { label: "Decision", tp: 3 },
  MD: { label: "Major Decision", tp: 4 },
  TF: { label: "Technical Fall", tp: 5 },
  FALL: { label: "Fall", tp: 6 },
  FOR: { label: "Forfeit", tp: 6 },
  DEF: { label: "Default", tp: 6 },
  DQ: { label: "Disqualification", tp: 6 },
};

export function suggestResult(h, a) {
  const d = Math.abs(h - a);
  if (d >= 15) return "TF";
  if (d >= 8) return "MD";
  if (d >= 1) return "DEC";
  return null;
}

export function blankMatch(periodId="1"){ return { h:0,a:0, period:periodId, clockMs:periodById(periodId).ms, running:false, at:0, elapsedBefore:0, pos:"N", ev:[], pen:{h:{stall:0,pen:0,caut:0},a:{stall:0,pen:0,caut:0}} }; }

export function defaultState() {
  const weights = WEIGHTS.boys;
  const lineup = {};
  weights.forEach((w) => (lineup[w] = { h: "", a: "" }));
  return {
    v: 0,
    home: { name: "Ozark", short: "OZK", color: "#ED1C24" },
    away: { name: "Opponent", short: "OPP", color: "#1F4FA0" },
    bands: { h: "green", a: "red" }, // ankle band colors (home usually green)
    division: "boys",
    weights,
    lineup,
    idx: 0,
    team: { h: 0, a: 0 },
    bouts: [], // {wt, w:'h'|'a', type, tp, score, time, hn, an}
    m: blankMatch(),
    pop: { n: 0 },
    res: { n: 0 },
    show: { bug: true, dual: false, next: false },
  };
}

// Remaining clock in ms, computed from wall-clock time.
export function remaining(m, now = Date.now()) {
  if (!m.running) return Math.max(0, m.clockMs);
  return Math.max(0, m.clockMs - Math.max(0, now - m.at));
}

export function fmtClock(ms) {
  const t = Math.ceil(ms / 100) / 10; // tenths
  if (t < 10 && ms > 0) return t.toFixed(1);
  const s = Math.ceil(ms / 1000);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

// Total match time used so far (regulation periods only count toward fall times).
export function matchElapsed(m, now = Date.now()) {
  const p = periodById(m.period);
  return m.elapsedBefore + (p.ms - remaining(m, now));
}

export function fmtElapsed(ms) {
  const s = Math.round(ms / 1000);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export const pack = (s) => ({ json: JSON.stringify(s), v: s.v, sent: Date.now() });
export const unpack = (d) => {
  if (!d || !d.json) return null;
  try { return JSON.parse(d.json); } catch { return null; }
};

export const other = (side) => (side === "h" ? "a" : "h");
export const BANDS = { green: "#16A34A", red: "#DC2626", blue: "#1D4ED8", yellow: "#EAB308", orange: "#EA580C", purple: "#7C3AED", black: "#111111", white: "#F5F5F5" };
export const bandHex = (c) => BANDS[c] || c || "#666";
export const bandName = (c) => (BANDS[c] ? c : "team color");

// Clock-skew correction: each write carries the writer's clock (sent). The lowest
// (receiver now - sent) seen recently is the clock offset plus the fastest delivery,
// so subtracting it lines the receiver's clock up with the scorer's.
export function makeSkew() {
  let best = null, at = 0;
  return {
    see(sent) {
      if (!sent) return;
      const off = Date.now() - sent, t = Date.now();
      if (Math.abs(off) > 120000) return; // an old doc read at load time, not a live delivery
      if (best === null || off < best || t - at > 60000) { best = off; at = t; }
    },
    now() { return Date.now() - (best === null ? 0 : best); },
  };
}

// ---- Event model (Track-style) ----
// Each tap is an event {k, s, p, c}: k = kind, s = side (scorer, or offender for
// penalties, or the new position for POS), p = period id, c = clock remaining (ms).
// Score, position and penalty counts are always rebuilt from the event list,
// so deleting any event fixes everything after it.
export const EV = {
  TD: { l: "Takedown", p: 3 }, E: { l: "Escape", p: 1 }, R: { l: "Reversal", p: 2 },
  NF2: { l: "Near fall", p: 2 }, NF3: { l: "Near fall", p: 3 }, NF4: { l: "Near fall", p: 4 },
  STALL: { l: "Stalling" }, PEN: { l: "Penalty" }, CAUT: { l: "Caution" }, ADJ: { l: "Point adjust" }, POS: { l: "Position" },
};
export const SCORING = ["TD", "E", "R", "NF2", "NF3", "NF4"];
export function derive(ev = []) {
  const sc = { h: 0, a: 0 }, pen = { h: { stall: 0, pen: 0, caut: 0 }, a: { stall: 0, pen: 0, caut: 0 } };
  let pos = "N", dq = null;
  const list = ev.map((e) => {
    const o = { ...e, pts: 0, to: e.s, txt: "" };
    if (EV[e.k] && EV[e.k].p) {
      o.pts = EV[e.k].p; sc[e.s] += o.pts;
      o.txt = EV[e.k].l + " +" + o.pts;
      if (e.k === "TD" || e.k === "R") pos = e.s;
      else if (e.k === "E") pos = "N";
      else pos = e.s; // near fall: scorer is on top
    } else if (e.k === "STALL") {
      const c = ++pen[e.s].stall, opp = other(e.s);
      if (c === 1) o.txt = "Stalling warning";
      else if (c <= 4) { o.pts = [0, 1, 1, 2][c - 1]; o.to = opp; sc[opp] += o.pts; o.txt = "Stalling +" + o.pts; }
      else { o.txt = "Stalling DQ"; dq = e.s; }
    } else if (e.k === "PEN") {
      const c = ++pen[e.s].pen, opp = other(e.s);
      if (c <= 3) { o.pts = [1, 1, 2][c - 1]; o.to = opp; sc[opp] += o.pts; o.txt = "Penalty +" + o.pts; }
      else { o.txt = "Penalty DQ"; dq = e.s; }
    } else if (e.k === "CAUT") {
      const c = ++pen[e.s].caut, opp = other(e.s);
      if (c <= 2) o.txt = "Caution " + c;
      else { o.pts = 1; o.to = opp; sc[opp] += 1; o.txt = "Caution +1"; }
    } else if (e.k === "ADJ") {
      o.pts = e.n || 0; sc[e.s] = Math.max(0, sc[e.s] + o.pts); o.txt = "Adjust " + (o.pts > 0 ? "+" : "") + o.pts;
    } else if (e.k === "POS") {
      pos = e.s; o.txt = e.s === "N" ? "Neutral" : "top";
    }
    o.h = sc.h; o.a = sc.a;
    return o;
  });
  return { h: sc.h, a: sc.a, pos, pen, dq, list };
}
