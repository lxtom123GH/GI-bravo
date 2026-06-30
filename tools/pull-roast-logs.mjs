// tools/pull-roast-logs.mjs — pull this user's synced Roast Lab captures out of Firestore into the
// local `roast-logs/` folder, so a Claude session can read them directly.
//
// This is the READ half of B8a. It needs a one-time setup you (the owner) do once — Claude can't,
// because it touches your Firebase project:
//
//   1. Firebase console → project `lx-apps` → Project settings → Service accounts →
//      "Generate new private key". Save the JSON somewhere local, e.g. ./.secrets/service-account.json
//      (the `.secrets/` folder is git-ignored — never commit this file).
//   2. Find your user id (uid): sign in to the app, open the Cloud Sync card; or Firebase console →
//      Authentication → your row → User UID.
//   3. Install the admin SDK once:  npm i -D firebase-admin
//   4. Run:
//        GOOGLE_APPLICATION_CREDENTIALS=./.secrets/service-account.json GI_UID=<your-uid> \
//          node tools/pull-roast-logs.mjs
//      (On Windows PowerShell: set the two env vars with $env:NAME='...' first, then `node ...`.)
//
// It writes one JSON per capture to roast-logs/  (which is git-ignored except its README).

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ID = 'gi-bravo';
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'roast-logs');

async function main() {
    const uid = process.env.GI_UID;
    if (!uid) {
        console.error('Set GI_UID to your Firebase user id. See the setup steps at the top of this file.');
        process.exit(1);
    }

    let admin;
    try {
        admin = (await import('firebase-admin')).default;
    } catch {
        console.error('firebase-admin is not installed. Run:  npm i -D firebase-admin');
        process.exit(1);
    }

    // firebase-admin auto-reads GOOGLE_APPLICATION_CREDENTIALS for the service-account key.
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service-account JSON path. See the top of this file.');
        process.exit(1);
    }

    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    const db = admin.firestore();

    const snap = await db.collection(`apps/${APP_ID}/users/${uid}/roastLabSessions`).get();
    if (snap.empty) {
        console.log('No synced Roast Lab captures found. (Turn on "Back up captures to cloud" in the app and roast.)');
        return;
    }

    await mkdir(OUT_DIR, { recursive: true });
    let n = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        const bean = (data?.meta?.bean || 'roast').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const date = data?.meta?.dateStr || 'undated';
        const file = resolve(OUT_DIR, `roastlab-${bean}-${date}-${doc.id.slice(0, 8)}.json`);
        await writeFile(file, JSON.stringify(data, null, 2));
        n++;
        console.log(`  ↓ ${file}`);
    }
    console.log(`Pulled ${n} capture(s) into roast-logs/.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
