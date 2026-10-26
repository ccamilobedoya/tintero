// The two buttons, Move and Accept, with short and long press.
//
// Wiring: each button between its pin and 3V3; the pin with the internal
// pull-down (about 45 kΩ to ground). Released, the pull-down holds the pin at
// 0 V → LOW; pressed, the button ties it to 3V3 → HIGH. GPIO32 and GPIO33 were
// chosen because they are RTC pins: they can wake the ESP32 from deep sleep.
//
// Two layers:
// 1. Debounce: the contacts of a push button bounce for a few milliseconds when
//    closing and opening (they open and close several times). A change only
//    counts if the pin stays the same for DEBOUNCE_MS in a row.
// 2. A state machine with millis(), no delay(): Released → Pressed → (if held
//    for LONG_MS) HeldLong. Releasing from Pressed gives the short press; the
//    long one fires as soon as LONG_MS is reached, without waiting for release.

#include "buttons.h"

namespace buttons {
namespace {

constexpr int PIN_MOVE = 32;
constexpr int PIN_ACCEPT = 33;
constexpr uint32_t DEBOUNCE_MS = 30;
constexpr uint32_t LONG_MS = 700;

enum class State : uint8_t { Released, Pressed, HeldLong };

struct Button {
  uint8_t pin;
  Event shortEvent;
  Event longEvent;
  bool raw = false;         // the last reading of the pin, bounces included
  bool stable = false;      // the reading once filtered
  uint32_t rawSince = 0;    // since when raw has not changed
  State state = State::Released;
  uint32_t pressedAt = 0;
};

Button move{PIN_MOVE, Event::MoveShort, Event::MoveLong};
Button accept{PIN_ACCEPT, Event::AcceptShort, Event::AcceptLong};

Event update(Button &b, uint32_t now) {
  // 1. Debounce.
  const bool reading = digitalRead(b.pin) == HIGH;  // pressed = HIGH (pull-down)
  if (reading != b.raw) {
    b.raw = reading;
    b.rawSince = now;
  }
  if (b.raw != b.stable && now - b.rawSince >= DEBOUNCE_MS) b.stable = b.raw;

  // 2. State machine.
  switch (b.state) {
    case State::Released:
      if (b.stable) {
        b.state = State::Pressed;
        b.pressedAt = now;
      }
      break;
    case State::Pressed:
      if (!b.stable) {
        b.state = State::Released;
        return b.shortEvent;
      }
      if (now - b.pressedAt >= LONG_MS) {
        b.state = State::HeldLong;
        return b.longEvent;
      }
      break;
    case State::HeldLong:
      if (!b.stable) b.state = State::Released;  // the long press already fired: releasing does nothing
      break;
  }
  return Event::None;
}

}  // namespace

void begin() {
  pinMode(PIN_MOVE, INPUT_PULLDOWN);
  pinMode(PIN_ACCEPT, INPUT_PULLDOWN);
}

Event poll() {
  const uint32_t now = millis();
  const Event e = update(move, now);
  if (e != Event::None) return e;
  return update(accept, now);
}

const char *name(Event e) {
  switch (e) {
    case Event::MoveShort: return "Move short";
    case Event::MoveLong: return "Move long";
    case Event::AcceptShort: return "Accept short";
    case Event::AcceptLong: return "Accept long";
    default: return "none";
  }
}

}  // namespace buttons
