// Entry point of the native F-019 tests: runs every registered TEST.
#include <cstdio>

#include "mini.h"

int main() {
  for (const TestCase &t : registry()) {
    const int before = failures();
    std::printf("RUN  %s\n", t.name);
    t.fn();
    std::printf("%s %s\n", failures() == before ? "ok  " : "FAIL", t.name);
  }
  std::printf("%zu tests, %d failed checks\n", registry().size(), failures());
  return failures() == 0 ? 0 : 1;
}
