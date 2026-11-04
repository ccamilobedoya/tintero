// Self-healing on the device: what to tell the server after a failure or a boot,
// and the controlled restart (at most one per hour).
//
// The notes live in RTC_NOINIT memory, so they survive a restart (also the one the
// watchdog causes) but not a power cut. They carry only the step, the result,
// numbers and the boot reason: no personal data and no keys.
#pragma once

#include <Arduino.h>

#include "http_reader.h"

namespace health {

// At boot (after Serial.begin): reads the reset reason and queues the boot notice.
void begin();

// Remembers the last failure (replacing the previous one) for the next good sync.
// `step` is index, image, zones or actions; failures of the log itself are not kept.
void noteFailure(const char *step, http::Outcome outcome, uint32_t got, uint32_t expected,
                 uint32_t ms);

// After a good sync: POST /api/v1/log with the pending notes. They are erased only
// if the server answers 204.
void sendPending();

// ESP.restart() unless one controlled restart already happened in the last hour.
// It does not return if it restarts.
void restartIfAllowed(const char *why);

}  // namespace health
