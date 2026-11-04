// Unit tests of the pure firmware sources (F-019): http_reader, packbits, recovery.
// Run with: tools/probar-firmware firmware/test/native/unit_test.cpp
#include <algorithm>
#include <cstdio>
#include <string>
#include <vector>

#include "http_reader.h"
#include "packbits.h"
#include "recovery.h"

static int failures = 0;
#define CHECK(cond)                                                    \
  do {                                                                 \
    if (!(cond)) {                                                     \
      std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);      \
      failures++;                                                      \
    }                                                                  \
  } while (0)

// One step of a script: deliver bytes, wait (read returns 0) for ms, or close.
struct Step {
  enum Kind { Bytes, Wait, Close } kind;
  std::string bytes;
  uint32_t ms;
};

struct FakeClock : http::Clock {
  uint32_t now = 0;
  uint32_t nowMs() override { return now; }
  void pause() override { now += 2; }
};

struct FakeSource : http::Source {
  FakeSource(FakeClock &c, std::vector<Step> s) : clock(c), steps(std::move(s)) {}
  FakeClock &clock;
  std::vector<Step> steps;
  size_t idx = 0, off = 0;
  uint32_t waitUntil = 0;
  bool waiting = false;
  uint32_t lastByteAt = 0;

  int read(uint8_t *buf, size_t n) override {
    if (idx >= steps.size()) return 0;  // silence forever
    Step &s = steps[idx];
    if (s.kind == Step::Close) return -1;
    if (s.kind == Step::Wait) {
      if (!waiting) {
        waiting = true;
        waitUntil = clock.now + s.ms;
      }
      if (clock.now < waitUntil) return 0;
      waiting = false;
      idx++;
      return read(buf, n);
    }
    const size_t take = std::min(n, s.bytes.size() - off);
    std::memcpy(buf, s.bytes.data() + off, take);
    off += take;
    if (off == s.bytes.size()) {
      idx++;
      off = 0;
    }
    lastByteAt = clock.now;
    return static_cast<int>(take);
  }
};

static Step bytes(const std::string &b) { return {Step::Bytes, b, 0}; }
static Step wait(uint32_t ms) { return {Step::Wait, "", ms}; }
static Step closed() { return {Step::Close, "", 0}; }

static std::string head(const std::string &status, const std::string &extra = "") {
  return status + "\r\n" + extra + "\r\n";
}
static std::string ok200(size_t len, const std::string &extra = "") {
  return head("HTTP/1.1 200 OK", "Content-Length: " + std::to_string(len) + "\r\n" + extra);
}

static http::Result run(std::vector<Step> steps, http::Limits lim, http::Sink &sink,
                        uint32_t *endAt = nullptr, uint32_t *lastByte = nullptr) {
  FakeClock clock;
  FakeSource src(clock, std::move(steps));
  const http::Result r = http::readResponse(src, clock, lim, sink);
  if (endAt) *endAt = clock.now;
  if (lastByte) *lastByte = src.lastByteAt;
  return r;
}

static http::Outcome outcomeOf(const std::string &raw) {
  uint8_t buf[2048];
  http::BufferSink sink(buf, sizeof buf);
  return run({bytes(raw)}, {1000, 2000, 2048}, sink).outcome;
}

static void testReader() {
  uint8_t big[48000];
  {  // stalls mid-image
    http::BufferSink sink(big, sizeof big);
    uint32_t end = 0, last = 0;
    const http::Result r = run({bytes(ok200(48000)), bytes(std::string(20000, 'x'))},
                               {10000, 30000, 48000}, sink, &end, &last);
    CHECK(r.outcome == http::Outcome::Stalled);
    CHECK(r.status == 200 && r.bodyBytes == 20000 && !r.reusable);
    CHECK(end - last >= 10000 && end - last <= 10010);
  }
  {  // drip: one byte every 100 ms
    std::vector<Step> steps = {bytes(ok200(48000))};
    for (int i = 0; i < 1000; i++) {
      steps.push_back(wait(100));
      steps.push_back(bytes("x"));
    }
    http::BufferSink sink(big, sizeof big);
    uint32_t end = 0;
    const http::Result r = run(steps, {10000, 30000, 48000}, sink, &end);
    CHECK(r.outcome == http::Outcome::Timeout);
    CHECK(end >= 30000 && end <= 30110);
  }
  {  // headers that never end
    http::BufferSink sink(big, sizeof big);
    const http::Result r = run({bytes("HTTP/1.1 200 OK\r\n")}, {10000, 30000, 48000}, sink);
    CHECK(r.outcome == http::Outcome::Stalled && r.bodyBytes == 0);
  }
  {  // closes early
    http::BufferSink sink(big, sizeof big);
    const http::Result r =
        run({bytes(ok200(5000)), bytes(std::string(1000, 'x')), closed()}, {10000, 30000, 48000}, sink);
    CHECK(r.outcome == http::Outcome::Closed && r.bodyBytes == 1000);
  }
  {  // too large: nothing reaches the sink
    http::BufferSink sink(big, sizeof big);
    const http::Result r = run({bytes(ok200(70000) + "abc")}, {10000, 30000, 48000}, sink);
    CHECK(r.outcome == http::Outcome::TooLarge && sink.length() == 0);
  }
  // bad headers
  CHECK(outcomeOf(head("HTTP/1.1 200 OK", "X-A: " + std::string(509, 'a') + "\r\n")) ==
        http::Outcome::BadHeader);  // no Content-Length
  {
    // exactly 512 bytes: "X: " (3) + 509
    const std::string line512 = "X: " + std::string(509, 'a');
    CHECK(line512.size() == 512);
    CHECK(outcomeOf(ok200(0, line512 + "\r\n")) == http::Outcome::Ok);
    CHECK(outcomeOf(ok200(0, line512 + "a\r\n")) == http::Outcome::BadHeader);
  }
  {
    std::string many;
    for (int i = 0; i < 47; i++) many += "H" + std::to_string(i) + ": v\r\n";
    CHECK(outcomeOf(ok200(0, many)) == http::Outcome::Ok);  // 47 + Content-Length = 48
    CHECK(outcomeOf(ok200(0, many + "H47: v\r\n")) == http::Outcome::BadHeader);  // 49
  }
  CHECK(outcomeOf(head("HTTP/1.1 200 OK")) == http::Outcome::BadHeader);
  CHECK(outcomeOf(ok200(0, "Transfer-Encoding: chunked\r\n")) == http::Outcome::BadHeader);
  CHECK(outcomeOf(head("HTTP/2 200", "Content-Length: 0\r\n")) == http::Outcome::BadHeader);
  CHECK(outcomeOf(head("ICY 200 OK", "Content-Length: 0\r\n")) == http::Outcome::BadHeader);
  CHECK(outcomeOf(head("HTTP/1.1 2000 OK", "Content-Length: 0\r\n")) == http::Outcome::BadHeader);

  // Retry-After and reusable
  struct RA { const char *v; uint32_t want; };
  const RA cases[] = {{"7", 7}, {"99999999", 3600}, {"abc", 0}, {"-5", 0}, {"99999999999999999999999", 3600}};
  for (const RA &c : cases) {
    uint8_t b[16];
    http::BufferSink sink(b, sizeof b);
    const http::Result r = run({bytes(head("HTTP/1.1 503 X", std::string("Retry-After: ") + c.v + "\r\nContent-Length: 0\r\n"))},
                               {1000, 2000, 16}, sink);
    CHECK(r.outcome == http::Outcome::Ok && r.retryAfterS == c.want);
  }
  {
    uint8_t b[16];
    http::BufferSink sink(b, sizeof b);
    CHECK(run({bytes(ok200(0))}, {1000, 2000, 16}, sink).retryAfterS == 0);
  }
  {
    uint8_t b[16];
    http::BufferSink s1(b, sizeof b), s2(b, sizeof b), s3(b, sizeof b), s4(b, sizeof b);
    CHECK(run({bytes(ok200(0))}, {1000, 2000, 16}, s1).reusable);
    CHECK(!run({bytes(ok200(0, "Connection: close\r\n"))}, {1000, 2000, 16}, s2).reusable);
    CHECK(!run({bytes(ok200(0, "connection: Close\r\n"))}, {1000, 2000, 16}, s3).reusable);
    CHECK(!run({bytes(head("HTTP/1.0 200 OK", "Content-Length: 0\r\n"))}, {1000, 2000, 16}, s4).reusable);
  }
  {  // sink that fills up
    uint8_t b[100];
    http::BufferSink sink(b, sizeof b);
    const http::Result r =
        run({bytes(ok200(865)), bytes(std::string(865, 'z'))}, {1000, 2000, 2000}, sink);
    CHECK(r.outcome == http::Outcome::BadBody);
  }
  {  // normal, in odd pieces
    std::string body;
    for (int i = 0; i < 865; i++) body.push_back(static_cast<char>('a' + i % 26));
    const std::string all = ok200(865) + body;
    std::vector<Step> steps;
    const size_t sizes[] = {1, 7, 1436};
    size_t pos = 0, k = 0;
    while (pos < all.size()) {
      const size_t n = std::min(sizes[k++ % 3], all.size() - pos);
      steps.push_back(bytes(all.substr(pos, n)));
      pos += n;
    }
    uint8_t b[1024];
    http::BufferSink sink(b, sizeof b);
    const http::Result r = run(steps, {1000, 2000, 1024}, sink);
    CHECK(r.outcome == http::Outcome::Ok && r.bodyBytes == 865 && r.reusable);
    CHECK(std::memcmp(b, body.data(), 865) == 0);
  }
  {
    uint8_t b[16];
    http::BufferSink sink(b, sizeof b);
    http::Result r = run({bytes(head("HTTP/1.1 204 No Content"))}, {1000, 2000, 16}, sink);
    CHECK(r.outcome == http::Outcome::Ok && r.bodyBytes == 0 && r.status == 204 && r.reusable);
    http::BufferSink s2(b, sizeof b);
    r = run({bytes(head("HTTP/1.1 404 Not Found", "Content-Length: 0\r\n"))}, {1000, 2000, 16}, s2);
    CHECK(r.outcome == http::Outcome::Ok && r.status == 404);
    http::BufferSink s3(b, sizeof b);
    r = run({bytes(head("HTTP/1.1 404 Not Found"))}, {1000, 2000, 16}, s3);  // no length
    CHECK(r.outcome == http::Outcome::Ok && !r.reusable);
  }
  CHECK(std::string(http::outcomeName(http::Outcome::TooLarge)) == "too-large");
}

static std::vector<uint8_t> encode(const std::vector<uint8_t> &raw) {
  std::vector<uint8_t> out;
  size_t i = 0;
  while (i < raw.size()) {
    size_t run = 1;
    while (i + run < raw.size() && raw[i + run] == raw[i] && run < 128) run++;
    if (run >= 2) {
      out.push_back(static_cast<uint8_t>(257 - run));
      out.push_back(raw[i]);
      i += run;
    } else {
      size_t j = i;
      while (j < raw.size() && j - i < 128 && !(j + 1 < raw.size() && raw[j] == raw[j + 1])) j++;
      out.push_back(static_cast<uint8_t>(j - i - 1));
      out.insert(out.end(), raw.begin() + i, raw.begin() + j);
      i = j;
    }
  }
  return out;
}

static void testPackBits() {
  std::vector<uint8_t> raw;
  uint32_t seed = 7;
  for (int i = 0; i < 3000; i++) {
    seed = seed * 1664525u + 1013904223u;
    raw.push_back((seed >> 24) % 3 == 0 ? static_cast<uint8_t>(seed >> 16) : 0xff);
  }
  const std::vector<uint8_t> packed = encode(raw);
  for (size_t piece : {size_t(1), size_t(7), packed.size()}) {
    std::vector<uint8_t> out(raw.size());
    PackBitsSink sink(out.data(), out.size());
    bool ok = true;
    for (size_t p = 0; p < packed.size(); p += piece) {
      ok = ok && sink.write(packed.data() + p, std::min(piece, packed.size() - p));
    }
    CHECK(ok && sink.complete() && out == raw);
  }
  {
    uint8_t out[4];
    PackBitsSink s(out, 4);
    const uint8_t bad = 0x80;
    CHECK(!s.write(&bad, 1));
    PackBitsSink s2(out, 4);  // repeat 5 times into 4 bytes
    const uint8_t over[] = {static_cast<uint8_t>(257 - 5), 1};
    CHECK(!s2.write(over, 2));
    PackBitsSink s3(out, 4);  // literal 5 into 4 bytes
    const uint8_t lit[] = {4, 1, 2, 3, 4, 5};
    CHECK(!s3.write(lit, 6));
    PackBitsSink s4(out, 4);  // missing the last byte
    const uint8_t short_[] = {3, 1, 2, 3};
    CHECK(s4.write(short_, 4) && !s4.complete());
    PackBitsSink s5(out, 4);  // exact
    const uint8_t exact[] = {static_cast<uint8_t>(257 - 4), 9};
    CHECK(s5.write(exact, 2) && s5.complete() && out[3] == 9);
  }
}

static void testRecovery() {
  CHECK(backoffMs(0) == 0 && backoffMs(1) == 30000 && backoffMs(2) == 60000);
  CHECK(backoffMs(5) == 480000 && backoffMs(6) == 900000 && backoffMs(100) == 900000);
  CHECK(backoffMs(UINT32_MAX) == 900000);
  Failure f = {"image", "stalled", 20000, 11873, 10012, -67, 81234};
  char out[256];
  const char *want = "image stalled 20000/11873 B 10012 ms rssi -67 heap 81234";
  CHECK(formatFailure(f, out, sizeof out) == 56 && std::strcmp(out, want) == 0);
  char small[10];
  CHECK(formatFailure(f, small, sizeof small) == 9 && std::strlen(small) == 9);
  char untouched[4] = {'a', 'b', 'c', 'd'};
  CHECK(formatFailure(f, untouched, 0) == 0 && untouched[0] == 'a');
}

int main() {
  testReader();
  testPackBits();
  testRecovery();
  if (failures == 0) std::printf("all passed\n");
  return failures == 0 ? 0 : 1;
}
