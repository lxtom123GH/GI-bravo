import { getPantry, addBeanToPantry, deleteBeanFromPantry, adjustBeanQuantity } from './storage.js';

const LOW_STOCK_THRESHOLD_G = 250;

export function initPantry() {
    const pantryForm = document.getElementById('addBeanForm');
    if (pantryForm) {
        pantryForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const name = document.getElementById('beanName').value;
            const region = document.getElementById('beanRegion').value;
            const country = document.getElementById('beanCountry').value;
            const farm = document.getElementById('beanFarm').value;
            const process = document.getElementById('beanProcess').value;
            const quantity = parseFloat(document.getElementById('beanQuantity').value) || 0;

            if (!name) {
                alert('Bean Name is required');
                return;
            }

            const newBean = { name, region, country, farm, process, quantity };
            addBeanToPantry(newBean);

            pantryForm.reset();
            renderPantryList();

            // Dispatch event so active roast tab can update its bean dropdown
            window.dispatchEvent(new Event('pantryUpdated'));
        });
    }

    renderPantryList();
    window.addEventListener('pantryUpdated', renderPantryList);
}

export function renderPantryList() {
    const pantryListDiv = document.getElementById('pantryList');
    if (!pantryListDiv) return;

    const pantry = getPantry();
    pantryListDiv.innerHTML = '';

    if (pantry.length === 0) {
        pantryListDiv.innerHTML = '<p>Your pantry is empty. Add some beans to get started!</p>';
        return;
    }

    pantry.forEach(bean => {
        const beanCard = document.createElement('div');
        beanCard.className = 'card bean-card';
        beanCard.style.display = 'flex';
        beanCard.style.justifyContent = 'space-between';
        beanCard.style.alignItems = 'center';

        let details = `<strong>${bean.name}</strong>`;
        let info = [];
        if (bean.country) info.push(bean.country);
        if (bean.region) info.push(bean.region);
        if (bean.farm) info.push(bean.farm);
        if (bean.process) info.push(bean.process);

        if (info.length > 0) {
            details += `<br><small>${info.join(' - ')}</small>`;
        }

        const qty = Number(bean.quantity) || 0;
        let qtyColor = 'var(--text-muted)';
        let qtyLabel = `${qty} g on hand`;
        if (qty <= 0) {
            qtyColor = 'var(--danger)';
            qtyLabel = 'Out of stock';
        } else if (qty < LOW_STOCK_THRESHOLD_G) {
            qtyColor = 'var(--accent)';
            qtyLabel = `${qty} g on hand (low)`;
        }
        details += `<br><small style="color: ${qtyColor};">${qtyLabel}</small>`;

        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = details;

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '8px';

        const restockBtn = document.createElement('button');
        restockBtn.textContent = 'Restock';
        restockBtn.style.padding = '5px 10px';
        restockBtn.addEventListener('click', () => {
            const input = prompt(`Add how many grams to ${bean.name}?`, '454');
            const grams = parseFloat(input);
            if (!isNaN(grams) && grams > 0) {
                adjustBeanQuantity(bean.id, grams);
                renderPantryList();
                window.dispatchEvent(new Event('pantryUpdated'));
            }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'danger';
        deleteBtn.style.padding = '5px 10px';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete ${bean.name}?`)) {
                deleteBeanFromPantry(bean.id);
                renderPantryList();
                window.dispatchEvent(new Event('pantryUpdated'));
            }
        });

        btnGroup.appendChild(restockBtn);
        btnGroup.appendChild(deleteBtn);
        beanCard.appendChild(infoDiv);
        beanCard.appendChild(btnGroup);
        pantryListDiv.appendChild(beanCard);
    });
}
