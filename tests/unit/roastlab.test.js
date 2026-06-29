import { describe, it, expect } from 'vitest';
import {
    createSession, addFrame, addEvent, summariseRoastLab,
    formatRoastLabJson, formatRoastLabCsv, formatRoastLabSummaryText,
    roastLabFilename, ROAST_LAB_FRAME_MS,
} from '../../js/roastlab.js';

describe('createSession', () => {
    it('starts empty and copies meta', () => {
        const s = createSession({ bean: 'Ethiopia', sampleRate: 48000 });
        expect(s.frames).toEqual([]);
        expect(s.events).toEqual([]);
        expect(s.meta.bean).toBe('Ethiopia');
        expect(s.meta.sampleRate).toBe(48000);
    });
    it('does not alias the passed meta object', () => {
        const meta = { bean: 'X' };
        const s = createSession(meta);
        s.meta.bean = 'Y';
        expect(meta.bean).toBe('X');
    });
});

describe('addFrame', () => {
    it('rounds and stores feature values', () => {
        const s = createSession();
        addFrame(s, { t: 1234.7, rms: 0.123456789, bandRatio: 0.98765432, mfcc: [1.23456, -2.0] });
        expect(s.frames).toHaveLength(1);
        const f = s.frames[0];
        expect(f.t).toBe(1235);
        expect(f.rms).toBe(0.12346);
        expect(f.bandRatio).toBe(0.98765);
        expect(f.mfcc).toEqual([1.2346, -2]);
    });
    it('stores null mfcc when none supplied, and is null-safe', () => {
        const s = createSession();
        addFrame(s, { t: 0, rms: 0.1, bandRatio: 0.2 });
        expect(s.frames[0].mfcc).toBeNull();
        expect(() => addFrame(null, { t: 0 })).not.toThrow();
    });
    it('coerces non-finite features to null', () => {
        const s = createSession();
        addFrame(s, { t: 0, rms: NaN, bandRatio: Infinity });
        expect(s.frames[0].rms).toBeNull();
        expect(s.frames[0].bandRatio).toBeNull();
    });
});

describe('addEvent', () => {
    it('records type, label and auto flag', () => {
        const s = createSession();
        addEvent(s, { t: 5000, type: 'crack', label: 'First Crack (Auto)', auto: true });
        addEvent(s, { t: 6000, type: 'clear', label: 'First crack' });
        expect(s.events[0]).toEqual({ t: 5000, type: 'crack', label: 'First Crack (Auto)', auto: true });
        expect(s.events[1].auto).toBe(false);
    });
});

describe('summariseRoastLab', () => {
    it('counts frames, events, cracks, clears and duration', () => {
        const s = createSession();
        addFrame(s, { t: 0, rms: 0.1, bandRatio: 0.2, mfcc: [1, 2, 3] });
        addFrame(s, { t: 10000, rms: 0.4, bandRatio: 0.5, mfcc: [4, 5, 6] });
        addEvent(s, { t: 5000, type: 'crack', label: 'FC', auto: true });
        addEvent(s, { t: 7000, type: 'clear', label: 'FC' });
        const sum = summariseRoastLab(s);
        expect(sum.frames).toBe(2);
        expect(sum.events).toBe(2);
        expect(sum.durationMs).toBe(10000);
        expect(sum.cracks).toBe(1);
        expect(sum.clears).toBe(1);
        expect(sum.mfccDims).toBe(3);
    });
    it('handles an empty / missing session', () => {
        expect(summariseRoastLab(createSession()).frames).toBe(0);
        expect(summariseRoastLab(null).durationMs).toBe(0);
    });
});

describe('formatRoastLabJson', () => {
    it('round-trips through JSON.parse', () => {
        const s = createSession({ bean: 'X' });
        addFrame(s, { t: 0, rms: 0.1, bandRatio: 0.2, mfcc: [1] });
        const parsed = JSON.parse(formatRoastLabJson(s));
        expect(parsed.meta.bean).toBe('X');
        expect(parsed.frames[0].mfcc).toEqual([1]);
    });
});

describe('formatRoastLabCsv', () => {
    it('emits a header with mfcc columns and interleaves events by time', () => {
        const s = createSession();
        addFrame(s, { t: 0, rms: 0.1, bandRatio: 0.2, mfcc: [1, 2] });
        addFrame(s, { t: 2000, rms: 0.3, bandRatio: 0.4, mfcc: [3, 4] });
        addEvent(s, { t: 1000, type: 'crack', label: 'FC', auto: true });
        const lines = formatRoastLabCsv(s).split('\n');
        expect(lines[0]).toBe('t_ms,t_s,rms,bandRatio,mfcc_0,mfcc_1,event,event_label');
        // rows sorted by time: frame@0, event@1000, frame@2000
        expect(lines[1].startsWith('0,0.00,0.1,0.2,1,2,,')).toBe(true);
        expect(lines[2]).toBe('1000,1.00,,,,,crack:auto,FC');
        expect(lines[3].startsWith('2000,2.00,0.3,0.4,3,4,,')).toBe(true);
    });
    it('quotes labels containing commas', () => {
        const s = createSession();
        addEvent(s, { t: 0, type: 'crack', label: 'First, loud' });
        const csv = formatRoastLabCsv(s);
        expect(csv).toContain('"First, loud"');
    });
    it('produces just a header for an empty session', () => {
        const csv = formatRoastLabCsv(createSession());
        expect(csv).toBe('t_ms,t_s,rms,bandRatio,event,event_label');
    });
});

describe('formatRoastLabSummaryText', () => {
    it('summarises counts and lists events', () => {
        const s = createSession();
        addFrame(s, { t: 0, rms: 0.1, bandRatio: 0.2, mfcc: [1, 2] });
        addFrame(s, { t: 12000, rms: 0.3, bandRatio: 0.4, mfcc: [3, 4] });
        addEvent(s, { t: 6000, type: 'crack', label: 'FC', auto: true });
        const txt = formatRoastLabSummaryText(s);
        expect(txt).toContain('2 frames over 12s');
        expect(txt).toContain('2 MFCC dims');
        expect(txt).toContain('1 crack / 0 clear');
        expect(txt).toContain('6.0s crack(auto) FC');
    });
    it('says "none" when there are no events', () => {
        expect(formatRoastLabSummaryText(createSession())).toContain('Events: none.');
    });
});

describe('roastLabFilename', () => {
    it('slugs the bean name and uses the supplied date', () => {
        expect(roastLabFilename({ bean: 'Ethiopia Yirgacheffe!', dateStr: '2026-07-04' }, 'json'))
            .toBe('roastlab-ethiopia-yirgacheffe-2026-07-04.json');
    });
    it('falls back gracefully', () => {
        expect(roastLabFilename({}, 'csv')).toBe('roastlab-roast-session.csv');
        expect(roastLabFilename(null, 'json')).toBe('roastlab-roast-session.json');
    });
});

describe('ROAST_LAB_FRAME_MS', () => {
    it('is a sane capture cadence', () => {
        expect(ROAST_LAB_FRAME_MS).toBeGreaterThanOrEqual(200);
        expect(ROAST_LAB_FRAME_MS).toBeLessThanOrEqual(2000);
    });
});
