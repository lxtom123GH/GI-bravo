# Roadmap & Future Features

This document tracks the Coffee Roasting Tracker's shipped features and the
outstanding backlog. _Last reviewed: 2026-06-14._

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

**Status:** ✅ Implemented (tiered, with a one-off detail-level override): Easy = emoji + notes; Moderate = flavor wheel + brew method; Expert = cupping scores + full brew params.

⚠️ **Deviation:** the cupping total is a **simplified sum of 8 attributes (/80)**, clearly labelled — not the official SCA **100-point** protocol (which adds uniformity, clean cup, sweetness defaults and defect deductions). See backlog #B1 to upgrade.

Data model (`tastingNotes`): `emoji`, `flavors[]`, `scores{aroma,flavor,aftertaste,acidity,body,balance,sweetness,overall,total}`, `brewLog{method,doseGrams,yieldGrams,temperature,temperatureUnit,grindSize}`, `text`.

---

## 🔜 Backlog (not yet implemented)

### B1. Full SCA 100-point cupping form
Upgrade the simplified /80 sum to the official protocol: 10 categories (incl. uniformity, clean cup, sweetness) each /10, cup counts, defect deductions, total /100. Offer alongside (or instead of) the simplified form.

### B2. Full cascading tier configuration (per-feature defaults) — ✅ Done
Shipped: per-feature tier overrides for Dashboard and Tasting/cupping (sidebar → "Per-feature mode"), with `getEffectiveTier(feature)` resolving override → global. Persisted and in backup.

### B3. Automatic Rate of Rise via thermocouple
Read a bean-probe thermocouple directly via **Web Serial** or **Web Bluetooth** (Chrome) for high-resolution automatic RoR, instead of manual readings. Plot a true RoR curve.

### B4. Multi-patch colour calibration (ColorChecker)
Move beyond single-patch von Kries to a multi-patch chart (e.g. ColorChecker) with a 3×3 correction for proper colorimetric accuracy; optionally map toward an Agtron-style index.

### B5. Behmor P1–P5 reference profile templates
User-definable reference time/temperature templates per Behmor profile button, auto-loadable as the follow reference (research-flagged: home roasters want Behmor curve auto-population).

### B6. README & developer docs
Document the app (purpose, features, how to run/build, data model, PWA/HTTPS notes) for users and contributors.

### B7. Optional photo inclusion in JSON backup
Photos live in IndexedDB and are excluded from the JSON backup by default (size). Offer an opt-in "include photos" export, or a separate photo-archive export/import.

### B8. Cloud sync / community comparison (requires backend — out of current scope)
Research surfaced demand for comparing roasts of the same bean with other users. This needs a server, which conflicts with the current browser-only, no-backend design. Parked unless that constraint changes.

### Environment / ET logging (Expert tier)
The tier guidelines mention environment temperature (ET) logging at Expert tier; not yet implemented as a structured field.
