// Self-healing helpers: waits after failures and the text of a failure notice.
// No Arduino: they run on the PC in tests.
#pragma once

#include <cstddef>
#include <cstdint>

// Wait after `failures` consecutive failed syncs: 0 → 0; n ≥ 1 → min(30 000 × 2^(n−1), 900 000) ms.
uint32_t backoffMs(uint32_t failures);

struct Failure {
  char step[8];          // index | image | zones | actions | log
  const char *outcome;   // http::outcomeName()
  uint32_t got, expected, ms;
  int rssi;
  uint32_t heap;
};

// "<step> <outcome> <got>/<expected> B <ms> ms rssi <rssi> heap <heap>" into out
// (at most 200 characters, always ends in '\0'). Returns the length without the
// '\0'; with cap = 0 it returns 0 and writes nothing.
size_t formatFailure(const Failure &f, char *out, size_t cap);

// Forces a '\0' at the end of s[cap] and checks it only has [a-z0-9_-] characters
// (what the notices carry). false = corrupt text.
bool safeText(char *s, size_t cap);

// printf into buf[n..cap) and advances n. false (and n = cap) if it did not fit.
bool appendf(char *buf, size_t cap, size_t &n, const char *fmt, ...)
    __attribute__((format(printf, 4, 5)));

// May a controlled restart happen now (rule R6: never two in less than 1 h)?
// lastAt: Unix time of the last one (0 = unknown); lastNoClock: it happened with no valid clock.
bool restartAllowed(bool memoryValid, uint32_t lastAt, bool lastNoClock, bool nowValid,
                    uint32_t now, uint32_t uptimeMs);
