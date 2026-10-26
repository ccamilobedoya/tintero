// The Tintero index.
#pragma once

#include <Arduino.h>

constexpr size_t MAX_VIEWS = 16;  // cap of protocol v1

struct View {
  char id[17];      // ^[a-z0-9_-]{1,16}$
  char hash[17];    // ^[0-9a-f]{8,16}$
  uint32_t bytes;   // size of the image; with this panel, 48 000
  uint32_t crc32;   // CRC-32 of the image (the zlib one)
  char parent[17];  // empty if it is not a detail
};

struct Index {
  uint32_t serverTime;  // Unix time of the server
  uint32_t nextWakeS;   // already clamped to 30…86 400
  bool fullRefresh;
  bool panelOk;         // the panel in the answer is the one that was declared
  char current[17];
  View views[MAX_VIEWS];
  size_t viewCount;
};

// Reads the index JSON (json, len bytes) and fills out. Returns false if the JSON
// is not valid or something required is missing.
bool parseIndex(const uint8_t *json, size_t len, Index &out);
