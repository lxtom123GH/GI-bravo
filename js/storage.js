// --- Data Persistence ---

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
    pantry.push(bean);
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
export function adjustBeanQuantity(id, deltaGrams) {
    const pantry = getPantry();
    const bean = pantry.find(b => b.id === id);
    if (!bean) return null;
    bean.quantity = Math.max(0, (Number(bean.quantity) || 0) + deltaGrams);
    savePantry(pantry);
    return bean.quantity;
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

// --- Detection Settings ---

export const DEFAULT_DETECTION_SETTINGS = {
    thresholdMultiplier: 1.5, // spike must exceed baseline noise by this factor (lower = more sensitive)
    cracksRequired: 3,        // snaps within the cluster window needed to confirm a crack phase
    secondCrackPitch: 0.5     // high-band energy share above which cracking reads as second crack
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

// Default Behmor batch size, stored as the machine setting key ('1/4' | '1/2' | '1').
export function getDefaultWeight() {
    return localStorage.getItem('defaultWeight') || '1';
}

export function saveDefaultWeight(w) {
    localStorage.setItem('defaultWeight', w);
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

// --- Backup / Restore ---

export function exportAllData() {
    return {
        version: 2,
        exportedAt: new Date().toISOString(),
        pantry: getPantry(),
        roastHistory: getRoastHistory(),
        detectionSettings: getDetectionSettings(),
        roastTargets: getRoastTargets(),
        referenceSamples: getReferenceSamples(),
        colorTargets: getColorTargets(),
        prepBatches: getPrepBatches(),
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
    if (data.roastTargets && typeof data.roastTargets === 'object') {
        saveRoastTargets({ ...DEFAULT_ROAST_TARGETS, ...data.roastTargets });
    }
    if (Array.isArray(data.referenceSamples)) {
        saveReferenceSamples(data.referenceSamples);
    }
    if (Array.isArray(data.colorTargets)) {
        saveColorTargets(data.colorTargets);
    }
    if (Array.isArray(data.prepBatches)) {
        savePrepBatches(data.prepBatches);
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
