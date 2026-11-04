// Minimal Arduino.h for the native firmware tests (tools/probar-firmware, F-019).
// Only what the pure firmware sources use: Serial to stdout and millis() from a test clock.
#pragma once

#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>

struct NativeSerial {
  int printf(const char *fmt, ...) __attribute__((format(printf, 2, 3))) {
    va_list ap;
    va_start(ap, fmt);
    const int n = std::vprintf(fmt, ap);
    va_end(ap);
    return n;
  }
  size_t print(const char *s) { return static_cast<size_t>(std::printf("%s", s)); }
  size_t println(const char *s = "") { return static_cast<size_t>(std::printf("%s\n", s)); }
};

inline NativeSerial Serial;

// Tests may set this to move time; it starts at 0.
inline uint32_t nativeMillis = 0;
inline uint32_t millis() { return nativeMillis; }
inline void delay(uint32_t ms) { nativeMillis += ms; }
