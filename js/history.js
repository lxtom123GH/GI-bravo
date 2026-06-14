import { getRoastHistory, getPantry, updateRoastInHistory, deleteRoastFromHistory, exportAllData, importAllData, getReferenceSamples, addReferenceSample } from './storage.js';
import { flavorWheel } from './flavors.js';
import { drawRoastCurve, drawRoastCurves, drawTrend } from './chart.js';
import { computeRoastMetrics, formatMs, formatDtr, computeRoRPoints, formatRoR, computeWeightLoss, formatPct } from './metrics.js';
import { addPhoto, getPhotos, deletePhoto, deletePhotosForRoast, fileToScaledDataURL, createCalibratedPhoto, measureImageColor, getRoastColorIndex } from './photos.js';

const COMPARE_COLOR_A = '#ff9800';
const COMPARE_COLOR_B = '#2196f3';

export function initHistory() {
    renderHistoryList();
    window.addEventListener('pantryUpdated', renderHistoryList);
    document.querySelector('[data-target="history"]').addEventListener('click', renderHistoryList);
    initBackup();
    initCompare();
    initTrends();
}

function initTrends() {
    const metric = document.getElementById('trendMetric');
    if (!metric) return;
    metric.addEventListener('change', renderTrend);
    renderTrend();
}

function renderTrend() {
    const canvas = document.getElementById('trendCanvas');
    const metricSel = document.getElementById('trendMetric');
    if (!canvas || !metricSel) return;

    const metric = metricSel.value;
    const history = getRoastHistory().sort((a, b) => new Date(a.date) - new Date(b.date));
    const label = r => new Date(r.date).toLocaleDateString();

    if (metric === 'color') {
        // Roast-colour indices live in IndexedDB; gather then plot.
        Promise.all(history.map(r => getRoastColorIndex(r.id))).then(indices => {
            const series = history.map((r, i) => ({ label: label(r), value: indices[i] ? indices[i].brightness : null }));
            drawTrend(canvas, series, { decimals: 0 });
        });
        return;
    }

    const series = history.map(r => {
        const m = computeRoastMetrics(r.timeline);
        let value = null;
        if (metric === 'dtr') value = m.dtr != null ? m.dtr * 100 : null;
        else if (metric === 'total') value = m.totalMs != null ? m.totalMs / 60000 : null;
        else if (metric === 'fc') value = m.timeToFirstCrackMs != null ? m.timeToFirstCrackMs / 60000 : null;
        return { label: label(r), value };
    });
    drawTrend(canvas, series, { decimals: 1 });
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

    if (!metricsDiv) return;
    // Roast-colour indices live in IndexedDB; fetch then render the table.
    Promise.all([
        roastA ? getRoastColorIndex(roastA.id) : null,
        roastB ? getRoastColorIndex(roastB.id) : null
    ]).then(([idxA, idxB]) => {
        metricsDiv.innerHTML = buildComparisonTable(roastA, roastB, pantry, idxA, idxB);
    });
}

function buildComparisonTable(roastA, roastB, pantry, idxA, idxB) {
    if (!roastA && !roastB) return '';

    const col = (roast, color) => {
        if (!roast) return { name: '—', m: {}, green: '--' };
        return {
            name: (pantry.find(b => b.id === roast.beanId) || { name: 'Unknown' }).name,
            m: computeRoastMetrics(roast.timeline),
            green: roast.greenWeightG ? `${roast.greenWeightG} g` : '--',
            roasted: roast.roastedWeightG ? `${roast.roastedWeightG} g` : '--',
            loss: formatPct(computeWeightLoss(roast.greenWeightG, roast.roastedWeightG)),
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
                ${row('Roasted Weight', a.roasted, b.roasted)}
                ${row('Weight Loss', a.loss, b.loss)}
                ${row('Roast colour', idxA ? idxA.brightness : '--', idxB ? idxB.brightness : '--')}
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

    // Keep the comparison dropdowns and trend chart in sync with the current history.
    populateCompareSelects();
    renderComparison();
    renderTrend();

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
        if (roast.roastedWeightG) {
            roasterInfo += ` &middot; <strong>Roasted:</strong> ${roast.roastedWeightG} g`;
            const loss = computeWeightLoss(roast.greenWeightG, roast.roastedWeightG);
            if (loss != null) roasterInfo += ` &middot; <strong>Weight loss:</strong> ${formatPct(loss)}`;
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
        const temps = roast.timeline.temps || [];
        if (temps.length > 0) {
            const unit = roast.timeline.tempUnit || 'C';
            const rorPts = computeRoRPoints(temps);
            const lastRor = rorPts.length ? formatRoR(rorPts[rorPts.length - 1].ror).replace('°', `°${unit}`) : '--';
            timelineHtml += `<li><strong>Temp readings:</strong> ${temps.length} (last RoR ${lastRor})</li>`;
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
            <div style="border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: 10px;">
                <h4>Photos <span class="roast-color-index" data-id="${roast.id}" style="font-weight: normal; font-size: 0.8rem; color: var(--text-muted);"></span></h4>
                <div class="roast-photos" data-id="${roast.id}" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;"></div>
                <button class="add-photo-btn" data-id="${roast.id}" style="font-size: 0.8rem; padding: 5px 10px;">Add Photo</button>
                <button class="add-calibrated-btn" data-id="${roast.id}" style="font-size: 0.8rem; padding: 5px 10px;">Add Colour-Corrected Photo</button>
                <input type="file" class="photo-input" data-id="${roast.id}" accept="image/*" capture="environment" style="display: none;">
            </div>

            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px;">
                <button class="log-yield-btn" data-id="${roast.id}">Log Roasted Weight</button>
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

        renderPhotos(roast.id, card.querySelector('.roast-photos'));

        // Fill the roast-colour index (from IndexedDB) once available.
        getRoastColorIndex(roast.id).then(idx => {
            const el = card.querySelector('.roast-color-index');
            if (el && idx) el.textContent = `— roast colour ${idx.brightness} (lower = darker)`;
        }).catch(() => {});
    });

    document.querySelectorAll('.add-photo-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelector(`.photo-input[data-id="${e.target.dataset.id}"]`).click();
        });
    });

    document.querySelectorAll('.photo-input').forEach(inp => {
        inp.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            const file = e.target.files[0];
            if (file) {
                try {
                    await addPhoto(id, await fileToScaledDataURL(file));
                    renderPhotos(id, document.querySelector(`.roast-photos[data-id="${id}"]`));
                } catch (err) {
                    alert(`Could not add photo: ${err.message}`);
                }
            }
            e.target.value = '';
        });
    });

    document.querySelectorAll('.add-calibrated-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openCalibratedPhotoModal(e.target.dataset.id));
    });

    document.querySelectorAll('.export-btn').forEach(btn => {
        btn.addEventListener('click', (e) => exportRoast(e.target.dataset.id));
    });

    document.querySelectorAll('.export-csv-btn').forEach(btn => {
        btn.addEventListener('click', (e) => exportRoastCsv(e.target.dataset.id));
    });

    document.querySelectorAll('.log-yield-btn').forEach(btn => {
        btn.addEventListener('click', (e) => logRoastedWeight(e.target.dataset.id));
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
                deletePhotosForRoast(e.target.dataset.id).catch(() => {});
                renderHistoryList();
                window.dispatchEvent(new Event('historyUpdated'));
            }
        });
    });
}

async function renderPhotos(roastId, container) {
    if (!container) return;
    let photos = [];
    try {
        photos = await getPhotos(roastId);
    } catch {
        container.innerHTML = '<small style="color: var(--text-muted);">Photos unavailable.</small>';
        return;
    }

    container.innerHTML = '';
    if (photos.length === 0) {
        container.innerHTML = '<small style="color: var(--text-muted);">No photos.</small>';
        return;
    }

    photos.forEach(p => {
        const fig = document.createElement('figure');
        fig.style.cssText = 'margin: 0; text-align: center;';

        const img = document.createElement('img');
        img.src = p.dataURL;
        img.title = 'Click to delete';
        img.style.cssText = 'width: 80px; height: 80px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid var(--border-color);';
        img.addEventListener('click', async () => {
            if (confirm('Delete this photo?')) {
                await deletePhoto(p.id);
                renderPhotos(roastId, container);
            }
        });
        fig.appendChild(img);

        if (p.meta && p.meta.brightness != null) {
            const cap = document.createElement('figcaption');
            cap.style.cssText = 'font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;';
            cap.textContent = `WB · ${p.meta.brightness}`;
            fig.appendChild(cap);
        }

        container.appendChild(fig);
    });
}

function openCalibratedPhotoModal(roastId) {
    const modalBg = document.createElement('div');
    modalBg.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;';

    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.cssText = 'width: 90%; max-width: 460px; max-height: 90vh; overflow-y: auto;';
    modal.innerHTML = `
        <h3>Colour-Corrected Photo</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted);">
            Under the same light, photograph a white/grey reference card, then the beans.
            The reference white-balances the bean photo and measures a roast-colour index.
            A neutral grey card (not bright white) gives the most reliable result.
        </p>
        <label><strong>1. Reference card photo</strong></label>
        <input type="file" id="calRefInput" accept="image/*" capture="environment">
        <label><strong>2. Beans photo</strong></label>
        <input type="file" id="calBeanInput" accept="image/*" capture="environment">
        <label><strong>Reference target</strong></label>
        <select id="calTarget"></select>
        <input type="text" id="calHexInput" placeholder="#RRGGBB" style="display: none;">
        <div style="display: flex; gap: 10px; margin-top: 4px;">
            <button id="calAddSample" style="font-size: 0.8rem; padding: 5px 10px;">Calibrate new sample…</button>
            <input type="file" id="calSampleInput" accept="image/*" capture="environment" style="display: none;">
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px;">
            <button id="calCancel" class="danger">Cancel</button>
            <button id="calProcess" style="background-color: var(--success);">Process</button>
        </div>
    `;

    modalBg.appendChild(modal);
    document.body.appendChild(modalBg);

    const targetSelect = modal.querySelector('#calTarget');
    const hexInput = modal.querySelector('#calHexInput');

    const populateTargets = (selectId) => {
        const samples = getReferenceSamples();
        targetSelect.innerHTML =
            '<option value="neutral">Neutral white/grey (recommended)</option>' +
            samples.map(s => `<option value="sample:${s.id}">${s.name} (rgb ${s.color.r},${s.color.g},${s.color.b})</option>`).join('') +
            '<option value="hex">Custom hex…</option>';
        if (selectId) targetSelect.value = selectId;
    };
    populateTargets();

    targetSelect.addEventListener('change', () => {
        hexInput.style.display = targetSelect.value === 'hex' ? 'block' : 'none';
    });

    const close = () => document.body.removeChild(modalBg);
    modal.querySelector('#calCancel').addEventListener('click', close);

    // Optional self-calibration: measure a sample once and save it as a reusable target.
    modal.querySelector('#calAddSample').addEventListener('click', () => modal.querySelector('#calSampleInput').click());
    modal.querySelector('#calSampleInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            const color = await measureImageColor(file);
            const name = prompt('Name this reference sample (e.g. "Grey card, daylight"):');
            if (!name) return;
            const saved = addReferenceSample({ name, color });
            populateTargets(`sample:${saved.id}`);
            hexInput.style.display = 'none';
            alert(`Saved "${name}" (rgb ${color.r},${color.g},${color.b}). Shoot it under good neutral daylight for best results.`);
        } catch (err) {
            alert(`Could not measure sample: ${err.message}`);
        }
    });

    modal.querySelector('#calProcess').addEventListener('click', async () => {
        const refFile = modal.querySelector('#calRefInput').files[0];
        const beanFile = modal.querySelector('#calBeanInput').files[0];
        if (!refFile || !beanFile) {
            alert('Please provide both a reference card photo and a beans photo.');
            return;
        }

        // Resolve the white-balance target from the selection.
        let target = null;
        const sel = targetSelect.value;
        if (sel === 'hex') {
            const hex = hexInput.value.trim();
            if (!/^#?[0-9a-f]{6}$/i.test(hex)) { alert('Enter a valid hex colour like #c8c8c8.'); return; }
            target = hex;
        } else if (sel.startsWith('sample:')) {
            const s = getReferenceSamples().find(x => x.id === sel.slice(7));
            target = s ? s.color : null;
        }

        try {
            const { dataURL, meta, warnings } = await createCalibratedPhoto(refFile, beanFile, target);
            if (warnings && warnings.length && !confirm(`${warnings.join('\n\n')}\n\nUse this photo anyway?`)) {
                return;
            }
            await addPhoto(roastId, dataURL, meta);
            close();
            renderPhotos(roastId, document.querySelector(`.roast-photos[data-id="${roastId}"]`));
        } catch (err) {
            alert(`Could not process photos: ${err.message}`);
        }
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

function logRoastedWeight(id) {
    const roast = getRoastHistory().find(r => r.id === id);
    if (!roast) return;

    const current = roast.roastedWeightG || '';
    const input = prompt('Roasted (post-cool) weight in grams:', current);
    if (input === null) return; // cancelled

    const trimmed = input.trim();
    if (trimmed === '') {
        delete roast.roastedWeightG; // clearing the value
    } else {
        const grams = parseFloat(trimmed);
        if (isNaN(grams) || grams <= 0) { alert('Enter a positive number of grams.'); return; }
        roast.roastedWeightG = grams;
        if (roast.greenWeightG) {
            const loss = computeWeightLoss(roast.greenWeightG, grams);
            if (loss != null && (loss < 0 || loss > 30)) {
                if (!confirm(`Weight loss of ${loss.toFixed(1)}% looks unusual (typical is 12–20%). Save anyway?`)) return;
            }
        }
    }

    updateRoastInHistory(roast);
    renderHistoryList();
}

function exportRoastCsv(id) {
    const history = getRoastHistory();
    const pantry = getPantry();
    const roast = history.find(r => r.id === id);
    if (!roast) return;

    const bean = pantry.find(b => b.id === roast.beanId) || { name: 'Unknown Bean' };
    const start = roast.timeline.startTime;

    // Build a time-sorted table of curve samples, temperature readings, and crack/end events.
    const rows = [];
    (roast.timeline.curve || []).forEach(p => rows.push({ t: p.t / 1000, rms: p.rms, temp: '', ror: '', event: '' }));
    // computeRoRPoints starts at the second reading; the first is added below.
    computeRoRPoints(roast.timeline.temps || []).forEach(p => {
        rows.push({ t: p.t / 1000, rms: '', temp: p.temp, ror: p.ror, event: '' });
    });
    (roast.timeline.temps || []).slice(0, 1).forEach(p => rows.push({ t: p.t / 1000, rms: '', temp: p.temp, ror: '', event: '' }));
    if (roast.timeline.firstCrackTime) rows.push({ t: (roast.timeline.firstCrackTime - start) / 1000, rms: '', temp: '', ror: '', event: 'First Crack' });
    if (roast.timeline.secondCrackTime) rows.push({ t: (roast.timeline.secondCrackTime - start) / 1000, rms: '', temp: '', ror: '', event: 'Second Crack' });
    if (roast.timeline.endTime) rows.push({ t: (roast.timeline.endTime - start) / 1000, rms: '', temp: '', ror: '', event: 'End' });
    rows.sort((a, b) => a.t - b.t);

    const unit = roast.timeline.tempUnit || 'C';
    // Metadata header (commented) followed by the time-series table.
    let csv = `# Bean: ${bean.name}\n# Date: ${new Date(roast.date).toISOString()}\n`;
    if (roast.greenWeightG) csv += `# Green weight (g): ${roast.greenWeightG}\n`;
    if (roast.roastedWeightG) {
        csv += `# Roasted weight (g): ${roast.roastedWeightG}\n`;
        const loss = computeWeightLoss(roast.greenWeightG, roast.roastedWeightG);
        if (loss != null) csv += `# Weight loss (%): ${loss.toFixed(1)}\n`;
    }
    csv += `time_s,energy_rms,temp_${unit},ror_${unit}_per_min,event\n`;
    rows.forEach(r => {
        const rms = r.rms === '' ? '' : Number(r.rms).toFixed(4);
        const ror = r.ror === '' ? '' : Number(r.ror).toFixed(1);
        csv += `${r.t.toFixed(1)},${rms},${r.temp},${ror},${r.event}\n`;
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
    if (roast.roastedWeightG) {
        text += `\nRoasted Weight: ${roast.roastedWeightG} g`;
        const loss = computeWeightLoss(roast.greenWeightG, roast.roastedWeightG);
        if (loss != null) text += `\nWeight Loss: ${formatPct(loss)}`;
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