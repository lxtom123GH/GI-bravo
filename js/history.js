import { getRoastHistory, getPantry, updateRoastInHistory, deleteRoastFromHistory, exportAllData, importAllData, getReferenceSamples, addReferenceSample, getColorTargets, addColorTarget, deleteColorTarget, getEffectiveTier, saveBehmorTemplate, getBehmorTemplates, getWeightUnit, saveManualProfile, saveRoastHistory, addBeanToPantry } from './storage.js';
import { flavorWheel } from './flavors.js';
import { roastRest } from './freshness.js';
import { drawRoastCurve, drawRoastCurves, drawTrend } from './chart.js';
import { computeRoastMetrics, formatMs, formatDtr, computeRoRPoints, formatRoR, computeWeightLoss, formatPct, weightLabel } from './metrics.js';
import { addPhoto, getPhotos, deletePhoto, deletePhotosForRoast, fileToScaledDataURL, createCalibratedPhoto, measureImageColor, getRoastColorIndex, getAllPhotos, replaceAllPhotos, createColorCheckerPhoto, calibrateCustomTarget, createCustomTargetPhoto } from './photos.js';

const COMPARE_COLOR_A = '#ff9800';
const COMPARE_COLOR_B = '#2196f3';

const EMOJI = { sad: '🙁', neutral: '😐', happy: '😀' };
const BREW_METHODS = ['V60', 'Espresso', 'AeroPress', 'French Press', 'Filter / Batch', 'Moka', 'Cold Brew', 'Other'];

// SCA cupping form: 7 quality attributes (6.00–10.00) + 3 ten-point attributes
// (uniformity, clean cup, sweetness, default 10) minus defects = final /100.
const SCA_QUALITY = ['aroma', 'flavor', 'aftertaste', 'acidity', 'body', 'balance', 'overall'];
const SCA_TEN = ['uniformity', 'cleanCup', 'sweetness'];
const SCA_ALL = [...SCA_QUALITY, ...SCA_TEN];
const SCA_LABELS = {
    aroma: 'Fragrance/Aroma', flavor: 'Flavor', aftertaste: 'Aftertaste', acidity: 'Acidity',
    body: 'Body', balance: 'Balance', overall: 'Overall',
    uniformity: 'Uniformity', cleanCup: 'Clean Cup', sweetness: 'Sweetness'
};

// Official SCA final score (/100): sum of quality + ten-point attributes minus
// defects (taints ×2, faults ×4). Returns null until at least one quality score is set.
function computeScaTotal(s) {
    if (!s) return null;
    const hasQuality = SCA_QUALITY.some(k => s[k] != null && s[k] !== '' && !isNaN(Number(s[k])));
    if (!hasQuality) return null;
    let total = 0;
    SCA_QUALITY.forEach(k => { const v = Number(s[k]); if (!isNaN(v)) total += v; });
    SCA_TEN.forEach(k => { const v = Number(s[k]); total += isNaN(v) ? 10 : v; });
    total -= (Number(s.taints) || 0) * 2 + (Number(s.faults) || 0) * 4;
    return total;
}

// SCA Coffee Value Assessment (CVA, 2024) affective form: 8 attributes scored 1–9.
const CVA_ATTRS = ['cvaFragrance', 'cvaAroma', 'cvaFlavor', 'cvaAftertaste', 'cvaAcidity', 'cvaSweetness', 'cvaMouthfeel', 'cvaOverall'];
const CVA_LABELS = {
    cvaFragrance: 'Fragrance', cvaAroma: 'Aroma', cvaFlavor: 'Flavor', cvaAftertaste: 'Aftertaste',
    cvaAcidity: 'Acidity', cvaSweetness: 'Sweetness', cvaMouthfeel: 'Mouthfeel', cvaOverall: 'Overall'
};

// Official CVA cup score: 0.65625 × Σ(8 attrs, 1–9) + 52.75 − 2·nonUniform − 4·defective.
function computeCvaTotal(s) {
    if (!s) return null;
    const present = CVA_ATTRS.filter(k => s[k] != null && s[k] !== '' && !isNaN(Number(s[k])));
    if (present.length === 0) return null;
    const sum = CVA_ATTRS.reduce((a, k) => a + (Number(s[k]) || 0), 0);
    return 0.65625 * sum + 52.75 - 2 * (Number(s.cvaNonUniform) || 0) - 4 * (Number(s.cvaDefective) || 0);
}

const chip = (text) => `<span style="background: var(--accent); color: #000; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; margin-right: 5px;">${text}</span>`;

// Build a compact summary of whatever tasting data a roast has.
function tastingSummary(notes) {
    const parts = [];
    if (notes.emoji && EMOJI[notes.emoji]) parts.push(`<span style="font-size: 1.2rem;">${EMOJI[notes.emoji]}</span>`);
    const flavors = (notes.flavors || []).map(chip).join('');
    if (flavors) parts.push(flavors);
    if (notes.scores && notes.scores.total != null) {
        parts.push(chip(`Cupping ${Number(notes.scores.total).toFixed(2)}/${notes.scores.max || 80}`));
    }
    const bl = notes.brewLog;
    if (bl && bl.method) {
        let s = bl.method;
        if (bl.doseGrams && bl.yieldGrams) s += ` · ${bl.doseGrams}g→${bl.yieldGrams}g`;
        parts.push(chip(s));
    }
    return parts.length ? parts.join(' ') : '<em>No tasting data.</em>';
}

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

function renderStats() {
    const el = document.getElementById('statsSummary');
    if (!el) return;
    const history = getRoastHistory();
    const pantry = getPantry();
    if (!history.length) {
        el.innerHTML = '<p style="color: var(--text-muted);">No roasts yet.</p>';
        return;
    }

    const DAY = 86400000;
    const now = Date.now();
    let greenKg = 0, roastedKg = 0, spend = 0, lossSum = 0, lossN = 0, last30 = 0;
    history.forEach(r => {
        const g = Number(r.greenWeightG) || 0;
        const ro = Number(r.roastedWeightG) || 0;
        greenKg += g / 1000;
        roastedKg += ro / 1000;
        const bean = pantry.find(b => b.id === r.beanId);
        if (bean && bean.costPerKg && g) spend += (g / 1000) * bean.costPerKg;
        const loss = computeWeightLoss(g, ro);
        if (loss != null) { lossSum += loss; lossN++; }
        if (now - new Date(r.date).getTime() <= 30 * DAY) last30++;
    });

    el.innerHTML = `<ul>
        <li><strong>Roasts:</strong> ${history.length} (${last30} in last 30 days)</li>
        <li><strong>Green roasted:</strong> ${greenKg.toFixed(2)} kg</li>
        ${roastedKg ? `<li><strong>Roasted output:</strong> ${roastedKg.toFixed(2)} kg</li>` : ''}
        ${lossN ? `<li><strong>Avg weight loss:</strong> ${(lossSum / lossN).toFixed(1)}%</li>` : ''}
        ${spend ? `<li><strong>Total green spend:</strong> ${spend.toFixed(2)}</li>` : ''}
    </ul>`;
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

    const includePhotosCheck = document.getElementById('includePhotosCheck');

    exportBtn.addEventListener('click', async () => {
        const data = exportAllData();
        if (includePhotosCheck && includePhotosCheck.checked) {
            try { data.photos = await getAllPhotos(); } catch { /* photos optional */ }
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
        reader.onload = async () => {
            try {
                const parsed = JSON.parse(reader.result);
                const result = importAllData(parsed);
                let photoMsg = '';
                if (Array.isArray(parsed.photos)) {
                    await replaceAllPhotos(parsed.photos);
                    photoMsg = ` and ${parsed.photos.length} photo(s)`;
                }
                renderHistoryList();
                window.dispatchEvent(new Event('pantryUpdated'));
                window.dispatchEvent(new Event('settingsImported'));
                alert(`Imported ${result.pantry} bean(s), ${result.roasts} roast(s)${photoMsg}.`);
            } catch (err) {
                alert(`Import failed: ${err.message}`);
            }
            importInput.value = '';
        };
        reader.readAsText(file);
    });

    const sharedBtn = document.getElementById('importSharedBtn');
    const sharedInput = document.getElementById('importSharedInput');
    if (sharedBtn && sharedInput) {
        sharedBtn.addEventListener('click', () => sharedInput.click());
        sharedInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    importSharedRoast(JSON.parse(reader.result));
                } catch (err) {
                    alert(`Import failed: ${err.message}`);
                }
                sharedInput.value = '';
            };
            reader.readAsText(file);
        });
    }
}

// Export a single roast as a shareable file (no photos; includes the bean name).
function exportRoastShare(id) {
    const roast = getRoastHistory().find(r => r.id === id);
    if (!roast) return;
    const bean = getPantry().find(b => b.id === roast.beanId);
    const share = {
        type: 'roastShare',
        version: 1,
        exportedAt: new Date().toISOString(),
        beanName: bean ? bean.name : '',
        roast
    };
    const safe = (bean ? bean.name : 'roast').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    downloadText(`roast-share-${safe}.json`, JSON.stringify(share, null, 2), 'application/json');
}

// Import a shared roast: adds it to history (new id) without replacing anything,
// linking to a matching pantry bean by name or creating a minimal one.
function importSharedRoast(data) {
    if (!data || data.type !== 'roastShare' || !data.roast) {
        throw new Error('Not a shared-roast file.');
    }
    const roast = data.roast;
    roast.id = Date.now().toString();

    let beanId = '';
    if (data.beanName) {
        const existing = getPantry().find(b => b.name === data.beanName);
        beanId = existing ? existing.id : addBeanToPantry({ name: data.beanName, quantity: 0 }).id;
    }
    roast.beanId = beanId;

    const history = getRoastHistory();
    history.push(roast);
    saveRoastHistory(history);

    renderHistoryList();
    window.dispatchEvent(new Event('pantryUpdated'));
    window.dispatchEvent(new Event('historyUpdated'));
    alert(`Imported shared roast${data.beanName ? ` of ${data.beanName}` : ''}.`);
}

function renderHistoryList() {
    const historyContainer = document.getElementById('historyContainer');
    if (!historyContainer) return;

    const history = getRoastHistory();
    const pantry = getPantry();

    historyContainer.innerHTML = '';

    // Keep the comparison dropdowns, trend chart and summary in sync.
    populateCompareSelects();
    renderComparison();
    renderTrend();
    renderStats();

    if (history.length === 0) {
        historyContainer.innerHTML = '<p>No roasts yet — go to <strong>Active Roast</strong> and tap <strong>Start Roast &amp; Listening</strong>, or try the demo from the <strong>Help</strong> tab.</p>';
        return;
    }

    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    history.forEach(roast => {
        const bean = pantry.find(b => b.id === roast.beanId) || { name: 'Unknown Bean' };
        const card = document.createElement('div');
        card.className = 'card';

        const dateStr = new Date(roast.date).toLocaleString();

        const roasterDisplay = roast.roasterName || (roast.roaster || '').toUpperCase();
        let roasterInfo = `<strong>Roaster:</strong> ${roasterDisplay}`;
        if (roast.roaster === 'behmor' && roast.settings) {
            roasterInfo += ` (${weightLabel(roast.settings.weight, getWeightUnit())}, ${roast.settings.profile})`;
        }
        if (roast.greenWeightG) {
            roasterInfo += ` &middot; <strong>Green:</strong> ${roast.greenWeightG} g`;
        }
        if (roast.roastedWeightG) {
            roasterInfo += ` &middot; <strong>Roasted:</strong> ${roast.roastedWeightG} g`;
            const loss = computeWeightLoss(roast.greenWeightG, roast.roastedWeightG);
            if (loss != null) roasterInfo += ` &middot; <strong>Weight loss:</strong> ${formatPct(loss)}`;
        }
        if (bean.costPerKg && roast.greenWeightG) {
            const roastCost = (roast.greenWeightG / 1000) * bean.costPerKg;
            roasterInfo += ` &middot; <strong>Cost:</strong> ${roastCost.toFixed(2)}`;
            if (roast.roastedWeightG) {
                roasterInfo += ` (${(roastCost / (roast.roastedWeightG / 1000)).toFixed(2)}/kg roasted)`;
            }
        }

        const startTime = roast.timeline.startTime;
        const m = computeRoastMetrics(roast.timeline);

        let timelineHtml = `<ul><li><strong>Total Time:</strong> ${formatMs(m.totalMs)}</li>`;

        if (m.dryEndMs != null) {
            timelineHtml += `<li><strong>Dry End:</strong> ${formatMs(m.dryEndMs)}</li>`;
        }
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
        if (m.dryingPct != null && m.maillardPct != null && m.developmentPct != null) {
            timelineHtml += `<li><strong>Phases (dry/Maillard/dev):</strong> ${m.dryingPct.toFixed(0)}% / ${m.maillardPct.toFixed(0)}% / ${m.developmentPct.toFixed(0)}%</li>`;
        }
        const temps = roast.timeline.temps || [];
        if (temps.length > 0) {
            const unit = roast.timeline.tempUnit || 'C';
            const rorPts = computeRoRPoints(temps);
            const lastRor = rorPts.length ? formatRoR(rorPts[rorPts.length - 1].ror).replace('°', `°${unit}`) : '--';
            timelineHtml += `<li><strong>Temp readings:</strong> ${temps.length} (last RoR ${lastRor})</li>`;
        }
        const envTemps = roast.timeline.envTemps || [];
        if (envTemps.length > 0) {
            timelineHtml += `<li><strong>ET readings:</strong> ${envTemps.length}</li>`;
        }
        timelineHtml += '</ul>';

        const logsHtml = roast.timeline.logs.map(l => `<div><small>${l}</small></div>`).join('');

        // Tasting Notes Section
        let notes = roast.tastingNotes || { flavors: [], text: '' };
        const flavorsHtml = tastingSummary(notes);

        // Roasted rest/peak badge — how the beans are resting since this roast.
        const rest = roastRest(new Date(roast.date).getTime());
        let restBadge = '';
        if (rest) {
            const c = rest.phase === 'peak' ? 'var(--success)' : (rest.phase === 'past' ? 'var(--text-muted)' : 'var(--accent)');
            const icon = rest.phase === 'peak' ? '☕' : (rest.phase === 'past' ? '·' : '⏳');
            restBadge = `<div style="font-size: 0.8rem; color: ${c};">${icon} ${rest.text}</div>`;
        }

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between;">
                <h3>${bean.name}</h3>
                <div style="text-align: right;"><small>${dateStr}</small>${restBadge}</div>
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
                <button class="add-photo-btn" data-id="${roast.id}" data-hint="Just snap a quick photo of the roasted beans. No colour correction — good for a visual record." style="font-size: 0.8rem; padding: 5px 10px;">Add Photo</button>
                <button class="add-calibrated-btn" data-id="${roast.id}" data-hint="Easiest colour reading: photograph a plain grey or white card, then the beans, under the same light. The app evens out the lighting and gives a roast-colour number you can compare between batches." style="font-size: 0.8rem; padding: 5px 10px;">Add Colour-Corrected Photo</button>
                <button class="add-colorchecker-btn" data-id="${roast.id}" data-hint="Most accurate: if you own a 24-patch ColorChecker card, photograph it with the beans and tap its 4 corners. Overkill for most home roasters." style="font-size: 0.8rem; padding: 5px 10px;">Add ColorChecker Photo</button>
                <button class="add-customtarget-btn" data-id="${roast.id}" data-hint="Make a cheap DIY card from a few paint swatches, calibrate it once in daylight, then reuse it to colour-correct future photos. See Help → Roast-colour photos." style="font-size: 0.8rem; padding: 5px 10px;">Add Custom-Target Photo</button>
                <input type="file" class="photo-input" data-id="${roast.id}" accept="image/*" capture="environment" style="display: none;">
            </div>

            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px;">
                <button class="log-yield-btn" data-id="${roast.id}" data-hint="Weigh the cooled beans and enter the grams to get your weight-loss % — a key consistency number (usually 12–20%).">Log Roasted Weight</button>
                ${roast.roaster === 'behmor' && roast.timeline.curve && roast.timeline.curve.length >= 2 ? `<button class="save-template-btn" data-id="${roast.id}">Save as Behmor template</button>` : ''}
                ${roast.timeline.powerLog && roast.timeline.powerLog.length ? `<button class="save-manual-btn" data-id="${roast.id}">Save manual profile</button>` : ''}
                <button class="export-btn" data-id="${roast.id}">Export to Clipboard</button>
                <button class="export-csv-btn" data-id="${roast.id}">Export CSV</button>
                <button class="share-roast-btn" data-id="${roast.id}" data-hint="Save this single roast as a file you can send to someone — they import it without affecting their own history.">Share (file)</button>
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

    document.querySelectorAll('.add-colorchecker-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openColorCheckerModal(e.target.dataset.id));
    });

    document.querySelectorAll('.add-customtarget-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openCustomTargetModal(e.target.dataset.id));
    });

    document.querySelectorAll('.export-btn').forEach(btn => {
        btn.addEventListener('click', (e) => exportRoast(e.target.dataset.id));
    });

    document.querySelectorAll('.export-csv-btn').forEach(btn => {
        btn.addEventListener('click', (e) => exportRoastCsv(e.target.dataset.id));
    });

    document.querySelectorAll('.share-roast-btn').forEach(btn => {
        btn.addEventListener('click', (e) => exportRoastShare(e.target.dataset.id));
    });

    document.querySelectorAll('.log-yield-btn').forEach(btn => {
        btn.addEventListener('click', (e) => logRoastedWeight(e.target.dataset.id));
    });

    document.querySelectorAll('.save-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => saveBehmorTemplateFromRoast(e.target.dataset.id));
    });

    document.querySelectorAll('.save-manual-btn').forEach(btn => {
        btn.addEventListener('click', (e) => saveManualProfileFromRoast(e.target.dataset.id));
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
            const typeLabel = { colorchecker: 'CC', customtarget: 'CT' }[p.meta.type] || 'WB';
            cap.textContent = `${typeLabel} · ${p.meta.brightness}`;
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

function openColorCheckerModal(roastId) {
    const modalBg = document.createElement('div');
    modalBg.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;';

    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.cssText = 'width: 90%; max-width: 460px; max-height: 90vh; overflow-y: auto;';
    modal.innerHTML = `
        <h3>ColorChecker Photo</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted);">
            Photograph a 24-patch ColorChecker and the beans under the same light. The chart is
            used to fit a full colour correction (more accurate than a single grey card).
        </p>
        <label><strong>1. ColorChecker photo</strong></label>
        <input type="file" id="ccChartInput" accept="image/*" capture="environment">
        <div id="ccCanvasWrap" style="display: none; margin-bottom: 10px;">
            <p style="font-size: 0.85rem;">Tap the centre of the 4 corner patches in order:
            <strong>1)</strong> dark-brown (top-left), <strong>2)</strong> bluish-green (top-right),
            <strong>3)</strong> black (bottom-right), <strong>4)</strong> white (bottom-left).
            <button id="ccReset" type="button" style="font-size: 0.75rem; padding: 3px 8px;">Reset taps</button></p>
            <canvas id="ccCanvas" style="width: 100%; border: 1px solid var(--border-color); cursor: crosshair; height: auto;"></canvas>
            <small id="ccTapStatus" style="color: var(--text-muted);">0 / 4 corners tapped</small>
        </div>
        <label><strong>2. Beans photo</strong></label>
        <input type="file" id="ccBeanInput" accept="image/*" capture="environment">
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px;">
            <button id="ccCancel" class="danger">Cancel</button>
            <button id="ccProcess" style="background-color: var(--success);">Process</button>
        </div>
    `;

    modalBg.appendChild(modal);
    document.body.appendChild(modalBg);

    const close = () => document.body.removeChild(modalBg);
    modal.querySelector('#ccCancel').addEventListener('click', close);

    const chartInput = modal.querySelector('#ccChartInput');
    const canvasWrap = modal.querySelector('#ccCanvasWrap');
    const canvas = modal.querySelector('#ccCanvas');
    const tapStatus = modal.querySelector('#ccTapStatus');
    const ctx = canvas.getContext('2d');
    let chartImg = null;
    let corners = []; // {x, y} fractions 0..1

    const redraw = () => {
        if (!chartImg) return;
        ctx.drawImage(chartImg, 0, 0, canvas.width, canvas.height);
        corners.forEach((c, i) => {
            const x = c.x * canvas.width, y = c.y * canvas.height;
            ctx.fillStyle = '#ff9800';
            ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(i + 1), x, y);
        });
        tapStatus.textContent = `${corners.length} / 4 corners tapped`;
    };

    chartInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                chartImg = img;
                const w = Math.min(360, img.width);
                canvas.width = w;
                canvas.height = Math.round(img.height * (w / img.width));
                corners = [];
                canvasWrap.style.display = 'block';
                redraw();
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });

    canvas.addEventListener('click', (e) => {
        if (corners.length >= 4) return;
        const rect = canvas.getBoundingClientRect();
        corners.push({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
        redraw();
    });

    modal.querySelector('#ccReset').addEventListener('click', () => { corners = []; redraw(); });

    modal.querySelector('#ccProcess').addEventListener('click', async () => {
        const chartFile = chartInput.files[0];
        const beanFile = modal.querySelector('#ccBeanInput').files[0];
        if (!chartFile || !beanFile) { alert('Please provide both a ColorChecker photo and a beans photo.'); return; }
        if (corners.length !== 4) { alert('Please tap all 4 corner patches on the ColorChecker.'); return; }
        try {
            const [tl, tr, br, bl] = corners;
            const { dataURL, meta } = await createColorCheckerPhoto(chartFile, beanFile, { tl, tr, br, bl });
            await addPhoto(roastId, dataURL, meta);
            close();
            renderPhotos(roastId, document.querySelector(`.roast-photos[data-id="${roastId}"]`));
        } catch (err) {
            alert(`Could not process photos: ${err.message}`);
        }
    });
}

function openCustomTargetModal(roastId) {
    const modalBg = document.createElement('div');
    modalBg.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;';

    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.cssText = 'width: 90%; max-width: 460px; max-height: 90vh; overflow-y: auto;';
    modal.innerHTML = `
        <h3>Custom Target Photo</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted);">
            Use a cheap DIY swatch card (e.g. 4–6 paint chips on card). Calibrate it once under
            good neutral daylight, then re-shoot it next to your beans under any light to colour-correct
            them. A neutral grey ramp (white → mid grey → near-black) is most reliable; add a warm and a
            cool chip for better colour. You need at least 4 patches with good spread.
        </p>

        <label><strong>Target</strong></label>
        <select id="ctTarget"></select>

        <div id="ctNewFields" style="display: none; margin-top: 6px;">
            <label style="font-size: 0.85rem;">Name</label>
            <input type="text" id="ctName" placeholder="e.g. Bunnings grey ramp">
            <div style="display: flex; gap: 10px;">
                <div style="flex: 1;"><label style="font-size: 0.85rem;">Columns</label><input type="number" id="ctCols" min="1" max="12" value="4"></div>
                <div style="flex: 1;"><label style="font-size: 0.85rem;">Rows</label><input type="number" id="ctRows" min="1" max="12" value="1"></div>
            </div>
        </div>

        <label><strong>1. Target photo</strong> <span id="ctChartHint" style="font-weight: normal; color: var(--text-muted); font-size: 0.8rem;"></span></label>
        <input type="file" id="ctChartInput" accept="image/*" capture="environment">
        <div id="ctCanvasWrap" style="display: none; margin-bottom: 10px;">
            <p style="font-size: 0.85rem;">Tap the centre of the 4 corner patches in order:
            <strong>1)</strong> top-left, <strong>2)</strong> top-right, <strong>3)</strong> bottom-right, <strong>4)</strong> bottom-left.
            <button id="ctReset" type="button" style="font-size: 0.75rem; padding: 3px 8px;">Reset taps</button></p>
            <canvas id="ctCanvas" style="width: 100%; border: 1px solid var(--border-color); cursor: crosshair; height: auto;"></canvas>
            <small id="ctTapStatus" style="color: var(--text-muted);">0 / 4 corners tapped</small>
        </div>

        <div id="ctBeanRow">
            <label><strong>2. Beans photo</strong></label>
            <input type="file" id="ctBeanInput" accept="image/*" capture="environment">
        </div>

        <div style="display: flex; gap: 10px; align-items: center; margin-top: 15px;">
            <button id="ctDelete" class="danger" style="font-size: 0.8rem; display: none;">Delete target</button>
            <div style="display: flex; gap: 10px; margin-left: auto;">
                <button id="ctCancel" class="danger">Cancel</button>
                <button id="ctSave" style="background-color: var(--accent); display: none;">Save calibration</button>
                <button id="ctProcess" style="background-color: var(--success);">Process</button>
            </div>
        </div>
    `;

    modalBg.appendChild(modal);
    document.body.appendChild(modalBg);

    const close = () => document.body.removeChild(modalBg);
    modal.querySelector('#ctCancel').addEventListener('click', close);

    const targetSelect = modal.querySelector('#ctTarget');
    const newFields = modal.querySelector('#ctNewFields');
    const beanRow = modal.querySelector('#ctBeanRow');
    const chartHint = modal.querySelector('#ctChartHint');
    const saveBtn = modal.querySelector('#ctSave');
    const processBtn = modal.querySelector('#ctProcess');
    const deleteBtn = modal.querySelector('#ctDelete');

    const chartInput = modal.querySelector('#ctChartInput');
    const canvasWrap = modal.querySelector('#ctCanvasWrap');
    const canvas = modal.querySelector('#ctCanvas');
    const tapStatus = modal.querySelector('#ctTapStatus');
    const ctx = canvas.getContext('2d');
    let chartImg = null;
    let corners = []; // {x, y} fractions 0..1

    const populateTargets = (selectId) => {
        const targets = getColorTargets();
        targetSelect.innerHTML =
            targets.map(t => `<option value="${t.id}">${t.name} (${t.cols}×${t.rows})</option>`).join('') +
            '<option value="new">＋ Calibrate new target…</option>';
        targetSelect.value = selectId || (targets.length ? targets[0].id : 'new');
        syncMode();
    };

    // Toggle between "calibrate a new target" and "use a saved target".
    const syncMode = () => {
        const isNew = targetSelect.value === 'new';
        newFields.style.display = isNew ? 'block' : 'none';
        beanRow.style.display = isNew ? 'none' : 'block';
        saveBtn.style.display = isNew ? 'inline-block' : 'none';
        processBtn.style.display = isNew ? 'none' : 'inline-block';
        deleteBtn.style.display = isNew ? 'none' : 'inline-block';
        chartHint.textContent = isNew ? '(shoot under good daylight)' : '(re-shoot under your beans’ light)';
    };

    targetSelect.addEventListener('change', syncMode);
    populateTargets();

    const redraw = () => {
        if (!chartImg) return;
        ctx.drawImage(chartImg, 0, 0, canvas.width, canvas.height);
        corners.forEach((c, i) => {
            const x = c.x * canvas.width, y = c.y * canvas.height;
            ctx.fillStyle = '#ff9800';
            ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(i + 1), x, y);
        });
        tapStatus.textContent = `${corners.length} / 4 corners tapped`;
    };

    chartInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                chartImg = img;
                const w = Math.min(360, img.width);
                canvas.width = w;
                canvas.height = Math.round(img.height * (w / img.width));
                corners = [];
                canvasWrap.style.display = 'block';
                redraw();
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });

    canvas.addEventListener('click', (e) => {
        if (corners.length >= 4) return;
        const rect = canvas.getBoundingClientRect();
        corners.push({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
        redraw();
    });

    modal.querySelector('#ctReset').addEventListener('click', () => { corners = []; redraw(); });

    // Calibrate and save a new target from the daylight photo.
    saveBtn.addEventListener('click', async () => {
        const name = modal.querySelector('#ctName').value.trim();
        const cols = parseInt(modal.querySelector('#ctCols').value, 10);
        const rows = parseInt(modal.querySelector('#ctRows').value, 10);
        const chartFile = chartInput.files[0];
        if (!name) { alert('Give the target a name.'); return; }
        if (!(cols >= 1) || !(rows >= 1) || cols * rows < 4) { alert('Use at least 4 patches in total (e.g. 4 columns × 1 row).'); return; }
        if (!chartFile) { alert('Add a photo of the target.'); return; }
        if (corners.length !== 4) { alert('Tap all 4 corner patches on the target.'); return; }
        try {
            const [tl, tr, br, bl] = corners;
            const { reference } = await calibrateCustomTarget(chartFile, { tl, tr, br, bl }, cols, rows);
            const saved = addColorTarget({ name, cols, rows, reference });
            chartImg = null; corners = []; chartInput.value = ''; canvasWrap.style.display = 'none';
            populateTargets(saved.id);
            alert(`Calibrated "${name}" (${cols}×${rows}, ${reference.length} patches). Now re-shoot it with your beans to colour-correct.`);
        } catch (err) {
            alert(`Could not calibrate target: ${err.message}`);
        }
    });

    // Correct a bean photo using a saved target re-shot under the current light.
    processBtn.addEventListener('click', async () => {
        const target = getColorTargets().find(t => t.id === targetSelect.value);
        if (!target) { alert('Select a saved target, or calibrate a new one first.'); return; }
        const chartFile = chartInput.files[0];
        const beanFile = modal.querySelector('#ctBeanInput').files[0];
        if (!chartFile || !beanFile) { alert('Provide both a photo of the target and a beans photo.'); return; }
        if (corners.length !== 4) { alert('Tap all 4 corner patches on the target.'); return; }
        try {
            const [tl, tr, br, bl] = corners;
            const { dataURL, meta } = await createCustomTargetPhoto(chartFile, beanFile, { tl, tr, br, bl }, target);
            await addPhoto(roastId, dataURL, meta);
            close();
            renderPhotos(roastId, document.querySelector(`.roast-photos[data-id="${roastId}"]`));
        } catch (err) {
            alert(`Could not process photos: ${err.message}`);
        }
    });

    deleteBtn.addEventListener('click', () => {
        const target = getColorTargets().find(t => t.id === targetSelect.value);
        if (!target) return;
        if (confirm(`Delete the saved target "${target.name}"?`)) {
            deleteColorTarget(target.id);
            populateTargets();
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

    const scores = { ...(notes.scores || {}) };
    const brew = { ...(notes.brewLog || {}) };
    let selectedFlavors = [...(notes.flavors || [])];
    let selectedEmoji = notes.emoji || null;

    // Flavor wheel buttons
    let flavorsHtml = '';
    for (const [category, subFlavors] of Object.entries(flavorWheel)) {
        flavorsHtml += `<h5>${category}</h5><div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px;">`;
        subFlavors.forEach(f => {
            const sel = selectedFlavors.includes(f) ? 'background-color: var(--accent); color: #000;' : 'background-color: var(--bg-color); color: var(--text-main);';
            flavorsHtml += `<button type="button" class="flavor-btn" data-flavor="${f}" style="${sel} border: 1px solid var(--border-color); padding: 5px; border-radius: 4px; cursor: pointer;">${f}</button>`;
        });
        flavorsHtml += `</div>`;
    }

    const emojiHtml = Object.entries(EMOJI).map(([k, e]) =>
        `<button type="button" class="emoji-btn" data-emoji="${k}" style="font-size: 1.6rem; padding: 6px 12px; border: 2px solid ${selectedEmoji === k ? 'var(--accent)' : 'var(--border-color)'}; border-radius: 6px; background: var(--bg-color); cursor: pointer;">${e}</button>`
    ).join(' ');

    const scaRow = (k, min, step, dflt) =>
        `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <label style="flex: 1;">${SCA_LABELS[k]}</label>
            <input type="number" class="sca-input" id="sca-${k}" min="${min}" max="10" step="${step}" value="${scores[k] ?? dflt}" style="width: 80px; margin-bottom: 0;">
        </div>`;
    const scoreHtml =
        SCA_QUALITY.map(k => scaRow(k, 6, 0.25, '')).join('') +
        SCA_TEN.map(k => scaRow(k, 0, 1, 10)).join('') +
        `<h5 style="margin-top: 8px;">Defects (cups affected)</h5>
         <div style="display: flex; gap: 10px;">
            <div style="flex: 1;"><label>Taints (×2)</label><input type="number" class="sca-input" id="sca-taints" min="0" step="1" value="${scores.taints ?? 0}"></div>
            <div style="flex: 1;"><label>Faults (×4)</label><input type="number" class="sca-input" id="sca-faults" min="0" step="1" value="${scores.faults ?? 0}"></div>
         </div>`;

    const cvaHtml =
        CVA_ATTRS.map(k =>
            `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <label style="flex: 1;">${CVA_LABELS[k]}</label>
                <input type="number" class="cva-input" id="${k}" min="1" max="9" step="1" value="${scores[k] ?? ''}" style="width: 80px; margin-bottom: 0;">
            </div>`).join('') +
        `<h5 style="margin-top: 8px;">Cups affected (of 5)</h5>
         <div style="display: flex; gap: 10px;">
            <div style="flex: 1;"><label>Non-uniform (×2)</label><input type="number" class="cva-input" id="cvaNonUniform" min="0" max="5" step="1" value="${scores.cvaNonUniform ?? 0}"></div>
            <div style="flex: 1;"><label>Defective (×4)</label><input type="number" class="cva-input" id="cvaDefective" min="0" max="5" step="1" value="${scores.cvaDefective ?? 0}"></div>
         </div>`;

    const cuppingForm = scores.form === 'cva' ? 'cva' : 'classic';

    const methodOptions = ['<option value="">Select method…</option>']
        .concat(BREW_METHODS.map(m => `<option value="${m}"${brew.method === m ? ' selected' : ''}>${m}</option>`)).join('');

    modal.innerHTML = `
        <h3>Tasting Notes</h3>
        <label for="tastingTier"><strong>Detail level</strong></label>
        <select id="tastingTier">
            <option value="easy">Easy</option>
            <option value="moderate">Moderate</option>
            <option value="expert">Expert</option>
        </select>

        <div class="ts-emoji" style="margin-bottom: 15px;">
            <h4>Overall impression</h4>
            <div style="display: flex; gap: 10px;">${emojiHtml}</div>
        </div>

        <div class="ts-flavors" style="margin-bottom: 15px;">
            <h4>Flavor Wheel</h4>
            ${flavorsHtml}
        </div>

        <div class="ts-brew-basic" style="margin-bottom: 15px;">
            <label for="brewMethod"><strong>Brew method</strong></label>
            <select id="brewMethod">${methodOptions}</select>
        </div>

        <div class="ts-scores" style="margin-bottom: 15px;">
            <h4>Cupping Score</h4>
            <label for="cuppingForm">Form</label>
            <select id="cuppingForm">
                <option value="classic"${cuppingForm === 'classic' ? ' selected' : ''}>SCA 100-point (classic)</option>
                <option value="cva"${cuppingForm === 'cva' ? ' selected' : ''}>CVA Affective (2024)</option>
            </select>
            <div id="ccClassic" style="margin-top: 8px;">
                <small style="color: var(--text-muted);">Quality attributes 6.00–10.00 (0.25 steps). Uniformity / Clean Cup / Sweetness default to 10; defects subtracted.</small>
                <div style="margin-top: 8px;">${scoreHtml}</div>
            </div>
            <div id="ccCva" style="margin-top: 8px;">
                <small style="color: var(--text-muted);">8 attributes scored 1–9 (impression of quality).</small>
                <div style="margin-top: 8px;">${cvaHtml}</div>
            </div>
            <p style="margin-top: 8px;"><strong>Final score: <span id="cupTotal">--</span> / 100</strong></p>
        </div>

        <div class="ts-brew-expert" style="margin-bottom: 15px;">
            <h4>Brew Parameters</h4>
            <div style="display: flex; gap: 10px;">
                <div style="flex: 1;"><label>Dose (g)</label><input type="number" id="brewDose" step="0.1" value="${brew.doseGrams ?? ''}"></div>
                <div style="flex: 1;"><label>Yield (g)</label><input type="number" id="brewYield" step="1" value="${brew.yieldGrams ?? ''}"></div>
            </div>
            <div style="display: flex; gap: 10px;">
                <div style="flex: 1;"><label>Water temp</label><input type="number" id="brewTemp" step="1" value="${brew.temperature ?? ''}"></div>
                <div style="flex: 0 0 70px;"><label>Unit</label>
                    <select id="brewTempUnit">
                        <option value="C"${brew.temperatureUnit !== 'F' ? ' selected' : ''}>°C</option>
                        <option value="F"${brew.temperatureUnit === 'F' ? ' selected' : ''}>°F</option>
                    </select>
                </div>
            </div>
            <label>Grind setting</label><input type="text" id="brewGrind" value="${brew.grindSize ?? ''}">
        </div>

        <label for="modalNotesText"><strong>Notes</strong></label>
        <textarea id="modalNotesText" rows="4" placeholder="General impressions, etc.">${notes.text || ''}</textarea>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="modalCancel" class="danger">Cancel</button>
            <button id="modalSave" style="background-color: var(--success);">Save</button>
        </div>
    `;

    modalBg.appendChild(modal);
    document.body.appendChild(modalBg);

    // Show/hide sections by the selected detail level (one-off override of the global tier).
    const tierSel = modal.querySelector('#tastingTier');
    tierSel.value = getEffectiveTier('tasting');
    const applyTier = (t) => {
        modal.querySelector('.ts-emoji').style.display = t === 'easy' ? 'block' : 'none';
        modal.querySelector('.ts-flavors').style.display = t === 'easy' ? 'none' : 'block';
        modal.querySelector('.ts-brew-basic').style.display = t === 'easy' ? 'none' : 'block';
        modal.querySelector('.ts-scores').style.display = t === 'expert' ? 'block' : 'none';
        modal.querySelector('.ts-brew-expert').style.display = t === 'expert' ? 'block' : 'none';
    };
    applyTier(tierSel.value);
    tierSel.addEventListener('change', () => applyTier(tierSel.value));

    modal.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedEmoji = selectedEmoji === btn.dataset.emoji ? null : btn.dataset.emoji;
            modal.querySelectorAll('.emoji-btn').forEach(b =>
                b.style.borderColor = (b.dataset.emoji === selectedEmoji) ? 'var(--accent)' : 'var(--border-color)');
        });
    });

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

    const formSel = modal.querySelector('#cuppingForm');
    const applyForm = (f) => {
        modal.querySelector('#ccClassic').style.display = f === 'cva' ? 'none' : 'block';
        modal.querySelector('#ccCva').style.display = f === 'cva' ? 'block' : 'none';
    };
    applyForm(formSel.value);

    const readClassic = () => {
        const s = {};
        SCA_ALL.forEach(k => { const v = parseFloat(modal.querySelector(`#sca-${k}`).value); if (!isNaN(v)) s[k] = v; });
        s.taints = parseInt(modal.querySelector('#sca-taints').value, 10) || 0;
        s.faults = parseInt(modal.querySelector('#sca-faults').value, 10) || 0;
        return s;
    };
    const readCva = () => {
        const s = {};
        CVA_ATTRS.forEach(k => { const v = parseFloat(modal.querySelector(`#${k}`).value); if (!isNaN(v)) s[k] = v; });
        s.cvaNonUniform = parseInt(modal.querySelector('#cvaNonUniform').value, 10) || 0;
        s.cvaDefective = parseInt(modal.querySelector('#cvaDefective').value, 10) || 0;
        return s;
    };
    const buildScores = () => {
        if (formSel.value === 'cva') {
            const s = readCva();
            const total = computeCvaTotal(s);
            return total != null ? { ...s, form: 'cva', total, max: 100 } : undefined;
        }
        const s = readClassic();
        const total = computeScaTotal(s);
        return total != null ? { ...s, form: 'classic', total, max: 100 } : undefined;
    };
    const updateTotal = () => {
        const s = buildScores();
        modal.querySelector('#cupTotal').textContent = s ? Number(s.total).toFixed(2) : '--';
    };
    modal.querySelectorAll('.sca-input, .cva-input').forEach(inp => inp.addEventListener('input', updateTotal));
    formSel.addEventListener('change', () => { applyForm(formSel.value); updateTotal(); });
    updateTotal();

    modal.querySelector('#modalCancel').addEventListener('click', () => document.body.removeChild(modalBg));

    modal.querySelector('#modalSave').addEventListener('click', () => {
        // Build scores from whichever cupping form is active.
        const scores = buildScores();

        const num = (id) => { const v = parseFloat(modal.querySelector(id).value); return isNaN(v) ? undefined : v; };
        const brewLog = {
            method: modal.querySelector('#brewMethod').value || undefined,
            doseGrams: num('#brewDose'),
            yieldGrams: num('#brewYield'),
            temperature: num('#brewTemp'),
            temperatureUnit: modal.querySelector('#brewTempUnit').value,
            grindSize: modal.querySelector('#brewGrind').value.trim() || undefined
        };
        const hasBrew = brewLog.method || brewLog.doseGrams != null || brewLog.yieldGrams != null || brewLog.temperature != null || brewLog.grindSize;

        roast.tastingNotes = {
            flavors: selectedFlavors,
            text: modal.querySelector('#modalNotesText').value,
            emoji: selectedEmoji || undefined,
            scores,
            brewLog: hasBrew ? brewLog : undefined
        };
        updateRoastInHistory(roast);
        document.body.removeChild(modalBg);
        renderHistoryList();
    });
}

function saveManualProfileFromRoast(id) {
    const roast = getRoastHistory().find(r => r.id === id);
    if (!roast || !roast.timeline.powerLog || !roast.timeline.powerLog.length) {
        alert('This roast has no recorded manual power changes to save.');
        return;
    }

    const pantry = getPantry();
    const bean = pantry.find(b => b.id === roast.beanId) || { name: 'Unknown Bean' };
    const suggested = `${bean.name}, ${new Date(roast.date).toLocaleDateString()}`;
    const name = prompt('Name this manual profile:', suggested);
    if (!name) return;

    const start = roast.timeline.startTime;
    saveManualProfile({
        id: Date.now().toString(),
        name,
        weight: roast.settings && roast.settings.weight,
        powerLog: roast.timeline.powerLog,
        curve: roast.timeline.curve || [],
        firstCrackMs: roast.timeline.firstCrackTime ? roast.timeline.firstCrackTime - start : null,
        secondCrackMs: roast.timeline.secondCrackTime ? roast.timeline.secondCrackTime - start : null,
        totalMs: roast.timeline.endTime - start,
        savedAt: Date.now()
    });

    window.dispatchEvent(new Event('historyUpdated'));
    alert(`Saved manual profile "${name}". Select it under "Follow reference roast" to get timed power cues.`);
}

function saveBehmorTemplateFromRoast(id) {
    const roast = getRoastHistory().find(r => r.id === id);
    if (!roast) return;

    const profile = roast.settings && roast.settings.profile;
    const weight = roast.settings && roast.settings.weight;
    if (!profile || !weight || profile === 'unknown' || weight === 'unknown') {
        alert('This roast has no Behmor profile/weight recorded, so it cannot be saved as a template.');
        return;
    }
    if (!roast.timeline.curve || roast.timeline.curve.length < 2) {
        alert('This roast has no curve data to use as a template.');
        return;
    }

    const label = weightLabel(weight, getWeightUnit());
    if (getBehmorTemplates()[`${profile}|${weight}`] &&
        !confirm(`A template already exists for ${profile} @ ${label}. Replace it?`)) {
        return;
    }

    const pantry = getPantry();
    const bean = pantry.find(b => b.id === roast.beanId) || { name: 'Unknown Bean' };
    const start = roast.timeline.startTime;
    saveBehmorTemplate(profile, weight, {
        curve: roast.timeline.curve,
        firstCrackMs: roast.timeline.firstCrackTime ? roast.timeline.firstCrackTime - start : null,
        secondCrackMs: roast.timeline.secondCrackTime ? roast.timeline.secondCrackTime - start : null,
        totalMs: roast.timeline.endTime - start,
        name: `${bean.name}, ${new Date(roast.date).toLocaleDateString()}`,
        savedFrom: id,
        savedAt: Date.now()
    });

    window.dispatchEvent(new Event('historyUpdated'));
    window.dispatchEvent(new Event('behmorConfigChanged'));
    alert(`Saved as the Behmor ${profile} @ ${label} template. It will auto-load when you select that profile and weight.`);
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
    if (roast.timeline.dryEndTime) rows.push({ t: (roast.timeline.dryEndTime - start) / 1000, rms: '', temp: '', ror: '', event: 'Dry End' });
    if (roast.timeline.firstCrackTime) rows.push({ t: (roast.timeline.firstCrackTime - start) / 1000, rms: '', temp: '', ror: '', event: 'First Crack' });
    if (roast.timeline.secondCrackTime) rows.push({ t: (roast.timeline.secondCrackTime - start) / 1000, rms: '', temp: '', ror: '', event: 'Second Crack' });
    if (roast.timeline.endTime) rows.push({ t: (roast.timeline.endTime - start) / 1000, rms: '', temp: '', ror: '', event: 'End' });
    (roast.timeline.powerLog || []).forEach(p => rows.push({ t: p.t / 1000, rms: '', temp: '', ror: '', event: `Power ${p.power}%` }));
    (roast.timeline.envTemps || []).forEach(p => rows.push({ t: p.t / 1000, rms: '', temp: '', ror: '', env: p.temp, event: '' }));
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
    csv += `time_s,energy_rms,temp_${unit},ror_${unit}_per_min,env_${unit},event\n`;
    rows.forEach(r => {
        const rms = r.rms === '' ? '' : Number(r.rms).toFixed(4);
        const ror = r.ror === '' ? '' : Number(r.ror).toFixed(1);
        csv += `${r.t.toFixed(1)},${rms},${r.temp},${ror},${r.env ?? ''},${r.event}\n`;
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
    if (m.dryEndMs != null) text += `- Dry End: ${formatMs(m.dryEndMs)}\n`;
    if (m.timeToFirstCrackMs != null) text += `- First Crack: ${formatMs(m.timeToFirstCrackMs)}\n`;
    if (m.secondCrackMs != null) text += `- Second Crack: ${formatMs(m.secondCrackMs)}\n`;
    text += `- Total Time: ${formatMs(m.totalMs)}\n`;
    if (m.developmentTimeMs != null) {
        text += `- Development Time: ${formatMs(m.developmentTimeMs)}\n`;
        text += `- Development Ratio (DTR): ${formatDtr(m.dtr)}\n`;
    }
    if (m.dryingPct != null && m.maillardPct != null && m.developmentPct != null) {
        text += `- Phases (dry/Maillard/dev): ${m.dryingPct.toFixed(0)}% / ${m.maillardPct.toFixed(0)}% / ${m.developmentPct.toFixed(0)}%\n`;
    }

    if (roast.tastingNotes) {
        const tn = roast.tastingNotes;
        text += `\nTasting Notes:\n`;
        if (tn.emoji && EMOJI[tn.emoji]) text += `Impression: ${EMOJI[tn.emoji]}\n`;
        if (tn.flavors && tn.flavors.length > 0) text += `Flavors: ${tn.flavors.join(', ')}\n`;
        if (tn.scores && tn.scores.total != null) {
            const sc = tn.scores;
            const cva = sc.form === 'cva';
            text += `Cupping (${cva ? 'CVA 2024' : 'SCA classic'}): ${Number(sc.total).toFixed(2)} / ${sc.max || 80}\n`;
            const attrs = cva ? CVA_ATTRS : SCA_ALL;
            const labels = cva ? CVA_LABELS : SCA_LABELS;
            text += attrs.filter(k => sc[k] != null).map(k => `  - ${labels[k] || k}: ${sc[k]}`).join('\n');
            if (cva && (sc.cvaNonUniform || sc.cvaDefective)) text += `\n  - cups: ${sc.cvaNonUniform || 0} non-uniform, ${sc.cvaDefective || 0} defective`;
            if (!cva && (sc.taints || sc.faults)) text += `\n  - defects: ${sc.taints || 0} taint, ${sc.faults || 0} fault`;
            text += '\n';
        }
        if (tn.brewLog && tn.brewLog.method) {
            const b = tn.brewLog;
            let line = `Brew: ${b.method}`;
            if (b.doseGrams && b.yieldGrams) line += ` (${b.doseGrams}g → ${b.yieldGrams}g)`;
            if (b.temperature != null) line += ` @ ${b.temperature}°${b.temperatureUnit || 'C'}`;
            if (b.grindSize) line += `, grind ${b.grindSize}`;
            text += line + '\n';
        }
        if (tn.text) text += `${tn.text}\n`;
    }

    text += `\nLogs:\n${roast.timeline.logs.join('\n')}`;

    navigator.clipboard.writeText(text).then(() => {
        alert('Roast summary copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy to clipboard.');
    });
}