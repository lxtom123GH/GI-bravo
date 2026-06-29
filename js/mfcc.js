// MFCC feature extraction — EXPERIMENTAL (see FUTURE_FEATURES "Detector tuning"). Research on
// coffee first-crack detection finds MFCCs (the spectral *timbre* of the fracture) carry the bulk
// of the discriminative power, where the current detector keys mostly off band-energy/loudness.
// This module computes MFCCs from a frame of time-domain audio so we can A/B them against the
// existing features later. It is PURE (no Web Audio, no DOM) so the whole pipeline is unit-tested;
// nothing here changes live detection on its own.
//
// Pipeline: frame -> Hann window -> FFT -> power spectrum -> mel filterbank -> log -> DCT-II.

export function isPow2(n) {
    return n > 0 && (n & (n - 1)) === 0;
}

// In-place iterative radix-2 Cooley–Tukey FFT. `re`/`im` are equal-length arrays (length a power
// of 2); on return they hold the transform. Mutates the inputs.
export function fft(re, im) {
    const n = re.length;
    if (!isPow2(n)) throw new Error('fft length must be a power of 2');
    // bit-reversal permutation
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            const tr = re[i]; re[i] = re[j]; re[j] = tr;
            const ti = im[i]; im[i] = im[j]; im[j] = ti;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len;
        const wlenRe = Math.cos(ang), wlenIm = Math.sin(ang);
        const half = len >> 1;
        for (let i = 0; i < n; i += len) {
            let wRe = 1, wIm = 0;
            for (let k = 0; k < half; k++) {
                const a = i + k, b = i + k + half;
                const vRe = re[b] * wRe - im[b] * wIm;
                const vIm = re[b] * wIm + im[b] * wRe;
                re[b] = re[a] - vRe; im[b] = im[a] - vIm;
                re[a] = re[a] + vRe; im[a] = im[a] + vIm;
                const nwRe = wRe * wlenRe - wIm * wlenIm;
                wIm = wRe * wlenIm + wIm * wlenRe;
                wRe = nwRe;
            }
        }
    }
}

// Power spectrum (|X|²) of a real frame, bins 0..N/2 inclusive. Does not mutate `frame`.
export function powerSpectrum(frame) {
    const n = frame.length;
    const re = Array.from(frame, Number);
    const im = new Array(n).fill(0);
    fft(re, im);
    const out = new Array(n / 2 + 1);
    for (let k = 0; k <= n / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k];
    return out;
}

// Periodic-ish Hann window of length N.
export function hannWindow(n) {
    const w = new Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    return w;
}

export function hzToMel(hz) { return 2595 * Math.log10(1 + hz / 700); }
export function melToHz(mel) { return 700 * (Math.pow(10, mel / 2595) - 1); }

// Build a triangular mel filterbank: `numFilters` filters over the power-spectrum bins
// (0..fftSize/2). Returns an array of filters, each a weight array of length fftSize/2+1.
export function melFilterbank(numFilters, fftSize, sampleRate, fMin = 0, fMax = sampleRate / 2) {
    const bins = fftSize / 2 + 1;
    const melMin = hzToMel(fMin), melMax = hzToMel(fMax);
    // numFilters+2 mel points -> hz -> fft bin indices
    const points = new Array(numFilters + 2);
    for (let i = 0; i < points.length; i++) {
        const mel = melMin + (melMax - melMin) * i / (numFilters + 1);
        points[i] = Math.floor((fftSize + 1) * melToHz(mel) / sampleRate);
    }
    const filters = [];
    for (let m = 1; m <= numFilters; m++) {
        const left = points[m - 1], center = points[m], right = points[m + 1];
        const f = new Array(bins).fill(0);
        for (let k = left; k < center; k++) if (center > left) f[k] = (k - left) / (center - left);
        for (let k = center; k < right; k++) if (right > center) f[k] = (right - k) / (right - center);
        if (center >= 0 && center < bins) f[center] = 1;
        filters.push(f);
    }
    return filters;
}

// Apply a filterbank to a power spectrum -> one energy per filter.
export function applyFilterbank(power, filters) {
    return filters.map(f => {
        let sum = 0;
        for (let k = 0; k < f.length; k++) sum += power[k] * f[k];
        return sum;
    });
}

// DCT-II of `x`, keeping the first `numCoeffs` coefficients.
export function dct2(x, numCoeffs = x.length) {
    const N = x.length;
    const out = new Array(numCoeffs);
    for (let k = 0; k < numCoeffs; k++) {
        let sum = 0;
        for (let nn = 0; nn < N; nn++) sum += x[nn] * Math.cos((Math.PI / N) * (nn + 0.5) * k);
        out[k] = sum;
    }
    return out;
}

const FLOOR = 1e-10; // keeps log finite on silent filters

// Full MFCC of a time-domain frame (length must be a power of 2).
// Returns `numCoeffs` cepstral coefficients (finite even for silence).
export function mfcc(frame, { sampleRate = 44100, numCoeffs = 13, numFilters = 26, fMin = 0, fMax } = {}) {
    const n = frame.length;
    if (!isPow2(n)) throw new Error('mfcc frame length must be a power of 2');
    const win = hannWindow(n);
    const windowed = new Array(n);
    for (let i = 0; i < n; i++) windowed[i] = Number(frame[i]) * win[i];
    const power = powerSpectrum(windowed);
    const filters = melFilterbank(numFilters, n, sampleRate, fMin, fMax === undefined ? sampleRate / 2 : fMax);
    const energies = applyFilterbank(power, filters).map(e => Math.log(Math.max(e, FLOOR)));
    return dct2(energies, numCoeffs);
}
