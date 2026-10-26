// Network: Wi-Fi and the time from SNTP.
//
// The ESP32 has no battery-backed clock: every boot starts at 0 (1 January 1970).
// TLS compares the time with the validity dates of the server certificate, so
// without the time the TLS handshake fails. That is why, before talking to
// Tintero, the time is requested from an SNTP server.

#include "net.h"

#include <WiFi.h>
#include <time.h>

#include "secrets.h"

namespace net {
namespace {

constexpr uint32_t WIFI_TIMEOUT_MS = 20000;
constexpr uint32_t SNTP_TIMEOUT_MS = 15000;

// Any time before this (2025-01-01 00:00 UTC) means the clock was never set.
constexpr time_t VALID_AFTER = 1735689600;

// POSIX time zone for the local time printed to the serial monitor (UTC here).
// The sign is reversed in POSIX: "<-05>5" would be a zone named -05 that adds
// 5 h to reach UTC. TLS and the server always use UTC, so this is cosmetic.
constexpr char TIMEZONE[] = "UTC0";

bool sntpStarted = false;

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  Serial.printf("Wi-Fi: connecting to \"%s\"...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);  // client only: the ESP32 does not create its own network
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  const uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - t0 > WIFI_TIMEOUT_MS) {
      Serial.printf("Wi-Fi: not connected after %lu ms (status %d)\n",
                    (unsigned long)(millis() - t0), (int)WiFi.status());
      WiFi.disconnect();
      return false;
    }
    delay(100);
  }
  Serial.printf("Wi-Fi: connected in %lu ms · IP %s · RSSI %d dBm\n",
                (unsigned long)(millis() - t0), WiFi.localIP().toString().c_str(),
                (int)WiFi.RSSI());
  return true;
}

bool syncTime() {
  if (timeIsValid()) return true;

  if (!sntpStarted) {
    // Starts the SNTP client of the network stack. From here it works alone, in
    // the background: it asks for the time and asks again every hour.
    configTzTime(TIMEZONE, "pool.ntp.org", "time.google.com");
    sntpStarted = true;
  }

  const uint32_t t0 = millis();
  while (!timeIsValid()) {
    if (millis() - t0 > SNTP_TIMEOUT_MS) {
      Serial.println("Time: the SNTP server did not answer");
      return false;
    }
    delay(100);
  }
  Serial.printf("Time: synchronized in %lu ms\n", (unsigned long)(millis() - t0));
  return true;
}

}  // namespace

bool timeIsValid() { return time(nullptr) > VALID_AFTER; }

bool ensureOnline() { return connectWifi() && syncTime(); }

void printStatus() {
  const time_t now = time(nullptr);
  struct tm local;
  localtime_r(&now, &local);
  char text[24];
  strftime(text, sizeof text, "%Y-%m-%d %H:%M:%S", &local);
  Serial.printf("Local time %s · Unix %ld · up %lu s · RSSI %d dBm\n", text, (long)now,
                (unsigned long)(millis() / 1000), (int)WiFi.RSSI());
}

}  // namespace net
