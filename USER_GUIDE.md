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
6. **Set your roaster.** On **Active Roast**, choose **Behmor** or **KKTO**, and
   (Behmor) your usual batch size — tap **Set as default** so it's pre-selected
   next time. Switch grams/pounds with the unit dropdown.
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

- **Reproduce a good roast:** save it as a **Behmor template** (or pick it under
  *Follow reference roast*) so next time the app guides you with its curve and
  crack timing.
- **Compare two batches:** **Roast History → Compare Roasts** overlays their curves
  and shows the numbers side by side.
- **See your progress:** the **Trends** chart plots DTR, times, or roast colour
  across all your roasts.
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
