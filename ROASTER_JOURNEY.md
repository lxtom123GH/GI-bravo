# A roaster's journey — lifecycle walkthrough & product roadmap

_Written 2026-06-27. A "day/week/month in the life" of a hobby coffee roaster, mapped
against what GI-bravo does **today**, where the **gaps** are, and **creative ideas** for
where it could go. Use this to prioritise the next builds._

Legend: ✅ exists today · ◐ partial · ✨ new idea / gap.

---

## The cast (why "multi-roaster" matters from day one)
- **Mum** — a **Behmor 2000AB Plus**, manual roasts (P5 to start, P3 after first crack), not technical.
- **Me** — my own **KKTO**.
- **Mark** — a *different variant* of the KKTO.
- **Stuart** — a *different variant* of the Behmor.

So even before beans arrive, the app should know **whose machine** a roast happened on. Today
the roaster picker is a fixed list (Behmor 2000AB Plus / KKTO). ✨ **Roaster profiles** — let a
user register *their* machine (model + variant + nickname, e.g. "Mark's KKTO v2"), tag each roast
with it, and key templates/profiles per machine. This makes "a roast at Stuart's" first-class and
keeps everyone's reference profiles separate.

**Crucial nuance — most people have ONE roaster.** Default to **single-roaster mode**: zero
picker, zero clutter, the dashboard just *is* your machine. Multi-roaster is an **opt-in** ("I use
more than one roaster") that turns on the picker and per-machine profiles. The principle: match
the user's real-world complexity, but keep the common case frictionless — a little setup up front
is fine if the everyday screen is effortless.

✨ **Swipe-style personalisation.** A light, optional "like this / not for me" pass (think gentle
card-swiping, not dating-app gimmick) during/after onboarding: show a feature or layout choice,
swipe right to keep it, left to hide it — quietly tailoring the app to how *this* person roasts.
Always **revisitable** ("redo my setup" / a decisions log), and it feeds the same machinery as
"Customise this screen" so nothing is locked in.

---

## Stage 0 — "I have a roaster" (Day 0, ~15 min)
**Today ✅:** pick roaster (Behmor/KKTO), pick Mode (Easy/Moderate/Expert), guided tour, demo
roast, in-app Help, "Customise this screen" to hide clutter, keep-screen-awake, alarm tones.

**Ideas ✨:**
- A 2-minute **"set up my roaster"** wizard: choose machine + variant → nickname → default batch
  size (mum: 400 g) → done. Seeds her roaster profile and the dashboard defaults.
- Ship a couple of **starter reference profiles** per machine so a first roast has something to follow.

---

## Stage 1 — Getting green beans (recurring; the supply side)
Three realistic paths:
1. **Order online** — usually a detailed invoice/email (origin, process, weight, price).
2. **Buy retail** — often *no itemised receipt*; you just know "1 kg Ethiopian, ~$22".
3. **Gifted / borrowed / swapped** — a friend hands you 500 g of something.

**Today ✅:** add a bean manually (name, country, region, farm, process, quantity g, cost/kg);
restock; low-stock warning; stock value; cost feeds the spend dashboard.

**Gaps / ideas ✨:**
- **Invoice/receipt import.** Paste an order confirmation email or drop a PDF/photo → parse line
  items into pantry entries (origin, weight, price each). For retail with no itemised receipt:
  a **fast "quick add"** (name + kg + total paid → auto cost/kg) plus an optional **photo of the
  bag/label/receipt** so you can recover details later (we already store photos well).
- **Source book.** Remember *where* each bean came from (supplier + date + price) so re-ordering
  and price history are one tap. Australian home-roast suppliers to seed a picker: Green Bean
  Coffee, Green Bean Roasters, The Coffee Commune (1 kg min), Quest, Witham's, Di Pacci, Artisti.
- **Gift/loan tracking.** Mark a lot as "borrowed from Mark — owe 250 g back" so the collective
  side stays honest.

---

## Stage 2 — Building & keeping the pantry (ongoing)
**Today ✅:** pantry list with quantities, low-stock, cost, stock value; consumption & spend
dashboard; backup/restore.

**Shipped ✅ (freshness v1, `js/freshness.js`):** the pantry shows each lot's **green age**
("bought 5 days ago"), flags lots over ~12 months ("roast soon"), and marks the **oldest
in-stock** bean "roast this first" (FIFO). Each roast in History shows a **rest/peak badge**
(resting → ready/peak → past peak). Still to come below: lots, roasted inventory.

**Gaps / ideas ✨ (this is where freshness lives):**
- **Two clocks, not one.** Green beans keep ~12 months+; **roasted** beans have a short arc
  (degas a few days, peak ~4–14 days, fade after). Track **green age** (purchased date) *and*,
  per roast, **roasted age** with a rest/peak window.
- **FIFO nudges.** "Oldest green first" suggestions, and flags for lots going stale ("this
  Brazil is 14 months old — roast it soon"). Directly answers "I don't want to keep really old bins."
- **Lot vs bean.** A "bean" (Ethiopia Yirgacheffe washed) can have multiple **lots** (different
  purchases/dates/prices). Tracking lots makes age, price history, and FIFO accurate.
- **Roasted inventory.** After a roast, the output (e.g. 380 g roasted from 450 g green) becomes a
  *roasted* stock item with its own freshness clock and "what did I do with it" trail (below).

---

## Stage 3 — Blends: what to roast (research + planning)
You asked "what blends, where to look, can you find them?" — yes:

**Where roasters research blends:**
- [Sweet Maria's blending library](https://library.sweetmarias.com/blending/) — the canonical guide.
- [Home-Barista espresso blending guide](https://www.home-barista.com/espresso-blending.html) and forum.
- [INeedCoffee blending for home roasters](https://ineedcoffee.com/coffee-blending-for-the-home-roaster/).
- [Coffee Bean Corral — making your own blends](https://www.coffeebeancorral.com/blog/post/creating-coffee-blends), [Perfect Daily Grind](https://perfectdailygrind.com/2018/05/a-roasters-guide-to-creating-coffee-blends/).
- Communities: Reddit r/roasting & r/coffee; the Australian **CoffeeSnobs** forum.

**Classic starter blends (good first targets):**
- **Mocha-Java** (the original blend): ~25% Yemen/Ethiopia (fruity, aromatic) + ~75% Indonesian
  (Sulawesi/Java — syrupy body, deep tones).
- **Balanced everyday:** ~60% Colombian + 40% Brazil (smooth, chocolatey).
- **Bold espresso:** ~50% Sumatra + 30% Colombia + 20% Ethiopia (heavy body, caramel + fruit).
- **Italian-style espresso base:** 40–80% Brazil base + 20–30% a bright coffee for lift.

**Pre-blend vs post-blend** (key decision the app should support):
- *Pre-blend* — mix greens, roast together (simple, one roast).
- *Post-blend* — roast each component to its own ideal, then combine (more control, more work).

**Shipped ✅ (blend builder, `js/blends.js`):** define a recipe (components + %), pre- or
post-blend; **"Weigh out"** splits a chosen batch weight into per-component **prep batches**
(60/40 of 450 g → 270 g + 180 g) that load onto Active Roast. Classic starting points shown.
**Shipped ✅ (`js/blends.js`):** **Suggested blends** — "Blends you can make now" surfaces the
classic ratios (Everyday, Bold espresso, Mocha-Java, Italian-style) the current in-stock pantry can
fulfil, matched by origin keyword, each **"Use this recipe"** pre-filling the blend builder.
**Ideas ✨ (still to come):**
- Track **pre- vs post-blend** on the *roast record* so tasting notes know what they're describing
  (the blend recipe already records it; carry it onto the roast).

---

## Stage 4 — Roast day (the core loop, ~20–40 min)
Flow: pull beans → weigh into containers → roast → drop. We've built a lot here.

**Today ✅:** weigh-out **prep batches** (bean + grams + photo) → load onto Active Roast in a tap;
green-weight remembers your usual (450 g); Behmor 100/200/400 g buttons + profiles; mic crack
detection with adjustable sensitivity + longer/percentile calibration; manual crack marking +
false-positive clear; repeating first-crack alarm with tones; phase breakdown (drying/Maillard/
development) + DTR; follow a reference roast with a first-crack ETA; temp/probe (BT/USB) logging;
"Start (no mic)" manual mode; keep-screen-awake.

**Shipped ✅ (`js/roaster-panel.js`):** a model-aware Behmor panel — a before-vs-during button
reference (the manual's gotcha), a Behmor-model selector (2000AB Plus / 2000AB / 1600 Plus
differ: beep vs blink, drum rpm, A/B temp readouts), a setup-sequence guide, and a live mode
(auto on roast start) that logs button presses onto the roast. **Plus a KKTO guide** — heat,
airflow and the agitator explained, with a roast-phase flow (charge → drying → first crack →
drop) and the same live logging (the KKTO is manual, so it's a control guide, not a button
decode). Follow-ups: store the Behmor sub-model on the roaster profile; a fuller pre-roast
"what will happen" simulation.

**The original idea ✨ — a machine-faithful "Roaster control panel".**
The Behmor manual is genuinely confusing, and *buttons change meaning before vs during a roast*.
So:
- A **roaster "skin"** that visually mirrors the real machine (a Behmor that looks like a Behmor),
  per model/variant — so what's on screen matches what's in front of you.
- **Pre-roast plan mode:** as you press buttons, the app explains *what will happen* ("P5 then
  Start = manual, full power; press A within X s to…") and builds the intended recipe — without
  committing. A safe place to rehearse the confusing manual.
- **Live mode:** the same panel, now logging *actual* presses with timestamps, and showing the
  *current* function of each button (since it differs once roasting). E.g. mum: P5 → Start →
  (first crack) → P3 → crack the door, each logged automatically.
- **Drop / pull-down:** capture how the roast ended (cooling cycle, door crack, dump to tray) —
  some roasters track this, some don't; make it optional but available.

This turns the scariest part (the manual) into a guided, logged experience, and is the natural
home for the per-machine variants (Mark's KKTO, Stuart's Behmor).

---

## Stage 5 — Post-roast: rest, grind, cut (hours → ~2 weeks)
The questions you raised — rest how long? grind fresh? cut/blend when? test single or mixed?

**Today ◐:** colour-corrected photo + roast-colour index; the roast is saved.
**Shipped ✅ (`js/freshness.js`):** the per-roast **rest/peak badge** now counts down ("resting ·
ready in 3 days" → "at peak · 13 days left") and is **brew-aware** — espresso gets a longer rest
window, filter a shorter one, derived from the roast's logged brew method.
**Ideas ✨:**
- **Grind-fresh reminder** is really a brew-time nudge — grind per shot, not ahead. _(see below)_
- **Grind-fresh reminder** is really a brew-time nudge — grind per shot, not ahead.
- **Cut / combine timing** (for post-blend): record when components were combined and the ratio,
  so tasting notes reference the actual cup.
- **Single vs mixed bowl:** let a roast be tasted as a single origin *or* as part of a blend, so
  you can compare "this Ethiopia solo" vs "in the espresso blend."

---

## Stage 6 — Tasting & how it changes over time (days → weeks)
**Today ✅:** flavour wheel + emoji; SCA 100-point **and** SCA CVA (2024) cupping forms; brew log;
trends and side-by-side roast compare.

**Gaps / ideas ✨:**
- **Flavour over time.** The same roast tastes different on day 3 vs day 10. Allow **multiple
  tasting entries per roast** on different dates and chart the arc ("opened up around day 7").
- **Quick taste vs full cupping** — keep the 5-second 👍/😐/🙁 for everyday cups, reserve CVA for
  serious sessions; both feed the same history.

---

## Stage 7 — Optimisation: what to buy next (monthly)
**Today ✅:** consumption & spend dashboard (kg, avg weight-loss, spend).
**The metric you asked about ✨ — "tastiness per dollar".**
- Define **value = tasting score ÷ cost per cup** (cost/kg → cost per ~18 g dose). Rank beans and
  blends on a **value leaderboard**: "Brazil X scores 7.5 at $0.31/cup → best value; the Geisha
  scores 9 but $1.40/cup → treat."
- Feed it back into buying: "re-order these 3 (great value, running low); skip that one."
- Caveat to show honestly: scores are subjective and prices vary by lot — treat it as a guide.

---

## Stage 8 — Solo vs collective (the social layer)
You roast alone, or with/for others (sharing roasted beans, roasting together).
**Today ◐:** foundation exists — the Firebase **auth + shared "spaces"** pilot (a space can own a
pantry/roaster/roasts; opt-in, local-first). Not live yet (needs the console steps).
**Ideas ✨:**
- **Shared roastery space** — a household/collective shares a pantry, roaster profiles, and a
  **roast feed** ("Mum roasted the Guji at 12% loss"); borrowed-bean ledger (Stage 1).
- **Comparative cupping** — several people score the *same* roast; compare palates.
- **Share roasted beans** — log "gave 200 g to Mark," and let Mark log his tasting back.
- Already shippable: the **single-roast share file** (export/import one roast) works backend-free.

---

## Suggested build order (highest value first)
1. ✅ **Roaster profiles + per-roast machine tag, single-roaster by default** — DONE
   (`js/roasters.js`): single-roaster shows no picker; "I use more than one roaster" opts into a
   picker; each roast is tagged with its machine. _(✅ swipe-style personalisation shipped — `js/swipe.js`.)_
2. ✅ **Green-bean freshness + roasted rest/peak clocks + FIFO nudges** — DONE
   (`js/freshness.js`): green age + "roast soon"/"roast this first" in the pantry, rest/peak
   badge per roast in History.
3. ✅ **Blend builder → prep plan** — DONE (`js/blends.js`): ratios → per-component weigh-out
   prep batches; pre/post-blend recorded.
3.5 ✅ **Batch planner** — DONE (`js/planner.js`): "Plan roasts" suggests drum-fitting sizes that
   divide a bag evenly (2.5 kg → 6 × 417 g, no runt) + shows the leftover the usual size leaves.
4. ✅ **Machine-faithful roaster control panel** — DONE (`js/roaster-panel.js`): Behmor panel
   with before-vs-during button reference, **model-aware** (2000AB Plus / 2000AB / 1600 Plus),
   setup guide; **KKTO** heat/airflow + agitator guide with a roast-phase flow. Both log presses
   live. ✅ Behmor sub-model now stored per roaster profile. Follow-up: fuller pre-roast simulation.
5. ✅ **Tastiness-per-dollar value leaderboard** — DONE (`js/value.js`): ranks roasts by cup
   quality per dollar (tasting score ÷ cost per cup), shown in Roast History. Cheap-but-tasty
   beats pricey-but-meh.
6. ✅ **Receipt/invoice quick-add (+ photo)** — DONE (`js/receipts.js`): snap a receipt, add
   several beans at once with the purchase date; photo + purchase record kept. Follow-up: OCR.
7. ✅ **Tasting-over-time (multiple dated entries)** — DONE (`js/tasting.js`): each roast keeps a
   dated tasting log (coffee changes as it rests/ages); the modal shows the history and defaults to
   today; `tastingNotes` stays = the latest for back-compat. _(+ Behmor sub-model now stored on the
   roaster profile — the #4 follow-up.)_
8. ◐ **Collective space** — CODE COMPLETE (`js/sync/`): opt-in cloud sync (email/Google), a
   shared pantry/roastHistory/blends/roasters scoped to a space you can share by email; personal
   calibration stays per-device. Runs on the emulator now; **going live needs the Firebase console
   steps in `GO_LIVE_CHECKLIST.md`.**

Most of 1–3, 5, 7 are local-first and need no backend; 8 builds on the sync pilot.
