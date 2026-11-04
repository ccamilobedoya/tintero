// F-019 CA17 and CA18: parseZones and parseIndex skip what they do not know (R10, R11).
#include <cstdint>
#include <cstring>
#include <string>

#include "index.h"
#include "mini.h"
#include "zones.h"

namespace {

bool parseZ(const std::string &json, Zones &out) {
  return parseZones(reinterpret_cast<const uint8_t *>(json.data()), json.size(), "todo",
                    "9f2c1a7b", 800, 480, out);
}
bool parseIdx(const std::string &json, Index &out) {
  return parseIndex(reinterpret_cast<const uint8_t *>(json.data()), json.size(), out);
}

std::string zonesJson(const std::string &list) {
  return "{\"view\":\"todo\",\"hash\":\"9f2c1a7b\",\"zones\":[" + list + "]}";
}

const char *kZ1 = "{\"id\":\"a1\",\"x\":24,\"y\":72,\"w\":752,\"h\":40,\"act\":\"toggle\"}";
const char *kZ2 = "{\"id\":\"b2\",\"x\":24,\"y\":120,\"w\":752,\"h\":40,\"act\":\"link\"}";
const char *kZ3 = "{\"id\":\"c3\",\"x\":24,\"y\":400,\"w\":360,\"h\":56,\"act\":\"open\"}";

std::string view(const std::string &id, const std::string &format, unsigned bytes,
                 const std::string &parent = std::string()) {
  return "{\"id\":\"" + id + "\",\"hash\":\"41d0e2aa\",\"format\":\"" + format +
         "\",\"bytes\":" + std::to_string(bytes) + ",\"crc32\":\"b7e2d150\"" +
         (parent.empty() ? "" : ",\"parent\":\"" + parent + "\"") + "}";
}

std::string indexJson(const std::string &current, const std::string &views) {
  return "{\"protocol\":1,\"server_time\":1761096000,\"next_wake_s\":1800,\"full_refresh\":false,"
         "\"panel\":{\"w\":800,\"h\":480,\"dpi\":124,\"depth\":1},\"current\":\"" +
         current + "\",\"views\":[" + views + "]}";
}

}  // namespace

TEST(ca17_zones_skip_unknown_act) {
  Zones z;
  CHECK(parseZ(zonesJson(std::string(kZ1) + "," + kZ2 + "," + kZ3), z));
  CHECK_EQ(z.count, 2);
  CHECK(std::strcmp(z.zones[0].id, "a1") == 0);
  CHECK(!z.zones[0].open);
  CHECK(std::strcmp(z.zones[1].id, "c3") == 0);
  CHECK(z.zones[1].open);
}

TEST(ca17_zones_unknown_field_is_ignored) {
  const char *colored =
      "{\"id\":\"a1\",\"x\":24,\"y\":72,\"w\":752,\"h\":40,\"act\":\"toggle\",\"color\":3}";
  Zones z;
  CHECK(parseZ(zonesJson(std::string(colored) + "," + kZ3), z));
  CHECK_EQ(z.count, 2);
}

TEST(ca17_zones_other_errors_still_invalidate) {
  Zones z;
  // outside the panel
  CHECK(!parseZ(zonesJson("{\"id\":\"a1\",\"x\":24,\"y\":72,\"w\":800,\"h\":40,\"act\":\"toggle\"}"), z));
  // not aligned
  CHECK(!parseZ(zonesJson("{\"id\":\"a1\",\"x\":25,\"y\":72,\"w\":752,\"h\":40,\"act\":\"toggle\"}"), z));
  // missing act
  CHECK(!parseZ(zonesJson("{\"id\":\"a1\",\"x\":24,\"y\":72,\"w\":752,\"h\":40}"), z));
  // bad id next to a good zone
  CHECK(!parseZ(zonesJson(std::string(kZ1) + ",{\"id\":\"BAD ID\",\"x\":24,\"y\":72,\"w\":8,\"h\":8,\"act\":\"open\"}"), z));
  // repeated id
  CHECK(!parseZ(zonesJson(std::string(kZ1) + "," + kZ1), z));
  // another view
  CHECK(!parseZones(reinterpret_cast<const uint8_t *>(zonesJson(kZ1).data()), zonesJson(kZ1).size(),
                    "other", "9f2c1a7b", 800, 480, z));
}

TEST(ca18_index_skips_unknown_format) {
  Index idx;
  const std::string json = indexJson(
      "todo", view("todo", "raw1", 48000) + "," + view("png9", "png9", 1234) + "," +
                  view("agenda", "raw1", 48000));
  CHECK(parseIdx(json, idx));
  CHECK_EQ(idx.viewCount, 2);
  CHECK(std::strcmp(idx.views[0].id, "todo") == 0);
  CHECK(std::strcmp(idx.views[1].id, "agenda") == 0);
  CHECK(std::strcmp(idx.current, "todo") == 0);
}

TEST(ca18_index_unknown_format_current_is_invalid) {
  Index idx;
  const std::string json = indexJson(
      "png9", view("todo", "raw1", 48000) + "," + view("png9", "png9", 1234) + "," +
                  view("agenda", "raw1", 48000));
  CHECK(!parseIdx(json, idx));
}

TEST(ca18_index_skipped_view_takes_its_children) {
  Index idx;
  const std::string json = indexJson(
      "todo", view("todo", "raw1", 48000) + "," + view("odd", "png9", 10) + "," +
                  view("kid", "raw1", 48000, "odd") + "," + view("agenda", "raw1", 48000));
  CHECK(parseIdx(json, idx));
  CHECK_EQ(idx.viewCount, 2);
  CHECK(std::strcmp(idx.views[0].id, "todo") == 0);
  CHECK(std::strcmp(idx.views[1].id, "agenda") == 0);
}

TEST(ca18_index_pb1) {
  Index idx;
  CHECK(parseIdx(indexJson("todo", view("todo", "pb1", 11000)), idx));
  CHECK_EQ(idx.viewCount, 1);
  CHECK_EQ(idx.views[0].bytes, 11000);

  CHECK(parseIdx(indexJson("todo", view("todo", "pb1", 48000)), idx));
  CHECK(!parseIdx(indexJson("todo", view("todo", "pb1", 48001)), idx));
  // raw1 keeps its exact size.
  CHECK(parseIdx(indexJson("todo", view("todo", "raw1", 48000)), idx));
  CHECK(!parseIdx(indexJson("todo", view("todo", "raw1", 11000)), idx));
  CHECK(!parseIdx(indexJson("todo", view("todo", "raw1", 47999)), idx));
}
