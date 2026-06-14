import { getTier, saveTier } from './storage.js';

// --- Common UI and State Management ---

// Apply the complexity tier as a body attribute so CSS can show/hide advanced UI.
export function initTier() {
    const sel = document.getElementById('tierSelect');
    const apply = (t) => { document.body.dataset.tier = t; };

    apply(getTier());
    if (sel) {
        sel.value = getTier();
        sel.addEventListener('change', () => { saveTier(sel.value); apply(sel.value); });
    }
    // Reflect an imported tier setting.
    window.addEventListener('settingsImported', () => {
        const t = getTier();
        if (sel) sel.value = t;
        apply(t);
    });
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
