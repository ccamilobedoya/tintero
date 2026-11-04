// Self-healing helpers (see recovery.h).

#include "recovery.h"

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
