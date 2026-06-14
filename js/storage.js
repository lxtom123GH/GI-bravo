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
        tempUnit: getTempUnit(),
        complexityTier: getTier()
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
    if (data.tempUnit) saveTempUnit(data.tempUnit);
    if (data.complexityTier) saveTier(data.complexityTier);
    return { pantry: data.pantry.length, roasts: data.roastHistory.length };
}
