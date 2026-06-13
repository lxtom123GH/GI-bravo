import { getRoastHistory, getPantry, updateRoastInHistory, deleteRoastFromHistory, exportAllData, importAllData } from './storage.js';
import { flavorWheel } from './flavors.js';
import { drawRoastCurve, drawRoastCurves } from './chart.js';
import { computeRoastMetrics, formatMs, formatDtr } from './metrics.js';

const COMPARE_COLOR_A = '#ff9800';
const COMPARE_COLOR_B = '#2196f3';

export function initHistory() {
    renderHistoryList();
    window.addEventListener('pantryUpdated', renderHistoryList);
    document.querySelector('[data-target="history"]').addEventListener('click', renderHistoryList);
    initBackup();
    initCompare();
}

function initCompare() {
    const selectA = document.getElementById('compareSelectA');
    const selectB = document.getElementById('compareSelectB');
    if (!selectA || !selectB) return;
    selectA.addEventListener('change', renderComparison);
    selectB.addEventListener('change', renderComparison);
    populateCompareSelects();
}

function populateCompareSelects() {
    const selectA = document.getElementById('compareSelectA');
    const selectB = document.getElementById('compareSelectB');
    if (!selectA || !selectB) return;

    const history = getRoastHistory().sort((a, b) => new Date(b.date) - new Date(a.date));
    const pantry = getPantry();

    [selectA, selectB].forEach(sel => {
        const prev = sel.value;
        sel.innerHTML = '<option value="">Select a roast...</option>';
        history.forEach(roast => {
            const bean = pantry.find(b => b.id === roast.beanId) || { name: 'Unknown Bean' };
            const opt = document.createElement('option');
            opt.value = roast.id;
            opt.textContent = `${bean.name} — ${new Date(roast.date).toLocaleDateString()}`;
            sel.appendChild(opt);
        });
        if (prev && history.find(r => r.id === prev)) sel.value = prev;
    });
}

function renderComparison() {
    const canvas = document.getElementById('compareCanvas');
    const metricsDiv = document.getElementById('compareMetrics');
    const idA = document.getElementById('compareSelectA').value;
    const idB = document.getElementById('compareSelectB').value;
    if (!canvas) return;

    const history = getRoastHistory();
    const pantry = getPantry();
    const roastA = history.find(r => r.id === idA);
    const roastB = history.find(r => r.id === idB);

    const toSeries = (roast, color) => {
        if (!roast) return null;
        const start = roast.timeline.startTime;
        return {
            curve: roast.timeline.curve,
            color,
            label: (pantry.find(b => b.id === roast.beanId) || { name: 'Unknown' }).name,
            firstCrackMs: roast.timeline.firstCrackTime ? roast.timeline.firstCrackTime - start : null,
            secondCrackMs: roast.timeline.secondCrackTime ? roast.timeline.secondCrackTime - start : null
        };
    };

    const series = [toSeries(roastA, COMPARE_COLOR_A), toSeries(roastB, COMPARE_COLOR_B)].filter(Boolean);
    drawRoastCurves(canvas, series);

    if (metricsDiv) metricsDiv.innerHTML = buildComparisonTable(roastA, roastB, pantry);
}

function buildComparisonTable(roastA, roastB, pantry) {
    if (!roastA && !roastB) return '';

    const col = (roast, color) => {
        if (!roast) return { name: '—', m: {}, green: '--' };
        return {
            name: (pantry.find(b => b.id === roast.beanId) || { name: 'Unknown' }).name,
            m: computeRoastMetrics(roast.timeline),
            green: roast.greenWeightG ? `${roast.greenWeightG} g` : '--',
            color
        };
    };

    const a = col(roastA, COMPARE_COLOR_A);
    const b = col(roastB, COMPARE_COLOR_B);

    const row = (label, va, vb) =>
        `<tr><td style="padding:4px 8px;color:var(--text-muted);">${label}</td>
         <td style="padding:4px 8px;text-align:right;">${va}</td>
         <td style="padding:4px 8px;text-align:right;">${vb}</td></tr>`;

    return `
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-top:10px;">
            <thead><tr>
                <th style="text-align:left;padding:4px 8px;">Metric</th>
                <th style="text-align:right;padding:4px 8px;color:${COMPARE_COLOR_A};">${a.name}</th>
                <th style="text-align:right;padding:4px 8px;color:${COMPARE_COLOR_B};">${b.name}</th>
            </tr></thead>
            <tbody>
                ${row('Total Time', formatMs(a.m.totalMs), formatMs(b.m.totalMs))}
                ${row('First Crack', formatMs(a.m.timeToFirstCrackMs), formatMs(b.m.timeToFirstCrackMs))}
                ${row('Development', formatMs(a.m.developmentTimeMs), formatMs(b.m.developmentTimeMs))}
                ${row('DTR', formatDtr(a.m.dtr), formatDtr(b.m.dtr))}
                ${row('Green Weight', a.green, b.green)}
            </tbody>
        </table>
    `;
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
                window.dispatchEvent(new Event('settingsImported'));
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

    // Keep the comparison dropdowns in sync with the current history.
    populateCompareSelects();
    renderComparison();

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
        if (roast.greenWeightG) {
            roasterInfo += ` &middot; <strong>Green:</strong> ${roast.greenWeightG} g`;
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
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="export-btn" data-id="${roast.id}">Export to Clipboard</button>
                <button class="export-csv-btn" data-id="${roast.id}">Export CSV</button>
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

    document.querySelectorAll('.export-csv-btn').forEach(btn => {
        btn.addEventListener('click', (e) => exportRoastCsv(e.target.dataset.id));
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
                window.dispatchEvent(new Event('historyUpdated'));
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

function exportRoastCsv(id) {
    const history = getRoastHistory();
    const pantry = getPantry();
    const roast = history.find(r => r.id === id);
    if (!roast) return;

    const bean = pantry.find(b => b.id === roast.beanId) || { name: 'Unknown Bean' };
    const start = roast.timeline.startTime;

    // Build a time-sorted table of curve samples and crack/end events.
    const rows = [];
    (roast.timeline.curve || []).forEach(p => rows.push({ t: p.t / 1000, rms: p.rms, event: '' }));
    if (roast.timeline.firstCrackTime) rows.push({ t: (roast.timeline.firstCrackTime - start) / 1000, rms: '', event: 'First Crack' });
    if (roast.timeline.secondCrackTime) rows.push({ t: (roast.timeline.secondCrackTime - start) / 1000, rms: '', event: 'Second Crack' });
    if (roast.timeline.endTime) rows.push({ t: (roast.timeline.endTime - start) / 1000, rms: '', event: 'End' });
    rows.sort((a, b) => a.t - b.t);

    let csv = 'time_s,energy_rms,event\n';
    rows.forEach(r => {
        const rms = r.rms === '' ? '' : Number(r.rms).toFixed(4);
        csv += `${r.t.toFixed(1)},${rms},${r.event}\n`;
    });

    const safeName = bean.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const dateStr = new Date(roast.date).toISOString().slice(0, 10);
    downloadText(`roast-${safeName}-${dateStr}.csv`, csv, 'text/csv');
}

function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
    if (roast.greenWeightG) text += `\nGreen Weight: ${roast.greenWeightG} g`;
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