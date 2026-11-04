// Self-healing on the device (see health.h).

#include "health.h"

#include <WiFi.h>
#include <esp_system.h>
#include <time.h>

#include "recovery.h"
#include "tintero.h"

namespace health {
namespace {

constexpr uint32_t MAGIC = 0x54494e54;  // "TINT": tells valid memory from the garbage of a power-on
constexpr uint32_t MIN_RESTART_GAP_S = 3600;
constexpr time_t VALID_AFTER = 1735689600;  // 2025-01-01: earlier means the clock was never set
constexpr size_t MAX_ENTRIES = 3;

struct Saved {
  uint32_t magic;
  uint32_t lastRestartAt;  // Unix time of the last controlled restart; 0 = unknown
  bool hasFailure;
  char step[8];
  char outcome[12];
  uint32_t got, expected, ms, heap;
  int rssi;
  bool hasBoot;
  char bootReason[12];
};

RTC_NOINIT_ATTR Saved saved;

const char *resetName(esp_reset_reason_t r) {
  switch (r) {
    case ESP_RST_POWERON: return "poweron";
    case ESP_RST_EXT: return "ext";
    case ESP_RST_SW: return "sw";
    case ESP_RST_PANIC: return "panic";
    case ESP_RST_INT_WDT: return "int_wdt";
    case ESP_RST_TASK_WDT: return "task_wdt";
    case ESP_RST_WDT: return "wdt";
    case ESP_RST_DEEPSLEEP: return "deepsleep";
    case ESP_RST_BROWNOUT: return "brownout";
    case ESP_RST_SDIO: return "sdio";
    default: return "unknown";
  }
}

void copyText(char *dst, size_t cap, const char *src) {
  strlcpy(dst, src != nullptr ? src : "", cap);
}

}  // namespace

void begin() {
  if (saved.magic != MAGIC) {
    memset(&saved, 0, sizeof saved);
    saved.magic = MAGIC;
  }
  saved.hasBoot = true;
  copyText(saved.bootReason, sizeof saved.bootReason, resetName(esp_reset_reason()));
  Serial.printf("Boot reason: %s\n", saved.bootReason);
}

void noteFailure(const char *step, http::Outcome outcome, uint32_t got, uint32_t expected,
                 uint32_t ms) {
  if (strcmp(step, "log") == 0 || saved.magic != MAGIC) return;
  saved.hasFailure = true;
  copyText(saved.step, sizeof saved.step, step);
  copyText(saved.outcome, sizeof saved.outcome, http::outcomeName(outcome));
  saved.got = got;
  saved.expected = expected;
  saved.ms = ms;
  saved.rssi = WiFi.RSSI();
  saved.heap = ESP.getFreeHeap();
}

void sendPending() {
  if (saved.magic != MAGIC || (!saved.hasFailure && !saved.hasBoot)) return;

  const long at = static_cast<long>(time(nullptr));
  char body[640];
  size_t n = snprintf(body, sizeof body, "{\"entries\":[");
  size_t entries = 0;

  if (saved.hasFailure && entries < MAX_ENTRIES) {
    Failure f = {};
    copyText(f.step, sizeof f.step, saved.step);
    f.outcome = saved.outcome;
    f.got = saved.got;
    f.expected = saved.expected;
    f.ms = saved.ms;
    f.rssi = saved.rssi;
    f.heap = saved.heap;
    char text[208];
    formatFailure(f, text, sizeof text);
    n += snprintf(body + n, sizeof body - n, "%s{\"at\":%ld,\"level\":\"warn\",\"msg\":\"%s\"}",
                  entries ? "," : "", at, text);
    entries++;
  }
  if (saved.hasBoot && entries < MAX_ENTRIES) {
    n += snprintf(body + n, sizeof body - n, "%s{\"at\":%ld,\"level\":\"info\",\"msg\":\"boot %s\"}",
                  entries ? "," : "", at, saved.bootReason);
    entries++;
  }
  if (n >= sizeof body - 3) return;  // cannot happen with these sizes; fail closed
  n += snprintf(body + n, sizeof body - n, "]}");

  uint8_t answer[64];
  const tintero::Response r = tintero::post("/api/v1/log", reinterpret_cast<const uint8_t *>(body),
                                            n, answer, sizeof answer);
  if (r.status == 204) {
    saved.hasFailure = false;
    saved.hasBoot = false;
    Serial.println("Notices sent to the server");
  }
}

void restartIfAllowed(const char *why) {
  const time_t now = time(nullptr);
  const bool nowValid = now > VALID_AFTER;
  bool allowed;
  if (saved.magic != MAGIC || saved.lastRestartAt == 0) {
    allowed = true;
  } else if (nowValid && static_cast<uint32_t>(now) >= saved.lastRestartAt) {
    allowed = static_cast<uint32_t>(now) - saved.lastRestartAt >= MIN_RESTART_GAP_S;
  } else {
    allowed = millis() >= MIN_RESTART_GAP_S * 1000UL;  // no usable clock: use the uptime
  }
  if (!allowed) {
    Serial.printf("Restart (%s) not allowed: one already happened in the last hour\n", why);
    return;
  }
  Serial.printf("Controlled restart: %s\n", why);
  if (saved.magic == MAGIC) saved.lastRestartAt = nowValid ? static_cast<uint32_t>(now) : 0;
  Serial.flush();
  ESP.restart();
}

}  // namespace health
