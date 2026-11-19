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

export function blankMatch(periodId = "1") {
  return {
    h: 0, a: 0,
    period: periodId,
    clockMs: periodById(periodId).ms,
    running: false,
    at: 0,
    elapsedBefore: 0, // regulation time used in earlier periods (for fall times)
    pen: { h: { stall: 0, pen: 0, caut: 0 }, a: { stall: 0, pen: 0, caut: 0 } },
  };
}

export function defaultState() {
  const weights = WEIGHTS.boys;
  const lineup = {};
  weights.forEach((w) => (lineup[w] = { h: "", a: "" }));
  return {
    v: 0,
    home: { name: "Ozark", short: "OZK", color: "#E31B23" },
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

export const pack = (s) => ({ json: JSON.stringify(s), v: s.v });
export const unpack = (d) => {
  if (!d || !d.json) return null;
  try { return JSON.parse(d.json); } catch { return null; }
};

export const other = (side) => (side === "h" ? "a" : "h");
export const bandHex = (c) => (c === "green" ? "#16A34A" : c === "red" ? "#DC2626" : c);
