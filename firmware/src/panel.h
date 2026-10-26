// The GDEY075T7 panel with GxEPD2.
#pragma once

#include <Arduino.h>

#include "zones.h"

namespace panel {

constexpr int WIDTH = 800;
constexpr int HEIGHT = 480;
constexpr size_t RAW1_BYTES = (WIDTH + 7) / 8 * HEIGHT;  // 48 000

void begin();

// Pushes a whole raw1 image and does a full refresh: fast (≈ 1.5 s, one flash) or
// slow (≈ 3.5 s, the normal waveform, which clears ghosting better). It leaves the
// panel with the charge pump off but with its RAM kept.
void showFull(const uint8_t *raw1, bool slow = false);

// Inverts in the image (in the ESP32 RAM only) the focus ring of a zone. Inverting
// twice leaves it as it was: that is how it is put and removed.
// solid = true: continuous ring (sending); false: dotted with style.dash.
void toggleRing(uint8_t *raw1, const Zone &zone, const FocusStyle &style, bool solid);

// Partial refresh of a zone: sends only that rectangle of the image.
void refreshZone(const uint8_t *raw1, const Zone &zone);

// How many partial refreshes have happened since the last full one.
uint16_t partialsSinceFull();

}  // namespace panel
