import { describe, it, expect } from 'vitest';
import { daysBetween, greenAge, roastRest, fifoBeanId, restWindowFor } from '../../js/freshness.js';

const DAY = 86_400_000;
const ago = (d, now) => now - d * DAY;

describe('daysBetween', () => {
    it('counts whole days', () => {
        const now = 1_000 * DAY;
        expect(daysBetween(ago(5, now), now)).toBe(5);
        expect(daysBetween(now, now)).toBe(0);
    });
});

describe('greenAge', () => {
    const now = 1_000 * DAY;
    it('returns null without a date', () => expect(greenAge(null, now)).toBeNull());
    it('labels recent vs old and flags stale > 1 year', () => {
        expect(greenAge(ago(3, now), now)).toMatchObject({ days: 3, stale: false });
        expect(greenAge(ago(400, now), now).stale).toBe(true);
        expect(greenAge(ago(400, now), now).text).toMatch(/year/);
    });
});

describe('roastRest', () => {
    const now = 1_000 * DAY;
    it('resting in the first days', () => {
        expect(roastRest(ago(1, now), now).phase).toBe('resting');
    });
    it('peak window mid-range', () => {
        expect(roastRest(ago(8, now), now).phase).toBe('peak');
    });
    it('past peak after the window', () => {
        expect(roastRest(ago(40, now), now).phase).toBe('past');
    });
    it('respects custom windows', () => {
        expect(roastRest(ago(2, now), now, { restDays: 5 }).phase).toBe('resting');
    });
    it('counts down to ready while resting', () => {
        const r = roastRest(ago(1, now), now, { restDays: 4 });
        expect(r.ready).toBe(false);
        expect(r.daysLeft).toBe(3);
        expect(r.text).toMatch(/ready in 3 days/);
    });
    it('shows days left at peak and is ready', () => {
        const r = roastRest(ago(8, now), now, { restDays: 4, peakEndDays: 21 });
        expect(r.ready).toBe(true);
        expect(r.daysLeft).toBe(13);
        expect(r.text).toMatch(/at peak/);
    });
});

describe('restWindowFor', () => {
    it('gives espresso a longer rest', () => {
        expect(restWindowFor('Espresso').restDays).toBe(6);
        expect(restWindowFor('Moka').restDays).toBe(6);
    });
    it('gives filter a shorter rest', () => {
        expect(restWindowFor('V60').restDays).toBe(2);
        expect(restWindowFor('Filter / Batch').restDays).toBe(2);
    });
    it('falls back to a balanced default for unknown/blank', () => {
        expect(restWindowFor('').restDays).toBe(4);
        expect(restWindowFor(undefined).restDays).toBe(4);
        expect(restWindowFor('Other').restDays).toBe(4);
    });
});

describe('fifoBeanId', () => {
    const now = 1_000 * DAY;
    it('picks the oldest in-stock bean', () => {
        const beans = [
            { id: 'a', quantity: 500, purchasedAt: ago(10, now) },
            { id: 'b', quantity: 500, purchasedAt: ago(30, now) }, // oldest
            { id: 'c', quantity: 0, purchasedAt: ago(99, now) }    // out of stock — ignored
        ];
        expect(fifoBeanId(beans)).toBe('b');
    });
    it('ignores out-of-stock and undated beans', () => {
        expect(fifoBeanId([{ id: 'x', quantity: 0, purchasedAt: 1 }])).toBeNull();
        expect(fifoBeanId([{ id: 'y', quantity: 500 }])).toBeNull();
        expect(fifoBeanId([])).toBeNull();
    });
});
