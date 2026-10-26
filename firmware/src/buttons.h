// The two buttons, Move and Accept, with short and long press.
#pragma once

#include <Arduino.h>

namespace buttons {

enum class Event { None, MoveShort, MoveLong, AcceptShort, AcceptLong };

void begin();

// Called on every turn of loop(). Returns at most one event per call.
Event poll();

const char *name(Event e);

}  // namespace buttons
