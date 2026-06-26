// Web Serial connection to a USB temperature probe (e.g. an ESP32/Arduino that
// prints one Celsius reading per line). Emits the same `roasterTemperature`
// event as the Bluetooth path, so the rest of the app treats both identically.

let port = null;
let reader = null;
let keepReading = false;

export async function connectSerial() {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    keepReading = true;
    readLoop();
    return true;
}

async function readLoop() {
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable).catch(() => {});
    reader = decoder.readable.getReader();
    let buffer = '';
    try {
        while (keepReading) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            let idx;
            while ((idx = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, idx).trim();
                buffer = buffer.slice(idx + 1);
                const t = parseFloat(line);
                if (!isNaN(t)) document.dispatchEvent(new CustomEvent('roasterTemperature', { detail: t }));
            }
        }
    } catch (e) {
        // read cancelled or device removed
    } finally {
        try { reader.releaseLock(); } catch (e) { /* ignore */ }
    }
}

export async function disconnectSerial() {
    keepReading = false;
    try { if (reader) await reader.cancel(); } catch (e) { /* ignore */ }
    try { if (port) await port.close(); } catch (e) { /* ignore */ }
    port = null;
    reader = null;
    document.dispatchEvent(new Event('roasterDisconnected'));
}
