# Roadmap & Future Features

This document tracks the Coffee Roasting Tracker's shipped features and the
outstanding backlog. _Last reviewed: 2026-06-26._

---

## ✅ Shipped (in `main`)

Core / fixes:
- App wiring via `main.js` (modular `js/` UI now actually runs); removed orphaned `app.js`; `dist/` rebuilt.
- Tasting-notes save routed through `storage.js`.
- High-pass filter lowered 3000 Hz → 500 Hz (was removing first crack's low-frequency signature).

Roasting:
- Live **roast curve** chart (audio energy over time) with crack markers; per-history-card curves.
- **Development Time Ratio (DTR)** and roast metrics (live readout, history, export).
- **Crack notifications** (beep + desktop) with detection paused during the beep.
- **Detection tuning** UI: sensitivity threshold, cluster size, second-crack pitch (persisted).
- **Frequency-based 1C/2C classification** (low- vs high-band FFT energy).
- **Target alarms** for total time and DTR.
- **Reference-roast follow mode** (overlay a past curve live + pre-crack heads-up).
- **Manual temperature logging → approximate Rate of Rise**, with °C/°F unit.

Beans / history / data:
- **Bean pantry** quantities: low-stock states, restock, per-roast green-weight deduction.
- **Roast history** with delete; **JSON backup/restore** (incl. settings, targets, reference samples, unit, tier).
- **Roast comparison** view (overlay two roasts + metrics table).
- **Roast Trends** chart (DTR / total time / first crack / roast colour across batches).
- **CSV export** (time, energy, temp, RoR, events + metadata header).
- **Roasted weight & weight-loss % (yield)** — see section 1.

Photos / colour:
- **Roast photos** stored in IndexedDB (downscaled).
- **Reference-card white balance** + roast-colour brightness index; shown in cards and comparison.
- **Exposure guard** (warns on clipped/dark reference) + optional **self-calibrated reference samples**.

Platform / UX:
- **PWA**: manifest, icons, service worker (installable + offline).
- **Responsive** mobile layout (off-canvas drawer).
- **Complexity tiers** (Easy/Moderate/Expert) — lightweight global version; see section below.
- **Tiered cupping & brew log** — see section 2.

---

## Overarching Architecture: Complexity Tiers (Easy / Moderate / Expert)

To cater to a wide range of users, from casual hobbyists to advanced roasters and Q Graders, new and existing features should be governed by "Complexity Tiers."

**Status:** ✅ Full three-level hierarchy shipped — global Mode selector, per-feature overrides (Dashboard, Tasting), and a one-off override on the cupping modal.

### Configuration Hierarchy:
1.  **Global Default:** ✅ A master "Mode" setting in the sidebar.
2.  **Per-Feature Default:** ✅ "Per-feature mode" in the sidebar overrides the global tier for the Dashboard and Tasting/cupping areas (Inherit / Easy / Moderate / Expert). Persisted and included in backup.
3.  **One-off Override:** ✅ The cupping modal's detail-level select (defaults to the effective tasting tier).

### Tier Guidelines:
*   **Easy:** Minimal friction. Basics only (bean, total time, emoji ratings 🙁/😐/😀).
*   **Moderate:** Baseline. Flavor wheel, crack times, DTR, brew method.
*   **Expert:** Full logging. Yield, environment temps, SCA cupping, detailed brew params.

---

## 1. Roasted Weight & Weight Loss Percentage (Yield)

**Status:** ✅ Implemented (available to all tiers, not gated to Expert). "Log Roasted Weight" button on each history card stores `roastedWeightG`; card shows weight + loss %; comparison table and clipboard/CSV exports include it; sanity-check warns outside 12–20%.

Weight loss = `((greenWeightG - roastedWeightG) / greenWeightG) * 100`.

## 2. SCA-style Cupping Score & Brew Log

**Status:** ✅ Implemented (tiered, with a one-off detail-level override): Easy = emoji + notes; Moderate = flavor wheel + brew method; Expert = **official SCA 100-point cupping** + full brew params.

The Expert cupping form now uses the official SCA protocol (see B1): 7 quality attributes (6.00–10.00), Uniformity/Clean Cup/Sweetness (default 10), minus taint/fault defects = final score /100. Older roasts saved with the earlier simplified /80 sum still display correctly (their stored total and `max` are used).

Data model (`tastingNotes`): `emoji`, `flavors[]`, `scores{aroma,flavor,aftertaste,acidity,body,balance,sweetness,overall,total}`, `brewLog{method,doseGrams,yieldGrams,temperature,temperatureUnit,grindSize}`, `text`.

---

## Roadmap items

Everything below is shipped (✅) **except B8** (parked — needs a backend) and the
small follow-ups noted under B3/B4. Items keep their implementation notes for reference.

### B1. Full SCA 100-point cupping form — ✅ Done
Shipped: the Expert cupping form uses the official protocol — 7 quality attributes (6.00–10.00, 0.25 steps), Uniformity/Clean Cup/Sweetness (default 10), minus taint (×2)/fault (×4) defects = final /100. Backward-compatible with the earlier /80 records via stored `total`/`max`.

### B2. Full cascading tier configuration (per-feature defaults) — ✅ Done
Shipped: per-feature tier overrides for Dashboard and Tasting/cupping (sidebar → "Per-feature mode"), with `getEffectiveTier(feature)` resolving override → global. Persisted and in backup.

### B3. Automatic Rate of Rise via thermocouple — ✅ Done
Read a bean-probe thermocouple via **Web Bluetooth** (Chrome/Edge) for automatic temperature logging and RoR, instead of manual readings.
- DIY hardware build documented in `HARDWARE_GUIDE.md` (ESP32 + MAX31855 + K-type probe, with Arduino/BLE firmware).
- `js/bluetooth.js` connects to the probe and dispatches `roasterTemperature` (°C) ~1/s, and `roasterDisconnected` on drop.
- A **Connect probe** control (Expert tier) toggles the connection and shows status. Incoming temps are converted to the active unit, shown live, and — while roasting — auto-logged (~1/s) into `roastState.temps`, feeding the same RoR/history/CSV/Trends pipeline as manual entry.
- The live roast curve overlays a **temperature line** (`drawRoastCurveDual`) alongside audio energy when probe data is present.
- *Possible follow-up:* Web Serial support, and a dedicated RoR (°/min) trace rather than the raw temperature line.

### B4. Multi-patch colour calibration (ColorChecker) — ✅ Done
Shipped: an "Add ColorChecker Photo" flow fits a 3×4 affine colour-correction matrix by least squares over the 24 published patch sRGB references (`js/colorcheck.js`), applies it to the bean photo, and stores a roast-colour index (counted alongside the single-patch flow). The user taps the 4 corner patches to locate the grid (bilinear interpolation + per-patch averaging).
- *Caveat:* a relative roast-colour index, not full linear-light colorimetry/Agtron.
- *Follow-up shipped:* linear-light fitting; a **DIY custom-target** mode (below) that fits the same CCM to N self-calibrated patches.
- *Possible follow-up:* auto-detect the chart.

### B4b. DIY custom colour target — ✅ Done
Shipped: an "Add Custom-Target Photo" flow for a cheap home-made swatch card (4–6 paint chips). `computeCCM`/`sampleChart` were generalized to N patches and arbitrary cols×rows grids (the 24-patch ColorChecker is now just the default). Because paint swatches have no published sRGB, the target is **self-calibrated once** under daylight — each patch's measured colour is stored as the baseline (`colorTargets` in `storage.js`, included in backup) — and future photos are corrected back to that baseline. Re-shoot the card next to the beans, tap the 4 corners, and the same least-squares CCM (`js/colorcheck.js`) is fit and applied; result stored as a `customtarget` roast-colour index.
- *Why it works:* ≥4 patches with good spread (a grey ramp + a warm/cool chip) condition the 3×4 fit; the deltas between patches drive the matrix.

### B5. Behmor P1–P5 reference profile templates
**Phase 1 — ✅ Done:** save a finished Behmor roast as a template keyed by **profile + weight**; selecting that profile/weight on the dashboard auto-loads it as the follow reference (exact match, else profile-only fallback). Added a **weight-unit toggle** (metric default / imperial) that relabels the Behmor weight buttons, and a **default batch size** preference that pre-selects the weight on load. Templates, unit, and default weight are persisted and included in backup.

**Phase 2 — ✅ Done (manual profiles):** Expert-tier **Manual power** buttons (0/25/50/75/100% = P1–P5) log timestamped power changes during a roast into `roastState.powerLog`. A finished roast with power changes can be saved as a named **manual profile** (weight-tagged) from History. Selecting it under "Follow reference roast" overlays its curve and gives **timed power cues** (~10 s ahead, e.g. "set power to 50%") alongside the crack heads-up. Manual profiles are persisted, in backup, and power changes appear in the CSV export.

### B6. README & developer docs — ✅ Done
Shipped: `README.md` (purpose, features, dev/build, data model, PWA/HTTPS notes, project structure) plus `HARDWARE_GUIDE.md`. Kept in sync with the shipped feature set.

### B7. Optional photo inclusion in JSON backup — ✅ Done
Shipped: an "Include photos (larger file)" checkbox on the Data Backup card embeds all IndexedDB photos (as data URLs) into the JSON export; import restores them into IndexedDB (via `getAllPhotos`/`replaceAllPhotos`). Off by default to keep the file small.

### B8. Cloud sync / community comparison (requires backend — out of current scope)
Research surfaced demand for comparing roasts of the same bean with other users. This needs a server, which conflicts with the current browser-only, no-backend design. Parked unless that constraint changes.

### Environment / ET logging (Expert tier) — ✅ Done
Shipped: an Expert-tier "Log ET" input records timestamped environment-temperature readings into `roastState.envTemps` (timeline entries, count shown in history, `env_<unit>` column in the CSV export). Saved with the roast and in backup.

---

## Competitive landscape research (2026-06)

Surveyed Artisan, RoasTime/Roast.World (Aillio), Cropster, RoastLog/RoastPATH, and Beanconqueror.
Field direction: AI predictions (Cropster Smart Predictions), the SCA **CVA 2024** cupping form,
cloud + community profile sharing, and linked inventory↔production↔cupping. Opportunities found
that fit a browser-only app were all built (below); the big remaining differentiator others have
is **cloud/community**, which needs a backend (B8).

Shipped from the research:
- **Roast phase breakdown** — ✅ Dry End marker → drying / Maillard / development time + %.
- **First-crack ETA** — ✅ countdown to the followed reference's first crack.
- **Consumption & spend dashboard** — ✅ Summary card (roasts, kg, avg loss, spend).
- **Shareable roast file** — ✅ export/import a single roast (backend-free sharing).
- **SCA CVA (2024) cupping form** — ✅ selectable alongside the classic 100-point form.

## Smaller ideas / nice-to-haves

Shipped:
- **Service-worker update prompt** — ✅ a "new version available — Reload" banner when an updated SW installs.
- **Bean cost / usage history** — ✅ optional cost/kg per bean; pantry stock value + per-roast cost (and cost per kg roasted).
- **B3 follow-up — Web Serial probe** — ✅ a USB temperature-probe path alongside Bluetooth (`js/serial.js`).
- **B3 follow-up — dedicated RoR trace** — ✅ the live curve overlays a °/min Rate-of-Rise line.
- **B4 follow-up — linearized fit** — ✅ the ColorChecker matrix is fit/applied in linear light.
- **B4 follow-up — DIY custom target** — ✅ self-calibrated N-patch swatch card as a budget ColorChecker (see B4b).
- **Onboarding** — ✅ simulated demo roast, guided tour, hint mode, in-app Help, empty-state nudges.
- **Mobile layout + crack false-positive undo + repeating alarm/tones + declutter + smarter calibration** — ✅ (see `ROASTER_JOURNEY.md`).
- **Weigh-out prep batches** — ✅ bean + grams + photo in the pantry, loadable onto Active Roast.
- **Behmor weights match the machine (100/200/400 g)** + green weight remembers the usual (e.g. 450 g) — ✅.
- **Roaster profiles** — ✅ single-roaster by default (frictionless), opt-in multi-roaster (`js/roasters.js`); each roast tagged with its machine. _Roadmap step 1 of `ROASTER_JOURNEY.md`._

## Roadmap (from `ROASTER_JOURNEY.md` — lifecycle walkthrough)
See that doc for the full "day/week in the life" narrative. Next up, in order:
1. ✅ Roaster profiles (single/multi) — done.
2. ✅ Green-bean freshness + roasted rest/peak clocks + FIFO nudges — done
   (`js/freshness.js`): pantry shows green age + a "roast soon"/"roast this first" nudge;
   history shows a resting/peak/past-peak badge per roast.
3. ✅ Blend builder → weigh-out prep plan — done (`js/blends.js`): recipe (components + %),
   "Weigh out" splits a batch into per-component prep batches; pre/post-blend recorded.
3.5 ✅ Batch planner — done (`js/planner.js`): "Plan roasts" on a pantry bean suggests roast
   sizes that fit the roaster's drum and divide the bag evenly (2.5 kg → 6 × 417 g, no runt),
   and shows the leftover your usual size leaves. Freshness caveat included.
4. ✅ Machine-faithful roaster control panel — done (`js/roaster-panel.js`): a Behmor panel
   showing each button's **before-roast vs during-roast** function (the manual's big gotcha),
   **model-aware** (2000AB Plus / 2000AB / 1600 Plus differ — beep vs blink, drum rpm, A/B temp
   readouts), a setup-sequence guide, and a **live mode** (auto on roast start) whose buttons log
   timestamped actions onto the roast. Follow-up: capture the Behmor sub-model on the roaster
   profile; a faithful KKTO panel.
5. Tastiness-per-dollar value leaderboard.
6. Receipt/invoice quick-add (+ photo); tasting-over-time; swipe-style personalisation; collective space.

Open threads (see `HANDOFF.md` for detail):
- **Portfolio backend** — reconsider "no backend" across the whole app portfolio (GI-*, golf-handicap-tracker, etc.): one shared Supabase project for SSO + opt-in cloud sync + community, GI-bravo as pilot. Decision pending.

Deliberately not built (rationale):
- **Bluetooth scales / water-mineral brew profiles** (Beanconqueror-style) — per-device BLE protocols can't be built/verified without the hardware; water profiles are consumer-brew scope creep with low value for a roasting-focused app.
- **Production scheduling** (Cropster) — aimed at commercial roasteries; low value for the home/hobby focus.
- **Artisan interoperability** — deferred. Artisan's importer expects specific CSV/`.alog` schemas that can't be validated here; the existing generic CSV (time, energy, temp, RoR, ET, power, events) already serves spreadsheet analysis. Revisit only with a real Artisan round-trip test.
- **B4 — auto-detect the ColorChecker** — won't-do for now. Reliable chart detection needs real computer vision; the 4-corner tap is a pragmatic, dependency-free alternative.
- **B8 — cloud sync / community comparison** — parked; needs a backend, which conflicts with the browser-only design.
- **Repo hygiene** — `dist/` is committed but Vercel rebuilds from source; could be `.gitignore`d to avoid drift (left as-is — deterministic and in sync).
