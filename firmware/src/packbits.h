// PackBits decoder (the pb1 image format). No Arduino: it runs on the PC in tests.
#pragma once

#include <cstddef>
#include <cstdint>

#include "http_reader.h"

// Decodes a PackBits stream straight into `out` (rawBytes long), in pieces of any
// size. Control byte n: 0…127 copy the next n+1 bytes; 129…255 repeat the next
// byte 257−n times; 128 is invalid.
class PackBitsSink : public http::Sink {
 public:
  PackBitsSink(uint8_t *out, size_t rawBytes) : out_(out), rawBytes_(rawBytes) {}

  // false on a 128 control byte or if the output would pass rawBytes.
  bool write(const uint8_t *data, size_t n) override;
  // true only if exactly rawBytes were written and no run is left pending.
  bool complete() const { return pos_ == rawBytes_ && state_ == State::Control; }

 private:
  enum class State : uint8_t { Control, Literal, Repeat };
  uint8_t *out_;
  size_t rawBytes_;
  size_t pos_ = 0;
  State state_ = State::Control;
  uint16_t count_ = 0;  // literals left, or repeat length
};
