// F-019 CA11: the PackBits decoder of the firmware (firmware/src/packbits.h).
// The pairs ../fixtures/<name>.raw1 / .pb1 are made by the verifier's own encoder (R8).
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>

#include "mini.h"
#include "packbits.h"

namespace {

bool readFile(const std::string &path, std::vector<uint8_t> &out) {
  std::FILE *f = std::fopen(path.c_str(), "rb");
  if (f == nullptr) {
    std::printf("  cannot open %s\n", path.c_str());
    return false;
  }
  out.clear();
  uint8_t buf[4096];
  size_t n;
  while ((n = std::fread(buf, 1, sizeof buf, f)) > 0) out.insert(out.end(), buf, buf + n);
  std::fclose(f);
  return true;
}

// Feeds `pb` in pieces of `piece` bytes (0 = all at once); true if every write was accepted.
bool feed(PackBitsSink &sink, const std::vector<uint8_t> &pb, size_t piece) {
  if (piece == 0) return pb.empty() || sink.write(pb.data(), pb.size());
  for (size_t i = 0; i < pb.size(); i += piece) {
    const size_t k = std::min(piece, pb.size() - i);
    if (!sink.write(pb.data() + i, k)) return false;
  }
  return true;
}

const char *const kNames[] = {"hoy", "agenda", "tablero", "blank", "noise"};

}  // namespace

TEST(ca11_fixtures_decode_identical) {
  for (const char *name : kNames) {
    std::vector<uint8_t> raw, pb;
    const std::string base = std::string("../fixtures/") + name;
    CHECK(readFile(base + ".raw1", raw));
    CHECK(readFile(base + ".pb1", pb));
    CHECK_EQ(raw.size(), 48000);
    for (size_t piece : {static_cast<size_t>(1), static_cast<size_t>(7), static_cast<size_t>(0)}) {
      std::vector<uint8_t> out(raw.size(), 0xEE);
      PackBitsSink sink(out.data(), out.size());
      if (!feed(sink, pb, piece)) std::printf("  write refused: %s, piece %zu\n", name, piece);
      CHECK(feed(sink, {}, 0));
      CHECK(sink.complete());
      if (out != raw) std::printf("  differs: %s, piece %zu\n", name, piece);
      CHECK(out == raw);
    }
  }
}

TEST(ca11_control_0x80_is_invalid) {
  std::vector<uint8_t> out(10, 0);
  PackBitsSink sink(out.data(), out.size());
  const uint8_t bad[] = {0x80};
  CHECK(!sink.write(bad, 1));

  // Also in the middle of a good stream, and fed with more bytes after.
  std::vector<uint8_t> out2(10, 0);
  PackBitsSink sink2(out2.data(), out2.size());
  const uint8_t mixed[] = {0x01, 0x11, 0x22, 0x80, 0x00, 0x33};
  CHECK(!sink2.write(mixed, sizeof mixed));
}

TEST(ca11_0x80_as_data_is_fine) {
  // 0x80 inside a literal run and as the repeated value is data, not a control byte.
  std::vector<uint8_t> out(5, 0);
  PackBitsSink sink(out.data(), out.size());
  const uint8_t ok[] = {0x01, 0x80, 0x80, 0xFE, 0x80};  // literal 80 80, repeat 3 × 80
  CHECK(sink.write(ok, sizeof ok));
  CHECK(sink.complete());
  for (uint8_t b : out) CHECK_EQ(b, 0x80);
}

TEST(ca11_overrun_by_one_byte) {
  // rawBytes 10: a repeat of 11 does not fit.
  std::vector<uint8_t> out(10, 0);
  PackBitsSink sink(out.data(), out.size());
  const uint8_t over[] = {0xF6, 0xAA};  // 257 − 246 = 11 copies
  CHECK(!sink.write(over, sizeof over));

  // rawBytes 10: a full repeat of 10 and then one literal byte.
  std::vector<uint8_t> out2(10, 0);
  PackBitsSink sink2(out2.data(), out2.size());
  const uint8_t ten[] = {0xF7, 0xAA};  // 10 copies
  CHECK(sink2.write(ten, sizeof ten));
  CHECK(sink2.complete());
  const uint8_t one[] = {0x00, 0x55};
  CHECK(!sink2.write(one, sizeof one));

  // A literal run longer than what is left.
  std::vector<uint8_t> out3(4, 0);
  PackBitsSink sink3(out3.data(), out3.size());
  const uint8_t lit[] = {0x04, 1, 2, 3, 4, 5};  // 5 literal bytes into 4
  CHECK(!sink3.write(lit, sizeof lit));
}

TEST(ca11_missing_last_byte) {
  for (const char *name : kNames) {
    std::vector<uint8_t> raw, pb;
    const std::string base = std::string("../fixtures/") + name;
    CHECK(readFile(base + ".raw1", raw));
    CHECK(readFile(base + ".pb1", pb));
    if (pb.empty()) continue;
    pb.pop_back();
    std::vector<uint8_t> out(raw.size(), 0);
    PackBitsSink sink(out.data(), out.size());
    (void)feed(sink, pb, 0);
    if (sink.complete()) std::printf("  complete() true with a missing byte: %s\n", name);
    CHECK(!sink.complete());
  }
  std::vector<uint8_t> out(3, 0);
  PackBitsSink empty(out.data(), out.size());
  CHECK(!empty.complete());
}

TEST(ca11_never_writes_past_rawBytes) {
  // The output has guard bytes after rawBytes; a bad stream must not touch them.
  std::vector<uint8_t> out(16, 0x5A);
  PackBitsSink sink(out.data(), 8);
  const uint8_t big[] = {0xE0, 0x11};  // 33 copies into 8
  CHECK(!sink.write(big, sizeof big));
  for (size_t i = 8; i < out.size(); i++) CHECK_EQ(out[i], 0x5A);
}
