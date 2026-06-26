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
- 🌡️ **Rate of Rise (RoR)** — log bean temps (°C/°F) by hand, **or stream them
  automatically from a DIY Bluetooth thermocouple** (see `HARDWARE_GUIDE.md`);
  the live curve overlays a temperature line.
- 🔥 **Environment temperature (ET) logging** (Expert).
- 🎚️ **Tunable detection** — sensitivity, cluster size, and second-crack pitch.
- 📋 **Reference-roast follow mode** — overlay a past roast's curve live with a
  heads-up ~10 s before its cracks, to reproduce a good batch.
- ☕ **Behmor profile templates** — save a roast as the template for a
  profile + weight; it auto-loads when you pick that profile. Plus **manual
  power profiles** (P1–P5 = 0/25/50/75/100%) that replay timed power cues.
- 🔔 Audio + desktop notifications on crack detection.

**Beans, history & analysis**
- 🫘 **Bean pantry** with green-weight tracking, low-stock warnings, and
  per-roast weight deduction. Metric/imperial weights + a default batch size.
- ⚖️ **Yield** — log roasted (post-cool) weight to get weight-loss %.
- 📚 **Roast history** with timelines, logs, and tasting notes.
- 👅 **Tiered tasting & cupping** — emoji → SCA flavor wheel → **official
  SCA 100-point cupping** + brew log, depending on your chosen mode.
- 🔬 **Roast comparison** — overlay two roasts with a side-by-side metrics table.
- 📊 **Roast Trends** — track DTR / time / first crack / roast colour across
  batches over time.
- 📸 **Roast photos** with optional colour correction — **reference-card white
  balance** or a **multi-patch ColorChecker** fit — producing a
  lighting-normalized **roast-colour index**.
- 📤 **Export** — per-roast CSV (time, energy, temp, RoR, ET, power, events) and
  a clipboard summary.
- 💾 **JSON backup/restore** of all beans, roasts, and settings (photos optional).

**Platform**
- 📱 **Installable PWA**, works **offline** after first load.
- 🌗 Dark UI, responsive layout with a mobile drawer.
- 🎚️ **Complexity tiers** (Easy / Moderate / Expert) to match your level — see below.

---

## Complexity tiers

A **Mode** selector in the sidebar tailors how much detail the UI shows:

- **Easy** — basics only (bean, time, simple emoji impression).
- **Moderate** — flavor wheel, crack times, DTR, reference-follow, detection settings.
- **Expert** — adds roast targets, temperature/RoR + ET logging, Bluetooth probe,
  SCA 100-point cupping scores and full brew parameters.

Tiers cascade: a global default, optional **per-feature** overrides (Dashboard,
Tasting), and a one-off override on the cupping modal.

---

## Getting started (development)

Requires Node.js and npm.

```bash
npm install      # install dependencies
npm run dev      # start the Vite dev server (http://localhost:5173)
npm run build    # production build into dist/
npm run preview  # preview the production build
```

> **Microphone, Bluetooth & install note:** browsers only allow microphone
> access, Web Bluetooth, and service-worker registration over **HTTPS** (or
> `http://localhost`). The dev server and the deployed site both satisfy this;
> opening `index.html` from the filesystem will not. Web Bluetooth needs
> Chrome/Edge.

---

## Project structure

```
index.html          App shell and UI markup
main.js             Entry point — initializes all modules, registers the service worker
style.css           Dark theme + responsive/tier styles
js/
  ui.js             Tabs, mobile drawer, complexity-tier toggles
  roast.js          Roast setup (roaster/bean selection, Behmor/KKTO controls, weight units)
  audio.js          Mic capture, crack detection, roast curve, RoR, alarms, reference follow, probe
  pantry.js         Bean inventory (CRUD, quantities, restock)
  history.js        Roast history, comparison, trends, tasting/cupping, photos, exports
  storage.js        localStorage persistence + JSON backup/restore + settings
  chart.js          Canvas renderers (roast curve, dual energy+temp, multi-curve compare, trends)
  metrics.js        DTR, RoR, weight-loss, weight units, time formatting
  flavors.js        SCA flavor-wheel data
  photos.js         IndexedDB photo storage + reference-card white balance
  colorcheck.js     Multi-patch ColorChecker colour-correction matrix
  bluetooth.js      Web Bluetooth connection to a DIY temperature probe
public/             PWA manifest, icons, service worker (copied to dist/ on build)
HARDWARE_GUIDE.md   DIY Bluetooth thermocouple build (ESP32 + MAX31855) + firmware
FUTURE_FEATURES.md  Roadmap and backlog
```

---

## Data & privacy

Everything is stored **locally in your browser** — there is no server or account.

- Beans, roasts, settings, templates → `localStorage`.
- Photos → `IndexedDB` (kept out of localStorage for size).
- Use **Roast History → Data Backup** to export/import a JSON file of beans,
  roasts, and settings (with an optional "include photos" checkbox) — e.g. to
  move between devices or guard against clearing browser data.

---

## Roast-colour measurement

Two photo colour-correction options normalize lighting so roast darkness is
comparable across batches:

- **Reference-card white balance** — quickest; use a **neutral grey/white-balance
  card** (a dedicated WhiBal/Calibrite card is ideal). A bright-white paint chip
  can clip and may contain optical brighteners.
- **ColorChecker (24-patch)** — more accurate; tap the 4 corner patches to fit a
  full colour-correction matrix.

Either way the result is a **relative** roast-colour index, not an official
Agtron score (which needs an NIR colorimeter and ceramic tiles).

---

## Known limitations

- **Crack-detection thresholds** are reasoned defaults, not lab-calibrated;
  tune them (and the second-crack pitch) to your mic/room.
- **Automatic RoR** needs a DIY Bluetooth thermocouple (Chrome/Edge); without
  one, RoR is as frequent as your manual temperature readings.
- **Colour correction** is fit in gamma-encoded sRGB — a relative roast-colour
  index, not full linear-light colorimetry.

See [FUTURE_FEATURES.md](FUTURE_FEATURES.md) for the roadmap and remaining backlog.

---

## Contributing / workflow

`main` is the single source of truth and the default branch (it deploys to the
live site). Branch from `main`, open a pull request **into `main`**, and delete
the branch after merge. Avoid maintaining a second long-lived trunk, and point
any external automation at `main`.

## License

ISC (see `package.json`).
