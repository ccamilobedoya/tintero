// CRC-32 (the zlib one), to check Tintero images.
#pragma once

#include <stddef.h>
#include <stdint.h>

// CRC-32 of len bytes: polynomial 0xEDB88320 (reflected), initial value 0xFFFFFFFF
// and complement at the end. It gives the same as zlib.crc32() in Python.
uint32_t crc32(const uint8_t *data, size_t len);
