import { describe, it, expect } from 'vitest';
import { upsertTasting, latestTasting, toNotes } from '../../js/tasting.js';

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
