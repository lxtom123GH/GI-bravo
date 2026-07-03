import { getPantry, getWeightUnit, saveWeightUnit, getDefaultWeight, saveDefaultWeight, getLastGreenWeight, saveLastGreenWeight, getActiveRoaster } from './storage.js';
import { BEHMOR_GRAMS, weightLabel } from './metrics.js';

// Notify other modules (audio.js) that the Behmor roaster/profile/weight changed,
// so a matching reference template can be auto-loaded.
function notifyConfigChanged() {
    window.dispatchEvent(new Event('behmorConfigChanged'));
}

export function initRoastDashboard() {
    const behmorControls = document.getElementById('behmorControls');
    const kktoControls = document.getElementById('kktoControls');

    // Show the control panel for the active roaster's model. Driven by roaster profiles
    // (js/roasters.js), which dispatches 'roasterChanged' when the active machine changes.
    const applyRoasterControls = () => {
        const model = (getActiveRoaster() || { model: 'behmor' }).model;
        if (behmorControls) behmorControls.style.display = model === 'behmor' ? 'block' : 'none';
        if (kktoControls) kktoControls.style.display = model === 'kkto' ? 'block' : 'none';
    };
    applyRoasterControls();
    window.addEventListener('roasterChanged', () => { applyRoasterControls(); notifyConfigChanged(); });

    // Bean select population
    populateBeanSelect();
    window.addEventListener('pantryUpdated', populateBeanSelect);

    const weightBtns = document.querySelectorAll('.behmor-weight');
    const greenWeightInput = document.getElementById('greenWeightInput');
    const weightUnitSelect = document.getElementById('weightUnitSelect');
    const setDefaultBtn = document.getElementById('setDefaultWeightBtn');

    const relabelWeights = () => {
        const u = getWeightUnit();
        weightBtns.forEach(b => { b.textContent = weightLabel(b.dataset.weight, u); });
    };

    const selectWeight = (weight, { prefill = true } = {}) => {
        weightBtns.forEach(b => b.classList.toggle('active', b.dataset.weight === weight));
        // Only prefill the green weight if it's empty, so tapping a batch-size button
        // doesn't wipe a value the user set (e.g. a 450 g roast on the 400 g setting).
        if (prefill && greenWeightInput && !greenWeightInput.value) {
            const grams = BEHMOR_GRAMS[weight];
            if (grams) greenWeightInput.value = grams;
        }
    };

    relabelWeights();
    selectWeight(getDefaultWeight(), { prefill: false });

    // Prefill the green weight with the last value used (her usual roast size), and
    // remember it whenever she changes it.
    if (greenWeightInput) {
        const last = getLastGreenWeight();
        if (last && !greenWeightInput.value) greenWeightInput.value = last;
        greenWeightInput.addEventListener('change', () => {
            const g = parseFloat(greenWeightInput.value);
            if (g > 0) saveLastGreenWeight(g);
        });
    }

    weightBtns.forEach(btn => {
        btn.addEventListener('click', () => { selectWeight(btn.dataset.weight); notifyConfigChanged(); });
    });

    if (weightUnitSelect) {
        weightUnitSelect.value = getWeightUnit();
        weightUnitSelect.addEventListener('change', () => { saveWeightUnit(weightUnitSelect.value); relabelWeights(); });
    }

    if (setDefaultBtn) {
        setDefaultBtn.addEventListener('click', () => {
            const active = document.querySelector('.behmor-weight.active');
            if (!active) return;
            saveDefaultWeight(active.dataset.weight);
            // Confirm on the button itself — no blocking dialog.
            setDefaultBtn.textContent = `✓ ${weightLabel(active.dataset.weight, getWeightUnit())} is the default`;
            setTimeout(() => { setDefaultBtn.textContent = 'Set as default'; }, 1800);
        });
    }

    const profileBtns = document.querySelectorAll('.behmor-profile');
    profileBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            profileBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            notifyConfigChanged();
        });
    });

    // Reflect imported settings, and apply the initial template selection.
    window.addEventListener('settingsImported', () => {
        if (weightUnitSelect) weightUnitSelect.value = getWeightUnit();
        relabelWeights();
        selectWeight(getDefaultWeight(), { prefill: false });
        notifyConfigChanged();
    });

    // "Roast again" from a history card: load that roast's bean, green weight and
    // Behmor settings so a repeat is one tap away (history.js switches the tab).
    window.addEventListener('roastAgain', (e) => {
        const roast = e.detail || {};
        const beanSelect = document.getElementById('beanSelect');
        if (beanSelect && roast.beanId && [...beanSelect.options].some(o => o.value === roast.beanId)) {
            beanSelect.value = roast.beanId;
        }
        if (greenWeightInput && roast.greenWeightG) greenWeightInput.value = roast.greenWeightG;
        if (roast.roaster === 'behmor' && roast.settings) {
            if (BEHMOR_GRAMS[roast.settings.weight]) selectWeight(roast.settings.weight, { prefill: false });
            if (roast.settings.profile) {
                profileBtns.forEach(b => b.classList.toggle('active', b.dataset.profile === roast.settings.profile));
            }
        }
        notifyConfigChanged();
    });

    notifyConfigChanged();
}

function populateBeanSelect() {
    const beanSelect = document.getElementById('beanSelect');
    if (!beanSelect) return;

    const pantry = getPantry();
    const currentValue = beanSelect.value;

    // First-run guidance: an empty pantry shouldn't read like a broken dropdown.
    beanSelect.innerHTML = pantry.length
        ? '<option value="">Select beans from pantry...</option>'
        : '<option value="">No beans yet — add them in Bean Pantry (optional)</option>';

    pantry.forEach(bean => {
        const option = document.createElement('option');
        option.value = bean.id;
        const qty = Number(bean.quantity) || 0;
        option.textContent = `${bean.name} (${bean.process || 'Unknown process'}) — ${qty} g`;
        beanSelect.appendChild(option);
    });

    if (currentValue && pantry.find(b => b.id === currentValue)) {
        beanSelect.value = currentValue;
    }
}
