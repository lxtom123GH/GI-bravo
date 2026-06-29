# Roadmap & Future Features

This document tracks the Coffee Roasting Tracker's shipped features and the
outstanding backlog. _Last reviewed: 2026-06-29._

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
- **"Ember" design system** (visual refresh, shipped 2026-06-29, PRs #73 + #75): a two-layer
  plain-CSS token architecture — a portable layer (`tokens.portable.css`, `components.css`) + a
  swappable theme layer (`theme.coffee.css`; `theme.golf.css` proves the seam). Warm-dark surfaces,
  amber accent, WCAG-AA, selection states that aren't colour-only, three **self-hosted** brand fonts
  (Hanken Grotesk / Spline Sans Mono / Figtree, woff2, precached in the SW for offline). The roast
  curve is repainted on the same tokens (lit gradient line, glow, oscilloscope grid, phase bands off
  the existing dry-end/first-crack markers). Visual-only — no behaviour change.
  - *Follow-ups:* build new UI with the `components.css` classes; re-theme the **golf app** via
    `theme.golf.css` (portfolio re-skin proof).

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

### B4c. ColorChecker auto-detect — feasibility verdict + DIY paint-chip target (in progress)
**Auto-detecting a ColorChecker outright is not worth it** (researched 2026-06-29): detection is unreliable even in dedicated tools (a published academic detector ~77%, commercial X-Rite ~54%), it's a white-balance chicken-and-egg (you can't trust colour to *find* the colour chart), there's no browser-ready detector (OpenCV's `mcc` is a C++ contrib module, absent from standard OpenCV.js, which is multi-MB wasm anyway), and a miss silently yields a *wrong* CCM. For an audience where the chart is already "overkill for most home roasters," it trades large weight + a silent-failure mode to save a ~3 s, 100%-reliable corner tap.
**The clever reframe (full design in `COLOUR_TARGET_DESIGN.md`):** split geometry from colour. Print a black-on-white registration frame on A4 (found by *luminance* thresholding → illuminant-invariant → ~100% reliable, orientation unambiguous); tape stable matte **paint chips** into known slots for the colour. This makes the "hard CV" trivial and stays 100% DIY. Plus a **"build your colour target" helper** that measures an assortment of chips and grades them (neutrality, even grey ramp, hue spread, matrix conditioning) — solving the forums' "you can't tell a good chip from a bad one by eye" problem.
- Shipped so far: printable A4 template (`tools/colour-target-a4.html`) and the pure grading helper (`js/colourtarget.js`, unit-tested).
- Next: wire the helper to a UI (reuse the tap/sample + `colorTargets` store), then a luminance-based **fiducial detector** — which *is* the original "auto-detect" goal, now tractable because the geometry is printed.

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

### Detector tuning / learning from user labels (proposed, 2026-06-28; research-grounded)
Owner's idea: label crack events as **false positive / true / missed** to make the detector improve.
Web research (2026-06) confirms this is exactly **human-in-the-loop active learning** — a validated
pattern, not naive — and shows where the real leverage is. Two big findings shape the design:

1. **Features matter more than the loop.** State-of-the-art coffee first-crack detection uses
   **MFCCs** (spectral *timbre* of the fracture), which carry **>73%** of the discriminative power —
   a Random Forest on MFCCs hits **95.7%** accuracy / 0.992 ROC-AUC. Our current detector keys off
   time/frequency **band-energy ratios + transient clustering** (`js/audio.js`), i.e. mostly
   loudness. **Upgrading the features to MFCCs is likely a bigger win than any learning loop.**
2. **Learn only from *explicit* labels.** Self-training on pseudo-labels/confidence thresholds is
   known to reinforce errors — so drive learning from the user's real ✗/✓/＋ taps, not guesses.

**How the app actually "learns" — tiered, all browser-feasible (no backend ML required):**
- **v1 — adaptive per-machine thresholds — ✅ Shipped 2026-06-29.** Opt-in "Auto-tune from my
  corrections" toggle (off by default) in Detection Settings. On a **mic** roast, clearing an
  AUTO-detected crack (false positive) nudges the **spike threshold** less sensitive; a Manual:
  Mark the detector missed nudges it more sensitive — clamped, stored **per roaster**, shown as a
  live readout with a reset, and included in the JSON backup. Pure helpers in
  `js/detector-learning.js` (`nudgeAdjust`/`applyAdjust`/`describeAdjust`, unit-tested); wiring in
  `js/audio.js`; persistence in `js/storage.js`. v1 deliberately tunes only the threshold (the
  biggest lever); cluster size / 2C-pitch stay on the manual sliders. _Next: v2 below._
- **v2 — on-device personalised classifier.** Capture a feature vector (add **MFCCs**) at each
  candidate; from the user's labelled events fit a small **logistic-regression / prototype (k-NN)**
  model **in the browser** (pure JS). Personalises to the user's machine acoustics — the "it learns
  from my clicks" they want. Store the model locally; include in backup.
- **v3 — pooled/community model.** Use the shipped **cloud sync** to aggregate labelled feature
  vectors across users/sessions, train a Random-Forest/NN **offline**, ship it as a static client
  model (TinyML-style). This is where the two-device labelling + sync pays off — it builds the
  dataset. Prior art to align with: **RoastLearner** (ML audio classifier for Artisan) and the
  emerging open coffee-roasting first-crack **audio datasets**.

**Capture UX — two devices (owner's preference; avoids juggling apps on one device):** roasting
device streams each *candidate* (timestamp + feature vector) into a synced "debug session"; a
**companion** phone/tablet subscribes live (Firestore `onSnapshot`, the path we verified) with
one-tap ✗/✓/＋ that sync back. The live roast already has **Clear** (false +) and **Manual: Mark**
(missed) in `js/audio.js`; this reuses those signals but *captures the features* and adds the
hands-free second screen. *Single-device MVP:* record candidates+features during the roast, label
on a post-roast review screen, export CSV/JSON. Opt-in / Expert-tier so the casual path stays clean.

Sources: ScienceDirect *Acoustic-Based Crack Detection* (MFCC/Random Forest); ResearchGate NN
first-crack ID; interactiveaudiolab *Human-in-the-Loop Sound Event Detection*; arXiv self-learning /
continual on-device audio classification; GitHub *RoastLearner*.

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
- **Suggested blends** — ✅ "Blends you can make now" matches classic ratios to the in-stock pantry; one tap pre-fills the builder (`suggestBlends` in `js/blends.js`).
- **Experiential rest/peak guidance** — ✅ the history rest/peak badge is a soft, approximate hint (research refuted fixed per-brew-method rest tables) and surfaces the user's own "★ rated best around day X" from the tasting log once a roast has ≥2 dated tastings (`personalPeak` in `js/tasting.js`).
- **Pantry depth (Track B)** — ✅ progressive-disclosure add-bean form (name + grams floor, rest behind ＋ Add detail); **green lots** (dated/priced sub-records per bean, sum-of-lots on hand, weighted-average cost, FEFO "use first" + roast drawdown — `js/lots.js`); **roasted stock** (simple grams-left + days-since-roast); and a **source book** (per-bean supplier, re-order link, price history + trend — `js/sourcebook.js`). Research-grounded: green carries the depth, roasted stays dead-simple.
- **Roasted-stock usage trail** — ✅ each Drank some / Finished draw-down records **where it went** (brewed / gift / cupping + optional note) on the roast's `usageLog`, shown as a per-batch "Where it went" history; `logRoastedUsage` + pure `summariseRoastedUsage` (`js/storage.js` / `js/freshness.js`). Lives in roastHistory, so backup already covers it. Keeps the "what did I do with it" answer without leaving roasted stock heavy.
- **Borrowed/lent bean ledger** — ✅ a **Loan** button on each pantry bean records "borrowed from Mark — owe 250 g" / "lent Sam 200 g"; the card shows owed/lent totals with a per-bean **Loans** list (`js/ledger.js` `summariseLedger` + `addBeanLedgerEntry`/`deleteBeanLedgerEntry`). Lives on the bean, so backup covers it. (Owner idea, ROASTER_JOURNEY Stage 1 — keeps the collective side honest.)
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
4. ✅ Machine-faithful roaster control panel — done (`js/roaster-panel.js`). **Behmor:** each
   button's **before-roast vs during-roast** function (the manual's big gotcha), **model-aware**
   (2000AB Plus / 2000AB / 1600 Plus differ — beep vs blink, drum rpm, A/B temp readouts), a
   setup-sequence guide. **KKTO:** a manual heat/airflow + agitator guide and a roast-phase flow
   (charge → drying → first crack → drop). Both have a **live mode** (auto on roast start) logging
   timestamped actions onto the roast. ✅ Behmor sub-model now stored per roaster profile.
   Follow-up: a fuller pre-roast "what will happen" simulation.
5. ✅ Tastiness-per-dollar value leaderboard — done (`js/value.js`): ranks roasts by cup quality
   per dollar (tasting score ÷ cost per cup) in Roast History; pure helpers, unit-tested.
6.5 ✅ Tasting-over-time — done (`js/tasting.js`): each roast keeps a dated tasting log (coffee
   changes as it rests/ages); modal shows the history; `tastingNotes` stays = latest for back-compat.
6. ✅ Receipt/invoice quick-add (+ photo) — done (`js/receipts.js`): snap a receipt and add
   several beans in one go (name/grams/$ per kg), each landing in the pantry with the purchase
   date; the photo + a purchase record are kept (Recent purchases list). Follow-up: OCR parsing.
   Remaining: collective space — see 6.9.
6.9 ✅ Collective space — LIVE (`js/sync/`, `js/sync-ui.js`): opt-in cloud sync
   (email/Google), a shared pantry/roastHistory/blends/roasters scoped to a space you can share
   by email, personal calibration stays per-device; path-generic rules. **Went live 2026-06-28**
   on the shared Firebase hub **`lx-apps`** (Auth: email/password + Google; Firestore in
   `australia-southeast1`; rules + the `members.uid` collection-group index deployed). Storage
   was deliberately **not** enabled (new projects now require the Blaze plan for a bucket, and the
   pilot syncs only Firestore data — photo sync stays a follow-up). Verified live: cross-device
   sync of pantry/roasts, and share-by-email across two accounts. See `GO_LIVE_CHECKLIST.md`.
   - **Go-live rules fix:** the first real share failed with `permission-denied` — `createSpace`
     couldn't write the owner's own `members/{uid}` doc because ownership was checked via that
     same (not-yet-existing) members doc. Fixed by defining space ownership from the space doc's
     `ownerUid` field (`isSpaceDocOwner`); the escalation guard still holds. Regression tests added
     (now 13 rules tests).
   - **✅ Clean separation + multi-space (shipped 2026-06-28):** scopes are now isolated — each of
     Personal + every space has its own local cache; switching just swaps the view (no bleed). A
     shared space starts empty with a **"Copy my personal beans & roasts into this space"** button;
     the **last-used scope is remembered** (resume on sign-in, fall back to Personal if it's gone);
     clearer picker labels ("Personal (only me)" / "name (shared · role)"). Per-space roles, not
     per-item ACLs (Box/Drive/Power BI best practice). `js/sync/synced-collection.js` + `js/sync-ui.js`.
   - **✅ Cross-scope bleed FIXED (shipped 2026-06-28):** the single live store now mirrors only the
     ACTIVE scope; switching saves the leaving scope to a per-scope cache and loads the entering one,
     and sign-out swaps the view back to Personal. So switching back to Personal can no longer drag a
     space's (or other members') items into Personal. Proven by an emulator test
     (`tests/rules/scope-isolation.test.js`).
   - **Follow-up (deferred):** per-item **Move to Personal / shared** (cross-scope cloud writes —
     handles the "keep one bean private in an otherwise-shared pantry" case without per-item ACLs);
     per-item "shared" flags remain deliberately out of scope.
6.7 ✅ Swipe-style personalisation — done (`js/swipe.js`): swipe each optional Active-Roast
   control right to keep / left to hide (or tap the buttons); revisitable from Help or the
   customise panel; writes the same `dashboardHidden` set as "Customise this screen".

Open threads (see `HANDOFF.md` for detail):
- **Portfolio backend** — ✅ decided & piloted: standardize on **Firebase** (not Supabase —
  it's already the incumbent in golf + the aps pair), local-first + opt-in cloud sync, one shared
  identity hub (`lx-apps`). GI-bravo is the pilot and is now **live** (see 6.9). Remaining: roll
  the `js/sync/` pattern out to GI-alpha → tempovibes → migrate golf last. See `PORTFOLIO_AUTH_SYNC.md`.

Deliberately not built (rationale):
- **Bluetooth scales / water-mineral brew profiles** (Beanconqueror-style) — per-device BLE protocols can't be built/verified without the hardware; water profiles are consumer-brew scope creep with low value for a roasting-focused app.
- **Production scheduling** (Cropster) — aimed at commercial roasteries; low value for the home/hobby focus.
- **Artisan interoperability** — deferred. Artisan's importer expects specific CSV/`.alog` schemas that can't be validated here; the existing generic CSV (time, energy, temp, RoR, ET, power, events) already serves spreadsheet analysis. Revisit only with a real Artisan round-trip test.
- **B4 — auto-detect the ColorChecker** — won't-do for now. Reliable chart detection needs real computer vision; the 4-corner tap is a pragmatic, dependency-free alternative.
- **B8 — cloud sync / community comparison** — parked; needs a backend, which conflicts with the browser-only design.
- **Repo hygiene** — `dist/` is committed but Vercel rebuilds from source; could be `.gitignore`d to avoid drift (left as-is — deterministic and in sync).
