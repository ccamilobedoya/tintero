// PackBits decoder (see packbits.h).

#include "packbits.h"

#include <cstring>

bool PackBitsSink::write(const uint8_t *data, size_t n) {
  for (size_t i = 0; i < n; i++) {
    const uint8_t b = data[i];
    switch (state_) {
      case State::Control:
        if (b == 128) return false;
        if (b < 128) {
          count_ = static_cast<uint16_t>(b + 1);
          state_ = State::Literal;
        } else {
          count_ = static_cast<uint16_t>(257 - b);
          state_ = State::Repeat;
        }
        break;
      case State::Literal:
        if (pos_ >= rawBytes_) return false;
        out_[pos_++] = b;
        if (--count_ == 0) state_ = State::Control;
        break;
      case State::Repeat:
        if (count_ > rawBytes_ - pos_) return false;
        memset(out_ + pos_, b, count_);
        pos_ += count_;
        state_ = State::Control;
        break;
    }
  }
  return true;
}
