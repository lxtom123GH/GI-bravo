import { describe, it, expect } from 'vitest';
import {
    isPow2, fft, powerSpectrum, hannWindow, hzToMel, melToHz,
    melFilterbank, applyFilterbank, dct2, mfcc
} from '../../js/mfcc.js';

describe('isPow2', () => {
    it('recognises powers of two', () => {
        expect(isPow2(1)).toBe(true);
        expect(isPow2(2)).toBe(true);
        expect(isPow2(1024)).toBe(true);
        expect(isPow2(0)).toBe(false);
        expect(isPow2(3)).toBe(false);
        expect(isPow2(1000)).toBe(false);
    });
});

describe('fft', () => {
    it('transforms an impulse to a flat spectrum (all ones)', () => {
        const re = [1, 0, 0, 0], im = [0, 0, 0, 0];
        fft(re, im);
        re.forEach(v => expect(v).toBeCloseTo(1, 9));
        im.forEach(v => expect(v).toBeCloseTo(0, 9));
    });
    it('puts a DC (constant) signal entirely in bin 0', () => {
        const re = [2, 2, 2, 2], im = [0, 0, 0, 0];
        fft(re, im);
        expect(re[0]).toBeCloseTo(8, 9); // sum
        for (let k = 1; k < 4; k++) expect(re[k]).toBeCloseTo(0, 9);
    });
    it('throws on a non-power-of-two length', () => {
        expect(() => fft([1, 2, 3], [0, 0, 0])).toThrow();
    });
});

describe('powerSpectrum', () => {
    it('peaks at the bin of a pure cosine', () => {
        const N = 64, k0 = 8;
        const frame = Array.from({ length: N }, (_, i) => Math.cos(2 * Math.PI * k0 * i / N));
        const ps = powerSpectrum(frame);
        const peak = ps.indexOf(Math.max(...ps));
        expect(peak).toBe(k0);
        expect(ps).toHaveLength(N / 2 + 1);
    });
    it('does not mutate the input frame', () => {
        const frame = [1, 2, 3, 4];
        const copy = [...frame];
        powerSpectrum(frame);
        expect(frame).toEqual(copy);
    });
});

describe('hannWindow', () => {
    it('starts and ends near zero, peaks in the middle', () => {
        const w = hannWindow(8);
        expect(w[0]).toBeCloseTo(0, 9);
        expect(w[7]).toBeCloseTo(0, 9);
        expect(Math.max(...w)).toBeLessThanOrEqual(1.0001);
        expect(Math.max(...w)).toBeGreaterThan(0.9);
    });
});

describe('mel scale', () => {
    it('round-trips hz <-> mel', () => {
        for (const hz of [0, 100, 700, 1000, 8000]) {
            expect(melToHz(hzToMel(hz))).toBeCloseTo(hz, 4);
        }
    });
    it('is monotonic increasing', () => {
        expect(hzToMel(1000)).toBeGreaterThan(hzToMel(500));
    });
});

describe('melFilterbank', () => {
    it('returns the requested number of filters with the right width', () => {
        const fb = melFilterbank(20, 512, 44100);
        expect(fb).toHaveLength(20);
        fb.forEach(f => expect(f).toHaveLength(512 / 2 + 1));
    });
    it('weights are in [0,1] and filter centres increase', () => {
        const fb = melFilterbank(10, 256, 44100);
        const centres = fb.map(f => f.indexOf(Math.max(...f)));
        for (const f of fb) f.forEach(w => { expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThanOrEqual(1); });
        for (let i = 1; i < centres.length; i++) expect(centres[i]).toBeGreaterThanOrEqual(centres[i - 1]);
    });
});

describe('applyFilterbank', () => {
    it('sums weighted power per filter', () => {
        const power = [1, 1, 1, 1];
        const filters = [[1, 0, 0, 0], [0, 0.5, 0.5, 0]];
        expect(applyFilterbank(power, filters)).toEqual([1, 1]);
    });
});

describe('dct2', () => {
    it('a constant vector has energy only in coefficient 0', () => {
        const y = dct2([3, 3, 3, 3], 4);
        expect(y[0]).toBeCloseTo(12, 9);
        for (let k = 1; k < 4; k++) expect(y[k]).toBeCloseTo(0, 9);
    });
    it('keeps only the requested number of coefficients', () => {
        expect(dct2([1, 2, 3, 4, 5, 6, 7, 8], 5)).toHaveLength(5);
    });
});

describe('mfcc', () => {
    const opts = { sampleRate: 16000, numCoeffs: 13, numFilters: 26 };
    it('returns finite coefficients for a tone', () => {
        const N = 512;
        const frame = Array.from({ length: N }, (_, i) => Math.sin(2 * Math.PI * 440 * i / opts.sampleRate));
        const c = mfcc(frame, opts);
        expect(c).toHaveLength(13);
        c.forEach(v => expect(Number.isFinite(v)).toBe(true));
    });
    it('stays finite on silence (no -Infinity / NaN from log(0))', () => {
        const c = mfcc(new Array(512).fill(0), opts);
        c.forEach(v => expect(Number.isFinite(v)).toBe(true));
    });
    it('is deterministic for the same frame', () => {
        const frame = Array.from({ length: 256 }, (_, i) => Math.sin(i));
        expect(mfcc(frame, { ...opts, numFilters: 20 })).toEqual(mfcc(frame, { ...opts, numFilters: 20 }));
    });
    it('distinguishes two different tones', () => {
        const N = 512;
        const tone = (hz) => Array.from({ length: N }, (_, i) => Math.sin(2 * Math.PI * hz * i / opts.sampleRate));
        const a = mfcc(tone(300), opts), b = mfcc(tone(3000), opts);
        const diff = a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
        expect(diff).toBeGreaterThan(1); // clearly different timbres
    });
    it('throws on a non-power-of-two frame', () => {
        expect(() => mfcc(new Array(500).fill(0), opts)).toThrow();
    });
});
