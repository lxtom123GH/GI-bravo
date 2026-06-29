import { describe, it, expect } from 'vitest';
import { upsertTasting, latestTasting, toNotes, tastingRating, personalPeak } from '../../js/tasting.js';

const DAY = 86_400_000;

describe('upsertTasting', () => {
    it('adds new dates and keeps the list sorted ascending', () => {
        let log = [];
        log = upsertTasting(log, { date: '2026-06-20', emoji: 'happy' });
        log = upsertTasting(log, { date: '2026-06-14', emoji: 'neutral' });
        expect(log.map(e => e.date)).toEqual(['2026-06-14', '2026-06-20']);
    });
    it('replaces the entry for an existing date (no duplicates)', () => {
        let log = [{ date: '2026-06-20', emoji: 'sad' }];
        log = upsertTasting(log, { date: '2026-06-20', emoji: 'happy' });
        expect(log.length).toBe(1);
        expect(log[0].emoji).toBe('happy');
    });
});

describe('latestTasting + toNotes', () => {
    it('latest is the last by date', () => {
        const log = [{ date: '2026-06-14', emoji: 'neutral' }, { date: '2026-06-28', emoji: 'happy' }];
        expect(latestTasting(log).emoji).toBe('happy');
        expect(latestTasting([])).toBeNull();
    });
    it('toNotes strips the date for the legacy tastingNotes shape', () => {
        const n = toNotes({ date: '2026-06-28', emoji: 'happy', scores: { total: 84, max: 100 } });
        expect(n.date).toBeUndefined();
        expect(n.emoji).toBe('happy');
        expect(n.scores.total).toBe(84);
        expect(toNotes(null)).toBeUndefined();
    });
});

describe('tastingRating', () => {
    it('prefers a numeric cupping total', () => {
        expect(tastingRating({ scores: { total: 86 }, emoji: 'sad' })).toEqual({ value: 86, kind: 'score' });
    });
    it('falls back to ranked emoji', () => {
        expect(tastingRating({ emoji: 'happy' })).toEqual({ value: 3, kind: 'emoji' });
        expect(tastingRating({ emoji: 'sad' })).toEqual({ value: 1, kind: 'emoji' });
    });
    it('returns null when there is nothing comparable', () => {
        expect(tastingRating({ text: 'nice' })).toBeNull();
        expect(tastingRating(null)).toBeNull();
    });
});

describe('personalPeak', () => {
    // roast date = day 0
    const roast = new Date('2026-06-01').getTime();
    const at = (d, fields) => ({ date: new Date(roast + d * DAY).toISOString().slice(0, 10), ...fields });

    it('finds the highest-rated day-since-roast (cupping scores)', () => {
        const log = [at(2, { scores: { total: 82 } }), at(9, { scores: { total: 88 } }), at(16, { scores: { total: 85 } })];
        const p = personalPeak(roast, log);
        expect(p.day).toBe(9);
        expect(p.kind).toBe('score');
        expect(p.samples).toBe(3);
    });

    it('works with emoji ratings too', () => {
        const log = [at(3, { emoji: 'neutral' }), at(7, { emoji: 'happy' })];
        expect(personalPeak(roast, log).day).toBe(7);
    });

    it('needs at least 2 rated entries', () => {
        expect(personalPeak(roast, [at(5, { scores: { total: 90 } })])).toBeNull();
    });

    it('returns null when all ratings are equal (no real peak)', () => {
        const log = [at(2, { emoji: 'happy' }), at(9, { emoji: 'happy' })];
        expect(personalPeak(roast, log)).toBeNull();
    });

    it('breaks ties toward the earlier day (ready sooner)', () => {
        const log = [at(12, { scores: { total: 88 } }), at(5, { scores: { total: 88 } }), at(2, { scores: { total: 80 } })];
        expect(personalPeak(roast, log).day).toBe(5);
    });
});
