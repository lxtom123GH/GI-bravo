# Coffee Roasting Tracker

A browser-based (PWA) tool for home coffee roasters. It listens to your roast
through the microphone to detect **first and second crack**, plots a live
**roast curve**, and keeps a journal of beans, roasts, metrics, tasting notes,
and photos — all stored locally in your browser with no backend.

🌐 Live app: https://gi-bravo.vercel.app

📖 New here? See the **[User Guide](USER_GUIDE.md)** for a simple step-by-step walkthrough.

Built for the **Behmor 2000AB Plus** and **KKTO** roasters, but the audio
analysis and logging work with any roaster. You can register **one roaster** (the
frictionless default — no picker) or **several** (yours, a friend's, a different
model) and each roast is tagged with the machine it was done on.

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
- 🎛️ **Roaster control panel** — a guided panel for your machine. **Behmor:** model-aware
  (2000AB Plus / 2000AB / 1600 Plus) showing each button's **before-roast vs during-roast**
  function (the manual's big gotcha). **KKTO:** a manual heat/airflow control guide + roast-phase
  flow. Both have a **live mode** that logs your changes onto the roast timeline.

**Beans, history & analysis**
- 🫘 **Bean pantry** with green-weight tracking, low-stock warnings, and
  per-roast weight deduction. Metric/imperial weights + a default batch size.
- 🌱 **Freshness & FIFO** — green-bean age with a "roast soon" flag for old lots and a
  "roast this first" nudge for the oldest in stock; each roast shows a resting/peak badge.
- ⚖️ **Weigh-out prep batches** — portion beans into containers with a photo, then load a
  batch (bean + weight + photo) onto Active Roast in one tap.
- 🧪 **Blend builder** — define a recipe (e.g. 60% Colombia · 40% Brazil), pre- or post-blend,
  then "weigh out" a batch into per-component prep batches.
- 🧮 **Batch planner** — "Plan roasts" suggests roast sizes that fit your drum and divide a bag
  evenly (2.5 kg → 6 × 417 g, no runt) and shows the leftover your usual size leaves. Drum
  capacity is per roaster profile (Behmor ≈ 100–454 g; editable for variants).
- 🔀 **Co-roast compatibility** — optional bean density/size; a pre-blend warns when beans differ
  too much to roast evenly together.
- ⚖️ **Yield** — log roasted (post-cool) weight to get weight-loss %.
- 📚 **Roast history** with timelines, logs, and tasting notes.
- 👅 **Tiered tasting & cupping** — emoji → SCA flavor wheel → **official
  SCA 100-point cupping** + brew log, depending on your chosen mode.
- 🔬 **Roast comparison** — overlay two roasts with a side-by-side metrics table.
- 📊 **Roast Trends** — track DTR / time / first crack / roast colour across
  batches over time.
- 📸 **Roast photos** with optional colour correction — **reference-card white
  balance**, a **multi-patch ColorChecker** fit, or a self-calibrated **DIY
  custom target** — producing a lighting-normalized **roast-colour index**.
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
  roast.js          Roast setup (bean selection, Behmor/KKTO controls, weight units)
  roasters.js       Roaster profiles (single/multi machine, per-roast machine tag)
  roaster-panel.js  Roaster control panel — Behmor button guide + KKTO heat/airflow guide
  audio.js          Mic capture, crack detection, roast curve, RoR, alarms, reference follow, probe
  pantry.js         Bean inventory (CRUD, quantities, restock, green age/FIFO)
  prep.js           Weigh-out prep batches (bean + weight + photo)
  blends.js         Blend recipes → per-component weigh-out prep batches
  planner.js        Batch planner — roast sizes that fit the drum + divide a bag (pure)
  freshness.js      Green-bean age + roasted rest/peak + FIFO helpers (pure)
  history.js        Roast history, comparison, trends, tasting/cupping, photos, exports
  storage.js        localStorage persistence + JSON backup/restore + settings
  chart.js          Canvas renderers (roast curve, dual energy+temp, multi-curve compare, trends)
  metrics.js        DTR, RoR, weight-loss, weight units, time formatting
  flavors.js        SCA flavor-wheel data
  photos.js         IndexedDB photo storage + reference-card white balance
  colorcheck.js     N-patch colour-correction matrix (ColorChecker or DIY target)
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

Three photo colour-correction options normalize lighting so roast darkness is
comparable across batches:

- **Reference-card white balance** — quickest; use a **neutral grey/white-balance
  card** (a dedicated WhiBal/Calibrite card is ideal). A bright-white paint chip
  can clip and may contain optical brighteners.
- **ColorChecker (24-patch)** — more accurate; tap the 4 corner patches to fit a
  full colour-correction matrix.
- **Custom target (DIY multi-patch)** — a cheap home-made swatch card (e.g. 4–6
  paint chips on card). Calibrate it once under good daylight (the app stores each
  patch's measured colour as the baseline), then re-shoot it with your beans under
  any light to fit the same full matrix. A neutral grey ramp is most reliable; add
  a warm and a cool chip for better colour.

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
