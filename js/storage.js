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

// --- Backup / Restore ---

export function exportAllData() {
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        pantry: getPantry(),
        roastHistory: getRoastHistory()
    };
}

// Validate and import a backup object. Returns { pantry, roasts } counts.
// Throws on malformed input so callers can surface a clear error.
export function importAllData(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid backup file.');
    if (!Array.isArray(data.pantry) || !Array.isArray(data.roastHistory)) {
        throw new Error('Backup file is missing pantry or roastHistory.');
    }
    savePantry(data.pantry);
    saveRoastHistory(data.roastHistory);
    return { pantry: data.pantry.length, roasts: data.roastHistory.length };
}
