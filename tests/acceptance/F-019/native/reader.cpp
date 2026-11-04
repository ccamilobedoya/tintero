// F-019 CA1 to CA10: the response reader (firmware/src/http_reader.h).
#include <algorithm>
#include <cstring>
#include <string>

#include "fakes.h"
#include "mini.h"

namespace {

using http::Limits;
using http::Outcome;
using http::Result;

std::string pattern(size_t n, unsigned seed = 1) {
  std::string s(n, '\0');
  unsigned x = seed * 2654435761u + 12345u;
  for (size_t i = 0; i < n; i++) {
    x = x * 1664525u + 1013904223u;
    s[i] = static_cast<char>(x >> 24);
  }
  return s;
}

std::string ok200(size_t len, const std::string &extra = std::string()) {
  return "HTTP/1.1 200 OK\r\nContent-Length: " + std::to_string(len) + "\r\n" + extra + "\r\n";
}

// Runs the reader over a whole response delivered at once, then 0 forever (or closed).
Result runWhole(const std::string &bytes, Limits lim, CollectSink &sink, bool closeAfter = false) {
  FakeClock clock;
  FakeSource src(clock);
  src.data(bytes);
  if (closeAfter) src.closed();
  return http::readResponse(src, clock, lim, sink);
}

const Limits kSmall{10000, 30000, 4096};
const Limits kBig{10000, 30000, 48000};

}  // namespace

TEST(ca1_image_stalls) {
  FakeClock clock;
  FakeSource src(clock);
  src.data(ok200(48000)).data(pattern(20000));
  CollectSink sink;
  const Result r = http::readResponse(src, clock, Limits{10000, 30000, 48000}, sink);
  CHECK_EQ(r.outcome, Outcome::Stalled);
  CHECK_EQ(r.status, 200);
  CHECK_EQ(r.bodyBytes, 20000);
  CHECK(!r.reusable);
  CHECK_RANGE(clock.nowMs() - src.lastDataMs, 10000, 10010);
  CHECK(clock.pauses > 0);
}

TEST(ca2_drip_hits_total_deadline) {
  FakeClock clock;
  clock.t = 5000;  // the deadline counts from the call, not from time 0
  FakeSource src(clock);
  src.data(ok200(48000));
  for (int i = 0; i < 400; i++) src.data("x").idle(100);
  CollectSink sink;
  const uint32_t start = clock.nowMs();
  const Result r = http::readResponse(src, clock, Limits{10000, 30000, 48000}, sink);
  CHECK_EQ(r.outcome, Outcome::Timeout);
  CHECK_RANGE(clock.nowMs() - start, 30000, 30110);
  CHECK(r.bodyBytes > 100);  // it did receive the drops
  CHECK(!r.reusable);
}

TEST(ca3_headers_never_end) {
  FakeClock clock;
  FakeSource src(clock);
  src.data("HTTP/1.1 200 OK\r\n");
  CollectSink sink;
  const Result r = http::readResponse(src, clock, Limits{10000, 30000, 48000}, sink);
  CHECK_EQ(r.outcome, Outcome::Stalled);
  CHECK_EQ(r.bodyBytes, 0);
  CHECK_RANGE(clock.nowMs(), 10000, 10010);
}

TEST(ca4_closed_before_the_end) {
  FakeClock clock;
  FakeSource src(clock);
  src.data(ok200(5000)).data(pattern(1000)).closed();
  CollectSink sink;
  const Result r = http::readResponse(src, clock, kBig, sink);
  CHECK_EQ(r.outcome, Outcome::Closed);
  CHECK_EQ(r.bodyBytes, 1000);
  CHECK(!r.reusable);
}

TEST(ca5_too_large_without_reading_the_body) {
  FakeClock clock;
  FakeSource src(clock);
  src.data(ok200(70000)).data(pattern(2000));
  CollectSink sink;
  const Result r = http::readResponse(src, clock, Limits{10000, 30000, 48000}, sink);
  CHECK_EQ(r.outcome, Outcome::TooLarge);
  CHECK_EQ(sink.calls, 0);
  CHECK_EQ(sink.got.size(), 0);
  CHECK_EQ(r.bodyBytes, 0);
}

TEST(ca6_bad_headers) {
  const std::string body = "hello";
  struct Case {
    const char *name;
    std::string bytes;
  };
  std::string many;  // 49 headers in total, with Content-Length
  for (int i = 0; i < 48; i++) many += "X-" + std::to_string(i) + ": v\r\n";
  std::string many47;  // 48 headers in total, with Content-Length
  for (int i = 0; i < 47; i++) many47 += "X-" + std::to_string(i) + ": v\r\n";
  // A header line of exactly N bytes (without the CRLF).
  auto line = [](size_t n) { return "X-A: " + std::string(n - 5, 'a') + "\r\n"; };
  std::string bigBlock;  // 10 lines of 500 bytes: more than 4 096 in all
  for (int i = 0; i < 10; i++) {
    bigBlock += "X-" + std::to_string(i) + ": " + std::string(500 - 5, 'b') + "\r\n";
  }
  const Case bad[] = {
      {"line of 513 bytes", ok200(5, line(513)) + body},
      {"49 headers", ok200(5, many) + body},
      {"block over 4096", ok200(5, bigBlock) + body},
      {"200 without Content-Length", "HTTP/1.1 200 OK\r\n\r\n" + body},
      {"Transfer-Encoding chunked", ok200(5, "Transfer-Encoding: chunked\r\n") + body},
      {"Transfer-Encoding identity", ok200(5, "transfer-encoding: identity\r\n") + body},
      {"HTTP/2", "HTTP/2 200\r\nContent-Length: 5\r\n\r\n" + body},
      {"ICY", "ICY 200 OK\r\nContent-Length: 5\r\n\r\n" + body},
  };
  for (const Case &c : bad) {
    CollectSink sink;
    const Result r = runWhole(c.bytes, kSmall, sink, true);
    if (r.outcome != Outcome::BadHeader) std::printf("  case: %s\n", c.name);
    CHECK_EQ(r.outcome, Outcome::BadHeader);
  }
  const Case good[] = {
      {"line of 512 bytes", ok200(5, line(512)) + body},
      {"48 headers", ok200(5, many47) + body},
  };
  for (const Case &c : good) {
    CollectSink sink;
    const Result r = runWhole(c.bytes, kSmall, sink, true);
    if (r.outcome != Outcome::Ok) std::printf("  case: %s\n", c.name);
    CHECK_EQ(r.outcome, Outcome::Ok);
    CHECK_EQ(r.status, 200);
    CHECK(sink.got == body);
  }
}

TEST(ca7_retry_after) {
  struct Case {
    const char *header;
    uint32_t want;
  };
  const Case cases[] = {
      {"Retry-After: 7\r\n", 7},          {"Retry-After: 99999999\r\n", 3600},
      {"Retry-After: abc\r\n", 0},        {"Retry-After: -5\r\n", 0},
      {"", 0},                            {"retry-after: 12\r\n", 12},
      {"Retry-After: 3600\r\n", 3600},    {"Retry-After: 3601\r\n", 3600},
      {"Retry-After: 7s\r\n", 0},
  };
  for (const Case &c : cases) {
    CollectSink sink;
    const std::string bytes =
        std::string("HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n") + c.header + "\r\n";
    const Result r = runWhole(bytes, kSmall, sink);
    if (r.retryAfterS != c.want) std::printf("  header: %s\n", c.header);
    CHECK_EQ(r.outcome, Outcome::Ok);
    CHECK_EQ(r.status, 503);
    CHECK_EQ(r.retryAfterS, c.want);
  }
}

TEST(ca8_reusable) {
  CollectSink s1;
  Result r = runWhole(ok200(3) + "abc", kSmall, s1);
  CHECK_EQ(r.outcome, Outcome::Ok);
  CHECK(r.reusable);

  CollectSink s2;
  r = runWhole(ok200(3, "Connection: close\r\n") + "abc", kSmall, s2);
  CHECK_EQ(r.outcome, Outcome::Ok);
  CHECK(!r.reusable);

  CollectSink s3;
  r = runWhole(ok200(3, "connection: Close\r\n") + "abc", kSmall, s3);
  CHECK_EQ(r.outcome, Outcome::Ok);
  CHECK(!r.reusable);

  CollectSink s4;
  r = runWhole("HTTP/1.0 200 OK\r\nContent-Length: 3\r\n\r\nabc", kSmall, s4);
  CHECK_EQ(r.outcome, Outcome::Ok);
  CHECK_EQ(r.status, 200);
  CHECK(!r.reusable);

  // A failure is never reusable.
  CollectSink s5;
  r = runWhole(ok200(10) + "abc", kSmall, s5, true);
  CHECK(r.outcome != Outcome::Ok);
  CHECK(!r.reusable);
}

TEST(ca9_sink_fills_up) {
  uint8_t buf[100];
  http::BufferSink sink(buf, sizeof buf);
  FakeClock clock;
  FakeSource src(clock);
  src.data(ok200(865) + pattern(865));
  const Result r = http::readResponse(src, clock, kSmall, sink);
  CHECK_EQ(r.outcome, Outcome::BadBody);
  CHECK(sink.length() <= 100);
}

TEST(ca10_normal_in_pieces) {
  const std::string zones = pattern(865, 7);
  const std::string whole = ok200(865, "Content-Type: application/json\r\n") + zones;
  FakeClock clock;
  FakeSource src(clock);
  const size_t sizes[] = {1, 7, 1436};
  size_t pos = 0, i = 0;
  while (pos < whole.size()) {
    const size_t k = std::min(sizes[i++ % 3], whole.size() - pos);
    src.data(whole.substr(pos, k));
    pos += k;
  }
  uint8_t buf[1024];
  http::BufferSink sink(buf, sizeof buf);
  const Result r = http::readResponse(src, clock, kSmall, sink);
  CHECK_EQ(r.outcome, Outcome::Ok);
  CHECK_EQ(r.status, 200);
  CHECK_EQ(r.bodyBytes, 865);
  CHECK_EQ(sink.length(), 865);
  CHECK(std::memcmp(buf, zones.data(), 865) == 0);
  CHECK(r.reusable);
}

TEST(ca10_empty_bodies) {
  // 204 and 304: no Content-Length, the source then gives nothing (no waiting for a body).
  const char *statuses[] = {"HTTP/1.1 204 No Content\r\n\r\n", "HTTP/1.1 304 Not Modified\r\n\r\n"};
  for (const char *s : statuses) {
    CollectSink sink;
    FakeClock clock;
    FakeSource src(clock);
    src.data(s);
    const Result r = http::readResponse(src, clock, kSmall, sink);
    CHECK_EQ(r.outcome, Outcome::Ok);
    CHECK_EQ(r.bodyBytes, 0);
    CHECK_EQ(sink.got.size(), 0);
    CHECK(clock.nowMs() < 1000);
  }
  CollectSink s404;
  Result r = runWhole("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n", kSmall, s404);
  CHECK_EQ(r.outcome, Outcome::Ok);
  CHECK_EQ(r.status, 404);
  CHECK_EQ(r.bodyBytes, 0);

  // Another code without Content-Length: empty body, connection not reused.
  CollectSink s500;
  r = runWhole("HTTP/1.1 500 Oops\r\n\r\n", kSmall, s500);
  CHECK_EQ(r.outcome, Outcome::Ok);
  CHECK_EQ(r.status, 500);
  CHECK_EQ(r.bodyBytes, 0);
  CHECK(!r.reusable);
}

TEST(reader_deadlines_use_unsigned_time) {
  // Case 17 of the card: millis() wrapping around must not break the deadlines.
  FakeClock clock;
  clock.t = 0xFFFFFFFFu - 3000;
  FakeSource src(clock);
  src.data(ok200(48000)).data(pattern(100));
  CollectSink sink;
  const Result r = http::readResponse(src, clock, Limits{10000, 30000, 48000}, sink);
  CHECK_EQ(r.outcome, Outcome::Stalled);
  CHECK_EQ(r.bodyBytes, 100);
}

TEST(outcome_names) {
  CHECK(std::strcmp(http::outcomeName(Outcome::Ok), "ok") == 0);
  CHECK(std::strcmp(http::outcomeName(Outcome::Stalled), "stalled") == 0);
  CHECK(std::strcmp(http::outcomeName(Outcome::Timeout), "timeout") == 0);
  CHECK(std::strcmp(http::outcomeName(Outcome::Closed), "closed") == 0);
  CHECK(std::strcmp(http::outcomeName(Outcome::TooLarge), "too-large") == 0);
  CHECK(std::strcmp(http::outcomeName(Outcome::BadHeader), "bad-header") == 0);
  CHECK(std::strcmp(http::outcomeName(Outcome::BadBody), "bad-body") == 0);
}
