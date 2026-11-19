// Krazo Media → Production Truck graphics sync.
// The control panel writes one Firestore doc (pt/live). The overlay page listens
// to it and plays the requested graphic, then reports back on pt/status.
//
// Uses the Firebase SDK when it loads. If Production Truck's built-in web
// renderer can't run the SDK's live connection, it falls back to plain REST
// polling of the same doc, so it still works (with up to ~1 second of delay).

const CFG = {
  apiKey: "AIzaSyCz0pCY92VlNOWlKiCYlXc7Qd98QSTXaU8",
  authDomain: "krazo-media-app.firebaseapp.com",
  projectId: "krazo-media-app",
};
const REST = `https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents`;
const SDK = "https://www.gstatic.com/firebasejs/10.12.0";

let sdk = null;
async function loadSdk() {
  if (sdk !== null) return sdk;
  try {
    const appMod = await import(`${SDK}/firebase-app.js`);
    const fs = await import(`${SDK}/firebase-firestore.js`);
    const app = appMod.initializeApp(CFG, "pt-graphics");
    const db = fs.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    sdk = { fs, db };
  } catch (e) {
    console.warn("[pt] Firebase SDK unavailable, using REST polling", e);
    sdk = false;
  }
  return sdk;
}

// --- REST helpers (flat docs: strings, numbers, booleans, null) ---
function enc(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) fields[k] = { nullValue: null };
    else if (typeof v === "boolean") fields[k] = { booleanValue: v };
    else if (typeof v === "number") fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else fields[k] = { stringValue: String(v) };
  }
  return { fields };
}
function dec(doc) {
  const o = {};
  for (const [k, v] of Object.entries((doc && doc.fields) || {})) {
    if ("stringValue" in v) o[k] = v.stringValue;
    else if ("integerValue" in v) o[k] = Number(v.integerValue);
    else if ("doubleValue" in v) o[k] = v.doubleValue;
    else if ("booleanValue" in v) o[k] = v.booleanValue;
    else o[k] = null;
  }
  return o;
}
async function restGet(id) {
  const r = await fetch(`${REST}/pt/${id}?key=${CFG.apiKey}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("HTTP " + r.status);
  return dec(await r.json());
}
async function restSet(id, data) {
  const r = await fetch(`${REST}/pt/${id}?key=${CFG.apiKey}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(enc(data)),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
}

// Write a doc in the pt collection.
export async function write(id, data) {
  const s = await loadSdk();
  if (s) return s.fs.setDoc(s.fs.doc(s.db, "pt", id), data);
  return restSet(id, data);
}

// Listen to a doc in the pt collection. cb(data|null, via) on every change.
// onState('live'|'polling'|'error') reports the connection type.
// opts.backup: keep REST polling running even while the live link works. Production
// Truck's hidden output page can stall the live link without an error, so overlays
// use this; callers must ignore older versions (both paths can deliver).
export async function listen(id, cb, onState = () => {}, pollMs = 1000, opts = {}) {
  let gotSnap = false, polling = null, last = "";
  const startPolling = () => {
    if (polling) return;
    onState("polling");
    const tick = async () => {
      try {
        const d = await restGet(id);
        const key = JSON.stringify(d);
        if (key !== last) { last = key; cb(d, "poll"); }
        onState("polling");
      } catch (e) { onState("error"); }
    };
    tick();
    polling = setInterval(tick, pollMs);
  };
  const s = await loadSdk();
  if (s) {
    try {
      s.fs.onSnapshot(
        s.fs.doc(s.db, "pt", id),
        (snap) => { gotSnap = true; onState("live"); const d = snap.exists() ? snap.data() : null; const key = JSON.stringify(d); if (key !== last) { last = key; cb(d, "live"); } },
        (err) => { console.warn("[pt] snapshot error", err); startPolling(); }
      );
    } catch (e) { startPolling(); }
    // Watchdog: if the live connection never delivers, fall back to polling.
    setTimeout(() => { if (!gotSnap) startPolling(); }, 6000);
    if (opts.backup) setTimeout(() => {
      if (polling) return;
      const tick = async () => { try { const d = await restGet(id); const key = JSON.stringify(d); if (key !== last) { last = key; cb(d, "poll"); } } catch (e) {} };
      polling = setInterval(tick, pollMs);
    }, 1500);
  } else {
    startPolling();
  }
}

// One-time read of a doc in the pt collection (null if missing).
export async function read(id) {
  const s = await loadSdk();
  if (s) {
    try { const snap = await s.fs.getDoc(s.fs.doc(s.db, "pt", id)); return snap.exists() ? snap.data() : null; }
    catch (e) { console.warn("[pt] getDoc failed, trying REST", e); }
  }
  return restGet(id);
}
