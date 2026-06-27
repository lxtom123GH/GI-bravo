import { describe, it, expect } from 'vitest';
import { tastiness, costPerCup, valuePerDollar, buildLeaderboard } from '../../js/value.js';

describe('tastiness', () => {
    it('uses a cupping score normalised to /100', () => {
        expect(tastiness({ scores: { total: 84, max: 100 } })).toBe(84);
        expect(tastiness({ scores: { total: 40, max: 80 } })).toBe(50);
    });
    it('falls back to the emoji impression', () => {
        expect(tastiness({ emoji: 'happy' })).toBe(100);
        expect(tastiness({ emoji: 'sad' })).toBe(30);
    });
    it('returns null with nothing to score', () => {
        expect(tastiness(null)).toBeNull();
        expect(tastiness({ text: 'nice' })).toBeNull();
    });
});

describe('costPerCup', () => {
    it('computes green cost spread over roasted cups', () => {
        // 450 g green @ $40/kg = $18; roasted 383 g ÷ 15 = 25.5 cups → ~$0.705/cup
        const cpc = costPerCup(450, 40, 383, 15);
        expect(cpc).toBeGreaterThan(0.69);
        expect(cpc).toBeLessThan(0.72);
    });
    it('assumes ~15% loss when roasted weight is unknown', () => {
        expect(costPerCup(1000, 20, 0)).toBeCloseTo((20) / (850 / 15), 4);
    });
    it('returns null without cost or weight', () => {
        expect(costPerCup(450, 0, 380)).toBeNull();
        expect(costPerCup(0, 40, 380)).toBeNull();
    });
});

describe('valuePerDollar + leaderboard', () => {
    it('value is points per dollar', () => {
        expect(valuePerDollar(80, 0.5)).toBe(160);
        expect(valuePerDollar(null, 0.5)).toBeNull();
        expect(valuePerDollar(80, 0)).toBeNull();
    });
    it('ranks best value first and skips roasts missing score or cost', () => {
        const beans = [{ id: 'a', costPerKg: 20 }, { id: 'b', costPerKg: 60 }, { id: 'c' /* no cost */ }];
        const roasts = [
            { beanId: 'a', greenWeightG: 500, roastedWeightG: 425, tastingNotes: { scores: { total: 80, max: 100 } } },
            { beanId: 'b', greenWeightG: 500, roastedWeightG: 425, tastingNotes: { scores: { total: 90, max: 100 } } },
            { beanId: 'c', greenWeightG: 500, tastingNotes: { emoji: 'happy' } }, // no cost → excluded
            { beanId: 'a', greenWeightG: 500, roastedWeightG: 425 } // no tasting → excluded
        ];
        const board = buildLeaderboard(roasts, beans);
        expect(board.length).toBe(2);
        expect(typeof board[0].beanName).toBe('string');
        // cheaper bean (a) at decent score should beat pricier bean (b)
        expect(board[0].roast.beanId).toBe('a');
        expect(board[0].value).toBeGreaterThan(board[1].value);
    });
});
