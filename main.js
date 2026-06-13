// Entry point: wires together all UI modules for the Coffee Roasting Tracker.
import { initTabs } from './js/ui.js';
import { initRoastDashboard } from './js/roast.js';
import { initAudioSystem } from './js/audio.js';
import { initPantry } from './js/pantry.js';
import { initHistory } from './js/history.js';

function init() {
    initTabs();
    initRoastDashboard();
    initAudioSystem();
    initPantry();
    initHistory();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
