import { describe, it, expect } from 'vitest';
import { summariseLedger, LEDGER_DIRS } from '../../js/ledger.js';

describe('summariseLedger', () => {
    it('totals borrowed (owed) vs lent and the net', () => {
        const ledger = [
            { dir: 'borrowed', who: 'Mark', grams: 250 },
            { dir: 'borrowed', who: 'Mark', grams: 100 },
            { dir: 'lent', who: 'Sam', grams: 200 }
        ];
        expect(summariseLedger(ledger)).toEqual({ owed: 350, lent: 200, net: -150 });
    });
    it('net is positive when others owe you more than you owe', () => {
        expect(summariseLedger([{ dir: 'lent', who: 'A', grams: 500 }]).net).toBe(500);
    });
    it('ignores non-positive grams and unknown directions', () => {
        const ledger = [{ dir: 'borrowed', grams: 0 }, { dir: 'lent', grams: -5 }, { dir: 'sideways', grams: 99 }];
        expect(summariseLedger(ledger)).toEqual({ owed: 0, lent: 0, net: 0 });
    });
    it('tolerates empty/missing input', () => {
        expect(summariseLedger([])).toEqual({ owed: 0, lent: 0, net: 0 });
        expect(summariseLedger(null)).toEqual({ owed: 0, lent: 0, net: 0 });
    });
    it('exposes the valid directions', () => {
        expect(LEDGER_DIRS).toEqual(['borrowed', 'lent']);
    });
});
