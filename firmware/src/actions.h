// The action queue (Accept on a zone) and how it is sent.
#pragma once

#include <Arduino.h>

namespace actions {

constexpr size_t MAX_ACTIONS = 8;  // cap of protocol v1

// Adds an action to the queue, with a new id and the current time. Returns false
// if the queue is full (8 actions not yet sent).
bool add(const char *view, const char *zone, bool open);

size_t pending();

struct FlushResult {
  bool sent = false;          // the server answered (200)
  bool indexChanged = false;  // index_changed: the index must be requested again
  bool stale = false;         // some action no longer applies (the zone or the view changed)
};

// Sends the whole queue in one POST /api/v1/actions (over the open connection) and
// removes from the queue each action the server answered (applied, duplicate or
// stale). If there was no answer, the queue stays as it was for the next time.
FlushResult flush();

}  // namespace actions
