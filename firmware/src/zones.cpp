// The zones of a view and the focus style.

#include "zones.h"

#include <ArduinoJson.h>
#include <string.h>

#include "jsontext.h"

using jsontext::copyText;
using jsontext::isHexChar;
using jsontext::isIdChar;
using jsontext::readUint;

namespace {

bool fail(const char *why) {
  Serial.printf("Invalid zones: %s\n", why);
  return false;
}

}  // namespace

bool parseZones(const uint8_t *json, size_t len, const char *view, const char *hash,
                uint16_t panelW, uint16_t panelH, Zones &out) {
  JsonDocument doc;
  const DeserializationError err = deserializeJson(doc, json, len);
  if (err) return fail(err.c_str());

  static Zones z;  // static: 1.8 KB, better off the stack of loop()
  z = {};
  if (!copyText(doc["view"], z.view, 1, 16, isIdChar) || strcmp(z.view, view) != 0) {
    return fail("view");
  }
  if (!copyText(doc["hash"], z.hash, 8, 16, isHexChar) || strcmp(z.hash, hash) != 0) {
    return fail("hash");
  }

  JsonArrayConst list = doc["zones"].as<JsonArrayConst>();
  if (list.isNull()) return fail("zones");
  if (list.size() > MAX_ZONES) return fail("too many zones");

  for (JsonVariantConst v : list) {
    Zone &zone = z.zones[z.count];
    if (!copyText(v["id"], zone.id, 1, 16, isIdChar)) return fail("zone id");
    for (size_t i = 0; i < z.count; i++) {
      if (strcmp(z.zones[i].id, zone.id) == 0) return fail("repeated zone id");
    }
    uint32_t x = 0, y = 0, w = 0, h = 0;
    if (!readUint(v["x"], x) || !readUint(v["y"], y) || !readUint(v["w"], w) ||
        !readUint(v["h"], h)) {
      return fail("x, y, w or h");
    }
    if (w < 8 || h < 8 || x + w > panelW || y + h > panelH) return fail("zone outside the panel");
    // The partial refresh works in bytes of 8 pixels: x and w must be aligned.
    if (x % 8 != 0 || w % 8 != 0) return fail("zone not aligned to 8 pixels");
    zone.x = x;
    zone.y = y;
    zone.w = w;
    zone.h = h;

    const char *act = v["act"].as<const char *>();
    if (act == nullptr) return fail("act");
    if (strcmp(act, "open") == 0) {
      zone.open = true;
    } else if (strcmp(act, "toggle") == 0) {
      zone.open = false;
    } else {
      return fail("unknown act");
    }
    z.count++;
  }

  // The focus style is optional: if absent, the defaults stay.
  JsonVariantConst focus = doc["focus"];
  if (!focus.isNull()) {
    uint32_t ring = 0, pad = 0, dash = 0;
    if (!readUint(focus["ring"], ring) || !readUint(focus["pad"], pad) ||
        !readUint(focus["dash"], dash) || ring < 1 || ring > 16 || pad < 1 || pad > 32 ||
        dash > 64) {
      return fail("focus");
    }
    z.focus.ring = ring;
    z.focus.pad = pad;
    z.focus.dash = dash;
  }

  out = z;
  return true;
}
