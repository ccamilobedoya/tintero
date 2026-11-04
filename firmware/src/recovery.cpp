// Self-healing helpers (see recovery.h).

#include "recovery.h"

#include <cstdarg>
#include <cstdio>

namespace {
constexpr uint32_t BASE_MS = 30000;
constexpr uint32_t MAX_MS = 900000;
constexpr size_t MAX_TEXT = 200;
}  // namespace

uint32_t backoffMs(uint32_t failures) {
  if (failures == 0) return 0;
  if (failures > 5) return MAX_MS;  // 30 000 × 2^5 = 960 000 already passes the cap
  const uint32_t ms = BASE_MS << (failures - 1);
  return ms < MAX_MS ? ms : MAX_MS;
}

size_t formatFailure(const Failure &f, char *out, size_t cap) {
  if (cap == 0) return 0;
  const size_t room = cap < MAX_TEXT + 1 ? cap : MAX_TEXT + 1;
  // step is a fixed array: bound it in case it came without its '\0'.
  char step[sizeof f.step + 1];
  size_t i = 0;
  for (; i < sizeof f.step && f.step[i] != '\0'; i++) step[i] = f.step[i];
  step[i] = '\0';
  const int n = snprintf(out, room, "%s %s %lu/%lu B %lu ms rssi %d heap %lu", step,
                         f.outcome != nullptr ? f.outcome : "unknown", (unsigned long)f.got,
                         (unsigned long)f.expected, (unsigned long)f.ms, f.rssi,
                         (unsigned long)f.heap);
  if (n < 0) {
    out[0] = '\0';
    return 0;
  }
  return static_cast<size_t>(n) < room ? static_cast<size_t>(n) : room - 1;
}

bool safeText(char *s, size_t cap) {
  if (cap == 0) return false;
  s[cap - 1] = '\0';
  for (size_t i = 0; s[i] != '\0'; i++) {
    const char c = s[i];
    if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-')) return false;
  }
  return true;
}

bool appendf(char *buf, size_t cap, size_t &n, const char *fmt, ...) {
  if (n >= cap) return false;
  va_list ap;
  va_start(ap, fmt);
  const int w = vsnprintf(buf + n, cap - n, fmt, ap);
  va_end(ap);
  if (w < 0 || static_cast<size_t>(w) >= cap - n) {
    n = cap;
    return false;
  }
  n += static_cast<size_t>(w);
  return true;
}

bool restartAllowed(bool memoryValid, uint32_t lastAt, bool lastNoClock, bool nowValid,
                    uint32_t now, uint32_t uptimeMs) {
  constexpr uint32_t GAP_S = 3600;
  if (!memoryValid) return true;
  if (lastAt == 0) {
    if (!lastNoClock) return true;                // never restarted
    return nowValid || uptimeMs >= GAP_S * 1000;  // it did without a clock: wait for one or 1 h
  }
  if (nowValid && now >= lastAt) return now - lastAt >= GAP_S;
  return uptimeMs >= GAP_S * 1000;
}
