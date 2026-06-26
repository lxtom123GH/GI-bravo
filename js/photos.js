// Roast photo storage backed by IndexedDB.
// Photos can be large, so they live here rather than in localStorage (and are
// therefore not part of the JSON backup). Each record is { id, roastId, dataURL, addedAt }.

const DB_NAME = 'roastTrackerPhotos';
const STORE = 'photos';
let dbPromise;

function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                store.createIndex('roastId', 'roastId', { unique: false });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

async function tx(mode) {
    const db = await openDB();
    return db.transaction(STORE, mode).objectStore(STORE);
}

export async function addPhoto(roastId, dataURL, meta = null) {
    const store = await tx('readwrite');
    return new Promise((resolve, reject) => {
        const req = store.add({ roastId, dataURL, meta, addedAt: Date.now() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function getPhotos(roastId) {
    const store = await tx('readonly');
    return new Promise((resolve, reject) => {
        const req = store.index('roastId').getAll(roastId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

export async function deletePhoto(id) {
    const store = await tx('readwrite');
    return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function deletePhotosForRoast(roastId) {
    const photos = await getPhotos(roastId);
    await Promise.all(photos.map(p => deletePhoto(p.id)));
}

// All photo records across every roast (for backup export).
export async function getAllPhotos() {
    const store = await tx('readonly');
    return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

// Replace the entire photo store with the given records (for backup import).
export async function replaceAllPhotos(records) {
    const store = await tx('readwrite');
    return new Promise((resolve, reject) => {
        const clearReq = store.clear();
        clearReq.onsuccess = () => {
            (records || []).forEach(r => store.put(r));
        };
        const t = store.transaction;
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
    });
}

// Representative roast-colour index for a roast: brightness of its most recent
// colour-corrected photo (lower = darker roast). Returns null if none.
export async function getRoastColorIndex(roastId) {
    const photos = await getPhotos(roastId);
    const calibrated = photos
        .filter(p => p.meta && p.meta.brightness != null && (p.meta.type === 'calibrated' || p.meta.type === 'colorchecker'))
        .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    if (calibrated.length === 0) return null;
    return { brightness: calibrated[0].meta.brightness, color: calibrated[0].meta.color, count: calibrated.length };
}

import { computeCCM, sampleChart, applyCCM } from './colorcheck.js';

// --- Multi-patch ColorChecker calibration (B4) ---

// Build a colour-corrected bean photo using a ColorChecker chart photo.
// corners: { tl, tr, br, bl } each { x, y } as fractions (0..1) of the chart image.
export async function createColorCheckerPhoto(chartFile, beanFile, corners, maxDim = 1024, quality = 0.8) {
    const [chartImg, beanImg] = await Promise.all([loadImageFromFile(chartFile), loadImageFromFile(beanFile)]);

    // Measure the 24 patches and fit the correction matrix.
    const cc = document.createElement('canvas');
    cc.width = chartImg.width; cc.height = chartImg.height;
    const cctx = cc.getContext('2d');
    cctx.drawImage(chartImg, 0, 0);
    const data = cctx.getImageData(0, 0, cc.width, cc.height).data;
    const measured = sampleChart(data, cc.width, cc.height, corners);
    const ccm = computeCCM(measured);

    // Apply to a downscaled bean image.
    const scale = Math.min(1, maxDim / Math.max(beanImg.width, beanImg.height));
    const w = Math.round(beanImg.width * scale);
    const h = Math.round(beanImg.height * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(beanImg, 0, 0, w, h);
    applyCCM(ctx, w, h, ccm);

    const color = averageCenterColor(ctx, w, h);
    const rounded = { r: Math.round(color.r), g: Math.round(color.g), b: Math.round(color.b) };
    return {
        dataURL: c.toDataURL('image/jpeg', quality),
        meta: {
            type: 'colorchecker',
            color: rounded,
            brightness: Math.round(luminance(rounded))
        }
    };
}

// --- Colour correction (reference-card white balance) ---

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Average colour of the central region (default middle 50%) of a canvas context.
function averageCenterColor(ctx, w, h, frac = 0.5) {
    const rw = Math.max(1, Math.floor(w * frac));
    const rh = Math.max(1, Math.floor(h * frac));
    const x0 = Math.floor((w - rw) / 2);
    const y0 = Math.floor((h - rh) / 2);
    const data = ctx.getImageData(x0, y0, rw, rh).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    return { r: r / n, g: g / n, b: b / n };
}

function luminance({ r, g, b }) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

// Inspect the central region for over/under-exposure that would corrupt the gains.
function analyzeExposure(ctx, w, h, frac = 0.5) {
    const rw = Math.max(1, Math.floor(w * frac));
    const rh = Math.max(1, Math.floor(h * frac));
    const x0 = Math.floor((w - rw) / 2);
    const y0 = Math.floor((h - rh) / 2);
    const data = ctx.getImageData(x0, y0, rw, rh).data;
    let lumSum = 0, clipped = 0, dark = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
        const lum = luminance({ r: data[i], g: data[i + 1], b: data[i + 2] });
        lumSum += lum;
        if (data[i] >= 250 || data[i + 1] >= 250 || data[i + 2] >= 250) clipped++;
        if (lum <= 18) dark++;
        n++;
    }
    return { meanLum: lumSum / n, clippedFrac: clipped / n, darkFrac: dark / n };
}

// Warnings about a reference photo's exposure, if any.
function exposureWarnings(exp) {
    const warnings = [];
    if (exp.clippedFrac > 0.05) {
        warnings.push(`The reference looks over-exposed (${Math.round(exp.clippedFrac * 100)}% of it is blown out). Re-shoot darker or use a grey card so the gains are accurate.`);
    } else if (exp.meanLum < 40) {
        warnings.push('The reference looks very dark. Add light or re-shoot brighter for a reliable correction.');
    }
    return warnings;
}

// Resolve a target colour from {r,g,b} | "#RRGGBB" | null (null = neutral grey-world).
function resolveTarget(targetColor, refAvg) {
    if (targetColor && typeof targetColor === 'object' && 'r' in targetColor) return targetColor;
    if (typeof targetColor === 'string' && /^#?[0-9a-f]{6}$/i.test(targetColor)) return hexToRgb(targetColor);
    const grey = (refAvg.r + refAvg.g + refAvg.b) / 3;
    return { r: grey, g: grey, b: grey };
}

// Measure the central average colour of an image file (used to self-calibrate a sample).
export async function measureImageColor(file) {
    const img = await loadImageFromFile(file);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const avg = averageCenterColor(ctx, c.width, c.height);
    return { r: Math.round(avg.r), g: Math.round(avg.g), b: Math.round(avg.b) };
}

// White-balance a bean photo using a reference-card photo shot under the same light.
// If targetHex is given, the reference is assumed to be that true colour; otherwise
// the reference is treated as neutral (grey-world) and the cast is removed while
// preserving overall exposure. Returns { dataURL, meta:{ color, brightness, gains } }.
export async function createCalibratedPhoto(refFile, beanFile, targetColor, maxDim = 1024, quality = 0.8) {
    const [refImg, beanImg] = await Promise.all([loadImageFromFile(refFile), loadImageFromFile(beanFile)]);

    // Measure the reference card's average colour and check its exposure.
    const rc = document.createElement('canvas');
    rc.width = refImg.width; rc.height = refImg.height;
    const rctx = rc.getContext('2d');
    rctx.drawImage(refImg, 0, 0);
    const refAvg = averageCenterColor(rctx, rc.width, rc.height);
    const warnings = exposureWarnings(analyzeExposure(rctx, rc.width, rc.height));

    const target = resolveTarget(targetColor, refAvg);
    const gains = {
        r: target.r / Math.max(1, refAvg.r),
        g: target.g / Math.max(1, refAvg.g),
        b: target.b / Math.max(1, refAvg.b)
    };

    // Apply the per-channel gains to a downscaled bean image.
    const scale = Math.min(1, maxDim / Math.max(beanImg.width, beanImg.height));
    const w = Math.round(beanImg.width * scale);
    const h = Math.round(beanImg.height * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(beanImg, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
        d[i] = clamp255(d[i] * gains.r);
        d[i + 1] = clamp255(d[i + 1] * gains.g);
        d[i + 2] = clamp255(d[i + 2] * gains.b);
    }
    ctx.putImageData(imgData, 0, 0);

    // Measure the corrected bean colour from the central region as a roast-colour index.
    const color = averageCenterColor(ctx, w, h);
    const rounded = { r: Math.round(color.r), g: Math.round(color.g), b: Math.round(color.b) };

    return {
        dataURL: c.toDataURL('image/jpeg', quality),
        warnings,
        meta: {
            type: 'calibrated',
            color: rounded,
            brightness: Math.round(luminance(rounded)),
            gains: { r: +gains.r.toFixed(3), g: +gains.g.toFixed(3), b: +gains.b.toFixed(3) }
        }
    };
}

// Read an image File and return a downscaled JPEG data URL to keep storage modest.
export function fileToScaledDataURL(file, maxDim = 1024, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
