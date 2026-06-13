import { getRoastHistory, getPantry, updateRoastInHistory, deleteRoastFromHistory, exportAllData, importAllData } from './storage.js';
import { flavorWheel } from './flavors.js';
import { drawRoastCurve } from './chart.js';
import { computeRoastMetrics, formatMs, formatDtr } from './metrics.js';

export function initHistory() {
    renderHistoryList();
    window.addEventListener('pantryUpdated', renderHistoryList);
    document.querySelector('[data-target="history"]').addEventListener('click', renderHistoryList);
    initBackup();
}

function initBackup() {
    const exportBtn = document.getElementById('exportBackupBtn');
    const importBtn = document.getElementById('importBackupBtn');
    const importInput = document.getElementById('importBackupInput');
    if (!exportBtn || !importBtn || !importInput) return;

    exportBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(exportAllData(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `roast-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    importBtn.addEventListener('click', () => importInput.click());

    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!confirm('Importing will REPLACE your current beans and roasts. Continue?')) {
            importInput.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const result = importAllData(JSON.parse(reader.result));
                renderHistoryList();
                window.dispatchEvent(new Event('pantryUpdated'));
                alert(`Imported ${result.pantry} bean(s) and ${result.roasts} roast(s).`);
            } catch (err) {
                alert(`Import failed: ${err.message}`);
            }
            importInput.value = '';
        };
        reader.readAsText(file);
    });
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
        const m = computeRoastMetrics(roast.timeline);

        let timelineHtml = `<ul><li><strong>Total Time:</strong> ${formatMs(m.totalMs)}</li>`;

        if (m.timeToFirstCrackMs != null) {
            timelineHtml += `<li><strong>First Crack:</strong> ${formatMs(m.timeToFirstCrackMs)}</li>`;
        }
        if (m.secondCrackMs != null) {
            timelineHtml += `<li><strong>Second Crack:</strong> ${formatMs(m.secondCrackMs)}</li>`;
        }
        if (m.developmentTimeMs != null) {
            timelineHtml += `<li><strong>Development Time:</strong> ${formatMs(m.developmentTimeMs)}</li>`;
            timelineHtml += `<li><strong>Development Ratio (DTR):</strong> ${formatDtr(m.dtr)}</li>`;
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
                <button class="delete-roast-btn danger" data-id="${roast.id}">Delete Roast</button>
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

    document.querySelectorAll('.delete-roast-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const roast = history.find(r => r.id === e.target.dataset.id);
            const bean = pantry.find(b => b.id === roast?.beanId) || { name: 'this roast' };
            if (confirm(`Delete the roast of ${bean.name}? This cannot be undone.`)) {
                deleteRoastFromHistory(e.target.dataset.id);
                renderHistoryList();
            }
        });
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
        updateRoastInHistory(roast);
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

    const m = computeRoastMetrics(roast.timeline);
    if (m.timeToFirstCrackMs != null) text += `- First Crack: ${formatMs(m.timeToFirstCrackMs)}\n`;
    if (m.secondCrackMs != null) text += `- Second Crack: ${formatMs(m.secondCrackMs)}\n`;
    text += `- Total Time: ${formatMs(m.totalMs)}\n`;
    if (m.developmentTimeMs != null) {
        text += `- Development Time: ${formatMs(m.developmentTimeMs)}\n`;
        text += `- Development Ratio (DTR): ${formatDtr(m.dtr)}\n`;
    }

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