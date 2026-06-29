# DIY Colour Target — design notes

How GI-bravo turns cheap **paint sample chips + an A4 printout** into a usable colour-calibration
target for roast-colour photos, and the planned **"build-your-target" helper** that picks and
arranges the chips for you.

## Why this approach

Two hard problems sink naïve ColorChecker auto-detection (see the feasibility note in
`FUTURE_FEATURES.md`): detection is unreliable (~54–77% even in dedicated tools), and it's a
white-balance chicken-and-egg (you can't trust colour to *find* the colour chart). The fix is to
**split geometry from colour and use the right medium for each:**

- **Geometry → printed.** A black-on-white registration frame (thick top bar + four corner
  fiducials) is found by *luminance* thresholding, which is illuminant-invariant — so it works
  under exactly the light we don't trust for colour. Robust, ~100% reliable, orientation
  unambiguous. This is the part the earlier analysis said was "hard CV" — printing it makes it easy.
- **Colour → paint chips.** Matte paint chips are spectrally stable and mass-produced consistently —
  far better than printer ink (tiny gamut, drifts). The user tapes chips into known slots.

The artifact is `tools/colour-target-a4.html` (print at 100%, tape chips, beans in the centre circle).

## What this does and does NOT give you

- **Does:** a *repeatable, relative* colour reading — compare your own roasts over time. This is what
  home roasters actually want.
- **Does not:** an absolute Agtron number. Caps are honest and unavoidable:
  - **Self-measured, not assumed.** We never assume a chip is neutral 18% grey (the classic DIY
    failure — forums: "you can't tell a good chip from a bad one by eye"). We *measure* each chip
    under daylight and store its value, then fit measured→reference. A slightly-off "grey" just
    becomes a known coloured patch; the CCM still corrects it. This dissolves most of the DIY objection.
  - **JPEG / 8-bit ceiling.** Phones give tone-mapped 8-bit JPEG, not RAW. Fine for relative work.
  - **Metamerism.** Paint pigment ≠ coffee melanoidin spectrally, so a fit on paint won't transfer
    *perfectly* to beans if the light changes. The brown anchors (near coffee's colour) reduce this;
    they don't eliminate it.

## Colour science (why these patches)

Roast colour is essentially **lightness of brown** — a near-1D manifold tan → mid-brown → near-black,
warm hue, low-ish saturation. So the target is built around:

1. **A neutral grey ramp** (white → near-black): the backbone. Fixes exposure/gain, the tone curve,
   and white balance. Coffee being a lightness measure, the ramp does most of the work.
2. **Warm anchors on the coffee axis** (tan, mid-brown, dark-brown, orange/terracotta): calibration
   colours that *overlap* what we'll measure → zero extrapolation in the region that matters.
3. **One cool anchor** (blue/denim) + optional green: not because coffee is blue, but to keep the
   3×3 colour-correction matrix well-conditioned off-axis.

### How many patches — the improvement curve

The fit is a **3×4 affine CCM** (`computeCCM` in `js/colorcheck.js`, 12 unknowns, fit in linear light).

| Patches | What you get |
|---|---|
| 2 (white+black) | exposure/gain + black point only; crude WB, no hue fix |
| 4 | bare minimum for the full affine — *exactly* determined, **zero noise margin**, fragile |
| ~6 (4-step grey + orange + blue) | full affine **with redundancy** + tone sampled at 4 lightnesses — **practical sweet spot** |
| ~10–12 | better noise rejection (~1/√N) + enough grey steps to later fit a per-channel tone curve (the biggest lever for *lightness* accuracy) |
| 24 (full Macbeth) | marginal for brown beans; only helps for non-coffee subjects |

**The cheap super-power:** paint sample cards are *gradient strips* (one hue at increasing tint), so
going 4 → 12 patches costs **no extra effort** — same 2–3 cards, just more chips. Design for ~12.

### Candidate British Paints families (by name — unverified; measure to confirm)

- Grey ramp: *Diamond White / White Albatross → Portal Grey / Original Grey → Maritime Charcoal → Heavy Metal / Black Ace* (Greys page).
- Coffee browns: *Barista Fare, Rich Cocoa, Rich Soil, Steamed Mushroom, Renewed Timber, Elephant Run, Stone Cave* (Neutrals page).
- Warm anchors: *Exotic Terracotta, Natural Paprika, Unbaked Clay, Rich Sandstone, Ginger Tea, Honey Oat* (Yellows-Oranges page).
- Cool anchor: *Vintage Denim, Northern Blue, James Blue* (Blues page).

(British Paints publishes names only, no sRGB — and a published number wouldn't be valid anyway:
website-colour ≠ chip ≠ how your camera sees it. The only valid reference is the one your phone
measures off the real chip. Hence the helper below.)

## The "build-your-target" helper (planned)

**User story:** grab an assortment of chips → photograph them once under good daylight → the app
**measures, grades, shortlists, and recommends a slot order/layout** for the A4 sheet → saves it as a
reusable target.

### Flow
1. User photographs candidate chips (laid on the sheet, or a free-form spread) under even daylight.
2. User taps each chip once (reuse the existing corner/patch tap UI in `js/history.js`); the app
   samples each via `sampleAt`/`sampleChart`.
3. **Grade** each chip and the set (pure functions — see below).
4. **Shortlist** a recommended subset and **assign A4 slots**; show why (e.g. "these 5 greys give an
   even light→dark ramp; Barista Fare is your coffee-region anchor; this blue conditions the matrix").
5. Save as a `colorTarget` (existing store) with the measured reference values + slot map.

### Grading algorithm (pure, unit-testable → `js/colourtarget.js`)
Work in CIELAB (perceptual). `rgbToLab(r,g,b)` via sRGB→linear→XYZ(D65)→Lab.

- **Neutrality (greys):** chroma `C* = √(a*² + b*²)`. A chip is grey-like if `C* < ~6`. Lower = better.
- **Ramp quality (greys):** sort grey-likes by `L*`; score = lightness **range** covered (L*max−L*min,
  want ≳ 80) × **evenness** of spacing (penalise big gaps) × monotonicity. Pick the best ~5-step ramp.
- **Chromatic spread:** for non-grey chips, compute hue angle `h = atan2(b*, a*)`. Score = hue-circle
  coverage + **presence of a warm/coffee anchor** (hue ≈ 30–75°) + adequate chroma.
- **Conditioning:** build the design matrix `[r,g,b,1]` (linear) for the chosen subset and check
  `XtXᵀ` isn't near-singular (condition number / Gram determinant). Needs ≥4; prefer ≥6 well-spread.
- **Recommend order:** assign chosen chips to the 12 A4 slots **interleaving neutrals** across rows so
  a lighting gradient across the sheet doesn't bias one colour.

### Output
- Ranked shortlist (keep / drop, with one-line reason per chip).
- A recommended target (subset + slot map) → one tap to save.
- A quality readout ("strong grey ramp ✓ · coffee anchor ✓ · matrix well-conditioned ✓").

### Edge over every DIY guide
Forums all warn "you can't tell a good chip from a bad one by eye." This helper measures it and tells
you — turning the central DIY weakness into a one-tap strength.

## Build phases
- **B-CT1 — A4 template** ✅ prototype (`tools/colour-target-a4.html`); iterate geometry after a physical test.
- **B-CT2 — grading helper** (`js/colourtarget.js`, pure + tests): rgbToLab, neutrality, ramp, spread,
  conditioning, shortlist, slot map.
- **B-CT3 — UI**: "Build a colour target" flow wired to the existing tap/sample + `colorTargets` store.
- **B-CT4 — fiducial detector** (vanilla JS, luminance-based): find the printed frame + corners so the
  re-shoot step stops needing manual corner taps. This is the original "auto-detect" goal, now tractable
  because the geometry is printed.
- **DoD (per CLAUDE.md):** data-hint + Help + USER_GUIDE; unit tests for pure helpers; include any new
  persisted data in `exportAllData`/`importAllData`; build + LF; verify in browser.
