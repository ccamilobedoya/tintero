// Helpers to read Tintero JSON with ArduinoJson.
#pragma once

#include <ArduinoJson.h>
#include <string.h>

namespace jsontext {

// What each kind of text may hold (the patterns of the contract).
inline bool isIdChar(char c) {
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-';
}
inline bool isHexChar(char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'); }

// Checks a text of the JSON (that it exists, its length and its characters) and
// copies it to a fixed-size field, with its '\0'.
template <size_t N>
bool copyText(JsonVariantConst v, char (&dst)[N], size_t minLen, size_t maxLen,
              bool (*allowed)(char)) {
  const char *s = v.as<const char *>();  // nullptr if absent or not a text
  if (s == nullptr) return false;
  const size_t n = strlen(s);
  if (n < minLen || n > maxLen || n >= N) return false;
  for (size_t i = 0; i < n; i++) {
    if (!allowed(s[i])) return false;
  }
  memcpy(dst, s, n + 1);
  return true;
}

// An unsigned integer that must be in the JSON.
inline bool readUint(JsonVariantConst v, uint32_t &dst) {
  if (!v.is<uint32_t>()) return false;  // absent, negative, decimal or too large
  dst = v.as<uint32_t>();
  return true;
}

}  // namespace jsontext
