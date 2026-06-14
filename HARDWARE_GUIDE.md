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

The Behmor drum is driven on the right side by a square motor peg, but the left side sits on a stationary bracket. The left end-cap of the drum has a hollow cylindrical pin/bushing that slides over this bracket.

To insert the probe, you must drill perfectly through the face of that left-side drum bushing, and then through the chassis wall of the Behmor to match it.

**Drilling the Drum (High Accuracy Required):**
1.  **Remove the Drum:** Do not attempt to drill it while inside the roaster.
2.  **Center Punch:** Because the face of the cylinder is small, a drill bit will wander. You **must** use a center punch and hammer to tap a starting divot perfectly in the center.
3.  **Drill Press Setup:** Hold the drum perfectly vertical. Use a V-block or a vice clamped to your drill press table. Ensure the drum is plumb.
4.  **Pilot Hole:** Chuck a 1/16" pilot drill bit and drill straight through the center punch mark.
5.  **Final Hole:** Step up to a 5/32" drill bit. This is slightly larger than your 1/8" thermocouple, which gives the drum enough clearance to rotate without binding on the stationary probe.

**Drilling the Chassis:**
1.  Measure the location of the stationary mounting bracket from the top and back inner walls.
2.  Transfer those measurements to the outside left panel of the Behmor chassis.
3.  Drill a 5/32" hole straight through the outer and inner walls.

**Assembly:**
Slide the rigid 1/8" thermocouple through the chassis wall hole, through the stationary bracket, and into the drum's left pin. Because the hole in the drum (5/32") is slightly larger than the probe (1/8"), the drum rotates freely around the stationary probe.

**What if I make a mistake?**
If you drill off-center, the drum will wobble and snap the rigid probe. If you destroy the left-side bushing, you cannot buy *just* the bushing because it is permanently welded/crimped into the drum's end-cap.
*   **The Fix:** You must buy a brand new roasting drum from Behmor or a distributor (like Sweet Maria's or iDrinkCoffee). They typically cost between $35.00 and $45.00 USD. Do not attempt to use metal epoxy or silver solder to fix it; the thermal cycling of the roaster will break it.

**Can someone else do this for me?**
Yes. If you don't have a drill press or don't want to risk breaking your drum, you have a few options:
*   **The "Cash & Six-Pack" Local Option (Highly Recommended):** This is a 5-minute job for anyone with a drill press and a V-block. You don't need a specialized service. Walk into a local **independent auto mechanic**, a **small machine/fabrication shop**, a **gunsmith**, or a **local makerspace**. Don't call ahead; walk in with the drum, the probe, and a sharpie mark. Offer $20 cash or a six-pack of beer for 5 minutes on their drill press.
*   **The Expensive Mail-In Option:** Professional installation services exist (e.g., *Chocolate Alchemy* offers a Behmor Thermocouple Modification Service where you ship your roaster to them). However, this is expensive (historically costing around $375 for the service, or buying a pre-modded roaster).

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
