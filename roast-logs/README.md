# roast-logs/ — Roast Lab capture drop folder

This folder is a **drop zone for Roast Lab exports** so they can be read directly from the
repo (e.g. by Claude Code in a local session) without copy-pasting big files into chat.

## How it works
1. In the app: **Roast → Detection settings → 🧪 Roast Lab — capture this roast's data** (turn on).
2. Run your roast normally. Mark/clear cracks as usual — they're recorded as events.
3. After the roast, hit **Export JSON** (or **Export CSV**) in that same panel.
4. Save the downloaded file **into this folder** (`roast-logs/`).
5. Next session, just say "read the latest file in roast-logs/ and analyse it".

JSON = full fidelity (best for analysis). CSV = opens in a spreadsheet for eyeballing the
numbers around each crack. The **Copy summary** button puts a one-line recap on your clipboard
for a quick paste. On a phone/tablet, **📤 Share capture** sends the file straight to Mail/AirDrop/Files.

## Pulling captures from the cloud (optional — B8a)
If you tick **☁️ Back up captures to cloud** in the Roast Lab panel (signed in), captures sync to
your account and collect across devices. To pull them into this folder, run
`node tools/pull-roast-logs.mjs` — see the setup steps at the top of that script (it needs a one-time
Firebase service-account key, kept in the git-ignored `.secrets/`).

## What's in a capture
- `meta` — bean, roaster, sample rate, the detection settings used, timestamps.
- `frames[]` — `{ t (ms), rms, bandRatio, mfcc[] }` sampled ~2×/second.
- `events[]` — `{ t, type: 'crack' | 'clear', label, auto }` from auto-detection and your taps.

## Note
Everything dropped here is **git-ignored** (except this README) — captures are personal roast
data and debug artifacts, not source. Delete them whenever you like.
