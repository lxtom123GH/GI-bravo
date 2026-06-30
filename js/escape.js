// Shared HTML-escaping for user-entered text that goes into innerHTML (bean names, roaster/blend
// names, tasting notes, supplier, origin…). A name like "<b>x" or "<img src=x onerror=alert(1)>"
// must render as literal text, never as markup — otherwise one user's stored text can break the
// card layout or, in a shared sync space, run script in another member's browser.
//
// Centralised here (previously a local copy lived in pantry.js) so every module escapes the same
// way — mirrors golf's js/escape.js and aps's esc(). Use at EVERY user-data sink that builds HTML.
export function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
