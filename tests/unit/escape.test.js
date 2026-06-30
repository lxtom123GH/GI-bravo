import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../js/escape.js';

describe('escapeHtml', () => {
    it('neutralises the XSS-relevant characters', () => {
        expect(escapeHtml('<img src=x onerror=alert(1)>'))
            .toBe('&lt;img src=x onerror=alert(1)&gt;');
        expect(escapeHtml(`<b>"a"&'b'`)).toBe('&lt;b&gt;&quot;a&quot;&amp;&#39;b&#39;');
    });
    it('leaves plain text untouched', () => {
        expect(escapeHtml('Ethiopia Yirgacheffe')).toBe('Ethiopia Yirgacheffe');
    });
    it('coerces null/undefined/number to a safe string', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml(250)).toBe('250');
    });
    it('escapes & first so existing entities are not double-broken into markup', () => {
        // ampersand must become &amp; before < / > are introduced
        expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
    });
});
