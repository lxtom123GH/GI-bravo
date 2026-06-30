// Batch planner. Helps pick a roast size that (a) fits the roaster's drum, (b) divides
// the bag you bought with little leftover, so you don't end up with awkward runt batches.
// e.g. 2.5 kg at 450 g → 5 roasts + a 250 g runt; at ~417 g → 6 even roasts, ~0 left.
// (Freshness still matters: roast ~what you'll drink in ~2 weeks — see ROASTER_JOURNEY.md.)

import { getActiveRoaster, getLastGreenWeight } from './storage.js';
import { escapeHtml } from './escape.js';

// Drum capacity per roaster MODEL (grams), the default when a profile doesn't set its own.
// Behmor 2000AB Plus: ~100 g min (it roasts 1/4 lb / ~113 g and ~100 g samples) to 454 g
// (1 lb) — verified vs the Behmor manual / Sweet Maria's. KKTO varies by build, so treat
// its value as an editable estimate (set per profile).
const CAPACITY = {
    behmor: { min: 100, max: 454 },
    kkto: { min: 300, max: 800 } // Koffee Kosmo Turbo Oven: 300–700 g (sweet spot 500–650), ~800 g advanced
};
export function roasterCapacity(model) {
    return CAPACITY[model] || { min: 100, max: 1000 };
}

// Capacity to plan against: the profile's own min/max if set, else the model default.
// Lets variants (Mark's KKTO, Stuart's Behmor) be accurate instead of guessed.
export function capacityFor(roaster) {
    const def = roasterCapacity(roaster && roaster.model);
    return {
        min: roaster && roaster.minG > 0 ? roaster.minG : def.min,
        max: roaster && roaster.maxG > 0 ? roaster.maxG : def.max
    };
}

/**
 * PURE. Plan how to split `amountG` of green into roasts that fit [min,max].
 * @returns {{ even: {roasts,size,leftover}[], atTarget: {roasts,size,leftover}|null }}
 *   `even` = for each viable roast count, the even size (≈0 leftover), nearest target first.
 *   `atTarget` = sticking with the target size, and the leftover ("runt") it produces.
 */
export function planRoasts(amountG, { min = 150, max = amountG, target } = {}) {
    const out = { even: [], atTarget: null };
    if (!(amountG > 0)) return out;

    const lo = Math.max(1, Math.ceil(amountG / max));
    const hi = Math.max(lo, Math.floor(amountG / min));
    for (let n = lo; n <= hi; n++) {
        const size = Math.round(amountG / n);
        if (size < min || size > max) continue;
        out.even.push({ roasts: n, size, leftover: Math.abs(amountG - size * n) });
    }
    // Rank by closeness to the target size (if given), else by larger batches first.
    out.even.sort((a, b) => target
        ? Math.abs(a.size - target) - Math.abs(b.size - target)
        : b.size - a.size);
    out.even = out.even.slice(0, 4);

    if (target && target >= min && target <= max) {
        const n = Math.floor(amountG / target);
        if (n >= 1) out.atTarget = { roasts: n, size: target, leftover: amountG - n * target };
    }
    return out;
}

// Show a plan for a bag of `amountG` green on the active roaster.
export function openPlanModal(beanName, amountG) {
    const roaster = getActiveRoaster() || { model: 'behmor', name: 'roaster' };
    const cap = capacityFor(roaster);
    const target = getLastGreenWeight() || undefined;

    const def = String(amountG > 0 ? amountG : (getLastGreenWeight() || 2500));
    const input = prompt(`Plan roasts of "${beanName}" — how many grams do you have / did you buy?`, def);
    const amount = parseFloat(input);
    if (!(amount > 0)) return;

    const plan = planRoasts(amount, { min: cap.min, max: cap.max, target });

    const bg = document.createElement('div');
    bg.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;';
    const modal = document.createElement('div');
    modal.className = 'card';
    modal.style.cssText = 'width: 90%; max-width: 420px; max-height: 90vh; overflow-y: auto;';

    const evenRows = plan.even.length
        ? plan.even.map((o, i) =>
            `<li>${i === 0 ? '<strong>' : ''}${o.roasts} × ${o.size} g${o.leftover ? ` (${o.leftover} g left)` : ' (uses it all ✓)'}${i === 0 ? '</strong> — best fit' : ''}</li>`).join('')
        : '<li>No clean fit within the roaster’s range — adjust the amount.</li>';

    let leftoverNote = '';
    if (plan.atTarget && plan.atTarget.leftover) {
        leftoverNote = plan.atTarget.leftover < cap.min
            ? ` (a ${plan.atTarget.leftover} g runt — below the ${cap.min} g drum minimum, too little to roast evenly)`
            : ` + a smaller final batch of <strong>${plan.atTarget.leftover} g</strong>`;
    }
    const targetLine = plan.atTarget
        ? `<p style="margin-top: 10px;">Your usual <strong>${plan.atTarget.size} g</strong>: ${plan.atTarget.roasts} roasts${plan.atTarget.leftover ? leftoverNote : ' (uses it all ✓)'}.</p>`
        : '';

    modal.innerHTML = `
        <h3>Roast plan — ${escapeHtml(beanName)}</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">${amount} g on ${escapeHtml(roaster.name)} (drum ${cap.min}–${cap.max} g). Roast ~what you'll drink in ~2 weeks.</p>
        <p><strong>Even splits (little/no leftover):</strong></p>
        <ul>${evenRows}</ul>
        ${targetLine}
        <div style="display: flex; justify-content: flex-end; margin-top: 15px;">
            <button id="planClose" style="background-color: var(--success);">Got it</button>
        </div>
    `;
    bg.appendChild(modal);
    document.body.appendChild(bg);
    modal.querySelector('#planClose').addEventListener('click', () => document.body.removeChild(bg));
}
