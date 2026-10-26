# Hardware

[Leer en español](../es/hardware.md)

This page lists the parts, shows how to wire them, and explains how to build and flash the firmware. You do not need any of this to try Tintero: see [Getting started](getting-started.md) for the emulator.

## Parts

| Part                                 | Notes                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESP32 DevKit                         | A standard ESP32 DevKit board (`esp32dev` in PlatformIO). It is programmed over USB.                                                                   |
| DESPI-C02 adapter                    | Connects the panel's flat cable to the ESP32. Set its **RESE** switch to **0.47**, as in the circuit below.                                            |
| GDEY075T7 e-paper panel              | 7.5", 800 × 480, black and white. It plugs into the DESPI-C02.                                                                                         |
| Two push buttons                     | **Move** and **Accept**. Normal momentary buttons with no external resistor.                                                                           |
| Breadboard, jumper wires, USB cable  | For the ESP32. A 2.4 GHz Wi-Fi network is also needed (the ESP32 cannot join 5 GHz networks).                                                          |

## Wiring

DESPI-C02 to ESP32 DevKit:

| DESPI-C02 pin | ESP32 pin       |
| ------------- | --------------- |
| BUSY          | GPIO4           |
| RES           | GPIO16 (RX2)    |
| D/C           | GPIO17 (TX2)    |
| CS            | GPIO5           |
| SCK           | GPIO18          |
| SDI           | GPIO23          |
| 3.3V          | 3V3             |
| GND           | GND             |

Buttons:

| Button | Connection                |
| ------ | ------------------------- |
| Move   | between GPIO32 and 3V3    |
| Accept | between GPIO33 and 3V3    |

The buttons use the ESP32's **internal pull-down**: the firmware turns it on, so you do not add a resistor. A pressed button reads **HIGH**; a released one reads LOW. GPIO32 and GPIO33 are RTC pins, so they can wake the ESP32 from deep sleep.

In the firmware, the panel wiring is in `firmware/src/panel.cpp` and the buttons in `firmware/src/buttons.cpp`.

## The circuit

The circuit of the two buttons and the panel is drawn on a breadboard:

![ESP32 DevKit, DESPI-C02 adapter and two push buttons on a breadboard](../../hardware/tintero-buttons/out/tintero-buttons.front.svg)

- Interactive page: [`tintero-buttons.html`](../../hardware/tintero-buttons/out/tintero-buttons.html) (open it in a browser; it needs no server).
- The circuit source: [`circuit.json`](../../hardware/tintero-buttons/circuit.json). It was made with `protoboard-iso`.

## Build and flash the firmware

The firmware is C++ for [PlatformIO](https://platformio.org/); the `pio` command line is enough. It lives in `firmware/`. Its own notes (with the protocol details) are in [`firmware/README.md`](../../../firmware/README.md).

1. **Wi-Fi.** Copy the template and write your 2.4 GHz network. Git ignores this file:

   ```bash
   cp firmware/include/secrets.h.example firmware/include/secrets.h
   ```

2. **Certificates for this display.** First create your private authority and the display's certificate ([Certificates](certificates.md)). Then write the header with the server name and **only this display's** key:

   ```bash
   npm run pki -- firmware /path/to/pki --host tintero.example.ts.net p1
   ```

   The result is `firmware/include/tintero_certs.h`, with mode 600. Git ignores it, and the tool refuses to write a key where git could see it.

3. **Build and flash** with the ESP32 connected over USB:

   ```bash
   cd firmware
   pio run -t upload
   pio device monitor    # optional: serial monitor at 115200
   ```

4. **Authorize the display** in the server's list of devices ([Certificates](certificates.md) and [Exposure](exposure.md)). Until you do, the server answers every request with an empty 404.

For a second display, generate its own `tintero_certs.h` with its own id (`p2`) and flash again.

## Safe to know

- The firmware trusts **only** your private authority. It never turns certificate checking off and never trusts public authorities.
- While the flash is not encrypted, whoever steals a display can read that display's key. Every display carries only its own key, so a stolen one does not expose the others. To revoke a display, remove its line from the server's list of devices (the server reads the list again by itself; restarting the server also works).
- **License of a compiled firmware:** the firmware source is MIT, but a compiled binary links GxEPD2 (GPL-3.0), so the **binary** is GPL-3.0. This repository does not publish binaries. If you distribute one, follow the GPL-3.0 (see [NOTICE](../../../NOTICE)).
