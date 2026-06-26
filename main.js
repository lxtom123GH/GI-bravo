// Entry point: wires together all UI modules for the Coffee Roasting Tracker.
import { initTabs, initTier } from './js/ui.js';
import { initDemo } from './js/demo.js';
import { initTour } from './js/tour.js';
import { initHints } from './js/hints.js';
import { initRoastDashboard } from './js/roast.js';
import { initAudioSystem } from './js/audio.js';
import { initPantry } from './js/pantry.js';
import { initHistory } from './js/history.js';

function init() {
    initTier();
    initTabs();
    initRoastDashboard();
    initAudioSystem();
    initPantry();
    initHistory();
    initDemo();
    initTour();
    initHints();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Register the service worker for offline / installable PWA support.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js', { scope: './' })
            .catch(err => console.warn('Service worker registration failed:', err));
    });
}
