# Coffee Roasting Tracker — User Guide

A simple, step-by-step guide to using the app. No technical knowledge needed.

👉 **Open the app:** https://gi-bravo.vercel.app (use **Chrome** or **Edge**).

---

## First-time setup (about 5 minutes)

1. **Open it in Chrome or Edge.** The microphone (used to hear the cracks) only
   works in those browsers, over a secure (https) link — the link above is fine.
2. **Install it (optional but recommended).** Tap the install icon in the address
   bar (desktop) or **Share → Add to Home Screen** (phone). It then opens like a
   normal app and works offline.
3. **Allow the microphone** when the browser asks (the first time you start a roast).
4. **Pick your Mode** (bottom of the left sidebar):
   - **Easy** – just the basics.
   - **Moderate** – recommended starting point (crack times, DTR, flavour notes).
   - **Expert** – everything (temperature/RoR, roast targets, cupping scores).
   You can change this any time, or override it per feature.
5. **Add your beans.** Go to **Bean Pantry → Add New Green Beans**, enter a name
   (and optionally origin, process, and how many grams you have), and **Add to Pantry**.
6. **Your roaster.** On **Active Roast** it shows your machine. If you only use one,
   there's nothing to do. If you use more than one (your machine, a friend's, a
   different Behmor/KKTO), tap **⚙ Manage roasters** → tick *"I use more than one
   roaster"* and add them; pick the active one before each roast and it's tagged on
   the saved roast. (Behmor) set your usual batch size with **Set as default**, and
   switch grams/pounds with the unit dropdown.
7. **Calibrate noise (optional, improves detection).** Tap **Calibrate Noise** and
   stay quiet for 3 seconds so the app learns your room's background noise.

---

## Doing a roast

1. On **Active Roast**, pick the **Beans**, and check the **roaster settings**
   (weight, profile).
2. *(Optional)* Under **Follow reference roast**, pick a previous roast or a saved
   Behmor template to overlay its curve and get a heads-up ~10 s before its cracks.
3. Tap **Start Roast & Listening**. The timer starts and the app listens.
4. **During the roast:**
   - It **automatically detects first and second crack** and logs them. You'll
     hear a beep and see a note in the timeline.
   - If it misses one, tap **Manual: Mark 1st Crack** / **2nd Crack** yourself.
   - Watch the **live timer** and, after first crack, the **DTR** (development ratio).
   - *(Expert)* Type bean temperatures into **Log Temp** as you read them — the app
     works out the Rate of Rise. Or connect a Bluetooth probe to do it automatically.
5. Tap **Stop Roast** when you drop the beans. The roast is **saved to history**
   automatically, and the bean's quantity is reduced by the batch weight.

> Tip: if it's detecting too many or too few cracks, open **Detection Settings**
> and adjust the **sensitivity** slider, then try again next roast.

---

## After the roast

Go to **Roast History** and find the roast (newest first):

1. **Log Roasted Weight** – weigh the cooled beans and enter the grams to get your
   **weight-loss %** (a key consistency number; usually 12–20%).
2. **Edit Notes** – record how it tasted. Depending on your Mode this is a simple
   👍/😐/🙁, the flavour wheel, or full cupping scores + brew details.
3. **Add Photo** – snap the roasted beans. For a colour reading you can compare
   between batches, use **Add Colour-Corrected Photo** (with a grey card),
   **Add ColorChecker Photo**, or **Add Custom-Target Photo** (a cheap DIY swatch
   card you calibrate once under daylight — see below).
4. **Export** – copy a summary to the clipboard, or export a **CSV** for spreadsheets.

### DIY custom colour target

Don't have a ColorChecker? Make a swatch card with **4–6 paint chips** (a neutral
grey ramp — white, light grey, mid grey, near-black — is most reliable; add a warm
and a cool chip for better colour). Then in **Add Custom-Target Photo**:

1. Choose **＋ Calibrate new target…**, name it, set the grid (columns × rows), shoot
   the card under **good neutral daylight**, and tap the 4 corner patches. This stores
   each patch's colour as the baseline — do it once.
2. From then on, pick your saved target, **re-shoot the card next to your beans** under
   whatever light you have, tap the 4 corners, add the beans photo, and **Process**.
   The app corrects the beans back to the daylight baseline.

The reading is **relative but repeatable** — great for comparing your own roasts, not
an official Agtron number.

---

## Ongoing use

- **Freshness & FIFO:** the **Bean Pantry** shows how long ago each bean was bought,
  flags old lots ("roast soon"), and marks the **oldest in stock** to *roast this first*.
  In **Roast History**, each roast shows a freshness badge — *resting* for the first few
  days, then *ready (peak)* for roughly 1–3 weeks, then *past peak*.
- **Add a whole receipt at once:** in **Bean Pantry → Quick-add from receipt**, snap the receipt
  (optional), set the date, and add each bean (name, grams, $/kg) in one go — they all land in your
  pantry with that purchase date, and the photo is kept under **Recent purchases** so you can check
  what you paid later.
- **Plan your roasts:** on a bean in the **Bean Pantry**, tap **Plan roasts** — it suggests
  roast sizes that fit your roaster's drum *and* divide your bag evenly (e.g. a 2.5 kg bag →
  6 × 417 g with nothing left over), and shows the leftover your usual size would leave. Roast
  about what you'll drink in ~2 weeks.
- **Blends:** in **Bean Pantry → Blends**, build a recipe (e.g. 60% Colombia · 40% Brazil),
  choose *pre-blend* (roast together) or *post-blend* (roast each, combine after), then
  **Weigh out** a batch — the app splits it into per-bean prep batches ready to roast. If you
  set each bean's optional **density** and **size**, a *pre-blend* warns when beans differ too
  much to roast evenly together (use post-blend instead).
- **Roaster capacity:** each roaster has a drum min/max (Behmor ≈ 100–454 g) used by **Plan
  roasts**. Set your own under **⚙ Manage roasters** when adding a machine (a KKTO build, a
  friend's roaster, etc.).
- **Control panel (your machine):** on **Active Roast**, the 🎛️ panel guides your roaster. For a
  **Behmor** it shows what each button does *before* vs *during* a roast (they change!) — pick your
  model (2000AB Plus / 2000AB / 1600 Plus) as they differ. For a **KKTO** it explains heat, airflow
  and the agitator plus a roast-phase flow (charge → drying → first crack → drop), since the KKTO is
  manual. Once a roast starts both switch to **live mode**: tap what you change (Behmor: heat P1–P5,
  add-time C, drum D, Cool / KKTO: heat ↑↓, airflow ↑↓, drop) and it's logged with timestamps.
- **Reproduce a good roast:** save it as a **Behmor template** (or pick it under
  *Follow reference roast*) so next time the app guides you with its curve and
  crack timing.
- **Compare two batches:** **Roast History → Compare Roasts** overlays their curves
  and shows the numbers side by side.
- **See your progress:** the **Trends** chart plots DTR, times, or roast colour
  across all your roasts.
- **Find your best value:** **Roast History → Best value** ranks your roasts by cup
  quality per dollar (your tasting score ÷ the bean's cost per cup) — a cheap, tasty
  bean can out-rank an expensive one. Add a tasting score and a bean cost to see it.
- **Tasting over time:** in a roast's **Edit Notes**, the **Tasting date** defaults to today —
  taste again a week or two later and save with the new date to build a little timeline of how
  the coffee changes as it rests. The card shows “📈 N tastings over time”.
- **Your Behmor model:** when you add a Behmor under **⚙ Manage roasters** you can pick the exact
  model (2000AB Plus / 2000AB / 1600 Plus); each machine remembers its own, so the control panel
  shows the right button behaviour.
- **Make the screen yours:** tap **👆 Personalise by swiping** (on Active Roast under “Customise
  this screen”, or in Help) and swipe each optional control **right to keep / left to hide** — a
  quick way to declutter. You can redo it any time, or fine-tune with the checkboxes.
- **Back up your data (important!):** everything lives only in your browser. Use
  **Roast History → Data Backup → Export Backup** every so often to save a file
  (tick *Include photos* if you want them too). **Import** it to restore or to move
  to another device.

---

## Quick troubleshooting

| Problem | Fix |
| --- | --- |
| Mic / "allow permissions" error | Use Chrome or Edge, and the `https://` link (not a saved file). Allow the mic when asked. |
| Too many / too few cracks detected | **Detection Settings** → lower/raise **sensitivity**; **Calibrate Noise** first; reduce background noise. |
| Second crack not detected | It needs higher-pitched, faster cracking ~20 s+ after first crack — or mark it manually. |
| My data disappeared | It's per-browser/device and is cleared if you wipe browser data — keep **backups**. |
| Bluetooth probe won't connect | Chrome/Edge only; make sure the probe is powered on (see `HARDWARE_GUIDE.md`). |

---

For the full feature list and developer info see [README.md](README.md);
for the DIY temperature probe see [HARDWARE_GUIDE.md](HARDWARE_GUIDE.md).
