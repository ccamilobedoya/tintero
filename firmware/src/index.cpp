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

  for (JsonVariantConst v : views) {
    View &view = idx.views[idx.viewCount];
    if (!copyText(v["id"], view.id, 1, 16, isIdChar)) return fail("view id");
    if (findView(idx, view.id) >= 0) return fail("repeated view id");
    if (!copyText(v["hash"], view.hash, 8, 16, isHexChar)) return fail("hash");

    const char *format = v["format"].as<const char *>();
    if (format == nullptr || strcmp(format, "raw1") != 0) return fail("format (raw1 only)");
    if (!readUint(v["bytes"], view.bytes) || view.bytes != raw1Bytes) return fail("bytes");

    char crcText[9];
    if (!copyText(v["crc32"], crcText, 8, 8, isHexChar)) return fail("crc32");
    view.crc32 = strtoul(crcText, nullptr, 16);

    view.parent[0] = '\0';
    if (!v["parent"].isNull() && !copyText(v["parent"], view.parent, 1, 16, isIdChar)) {
      return fail("parent");
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
  if (findView(idx, idx.current) < 0) return fail("current is not a view");

  out = idx;
  return true;
}
