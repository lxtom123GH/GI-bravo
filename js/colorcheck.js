// Multi-patch colour calibration via an X-Rite/Calibrite ColorChecker Classic (24 patch).
// Computes a 3x4 affine colour-correction matrix (CCM) by least squares against the
// published sRGB reference values, and applies it to a photo.

// Reference sRGB values (BabelColor/Pascale), row-major: 4 rows x 6 columns.
// Row 1: dark skin, light skin, blue sky, foliage, blue flower, bluish green
// Row 2: orange, purplish blue, moderate red, purple, yellow green, orange yellow
// Row 3: blue, green, red, yellow, magenta, cyan
// Row 4: white, neutral 8, neutral 6.5, neutral 5, neutral 3.5, black
export const REFERENCE_SRGB = [
    [115, 82, 68], [194, 150, 130], [98, 122, 157], [87, 108, 67], [133, 128, 177], [103, 189, 170],
    [214, 126, 44], [80, 91, 166], [193, 90, 99], [94, 60, 108], [157, 188, 64], [224, 163, 46],
    [56, 61, 150], [70, 148, 73], [175, 54, 60], [231, 199, 31], [187, 86, 149], [8, 133, 161],
    [243, 243, 242], [200, 200, 200], [160, 160, 160], [122, 122, 121], [85, 85, 85], [52, 52, 52]
];
export const CHECKER_COLS = 6;
export const CHECKER_ROWS = 4;

// Solve a small linear system Ax = b (n x n) by Gaussian elimination with partial pivoting.
function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
        let piv = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
        [M[col], M[piv]] = [M[piv], M[col]];
        const d = M[col][col];
        if (Math.abs(d) < 1e-9) continue;
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const f = M[r][col] / d;
            for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
        }
    }
    return M.map((row, i) => row[n] / (M[i][i] || 1));
}

// Compute the 3x4 affine CCM from measured patch RGBs (24x3) against the reference.
// Returns coefficients so that out = [r,g,b,1] · A, where A is 4x3.
export function computeCCM(measured) {
    // Design matrix rows: [r, g, b, 1]
    const X = measured.map(p => [p[0], p[1], p[2], 1]);
    // Normal equations XtX (4x4) and XtY (4x3)
    const XtX = Array.from({ length: 4 }, () => new Array(4).fill(0));
    const XtY = Array.from({ length: 4 }, () => new Array(3).fill(0));
    for (let i = 0; i < X.length; i++) {
        const ref = REFERENCE_SRGB[i];
        for (let a = 0; a < 4; a++) {
            for (let b = 0; b < 4; b++) XtX[a][b] += X[i][a] * X[i][b];
            for (let c = 0; c < 3; c++) XtY[a][c] += X[i][a] * ref[c];
        }
    }
    // Solve each output channel independently -> 4 coefficients per channel.
    const A = [[], [], [], []];
    for (let c = 0; c < 3; c++) {
        const col = solve(XtX.map(r => [...r]), XtY.map(r => r[c]));
        for (let a = 0; a < 4; a++) A[a][c] = col[a];
    }
    return A; // 4x3
}

const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;

// Average colour of a small square (radius px) centred at (x, y) in an image's pixel data.
function sampleAt(data, w, h, x, y, radius = 4) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const px = Math.round(x + dx), py = Math.round(y + dy);
            if (px < 0 || py < 0 || px >= w || py >= h) continue;
            const i = (py * w + px) * 4;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
    }
    return n ? [r / n, g / n, b / n] : [0, 0, 0];
}

// Sample 24 patch colours from the chart pixel data given the 4 corner centres
// (fractions 0..1 of the image): tl=patch1, tr=patch6, br=patch24, bl=patch19.
export function sampleChart(data, w, h, corners) {
    const { tl, tr, br, bl } = corners;
    const radius = Math.max(2, Math.round(Math.min(w, h) * 0.01));
    const out = [];
    for (let row = 0; row < CHECKER_ROWS; row++) {
        for (let col = 0; col < CHECKER_COLS; col++) {
            const u = CHECKER_COLS === 1 ? 0 : col / (CHECKER_COLS - 1);
            const v = CHECKER_ROWS === 1 ? 0 : row / (CHECKER_ROWS - 1);
            const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
            const bot = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
            const x = (top.x + (bot.x - top.x) * v) * w;
            const y = (top.y + (bot.y - top.y) * v) * h;
            out.push(sampleAt(data, w, h, x, y, radius));
        }
    }
    return out;
}

// Apply a 4x3 CCM to a canvas context's pixels in place.
export function applyCCM(ctx, w, h, A) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        d[i] = clamp255(r * A[0][0] + g * A[1][0] + b * A[2][0] + A[3][0]);
        d[i + 1] = clamp255(r * A[0][1] + g * A[1][1] + b * A[2][1] + A[3][1]);
        d[i + 2] = clamp255(r * A[0][2] + g * A[1][2] + b * A[2][2] + A[3][2]);
    }
    ctx.putImageData(img, 0, 0);
}
