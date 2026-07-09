import { describe, it, expect } from 'vitest';
import {
    makeSessionItem, createSession, sessionProgress, nextQueuedIndex, roastingIndex,
    setItemStatus, isSessionComplete, handoffHint, ITEM_STATUS
} from '../../js/session.js';

const threeBeanSession = () => createSession({
    id: 's1', roasterId: 'behmor',
    items: [
        makeSessionItem({ id: 'a', beanId: 'e', beanName: 'Ethiopia', weightG: 420, container: 'Tin A' }),
        makeSessionItem({ id: 'b', beanId: 'br', beanName: 'Brazil', weightG: 420, container: 'Tin B' }),
        makeSessionItem({ id: 'c', beanId: 'co', beanName: 'Colombia', weightG: 420, container: 'Tin C' })
    ]
});

describe('makeSessionItem', () => {
    it('defaults to a queued item with normalised fields', () => {
        const it = makeSessionItem({ beanId: 'x', beanName: 'X', weightG: '420' });
        expect(it.status).toBe('queued');
        expect(it.weightG).toBe(420);      // coerced to number
        expect(it.isDecaf).toBe(false);
        expect(it.roastId).toBeNull();
        expect(it.id).toBeTruthy();
    });
});

describe('sessionProgress', () => {
    it('counts items by status', () => {
        const s = threeBeanSession();
        expect(sessionProgress(s)).toMatchObject({ total: 3, queued: 3, done: 0, cooling: 0, roasting: 0 });
    });
    it('is safe on an empty/undefined session', () => {
        expect(sessionProgress(undefined)).toMatchObject({ total: 0, queued: 0 });
    });
});

describe('nextQueuedIndex / roastingIndex', () => {
    it('finds the first queued item and no roasting one initially', () => {
        const s = threeBeanSession();
        expect(nextQueuedIndex(s)).toBe(0);
        expect(roastingIndex(s)).toBe(-1);
    });
});

describe('setItemStatus', () => {
    it('immutably updates one item and can patch fields', () => {
        const s = threeBeanSession();
        const s2 = setItemStatus(s, 0, ITEM_STATUS.ROASTING);
        expect(s.items[0].status).toBe('queued');       // original untouched
        expect(s2.items[0].status).toBe('roasting');
        expect(roastingIndex(s2)).toBe(0);
        const s3 = setItemStatus(s2, 0, ITEM_STATUS.COOLING, { roastId: 'r99' });
        expect(s3.items[0]).toMatchObject({ status: 'cooling', roastId: 'r99' });
    });
});

describe('isSessionComplete', () => {
    it('is false while any item is queued or roasting', () => {
        let s = threeBeanSession();
        expect(isSessionComplete(s)).toBe(false);
        s = setItemStatus(s, 0, ITEM_STATUS.COOLING);
        s = setItemStatus(s, 1, ITEM_STATUS.DONE);
        expect(isSessionComplete(s)).toBe(false); // item 2 still queued
    });
    it('is true once every item is cooling or done', () => {
        let s = threeBeanSession();
        s = setItemStatus(s, 0, ITEM_STATUS.DONE);
        s = setItemStatus(s, 1, ITEM_STATUS.COOLING);
        s = setItemStatus(s, 2, ITEM_STATUS.COOLING);
        expect(isSessionComplete(s)).toBe(true);
    });
    it('is false for an empty session', () => {
        expect(isSessionComplete(createSession({}))).toBe(false);
    });
});

describe('handoffHint', () => {
    it('names the cooling bean, its tin, and the next load with the freed tin', () => {
        const s = threeBeanSession();
        const hint = handoffHint(s, 0);
        expect(hint).toContain('Ethiopia');
        expect(hint).toContain('Tin A');
        expect(hint).toContain('Brazil');
        expect(hint).toContain('free');
    });
    it('announces the last roast when nothing is queued after it', () => {
        let s = threeBeanSession();
        // mark the first two cooling so only index 2 remains, then finish it
        s = setItemStatus(s, 0, ITEM_STATUS.COOLING);
        s = setItemStatus(s, 1, ITEM_STATUS.COOLING);
        const hint = handoffHint(s, 2);
        expect(hint).toContain('Last roast');
    });
    it('works without container labels', () => {
        const s = createSession({ items: [
            makeSessionItem({ beanName: 'A' }), makeSessionItem({ beanName: 'B' })
        ] });
        const hint = handoffHint(s, 0);
        expect(hint).toContain('A');
        expect(hint).toContain('B');
        expect(hint).not.toContain('undefined');
    });
});
