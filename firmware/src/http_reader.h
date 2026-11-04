// HTTP/1.1 response reader with deadlines. No Arduino: it runs on the PC in tests.
//
// It reads the status line, the headers and the body from a Source, never waits
// more than `idleMs` without a byte nor more than `totalMs` in all, and caps every
// size before using it (header line, header count, header block, body).
#pragma once

#include <cstddef>
#include <cstdint>
#include <cstring>

namespace http {

struct Source {
  // >0 bytes read, 0 nothing yet, <0 closed or error.
  virtual int read(uint8_t *buf, size_t n) = 0;
};

struct Clock {
  virtual uint32_t nowMs() = 0;
  virtual void pause() = 0;  // ~2 ms; on the device it also feeds the watchdog
};

struct Sink {
  virtual bool write(const uint8_t *data, size_t n) = 0;  // false = cannot go on
};

// A sink that copies into a fixed buffer; it refuses what does not fit.
struct BufferSink : Sink {
  BufferSink(uint8_t *buf, size_t cap) : buf_(buf), cap_(cap) {}
  bool write(const uint8_t *data, size_t n) override;
  size_t length() const { return len_; }

 private:
  uint8_t *buf_;
  size_t cap_;
  size_t len_ = 0;
};

struct Limits {
  uint32_t idleMs;   // no byte for this long → Stalled
  uint32_t totalMs;  // since the call → Timeout
  size_t maxBody;
};

enum class Outcome { Ok, Stalled, Timeout, Closed, TooLarge, BadHeader, BadBody };

const char *outcomeName(Outcome o);

struct Result {
  Outcome outcome;
  int status;            // 0 if no valid status line arrived
  size_t bodyBytes;      // body bytes handed to the Sink
  uint32_t retryAfterS;  // 0…3600
  bool reusable;         // the connection may carry another request
};

Result readResponse(Source &src, Clock &clock, const Limits &limits, Sink &sink);

}  // namespace http
