// Web Bluetooth logic to connect to the ESP32 temperature sensor

// Standard BLE UUIDs for a custom temperature service
// Note: These must match the UUIDs defined in the ESP32 Arduino code.
const ROASTER_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const TEMPERATURE_CHARACTERISTIC_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214';

let bluetoothDevice;
let temperatureCharacteristic;

/**
 * Request the user to select the Roaster BLE device.
 */
export async function connectRoaster() {
    try {
        console.log('Requesting Bluetooth Device...');
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [{ services: [ROASTER_SERVICE_UUID] }]
        });

        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

        console.log('Connecting to GATT Server...');
        const server = await bluetoothDevice.gatt.connect();

        console.log('Getting Service...');
        const service = await server.getPrimaryService(ROASTER_SERVICE_UUID);

        console.log('Getting Characteristic...');
        temperatureCharacteristic = await service.getCharacteristic(TEMPERATURE_CHARACTERISTIC_UUID);

        console.log('Starting Notifications...');
        await temperatureCharacteristic.startNotifications();

        temperatureCharacteristic.addEventListener('characteristicvaluechanged', handleTemperatureChange);

        console.log('Connected and receiving temperature data.');
        return true;
    } catch (error) {
        console.error('Connection failed!', error);
        return false;
    }
}

/**
 * Disconnect from the BLE device.
 */
export function disconnectRoaster() {
    if (!bluetoothDevice) {
        return;
    }
    console.log('Disconnecting from Bluetooth Device...');
    if (bluetoothDevice.gatt.connected) {
        bluetoothDevice.gatt.disconnect();
    } else {
        console.log('> Bluetooth Device is already disconnected');
    }
}

function onDisconnected() {
    console.log('> Bluetooth Device disconnected');
    document.dispatchEvent(new Event('roasterDisconnected'));
}

function handleTemperatureChange(event) {
    const value = event.target.value;

    // Assuming the ESP32 sends a 32-bit float (Float32Array)
    // You may need to adjust this depending on how the ESP32 serializes the data
    const temperature = value.getFloat32(0, true); // true for little-endian

    console.log(`Live Temperature: ${temperature.toFixed(2)} °C`);

    // Dispatch a custom event so the UI/Chart can update
    const tempEvent = new CustomEvent('roasterTemperature', { detail: temperature });
    document.dispatchEvent(tempEvent);
}
