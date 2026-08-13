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
