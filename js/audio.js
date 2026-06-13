import { saveRoastToHistory, getDetectionSettings, saveDetectionSettings, DEFAULT_DETECTION_SETTINGS } from './storage.js';
import { drawRoastCurve } from './chart.js';
import { computeRoastMetrics, formatMs, formatDtr } from './metrics.js';

let audioContext;
let microphone;
let analyser;
let dataArray;
let isRecording = false;
let isNotifying = false;
let animationId;
let highPassFilter;
let timerInterval;

const canvas = document.getElementById('oscilloscope');
const canvasCtx = canvas.getContext('2d');
const curveCanvas = document.getElementById('roastCurve');
const logArea = document.getElementById('logArea');
const statusDiv = document.getElementById('status');
const liveTimerDiv = document.getElementById('liveTimer');
const liveDtrDiv = document.getElementById('liveDtr');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const markFirstCrackBtn = document.getElementById('markFirstCrackBtn');
const markSecondCrackBtn = document.getElementById('markSecondCrackBtn');

// State for Roast and Detection
let roastState = {
    startTime: null,
    firstCrackTime: null,
    secondCrackTime: null,
    endTime: null,
    phase: 'Ready',
    logs: [],
    curve: []
};

// Roast-curve sampling
const CURVE_SAMPLE_MS = 1000; // record one energy point per second
let lastCurveSampleTime = 0;

// State for Audio Processing
let baselineNoiseRMS = 0.05; // Default safe value
let isCalibrating = false;
let calibrationSamples = [];

// Transient Detection settings
// We look for sudden high-frequency spikes that exceed the baseline
let recentRMSHistory = [];
const HISTORY_LENGTH = 10; // About 160ms of history at 60fps requestAnimationFrame
let transientClusterCount = 0;
let lastTransientTime = 0;
const TRANSIENT_COOLDOWN_MS = 100; // time between individual snaps
const CLUSTER_WINDOW_MS = 5000; // Require X snaps within 5 seconds to declare a crack phase

// User-tunable detection settings (persisted), loaded on init.
let detectionSettings = { ...DEFAULT_DETECTION_SETTINGS };

export function initAudioSystem() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    canvasCtx.fillStyle = '#121212';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    drawRoastCurve(curveCanvas, [], {});

    detectionSettings = getDetectionSettings();
    initDetectionSettingsUI();

    calibrateBtn.addEventListener('click', startCalibration);
    startBtn.addEventListener('click', startRoast);
    stopBtn.addEventListener('click', stopRoast);

    markFirstCrackBtn.addEventListener('click', () => markPhase('First Crack (Manual)', 'firstCrackTime'));
    markSecondCrackBtn.addEventListener('click', () => markPhase('Second Crack (Manual)', 'secondCrackTime'));

    // Attach actions from roast dashboard to the timeline
    document.querySelectorAll('.behmor-action, .kkto-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (isRecording) {
                logMessage(`Action: ${e.target.dataset.action}`);
            }
        });
    });
}

function initDetectionSettingsUI() {
    const threshInput = document.getElementById('thresholdSetting');
    const cracksInput = document.getElementById('cracksSetting');
    const threshVal = document.getElementById('thresholdValue');
    const cracksVal = document.getElementById('cracksValue');
    const resetBtn = document.getElementById('resetDetectionBtn');
    if (!threshInput || !cracksInput) return;

    const render = () => {
        threshInput.value = detectionSettings.thresholdMultiplier;
        cracksInput.value = detectionSettings.cracksRequired;
        if (threshVal) threshVal.textContent = Number(detectionSettings.thresholdMultiplier).toFixed(1) + '×';
        if (cracksVal) cracksVal.textContent = detectionSettings.cracksRequired;
    };

    const persist = () => saveDetectionSettings(detectionSettings);

    threshInput.addEventListener('input', () => {
        detectionSettings.thresholdMultiplier = parseFloat(threshInput.value);
        if (threshVal) threshVal.textContent = detectionSettings.thresholdMultiplier.toFixed(1) + '×';
        persist();
    });

    cracksInput.addEventListener('input', () => {
        detectionSettings.cracksRequired = parseInt(cracksInput.value, 10);
        if (cracksVal) cracksVal.textContent = detectionSettings.cracksRequired;
        persist();
    });

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            detectionSettings = { ...DEFAULT_DETECTION_SETTINGS };
            persist();
            render();
        });
    }

    render();
}

function logMessage(message) {
    if (!roastState.startTime) return;

    const elapsedSeconds = Math.floor((Date.now() - roastState.startTime) / 1000);
    const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');
    const timestamp = `${mins}:${secs}`;

    const p = document.createElement('p');
    p.innerHTML = `<span style="color: var(--accent)">[${timestamp}]</span> ${message}`;
    logArea.appendChild(p);
    logArea.scrollTop = logArea.scrollHeight;

    roastState.logs.push(`[${timestamp}] ${message}`);
}

function updateStatus(status) {
    statusDiv.textContent = `Status: ${status}`;
    roastState.phase = status;
}

function markPhase(phaseName, stateKey) {
    if (!isRecording) return;
    if (roastState[stateKey]) return; // Already marked

    roastState[stateKey] = Date.now();
    logMessage(`>>> <b>${phaseName.toUpperCase()} RECORDED</b> <<<`);
    updateStatus(`Listening - Phase: ${phaseName}`);
    notifyUser(`${phaseName} recorded!`);
}

// Alert the roaster with a desktop notification and an audible beep.
// The beep briefly suspends detection so it isn't mistaken for a crack.
function notifyUser(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Roast Tracker', { body: message });
    }

    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
    gain.gain.setValueAtTime(0.1, audioContext.currentTime);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    isNotifying = true;
    oscillator.start();
    setTimeout(() => {
        oscillator.stop();
        oscillator.disconnect();
        gain.disconnect();
        // Allow the beep to fully decay before resuming detection
        setTimeout(() => { isNotifying = false; }, 200);
    }, 600);
}

async function setupAudio() {
    if (audioContext) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);

        // Create High-Pass Filter to remove talking, low hums, birds, dogs (e.g. cut below 3000 Hz)
        highPassFilter = audioContext.createBiquadFilter();
        highPassFilter.type = 'highpass';
        highPassFilter.frequency.value = 3000;

        microphone.connect(highPassFilter);
        highPassFilter.connect(analyser);

        analyser.fftSize = 2048;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        return true;
    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Error accessing microphone. Please allow permissions.');
        return false;
    }
}

async function startCalibration() {
    const ready = await setupAudio();
    if (!ready) return;

    calibrateBtn.disabled = true;
    startBtn.disabled = true;
    isCalibrating = true;
    calibrationSamples = [];
    isRecording = true;

    updateStatus('Calibrating... Please stay quiet.');

    // Calibrate for 3 seconds
    setTimeout(() => {
        isCalibrating = false;
        isRecording = false;

        if (calibrationSamples.length > 0) {
            baselineNoiseRMS = calibrationSamples.reduce((a, b) => a + b) / calibrationSamples.length;
        }

        updateStatus(`Ready (Baseline RMS: ${baselineNoiseRMS.toFixed(3)})`);
        calibrateBtn.disabled = false;
        startBtn.disabled = false;
        alert('Calibration complete!');
    }, 3000);

    drawAndAnalyze();
}

async function startRoast() {
    const ready = await setupAudio();
    if (!ready) return;

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // Reset State
    roastState = {
        startTime: Date.now(),
        firstCrackTime: null,
        secondCrackTime: null,
        endTime: null,
        phase: 'Heating',
        logs: [],
        curve: []
    };
    recentRMSHistory = [];
    transientClusterCount = 0;
    lastTransientTime = 0;
    lastCurveSampleTime = 0;

    logArea.innerHTML = '';
    logMessage('Roast Started.');

    isRecording = true;
    startBtn.disabled = true;
    calibrateBtn.disabled = true;
    stopBtn.disabled = false;
    markFirstCrackBtn.disabled = false;
    markSecondCrackBtn.disabled = false;

    updateStatus('Listening - Phase: Heating');

    drawAndAnalyze();

    // Start live timer display
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - roastState.startTime) / 1000);
        const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const s = (elapsed % 60).toString().padStart(2, '0');
        if (liveTimerDiv) liveTimerDiv.textContent = `${m}:${s}`;

        // Live development time / DTR once first crack is recorded.
        if (liveDtrDiv) {
            if (roastState.firstCrackTime) {
                const metrics = computeRoastMetrics(roastState);
                liveDtrDiv.textContent = `Dev ${formatMs(metrics.developmentTimeMs)} | DTR ${formatDtr(metrics.dtr)}`;
            } else {
                liveDtrDiv.textContent = 'DTR --';
            }
        }
    }, 1000);
}

function stopRoast() {
    isRecording = false;

    if (timerInterval) clearInterval(timerInterval);

    roastState.endTime = Date.now();
    logMessage('Roast Stopped.');

    startBtn.disabled = false;
    calibrateBtn.disabled = false;
    stopBtn.disabled = true;
    markFirstCrackBtn.disabled = true;
    markSecondCrackBtn.disabled = true;

    if (animationId) cancelAnimationFrame(animationId);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    canvasCtx.fillStyle = '#121212';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    updateStatus('Finished');

    // Final static render of the completed curve with crack markers.
    drawRoastCurve(curveCanvas, roastState.curve, {
        firstCrackMs: roastState.firstCrackTime ? roastState.firstCrackTime - roastState.startTime : null,
        secondCrackMs: roastState.secondCrackTime ? roastState.secondCrackTime - roastState.startTime : null,
        totalMs: roastState.endTime - roastState.startTime
    });

    saveFinalRoast();
}

function saveFinalRoast() {
    // Gather UI data
    const roaster = document.getElementById('roasterSelect').value;
    const beanId = document.getElementById('beanSelect').value;

    let roasterSettings = {};
    if (roaster === 'behmor') {
        const weight = document.querySelector('.behmor-weight.active')?.dataset.weight || 'unknown';
        const profile = document.querySelector('.behmor-profile.active')?.dataset.profile || 'unknown';
        roasterSettings = { weight, profile };
    }

    const finalRoastData = {
        date: new Date().toISOString(),
        roaster,
        beanId,
        settings: roasterSettings,
        timeline: roastState,
        tastingNotes: { flavors: [], text: '' } // To be filled later in History tab
    };

    saveRoastToHistory(finalRoastData);
    alert('Roast saved to history!');
}

function calculateRMS(dataArray) {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const value = (dataArray[i] - 128) / 128;
        sum += value * value;
    }
    return Math.sqrt(sum / dataArray.length);
}

function detectTransient(rms) {
    const now = Date.now();

    // Add to history
    recentRMSHistory.push(rms);
    if (recentRMSHistory.length > HISTORY_LENGTH) {
        recentRMSHistory.shift();
    }

    // A transient is a sudden spike significantly higher than the baseline AND recent history
    // Since we applied a high-pass filter, low hums are already removed.
    // We are looking for sharp high-frequency energy.
    const recentAvg = recentRMSHistory.reduce((a, b) => a + b, 0) / recentRMSHistory.length;
    const spikeThreshold = Math.max(baselineNoiseRMS * detectionSettings.thresholdMultiplier, recentAvg * 2, 0.05);

    if (rms > spikeThreshold && (now - lastTransientTime > TRANSIENT_COOLDOWN_MS)) {
        lastTransientTime = now;
        transientClusterCount++;

        // Reset cluster count if it's been too long since the first snap in the cluster
        // Actually, let's just reset if it's been a long time since the LAST snap
        setTimeout(() => {
            if (Date.now() - lastTransientTime >= CLUSTER_WINDOW_MS) {
                transientClusterCount = 0;
            }
        }, CLUSTER_WINDOW_MS);

        if (transientClusterCount === 1) {
             // Initial snap, wait for cluster
        } else if (transientClusterCount === detectionSettings.cracksRequired) {
            // We got a cluster! Decide if it's first or second crack.
            if (!roastState.firstCrackTime) {
                markPhase('First Crack (Auto)', 'firstCrackTime');
            } else if (!roastState.secondCrackTime && (now - roastState.firstCrackTime > 30000)) {
                // Must be at least 30s after first crack to be second crack
                markPhase('Second Crack (Auto)', 'secondCrackTime');
            }
        }
    }
}

// Record a smoothed energy point roughly once per second and refresh the live curve.
function sampleRoastCurve(rms) {
    if (!roastState.startTime) return;

    const now = Date.now();
    if (now - lastCurveSampleTime < CURVE_SAMPLE_MS) return;
    lastCurveSampleTime = now;

    // Smooth using recent history so the curve reflects sustained energy, not single spikes.
    const smoothed = recentRMSHistory.length
        ? recentRMSHistory.reduce((a, b) => a + b, 0) / recentRMSHistory.length
        : rms;

    roastState.curve.push({ t: now - roastState.startTime, rms: smoothed });

    drawRoastCurve(curveCanvas, roastState.curve, {
        firstCrackMs: roastState.firstCrackTime ? roastState.firstCrackTime - roastState.startTime : null,
        secondCrackMs: roastState.secondCrackTime ? roastState.secondCrackTime - roastState.startTime : null,
        totalMs: now - roastState.startTime
    });
}

function drawAndAnalyze() {
    if (!isRecording) return;

    animationId = requestAnimationFrame(drawAndAnalyze);

    analyser.getByteTimeDomainData(dataArray);

    const rms = calculateRMS(dataArray);

    if (isCalibrating) {
        calibrationSamples.push(rms);
    } else if (!isNotifying) {
        detectTransient(rms);
        sampleRoastCurve(rms);
    }

    // Oscilloscope visual
    canvasCtx.fillStyle = '#121212';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    canvasCtx.lineWidth = 2;
    // Turn stroke red if a transient spike is happening right now for visual feedback
    const isSpiking = (rms > Math.max(baselineNoiseRMS * detectionSettings.thresholdMultiplier, 0.05));
    canvasCtx.strokeStyle = isSpiking ? '#f44336' : '#ff9800';

    canvasCtx.beginPath();
    const sliceWidth = canvas.width * 1.0 / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) canvasCtx.moveTo(x, y);
        else canvasCtx.lineTo(x, y);
        x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
}
