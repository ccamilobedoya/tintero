// The zones of a view and the focus style.
#pragma once

#include <Arduino.h>

constexpr size_t MAX_ZONES = 48;  // cap of protocol v1

struct Zone {
  char id[17];
  uint16_t x, y, w, h;  // x and w, multiples of 8 (byte aligned)
  bool open;            // act: true = "open" (opens a detail), false = "toggle"
};

// The focus ring (ADR-0048): the pixels less than `ring` from the edge of the zone
// are inverted; with dash > 0, in runs of `dash` pixels. Inside each zone there is
// a blank band of `pad` pixels, so the ring touches nothing.
struct FocusStyle {
  uint8_t ring = 3;
  uint8_t pad = 6;
  uint8_t dash = 8;
};

struct Zones {
  char view[17];
  char hash[17];
  Zone zones[MAX_ZONES];
  size_t count;
  FocusStyle focus;
};

// Reads the JSON of GET /api/v1/views/{id}/zones and fills out. Checks that it
// belongs to the requested view and hash, and that each zone is inside the panel
// and aligned.
bool parseZones(const uint8_t *json, size_t len, const char *view, const char *hash,
                uint16_t panelW, uint16_t panelH, Zones &out);
