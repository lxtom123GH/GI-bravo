// Screen Wake Lock: keep the phone screen awake during an active roast so the
// browser doesn't background the tab. That matters because crack detection runs in
// requestAnimationFrame (which the browser PAUSES when the tab is hidden) and the OS
// suspends the microphone/AudioContext when the screen locks — so without this, a
// crack that happens while the screen is off would be missed.
//
// Caveat: a wake lock keeps the screen ON (prevents auto-lock); it cannot keep the
// app running if the user *manually* locks the phone or switches apps — that's a hard
// browser limitation for mic + animation-frame web apps.

let wakeLock = null;
let wantLock = false; // we want the lock held while a roast is active

async function request() {
    if (!('wakeLock' in navigator)) return false;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        // The system can release it (e.g. tab hidden); reflect that so we can re-acquire.
        wakeLock.addEventListener('release', () => { wakeLock = null; });
        return true;
    } catch (err) {
        // e.g. NotAllowedError when not visible/foregrounded — non-fatal.
        console.warn(`[WakeLock] could not acquire: ${err.name} ${err.message}`);
        return false;
    }
}

/** Hold the screen awake (call when a roast starts). Returns true if acquired. */
export async function acquireWakeLock() {
    wantLock = true;
    return request();
}

/** Release the screen wake lock (call when a roast stops). */
export function releaseWakeLock() {
    wantLock = false;
    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
}

/** True if the Screen Wake Lock API is available in this browser. */
export function wakeLockSupported() {
    return 'wakeLock' in navigator;
}

// The OS releases the lock when the tab is hidden; re-acquire when it's visible again
// and a roast is still active.
document.addEventListener('visibilitychange', () => {
    if (wantLock && wakeLock === null && document.visibilityState === 'visible') request();
});
