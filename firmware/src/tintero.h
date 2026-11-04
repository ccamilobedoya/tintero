// Tintero client: HTTPS with a per-device certificate.
//
// It talks only to the Tintero server, on port 443, with mutual TLS: the ESP32
// checks the server certificate against the Tintero CA, and the server checks
// the certificate of the device. Every request carries the v1 protocol headers.
// The request is written by hand on a NetworkClientSecure and the answer is read
// with http::readResponse, which has an idle deadline and a total deadline: no
// wait lasts forever.
//
// The host name, the device id and the PEM texts come only from
// include/tintero_certs.h, which `npm run pki -- firmware` generates.
#pragma once

#include <Arduino.h>

#include "http_reader.h"

namespace tintero {

struct Response {
  // HTTP code (200, 404…) when the answer was read whole (or was too large); -1 if
  // it failed before (network, TLS, deadline, bad answer): see `outcome`.
  int status = 0;
  size_t length = 0;         // bytes of the body delivered
  bool tooLarge = false;     // the body announced is larger than what fits: not read
  uint32_t retryAfterS = 0;  // Retry-After header (0…3600); 0 if absent
  http::Outcome outcome = http::Outcome::Ok;
};

// Prepares the TLS client with the CA and the certificate of this device.
void begin();

// The id of this device ("p1"…), as written in the generated certificates file.
const char *deviceId();

// GET to a path of the server (e.g. "/api/v1/index"). The body is copied into
// buf, up to cap bytes; if the server announces more, it is not read.
Response get(const char *path, uint8_t *buf, size_t cap);

// POST with a JSON body (e.g. "/api/v1/actions"); the answer works as in get().
Response post(const char *path, const uint8_t *body, size_t bodyLen, uint8_t *buf, size_t cap);

// GET of an image: the body goes through `sink` (up to maxBody bytes), with the
// longer deadline of images.
Response getInto(const char *path, http::Sink &sink, size_t maxBody);

// The view the panel shows: it goes in the Tintero-View header of every request
// (empty = not sent). The server draws that one first and returns it as current.
void setView(const char *viewId);

// Closes the connection. Inside a wake-up it is reused (only if the last answer
// ended well); at the end, it is closed.
void end();

}  // namespace tintero
