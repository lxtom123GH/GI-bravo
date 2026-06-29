import { describe, it, expect } from 'vitest';
import { daysBetween, greenAge, roastRest, fifoBeanId } from '../../js/freshness.js';

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
    it('gives a soft, approximate hint — no asserted per-method day-count', () => {
        expect(roastRest(ago(1, now), now).text).toMatch(/few days/);
        expect(roastRest(ago(8, now), now).text).toMatch(/varies/);
        // no precise countdown fields any more
        expect(roastRest(ago(1, now), now).daysLeft).toBeUndefined();
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
