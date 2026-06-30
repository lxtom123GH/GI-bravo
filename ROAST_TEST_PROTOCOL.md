# Roast Test Protocol — capturing detection data across a few roasts

A practical, read-it-on-the-day guide for a **detection test session** (e.g. this weekend's 3 roasts).
The goal is to **capture good labelled data** so we can evaluate — and eventually build — a smarter
crack detector. Keep this open on your phone while you roast.

> **What this is NOT:** you are *not* testing a finished "v2 detector" today — one doesn't exist yet.
> Today you (a) test the **current** detector live, and (b) **record** the experimental signals
> (shadow detectors + MFCC features) so they can be analysed afterward. The real win is the data.

---

## ⏱️ 60-second version

1. **Before:** Detection settings → turn **🧪 Roast Lab** ON. (Optional, multi-device: sign in on each
   device + tick **☁️ Back up captures to cloud**.)
2. **Every roast:** roast normally, and **mark the truth** — tap **✗ / Clear** on any false crack,
   **Manual: Mark** on any crack it missed. This marking *is* the data.
3. **Vary across the 3 roasts** (see the table) so we get a spread.
4. **After each roast:** **📤 Share capture** (or Export JSON) → save it, or let the cloud collect it.
5. **After all 3:** drop the files in `roast-logs/` (or I pull them from the cloud) and tell me.

That's it. Everything below is detail.

---

## Why we're doing this

The current detector keys off loudness + crack pitch. Research says **MFCC timbre features** are likely
a bigger accuracy win. To know — and to train anything — we need **roast audio paired with the truth of
when cracks actually happened**. You're the only one with the mic and the real cracks, so this session
is how that labelled dataset gets made. More roasts + more devices = more data from the same beans.

---

## Before you start

- **One device, minimum:** open the app, go to **Active Roast → Detection settings**, turn on
  **🧪 Roast Lab — capture this roast's data**. (Turning this on also runs the **shadow detector bank**
  automatically — several differently-tuned detectors that quietly log what they *would* have called.
  They never beep or change anything.)
- **Multi-device (recommended — multiplies the data):** run the app on as many devices as you can
  (e.g. two phones + an iPad), each near the roaster but in a slightly different spot. On **each**:
  turn on Roast Lab. If you want them to collect automatically, **sign in** on each device and tick
  **☁️ Back up captures to cloud**; otherwise you'll Share/export from each device after the roast.
- **Mic:** the app uses the device's default mic. A plugged-in or paired mic works if it's the system
  default. Use **Start Roast & Listening** (not "Start (no mic)") so detection runs.
- **Keep the screen on / stay on the roast screen** — detection pauses if the phone locks or you switch
  apps. (The app keeps the screen awake, but don't lock it.)

---

## The 3-roast protocol (vary one thing at a time)

| Roast | What to change | Why |
|---|---|---|
| **1 — Baseline** | Roast Lab ON. Roast exactly as you normally would. Mark every missed/false crack. | A clean baseline of the current detector + a labelled capture. |
| **2 — Watch the signals** | Also turn on **🧪 Compute MFCC features** (Detection settings) so the live readout moves; glance at it around 1C/2C. Capture again. | Lets you *see* the timbre signal at the cracks; same labelled capture. |
| **3 — Nudge detection** | Flip one detection tweak — turn on **Auto-tune from my corrections**, *or* nudge the **sensitivity** slider — then roast + capture. | Shows how a tuning change moves the live detector vs the recorded shadow variants. |

Keep everything else the same between roasts (same bean if you can, same setup) so the one change is the
only variable. If a roast goes sideways, no problem — just note it; the capture is still useful.

---

## During every roast — the part that matters most

The captured **marks are the ground truth** the whole analysis depends on, so be diligent:

- **Heard a crack the app missed?** → tap **Manual: Mark**.
- **App flagged a crack that wasn't real?** → tap **✗ / Clear**.
- Don't worry about being perfect to the millisecond — honest, consistent marking is what counts.
- Garbage-in applies hard here: clean marking → a usefully trainable dataset; sloppy marking → noise.

You don't need to watch the shadow detectors or MFCCs — they record themselves. Just roast and mark.

---

## After each roast — collect the capture

In the Roast Lab panel (Detection settings):

- **📤 Share capture** — best on a phone/tablet: opens the share sheet → Mail it to yourself, AirDrop to
  your Mac, or Save to Files. Easiest way to gather captures off several devices.
- **Export JSON** — full detail (best for analysis). **Export CSV** — opens in a spreadsheet.
- **☁️ cloud backup on?** Then there's nothing to do — the capture syncs to your account automatically.

Do this on **every device** after **every roast** (so 3 roasts × N devices = 3N captures).

---

## After all three roasts — hand it over

- **File route:** put all the exported/shared files into the repo's **`roast-logs/`** folder, then tell
  me "read the captures in roast-logs/ and analyse them."
- **Cloud route:** if you used cloud backup, once you've given me the one-time service-account key I can
  **pull them straight from Firestore** (`node tools/pull-roast-logs.mjs`) — no manual file shuffling.

Then I compare **current detector vs each shadow variant vs your marks**, and check whether MFCCs
separate cracks from noise on your KKTO. That verdict decides whether a real (trained) v2 detector is
worth building — which would be tested on a *later* roast, not this one.

---

## Quick troubleshooting

- **"Start" did nothing / mic error:** the status bar shows why. On iPhone/iPad use **Safari** and allow
  the mic; on desktop use Chrome/Edge over the https link.
- **Roast seems to pause:** you probably locked the phone or switched apps — stay on the roast screen;
  use **Manual: Mark** for anything missed while away.
- **Export button greyed out:** you need at least one captured roast first (Roast Lab on during a roast).

See also: the in-app **Help** tab (Roast Lab + shadow-detector entries) and `USER_GUIDE.md`.
