import { getPantry } from './storage.js';

export function initRoastDashboard() {
    const roasterSelect = document.getElementById('roasterSelect');
    const behmorControls = document.getElementById('behmorControls');
    const kktoControls = document.getElementById('kktoControls');

    // Roaster toggle
    if (roasterSelect) {
        roasterSelect.addEventListener('change', (e) => {
            if (e.target.value === 'behmor') {
                behmorControls.style.display = 'block';
                kktoControls.style.display = 'none';
            } else {
                behmorControls.style.display = 'none';
                kktoControls.style.display = 'block';
            }
        });
    }

    // Bean select population
    populateBeanSelect();
    window.addEventListener('pantryUpdated', populateBeanSelect);

    // Behmor state management UI
    const weightBtns = document.querySelectorAll('.behmor-weight');
    const greenWeightInput = document.getElementById('greenWeightInput');
    // Behmor weight selections map to approximate green weights in grams.
    const lbToGrams = { '1/4': 113, '1/2': 227, '1': 454 };
    weightBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            weightBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const grams = lbToGrams[e.target.dataset.weight];
            if (greenWeightInput && grams) greenWeightInput.value = grams;
        });
    });

    const profileBtns = document.querySelectorAll('.behmor-profile');
    profileBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            profileBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
}

function populateBeanSelect() {
    const beanSelect = document.getElementById('beanSelect');
    if (!beanSelect) return;

    const pantry = getPantry();
    const currentValue = beanSelect.value;

    beanSelect.innerHTML = '<option value="">Select beans from pantry...</option>';

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
