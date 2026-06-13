import { saveRoastToHistory, adjustBeanQuantity, getRoastHistory, getPantry, getDetectionSettings, saveDetectionSettings, DEFAULT_DETECTION_SETTINGS, getRoastTargets, saveRoastTargets, DEFAULT_ROAST_TARGETS } from './storage.js';
import { drawRoastCurve, drawRoastCurves } from './chart.js';
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
// We look for sudden broadband spikes that exceed the baseline.
let recentRMSHistory = [];
const HISTORY_LENGTH = 10; // About 160ms of history at 60fps requestAnimationFrame
let transientClusterCount = 0;
let lastTransientTime = 0;
const TRANSIENT_COOLDOWN_MS = 100; // time between individual snaps
const CLUSTER_WINDOW_MS = 5000; // Require X snaps within 5 seconds to declare a crack phase

// Frequency-based crack classification.
// First crack is louder and lower-pitched; second crack is quieter, higher-pitched
// and faster. We compare energy in a low band vs a high band to tell them apart.
// The high-pass cutoff is kept low enough to preserve first crack's low-frequency
// signature (a 3000 Hz cut previously removed it) while still rejecting deep
// rumble and mains hum.
const HIGHPASS_HZ = 500;
const LOW_BAND = [800, 3000];     // first-crack-dominant band (Hz)
const HIGH_BAND = [3000, 8000];   // second-crack-dominant band (Hz)
const RATIO_WINDOW = 8;           // number of recent snaps averaged for the signature
const SECOND_CRACK_MIN_GAP_MS = 20000; // earliest 2C can follow 1C
let freqArray;
let recentRatios = [];            // high-band share of recent snaps

// User-tunable detection settings (persisted), loaded on init.
let detectionSettings = { ...DEFAULT_DETECTION_SETTINGS };

// Roast target alarms (persisted), loaded on init.
let roastTargets = { ...DEFAULT_ROAST_TARGETS };
let alarmFired = { total: false, dtr: false };

// Reference roast to follow (background profile). Null when not following.
let referenceCurve = null;     // [{ t, rms }]
let referenceMarkers = {};     // { firstCrackMs, secondCrackMs }
let refAnnounced = { fc: false, sc: false };
const REF_LEAD_MS = 10000;     // announce an upcoming crack this far ahead
const REF_COLOR = '#888';      // faint background colour for the reference curve

export function initAudioSystem() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    canvasCtx.fillStyle = '#121212';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    drawRoastCurve(curveCanvas, [], {});

    detectionSettings = getDetectionSettings();
    initDetectionSettingsUI();

    roastTargets = getRoastTargets();
    initTargetsUI();

    // Re-sync settings inputs when a backup is imported.
    window.addEventListener('settingsImported', syncSettingsInputs);

    initReferenceUI();
    // Refresh the reference list when history changes (new roast / import / delete).
    window.addEventListener('historyUpdated', populateReferenceSelect);
    window.addEventListener('pantryUpdated', populateReferenceSelect);

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
    const pitchInput = document.getElementById('pitchSetting');
    const threshVal = document.getElementById('thresholdValue');
    const cracksVal = document.getElementById('cracksValue');
    const pitchVal = document.getElementById('pitchValue');
    const resetBtn = document.getElementById('resetDetectionBtn');
    if (!threshInput || !cracksInput) return;

    const render = () => {
        threshInput.value = detectionSettings.thresholdMultiplier;
        cracksInput.value = detectionSettings.cracksRequired;
        if (pitchInput) pitchInput.value = detectionSettings.secondCrackPitch;
        if (threshVal) threshVal.textContent = Number(detectionSettings.thresholdMultiplier).toFixed(1) + '×';
        if (cracksVal) cracksVal.textContent = detectionSettings.cracksRequired;
        if (pitchVal) pitchVal.textContent = Math.round(detectionSettings.secondCrackPitch * 100) + '%';
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

    if (pitchInput) {
        pitchInput.addEventListener('input', () => {
            detectionSettings.secondCrackPitch = parseFloat(pitchInput.value);
            if (pitchVal) pitchVal.textContent = Math.round(detectionSettings.secondCrackPitch * 100) + '%';
            persist();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            detectionSettings = { ...DEFAULT_DETECTION_SETTINGS };
            persist();
            render();
        });
    }

    render();
}

// Fire a one-shot alarm when the roast reaches a configured total time or DTR.
function checkTargetAlarms(elapsedSeconds, metrics) {
    if (roastTargets.totalMinutes > 0 && !alarmFired.total &&
        elapsedSeconds >= roastTargets.totalMinutes * 60) {
        alarmFired.total = true;
        logMessage(`>>> <b>TARGET TIME ${roastTargets.totalMinutes} min REACHED</b> <<<`);
        notifyUser(`Target time of ${roastTargets.totalMinutes} min reached!`);
    }

    if (roastTargets.dtrPercent > 0 && !alarmFired.dtr && roastState.firstCrackTime &&
        metrics.dtr != null && metrics.dtr * 100 >= roastTargets.dtrPercent) {
        alarmFired.dtr = true;
        logMessage(`>>> <b>TARGET DTR ${roastTargets.dtrPercent}% REACHED</b> <<<`);
        notifyUser(`Target DTR of ${roastTargets.dtrPercent}% reached!`);
    }
}

function initReferenceUI() {
    const select = document.getElementById('referenceSelect');
    if (!select) return;
    populateReferenceSelect();
    select.addEventListener('change', () => loadReference(select.value));
}

function populateReferenceSelect() {
    const select = document.getElementById('referenceSelect');
    if (!select) return;

    const prev = select.value;
    const history = getRoastHistory()
        .filter(r => r.timeline && r.timeline.curve && r.timeline.curve.length >= 2)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    const pantry = getPantry();

    select.innerHTML = '<option value="">None</option>';
    history.forEach(roast => {
        const bean = pantry.find(b => b.id === roast.beanId) || { name: 'Unknown Bean' };
        const opt = document.createElement('option');
        opt.value = roast.id;
        opt.textContent = `${bean.name} — ${new Date(roast.date).toLocaleDateString()}`;
        select.appendChild(opt);
    });

    if (prev && history.find(r => r.id === prev)) select.value = prev;
    else loadReference(''); // selection no longer valid
}

function loadReference(id) {
    const roast = getRoastHistory().find(r => r.id === id);
    if (!roast) {
        referenceCurve = null;
        referenceMarkers = {};
        if (!isRecording) drawRoastCurve(curveCanvas, [], {});
        return;
    }

    const start = roast.timeline.startTime;
    referenceCurve = roast.timeline.curve;
    referenceMarkers = {
        firstCrackMs: roast.timeline.firstCrackTime ? roast.timeline.firstCrackTime - start : null,
        secondCrackMs: roast.timeline.secondCrackTime ? roast.timeline.secondCrackTime - start : null,
        totalMs: roast.timeline.endTime - start
    };
    refAnnounced = { fc: false, sc: false };

    // Preview the reference when idle.
    if (!isRecording) {
        drawRoastCurves(curveCanvas, [{
            curve: referenceCurve,
            color: REF_COLOR,
            label: 'Reference',
            firstCrackMs: referenceMarkers.firstCrackMs,
            secondCrackMs: referenceMarkers.secondCrackMs
        }]);
    }
}

// Warn ahead of the reference roast's crack events that haven't happened yet live.
function checkReferenceCues(elapsedMs) {
    if (!referenceCurve) return;

    if (referenceMarkers.firstCrackMs != null && !refAnnounced.fc && !roastState.firstCrackTime &&
        elapsedMs >= referenceMarkers.firstCrackMs - REF_LEAD_MS) {
        refAnnounced.fc = true;
        logMessage('>>> <b>Reference: first crack coming up (~10s)</b>');
        notifyUser('Reference: first crack in ~10s');
    }

    if (referenceMarkers.secondCrackMs != null && !refAnnounced.sc && !roastState.secondCrackTime &&
        elapsedMs >= referenceMarkers.secondCrackMs - REF_LEAD_MS) {
        refAnnounced.sc = true;
        logMessage('>>> <b>Reference: second crack coming up (~10s)</b>');
        notifyUser('Reference: second crack in ~10s');
    }
}

// Reload persisted settings into module state and update the inputs in place
// (without rebinding their change listeners) after a backup import.
function syncSettingsInputs() {
    detectionSettings = getDetectionSettings();
    roastTargets = getRoastTargets();

    const t = document.getElementById('thresholdSetting');
    const tv = document.getElementById('thresholdValue');
    if (t) t.value = detectionSettings.thresholdMultiplier;
    if (tv) tv.textContent = Number(detectionSettings.thresholdMultiplier).toFixed(1) + '×';

    const c = document.getElementById('cracksSetting');
    const cv = document.getElementById('cracksValue');
    if (c) c.value = detectionSettings.cracksRequired;
    if (cv) cv.textContent = detectionSettings.cracksRequired;

    const p = document.getElementById('pitchSetting');
    const pv = document.getElementById('pitchValue');
    if (p) p.value = detectionSettings.secondCrackPitch;
    if (pv) pv.textContent = Math.round(detectionSettings.secondCrackPitch * 100) + '%';

    const tt = document.getElementById('targetTotalSetting');
    if (tt) tt.value = roastTargets.totalMinutes || '';
    const td = document.getElementById('targetDtrSetting');
    if (td) td.value = roastTargets.dtrPercent || '';
}

function initTargetsUI() {
    const totalInput = document.getElementById('targetTotalSetting');
    const dtrInput = document.getElementById('targetDtrSetting');
    if (!totalInput || !dtrInput) return;

    totalInput.value = roastTargets.totalMinutes || '';
    dtrInput.value = roastTargets.dtrPercent || '';

    const persist = () => saveRoastTargets(roastTargets);

    totalInput.addEventListener('input', () => {
        roastTargets.totalMinutes = parseFloat(totalInput.value) || 0;
        persist();
    });

    dtrInput.addEventListener('input', () => {
        roastTargets.dtrPercent = parseFloat(dtrInput.value) || 0;
        persist();
    });
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

        // High-pass to remove deep rumble and mains hum, while preserving the
        // low-frequency energy that distinguishes first crack from second crack.
        highPassFilter = audioContext.createBiquadFilter();
        highPassFilter.type = 'highpass';
        highPassFilter.frequency.value = HIGHPASS_HZ;

        microphone.connect(highPassFilter);
        highPassFilter.connect(analyser);

        analyser.fftSize = 2048;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        freqArray = new Uint8Array(bufferLength);

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
    recentRatios = [];
    lastCurveSampleTime = 0;
    alarmFired = { total: false, dtr: false };
    refAnnounced = { fc: false, sc: false };

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

        const metrics = computeRoastMetrics(roastState);

        // Live development time / DTR once first crack is recorded.
        if (liveDtrDiv) {
            if (roastState.firstCrackTime) {
                liveDtrDiv.textContent = `Dev ${formatMs(metrics.developmentTimeMs)} | DTR ${formatDtr(metrics.dtr)}`;
            } else {
                liveDtrDiv.textContent = 'DTR --';
            }
        }

        checkTargetAlarms(elapsed, metrics);
        checkReferenceCues(Date.now() - roastState.startTime);
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

    // Final static render of the completed curve (with the reference if following).
    renderLiveCurve(roastState.endTime - roastState.startTime);

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

    const greenWeightG = parseFloat(document.getElementById('greenWeightInput')?.value) || 0;

    const finalRoastData = {
        date: new Date().toISOString(),
        roaster,
        beanId,
        settings: roasterSettings,
        greenWeightG,
        timeline: roastState,
        tastingNotes: { flavors: [], text: '' } // To be filled later in History tab
    };

    saveRoastToHistory(finalRoastData);
    window.dispatchEvent(new Event('historyUpdated'));

    // Deduct the green weight used from the selected bean's pantry stock.
    let stockMsg = '';
    if (beanId && greenWeightG > 0) {
        const remaining = adjustBeanQuantity(beanId, -greenWeightG);
        window.dispatchEvent(new Event('pantryUpdated'));
        if (remaining != null) stockMsg = `\n${greenWeightG} g deducted (remaining: ${remaining} g).`;
    }

    alert('Roast saved to history!' + stockMsg);
}

function calculateRMS(dataArray) {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const value = (dataArray[i] - 128) / 128;
        sum += value * value;
    }
    return Math.sqrt(sum / dataArray.length);
}

// Fraction of crack energy in the high band (0..1). Higher = more 2C-like.
function spectralHighRatio() {
    if (!freqArray || !analyser) return 0;
    analyser.getByteFrequencyData(freqArray);
    const binHz = audioContext.sampleRate / analyser.fftSize;

    let low = 0, high = 0;
    for (let i = 0; i < freqArray.length; i++) {
        const hz = i * binHz;
        const v = freqArray[i];
        if (hz >= LOW_BAND[0] && hz < LOW_BAND[1]) low += v;
        else if (hz >= HIGH_BAND[0] && hz < HIGH_BAND[1]) high += v;
    }
    const total = low + high;
    return total > 0 ? high / total : 0;
}

function avgRatio() {
    if (recentRatios.length === 0) return 0;
    return recentRatios.reduce((a, b) => a + b, 0) / recentRatios.length;
}

function detectTransient(rms) {
    const now = Date.now();

    recentRMSHistory.push(rms);
    if (recentRMSHistory.length > HISTORY_LENGTH) recentRMSHistory.shift();

    // A transient is a sudden spike well above the baseline and recent history.
    const recentAvg = recentRMSHistory.reduce((a, b) => a + b, 0) / recentRMSHistory.length;
    const spikeThreshold = Math.max(baselineNoiseRMS * detectionSettings.thresholdMultiplier, recentAvg * 2, 0.05);

    if (rms <= spikeThreshold || (now - lastTransientTime <= TRANSIENT_COOLDOWN_MS)) return;

    lastTransientTime = now;
    transientClusterCount++;

    // Capture the spectral signature of this snap.
    recentRatios.push(spectralHighRatio());
    if (recentRatios.length > RATIO_WINDOW) recentRatios.shift();

    // Reset the cluster (and signature window) after a quiet gap.
    setTimeout(() => {
        if (Date.now() - lastTransientTime >= CLUSTER_WINDOW_MS) {
            transientClusterCount = 0;
            recentRatios = [];
        }
    }, CLUSTER_WINDOW_MS);

    const ratio = avgRatio();

    if (!roastState.firstCrackTime) {
        // The first sustained burst of cracking is first crack.
        if (transientClusterCount >= detectionSettings.cracksRequired) {
            markPhase('First Crack (Auto)', 'firstCrackTime');
            const pitch = ratio >= detectionSettings.secondCrackPitch ? 'higher-pitched' : 'lower-pitched';
            logMessage(`Auto-detected ${pitch} cracking (high-band ${(ratio * 100).toFixed(0)}%).`);
        }
    } else if (!roastState.secondCrackTime &&
               now - roastState.firstCrackTime > SECOND_CRACK_MIN_GAP_MS &&
               recentRatios.length >= detectionSettings.cracksRequired &&
               ratio >= detectionSettings.secondCrackPitch) {
        // Faster, higher-pitched cracking after first crack reads as second crack.
        markPhase('Second Crack (Auto)', 'secondCrackTime');
        logMessage(`Higher-pitched cracking detected (high-band ${(ratio * 100).toFixed(0)}%).`);
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
    renderLiveCurve(now - roastState.startTime);
}

// Draw the live curve, overlaying the reference roast behind it when following.
function renderLiveCurve(elapsedMs) {
    const liveSeries = {
        curve: roastState.curve,
        color: '#ff9800',
        label: 'This roast',
        firstCrackMs: roastState.firstCrackTime ? roastState.firstCrackTime - roastState.startTime : null,
        secondCrackMs: roastState.secondCrackTime ? roastState.secondCrackTime - roastState.startTime : null
    };

    if (referenceCurve) {
        drawRoastCurves(curveCanvas, [
            { curve: referenceCurve, color: REF_COLOR, label: 'Reference',
              firstCrackMs: referenceMarkers.firstCrackMs, secondCrackMs: referenceMarkers.secondCrackMs },
            liveSeries
        ]);
    } else {
        drawRoastCurve(curveCanvas, roastState.curve, {
            firstCrackMs: liveSeries.firstCrackMs,
            secondCrackMs: liveSeries.secondCrackMs,
            totalMs: elapsedMs
        });
    }
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
