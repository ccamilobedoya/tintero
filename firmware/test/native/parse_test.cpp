// Unit tests of parseIndex and parseZones tolerance (F-019, R10 and R11).
// Run with: tools/probar-firmware firmware/test/native/parse_test.cpp
#include <cstdio>
#include <cstring>
#include <string>

#include "index.h"
#include "zones.h"

static int failures = 0;
#define CHECK(cond)                                               \
  do {                                                            \
    if (!(cond)) {                                                \
      std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); \
      failures++;                                                 \
    }                                                             \
  } while (0)

static std::string viewJson(const char *id, const char *format, int bytes, const char *parent = nullptr) {
  std::string s = std::string("{\"id\":\"") + id + "\",\"hash\":\"aaaaaaaa\",\"format\":\"" + format +
                  "\",\"bytes\":" + std::to_string(bytes) + ",\"crc32\":\"deadbeef\"";
  if (parent) s += std::string(",\"parent\":\"") + parent + "\"";
  return s + "}";
}

static std::string indexJson(const std::string &views, const char *current) {
  return std::string("{\"protocol\":1,\"server_time\":1800000000,\"next_wake_s\":60,") +
         "\"panel\":{\"w\":800,\"h\":480,\"dpi\":124,\"depth\":1},\"current\":\"" + current +
         "\",\"views\":[" + views + "]}";
}

static bool parse(const std::string &json, Index &out) {
  return parseIndex(reinterpret_cast<const uint8_t *>(json.data()), json.size(), out);
}

static void testIndex() {
  Index idx = {};
  CHECK(parse(indexJson(viewJson("a", "raw1", 48000) + "," + viewJson("b", "png9", 10) + "," +
                            viewJson("c", "pb1", 11000),
                        "a"),
              idx));
  CHECK(idx.viewCount == 2 && strcmp(idx.views[1].id, "c") == 0 && idx.views[1].packed &&
        !idx.views[0].packed);

  Index idx2 = {};
  CHECK(!parse(indexJson(viewJson("a", "raw1", 48000) + "," + viewJson("b", "png9", 10), "b"), idx2));

  Index idx3 = {};  // the children of a skipped view go too, even if listed first
  CHECK(parse(indexJson(viewJson("kid", "raw1", 48000, "b") + "," + viewJson("a", "raw1", 48000) +
                            "," + viewJson("b", "png9", 10),
                        "a"),
              idx3));
  CHECK(idx3.viewCount == 1 && strcmp(idx3.views[0].id, "a") == 0);

  Index i4 = {};
  CHECK(parse(indexJson(viewJson("a", "pb1", 11000), "a"), i4));
  CHECK(!parse(indexJson(viewJson("a", "pb1", 48001), "a"), i4));
  CHECK(!parse(indexJson(viewJson("a", "raw1", 11000), "a"), i4));
}

static std::string zone(const char *id, const char *act, const char *extra = "") {
  return std::string("{\"id\":\"") + id + "\",\"x\":8,\"y\":8,\"w\":80,\"h\":40,\"act\":\"" + act + "\"" +
         extra + "}";
}

static bool parseZ(const std::string &zones, Zones &out) {
  const std::string json = "{\"view\":\"v\",\"hash\":\"aaaaaaaa\",\"zones\":[" + zones + "]}";
  return parseZones(reinterpret_cast<const uint8_t *>(json.data()), json.size(), "v", "aaaaaaaa", 800,
                    480, out);
}

static void testZones() {
  Zones z = {};
  CHECK(parseZ(zone("z1", "open") + "," + zone("z2", "link") + "," + zone("z3", "toggle"), z));
  CHECK(z.count == 2 && strcmp(z.zones[0].id, "z1") == 0 && strcmp(z.zones[1].id, "z3") == 0);
  CHECK(!z.zones[1].open);
  Zones z2 = {};
  CHECK(parseZ(zone("z1", "open", ",\"color\":3"), z2) && z2.count == 1);
  Zones z3 = {};
  CHECK(!parseZ("{\"id\":\"z1\",\"x\":3,\"y\":8,\"w\":80,\"h\":40,\"act\":\"open\"}", z3));
}

int main() {
  testIndex();
  testZones();
  if (failures == 0) std::printf("all passed\n");
  return failures == 0 ? 0 : 1;
}
