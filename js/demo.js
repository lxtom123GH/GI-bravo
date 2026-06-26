// Simulated "demo roast" — an animated playback so new users can see how a roast
// works without a microphone, beans, or saving any data. Pure visual + captions.
import { drawRoastCurve } from './chart.js';

const FC_MS = 9 * 60 * 1000;     // first crack ~9:00
const SC_MS = 10.5 * 60 * 1000;  // second crack ~10:30
const END_MS = 11.2 * 60 * 1000; // drop ~11:12
let demoRunning = false;

// A plausible audio-energy shape: gentle rise, a burst around first crack,
// then a denser/quieter burst around second crack.
function energyAt(t) {
    let e = 0.04 + 0.02 * (t / END_MS) + Math.random() * 0.01;
    if (t > FC_MS && t < FC_MS + 100000) e += 0.13 * Math.exp(-((t - (FC_MS + 30000)) ** 2) / 2.0e9) + Math.random() * 0.05;
    if (t > SC_MS) e += 0.10 * Math.exp(-((t - (SC_MS + 20000)) ** 2) / 1.2e9) + Math.random() * 0.06;
    return e;
}

function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function initDemo() {
    document.querySelectorAll('.demo-btn').forEach(b => b.addEventListener('click', runDemo));
}

function runDemo() {
    if (demoRunning) return;
    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn && !stopBtn.disabled) { alert('Please stop the current roast before running the demo.'); return; }

    // Make sure the dashboard is visible.
    const dashLink = document.querySelector('.nav-links li[data-target="dashboard"]');
    if (dashLink) dashLink.click();

    const canvas = document.getElementById('roastCurve');
    const logArea = document.getElementById('logArea');
    const status = document.getElementById('status');
    const timer = document.getElementById('liveTimer');
    if (!canvas || !logArea) return;

    demoRunning = true;
    logArea.innerHTML = '';
    const cap = (m) => {
        const p = document.createElement('p');
        p.innerHTML = m;
        logArea.appendChild(p);
        logArea.scrollTop = logArea.scrollHeight;
    };
    cap('<b>Demo roast</b> — a simulated roast so you can see how it works. No microphone, beans, or saved data.');
    if (status) status.textContent = 'Status: Demo — Heating';

    const curve = [];
    const STEP = END_MS / 180; // ~180 frames
    let vt = 0, fc = null, sc = null;

    const iv = setInterval(() => {
        vt += STEP;
        curve.push({ t: vt, rms: energyAt(vt) });
        if (timer) timer.textContent = fmt(vt);

        if (!fc && vt >= FC_MS) { fc = vt; cap(`>>> <b>FIRST CRACK detected</b> at ${fmt(vt)}`); if (status) status.textContent = 'Status: Demo — First Crack'; }
        if (!sc && vt >= SC_MS) { sc = vt; cap(`>>> <b>SECOND CRACK detected</b> at ${fmt(vt)}`); if (status) status.textContent = 'Status: Demo — Second Crack'; }

        drawRoastCurve(canvas, curve, { firstCrackMs: fc, secondCrackMs: sc, totalMs: vt });

        if (vt >= END_MS) {
            clearInterval(iv);
            demoRunning = false;
            const dev = END_MS - (fc || END_MS);
            const dtr = Math.round((dev / END_MS) * 100);
            cap(`Drop at ${fmt(END_MS)} — development ${fmt(dev)}, <b>DTR ${dtr}%</b>.`);
            cap('In a real roast the app listens and detects these cracks automatically, then saves everything to <b>Roast History</b>. See the <b>Help</b> tab for a quick guide.');
            if (status) status.textContent = 'Status: Demo finished';
        }
    }, 90);
}
