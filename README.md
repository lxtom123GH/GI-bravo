# Coffee Roasting Tracker

A browser-based (PWA) tool for home coffee roasters. It listens to your roast
through the microphone to detect **first and second crack**, plots a live
**roast curve**, and keeps a journal of beans, roasts, metrics, tasting notes,
and photos — all stored locally in your browser with no backend.

🌐 Live app: https://gi-bravo.vercel.app

Built for the **Behmor 2000AB Plus** and **KKTO** roasters, but the audio
analysis and logging work with any roaster.

---

## Features

**Roasting**
- 🎤 **Audio crack detection** — Web Audio API with a high-pass filter and
  transient-clustering; classifies first vs second crack by frequency
  (first crack is louder/lower-pitched, second is quieter/higher-pitched).
- 📈 **Live roast curve** — audio energy over time with crack markers.
- ⏱️ **Metrics** — total time, time to first crack, **Development Time Ratio
  (DTR)**, and a live readout while roasting.
- 🎯 **Target alarms** — beep + notification at a chosen total time or DTR.
- 🌡️ **Manual temperature → Rate of Rise (RoR)** — tap in bean temps (°C/°F)
  to derive an approximate RoR without a probe.
- 🎚️ **Tunable detection** — sensitivity, cluster size, and second-crack pitch.
- 📋 **Reference-roast follow mode** — overlay a past roast's curve live and
  get a heads-up ~10 s before its cracks, to reproduce a good batch.
- 🔔 Audio + desktop notifications on crack detection.

**Beans, history & analysis**
- 🫘 **Bean pantry** with green-weight tracking, low-stock warnings, and
  per-roast weight deduction.
- ⚖️ **Yield** — log roasted (post-cool) weight to get weight-loss %.
- 📚 **Roast history** with timelines, logs, and tasting notes.
- 👅 **Tiered tasting & cupping** — emoji → SCA flavor wheel → simplified
  SCA-style cupping scores + brew log, depending on your chosen mode.
- 🔬 **Roast comparison** — overlay two roasts with a side-by-side metrics table.
- 📊 **Roast Trends** — track DTR / time / first crack / roast colour across
  batches over time.
- 📸 **Roast photos** with optional **reference-card white balance** that
  produces a lighting-normalized **roast-colour index**.
- 📤 **Export** — per-roast CSV (for spreadsheets/Artisan-style analysis) and
  a clipboard summary.
- 💾 **JSON backup/restore** of all beans, roasts, and settings.

**Platform**
- 📱 **Installable PWA**, works **offline** after first load.
- 🌗 Dark UI, responsive layout with a mobile drawer.
- 🎚️ **Complexity tiers** (Easy / Moderate / Expert) to match your level — see below.

---

## Complexity tiers

A **Mode** selector in the sidebar tailors how much detail the UI shows:

- **Easy** — basics only (bean, time, simple emoji impression).
- **Moderate** — flavor wheel, crack times, DTR, reference-follow, detection settings.
- **Expert** — adds roast targets, temperature/RoR logging, SCA-style cupping
  scores and full brew parameters.

The cupping modal also has a one-off detail-level override for a single entry.

---

## Getting started (development)

Requires Node.js and npm.

```bash
npm install      # install dependencies
npm run dev      # start the Vite dev server (http://localhost:5173)
npm run build    # production build into dist/
npm run preview  # preview the production build
```

> **Microphone & install note:** browsers only allow microphone access and
> service-worker registration over **HTTPS** (or `http://localhost`). The dev
> server and the deployed site both satisfy this; opening `index.html` from the
> filesystem will not.

---

## Project structure

```
index.html          App shell and UI markup
main.js             Entry point — initializes all modules, registers the service worker
style.css           Dark theme + responsive/tier styles
js/
  ui.js             Tabs, mobile drawer, complexity-tier toggle
  roast.js          Roast setup (roaster/bean selection, Behmor/KKTO controls)
  audio.js          Mic capture, crack detection, roast curve, RoR, alarms, reference follow
  pantry.js         Bean inventory (CRUD, quantities, restock)
  history.js        Roast history, comparison, trends, tasting/cupping, photos, exports
  storage.js        localStorage persistence + JSON backup/restore + settings
  chart.js          Canvas renderers (roast curve, multi-curve compare, trends)
  metrics.js        DTR, RoR, weight-loss, time formatting
  flavors.js        SCA flavor-wheel data
  photos.js         IndexedDB photo storage + reference-card white balance
public/             PWA manifest, icons, service worker (copied to dist/ on build)
FUTURE_FEATURES.md  Roadmap and backlog
```

---

## Data & privacy

Everything is stored **locally in your browser** — there is no server or account.

- Beans, roasts, settings → `localStorage`.
- Photos → `IndexedDB` (kept out of localStorage for size; **not** included in
  the JSON backup).
- Use **Roast History → Data Backup** to export/import a JSON file of beans,
  roasts, and settings (e.g. to move between devices or guard against clearing
  browser data).

---

## Roast-colour reference cards

The colour-corrected photo feature white-balances a bean photo against a
reference card so roast darkness is comparable across lighting. For best
results use a **neutral grey/white-balance card** (a dedicated WhiBal/Calibrite
card is ideal); a bright-white paint chip can clip and may contain optical
brighteners. The result is a **relative** roast-colour index, not an official
Agtron score (which needs an NIR colorimeter and ceramic tiles).

---

## Known limitations

- **Crack-detection thresholds** are reasoned defaults, not lab-calibrated;
  tune them (and the second-crack pitch) to your mic/room.
- **RoR is manual** — only as frequent as your temperature readings. Automatic
  high-resolution RoR (via a Web Serial/Bluetooth thermocouple) is on the roadmap.
- **Cupping total** is a simplified SCA-style sum (/80), not the official
  100-point protocol.

See [FUTURE_FEATURES.md](FUTURE_FEATURES.md) for the full roadmap and backlog.

---

## Contributing / workflow

`main` is the single source of truth and the default branch (it deploys to the
live site). Branch from `main`, open a pull request **into `main`**, and delete
the branch after merge. Avoid maintaining a second long-lived trunk, and point
any external automation at `main`.

## License

ISC (see `package.json`).
