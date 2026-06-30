# Coffee Roasting Tracker

A browser-based (PWA) tool for home coffee roasters. It listens to your roast
through the microphone to detect **first and second crack**, plots a live
**roast curve**, and keeps a journal of beans, roasts, metrics, tasting notes,
and photos — **local-first** (everything works in your browser with no account), with an
**optional** cloud sign-in to back up and sync across devices and share with a household.

🌐 Live app: https://gi-bravo.vercel.app

📖 New here? See the **[User Guide](USER_GUIDE.md)** for a simple step-by-step walkthrough.

📍 **What's built / live / next?** See **[STATUS.md](STATUS.md)** — the single source of truth for project status.

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
- 🎚️ **Tunable detection** — sensitivity, cluster size, and second-crack pitch,
  plus an opt-in **auto-tune** that learns each roaster's sensitivity from your
  false-alarm and missed-crack corrections.
- 🧪 **Roast Lab** (experimental, opt-in, off by default) — capture each roast's
  feature timeline (loudness, crack pitch, MFCC fingerprint) plus crack/clear events,
  then **export JSON/CSV** (or copy a summary) to compare roasts and tune detection.
  Observational — it never changes crack detection. While it's on, a **🫥 shadow
  detector bank** (`js/shadow.js`) runs several differently-tuned crack detectors in
  parallel and logs what each *would* have called — strictly log-only, so you can
  compare them against the real detector offline without ever trusting an unproven one.
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
  per-roast weight deduction. Adding a bean floors at **name + grams**; origin, process,
  cost, density, size and supplier fold behind **＋ Add detail**. Metric/imperial weights
  + a default batch size.
- ⚡ **Low-friction repeat entry** — if you buy from just a few places, you barely type:
  supplier/country/region/farm **autocomplete from your own past entries** (+ a seed list of
  origins/processes), and they **cascade** — pick a supplier and the countries you buy from it
  float to the top (auto-filled if there's only one); pick a country and its usual region/process
  follow. Typing or pasting a structured name like *"Ethiopia Yirgacheffe Washed"* **auto-fills**
  country, region and process.
- 📦 **Green lots** — track separate dated/priced purchases of one bean: on-hand grams is
  the sum of its lots, cost is the grams-weighted average, and a **FEFO "use first"** order
  (soonest best-before, else oldest) decides which lot a roast draws from.
- 🔖 **Source book** — record each bean's supplier + **re-order link**, and see a **price
  history & trend** (up/down vs your first purchase) built from your priced lots.
- ☕ **Roasted stock** — a deliberately simple list of coffee you've roasted and still have:
  grams left + how long it's been resting, oldest first, drawn down as you brew it.
- 📷 **Quick-add from receipt** — snap a receipt and add several beans at once (name, weight,
  price); each lands in the pantry with the purchase date, and the photo is kept with the purchase.
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
- 💲 **Tastiness-per-dollar leaderboard** — ranks your roasts by cup quality per dollar (tasting
  score ÷ cost per cup), so a cheap-but-tasty bean can beat a pricey one.
- 📚 **Roast history** with timelines, logs, and tasting notes.
- 👅 **Tiered tasting & cupping** — emoji → SCA flavor wheel → **official
  SCA 100-point cupping** + brew log, depending on your chosen mode.
- 📈 **Tasting over time** — record dated tastings per roast to see how a coffee changes as it
  rests and ages.
- 🔬 **Roast comparison** — overlay two roasts with a side-by-side metrics table.
- 📊 **Roast Trends** — track DTR / time / first crack / roast colour across
  batches over time.
- 📸 **Roast photos** with optional colour correction — **reference-card white
  balance**, a **multi-patch ColorChecker** fit, or a self-calibrated **DIY
  custom target** — producing a lighting-normalized **roast-colour index**.
- 📤 **Export** — per-roast CSV (time, energy, temp, RoR, ET, power, events) and
  a clipboard summary.
- 💾 **JSON backup/restore** of all beans, roasts, and settings (photos optional).
- ☁️ **Optional cloud sync & sharing** (live) — opt-in sign-in (email / Google) to back up and
  sync, with a **shared pantry, roasts, blends and roaster profiles** you can share by email (a
  collective "roastery"); personal calibration stays per-device. Local-first and fully usable
  signed-out. Tap **☁️ Sign in to back up** at the bottom of the sidebar. Runs on the shared
  Firebase hub `lx-apps` (free Spark tier); see `GO_LIVE_CHECKLIST.md` / `PORTFOLIO_AUTH_SYNC.md`.

**Platform**
- 📱 **Installable PWA**, works **offline** after first load.
- 🌗 Dark UI, responsive layout with a mobile drawer.
- 🎚️ **Complexity tiers** (Easy / Moderate / Expert) to match your level — see below.
- 👆 **Swipe-style personalisation** — swipe each optional control to keep or hide it; a friendly,
  revisitable way to tailor the Active Roast screen (shares state with "Customise this screen").

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

## Design system

The UI runs on a **two-layer plain-CSS token system** (the "Ember" visual
refresh): a portable layer (`tokens.portable.css` + `components.css`) that's
app-agnostic, and a theme layer (`theme.coffee.css`) that sets the warm-dark
colour roles, the three self-hosted brand fonts (Hanken Grotesk, Spline Sans
Mono, Figtree), and the roast-phase tints. Components reference only semantic
tokens (`--color-*`, `--font-*`), so swapping the theme file re-skins the whole
app — `theme.golf.css` is a working proof of that seam. Colours meet WCAG-AA and
selection states never rely on colour alone.

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
style.css           App skin — maps GI-bravo's DOM onto the token system (imports the layers below)
tokens.portable.css Portable design tokens (spacing, radius, type ramp, motion) — app-agnostic
theme.coffee.css    Coffee theme — warm-dark "Ember" colour roles + brand fonts + roast-phase tints
theme.golf.css      Proof the theme seam works — swap-in skin for the sibling golf app
components.css      Portable component classes (.btn/.chip/.card/.field/.meter…) for new UI
js/
  ui.js             Tabs, mobile drawer, complexity-tier toggles
  customise.js      Hide/show optional dashboard controls (shared state)
  beanfields.js     "Customise fields" — hide unused optional add-bean fields (reuses customise.decide)
  swipe.js          Swipe-style personaliser over the customise sections
  roast.js          Roast setup (bean selection, Behmor/KKTO controls, weight units)
  roasters.js       Roaster profiles (single/multi machine, per-roast machine tag)
  roaster-panel.js  Roaster control panel — Behmor button guide + KKTO heat/airflow guide
  audio.js          Mic capture, crack detection, roast curve, RoR, alarms, reference follow, probe
  detector-learning.js  Opt-in auto-tune — learns each roaster's sensitivity from your ✗/Mark corrections (pure)
  mfcc.js           Experimental MFCC feature extraction (FFT/mel/DCT, pure) — opt-in, no effect on detection yet
  roastlab.js       Roast Lab — capture/summarise/export a per-roast feature timeline (pure) — opt-in, observational
  shadow.js         Shadow detector bank — parallel, differently-tuned crack detectors (pure) — LOG-ONLY, rides on Roast Lab
  suggest.js        Low-friction bean entry — autocomplete + cascading suggestions + name parsing (pure)
  pantry.js         Bean inventory (CRUD, green lots, roasted stock, source book, green age/FIFO)
  lots.js           Green-lot helpers — grams sum, weighted cost, FEFO order, drawdown (pure)
  sourcebook.js     Source book — per-bean price history + trend from lots (pure)
  ledger.js         Borrowed/lent bean ledger — owe/lent totals (pure)
  colorcheck.js     Colour-correction matrix fit/apply for ColorChecker + DIY targets (pure)
  colourtarget.js   DIY colour-target grader — neutrality, grey ramp, hue spread, conditioning (pure)
  prep.js           Weigh-out prep batches (bean + weight + photo)
  blends.js         Blend recipes → per-component weigh-out prep batches
  planner.js        Batch planner — roast sizes that fit the drum + divide a bag (pure)
  value.js          Tastiness-per-dollar — score ÷ cost-per-cup leaderboard (pure)
  tasting.js        Tasting-over-time — dated tasting log helpers (pure)
  receipts.js       Receipt quick-add — multi-bean entry + purchase record/photo
  freshness.js      Green-bean age + roasted rest/peak + FIFO helpers (pure)
  history.js        Roast history, comparison, trends, tasting/cupping, photos, exports
  storage.js        localStorage persistence + JSON backup/restore + settings
  chart.js          Canvas renderers (roast curve, dual energy+temp, multi-curve compare, trends)
  metrics.js        DTR, RoR, weight-loss, weight units, time formatting
  flavors.js        SCA flavor-wheel data
  photos.js         IndexedDB photo storage + reference-card white balance
  bluetooth.js      Web Bluetooth connection to a DIY temperature probe
  serial.js         Web Serial (USB) path to the same DIY temperature probe
  wakelock.js       Keep-screen-awake during a roast
  hints.js          💡 Show-hints system (data-hint tooltips)
  tour.js           Guided tour of the main path
  demo.js           Simulated demo roast (no mic)
  sync-ui.js        Cloud sync UI — sign-in affordance, space picker, share-by-email, wiring
  sync/             Reusable opt-in cloud-sync module (app-agnostic):
    index.js          Public API barrel
    auth.js           Email/Google auth
    firebase-config.js  Firebase init (config from .env / emulator)
    synced-collection.js  Local-first collection ↔ Firestore (reconcile + onSnapshot)
    reconcile.js      Pure local↔cloud merge math (unit-tested)
    spaces.js         Shared spaces + share-by-email (owner/editor/viewer roles)
public/             PWA manifest, icons, service worker, self-hosted brand fonts (copied to dist/ on build)
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
