// CRC-32 (the zlib one), to check Tintero images.
//
// The CRC treats the data as one enormous binary number and divides it by a fixed
// polynomial; the remainder of that division (32 bits) changes if any bit of the
// data changes. Here it goes bit by bit, with no table: 48 000 bytes are 384 000
// steps, a few milliseconds on the ESP32, and it avoids a 1 KB table.

#include "crc32.h"

uint32_t crc32(const uint8_t *data, size_t len) {
  uint32_t crc = 0xFFFFFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (int bit = 0; bit < 8; bit++) {
      // If the bit shifted out is 1, the polynomial is "subtracted" (XOR).
      crc = (crc >> 1) ^ (0xEDB88320 & (0u - (crc & 1)));
    }
  }
  return ~crc;
}
