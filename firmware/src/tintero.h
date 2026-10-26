// Tintero client: HTTPS with a per-device certificate.
//
// It talks only to the Tintero server, on port 443, with mutual TLS: the ESP32
// checks the server certificate against the Tintero CA, and the server checks
// the certificate of the device. Every request carries the v1 protocol headers
// and the body of the answer is kept in a fixed-size buffer, never more.
//
// The host name, the device id and the PEM texts come only from
// include/tintero_certs.h, which `npm run pki -- firmware` generates.
#pragma once

#include <Arduino.h>

namespace tintero {

struct Response {
  int status = 0;            // HTTP code (200, 404…); negative if it failed earlier (network, TLS, time)
  size_t length = 0;         // bytes of the body kept in the buffer
  bool tooLarge = false;     // the body did not fit in the buffer: it was dropped whole
  uint32_t retryAfterS = 0;  // Retry-After header (with 429 and 503); 0 if absent
};

// Prepares the TLS client with the CA and the certificate of this device.
void begin();

// The id of this device ("p1"…), as written in the generated certificates file.
const char *deviceId();

// GET to a path of the server (e.g. "/api/v1/index"). The body is copied into
// buf, up to cap bytes; if the server announces or sends more, it is dropped.
Response get(const char *path, uint8_t *buf, size_t cap);

// POST with a JSON body (e.g. "/api/v1/actions"); the answer works as in get().
Response post(const char *path, const uint8_t *body, size_t bodyLen, uint8_t *buf, size_t cap);

// The view the panel shows: it goes in the Tintero-View header of every request
// (empty = not sent). The server draws that one first and returns it as current.
void setView(const char *viewId);

// Closes the connection. Inside a wake-up it is reused; at the end, it is closed.
void end();

}  // namespace tintero
