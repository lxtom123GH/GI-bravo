# Coffee Roasting Hardware Guide

This guide details how to build a DIY wireless temperature sensor for your coffee roaster that connects directly to the Coffee Roasting web application via Web Bluetooth.

## Why DIY?
Because this is a web app running in a browser, it cannot easily interface with proprietary off-the-shelf consumer thermometers (like BBQ thermometers) which require native iOS/Android apps to decrypt their Bluetooth signals. Furthermore, consumer probes often melt at roasting temperatures (250°C+). A DIY setup ensures you have an open Bluetooth connection and high-temperature industrial probes.

## Parts List

These parts can be sourced cheaply from AliExpress, or for a bit more money with better quality control from Adafruit, SparkFun, or Amazon.

1.  **Microcontroller:** ESP32 Development Board (e.g., "ESP32 WROOM 32 DevKit")
2.  **Thermocouple Amplifier:** MAX31855 or MAX31856 Breakout Board
3.  **Probe (Behmor):** Rigid K-Type Thermocouple (1/8" / 3mm diameter, ~4-6" long)
4.  **Probe (KKTO):** Threaded or High-Temp Fiberglass Braided Wire K-Type Thermocouple
5.  **Enclosure:** 3D Printed case or a plastic "Project Box"

---

## Roaster Modification Streams

### Stream 1: Behmor
*The Challenge: The rotating drum.*

1.  You must drill a 1/8" hole through the left side panel of the Behmor chassis.
2.  You must drill perfectly through the center axis of the left drum mount. **High accuracy is required here**; if it is off-center, the drum will wobble and snap the rigid probe. Use a drill press or purchase a pre-drilled kit if possible.
3.  Slide the rigid probe through the chassis and into the drum axis. The drum will rotate *around* the stationary probe, and the beans will constantly tumble over the tip.

### Stream 2: KKTO (Turbo Oven)
*The Challenge: The sweeping agitator arms.*

1.  Drill a small hole in the side of the lower roasting pot, about 1-2 inches from the bottom (where the bean mass sits). **Accuracy is forgiving.**
2.  Insert the probe so it is constantly submerged in the beans.
3.  **Crucial:** Ensure the hole placement and probe depth allow the mechanical agitator arms to sweep past without colliding with the probe.
4.  Mount the electronics box to the outside of the pot using a strong magnet, keeping it away from the direct heat of the Turbo Oven element.

---

## ESP32 Arduino Code

Below is the code you will flash to your ESP32. It reads the MAX31855 sensor and broadcasts the temperature over a Custom BLE Service.

*Dependencies:* You will need to install the `Adafruit MAX31855 library` and the `ESP32 BLE Arduino` library in your Arduino IDE.

```cpp
#include <SPI.h>
#include <Adafruit_MAX31855.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// --- Hardware Pins (Adjust for your specific ESP32 wiring) ---
#define MAXDO   19
#define MAXCS   23
#define MAXCLK  18

// Initialize the Thermocouple
Adafruit_MAX31855 thermocouple(MAXCLK, MAXCS, MAXDO);

// --- BLE UUIDs ---
// These must match the UUIDs in js/bluetooth.js
#define SERVICE_UUID        "19b10000-e8f2-537e-4f6c-d104768a1214"
#define CHARACTERISTIC_UUID "19b10001-e8f2-537e-4f6c-d104768a1214"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;

// Callback to handle connection state
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
    };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
    }
};

void setup() {
  Serial.begin(115200);

  // Initialize Sensor
  if (!thermocouple.begin()) {
    Serial.println("ERROR: MAX31855 not found.");
    while (1) delay(10);
  }

  // Initialize BLE
  BLEDevice::init("Roaster_Temp_Node");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );

  // Required to push notifications to the browser
  pCharacteristic->addDescriptor(new BLE2902());

  pService->start();

  // Start broadcasting
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);
  BLEDevice::startAdvertising();
  Serial.println("Waiting for a client connection to notify...");
}

void loop() {
  if (deviceConnected) {
    // Read Celsius from the MAX31855
    double c = thermocouple.readCelsius();

    if (isnan(c)) {
      Serial.println("Something wrong with thermocouple!");
    } else {
      // Cast the double to a float
      float tempValue = (float)c;

      // Send the raw bytes of the float over BLE
      pCharacteristic->setValue((uint8_t*)&tempValue, sizeof(tempValue));
      pCharacteristic->notify();

      Serial.print("C = ");
      Serial.println(c);
    }

    // Web app updates ~1x per second
    delay(1000);
  } else {
    // Save power if not connected, but keep checking
    delay(2000);
  }
}
```
