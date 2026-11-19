# Krazo Media App

Production management hub for the Krazo Media student broadcast team: live-stream
crew sign-ups, a content pipeline board, a season calendar, an admin schedule
manager, and a student roster — all synced live through Firebase so every device
sees the same data.

---

## 1. Create your Firebase project

1. Go to https://console.firebase.google.com and click **Add project**.
2. Name it (e.g. "krazo-media"), skip Google Analytics (not needed), click **Create project**.
3. In the left sidebar, click **Build → Firestore Database → Create database**.
   - Choose **Start in production mode**.
   - Pick a region close to you (e.g. `us-central`) and click **Enable**.
4. Once it's created, click the **Rules** tab and replace the contents with what's
   in `firestore.rules` in this project, then click **Publish**.
   - Heads up: those rules are intentionally open (no Firebase Auth is wired up —
     the app uses its own simple passcode screen instead). That's fine for a
     small team tool but isn't hardened security. See the note at the bottom of
     this file if you want to lock it down further later.
5. Back in the project overview, click the **web icon (`</>`)** to register a web app.
   Name it anything, skip Firebase Hosting setup here (we'll do that separately if
   you use it), click **Register app**.
6. You'll see a `firebaseConfig` object. Copy those values into `src/firebase.js`
   in this project, replacing the `PASTE_YOUR_...` placeholders.

## 2. Install and run locally

You'll need [Node.js](https://nodejs.org) installed (18+).

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). The first time it loads,
it automatically seeds Firestore with the starting schedule, job board, and links —
after that, every device that opens the app reads and writes the same shared data.

Default access codes (change these immediately from the Admin panel → Security tab
once you're live):
- Student: `TIGERS2026`
- Admin: `KRAZOADMIN`

## 3. Deploy so students can actually reach it

Two good options — pick one:

### Option A: Vercel (simplest)
1. Push this project to a GitHub repo.
2. Go to https://vercel.com, sign in, click **Add New → Project**, import the repo.
3. Vercel auto-detects Vite — just click **Deploy**.
4. You'll get a URL like `krazo-media.vercel.app`. Share that with your crew.

### Option B: Firebase Hosting (keeps everything in one place)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# When asked for the public directory, enter: dist
# Configure as a single-page app: Yes
# Set up automatic builds with GitHub: optional, your call

npm run build
firebase deploy
```
Firebase will give you a URL like `krazo-media.web.app`.

Either way — once deployed, that URL is the one you hand out (QR code on the call
sheet, bookmark on shared cameras, wherever makes sense).

## 4. What's already wired to Firebase vs. what's still local

Synced live across every device: the schedule (streams), crew sign-ups, job board,
links, student roster, access codes, and reminder settings.

Still local to each browser/device (not synced): which access level you're currently
logged in as (student/admin), which tab you're on, whether a card is expanded. That's
intentional — those are per-person UI state, not shared data.

## 5. Reminders — what's real vs. preview

The Admin → Reminders tab shows a live preview of which events would trigger a
reminder and how many emails are on file, but it doesn't send anything yet. Actual
sending needs a small **Firebase Cloud Function** on a schedule (Cloud Scheduler)
that checks upcoming events and calls an email service (e.g. Resend, SendGrid, or
the Firebase "Trigger Email" extension). That's a natural next step once this is
deployed and the data model is proven out — happy to build that next.

## 6. Tightening security later (optional, worth doing eventually)

Right now anyone with your Firebase config (visible in the deployed site's JS) can
technically read/write Firestore directly, bypassing the in-app passcode. For a
school crew tool this is a reasonable tradeoff for simplicity, but if you want it
hardened: add Firebase Anonymous Auth on load, store an `isAdmin` custom claim or a
separate `admins` collection, and update `firestore.rules` to check `request.auth`
instead of `if true`. Ask if you want help with that later.

---

## Production Truck graphics (wrestling)

Two static pages in `public/pt/` let you push broadcast graphics into Hudl Production Truck with one click.

- **Control panel:** `https://krazomedia.com/pt/control.html` (laptop, Chromebook, phone or tablet)
- **Overlay:** `https://krazomedia.com/pt/overlay.html`. Add it in Production Truck as an HTML/web graphic at 1920×1080 and leave it on.

Clicking a button writes the `pt/live` doc in Firestore. The overlay listens to it, plays that graphic and reports back on `pt/status`, which turns the control panel's **Overlay** light green and shows "✓ Overlay received it."

- If Production Truck's built-in web renderer can't hold the Firebase live connection, the overlay falls back to polling Firestore once a second. That's up to about 3,600 reads an hour, well within the free tier for a normal event.
- `overlay.html?test=ref-near-fall&bg=1` plays one clip locally for previewing. Add `&debug=1` to show the connection state.
- Each graphic is defined in `overlay.html` (the `CL` object). Buttons are listed in `control.html` (`GROUPS`).

## Press Row relay for Production Truck

Production Truck's built-in browser is an older Safari engine (it has no BroadcastChannel, for one). `api/pressrow.js` loads a Press Row overlay page on the server, sends its data calls through krazomedia.com (the `/prx` rewrites in `vercel.json`), and adds compatibility fixes.

In PT's HTML Embed, use:

    https://krazomedia.com/api/pressrow?u=<your Press Row overlay URL>

Add `&debug=1` to show a status box with stream activity and any errors the page throws.

Placement options (add to the address, measured in 1920×1080 pixels):

| Option | What it does | Example |
|---|---|---|
| `sb` | Scoreboard corner: `top`, `top-left`, `top-right`, `bottom`, `bottom-left`, `bottom-right` | `&sb=bottom-left` |
| `sbx`, `sby` | Nudge the scoreboard (+ is right/down) | `&sby=20` |
| `sbscale` | Resize the scoreboard | `&sbscale=0.85` |
| `cardx`, `cardy` | Nudge stat cards | `&cardy=200` |
| `cardscale` | Resize stat cards | `&cardscale=0.8` |

## Wrestling Press Row (our own scorer + PT overlay)

- **Scorer (tablet/laptop at the table):** `/pt/wrestle/score.html`: Match / Lineup / Teams tabs. Buttons follow position (neutral → takedown; top → near falls and pin; bottom → escape and reversal). Every tap is logged as an event, and score, position and penalty counts are rebuilt from the log.
- **Stats:** `/pt/wrestle/stats.html`: season totals per wrestler, dual box scores, CSV export
- Saved data: `pt/wrestle-teams` (rosters), `pt/wrestle-duals` (index), `pt/wrestle-dual-<id>` (each dual with full event logs)
- **PT overlay (HTML Embed, fullscreen):** `/pt/wrestle/overlay.html`
  - `?pos=bl|br|tl|tr` puts the scorebug in a corner (default bottom-left)
  - `?demo=1` shows sample data, `?bg=1` adds a green test background, `?debug=1` shows a status box
- Syncs through Firestore doc `pt/wrestle`. The overlay writes a heartbeat to `pt/wrestle-status` (that drives the scorer's "Overlay online" pill).
- The overlay follows the PT-safe rules: no CSS animation, filters, shadows, rounded corners or partial opacity; script-driven slides only.
