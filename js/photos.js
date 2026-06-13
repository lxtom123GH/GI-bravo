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

export async function addPhoto(roastId, dataURL) {
    const store = await tx('readwrite');
    return new Promise((resolve, reject) => {
        const req = store.add({ roastId, dataURL, addedAt: Date.now() });
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
