import { getRoastHistory, getPantry } from './storage.js';
import { flavorWheel } from './flavors.js';
import { drawRoastCurve } from './chart.js';

export function initHistory() {
    renderHistoryList();
    window.addEventListener('pantryUpdated', renderHistoryList);
    document.querySelector('[data-target="history"]').addEventListener('click', renderHistoryList);
}

function renderHistoryList() {
    const historyContainer = document.getElementById('historyContainer');
    if (!historyContainer) return;

    const history = getRoastHistory();
    const pantry = getPantry();

    historyContainer.innerHTML = '';

    if (history.length === 0) {
        historyContainer.innerHTML = '<p>No roasts recorded yet.</p>';
        return;
    }

    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    history.forEach(roast => {
        const bean = pantry.find(b => b.id === roast.beanId) || { name: 'Unknown Bean' };
        const card = document.createElement('div');
        card.className = 'card';

        const dateStr = new Date(roast.date).toLocaleString();

        let roasterInfo = `<strong>Roaster:</strong> ${roast.roaster.toUpperCase()}`;
        if (roast.roaster === 'behmor' && roast.settings) {
            roasterInfo += ` (${roast.settings.weight}lb, ${roast.settings.profile})`;
        }

        const startTime = roast.timeline.startTime;
        const endTime = roast.timeline.endTime;
        const totalMs = endTime - startTime;
        const totalMins = Math.floor(totalMs / 60000);
        const totalSecs = Math.floor((totalMs % 60000) / 1000).toString().padStart(2, '0');

        let timelineHtml = `<ul><li><strong>Total Time:</strong> ${totalMins}:${totalSecs}</li>`;

        if (roast.timeline.firstCrackTime) {
            const fcMs = roast.timeline.firstCrackTime - startTime;
            timelineHtml += `<li><strong>First Crack:</strong> ${Math.floor(fcMs / 60000)}:${Math.floor((fcMs % 60000) / 1000).toString().padStart(2, '0')}</li>`;
        }
        if (roast.timeline.secondCrackTime) {
            const scMs = roast.timeline.secondCrackTime - startTime;
            timelineHtml += `<li><strong>Second Crack:</strong> ${Math.floor(scMs / 60000)}:${Math.floor((scMs % 60000) / 1000).toString().padStart(2, '0')}</li>`;
        }
        timelineHtml += '</ul>';

        const logsHtml = roast.timeline.logs.map(l => `<div><small>${l}</small></div>`).join('');

        // Tasting Notes Section
        let notes = roast.tastingNotes || { flavors: [], text: '' };
        let flavorsHtml = notes.flavors.map(f => `<span style="background: var(--accent); color: #000; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; margin-right: 5px;">${f}</span>`).join('');
        if (!flavorsHtml) flavorsHtml = '<em>No flavors tagged.</em>';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between;">
                <h3>${bean.name}</h3>
                <small>${dateStr}</small>
            </div>
            <p>${roasterInfo}</p>
            <div style="margin: 10px 0;">
                <h4>Timeline</h4>
                ${timelineHtml}
            </div>

            <div style="margin: 10px 0;">
                <h4>Roast Curve</h4>
                <canvas class="history-curve"></canvas>
            </div>

            <div style="border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: 10px;">
                <h4>Tasting Notes</h4>
                <div style="margin-bottom: 5px;">${flavorsHtml}</div>
                <p style="font-size: 0.9rem; color: var(--text-muted);">${notes.text || '<em>No notes added.</em>'}</p>
                <button class="edit-notes-btn" data-id="${roast.id}" style="margin-top: 10px; font-size: 0.8rem; padding: 5px 10px;">Edit Notes</button>
            </div>

            <details style="margin-top: 15px; margin-bottom: 15px; cursor: pointer;">
                <summary>View Roast Logs</summary>
                <div style="background: var(--bg-color); padding: 10px; font-family: monospace; max-height: 150px; overflow-y: auto;">
                    ${logsHtml}
                </div>
            </details>
            <div style="display: flex; gap: 10px;">
                <button class="export-btn" data-id="${roast.id}">Export to Clipboard</button>
            </div>
        `;

        historyContainer.appendChild(card);

        // Render the saved roast curve (older roasts may not have curve data).
        const curveCanvas = card.querySelector('.history-curve');
        const startMs = roast.timeline.startTime;
        drawRoastCurve(curveCanvas, roast.timeline.curve, {
            firstCrackMs: roast.timeline.firstCrackTime ? roast.timeline.firstCrackTime - startMs : null,
            secondCrackMs: roast.timeline.secondCrackTime ? roast.timeline.secondCrackTime - startMs : null,
            totalMs: roast.timeline.endTime - startMs
        });
    });

    document.querySelectorAll('.export-btn').forEach(btn => {
        btn.addEventListener('click', (e) => exportRoast(e.target.dataset.id));
    });

    document.querySelectorAll('.edit-notes-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openTastingModal(e.target.dataset.id));
    });
}

function openTastingModal(id) {
    const history = getRoastHistory();
    const roast = history.find(r => r.id === id);
    if (!roast) return;

    let notes = roast.tastingNotes || { flavors: [], text: '' };

    // Create Modal UI dynamically
    const modalBg = document.createElement('div');
    modalBg.style.position = 'fixed';
    modalBg.style.top = '0'; modalBg.style.left = '0'; modalBg.style.width = '100vw'; modalBg.style.height = '100vh';
    modalBg.style.backgroundColor = 'rgba(0,0,0,0.8)';
    modalBg.style.display = 'flex';
    modalBg.style.justifyContent = 'center';
    modalBg.style.alignItems = 'center';
    modalBg.style.zIndex = '1000';

    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.width = '90%';
    modal.style.maxWidth = '500px';
    modal.style.maxHeight = '90vh';
    modal.style.overflowY = 'auto';

    let flavorsHtml = '';
    for (const [category, subFlavors] of Object.entries(flavorWheel)) {
        flavorsHtml += `<h5>${category}</h5><div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px;">`;
        subFlavors.forEach(f => {
            const isSelected = notes.flavors.includes(f) ? 'background-color: var(--accent); color: #000;' : 'background-color: var(--bg-color); color: var(--text-main);';
            flavorsHtml += `<button type="button" class="flavor-btn" data-flavor="${f}" style="${isSelected} border: 1px solid var(--border-color); padding: 5px; border-radius: 4px; cursor: pointer;">${f}</button>`;
        });
        flavorsHtml += `</div>`;
    }

    modal.innerHTML = `
        <h3>Edit Tasting Notes</h3>
        <div style="margin-bottom: 15px;">
            <h4>Flavor Wheel</h4>
            ${flavorsHtml}
        </div>
        <textarea id="modalNotesText" rows="4" placeholder="General impressions, brewing method, etc.">${notes.text}</textarea>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="modalCancel" class="danger">Cancel</button>
            <button id="modalSave" style="background-color: var(--success);">Save</button>
        </div>
    `;

    modalBg.appendChild(modal);
    document.body.appendChild(modalBg);

    // Modal Events
    let selectedFlavors = [...notes.flavors];

    modal.querySelectorAll('.flavor-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const flavor = e.target.dataset.flavor;
            if (selectedFlavors.includes(flavor)) {
                selectedFlavors = selectedFlavors.filter(f => f !== flavor);
                e.target.style.backgroundColor = 'var(--bg-color)';
                e.target.style.color = 'var(--text-main)';
            } else {
                selectedFlavors.push(flavor);
                e.target.style.backgroundColor = 'var(--accent)';
                e.target.style.color = '#000';
            }
        });
    });

    document.getElementById('modalCancel').addEventListener('click', () => {
        document.body.removeChild(modalBg);
    });

    document.getElementById('modalSave').addEventListener('click', () => {
        roast.tastingNotes = {
            flavors: selectedFlavors,
            text: document.getElementById('modalNotesText').value
        };
        // Save back to history array
        const updatedHistory = history.map(r => r.id === roast.id ? roast : r);
        localStorage.setItem('roastHistory', JSON.stringify(updatedHistory));
        document.body.removeChild(modalBg);
        renderHistoryList();
    });
}

function exportRoast(id) {
    const history = getRoastHistory();
    const pantry = getPantry();
    const roast = history.find(r => r.id === id);
    if (!roast) return;

    const bean = pantry.find(b => b.id === roast.beanId) || { name: 'Unknown Bean' };

    const dateStr = new Date(roast.date).toLocaleString();
    let text = `Roast Log: ${bean.name}\nDate: ${dateStr}\nRoaster: ${roast.roaster.toUpperCase()}`;
    if (roast.roaster === 'behmor' && roast.settings) {
        text += ` (${roast.settings.weight}lb, Profile ${roast.settings.profile})`;
    }
    text += `\n\nTimeline:\n`;

    const startTime = roast.timeline.startTime;
    if (roast.timeline.firstCrackTime) {
        const fcMs = roast.timeline.firstCrackTime - startTime;
        text += `- First Crack: ${Math.floor(fcMs / 60000)}:${Math.floor((fcMs % 60000) / 1000).toString().padStart(2, '0')}\n`;
    }
    if (roast.timeline.secondCrackTime) {
        const scMs = roast.timeline.secondCrackTime - startTime;
        text += `- Second Crack: ${Math.floor(scMs / 60000)}:${Math.floor((scMs % 60000) / 1000).toString().padStart(2, '0')}\n`;
    }
    const endMs = roast.timeline.endTime - startTime;
    text += `- Total Time: ${Math.floor(endMs / 60000)}:${Math.floor((endMs % 60000) / 1000).toString().padStart(2, '0')}\n`;

    if (roast.tastingNotes) {
        text += `\nTasting Notes:\n`;
        if (roast.tastingNotes.flavors.length > 0) text += `Flavors: ${roast.tastingNotes.flavors.join(', ')}\n`;
        if (roast.tastingNotes.text) text += `${roast.tastingNotes.text}\n`;
    }

    text += `\nLogs:\n${roast.timeline.logs.join('\n')}`;

    navigator.clipboard.writeText(text).then(() => {
        alert('Roast summary copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy to clipboard.');
    });
}