// The focus ring over a raw1 image.
//
// It lives apart from panel.cpp because it does not use GxEPD2: that way it can
// also be tested on a PC.

#include "panel.h"

namespace panel {

void toggleRing(uint8_t *raw1, const Zone &zone, const FocusStyle &style, bool solid) {
  constexpr size_t STRIDE = WIDTH / 8;  // bytes per row
  const uint16_t ring = style.ring;
  const uint16_t dash = solid ? 0 : style.dash;
  for (uint16_t dy = 0; dy < zone.h; dy++) {
    const bool horizontal = dy < ring || dy >= zone.h - ring;  // top or bottom strip
    for (uint16_t dx = 0; dx < zone.w; dx++) {
      const bool vertical = dx < ring || dx >= zone.w - ring;  // left or right strip
      if (!horizontal && !vertical) continue;
      // Dotted: in the top and bottom strips the runs of columns count; in the
      // side strips, the runs of rows. Only the even runs are inverted.
      if (dash > 0 && ((horizontal ? dx : dy) / dash) % 2 != 0) continue;
      const uint16_t x = zone.x + dx;
      const uint16_t y = zone.y + dy;
      raw1[y * STRIDE + x / 8] ^= 0x80 >> (x % 8);  // most significant bit = leftmost pixel
    }
  }
}

}  // namespace panel
