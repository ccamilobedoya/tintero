// F-019 CA15 and CA16: backoffMs and formatFailure (firmware/src/recovery.h).
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>

#include "mini.h"
#include "recovery.h"

TEST(ca15_backoff) {
  CHECK_EQ(backoffMs(0), 0);
  CHECK_EQ(backoffMs(1), 30000);
  CHECK_EQ(backoffMs(2), 60000);
  CHECK_EQ(backoffMs(3), 120000);
  CHECK_EQ(backoffMs(4), 240000);
  CHECK_EQ(backoffMs(5), 480000);
  CHECK_EQ(backoffMs(6), 900000);
  CHECK_EQ(backoffMs(7), 900000);
  CHECK_EQ(backoffMs(100), 900000);
  CHECK_EQ(backoffMs(UINT32_MAX), 900000);
}

TEST(ca16_format_failure) {
  const Failure f = {"image", "stalled", 20000, 11873, 10012, -67, 81234};
  const char *want = "image stalled 20000/11873 B 10012 ms rssi -67 heap 81234";

  char out[256];
  std::memset(out, 'Z', sizeof out);
  const size_t n = formatFailure(f, out, sizeof out);
  CHECK_EQ(n, 56);
  CHECK(std::strcmp(out, want) == 0);
  CHECK_EQ(std::strlen(out), n);

  // Small buffer: cap − 1 characters and the terminator.
  char small[16];
  std::memset(small, 'Z', sizeof small);
  const size_t m = formatFailure(f, small, 10);
  CHECK_EQ(m, 9);
  CHECK(std::strncmp(small, want, 9) == 0);
  CHECK_EQ(small[9], '\0');
  CHECK_EQ(small[10], 'Z');  // nothing past cap

  // cap 0: returns 0 and writes nothing.
  char guard[4] = {'Z', 'Z', 'Z', 'Z'};
  CHECK_EQ(formatFailure(f, guard, 0), 0);
  CHECK(guard[0] == 'Z' && guard[1] == 'Z' && guard[2] == 'Z' && guard[3] == 'Z');
}

TEST(ca16_format_failure_other_values_and_limits) {
  const Failure g = {"zones", "bad-header", 0, 865, 3, 0, 0};
  char out[256];
  const size_t n = formatFailure(g, out, sizeof out);
  CHECK(std::strcmp(out, "zones bad-header 0/865 B 3 ms rssi 0 heap 0") == 0);
  CHECK_EQ(n, std::strlen(out));

  // At most 200 characters, always terminated, even with an absurdly long outcome.
  const std::string longName(400, 'x');
  const Failure h = {"log", longName.c_str(), 4294967295u, 4294967295u, 4294967295u, -100, 4294967295u};
  char big[1024];
  std::memset(big, 'Z', sizeof big);
  const size_t k = formatFailure(h, big, sizeof big);
  CHECK(k <= 200);
  CHECK_EQ(std::strlen(big), k);

  // Exactly the length: cap = n + 1 keeps everything; cap = n drops the last character.
  const Failure f = {"image", "stalled", 20000, 11873, 10012, -67, 81234};
  char exact[57];
  CHECK_EQ(formatFailure(f, exact, 57), 56);
  CHECK(std::strcmp(exact, "image stalled 20000/11873 B 10012 ms rssi -67 heap 81234") == 0);
  char shorter[56];
  CHECK_EQ(formatFailure(f, shorter, 56), 55);
  CHECK_EQ(shorter[55], '\0');
}
