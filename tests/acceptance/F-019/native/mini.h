// Minimal test registry for the native F-019 tests (no framework in the gcc image).
#pragma once

#include <cstdio>
#include <vector>

struct TestCase {
  const char *name;
  void (*fn)();
};
inline std::vector<TestCase> &registry() {
  static std::vector<TestCase> r;
  return r;
}
inline int &failures() {
  static int f = 0;
  return f;
}
struct Registrar {
  Registrar(const char *n, void (*f)()) { registry().push_back({n, f}); }
};

#define TEST(name)                                \
  static void name();                             \
  static Registrar registrar_##name(#name, name); \
  static void name()

#define CHECK(cond)                                                 \
  do {                                                              \
    if (!(cond)) {                                                  \
      std::printf("  FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); \
      ++failures();                                                 \
    }                                                               \
  } while (0)

#define CHECK_EQ(a, b)                                                                    \
  do {                                                                                    \
    const long long va_ = static_cast<long long>(a), vb_ = static_cast<long long>(b);     \
    if (va_ != vb_) {                                                                     \
      std::printf("  FAIL %s:%d: %s == %s (got %lld, expected %lld)\n", __FILE__, __LINE__, \
                  #a, #b, va_, vb_);                                                      \
      ++failures();                                                                       \
    }                                                                                     \
  } while (0)

#define CHECK_RANGE(v, lo, hi)                                                             \
  do {                                                                                     \
    const long long vv_ = static_cast<long long>(v);                                       \
    if (vv_ < static_cast<long long>(lo) || vv_ > static_cast<long long>(hi)) {            \
      std::printf("  FAIL %s:%d: %s in [%lld, %lld] (got %lld)\n", __FILE__, __LINE__, #v, \
                  static_cast<long long>(lo), static_cast<long long>(hi), vv_);            \
      ++failures();                                                                        \
    }                                                                                      \
  } while (0)
