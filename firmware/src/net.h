// Network: Wi-Fi and the time from SNTP.
#pragma once

#include <Arduino.h>

namespace net {

// Leaves the ESP32 connected to Wi-Fi with the clock set. If it already is, it
// returns at once; if not, it tries with time limits (20 s for Wi-Fi, 15 s for
// the time). Returns false if something failed: the caller decides when to retry.
bool ensureOnline();

// true when the clock holds a believable date (not 1970).
bool timeIsValid();

// Prints the local time, the Unix time and the Wi-Fi signal to the serial monitor.
void printStatus();

}  // namespace net
