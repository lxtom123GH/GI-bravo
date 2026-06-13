const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const canvas = document.getElementById('oscilloscope');
const canvasCtx = canvas.getContext('2d');
const logArea = document.getElementById('logArea');
const statusDiv = document.getElementById('status');

let audioContext;
let microphone;
let analyser;
let dataArray;
let isRecording = false;
let animationId;
let isNotifying = false;

// State for crack detection
let crackCount = 0;
let lastCrackTime = 0;
// We consider a burst of loud noise as a crack.
// These thresholds might need tuning.
const VOLUME_THRESHOLD = 0.15; // 0.0 to 1.0 range based on RMS
const CRACK_COOLDOWN_MS = 200; // minimum time between cracks
let roastPhase = 'Heating'; // Heating, First Crack, Between Cracks, Second Crack

function logMessage(message) {
    const time = new Date().toLocaleTimeString();
    const p = document.createElement('p');
    p.textContent = `[${time}] ${message}`;
    logArea.appendChild(p);
    logArea.scrollTop = logArea.scrollHeight;
}

function updateStatus(status) {
    statusDiv.textContent = `Status: ${status}`;
}

function notifyUser(message) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(message);
    }

    if (audioContext) {
        isNotifying = true;

        const oscillator = audioContext.createOscillator();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime); // 1000 Hz

        oscillator.connect(audioContext.destination);

        oscillator.start();

        // Play the sound for 1 second
        setTimeout(() => {
            oscillator.stop();
            oscillator.disconnect();

            // Allow 0.2s extra for audio to fully stop before resuming detection
            setTimeout(() => {
                isNotifying = false;
            }, 200);

        }, 1000);
    }
}

async function startListening() {
    try {
        if ("Notification" in window) {
            Notification.requestPermission();
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);

        // Connect the microphone to the analyser
        microphone.connect(analyser);

        // Setup analyser
        analyser.fftSize = 2048;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        isRecording = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;

        logMessage('Microphone access granted. Listening for cracks...');
        updateStatus('Listening - Phase: Heating');

        drawAndAnalyze();
    } catch (err) {
        console.error('Error accessing microphone:', err);
        logMessage('Error accessing microphone. Make sure you are using HTTPS and have granted permission.');
    }
}

function stopListening() {
    isRecording = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;

    if (audioContext) {
        audioContext.close();
    }

    if (animationId) {
        cancelAnimationFrame(animationId);
    }

    // Clear canvas
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    logMessage('Stopped listening.');
    updateStatus('Inactive');
}

function calculateRMS(dataArray) {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        // Map 0-255 to -1 to 1
        const value = (dataArray[i] - 128) / 128;
        sum += value * value;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return rms;
}

function detectCrack(rms) {
    const now = Date.now();

    if (rms > VOLUME_THRESHOLD && (now - lastCrackTime > CRACK_COOLDOWN_MS)) {
        crackCount++;
        lastCrackTime = now;

        let crackType = 'Unknown Crack';
        if (crackCount === 1) {
            roastPhase = 'First Crack Started';
            crackType = 'First Crack Started!';
            logMessage(`>>> FIRST CRACK DETECTED! (RMS: ${rms.toFixed(3)})`);
            updateStatus(`Listening - Phase: ${roastPhase}`);
            notifyUser('First Crack Started!');
        } else if (crackCount > 1 && crackCount <= 5) {
            crackType = 'First Crack continues';
            logMessage(`- Crack detected (RMS: ${rms.toFixed(3)})`);
        } else if (crackCount > 5 && crackCount < 15 && roastPhase !== 'First Crack Rolling') {
             roastPhase = 'First Crack Rolling';
             logMessage(`>>> First Crack is rolling.`);
             updateStatus(`Listening - Phase: ${roastPhase}`);
        } else if (crackCount > 20 && roastPhase !== 'Second Crack Started') {
             // Very simplified logic: if we hear a LOT of cracks, assume we hit second crack eventually
             // In reality, there is a gap between 1st and 2nd crack.
             roastPhase = 'Second Crack Started';
             logMessage(`>>> SECOND CRACK DETECTED! (RMS: ${rms.toFixed(3)})`);
             updateStatus(`Listening - Phase: ${roastPhase}`);
             notifyUser('Second Crack Started!');
        } else {
             logMessage(`- Crack detected (RMS: ${rms.toFixed(3)})`);
        }
    }
}

function drawAndAnalyze() {
    if (!isRecording) return;

    animationId = requestAnimationFrame(drawAndAnalyze);

    analyser.getByteTimeDomainData(dataArray);

    // Draw oscilloscope
    canvasCtx.fillStyle = 'rgb(249, 249, 249)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = 'rgb(0, 0, 0)';

    canvasCtx.beginPath();

    const sliceWidth = canvas.width * 1.0 / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0; // 0 to 2
        const y = v * canvas.height / 2; // scale to canvas

        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();

    // Analyze audio for cracks
    const rms = calculateRMS(dataArray);
    if (!isNotifying) {
        detectCrack(rms);
    }
}

// Initial canvas setup
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
canvasCtx.fillStyle = 'rgb(249, 249, 249)';
canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

// Event listeners
startBtn.addEventListener('click', startListening);
stopBtn.addEventListener('click', stopListening);
