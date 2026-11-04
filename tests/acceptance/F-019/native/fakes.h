// FakeClock and FakeSource for the reader tests (F-019, CA1 to CA10).
#pragma once

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "http_reader.h"

// pause() adds 2 ms to nowMs(), as the card says.
struct FakeClock : http::Clock {
  uint32_t t = 0;
  int pauses = 0;
  uint32_t nowMs() override { return t; }
  void pause() override {
    t += 2;
    ++pauses;
  }
};

// A script of steps: bytes to deliver, "0 for t ms", then a tail (0 forever, or -1).
class FakeSource : public http::Source {
 public:
  explicit FakeSource(FakeClock &clock) : clock_(clock) {}

  FakeSource &data(const std::string &bytes) {
    steps_.push_back({Kind::Data, bytes, 0});
    return *this;
  }
  FakeSource &idle(uint32_t ms) {
    steps_.push_back({Kind::Idle, std::string(), ms});
    return *this;
  }
  // Without closed(), after the last step read() returns 0 forever.
  FakeSource &closed() {
    tailClosed_ = true;
    return *this;
  }

  uint32_t lastDataMs = 0;  // clock time of the last byte delivered
  size_t delivered = 0;

  int read(uint8_t *buf, size_t n) override {
    if (n == 0) return 0;
    for (;;) {
      if (step_ >= steps_.size()) return finish();
      Step &s = steps_[step_];
      if (s.kind == Kind::Data) {
        if (pos_ >= s.bytes.size()) {
          ++step_;
          pos_ = 0;
          continue;
        }
        const size_t k = std::min(n, s.bytes.size() - pos_);
        std::memcpy(buf, s.bytes.data() + pos_, k);
        pos_ += k;
        delivered += k;
        lastDataMs = clock_.t;
        zeroReads_ = 0;
        return static_cast<int>(k);
      }
      // Idle: returns 0 until the window (counted from the first read of the step) is over.
      if (!idleStarted_) {
        idleStarted_ = true;
        idleStart_ = clock_.t;
      }
      if (clock_.t - idleStart_ >= s.idleMs) {
        idleStarted_ = false;
        ++step_;
        continue;
      }
      return zero();
    }
  }

 private:
  enum class Kind { Data, Idle };
  struct Step {
    Kind kind;
    std::string bytes;
    uint32_t idleMs;
  };

  int finish() {
    if (tailClosed_) return -1;
    return zero();
  }
  int zero() {
    // A reader that spins on 0 without calling pause() never moves the clock: stop the test.
    if (clock_.t == lastZeroT_) {
      if (++zeroReads_ > 100000) {
        std::printf("  FAIL reader spins on read()==0 without calling Clock::pause()\n");
        std::exit(1);
      }
    } else {
      lastZeroT_ = clock_.t;
      zeroReads_ = 0;
    }
    return 0;
  }

  FakeClock &clock_;
  std::vector<Step> steps_;
  size_t step_ = 0, pos_ = 0;
  bool tailClosed_ = false, idleStarted_ = false;
  uint32_t idleStart_ = 0, lastZeroT_ = 0xFFFFFFFFu;
  int zeroReads_ = 0;
};

// A sink that keeps everything it receives and can refuse to take more than `cap`.
struct CollectSink : http::Sink {
  std::string got;
  size_t cap = static_cast<size_t>(-1);
  size_t calls = 0;
  bool write(const uint8_t *d, size_t n) override {
    ++calls;
    if (got.size() + n > cap) return false;
    got.append(reinterpret_cast<const char *>(d), n);
    return true;
  }
};

inline std::string response(const std::string &statusLine, const std::string &headers,
                            const std::string &body = std::string()) {
  return statusLine + "\r\n" + headers + "\r\n" + body;
}
