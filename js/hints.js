// Hint mode: a toggle that adds small tappable ⓘ badges next to controls
// marked with a data-hint attribute. Tapping a badge shows a short explanation.
// Touch-friendly (no hover) and persisted.

const KEY = 'hintsOn';
let popover = null;

export function initHints() {
    const toggle = document.getElementById('hintsToggle');
    if (!toggle) return;

    const refresh = () => { if (toggle.checked) showBadges(); };

    toggle.checked = localStorage.getItem(KEY) === '1';
    apply(toggle.checked);

    toggle.addEventListener('change', () => {
        localStorage.setItem(KEY, toggle.checked ? '1' : '0');
        apply(toggle.checked);
    });

    // Badges depend on what's currently visible (tabs / tier), so rebuild when that changes.
    document.querySelectorAll('.nav-links li').forEach(li => li.addEventListener('click', () => setTimeout(refresh, 0)));
    ['tierSelect', 'dashboardTierSelect', 'roasterSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => setTimeout(refresh, 0));
    });
    window.addEventListener('settingsImported', () => { toggle.checked = localStorage.getItem(KEY) === '1'; apply(toggle.checked); });
    window.addEventListener('resize', closePopover);
}

function apply(on) { on ? showBadges() : hideBadges(); }

function showBadges() {
    hideBadges();
    document.querySelectorAll('[data-hint]').forEach(el => {
        if (el.offsetParent === null) return; // skip hidden (e.g. tier-gated) controls
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'hint-badge';
        badge.textContent = 'ⓘ';
        badge.setAttribute('aria-label', 'Hint');
        badge.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openPopover(badge, el.dataset.hint);
        });
        el.insertAdjacentElement('afterend', badge);
    });
}

function hideBadges() {
    closePopover();
    document.querySelectorAll('.hint-badge').forEach(b => b.remove());
}

function openPopover(anchor, text) {
    const wasSame = popover && popover._anchor === anchor;
    closePopover();
    if (wasSame) return; // tapping the same badge again closes it

    popover = document.createElement('div');
    popover.className = 'hint-popover';
    popover.textContent = text;
    popover._anchor = anchor;
    document.body.appendChild(popover);

    const r = anchor.getBoundingClientRect();
    let top = r.bottom + 6;
    if (top + popover.offsetHeight > window.innerHeight) top = Math.max(6, r.top - popover.offsetHeight - 6);
    let left = Math.min(r.left, window.innerWidth - popover.offsetWidth - 8);
    popover.style.top = `${top}px`;
    popover.style.left = `${Math.max(8, left)}px`;

    setTimeout(() => document.addEventListener('click', closePopover, { once: true }), 0);
}

function closePopover() {
    if (popover) { popover.remove(); popover = null; }
}
