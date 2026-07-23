import { saveRoastToHistory, adjustBeanQuantity, getRoastHistory, getPantry, getDetectionSettings, saveDetectionSettings, DEFAULT_DETECTION_SETTINGS, getRoastTargets, saveRoastTargets, DEFAULT_ROAST_TARGETS, getTempUnit, saveTempUnit, getBehmorTemplate, getBehmorTemplates, getWeightUnit, getManualProfiles, getActiveRoaster, getActiveRoasterId, getDetectionLearningEnabled, saveDetectionLearningEnabled, getDetectionAdjustFor, saveDetectionAdjustFor, clearDetectionAdjustFor, getMfccExperimentalEnabled, saveMfccExperimentalEnabled, getRoastLabEnabled, saveRoastLabEnabled, saveLastRoastLab, getLastRoastLab, getRoastLabCloudSyncEnabled, saveRoastLabCloudSyncEnabled, appendRoastLabSession } from './storage.js';
import { mfcc } from './mfcc.js';
import { createSession, addFrame, addEvent, summariseRoastLab, formatRoastLabJson, formatRoastLabCsv, formatRoastLabSummaryText, roastLabFilename, ROAST_LAB_FRAME_MS } from './roastlab.js';
import { createShadowBank, stepShadowBank, summariseShadowBank } from './shadow.js';
import { applyAdjust, nudgeAdjust, describeAdjust, DEFAULT_ADJUST } from './detector-learning.js';
import { createNoiseFloor } from './calibration.js';
import {
    DEFAULT_GAP_WINDOW, gapWindowFromHistory, describeGapWindow, shouldCall2C,
    createBurpGuard, BURP_GUARD_MS, BURP_GUARD_FACTOR,
    alarmToneTargets, alarmNarrowbandShare, isAlarmLike,
} from './crack-intel.js';
import { drawRoastCurve, drawRoastCurves, drawRoastCurveDual } from './chart.js';
import { computeRoastMetrics, formatMs, formatDtr, computeRoRPoints, formatRoR, weightLabel } from './metrics.js';
import { connectRoaster, disconnectRoaster } from './bluetooth.js';
import { connectSerial, disconnectSerial } from './serial.js';
import { acquireWakeLock, releaseWakeLock } from './wakelock.js';

let audioContext;
let microphone;
let analyser;
let dataArray;
// Experimental MFCC feature extraction — OFF by default; never affects detection.
let mfccEnabled = false;
let lastMfcc = null;
let lastMfccAt = 0;

// Roast Lab — OFF by default. Captures a feature timeline + crack/clear events per roast
// for offline A/B analysis. Observational only; never affects detection.
let roastLabEnabled = false;
let labSession = null;
let lastLabFrameAt = 0;
// Shadow detector v2 — a bank of parallel, LOG-ONLY crack detectors. Runs alongside the live
// detector whenever Roast Lab capture is on, logging each variant's candidate cracks into the
// capture for offline comparison. NEVER alarms, drives, or touches the live detector / roastState.
let shadowBank = null;
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
const liveRorDiv = document.getElementById('liveRor');

const startBtn = document.getElementById('startBtn');
const startManualBtn = document.getElementById('startManualBtn');
const stopBtn = document.getElementById('stopBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const markDryEndBtn = document.getElementById('markDryEndBtn');
const markFirstCrackBtn = document.getElementById('markFirstCrackBtn');
const markSecondCrackBtn = document.getElementById('markSecondCrackBtn');
const undoFirstCrackBtn = document.getElementById('undoFirstCrackBtn');
const undoSecondCrackBtn = document.getElementById('undoSecondCrackBtn');
const stillFirstCrackBtn = document.getElementById('stillFirstCrackBtn');
const ackAlarmBtn = document.getElementById('ackAlarmBtn');
const alarmToneSelect = document.getElementById('alarmToneSelect');
const testAlarmBtn = document.getElementById('testAlarmBtn');
const logTempBtn = document.getElementById('logTempBtn');
const tempInput = document.getElementById('tempInput');
const tempUnitSelect = document.getElementById('tempUnit');
const envTempInput = document.getElementById('envTempInput');
const logEnvTempBtn = document.getElementById('logEnvTempBtn');
const connectProbeBtn = document.getElementById('connectProbeBtn');
const connectSerialBtn = document.getElementById('connectSerialBtn');
const probeStatus = document.getElementById('probeStatus');
const manualPowerBtns = document.querySelectorAll('.manual-power');
const manualPowerStatus = document.getElementById('manualPowerStatus');

let probeConnected = false;
let serialConnected = false;
let lastProbeLog = 0;

// Reference power schedule (from a manual profile) and which steps were announced.
let referencePowerLog = null;
let powerAnnounced = new Set();

// State for Roast and Detection
let roastState = {
    startTime: null,
    dryEndTime: null,
    firstCrackTime: null,
    secondCrackTime: null,
    endTime: null,
    phase: 'Ready',
    logs: [],
    curve: [],
    temps: [],
    envTemps: [],
    powerLog: []
};

// Roast-curve sampling
const CURVE_SAMPLE_MS = 1000; // record one energy point per second
let lastCurveSampleTime = 0;

// State for Audio Processing
let baselineNoiseRMS = 0.05; // Default safe value
let isCalibrating = false;
let calibrationSamples = [];

// Auto-calibration: a rolling pre-roast noise floor (js/calibration.js). Runs
// only when the mic is ALREADY permitted (never triggers the permission
// prompt), samples a few times a second while you set up, and is frozen into
// baselineNoiseRMS the moment a roast starts — so the floor includes the
// roaster warming up. Recency beats duration: the window forgets prep clatter.
const AUTO_CAL_TICK_MS = 250;
let noiseFloor = createNoiseFloor();
let autoCalTimer = null;
let autoCalTickCount = 0;

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
let freqArray;
let recentRatios = [];            // high-band share of recent snaps

// --- Detection intelligence (2026-07; see js/crack-intel.js + FUTURE_FEATURES.md) ---
// 1C is a tapering PERIOD, not an event: after declaring 1C we watch a wide,
// per-bean window for 2C (learned from this bean's own roast history; research
// default ~2–7 min) instead of the old fixed 20 s timer, gate 2C on crack RATE +
// band energy, and let the user say "still 1st crack" to hold off a premature call.
const STILL_1C_HOLD_MS = 45000;   // how long one "still 1st crack" tap suppresses 2C calls
const SNAP_TIMES_MAX = 40;        // recent counted snaps kept for the rate gate
let crackGapWindow = { ...DEFAULT_GAP_WINDOW }; // recomputed per roast for the selected bean
let stillFirstCrackUntil = 0;     // epoch ms: 2C calls held off until then
let snapTimes = [];               // epoch ms of recent counted snaps (rate gate)
// Door-"burp" guard: opening the door removes acoustic shielding → the sustained
// floor steps up. Track it on quiet frames, re-baseline on a step, and briefly
// demand extra confidence so door/fan/chaff transients don't read as cracks.
let burpGuard = null;
let burpGuardUntil = 0;
// Two-device beep guard: the frequencies (fundamental + harmonics) of this app's
// own alarm tones — another device's alarm is narrowband there; cracks are broadband.
let alarmGuardFreqs = null;       // computed lazily from ALARM_TONES below

// User-tunable detection settings (persisted), loaded on init.
let detectionSettings = { ...DEFAULT_DETECTION_SETTINGS };
// The settings actually used by the detector = base settings + the active
// roaster's learned offset (when auto-tune is on). Recomputed on init, when
// settings change, on roast start, and after each learning nudge.
let effectiveDetection = { ...DEFAULT_DETECTION_SETTINGS };

// Roast target alarms (persisted), loaded on init.
let roastTargets = { ...DEFAULT_ROAST_TARGETS };
let alarmFired = { total: false, dtr: false };

// Reference roast to follow (background profile). Null when not following.
let referenceCurve = null;     // [{ t, rms }]
let referenceMarkers = {};     // { firstCrackMs, secondCrackMs }
let refAnnounced = { fc: false, sc: false };
const REF_LEAD_MS = 10000;     // announce an upcoming crack this far ahead
const REF_COLOR = '#888';      // faint background colour for the reference curve

// Highlight the current roast phase on the live strip (Drying → Maillard →
// Development), derived from the dry-end / first-crack marks.
function updatePhaseStrip() {
    const strip = document.getElementById('phaseStrip');
    if (!strip) return;
    const order = ['drying', 'maillard', 'development'];
    const current = roastState.firstCrackTime ? 'development' : roastState.dryEndTime ? 'maillard' : 'drying';
    strip.querySelectorAll('span').forEach(s => {
        s.classList.toggle('phase-active', s.dataset.phase === current);
        s.classList.toggle('phase-done', order.indexOf(s.dataset.phase) < order.indexOf(current));
    });
}

// Idle state for the oscilloscope: a quiet hint instead of a blank black box.
function drawScopeIdle() {
    if (!canvasCtx) return;
    canvasCtx.fillStyle = '#121212';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    canvasCtx.fillStyle = '#777';
    canvasCtx.font = '12px monospace';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText('Live microphone waveform shows here while roasting or calibrating', canvas.width / 2, canvas.height / 2);
    canvasCtx.textAlign = 'left';
}

export function initAudioSystem() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    drawScopeIdle();

    drawRoastCurve(curveCanvas, [], { emptyMsg: 'Your roast curve draws here once a roast starts' });

    detectionSettings = getDetectionSettings();
    initDetectionSettingsUI();
    initAutoCalUI();
    recomputeEffectiveDetection();
    // Follow the active roaster: re-tune + refresh the readout when it changes.
    window.addEventListener('behmorConfigChanged', () => { recomputeEffectiveDetection(); updateLearningReadout(); });
    window.addEventListener('roasterChanged', () => { recomputeEffectiveDetection(); updateLearningReadout(); });

    roastTargets = getRoastTargets();
    initTargetsUI();

    // Re-sync settings inputs when a backup is imported.
    window.addEventListener('settingsImported', syncSettingsInputs);

    initReferenceUI();
    // Refresh the reference list when history changes (new roast / import / delete).
    window.addEventListener('historyUpdated', populateReferenceSelect);
    window.addEventListener('pantryUpdated', populateReferenceSelect);
    window.addEventListener('settingsImported', populateReferenceSelect);
    // Auto-load a Behmor profile template when the roaster config changes.
    window.addEventListener('behmorConfigChanged', applyBehmorTemplate);
    applyBehmorTemplate(); // apply for the initial dashboard config

    calibrateBtn.addEventListener('click', startCalibration);
    startBtn.addEventListener('click', () => startRoast(false));
    if (startManualBtn) startManualBtn.addEventListener('click', () => startRoast(true));
    stopBtn.addEventListener('click', stopRoast);

    if (markDryEndBtn) markDryEndBtn.addEventListener('click', () => markPhase('Dry End', 'dryEndTime'));
    // Log Behmor control-panel button presses onto the roast timeline (live mode).
    window.addEventListener('logRoasterAction', (e) => {
        if (isRecording && typeof e.detail === 'string') logMessage('🎛️ ' + e.detail);
    });
    markFirstCrackBtn.addEventListener('click', () => markPhase('First Crack (Manual)', 'firstCrackTime'));
    markSecondCrackBtn.addEventListener('click', () => markPhase('Second Crack (Manual)', 'secondCrackTime'));
    if (undoFirstCrackBtn) undoFirstCrackBtn.addEventListener('click', () => clearCrack('firstCrackTime'));
    if (undoSecondCrackBtn) undoSecondCrackBtn.addEventListener('click', () => clearCrack('secondCrackTime'));
    if (stillFirstCrackBtn) stillFirstCrackBtn.addEventListener('click', markStillFirstCrack);

    // Alarm: tone selection (persisted), test preview, and acknowledge.
    if (alarmToneSelect) {
        alarmToneSelect.value = getAlarmTone();
        alarmToneSelect.addEventListener('change', () => localStorage.setItem(ALARM_KEY, alarmToneSelect.value));
    }
    if (testAlarmBtn) testAlarmBtn.addEventListener('click', () => playTone(alarmToneSelect ? alarmToneSelect.value : getAlarmTone()));
    if (ackAlarmBtn) ackAlarmBtn.addEventListener('click', stopCrackAlarm);

    if (logTempBtn) logTempBtn.addEventListener('click', logTemperature);
    if (tempInput) tempInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') logTemperature(); });
    if (logEnvTempBtn) logEnvTempBtn.addEventListener('click', logEnvTemperature);
    if (envTempInput) envTempInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') logEnvTemperature(); });

    if (connectProbeBtn) connectProbeBtn.addEventListener('click', toggleProbe);
    if (connectSerialBtn) connectSerialBtn.addEventListener('click', toggleSerialProbe);
    document.addEventListener('roasterTemperature', onProbeTemperature);
    document.addEventListener('roasterDisconnected', () => { probeConnected = false; serialConnected = false; renderProbe(); });

    manualPowerBtns.forEach(btn => btn.addEventListener('click', () => logPower(parseInt(btn.dataset.power, 10))));
    if (tempUnitSelect) {
        tempUnitSelect.value = getTempUnit();
        tempUnitSelect.addEventListener('change', () => saveTempUnit(tempUnitSelect.value));
    }

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
    const calibInput = document.getElementById('calibSetting');
    const min1cInput = document.getElementById('min1cSetting');
    const threshVal = document.getElementById('thresholdValue');
    const cracksVal = document.getElementById('cracksValue');
    const pitchVal = document.getElementById('pitchValue');
    const calibVal = document.getElementById('calibValue');
    const min1cVal = document.getElementById('min1cValue');
    const resetBtn = document.getElementById('resetDetectionBtn');
    if (!threshInput || !cracksInput) return;

    const min1cLabel = (v) => (v > 0 ? v + ' min' : 'off');

    const render = () => {
        threshInput.value = detectionSettings.thresholdMultiplier;
        cracksInput.value = detectionSettings.cracksRequired;
        if (pitchInput) pitchInput.value = detectionSettings.secondCrackPitch;
        if (calibInput) calibInput.value = detectionSettings.calibrationSeconds;
        if (min1cInput) min1cInput.value = detectionSettings.min1cMinutes || 0;
        if (threshVal) threshVal.textContent = Number(detectionSettings.thresholdMultiplier).toFixed(1) + '×';
        if (cracksVal) cracksVal.textContent = detectionSettings.cracksRequired;
        if (pitchVal) pitchVal.textContent = Math.round(detectionSettings.secondCrackPitch * 100) + '%';
        if (calibVal) calibVal.textContent = (detectionSettings.calibrationSeconds || 8) + 's';
        if (min1cVal) min1cVal.textContent = min1cLabel(detectionSettings.min1cMinutes || 0);
    };

    const persist = () => { saveDetectionSettings(detectionSettings); recomputeEffectiveDetection(); };

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

    if (calibInput) {
        calibInput.addEventListener('input', () => {
            detectionSettings.calibrationSeconds = parseInt(calibInput.value, 10);
            if (calibVal) calibVal.textContent = detectionSettings.calibrationSeconds + 's';
            persist();
        });
    }

    if (min1cInput) {
        min1cInput.addEventListener('input', () => {
            detectionSettings.min1cMinutes = parseFloat(min1cInput.value) || 0;
            if (min1cVal) min1cVal.textContent = min1cLabel(detectionSettings.min1cMinutes);
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

    // --- Auto-tune (per-roaster detection learning) controls ---
    const learnToggle = document.getElementById('detectionLearningToggle');
    const resetLearnBtn = document.getElementById('resetLearningBtn');
    if (learnToggle) {
        learnToggle.checked = getDetectionLearningEnabled();
        learnToggle.addEventListener('change', () => {
            saveDetectionLearningEnabled(learnToggle.checked);
            recomputeEffectiveDetection();
            updateLearningReadout();
        });
    }
    if (resetLearnBtn) {
        resetLearnBtn.addEventListener('click', () => {
            clearDetectionAdjustFor(getActiveRoasterId());
            recomputeEffectiveDetection();
            updateLearningReadout();
        });
    }
    updateLearningReadout();

    // --- Experimental: MFCC feature extraction (off by default, no effect on detection) ---
    const mfccToggle = document.getElementById('mfccExperimentalToggle');
    mfccEnabled = getMfccExperimentalEnabled();
    if (mfccToggle) {
        mfccToggle.checked = mfccEnabled;
        mfccToggle.addEventListener('change', () => {
            mfccEnabled = mfccToggle.checked;
            saveMfccExperimentalEnabled(mfccEnabled);
            updateMfccReadout();
        });
    }
    updateMfccReadout();

    // --- Roast Lab: capture a feature timeline + events per roast (off by default) ---
    const roastLabToggle = document.getElementById('roastLabToggle');
    roastLabEnabled = getRoastLabEnabled();
    if (roastLabToggle) {
        roastLabToggle.checked = roastLabEnabled;
        roastLabToggle.addEventListener('change', () => {
            roastLabEnabled = roastLabToggle.checked;
            saveRoastLabEnabled(roastLabEnabled);
            updateRoastLabReadout();
        });
    }
    const labJsonBtn = document.getElementById('roastLabExportJsonBtn');
    if (labJsonBtn) labJsonBtn.addEventListener('click', () => exportRoastLab('json'));
    const labCsvBtn = document.getElementById('roastLabExportCsvBtn');
    if (labCsvBtn) labCsvBtn.addEventListener('click', () => exportRoastLab('csv'));
    const labCopyBtn = document.getElementById('roastLabCopyBtn');
    if (labCopyBtn) labCopyBtn.addEventListener('click', copyRoastLabSummary);
    const labShareBtn = document.getElementById('roastLabShareBtn');
    if (labShareBtn) labShareBtn.addEventListener('click', () => shareRoastLab('json'));
    const labCloudToggle = document.getElementById('roastLabCloudSyncToggle');
    if (labCloudToggle) {
        labCloudToggle.checked = getRoastLabCloudSyncEnabled();
        labCloudToggle.addEventListener('change', () => {
            saveRoastLabCloudSyncEnabled(labCloudToggle.checked);
        });
    }
    updateRoastLabReadout();

    render();
}

// Show a crack's "✗ Clear" button only once that crack has actually been recorded.
// Before then there's nothing to clear, so keeping it hidden (not just disabled) keeps
// the live screen calm — and makes it unmissable exactly when it becomes usable.
function showClearCrackBtn(btn, show) {
    if (!btn) return;
    btn.hidden = !show;
    btn.disabled = !show;
}

// "⏳ Still 1st crack" is only meaningful between 1C being recorded and 2C: it says
// "these pops are still first crack — don't call 2nd crack yet". Hidden otherwise,
// same calm-screen rule as the ✗ Clear buttons.
function showStillFirstCrackBtn(show) {
    if (!stillFirstCrackBtn) return;
    stillFirstCrackBtn.hidden = !show;
    stillFirstCrackBtn.disabled = !show;
}

// The user says the current pops are still first crack (1C is a tapering ~1–2 min
// cluster — late pops are NOT second crack). Holds off auto-2C for a while, drops
// the pitch evidence gathered so far (it was 1C tail, not 2C), records the marker
// on the roast timeline, and teaches the learner that 2C must sound clearly
// higher-pitched on this roaster.
function markStillFirstCrack() {
    if (!isRecording || !roastState.firstCrackTime || roastState.secondCrackTime) return;
    const now = Date.now();
    stillFirstCrackUntil = now + STILL_1C_HOLD_MS;
    recentRatios = [];
    if (!Array.isArray(roastState.stillFirstCrackMarks)) roastState.stillFirstCrackMarks = [];
    roastState.stillFirstCrackMarks.push(now - roastState.startTime);
    if (!roastState.manualMode) applyLearningSignal('still1c');
    logMessage(`⏳ <b>Still 1st crack</b> — holding off 2nd-crack calls for ${Math.round(STILL_1C_HOLD_MS / 1000)}s.`);
    updateStatus('Still 1st crack — watching for the real 2nd crack.');
    logRoastLabEvent('still1c', 'Still 1st crack', false); // capture (no-op when off)
}

// --- Dev/Test mode capture lock (owner-only; driven by js/devmode.js) --------
// When the owner is signed in, Dev mode force-enables capture so every test roast
// records data without anyone having to remember to flip toggles mid-roast. This
// locks Roast Lab + MFCC on (which also wakes the shadow-detector sweep); passing
// `false` restores the user's own saved preferences. It only touches CAPTURE
// (observational) — it never changes crack detection itself.
export function setDevModeCaptureLock(on) {
    const roastLabToggle = document.getElementById('roastLabToggle');
    const mfccToggle = document.getElementById('mfccExperimentalToggle');
    if (on) {
        roastLabEnabled = true;
        mfccEnabled = true;
    } else {
        roastLabEnabled = getRoastLabEnabled();
        mfccEnabled = getMfccExperimentalEnabled();
    }
    if (roastLabToggle) { roastLabToggle.checked = roastLabEnabled; roastLabToggle.disabled = on; }
    if (mfccToggle) { mfccToggle.checked = mfccEnabled; mfccToggle.disabled = on; }
    updateRoastLabReadout();
    updateMfccReadout();
}

// Refresh the experimental MFCC readout/toggle state in the settings panel.
function updateMfccReadout() {
    const readout = document.getElementById('mfccReadout');
    if (readout) readout.textContent = mfccEnabled ? 'on — computing alongside detection (no effect on it)' : 'off';
    const toggle = document.getElementById('mfccExperimentalToggle');
    if (toggle) toggle.checked = mfccEnabled;
}

// EXPERIMENTAL + OFF BY DEFAULT. Compute MFCCs from the current audio frame for comparison only.
// Wrapped so it can never disturb the roast/detection loop, and throttled so it stays cheap.
function maybeComputeMfcc() {
    // Compute when the experimental readout is on OR Roast Lab needs the vector for capture.
    if ((!mfccEnabled && !roastLabEnabled) || !dataArray || !audioContext) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - lastMfccAt < 400) return; // ~2–3 frames/sec is plenty for an experimental readout
    lastMfccAt = now;
    try {
        const n = dataArray.length; // 2048 (power of 2)
        const frame = new Array(n);
        for (let i = 0; i < n; i++) frame[i] = (dataArray[i] - 128) / 128; // byte -> [-1,1]
        lastMfcc = mfcc(frame, { sampleRate: audioContext.sampleRate });
        window.dispatchEvent(new CustomEvent('mfccFrame', { detail: { coeffs: lastMfcc } }));
    } catch (e) {
        console.warn('[mfcc] experimental compute failed (detection unaffected):', e && e.message);
    }
}

// The most recent experimental MFCC vector (or null). For comparison/inspection only.
export function getLastMfcc() { return lastMfcc; }

// --- Roast Lab capture (off by default; observational, never affects detection) ---

// Gather the roast context stored alongside the captured timeline for offline analysis.
function buildRoastLabMeta() {
    const activeRoaster = getActiveRoaster() || {};
    const beanSel = document.getElementById('beanSelect');
    const beanName = beanSel && beanSel.selectedOptions && beanSel.selectedOptions[0]
        ? beanSel.selectedOptions[0].textContent.split(' — ')[0].trim() : '';
    return {
        startedAt: new Date().toISOString(),
        dateStr: new Date().toISOString().slice(0, 10),
        bean: beanName,
        roaster: activeRoaster.name || '',
        roasterModel: activeRoaster.model || '',
        manualMode: roastState.manualMode,
        sampleRate: audioContext ? audioContext.sampleRate : null,
        detection: { ...effectiveDetection },
        learningEnabled: getDetectionLearningEnabled(),
        appVersion: 'roast-lab-v1',
    };
}

// Throttled per-frame capture: RMS, high-band ratio and the latest MFCC vector.
function maybeCaptureRoastLab(rms) {
    if (!roastLabEnabled || !labSession || !roastState.startTime) return;
    const now = Date.now();
    if (now - lastLabFrameAt < ROAST_LAB_FRAME_MS) return;
    lastLabFrameAt = now;
    try {
        addFrame(labSession, {
            t: now - roastState.startTime,
            rms,
            bandRatio: spectralHighRatio(),
            mfcc: getLastMfcc(),
        });
        updateRoastLabReadout();
    } catch (e) {
        console.warn('[roastlab] frame capture failed (detection unaffected):', e && e.message);
    }
}

// Advance the shadow-detector bank one frame and log any candidate cracks it calls. Runs at the
// full animation-frame rate (cracks are short — the 500ms capture throttle would miss them), but
// it is strictly LOG-ONLY: every fired event becomes a 'shadow' entry in the Roast Lab capture and
// nothing else. It cannot alarm, mark a phase, or change the live detector in any way.
function maybeStepShadow(rms) {
    if (!roastLabEnabled || !shadowBank || !labSession || !roastState.startTime) return;
    try {
        const t = Date.now() - roastState.startTime;
        // Only pay for the band-ratio FFT read on loud-ish frames — the variants only consult the
        // pitch signature when a snap is registered anyway.
        const bandRatio = rms > 0.05 ? spectralHighRatio() : 0;
        const events = stepShadowBank(shadowBank, { t, rms, bandRatio });
        for (const ev of events) {
            // Tagged 'shadow' so the export keeps it distinct from real Auto/Manual crack events.
            logRoastLabEvent('shadow', `${ev.variantId} ${ev.kind}`, true);
        }
    } catch (e) {
        console.warn('[shadow] step failed (live detection unaffected):', e && e.message);
    }
}

// Record a crack/clear event onto the active capture (mirrors the markPhase/clearCrack calls).
function logRoastLabEvent(type, label, auto) {
    if (!roastLabEnabled || !labSession || !roastState.startTime) return;
    addEvent(labSession, { t: Date.now() - roastState.startTime, type, label, auto: !!auto });
    updateRoastLabReadout();
}

// At roast end, persist the capture so it can still be exported after a reload.
function finalizeRoastLab() {
    if (!labSession) return;
    labSession.meta.endedAt = new Date().toISOString();
    saveLastRoastLab(labSession);
    // Opt-in cloud backup: append a tagged record to the synced sessions list so it auto-collects
    // across the user's signed-in devices. OFF by default; never uploads without consent.
    if (getRoastLabCloudSyncEnabled()) {
        try {
            const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : `${labSession.meta.startedAt || 'roast'}-${Math.round(performance.now())}`;
            appendRoastLabSession({ id, updatedAt: Date.now(), ...labSession });
            window.dispatchEvent(new Event('roastLabSessionsUpdated')); // nudge sync to push it
        } catch (e) {
            console.warn('[roastlab] cloud-sync append failed (capture still saved locally):', e && e.message);
        }
    }
    const s = summariseRoastLab(labSession);
    logMessage(`🧪 Roast Lab captured ${s.frames} frames + ${s.events} events — export from Detection settings.`);
    if (shadowBank) {
        // A one-line wrap-up of what each shadow variant called this roast — the real comparison
        // happens offline against the export, but this is a useful at-a-glance sanity check.
        const parts = summariseShadowBank(shadowBank).map(v => {
            const fc = v.firstCrackT != null ? `1C@${Math.round(v.firstCrackT / 1000)}s` : '1C –';
            const sc = v.secondCrackT != null ? ` 2C@${Math.round(v.secondCrackT / 1000)}s` : '';
            return `${v.id} ${fc}${sc} (${v.transients})`;
        });
        logMessage(`🫥 Shadow detectors (log-only): ${parts.join(' · ')}`);
    }
    updateRoastLabReadout();
}

// Refresh the Roast Lab readout + enable/disable export buttons for the last capture.
function updateRoastLabReadout() {
    const readout = document.getElementById('roastLabReadout');
    const session = labSession || getLastRoastLab();
    if (readout) {
        if (!roastLabEnabled && !session) {
            readout.textContent = 'off';
        } else {
            const s = summariseRoastLab(session);
            const live = labSession && isRecording ? 'capturing — ' : (session ? 'last roast — ' : 'on — ');
            readout.textContent = session
                ? `${live}${s.frames} frames, ${s.cracks} crack/${s.clears} clear, ${s.mfccDims} MFCC dims`
                : 'on — waiting for a roast';
        }
    }
    const hasData = !!(session && session.frames && session.frames.length);
    ['roastLabExportJsonBtn', 'roastLabExportCsvBtn', 'roastLabCopyBtn', 'roastLabShareBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !hasData;
    });

    // Shadow-detector line: how many variants are running and what they've called so far.
    const shadowEl = document.getElementById('shadowReadout');
    if (shadowEl) {
        if (!shadowBank) {
            shadowEl.textContent = roastLabEnabled ? 'ready — starts with the next roast' : 'off (runs when Roast Lab is on)';
        } else {
            const sum = summariseShadowBank(shadowBank);
            const calls = sum.filter(v => v.firstCrackT != null).length;
            shadowEl.textContent = `${sum.length} variants · ${calls} called 1C — full detail in the export`;
        }
    }
}

// Download the captured session as JSON or CSV.
function exportRoastLab(kind) {
    const session = labSession || getLastRoastLab();
    if (!session || !session.frames || !session.frames.length) {
        updateStatus('No Roast Lab capture yet — run a roast with Roast Lab on first.');
        return;
    }
    const text = kind === 'csv' ? formatRoastLabCsv(session) : formatRoastLabJson(session);
    const mime = kind === 'csv' ? 'text/csv' : 'application/json';
    const name = roastLabFilename(session.meta, kind);
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

// Copy a one-line summary to the clipboard (handy for pasting into a chat/notes quickly).
function copyRoastLabSummary() {
    const session = labSession || getLastRoastLab();
    if (!session) { updateStatus('No Roast Lab capture yet.'); return; }
    const text = formatRoastLabSummaryText(session);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => updateStatus('Roast Lab summary copied to clipboard.'))
            .catch(() => updateStatus(text));
    } else {
        updateStatus(text);
    }
}

// Share the captured session as a file via the native share sheet — the simplest way to get a
// capture off a phone/tablet (Mail to yourself, AirDrop to a Mac, Save to Files) without wrestling
// with iOS's clunky Blob downloads. Falls back to a normal download when Web Share with files isn't
// available (e.g. desktop Firefox). Defaults to JSON (richest for analysis).
async function shareRoastLab(kind = 'json') {
    const session = labSession || getLastRoastLab();
    if (!session || !session.frames || !session.frames.length) {
        updateStatus('No Roast Lab capture yet — run a roast with Roast Lab on first.');
        return;
    }
    const text = kind === 'csv' ? formatRoastLabCsv(session) : formatRoastLabJson(session);
    const mime = kind === 'csv' ? 'text/csv' : 'application/json';
    const name = roastLabFilename(session.meta, kind);
    try {
        const file = new File([text], name, { type: mime });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: name, text: 'GI-bravo Roast Lab capture' });
            updateStatus('Shared the Roast Lab capture.');
            return;
        }
    } catch (e) {
        if (e && e.name === 'AbortError') { updateStatus('Share cancelled.'); return; } // user closed the sheet
        // anything else → fall through to the download fallback
    }
    exportRoastLab(kind);
    updateStatus('Native share not available here — downloaded the file instead.');
}

// Effective detection = base settings + this roaster's learned offset (when
// auto-tune is enabled). Keeps the manual sliders authoritative and only shifts
// the spike threshold.
function recomputeEffectiveDetection() {
    effectiveDetection = getDetectionLearningEnabled()
        ? applyAdjust(detectionSettings, getDetectionAdjustFor(getActiveRoasterId()))
        : { ...detectionSettings };
}

// Record one explicit correction against the active roaster and re-tune.
function applyLearningSignal(signal) {
    if (!getDetectionLearningEnabled()) return;
    const roasterId = getActiveRoasterId();
    if (!roasterId) return;
    const next = nudgeAdjust(getDetectionAdjustFor(roasterId) || DEFAULT_ADJUST, signal);
    saveDetectionAdjustFor(roasterId, next);
    recomputeEffectiveDetection();
    const how = signal === 'falsePositive' ? 'less sensitive'
        : (signal === 'missed' || signal === 'missedSecond') ? 'more sensitive'
        : signal === 'still1c' ? 'expecting 2nd crack to sound clearly higher-pitched'
        : 'noted';
    logMessage(`🎯 Auto-tuned: detection is now ${how} for this roaster.`);
    updateLearningReadout();
}

// Refresh the "Tuning: …" line + toggle state in the settings panel.
function updateLearningReadout() {
    const readout = document.getElementById('learningReadout');
    const toggle = document.getElementById('detectionLearningToggle');
    const enabled = getDetectionLearningEnabled();
    if (toggle) toggle.checked = enabled;
    if (!readout) return;
    readout.textContent = enabled
        ? describeAdjust(getDetectionAdjustFor(getActiveRoasterId()), detectionSettings)
        : 'off';
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

    // Behmor profile templates
    const templates = getBehmorTemplates();
    Object.entries(templates).forEach(([key, t]) => {
        const opt = document.createElement('option');
        opt.value = `behmor:${key}`;
        opt.textContent = `Behmor ${t.profile} @ ${weightLabel(t.weight, getWeightUnit())}${t.name ? ' — ' + t.name : ''}`;
        select.appendChild(opt);
    });

    // Manual profiles (recorded power recipes)
    const manuals = getManualProfiles();
    Object.values(manuals).forEach(mp => {
        const opt = document.createElement('option');
        opt.value = `manual:${mp.id}`;
        opt.textContent = `Manual: ${mp.name}${mp.weight ? ' @ ' + weightLabel(mp.weight, getWeightUnit()) : ''}`;
        select.appendChild(opt);
    });

    const stillValid = (prev.startsWith('behmor:') && templates[prev.slice(7)]) ||
        (prev.startsWith('manual:') && manuals[prev.slice(7)]) ||
        history.find(r => r.id === prev);
    if (prev && stillValid) select.value = prev;
    else loadReference(''); // selection no longer valid
}

function loadReference(value) {
    if (value && value.startsWith('behmor:')) {
        const tmpl = getBehmorTemplates()[value.slice(7)];
        if (tmpl) {
            applyReference(tmpl.curve, { firstCrackMs: tmpl.firstCrackMs, secondCrackMs: tmpl.secondCrackMs, totalMs: tmpl.totalMs });
            return;
        }
    }
    if (value && value.startsWith('manual:')) {
        const mp = getManualProfiles()[value.slice(7)];
        if (mp) {
            applyReference(mp.curve, { firstCrackMs: mp.firstCrackMs, secondCrackMs: mp.secondCrackMs, totalMs: mp.totalMs }, mp.powerLog);
            return;
        }
    }
    const roast = getRoastHistory().find(r => r.id === value);
    if (!roast) { applyReference(null, {}); return; }

    const start = roast.timeline.startTime;
    applyReference(roast.timeline.curve, {
        firstCrackMs: roast.timeline.firstCrackTime ? roast.timeline.firstCrackTime - start : null,
        secondCrackMs: roast.timeline.secondCrackTime ? roast.timeline.secondCrackTime - start : null,
        totalMs: roast.timeline.endTime - start
    });
}

function applyReference(curve, markers, powerLog) {
    referenceCurve = (curve && curve.length >= 2) ? curve : null;
    referenceMarkers = referenceCurve ? markers : {};
    referencePowerLog = (powerLog && powerLog.length) ? powerLog : null;
    refAnnounced = { fc: false, sc: false };
    powerAnnounced = new Set();

    if (!isRecording) {
        if (referenceCurve) {
            drawRoastCurves(curveCanvas, [{
                curve: referenceCurve, color: REF_COLOR, label: 'Reference', dashed: true,
                firstCrackMs: markers.firstCrackMs, secondCrackMs: markers.secondCrackMs
            }]);
        } else {
            drawRoastCurve(curveCanvas, [], {});
        }
    }
}

// When the Behmor roaster/profile/weight changes, auto-select a matching template.
function applyBehmorTemplate() {
    const select = document.getElementById('referenceSelect');
    if (!select) return;

    const roaster = document.getElementById('roasterSelect')?.value;
    const profile = document.querySelector('.behmor-profile.active')?.dataset.profile;
    const weight = document.querySelector('.behmor-weight.active')?.dataset.weight;

    populateReferenceSelect();
    if (roaster !== 'behmor' || !profile || !weight) return;

    const tmpl = getBehmorTemplate(profile, weight);
    if (tmpl) {
        const key = `behmor:${tmpl.profile}|${tmpl.weight}`;
        if ([...select.options].some(o => o.value === key)) { select.value = key; loadReference(key); }
    } else if (select.value.startsWith('behmor:')) {
        select.value = '';
        loadReference('');
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

    // Manual-profile power-change cues.
    if (referencePowerLog) {
        referencePowerLog.forEach((pc, i) => {
            if (!powerAnnounced.has(i) && elapsedMs >= pc.t - REF_LEAD_MS) {
                powerAnnounced.add(i);
                logMessage(`>>> <b>Reference: set power to ${pc.power}% (~10s)</b>`);
                notifyUser(`Set power to ${pc.power}% in ~10s`);
            }
        });
    }
}

// Reload persisted settings into module state and update the inputs in place
// (without rebinding their change listeners) after a backup import.
function syncSettingsInputs() {
    detectionSettings = getDetectionSettings();
    roastTargets = getRoastTargets();
    recomputeEffectiveDetection();
    updateLearningReadout();

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

    const cal = document.getElementById('calibSetting');
    const calv = document.getElementById('calibValue');
    if (cal) cal.value = detectionSettings.calibrationSeconds || 8;
    if (calv) calv.textContent = (detectionSettings.calibrationSeconds || 8) + 's';

    const m1 = document.getElementById('min1cSetting');
    const m1v = document.getElementById('min1cValue');
    if (m1) m1.value = detectionSettings.min1cMinutes || 0;
    if (m1v) m1v.textContent = (detectionSettings.min1cMinutes || 0) > 0 ? detectionSettings.min1cMinutes + ' min' : 'off';

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
    // Remember whether the detector or the user recorded this crack — the learner
    // (and the "clear = false positive" signal) needs to tell them apart.
    const isAuto = phaseName.includes('Auto');
    if (stateKey === 'firstCrackTime') roastState.firstCrackAuto = isAuto;
    if (stateKey === 'secondCrackTime') roastState.secondCrackAuto = isAuto;
    // A MANUAL crack mark during a mic roast means the detector hadn't caught it
    // (missed) → nudge more sensitive for this roaster. A missed SECOND crack also
    // relaxes any learned "still 1C" pitch strictness (the gate was too strict).
    if (!isAuto && !roastState.manualMode &&
        (stateKey === 'firstCrackTime' || stateKey === 'secondCrackTime')) {
        applyLearningSignal(stateKey === 'secondCrackTime' ? 'missedSecond' : 'missed');
    }
    // Reveal the matching "clear" (false-positive) button now that a crack is recorded —
    // before this there's nothing to clear, so it stays hidden to keep the live screen calm.
    if (stateKey === 'firstCrackTime') {
        showClearCrackBtn(undoFirstCrackBtn, true);
        // 1C is a tapering period: open the per-bean 2C watch window and offer the
        // "still 1st crack" marker until 2C is recorded.
        showStillFirstCrackBtn(true);
        if (!roastState.manualMode) logMessage(`🧠 Watching for 2nd crack ${describeGapWindow(crackGapWindow)}.`);
    }
    if (stateKey === 'secondCrackTime') {
        showClearCrackBtn(undoSecondCrackBtn, true);
        showStillFirstCrackBtn(false); // 2C recorded — the marker's moment has passed
    }
    logMessage(`>>> <b>${phaseName.toUpperCase()} RECORDED</b> <<<`);
    updateStatus(`Listening - Phase: ${phaseName}`);
    notifyUser(`${phaseName} recorded!`);
    logRoastLabEvent('crack', phaseName, isAuto); // Roast Lab capture (no-op when off)
}

// Clear a wrongly-recorded crack (false positive) and resume detection.
function clearCrack(stateKey) {
    if (!roastState[stateKey]) return;
    // Clearing an AUTO-detected crack is an explicit false positive → nudge less
    // sensitive for this roaster (only on mic roasts).
    const wasAuto = stateKey === 'firstCrackTime' ? roastState.firstCrackAuto : roastState.secondCrackAuto;
    if (wasAuto && !roastState.manualMode) applyLearningSignal('falsePositive');
    roastState[stateKey] = null;
    const label = stateKey === 'firstCrackTime' ? 'First crack' : 'Second crack';
    // Clearing first crack also clears second (2C can't precede 1C).
    if (stateKey === 'firstCrackTime') {
        roastState.secondCrackTime = null;
        showClearCrackBtn(undoSecondCrackBtn, false);
        showClearCrackBtn(undoFirstCrackBtn, false);
        showStillFirstCrackBtn(false); // no 1C on record → nothing to be "still in"
    } else {
        showClearCrackBtn(undoSecondCrackBtn, false);
        showStillFirstCrackBtn(true); // back between 1C and 2C — the marker applies again
    }
    // Reset detection so the real crack can still be found.
    transientClusterCount = 0;
    recentRatios = [];
    snapTimes = []; // rate evidence too — the cleared burst must not re-trigger instantly
    stopCrackAlarm(); // silence any ongoing first-crack alarm
    logMessage(`✗ ${label} cleared (false alarm). Still listening.`);
    updateStatus(`${label} cleared — watching again.`);
    logRoastLabEvent('clear', label, wasAuto); // Roast Lab capture (no-op when off)
    renderLiveCurve(Date.now() - roastState.startTime); // remove the marker immediately
}

// Record a manual bean-temperature reading and update the live Rate of Rise.
function logTemperature() {
    if (!isRecording || !roastState.startTime) return;
    const temp = parseFloat(tempInput && tempInput.value);
    if (isNaN(temp)) return;

    roastState.temps.push({ t: Date.now() - roastState.startTime, temp });

    const unit = roastState.tempUnit || 'C';
    const points = computeRoRPoints(roastState.temps);
    const last = points[points.length - 1];
    const rorText = last ? ` (RoR ${formatRoR(last.ror)})` : '';
    logMessage(`Temp: ${temp}°${unit}${rorText}`);
    if (liveRorDiv) liveRorDiv.textContent = `${temp}°${unit} | RoR ${last ? formatRoR(last.ror) : '--'}`;

    if (tempInput) tempInput.value = '';
}

// Record a manual environment-temperature (ET) reading.
function logEnvTemperature() {
    if (!isRecording || !roastState.startTime) return;
    const temp = parseFloat(envTempInput && envTempInput.value);
    if (isNaN(temp)) return;
    roastState.envTemps.push({ t: Date.now() - roastState.startTime, temp });
    logMessage(`ET: ${temp}°${roastState.tempUnit || 'C'}`);
    if (envTempInput) envTempInput.value = '';
}

// Record a manual power change (Behmor manual mode: P1–P5 = 0/25/50/75/100%).
function logPower(power) {
    if (!isRecording || !roastState.startTime || isNaN(power)) return;
    roastState.powerLog.push({ t: Date.now() - roastState.startTime, power });
    logMessage(`Power → ${power}%`);
    if (manualPowerStatus) manualPowerStatus.textContent = `Current: ${power}%`;
    manualPowerBtns.forEach(b => b.classList.toggle('active', parseInt(b.dataset.power, 10) === power));
}

// --- Bluetooth temperature probe (B3) ---

function renderProbe() {
    if (connectProbeBtn) connectProbeBtn.textContent = probeConnected ? 'Disconnect Bluetooth' : 'Connect probe (Bluetooth)';
    if (connectSerialBtn) connectSerialBtn.textContent = serialConnected ? 'Disconnect USB' : 'Connect probe (USB)';
    if (probeStatus) {
        probeStatus.textContent = (probeConnected || serialConnected)
            ? `Probe: connected (${probeConnected ? 'Bluetooth' : 'USB'})`
            : 'Probe: not connected';
    }
}

async function toggleProbe() {
    if (probeConnected) { disconnectRoaster(); probeConnected = false; renderProbe(); return; }
    if (!navigator.bluetooth) {
        alert('Web Bluetooth is not available. Use Chrome or Edge over HTTPS (or localhost).');
        return;
    }
    if (probeStatus) probeStatus.textContent = 'Probe: connecting…';
    const ok = await connectRoaster();
    probeConnected = !!ok;
    renderProbe();
    if (!ok) alert('Could not connect to the probe. Make sure it is powered on and advertising.');
}

async function toggleSerialProbe() {
    if (serialConnected) { await disconnectSerial(); serialConnected = false; renderProbe(); return; }
    if (!navigator.serial) {
        alert('Web Serial is not available. Use Chrome or Edge over HTTPS (or localhost).');
        return;
    }
    if (probeStatus) probeStatus.textContent = 'Probe: connecting…';
    try {
        await connectSerial();
        serialConnected = true;
    } catch (e) {
        serialConnected = false;
        alert('Could not open the serial port.');
    }
    renderProbe();
}

// Live temperature from the probe (always in °C). Converts to the active unit,
// shows it live, and — while roasting — logs it (~1/s) and updates RoR + curve.
function onProbeTemperature(e) {
    const celsius = e.detail;
    if (typeof celsius !== 'number' || isNaN(celsius)) return;

    const unit = (isRecording && roastState.tempUnit) ? roastState.tempUnit : getTempUnit();
    const temp = unit === 'F' ? celsius * 9 / 5 + 32 : celsius;

    if (!isRecording || !roastState.startTime) {
        if (liveRorDiv) liveRorDiv.textContent = `Probe ${Math.round(temp)}°${unit}`;
        return;
    }

    const now = Date.now();
    if (now - lastProbeLog < 1000) return; // throttle to ~1/s
    lastProbeLog = now;

    roastState.temps.push({ t: now - roastState.startTime, temp: Math.round(temp * 10) / 10 });
    const points = computeRoRPoints(roastState.temps);
    const last = points[points.length - 1];
    if (liveRorDiv) liveRorDiv.textContent = `${Math.round(temp)}°${unit} | RoR ${last ? formatRoR(last.ror) : '--'}`;
    renderLiveCurve(now - roastState.startTime);
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

// --- First-crack alarm: repeats until acknowledged, with selectable tones ---------
const ALARM_KEY = 'alarmTone';
const ALARM_REPEAT_MS = 1800;
// Each tone is a short sequence of notes: { f: Hz, type, d: seconds }.
const ALARM_TONES = {
    chime:  [{ f: 880, type: 'sine', d: 0.18 }, { f: 1320, type: 'sine', d: 0.24 }],
    beep:   [{ f: 1000, type: 'square', d: 0.25 }],
    bell:   [{ f: 1568, type: 'sine', d: 0.55 }],
    buzzer: [{ f: 220, type: 'sawtooth', d: 0.18 }, { f: 220, type: 'sawtooth', d: 0.18 }]
};
let alarmCtx = null;
let alarmInterval = null;

export function getAlarmTone() {
    const t = localStorage.getItem(ALARM_KEY);
    return ALARM_TONES[t] ? t : 'chime';
}

// An output-only AudioContext (works even in no-mic manual mode).
function outputCtx() {
    if (audioContext) return audioContext;
    if (!alarmCtx) {
        try { alarmCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    }
    if (alarmCtx.state === 'suspended') alarmCtx.resume().catch(() => {});
    return alarmCtx;
}

function playTone(toneKey) {
    const ctx = outputCtx();
    if (!ctx) return;
    const seq = ALARM_TONES[toneKey] || ALARM_TONES.chime;
    let t = ctx.currentTime + 0.01;
    for (const note of seq) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = note.type;
        osc.frequency.setValueAtTime(note.f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + note.d);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(t + note.d + 0.02);
        t += note.d + 0.06;
    }
}

// Play the alarm once, suppressing crack detection during the tone so the speaker
// sound isn't itself picked up as a crack.
function alarmRing() {
    isNotifying = true;
    playTone(getAlarmTone());
    if (navigator.vibrate) { try { navigator.vibrate([250, 120, 250]); } catch {} }
    setTimeout(() => { isNotifying = false; }, 900);
}

// Start the repeating alarm and show the Acknowledge button. Idempotent.
function startCrackAlarm() {
    if (alarmInterval) return;
    alarmRing();
    alarmInterval = setInterval(alarmRing, ALARM_REPEAT_MS);
    if (ackAlarmBtn) ackAlarmBtn.style.display = 'block';
}

function stopCrackAlarm() {
    if (alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; }
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch {} }
    if (ackAlarmBtn) ackAlarmBtn.style.display = 'none';
}

async function setupAudio() {
    if (audioContext) {
        // Reuse an existing context, but iOS Safari often leaves it 'suspended' until
        // a user gesture resumes it — without this, the analyser reads silence.
        if (audioContext.state === 'suspended') { try { await audioContext.resume(); } catch {} }
        return true;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateStatus('This browser can’t access the microphone. Use “Start (no mic)”, or open in Safari/Chrome over https.');
        return false;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // iOS Safari starts the AudioContext suspended; resume it within this gesture so
        // crack detection actually receives audio.
        if (audioContext.state === 'suspended') { try { await audioContext.resume(); } catch {} }
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
        // Surface the real reason on-screen (helps diagnose iOS). Common cases:
        // NotAllowedError = permission/standalone; NotFoundError = no mic;
        // NotReadableError = mic in use by another app.
        const standalone = (window.navigator.standalone === true);
        let msg = `Microphone error (${err && err.name || 'unknown'}). `;
        if (err && err.name === 'NotAllowedError') {
            msg += standalone
                ? 'On iPhone, open this in the Safari browser (not the home-screen icon) and allow the mic — or use “Start (no mic)”.'
                : 'Allow the microphone (address-bar/site settings) — or use “Start (no mic)”.';
        } else if (err && err.name === 'NotReadableError') {
            msg += 'The mic is in use by another app. Close it, or use “Start (no mic)”.';
        } else {
            msg += 'Use “Start (no mic)” to roast without auto-detection.';
        }
        updateStatus(msg);
        return false;
    }
}

// --- Auto-calibration (rolling pre-roast noise floor) ---

// True when the mic can be opened WITHOUT prompting: either it's already open
// this session, or the Permissions API says it's granted. Where the API can't
// tell us (older Safari), we stay off until a roast/manual calibrate opens it.
async function micAlreadyPermitted() {
    if (audioContext) return true;
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const st = await navigator.permissions.query({ name: 'microphone' });
            return st.state === 'granted';
        }
    } catch { /* permission name unsupported */ }
    return false;
}

async function maybeStartAutoCalibration() {
    if (autoCalTimer || isRecording) return;
    if (detectionSettings && detectionSettings.autoCalibrate === false) return;
    if (!(await micAlreadyPermitted())) return;

    const ready = await setupAudio();
    if (!ready) return;
    // Without a user gesture the context can sit 'suspended' (autoplay policy);
    // the tick skips silent reads, and the next tap anywhere resumes it.
    if (audioContext.state === 'suspended') {
        try { await audioContext.resume(); } catch {}
        if (audioContext.state === 'suspended') {
            document.addEventListener('pointerdown', () => { if (audioContext) audioContext.resume().catch(() => {}); }, { once: true });
        }
    }

    autoCalTimer = setInterval(autoCalTick, AUTO_CAL_TICK_MS);
    renderAutoCalIndicator();
}

function stopAutoCalibration() {
    if (autoCalTimer) { clearInterval(autoCalTimer); autoCalTimer = null; }
    renderAutoCalIndicator();
}

function autoCalTick() {
    if (isRecording || !analyser) return;
    // A suspended context reads all-128 (silence) — sampling it would drive the
    // floor to zero and make detection hair-triggered.
    if (!audioContext || audioContext.state !== 'running') return;
    analyser.getByteTimeDomainData(dataArray);
    noiseFloor.add(Date.now(), calculateRMS(dataArray));
    autoCalTickCount += 1;
    if (autoCalTickCount % 8 === 0) updateAutoCalReadout(); // ~every 2 s
}

function renderAutoCalIndicator() {
    const el = document.getElementById('autoCalStatus');
    if (el) el.style.display = autoCalTimer ? 'flex' : 'none';
    updateAutoCalReadout();
}

function updateAutoCalReadout(frozenText) {
    const el = document.getElementById('autoCalReadout');
    if (!el) return;
    if (frozenText) { el.textContent = frozenText; return; }
    if (!autoCalTimer) { el.textContent = detectionSettings && detectionSettings.autoCalibrate === false ? 'off' : 'waiting for mic permission (start a roast or calibrate once)'; return; }
    const b = noiseFloor.baseline();
    el.textContent = b != null ? `${b.toFixed(3)} (rolling, last 45 s)` : 'listening…';
}

function initAutoCalUI() {
    const toggle = document.getElementById('autoCalToggle');
    if (toggle) {
        toggle.checked = detectionSettings.autoCalibrate !== false;
        toggle.addEventListener('change', () => {
            detectionSettings.autoCalibrate = toggle.checked;
            saveDetectionSettings(detectionSettings);
            if (toggle.checked) maybeStartAutoCalibration(); else stopAutoCalibration();
        });
    }
    const offBtn = document.getElementById('autoCalOffBtn');
    if (offBtn) offBtn.addEventListener('click', () => {
        detectionSettings.autoCalibrate = false;
        saveDetectionSettings(detectionSettings);
        if (toggle) toggle.checked = false;
        stopAutoCalibration();
    });

    // Don't hold the mic/timer while the app is in the background; pick the
    // window back up when the user returns.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopAutoCalibration();
        else maybeStartAutoCalibration();
    });

    window.addEventListener('settingsImported', () => {
        if (toggle) toggle.checked = detectionSettings.autoCalibrate !== false;
        if (detectionSettings.autoCalibrate === false) stopAutoCalibration(); else maybeStartAutoCalibration();
    });

    updateAutoCalReadout(); // show "waiting for permission" / "off" before the first start
    maybeStartAutoCalibration();
}

async function startCalibration() {
    const ready = await setupAudio();
    if (!ready) return;

    const secs = Math.max(3, Math.min(30, detectionSettings.calibrationSeconds || 8));
    calibrateBtn.disabled = true;
    startBtn.disabled = true;
    if (startManualBtn) startManualBtn.disabled = true;
    isCalibrating = true;
    calibrationSamples = [];
    isRecording = true;

    // To handle INTERMITTENT talking, sample for several seconds and let normal room
    // sounds happen — a short, silent sample sets the floor too low and chatter then
    // trips detection. A live countdown tells the user how long to wait.
    let remaining = secs;
    const msg = () => updateStatus(`Calibrating ${remaining}s… let the room sound normal (talking is fine).`);
    msg();
    const tick = setInterval(() => { remaining -= 1; if (remaining > 0) msg(); }, 1000);

    setTimeout(() => {
        clearInterval(tick);
        isCalibrating = false;
        isRecording = false;

        if (calibrationSamples.length > 0) {
            // Use the 90th percentile, NOT the mean: with intermittent talking the mean
            // sits near the quiet floor, so chatter exceeds it. The high percentile lifts
            // the baseline to roughly the louder room level, rejecting voices.
            const sorted = [...calibrationSamples].sort((a, b) => a - b);
            baselineNoiseRMS = sorted[Math.min(sorted.length - 1, Math.floor(0.9 * sorted.length))];
        }

        // The status line is the feedback — no blocking dialog.
        updateStatus(`✓ Calibrated from ${secs}s of room noise — detection now ignores sounds up to that level.`);
        calibrateBtn.disabled = false;
        startBtn.disabled = false;
        if (startManualBtn) startManualBtn.disabled = false;
        // Keep the rolling floor consistent with the manual result, then let
        // auto-calibration carry on from there (mic is clearly permitted now).
        noiseFloor.seed(Date.now(), calibrationSamples);
        maybeStartAutoCalibration();
    }, secs * 1000);

    drawAndAnalyze();
}

// Start a roast. manual=false (default) uses the microphone for automatic crack
// detection; manual=true runs the timer + manual controls WITHOUT the mic. In BOTH
// modes you can mark cracks yourself and log power changes (e.g. P5 → P3).
async function startRoast(manual = false) {
    if (!manual) {
        // Immediate feedback — getUserMedia can take a moment, and previously the
        // button looked like it "did nothing" while waiting.
        updateStatus('Starting — please allow the microphone…');
        const ready = await setupAudio();
        if (!ready) return; // setupAudio already showed a specific on-screen reason

        // Freeze the auto-calibrated floor for this roast: it reflects the room
        // as it sounds RIGHT NOW (roaster warming up included). If the rolling
        // window hasn't gathered enough yet, keep the previous baseline.
        if (detectionSettings.autoCalibrate !== false) {
            const autoBase = noiseFloor.baseline();
            if (autoBase != null) {
                baselineNoiseRMS = autoBase;
                updateAutoCalReadout(`${autoBase.toFixed(3)} (frozen for this roast)`);
            }
        }

        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    // Reset State
    roastState = {
        startTime: Date.now(),
        dryEndTime: null,
        firstCrackTime: null,
        secondCrackTime: null,
        endTime: null,
        phase: 'Heating',
        manualMode: manual,
        firstCrackAuto: false,
        secondCrackAuto: false,
        stillFirstCrackMarks: [],
        logs: [],
        curve: [],
        temps: [],
        envTemps: [],
        powerLog: [],
        tempUnit: getTempUnit()
    };
    recomputeEffectiveDetection(); // fold in this roaster's learned tuning for the run
    recentRMSHistory = [];
    transientClusterCount = 0;
    lastTransientTime = 0;
    recentRatios = [];
    // Detection intelligence: per-bean 2C watch window (learned from this bean's own
    // roast history — no origin lookup table, heat application varies too much),
    // plus fresh still-1C / rate / door-burp state for the run.
    crackGapWindow = gapWindowFromHistory(getRoastHistory(), document.getElementById('beanSelect')?.value);
    stillFirstCrackUntil = 0;
    snapTimes = [];
    burpGuard = manual ? null : createBurpGuard();
    burpGuardUntil = 0;
    lastCurveSampleTime = 0;
    lastProbeLog = 0;
    alarmFired = { total: false, dtr: false };
    refAnnounced = { fc: false, sc: false };
    powerAnnounced = new Set();

    // Roast Lab: open a fresh capture for this roast if enabled.
    roastLabEnabled = getRoastLabEnabled();
    labSession = roastLabEnabled ? createSession(buildRoastLabMeta()) : null;
    lastLabFrameAt = 0;
    // Shadow detector rides on the capture: a fresh bank when Roast Lab is on, else nothing.
    shadowBank = roastLabEnabled ? createShadowBank() : null;
    updateRoastLabReadout();

    logArea.innerHTML = '';
    logMessage('Roast Started.');

    stopAutoCalibration(); // no background sampling while a roast runs
    isRecording = true;
    updatePhaseStrip();
    window.dispatchEvent(new Event('roastStarted')); // switch the Behmor panel to live mode
    // Keep the screen awake for the whole roast — crack detection runs in
    // requestAnimationFrame, which the browser pauses if the screen locks.
    acquireWakeLock();
    startBtn.disabled = true;
    if (startManualBtn) startManualBtn.disabled = true;
    calibrateBtn.disabled = true;
    stopBtn.disabled = false;
    if (markDryEndBtn) markDryEndBtn.disabled = false;
    markFirstCrackBtn.disabled = false;
    markSecondCrackBtn.disabled = false;
    showClearCrackBtn(undoFirstCrackBtn, false);  // nothing to clear yet — hidden until a crack is recorded
    showClearCrackBtn(undoSecondCrackBtn, false);
    showStillFirstCrackBtn(false); // appears once 1st crack is recorded
    if (logTempBtn) logTempBtn.disabled = false;
    if (logEnvTempBtn) logEnvTempBtn.disabled = false;
    if (liveRorDiv) liveRorDiv.textContent = 'RoR --';
    manualPowerBtns.forEach(b => b.disabled = false);
    if (manualPowerStatus) manualPowerStatus.textContent = '';

    // The manual-power row is stage-gated (visible during a live roast only) —
    // here we just keep it Behmor-specific, since KKTO has its own live controls.
    const powerRow = document.getElementById('manualPowerRow');
    if (powerRow) powerRow.style.display = (getActiveRoaster() || { model: 'behmor' }).model === 'behmor' ? 'flex' : 'none';

    if (manual) {
        updateStatus('Manual roast — no auto-detection. Use “Manual: Mark” for cracks and the power buttons.');
        // No mic/audio loop in manual mode: clear the scope and draw the marker curve;
        // the timer below keeps it refreshed.
        if (canvasCtx) { canvasCtx.fillStyle = '#121212'; canvasCtx.fillRect(0, 0, canvas.width, canvas.height); }
        renderLiveCurve(0);
    } else {
        updateStatus('Listening - Phase: Heating');
        drawAndAnalyze();
    }

    // Start live timer display
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - roastState.startTime) / 1000);
        const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const s = (elapsed % 60).toString().padStart(2, '0');
        if (liveTimerDiv) liveTimerDiv.textContent = `${m}:${s}`;

        const metrics = computeRoastMetrics(roastState);

        // Live development time / DTR once first crack is recorded; before that,
        // show an ETA to first crack when following a reference roast.
        if (liveDtrDiv) {
            if (roastState.firstCrackTime) {
                liveDtrDiv.textContent = `Dev ${formatMs(metrics.developmentTimeMs)} | DTR ${formatDtr(metrics.dtr)}`;
            } else if (referenceCurve && referenceMarkers.firstCrackMs != null) {
                const remain = referenceMarkers.firstCrackMs - (Date.now() - roastState.startTime);
                liveDtrDiv.textContent = remain > 0 ? `FC in ~${formatMs(remain)} (ref)` : 'FC due (ref)';
            } else {
                liveDtrDiv.textContent = 'DTR --';
            }
        }

        updatePhaseStrip();
        checkTargetAlarms(elapsed, metrics);
        checkReferenceCues(Date.now() - roastState.startTime);

        // Manual mode has no animation-frame loop, so refresh the curve here (picks up
        // manually-marked cracks, the reference overlay, and any temperature readings).
        if (roastState.manualMode) renderLiveCurve(Date.now() - roastState.startTime);
    }, 1000);
}

function stopRoast() {
    isRecording = false;
    window.dispatchEvent(new Event('roastStopped')); // Behmor panel back to setup mode
    releaseWakeLock();
    stopCrackAlarm();

    if (timerInterval) clearInterval(timerInterval);

    roastState.endTime = Date.now();
    logMessage('Roast Stopped.');

    startBtn.disabled = false;
    if (startManualBtn) startManualBtn.disabled = false;
    calibrateBtn.disabled = false;
    stopBtn.disabled = true;
    if (markDryEndBtn) markDryEndBtn.disabled = true;
    markFirstCrackBtn.disabled = true;
    markSecondCrackBtn.disabled = true;
    showClearCrackBtn(undoFirstCrackBtn, false);
    showClearCrackBtn(undoSecondCrackBtn, false);
    showStillFirstCrackBtn(false);
    if (logTempBtn) logTempBtn.disabled = true;
    if (logEnvTempBtn) logEnvTempBtn.disabled = true;
    manualPowerBtns.forEach(b => b.disabled = true);
    // Back to the stage default (hidden outside a live roast).
    const powerRow = document.getElementById('manualPowerRow');
    if (powerRow) powerRow.style.display = '';

    if (animationId) cancelAnimationFrame(animationId);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    drawScopeIdle();

    updateStatus('Finished');

    // Final static render of the completed curve (with the reference if following).
    renderLiveCurve(roastState.endTime - roastState.startTime);

    finalizeRoastLab(); // persist the Roast Lab capture so it can be exported (no-op when off)
    saveFinalRoast();

    // Back to the pre-roast stage: resume the rolling noise floor for next time.
    noiseFloor.reset();
    maybeStartAutoCalibration();
}

function saveFinalRoast() {
    // Gather UI data — the active roaster profile drives the machine model + name.
    const activeRoaster = getActiveRoaster();
    const roaster = (activeRoaster || { model: 'behmor' }).model;
    const roasterName = (activeRoaster || {}).name || '';
    const roasterId = (activeRoaster || {}).id || null;
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
        roasterName,
        roasterId,
        beanId,
        settings: roasterSettings,
        greenWeightG,
        timeline: roastState,
        tastingNotes: { flavors: [], text: '' } // To be filled later in History tab
    };

    const saved = saveRoastToHistory(finalRoastData);
    window.dispatchEvent(new Event('historyUpdated'));

    // Deduct the green weight used from the selected bean's pantry stock.
    let stockMsg = '';
    if (beanId && greenWeightG > 0) {
        const remaining = adjustBeanQuantity(beanId, -greenWeightG);
        window.dispatchEvent(new Event('pantryUpdated'));
        if (remaining != null) stockMsg = `${greenWeightG} g deducted from the pantry (remaining: ${remaining} g).`;
    }

    // The post-roast summary card (js/stage.js) shows the save + next steps —
    // no blocking alert.
    window.dispatchEvent(new CustomEvent('roastSaved', { detail: { roast: saved, stockMsg } }));
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

// Share of this frame's spectral energy sitting in the narrow bands of the app's
// own alarm tones (see crack-intel.js). High share = another device's crack alarm,
// not a crack — cracks are broadband. Computed only on spike frames (cheap).
function spectralAlarmShare() {
    if (!freqArray || !analyser || !audioContext) return 0;
    if (!alarmGuardFreqs) alarmGuardFreqs = alarmToneTargets(ALARM_TONES);
    analyser.getByteFrequencyData(freqArray);
    return alarmNarrowbandShare(freqArray, audioContext.sampleRate / analyser.fftSize, alarmGuardFreqs);
}

function detectTransient(rms) {
    const now = Date.now();

    recentRMSHistory.push(rms);
    if (recentRMSHistory.length > HISTORY_LENGTH) recentRMSHistory.shift();

    // A transient is a sudden spike well above the baseline and recent history.
    const recentAvg = recentRMSHistory.reduce((a, b) => a + b, 0) / recentRMSHistory.length;
    let spikeThreshold = Math.max(baselineNoiseRMS * effectiveDetection.thresholdMultiplier, recentAvg * 2, 0.05);
    // Just after a detected door/airflow step-change, demand extra confidence —
    // the room got louder, so borderline spikes are probably not cracks.
    if (now < burpGuardUntil) spikeThreshold *= BURP_GUARD_FACTOR;

    if (rms <= spikeThreshold || (now - lastTransientTime <= TRANSIENT_COOLDOWN_MS)) {
        // Door-"burp" awareness: feed sub-threshold frames to the mid-roast floor
        // tracker. A SUSTAINED step-up (door open → shielding gone, fan/airflow
        // change) re-baselines the noise floor instead of reading as new cracks.
        if (burpGuard && rms <= spikeThreshold) {
            const res = burpGuard.step(now, rms);
            if (res.stepped) {
                baselineNoiseRMS = Math.max(baselineNoiseRMS, res.baseline);
                burpGuardUntil = now + BURP_GUARD_MS;
                logMessage(`🚪 Room got suddenly louder (door / airflow?) — noise floor re-baselined to ${baselineNoiseRMS.toFixed(3)}; being extra careful for a moment.`);
            }
        }
        return;
    }

    // Two-device beep guard: another device running this app can alarm into our
    // mic. Its tones are narrowband at known frequencies; cracks are broadband.
    // (Same-device alarms are already suppressed via the isNotifying deaf-window.)
    if (isAlarmLike(spectralAlarmShare())) {
        lastTransientTime = now; // reuse the snap cooldown so a ringing alarm isn't re-tested every frame
        return;
    }

    lastTransientTime = now;
    transientClusterCount++;
    snapTimes.push(now);
    if (snapTimes.length > SNAP_TIMES_MAX) snapTimes.shift();

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
        // The first sustained burst of cracking is first crack — optionally gated
        // behind a ROEST-style time prior ("ignore cracks before N minutes").
        const min1cMs = (effectiveDetection.min1cMinutes || 0) * 60000;
        if (transientClusterCount >= effectiveDetection.cracksRequired) {
            if (now - roastState.startTime < min1cMs) {
                if (!roastState.early1cSuppressed) {
                    roastState.early1cSuppressed = true;
                    logMessage(`⏱️ Crack-like sounds before ${effectiveDetection.min1cMinutes} min are ignored (your “earliest 1st crack” setting).`);
                }
                return;
            }
            markPhase('First Crack (Auto)', 'firstCrackTime');
            startCrackAlarm(); // repeats until acknowledged so it isn't missed
            const pitch = ratio >= effectiveDetection.secondCrackPitch ? 'higher-pitched' : 'lower-pitched';
            logMessage(`Auto-detected ${pitch} cracking (high-band ${(ratio * 100).toFixed(0)}%).`);
        }
    } else if (!roastState.secondCrackTime) {
        // 1C is a tapering period, not an event: the 2C call is a windowed decision
        // (per-bean watch window + crack RATE + band energy + still-1C hold + door
        // guard), not a fixed timer — see shouldCall2C in js/crack-intel.js.
        const verdict = shouldCall2C({
            now,
            firstCrackAt: roastState.firstCrackTime,
            stillFirstCrackUntil,
            burpGuardUntil,
            window: crackGapWindow,
            ratios: recentRatios,
            snapTimes,
            basePitch: effectiveDetection.secondCrackPitch,
            cracksRequired: effectiveDetection.cracksRequired,
        });
        if (verdict.call) {
            markPhase('Second Crack (Auto)', 'secondCrackTime');
            startCrackAlarm(); // repeats until acknowledged
            const early = verdict.reason === 'early-strong-evidence' ? ' (early, but the evidence was strong)' : '';
            logMessage(`Faster, higher-pitched cracking detected (high-band ${(ratio * 100).toFixed(0)}%)${early}.`);
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
    renderLiveCurve(now - roastState.startTime);
}

// Draw the live curve, overlaying the reference roast behind it when following.
function renderLiveCurve(elapsedMs) {
    const liveSeries = {
        curve: roastState.curve,
        color: null,   // null → the theme accent (lit amber) in drawRoastCurves
        label: 'This roast',
        firstCrackMs: roastState.firstCrackTime ? roastState.firstCrackTime - roastState.startTime : null,
        secondCrackMs: roastState.secondCrackTime ? roastState.secondCrackTime - roastState.startTime : null
    };

    const markers = {
        dryEndMs: roastState.dryEndTime ? roastState.dryEndTime - roastState.startTime : null,
        firstCrackMs: liveSeries.firstCrackMs,
        secondCrackMs: liveSeries.secondCrackMs,
        totalMs: elapsedMs,
    };

    if (referenceCurve) {
        drawRoastCurves(curveCanvas, [
            { curve: referenceCurve, color: REF_COLOR, label: 'Reference', dashed: true,
              firstCrackMs: referenceMarkers.firstCrackMs, secondCrackMs: referenceMarkers.secondCrackMs },
            liveSeries
        ]);
    } else if (roastState.temps && roastState.temps.length >= 2) {
        // Overlay a live Rate-of-Rise (°/min) trace derived from temperature readings.
        const ror = computeRoRPoints(roastState.temps).map(p => ({ t: p.t, v: p.ror }));
        drawRoastCurveDual(curveCanvas, roastState.curve, ror, markers, 'RoR °/min');
    } else {
        drawRoastCurve(curveCanvas, roastState.curve, markers);
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
        maybeComputeMfcc(); // experimental, off by default; observes only, never changes detection
        maybeCaptureRoastLab(rms); // Roast Lab capture, off by default; observes only
        maybeStepShadow(rms); // shadow detector bank, rides on Roast Lab; LOG-ONLY, never acts
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
