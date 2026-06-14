import { getTier, saveTier, getFeatureTier, setFeatureTier, getEffectiveTier } from './storage.js';

// --- Common UI and State Management ---

// Apply complexity tiers. The global tier is the default; per-feature overrides
// (dashboard, tasting) can raise/lower individual areas. The dashboard's
// effective tier drives the body attribute that CSS uses to show/hide UI.
export function initTier() {
    const globalSel = document.getElementById('tierSelect');
    const dashSel = document.getElementById('dashboardTierSelect');
    const tastingSel = document.getElementById('tastingTierSelect');

    const applyDashboard = () => { document.body.dataset.tier = getEffectiveTier('dashboard'); };

    const syncControls = () => {
        if (globalSel) globalSel.value = getTier();
        if (dashSel) dashSel.value = getFeatureTier('dashboard') || '';
        if (tastingSel) tastingSel.value = getFeatureTier('tasting') || '';
    };

    syncControls();
    applyDashboard();

    if (globalSel) {
        globalSel.addEventListener('change', () => { saveTier(globalSel.value); applyDashboard(); });
    }
    if (dashSel) {
        dashSel.addEventListener('change', () => { setFeatureTier('dashboard', dashSel.value); applyDashboard(); });
    }
    if (tastingSel) {
        tastingSel.addEventListener('change', () => setFeatureTier('tasting', tastingSel.value));
    }

    // Reflect imported settings.
    window.addEventListener('settingsImported', () => { syncControls(); applyDashboard(); });
}

export function initTabs() {
    const sidebar = document.querySelector('.sidebar');
    const menuToggle = document.getElementById('menuToggle');

    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    }

    document.querySelectorAll('.nav-links li').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

            e.target.classList.add('active');
            const targetId = e.target.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');

            // Close the drawer after navigating on mobile.
            if (sidebar) sidebar.classList.remove('open');
        });
    });
}
