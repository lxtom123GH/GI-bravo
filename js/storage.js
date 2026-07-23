// --- Data Persistence ---

import { drawDownLots, syncBeanFromLots } from './lots.js';

export function getPantry() {
    const pantry = localStorage.getItem('coffeePantry');
    return pantry ? JSON.parse(pantry) : [];
}

export function savePantry(pantry) {
    localStorage.setItem('coffeePantry', JSON.stringify(pantry));
}

export function addBeanToPantry(bean) {
    const pantry = getPantry();
    bean.id = Date.now().toString(); // simple unique ID
    if (!bean.purchasedAt) bean.purchasedAt = Date.now(); // for green-bean age / FIFO
    pantry.push(bean);
    savePantry(pantry);
    return bean;
}

// Patch arbitrary fields on a pantry bean by id (e.g. supplier / re-order link). Returns
// the bean, or null if it no longer exists.
export function updateBean(id, patch) {
    const pantry = getPantry();
    const bean = pantry.find(b => b.id === id);
    if (!bean) return null;
    Object.assign(bean, patch);
    savePantry(pantry);
    return bean;
}

// Add a borrowed/lent ledger entry to a bean (entry: { dir, who, grams, note? }). Stamps an id
// + date. The ledger lives on the bean, so JSON backup already covers it. Returns the bean.
export function addBeanLedgerEntry(beanId, entry) {
    const pantry = getPantry();
    const bean = pantry.find(b => b.id === beanId);
    if (!bean) return null;
    if (!Array.isArray(bean.ledger)) bean.ledger = [];
    bean.ledger.push({ id: 'led-' + Date.now().toString(), date: new Date().toISOString(), ...entry });
    savePantry(pantry);
    return bean;
}

// Remove a ledger entry from a bean by entry id. Returns the bean.
export function deleteBeanLedgerEntry(beanId, entryId) {
    const pantry = getPantry();
    const bean = pantry.find(b => b.id === beanId);
    if (!bean || !Array.isArray(bean.ledger)) return null;
    bean.ledger = bean.ledger.filter(e => e.id !== entryId);
    savePantry(pantry);
    return bean;
}

export function deleteBeanFromPantry(id) {
    let pantry = getPantry();
    pantry = pantry.filter(b => b.id !== id);
    savePantry(pantry);
}

// Adjust a bean's on-hand quantity (grams) by delta, clamped at 0.
// Returns the new quantity, or null if the bean no longer exists.
// Lot-aware: if the bean tracks lots, a decrease draws down the FEFO-first lots
// (oldest / soonest-to-expire used first) and a top-up grows the most recent lot,
// then quantity/cost are re-derived from the lots. A flat (pre-lots) bean keeps the
// simple running-total behaviour.
export function adjustBeanQuantity(id, deltaGrams) {
    const pantry = getPantry();
    const bean = pantry.find(b => b.id === id);
    if (!bean) return null;
    if (Array.isArray(bean.lots) && bean.lots.length) {
        if (deltaGrams < 0) {
            bean.lots = drawDownLots(bean.lots, -deltaGrams);
        } else if (deltaGrams > 0) {
            const newest = bean.lots.reduce((a, b) => ((b.date || 0) > (a.date || 0) ? b : a));
            newest.grams = (Number(newest.grams) || 0) + deltaGrams;
        }
        syncBeanFromLots(bean);
    } else {
        bean.quantity = Math.max(0, (Number(bean.quantity) || 0) + deltaGrams);
    }
    savePantry(pantry);
    return bean.quantity;
}

// Add a green lot to a bean (a dated, optionally priced/best-before purchase). The first
// lot added to a previously-flat bean folds its existing on-hand grams into an implicit
// lot so nothing is lost. Re-derives quantity/cost from the lots. Returns the bean.
export function addLotToBean(id, lot) {
    const pantry = getPantry();
    const bean = pantry.find(b => b.id === id);
    if (!bean) return null;
    if (!Array.isArray(bean.lots) || !bean.lots.length) {
        // Migrate the flat on-hand grams into a first lot, then add the new one.
        bean.lots = (Number(bean.quantity) || 0) > 0
            ? [{ id: 'l-' + Date.now().toString(), grams: Number(bean.quantity), date: bean.purchasedAt || null, price: Number(bean.costPerKg) || 0 }]
            : [];
    }
    bean.lots.push({ id: 'l-' + Date.now().toString() + '-' + bean.lots.length, ...lot });
    syncBeanFromLots(bean);
    savePantry(pantry);
    return bean;
}

// Remove a single lot from a bean by lot id, re-deriving on-hand grams/cost. Returns the bean.
export function deleteLotFromBean(beanId, lotId) {
    const pantry = getPantry();
    const bean = pantry.find(b => b.id === beanId);
    if (!bean || !Array.isArray(bean.lots)) return null;
    bean.lots = bean.lots.filter(l => l.id !== lotId);
    syncBeanFromLots(bean);
    savePantry(pantry);
    return bean;
}

export function getRoastHistory() {
    const history = localStorage.getItem('roastHistory');
    return history ? JSON.parse(history) : [];
}

export function saveRoastToHistory(roast) {
    const history = getRoastHistory();
    roast.id = Date.now().toString();
    history.push(roast);
    saveRoastHistory(history);
    return roast;
}

export function saveRoastHistory(history) {
    localStorage.setItem('roastHistory', JSON.stringify(history));
}

export function updateRoastInHistory(roast) {
    const history = getRoastHistory().map(r => r.id === roast.id ? roast : r);
    saveRoastHistory(history);
}

export function deleteRoastFromHistory(id) {
    const history = getRoastHistory().filter(r => r.id !== id);
    saveRoastHistory(history);
}

// Adjust how much ROASTED coffee is left from a roast (e.g. drank a brew, finished a bag),
// clamped to [0, roasted yield]. Sets roastedRemainingG on the roast. Deliberately simple —
// roasted stock is just grams + days-since-roast, no lots. Returns the new remaining, or null.
export function adjustRoastedRemaining(id, deltaGrams) {
    const history = getRoastHistory();
    const roast = history.find(r => r.id === id);
    if (!roast) return null;
    const full = Number(roast.roastedWeightG) || 0;
    const current = (roast.roastedRemainingG === undefined || roast.roastedRemainingG === null)
        ? full
        : Number(roast.roastedRemainingG) || 0;
    roast.roastedRemainingG = Math.max(0, Math.min(full, current + deltaGrams));
    saveRoastHistory(history);
    return roast.roastedRemainingG;
}

// Draw roasted stock down AND record where it went (brewed / gift / cupping / other) on the
// roast's usageLog — a light "what did I do with it" trail. Grams are clamped to what's left
// (you can't use more than you have). Returns the new remaining, or null if the roast is gone.
// usageLog lives on the roast in roastHistory, so it's already covered by export/import backup.
export function logRoastedUsage(id, grams, where = 'brewed', note = '') {
    const history = getRoastHistory();
    const roast = history.find(r => r.id === id);
    if (!roast) return null;
    const full = Number(roast.roastedWeightG) || 0;
    const current = (roast.roastedRemainingG === undefined || roast.roastedRemainingG === null)
        ? full
        : Number(roast.roastedRemainingG) || 0;
    const used = Math.max(0, Math.min(current, Number(grams) || 0));
    roast.roastedRemainingG = current - used;
    if (used > 0) {
        if (!Array.isArray(roast.usageLog)) roast.usageLog = [];
        roast.usageLog.push({ date: new Date().toISOString(), grams: used, where: where || 'other', note: note || '' });
    }
    saveRoastHistory(history);
    return roast.roastedRemainingG;
}

// --- Detection Settings ---

export const DEFAULT_DETECTION_SETTINGS = {
    thresholdMultiplier: 1.5, // spike must exceed baseline noise by this factor (lower = more sensitive)
    cracksRequired: 3,        // snaps within the cluster window needed to confirm a crack phase
    secondCrackPitch: 0.5,    // high-band energy share above which cracking reads as second crack
    calibrationSeconds: 8,    // how long Calibrate Noise samples the room (longer catches intermittent talking)
    autoCalibrate: true,      // rolling pre-roast noise floor (only runs once the mic is already permitted)
    min1cMinutes: 0           // optional ROEST-style time prior: ignore crack-like sounds before N minutes (0 = off)
};

export function getDetectionSettings() {
    const stored = localStorage.getItem('detectionSettings');
    return stored
        ? { ...DEFAULT_DETECTION_SETTINGS, ...JSON.parse(stored) }
        : { ...DEFAULT_DETECTION_SETTINGS };
}

export function saveDetectionSettings(settings) {
    localStorage.setItem('detectionSettings', JSON.stringify(settings));
}

// --- Per-roaster detection learning (v1: adaptive sensitivity, opt-in) ---
// Off by default — existing detection is untouched unless the user enables it.
// The learned offset is stored per roaster id so each machine tunes separately.

export function getDetectionLearningEnabled() {
    return localStorage.getItem('detectionLearningEnabled') === 'true';
}

export function saveDetectionLearningEnabled(on) {
    localStorage.setItem('detectionLearningEnabled', on ? 'true' : 'false');
}

// Experimental MFCC feature extraction — OFF by default. When on, MFCCs are computed alongside
// the existing detector for comparison; it does NOT change crack-detection decisions.
export function getMfccExperimentalEnabled() {
    return localStorage.getItem('mfccExperimentalEnabled') === 'true';
}

export function saveMfccExperimentalEnabled(on) {
    localStorage.setItem('mfccExperimentalEnabled', on ? 'true' : 'false');
}

// Roast Lab — OFF by default. When on, each roast records a feature timeline (RMS, high-band
// ratio, MFCCs) + crack/clear events for offline A/B analysis. Observational; never affects
// detection. The last captured session is kept locally so it can be exported after the roast;
// it's a debug artifact and is intentionally NOT part of the cross-device backup (it can be
// large) — only the toggle is backed up.
export function getRoastLabEnabled() {
    return localStorage.getItem('roastLabEnabled') === 'true';
}

export function saveRoastLabEnabled(on) {
    localStorage.setItem('roastLabEnabled', on ? 'true' : 'false');
}

export function saveLastRoastLab(session) {
    try {
        localStorage.setItem('lastRoastLab', JSON.stringify(session));
    } catch (e) {
        // Quota or serialisation failure — the in-memory session still exports fine.
        console.warn('[roastlab] could not persist last session:', e && e.message);
    }
}

export function getLastRoastLab() {
    const raw = localStorage.getItem('lastRoastLab');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

// --- Roast Lab cloud sync (opt-in, default OFF) -------------------------------
// When on, finalized captures are appended to a small capped list that the sync layer treats as a
// personal collection (so they auto-collect across the user's signed-in devices and can be read
// straight from Firestore). Default OFF because captures are large — never upload without consent.
export function getRoastLabCloudSyncEnabled() {
    return localStorage.getItem('roastLabCloudSyncEnabled') === 'true';
}

export function saveRoastLabCloudSyncEnabled(on) {
    localStorage.setItem('roastLabCloudSyncEnabled', on ? 'true' : 'false');
}

// Keep only the most recent N captures — they're large, and this is a debug/analysis trail, not an
// archive. Each record carries its own `id` + `updatedAt` so the sync reconcile can merge by id.
export const ROAST_LAB_SESSIONS_MAX = 6;

export function getRoastLabSessions() {
    const raw = localStorage.getItem('roastLabSessions');
    if (!raw) return [];
    try { const list = JSON.parse(raw); return Array.isArray(list) ? list : []; }
    catch { return []; }
}

export function saveRoastLabSessions(list) {
    const capped = (Array.isArray(list) ? list : []).slice(-ROAST_LAB_SESSIONS_MAX);
    try { localStorage.setItem('roastLabSessions', JSON.stringify(capped)); }
    catch (e) { console.warn('[roastlab] could not persist sessions list:', e && e.message); }
}

// Append a finalized capture (already tagged with id + updatedAt) to the capped list.
export function appendRoastLabSession(record) {
    if (!record || !record.id) return;
    const list = getRoastLabSessions().filter(r => r && r.id !== record.id);
    list.push(record);
    saveRoastLabSessions(list);
}

export function getRoasterDetectionAdjust() {
    const s = localStorage.getItem('roasterDetectionAdjust');
    return s ? JSON.parse(s) : {};
}

export function saveRoasterDetectionAdjust(map) {
    localStorage.setItem('roasterDetectionAdjust', JSON.stringify(map || {}));
}

export function getDetectionAdjustFor(roasterId) {
    return getRoasterDetectionAdjust()[roasterId] || null;
}

export function saveDetectionAdjustFor(roasterId, adjust) {
    if (!roasterId) return;
    const map = getRoasterDetectionAdjust();
    map[roasterId] = adjust;
    saveRoasterDetectionAdjust(map);
}

export function clearDetectionAdjustFor(roasterId) {
    const map = getRoasterDetectionAdjust();
    delete map[roasterId];
    saveRoasterDetectionAdjust(map);
}

// --- Roast Targets (alarms) ---

export const DEFAULT_ROAST_TARGETS = {
    totalMinutes: 0, // 0 = disabled
    dtrPercent: 0    // 0 = disabled
};

export function getRoastTargets() {
    const stored = localStorage.getItem('roastTargets');
    return stored
        ? { ...DEFAULT_ROAST_TARGETS, ...JSON.parse(stored) }
        : { ...DEFAULT_ROAST_TARGETS };
}

export function saveRoastTargets(targets) {
    localStorage.setItem('roastTargets', JSON.stringify(targets));
}

// --- Complexity tier (Easy / Moderate / Expert) ---

const TIERS = ['easy', 'moderate', 'expert'];

export function getTier() {
    const t = localStorage.getItem('complexityTier');
    return TIERS.includes(t) ? t : 'moderate';
}

export function saveTier(tier) {
    if (TIERS.includes(tier)) localStorage.setItem('complexityTier', tier);
}

// Per-feature tier overrides: { dashboard?: tier, tasting?: tier }.
// A missing/empty value means the feature inherits the global tier.
export function getFeatureTiers() {
    const s = localStorage.getItem('featureTiers');
    return s ? JSON.parse(s) : {};
}

export function saveFeatureTiers(obj) {
    localStorage.setItem('featureTiers', JSON.stringify(obj || {}));
}

export function getFeatureTier(feature) {
    const t = getFeatureTiers()[feature];
    return TIERS.includes(t) ? t : null;
}

export function setFeatureTier(feature, tier) {
    const obj = getFeatureTiers();
    if (TIERS.includes(tier)) obj[feature] = tier;
    else delete obj[feature];
    saveFeatureTiers(obj);
}

// The tier in effect for a feature: its override if set, else the global tier.
export function getEffectiveTier(feature) {
    return getFeatureTier(feature) || getTier();
}

// --- Weight unit + default batch size ---

export function getWeightUnit() {
    return localStorage.getItem('weightUnit') === 'imperial' ? 'imperial' : 'metric';
}

export function saveWeightUnit(unit) {
    localStorage.setItem('weightUnit', unit === 'imperial' ? 'imperial' : 'metric');
}

// Default Behmor batch size, stored as the machine setting key ('100' | '200' | '400').
// Falls back to 400 (and migrates older '1/4'|'1/2'|'1' values that no longer exist).
export function getDefaultWeight() {
    const w = localStorage.getItem('defaultWeight');
    return ['100', '200', '400'].includes(w) ? w : '400';
}

export function saveDefaultWeight(w) {
    localStorage.setItem('defaultWeight', w);
}

// Remember the last green weight entered (e.g. a usual 450 g roast) so it prefills
// next time and isn't wiped when a batch-size button is tapped.
export function getLastGreenWeight() {
    const g = parseFloat(localStorage.getItem('lastGreenWeight'));
    return isNaN(g) || g <= 0 ? null : g;
}

export function saveLastGreenWeight(g) {
    if (g > 0) localStorage.setItem('lastGreenWeight', String(g));
}

// --- Behmor profile reference templates (keyed by "profile|weight") ---

export function getBehmorTemplates() {
    const s = localStorage.getItem('behmorTemplates');
    return s ? JSON.parse(s) : {};
}

export function saveBehmorTemplates(obj) {
    localStorage.setItem('behmorTemplates', JSON.stringify(obj || {}));
}

const behmorKey = (profile, weight) => `${profile}|${weight}`;

// Exact profile+weight match, else fall back to any template for that profile.
export function getBehmorTemplate(profile, weight) {
    const o = getBehmorTemplates();
    if (o[behmorKey(profile, weight)]) return o[behmorKey(profile, weight)];
    const k = Object.keys(o).find(key => key.startsWith(`${profile}|`));
    return k ? o[k] : null;
}

export function saveBehmorTemplate(profile, weight, data) {
    const o = getBehmorTemplates();
    o[behmorKey(profile, weight)] = { ...data, profile, weight };
    saveBehmorTemplates(o);
}

export function deleteBehmorTemplate(profile, weight) {
    const o = getBehmorTemplates();
    delete o[behmorKey(profile, weight)];
    saveBehmorTemplates(o);
}

// --- Manual roast profiles (recorded power-change recipes), keyed by id ---

export function getManualProfiles() {
    const s = localStorage.getItem('manualProfiles');
    return s ? JSON.parse(s) : {};
}

export function saveManualProfiles(obj) {
    localStorage.setItem('manualProfiles', JSON.stringify(obj || {}));
}

export function saveManualProfile(profile) {
    const o = getManualProfiles();
    o[profile.id] = profile;
    saveManualProfiles(o);
}

export function deleteManualProfile(id) {
    const o = getManualProfiles();
    delete o[id];
    saveManualProfiles(o);
}

// --- Temperature unit preference ---

export function getTempUnit() {
    return localStorage.getItem('tempUnit') || 'C';
}

export function saveTempUnit(unit) {
    localStorage.setItem('tempUnit', unit === 'F' ? 'F' : 'C');
}

// --- Reference colour samples (optional self-calibrated white-balance targets) ---

export function getReferenceSamples() {
    const s = localStorage.getItem('referenceSamples');
    return s ? JSON.parse(s) : [];
}

export function saveReferenceSamples(list) {
    localStorage.setItem('referenceSamples', JSON.stringify(list));
}

export function addReferenceSample(sample) {
    const list = getReferenceSamples();
    sample.id = Date.now().toString();
    list.push(sample);
    saveReferenceSamples(list);
    return sample;
}

export function deleteReferenceSample(id) {
    saveReferenceSamples(getReferenceSamples().filter(s => s.id !== id));
}

// --- Custom colour-correction targets (self-calibrated DIY multi-patch charts) ---
// Each target: { id, name, cols, rows, reference: [[r,g,b], ...] } where reference
// holds the patch colours (sRGB 0..255) measured once under good daylight, in
// row-major order (length === cols * rows). Used to fit a full CCM against a cheap
// DIY swatch card that has no published reference values.

export function getColorTargets() {
    const s = localStorage.getItem('colorTargets');
    return s ? JSON.parse(s) : [];
}

export function saveColorTargets(list) {
    localStorage.setItem('colorTargets', JSON.stringify(list));
}

export function addColorTarget(target) {
    const list = getColorTargets();
    target.id = Date.now().toString();
    list.push(target);
    saveColorTargets(list);
    return target;
}

export function deleteColorTarget(id) {
    saveColorTargets(getColorTargets().filter(t => t.id !== id));
}

// --- Roaster profiles (a person's actual machine(s)) ---
// Each: { id, model: 'behmor' | 'kkto', name }. Single-roaster mode (default) keeps the
// common case frictionless; multi mode shows a picker and tags each roast with the machine.

export function getRoasters() {
    const s = localStorage.getItem('roasters');
    const list = s ? JSON.parse(s) : [];
    // Seed a sensible default the first time so the dashboard always has a roaster.
    if (!list.length) {
        const def = { id: 'r-default', model: 'behmor', name: 'My Behmor' };
        saveRoasters([def]);
        return [def];
    }
    return list;
}

export function saveRoasters(list) {
    localStorage.setItem('roasters', JSON.stringify(list));
}

export function addRoaster(r) {
    const list = getRoasters();
    r.id = 'r-' + Date.now().toString();
    list.push(r);
    saveRoasters(list);
    return r;
}

export function deleteRoaster(id) {
    const list = getRoasters().filter(r => r.id !== id);
    saveRoasters(list);
    if (getActiveRoasterId() === id) saveActiveRoasterId(list[0] ? list[0].id : null);
}

// Patch a roaster's fields by id (e.g. its Behmor sub-model, capacity).
export function updateRoaster(id, patch) {
    const list = getRoasters();
    const r = list.find(x => x.id === id);
    if (!r) return null;
    Object.assign(r, patch);
    saveRoasters(list);
    return r;
}

export function getRoasterMode() {
    return localStorage.getItem('roasterMode') === 'multi' ? 'multi' : 'single';
}

export function saveRoasterMode(mode) {
    localStorage.setItem('roasterMode', mode === 'multi' ? 'multi' : 'single');
}

export function getActiveRoasterId() {
    return localStorage.getItem('activeRoasterId');
}

export function saveActiveRoasterId(id) {
    if (id) localStorage.setItem('activeRoasterId', id);
    else localStorage.removeItem('activeRoasterId');
}

// The roaster currently in use (active id, else first). Always returns a usable object.
export function getActiveRoaster() {
    const list = getRoasters();
    const id = getActiveRoasterId();
    return list.find(r => r.id === id) || list[0];
}

// --- Roast prep batches (weighed-out portions with a photo) ---
// Each batch: { id, beanId, beanName, grams, photo (downscaled dataURL), note, createdAt }.
// Lets the user portion green beans into containers, snap a photo to tell them apart,
// then load the bean + weight onto the Active Roast screen in one tap.

export function getPrepBatches() {
    const s = localStorage.getItem('prepBatches');
    return s ? JSON.parse(s) : [];
}

export function savePrepBatches(list) {
    localStorage.setItem('prepBatches', JSON.stringify(list));
}

export function addPrepBatch(batch) {
    const list = getPrepBatches();
    batch.id = Date.now().toString();
    batch.createdAt = Date.now();
    list.push(batch);
    savePrepBatches(list);
    return batch;
}

export function deletePrepBatch(id) {
    savePrepBatches(getPrepBatches().filter(b => b.id !== id));
}

// --- Purchases (receipt/invoice quick-add) ---
// Each: { id, date, total, items: [{ name, grams, costPerKg }], note }. An optional receipt
// photo is stored in IndexedDB under photo id `purchase-<id>` (js/photos.js).

export function getPurchases() {
    const s = localStorage.getItem('purchases');
    return s ? JSON.parse(s) : [];
}

export function savePurchases(list) {
    localStorage.setItem('purchases', JSON.stringify(list));
}

export function addPurchase(p) {
    const list = getPurchases();
    p.id = p.id || ('p-' + Date.now().toString());
    list.unshift(p); // newest first
    savePurchases(list);
    return p;
}

export function deletePurchase(id) {
    savePurchases(getPurchases().filter(p => p.id !== id));
}

// --- Blend recipes ---
// Each: { id, name, type: 'pre' | 'post', components: [{ beanId, beanName, pct }], note }.
// "Weigh out" a blend turns the ratios into per-component prep batches.

export function getBlends() {
    const s = localStorage.getItem('blends');
    return s ? JSON.parse(s) : [];
}

export function saveBlends(list) {
    localStorage.setItem('blends', JSON.stringify(list));
}

export function addBlend(blend) {
    const list = getBlends();
    blend.id = Date.now().toString();
    list.push(blend);
    saveBlends(list);
    return blend;
}

export function deleteBlend(id) {
    saveBlends(getBlends().filter(b => b.id !== id));
}

// --- Backup / Restore ---

export function exportAllData() {
    return {
        version: 2,
        exportedAt: new Date().toISOString(),
        pantry: getPantry(),
        roastHistory: getRoastHistory(),
        detectionSettings: getDetectionSettings(),
        detectionLearningEnabled: getDetectionLearningEnabled(),
        mfccExperimentalEnabled: getMfccExperimentalEnabled(),
        roastLabEnabled: getRoastLabEnabled(),
        roastLabCloudSyncEnabled: getRoastLabCloudSyncEnabled(),
        roasterDetectionAdjust: getRoasterDetectionAdjust(),
        roastTargets: getRoastTargets(),
        referenceSamples: getReferenceSamples(),
        colorTargets: getColorTargets(),
        roastLabSessions: getRoastLabSessions(),
        prepBatches: getPrepBatches(),
        purchases: getPurchases(),
        blends: getBlends(),
        roasters: getRoasters(),
        roasterMode: getRoasterMode(),
        activeRoasterId: getActiveRoasterId(),
        tempUnit: getTempUnit(),
        complexityTier: getTier(),
        featureTiers: getFeatureTiers(),
        weightUnit: getWeightUnit(),
        defaultWeight: getDefaultWeight(),
        behmorTemplates: getBehmorTemplates(),
        manualProfiles: getManualProfiles()
    };
}

// Validate and import a backup object. Returns { pantry, roasts } counts.
// Throws on malformed input so callers can surface a clear error.
// Detection settings and targets are optional (v1 backups omit them).
export function importAllData(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid backup file.');
    if (!Array.isArray(data.pantry) || !Array.isArray(data.roastHistory)) {
        throw new Error('Backup file is missing pantry or roastHistory.');
    }
    savePantry(data.pantry);
    saveRoastHistory(data.roastHistory);
    if (data.detectionSettings && typeof data.detectionSettings === 'object') {
        saveDetectionSettings({ ...DEFAULT_DETECTION_SETTINGS, ...data.detectionSettings });
    }
    if (typeof data.detectionLearningEnabled === 'boolean') {
        saveDetectionLearningEnabled(data.detectionLearningEnabled);
    }
    if (typeof data.mfccExperimentalEnabled === 'boolean') {
        saveMfccExperimentalEnabled(data.mfccExperimentalEnabled);
    }
    if (typeof data.roastLabEnabled === 'boolean') {
        saveRoastLabEnabled(data.roastLabEnabled);
    }
    if (typeof data.roastLabCloudSyncEnabled === 'boolean') {
        saveRoastLabCloudSyncEnabled(data.roastLabCloudSyncEnabled);
    }
    if (data.roasterDetectionAdjust && typeof data.roasterDetectionAdjust === 'object') {
        saveRoasterDetectionAdjust(data.roasterDetectionAdjust);
    }
    if (data.roastTargets && typeof data.roastTargets === 'object') {
        saveRoastTargets({ ...DEFAULT_ROAST_TARGETS, ...data.roastTargets });
    }
    if (Array.isArray(data.referenceSamples)) {
        saveReferenceSamples(data.referenceSamples);
    }
    if (Array.isArray(data.colorTargets)) {
        saveColorTargets(data.colorTargets);
    }
    if (Array.isArray(data.roastLabSessions)) {
        saveRoastLabSessions(data.roastLabSessions);
    }
    if (Array.isArray(data.prepBatches)) {
        savePrepBatches(data.prepBatches);
    }
    if (Array.isArray(data.purchases)) {
        savePurchases(data.purchases);
    }
    if (Array.isArray(data.blends)) {
        saveBlends(data.blends);
    }
    if (Array.isArray(data.roasters) && data.roasters.length) {
        saveRoasters(data.roasters);
        if (data.roasterMode) saveRoasterMode(data.roasterMode);
        if (data.activeRoasterId) saveActiveRoasterId(data.activeRoasterId);
    }
    if (data.tempUnit) saveTempUnit(data.tempUnit);
    if (data.complexityTier) saveTier(data.complexityTier);
    if (data.featureTiers && typeof data.featureTiers === 'object') saveFeatureTiers(data.featureTiers);
    if (data.weightUnit) saveWeightUnit(data.weightUnit);
    if (data.defaultWeight) saveDefaultWeight(data.defaultWeight);
    if (data.behmorTemplates && typeof data.behmorTemplates === 'object') saveBehmorTemplates(data.behmorTemplates);
    if (data.manualProfiles && typeof data.manualProfiles === 'object') saveManualProfiles(data.manualProfiles);
    return { pantry: data.pantry.length, roasts: data.roastHistory.length };
}
