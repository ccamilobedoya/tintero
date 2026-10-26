// The GDEY075T7 panel with GxEPD2.
//
// Wiring (DESPI-C02 adapter): CS → D5, D/C → TX2 (GPIO17), RES → RX2 (GPIO16),
// BUSY → D4, SCK → D18, SDI → D23, 3.3V → 3V3, GND → GND. RESE at 0.47.

#include "panel.h"

#include <GxEPD2_BW.h>

namespace panel {
namespace {

constexpr int PIN_CS = 5;
constexpr int PIN_DC = 17;
constexpr int PIN_RST = 16;
constexpr int PIN_BUSY = 4;

// The GxEPD2 driver for this panel, with a slow full refresh available. GxEPD2
// picks the fast or the slow one at compile time (useFastFullUpdate); here the
// same as its slow version is done, but only when asked for.
class Driver : public GxEPD2_750_GDEY075T7 {
 public:
  using GxEPD2_750_GDEY075T7::GxEPD2_750_GDEY075T7;

  // After writeImageForFullRefresh(), instead of refresh(false).
  void refreshSlow() {
    _writeCommand(0x00);  // PANEL SETTING: full waveform from the OTP
    _writeData(0x1f);
    if (!_power_is_on) {
      _writeCommand(0x04);  // turn on the charge pump
      _waitWhileBusy("_PowerOn", power_on_time);
      _power_is_on = true;
    }
    _writeCommand(0xE0);  // no fixed temperature (the fast one pretends 90 °C)...
    _writeData(0x00);
    _writeCommand(0x41);  // ...but the one from the panel's internal sensor
    _writeData(0x00);
    _writeCommand(0x12);  // refresh
    _waitWhileBusy("_Update_Slow", 5000);
    _using_partial_mode = false;
    _initial_refresh = false;
  }
};

// A drawing buffer of 8 rows (800 bytes): images do not go through it, they go
// straight from the download array to the panel RAM.
GxEPD2_BW<Driver, 8> display(Driver(PIN_CS, PIN_DC, PIN_RST, PIN_BUSY));

uint16_t partials = 0;

}  // namespace

void begin() {
  display.init(115200);  // with 115200, GxEPD2 prints the BUSY times
}

void showFull(const uint8_t *raw1, bool slow) {
  const uint32_t t0 = millis();
  // raw1 uses 1 = black; this controller, 1 = white: invert = true.
  display.epd2.writeImageForFullRefresh(raw1, 0, 0, WIDTH, HEIGHT, true);
  if (slow) {
    display.epd2.refreshSlow();
  } else {
    display.epd2.refresh(false);
  }
  display.epd2.powerOff();
  partials = 0;
  Serial.printf("Panel: %s full refresh in %lu ms\n", slow ? "slow" : "fast",
                (unsigned long)(millis() - t0));
}

void refreshZone(const uint8_t *raw1, const Zone &zone) {
  const uint32_t t0 = millis();
  // The zone inside the whole image: GxEPD2 takes only that rectangle.
  display.epd2.writeImagePart(raw1, zone.x, zone.y, WIDTH, HEIGHT, zone.x, zone.y, zone.w,
                              zone.h, true);
  display.epd2.refresh(zone.x, zone.y, zone.w, zone.h);
  display.epd2.powerOff();
  partials++;
  Serial.printf("Panel: partial #%u (%s) in %lu ms\n", partials, zone.id,
                (unsigned long)(millis() - t0));
}

uint16_t partialsSinceFull() { return partials; }

}  // namespace panel
