// The Tintero index. Tested with the valid and invalid examples of the contract
// (contract/fixtures/v1) and with a real index.
//
// Reads the JSON of GET /api/v1/index and fills an Index. Rules of contract v1
// (firmware/README.md and contract/schema/v1/ in the Tintero repository):
//   - "protocol" must be 1.
//   - a "panel" different from the declared one → the index is valid, but
//     panelOk = false and nothing new is shown.
//   - "next_wake_s" is clamped to 30…86 400 whatever the server sends.
//   - At most MAX_VIEWS views, with no repeated ids; "current" and each "parent"
//     must be another view of the list.
//   - Texts are checked against their pattern and never trimmed: if they do not
//     fit, the index is invalid.
// If anything fails, it returns false and leaves `out` alone: the last good index stays.

#include "index.h"

#include <ArduinoJson.h>
#include <string.h>

#include "jsontext.h"

using jsontext::copyText;
using jsontext::isHexChar;
using jsontext::isIdChar;
using jsontext::readUint;

namespace {

constexpr uint32_t PROTOCOL = 1;
constexpr uint32_t PANEL_W = 800, PANEL_H = 480, PANEL_DPI = 124, PANEL_DEPTH = 1;
constexpr uint32_t MIN_WAKE_S = 30, MAX_WAKE_S = 86400;

int findView(const Index &idx, const char *id) {
  for (size_t i = 0; i < idx.viewCount; i++) {
    if (strcmp(idx.views[i].id, id) == 0) return static_cast<int>(i);
  }
  return -1;
}

bool fail(const char *why) {
  Serial.printf("Invalid index: %s\n", why);
  return false;
}

}  // namespace

bool parseIndex(const uint8_t *json, size_t len, Index &out) {
  JsonDocument doc;
  const DeserializationError err = deserializeJson(doc, json, len);
  if (err) return fail(err.c_str());

  Index idx = {};  // filled apart and copied to `out` only if everything is fine

  uint32_t protocol = 0;
  if (!readUint(doc["protocol"], protocol) || protocol != PROTOCOL) return fail("protocol");
  if (!readUint(doc["server_time"], idx.serverTime)) return fail("server_time");

  uint32_t wake = 0;
  if (!readUint(doc["next_wake_s"], wake)) return fail("next_wake_s");
  idx.nextWakeS = wake < MIN_WAKE_S ? MIN_WAKE_S : (wake > MAX_WAKE_S ? MAX_WAKE_S : wake);

  idx.fullRefresh = doc["full_refresh"] | false;  // optional: false if absent

  // The panel the server thinks we have.
  uint32_t w = 0, h = 0, dpi = 0, depth = 0;
  JsonVariantConst panel = doc["panel"];
  if (!readUint(panel["w"], w) || !readUint(panel["h"], h) || !readUint(panel["dpi"], dpi) ||
      !readUint(panel["depth"], depth)) {
    return fail("panel");
  }
  idx.panelOk = w == PANEL_W && h == PANEL_H && dpi == PANEL_DPI && depth == PANEL_DEPTH;
  const uint32_t raw1Bytes = (w + 7) / 8 * h;  // raw1: ceil(width / 8) × height

  JsonArrayConst views = doc["views"].as<JsonArrayConst>();
  if (views.isNull() || views.size() == 0) return fail("empty views");
  if (views.size() > MAX_VIEWS) return fail("too many views");

  bool skip[MAX_VIEWS] = {};  // views in a format this firmware does not know
  for (JsonVariantConst v : views) {
    const size_t at = idx.viewCount;
    View &view = idx.views[at];
    if (!copyText(v["id"], view.id, 1, 16, isIdChar)) return fail("view id");
    if (findView(idx, view.id) >= 0) return fail("repeated view id");
    if (!copyText(v["hash"], view.hash, 8, 16, isHexChar)) return fail("hash");

    view.parent[0] = '\0';
    if (!v["parent"].isNull() && !copyText(v["parent"], view.parent, 1, 16, isIdChar)) {
      return fail("parent");
    }

    const char *format = v["format"].as<const char *>();
    if (format == nullptr) return fail("format");
    if (strcmp(format, "raw1") == 0) {
      view.packed = false;
      if (!readUint(v["bytes"], view.bytes) || view.bytes != raw1Bytes) return fail("bytes");
    } else if (strcmp(format, "pb1") == 0) {
      view.packed = true;
      if (!readUint(v["bytes"], view.bytes) || view.bytes < 1 || view.bytes > raw1Bytes) {
        return fail("bytes");
      }
    } else {
      skip[at] = true;  // unknown format: the view is left out (R11)
    }

    if (!skip[at]) {
      char crcText[9];
      if (!copyText(v["crc32"], crcText, 8, 8, isHexChar)) return fail("crc32");
      view.crc32 = strtoul(crcText, nullptr, 16);
    }
    idx.viewCount++;
  }

  // What points to other views, now with the complete list.
  for (size_t i = 0; i < idx.viewCount; i++) {
    const char *parent = idx.views[i].parent;
    if (parent[0] == '\0') continue;
    const int p = findView(idx, parent);
    if (p < 0 || static_cast<size_t>(p) == i) return fail("unknown parent");
  }
  if (!copyText(doc["current"], idx.current, 1, 16, isIdChar)) return fail("current");
  const int cur = findView(idx, idx.current);
  if (cur < 0) return fail("current is not a view");

  // Views whose parent is left out are left out too (repeat until nothing changes).
  for (bool changed = true; changed;) {
    changed = false;
    for (size_t i = 0; i < idx.viewCount; i++) {
      if (skip[i] || idx.views[i].parent[0] == '\0') continue;
      if (skip[findView(idx, idx.views[i].parent)]) {
        skip[i] = true;
        changed = true;
      }
    }
  }
  if (skip[cur]) return fail("current is in an unknown format");

  size_t kept = 0;
  for (size_t i = 0; i < idx.viewCount; i++) {
    if (skip[i]) {
      Serial.printf("Index: view \"%s\" left out (unknown format)\n", idx.views[i].id);
      continue;
    }
    if (kept != i) idx.views[kept] = idx.views[i];
    kept++;
  }
  idx.viewCount = kept;

  out = idx;
  return true;
}
