// Tintero · ESP32 firmware: focus on the zones, and actions.
//
// It starts by itself as soon as USB power arrives (from a PC or a charger): it
// does not wait for the serial monitor. On USB it never sleeps: loop() serves the
// buttons and asks for the index every next_wake_s seconds.
//
// Buttons (firmware/README.md, section 9):
//   Move short    → focus on the next zone (the first time, zone 1)
//   Move long     → the next view (no focus)
//   Accept short  → the action of the focused zone (toggle: mark done; open: open it)
//   Accept long   → in a detail, go back; in a view, refresh now

#include <Arduino.h>

#include "actions.h"
#include "buttons.h"
#include "crc32.h"
#include "index.h"
#include "net.h"
#include "panel.h"
#include "tintero.h"
#include "zones.h"

constexpr uint32_t RETRY_MS = 30000;      // wait after a network failure
constexpr uint32_t STALE_MS = 5000;       // 409: the index changed in the meantime
constexpr uint32_t DEFAULT_WAKE_S = 60;   // while there is no valid index
constexpr uint32_t IDLE_MS = 30000;       // still for this long → cleanup (ADR-0050)
constexpr uint16_t MAX_PARTIALS = 10;     // partial refreshes before a cleanup full refresh
constexpr size_t MAX_INDEX_BYTES = 2048;  // caps of the contract
constexpr size_t MAX_ZONES_BYTES = 4096;

uint8_t netBuf[MAX_ZONES_BYTES + 1];  // index or zones just downloaded (+1 for the '\0')
uint8_t image[panel::RAW1_BYTES];     // what the panel shows, ring included
Index lastIndex;
Zones zones;              // the zones of the view being shown
bool haveZones = false;
bool imageValid = false;  // `image` holds a complete, checked image
char shownView[17] = "";  // id and hash of what the panel shows
char shownHash[17] = "";

int focus = -1;           // index of the focused zone; -1 = no focus
bool ringSolid = false;   // the ring in place: solid (sending) or dotted
bool slowNext = false;    // full_refresh: the next full refresh is the slow one

uint32_t lastSync = 0;
uint32_t waitMs = 0;      // the first sync happens right away
uint32_t lastButton = 0;

const View *findView(const char *id) {
  for (size_t i = 0; i < lastIndex.viewCount; i++) {
    if (strcmp(lastIndex.views[i].id, id) == 0) return &lastIndex.views[i];
  }
  return nullptr;
}

// ---------- The focus ----------

// Puts or removes the ring on the image (in RAM only; flipping again removes it).
void flipRing(int zoneIndex, bool solid) {
  panel::toggleRing(image, zones.zones[zoneIndex], zones.focus, solid);
}

// Removes the ring from the image in RAM, without touching the panel (before a
// full refresh or before changing the image).
void dropFocus() {
  if (focus >= 0) flipRing(focus, ringSolid);
  focus = -1;
}

void showImage() {
  if (!imageValid) return;  // never push a half-finished download
  panel::showFull(image, slowNext);
  slowNext = false;
}

// Move short: the ring goes to the next zone, with two partial refreshes (remove
// it from the old one and put it on the new one).
void moveFocus() {
  if (!haveZones || zones.count == 0) {
    Serial.println("  this view has no zones");
    return;
  }
  const int old = focus;
  const int next = (focus + 1) % static_cast<int>(zones.count);  // from -1, zone 0
  if (old >= 0) {
    flipRing(old, ringSolid);
    panel::refreshZone(image, zones.zones[old]);
  }
  focus = next;
  ringSolid = false;
  flipRing(focus, false);
  panel::refreshZone(image, zones.zones[focus]);

  if (panel::partialsSinceFull() >= MAX_PARTIALS) {
    Serial.println("Cleanup: partial limit reached, fast full refresh with the focus in place");
    panel::showFull(image);
  }
}

// Switches the ring of the focused zone between dotted and solid.
void setRingSolid(bool solid) {
  if (focus < 0 || ringSolid == solid) return;
  flipRing(focus, ringSolid);
  flipRing(focus, solid);
  ringSolid = solid;
  panel::refreshZone(image, zones.zones[focus]);
}

// ---------- Downloading and showing a view ----------

// Downloads the image and the zones of a view over the open connection. If all
// goes well, it leaves the new image in `image` (not shown yet) and returns 0;
// if not, how long to wait before retrying.
uint32_t fetchView(const View &view) {
  dropFocus();  // the old image no longer matters: the ring is put back afterwards

  char path[64];
  snprintf(path, sizeof path, "/api/v1/views/%s/image?h=%s", view.id, view.hash);
  const tintero::Response r = tintero::get(path, image, sizeof image);
  // From here `image` may be half written: if anything fails, what was shown is
  // forgotten so the next check downloads it again, and with no zones there is no focus.
  imageValid = false;
  if (r.status != 200 || r.length != view.bytes) {
    shownHash[0] = '\0';
    haveZones = false;
    if (r.status == 200) Serial.printf("Incomplete image: %u bytes\n", (unsigned)r.length);
    return r.status == 409 ? STALE_MS : RETRY_MS;
  }
  const uint32_t crc = crc32(image, r.length);
  if (crc != view.crc32) {
    Serial.printf("CRC-32 mismatch: %08lx, the index says %08lx\n", (unsigned long)crc,
                  (unsigned long)view.crc32);
    shownHash[0] = '\0';
    haveZones = false;
    return RETRY_MS;
  }

  imageValid = true;

  snprintf(path, sizeof path, "/api/v1/views/%s/zones?h=%s", view.id, view.hash);
  const tintero::Response z = tintero::get(path, netBuf, MAX_ZONES_BYTES);
  haveZones = z.status == 200 && !z.tooLarge &&
              parseZones(netBuf, z.length, view.id, view.hash, panel::WIDTH, panel::HEIGHT, zones);
  if (!haveZones) Serial.println("No zones: the image is shown, but without focus");

  strcpy(shownView, view.id);
  strcpy(shownHash, view.hash);
  tintero::setView(shownView);
  return 0;
}

// Asks for the index over the open connection. On 503 it waits Retry-After and
// retries once. Returns 0 if a valid index was left in lastIndex.
uint32_t fetchIndex() {
  for (int attempt = 0; attempt < 2; attempt++) {
    const tintero::Response r = tintero::get("/api/v1/index", netBuf, MAX_INDEX_BYTES);
    if (r.status == 200 && !r.tooLarge) {
      netBuf[r.length] = '\0';
      if (!parseIndex(netBuf, r.length, lastIndex)) {
        Serial.println((const char *)netBuf);
        return DEFAULT_WAKE_S * 1000;
      }
      if (lastIndex.fullRefresh) slowNext = true;
      Serial.printf("Index: current=%s, %u views, next in %lu s%s\n", lastIndex.current,
                    (unsigned)lastIndex.viewCount, (unsigned long)lastIndex.nextWakeS,
                    lastIndex.fullRefresh ? ", full_refresh" : "");
      return 0;
    }
    if ((r.status == 503 || r.status == 429) && attempt == 0) {
      const uint32_t s = r.retryAfterS > 0 && r.retryAfterS <= 10 ? r.retryAfterS : 2;
      Serial.printf("Server busy: retrying in %lu s\n", (unsigned long)s);
      delay(s * 1000);
      continue;
    }
    if (r.status == 404) Serial.println("Empty 404: this device is not authorized");
    if (r.status == 429 || r.status == 503) {
      return (r.retryAfterS > 0 ? r.retryAfterS : 60) * 1000;
    }
    return r.status == 404 ? DEFAULT_WAKE_S * 1000 : RETRY_MS;
  }
  return RETRY_MS;
}

// One "wake-up": send the pending actions, ask for the index and show the current
// view if it changed. The server returns as current the view reported in
// Tintero-View (or the detail that was just opened).
uint32_t syncOnce() {
  if (!net::ensureOnline()) return RETRY_MS;
  if (actions::pending() > 0) actions::flush();

  uint32_t retry = fetchIndex();
  if (retry == 0) {
    const View *view = findView(lastIndex.current);  // parseIndex guarantees it exists
    if (!lastIndex.panelOk) {
      Serial.println("The server thinks the panel is a different one: nothing new is shown");
    } else if (strcmp(view->id, shownView) != 0 || strcmp(view->hash, shownHash) != 0) {
      retry = fetchView(*view);
      tintero::end();  // close before the refresh, which takes seconds
      if (retry == 0) showImage();  // new or changed view: no focus
    } else {
      Serial.printf("View \"%s\" did not change\n", view->id);
    }
  }
  tintero::end();
  return retry != 0 ? retry : lastIndex.nextWakeS * 1000;
}

// Show another view right now (Move long, going back from a detail).
void showNow(const View &view) {
  if (!net::ensureOnline()) return;
  const uint32_t retry = fetchView(view);
  tintero::end();
  if (retry == 0) {
    showImage();
  } else {
    lastSync = millis();
    waitMs = retry;
  }
}

// ---------- Accept short: the action of the focused zone ----------

void acceptZone() {
  if (focus < 0) {
    Serial.println("  no focus: use Move short first");
    return;
  }
  const Zone &zone = zones.zones[focus];
  const int zoneIndex = focus;
  char zoneId[17];
  strcpy(zoneId, zone.id);

  setRingSolid(true);  // "sending"
  if (!actions::add(shownView, zone.id, zone.open)) {
    setRingSolid(false);
    return;
  }
  if (!net::ensureOnline()) {
    setRingSolid(false);  // offline: the action waits in the queue, with no optimistic mark
    return;
  }

  const actions::FlushResult res = actions::flush();
  if (!res.sent) {
    tintero::end();
    setRingSolid(false);
    return;
  }
  if (!res.indexChanged && !res.stale) {
    tintero::end();
    setRingSolid(false);
    return;
  }

  // "Applied": the new index (the server waits up to 2 s for it to be drawn), the
  // new image and a single fast full refresh with the ring already in place.
  uint32_t retry = fetchIndex();
  if (retry == 0 && lastIndex.panelOk) {
    const View *view = findView(lastIndex.current);
    retry = fetchView(*view);
    tintero::end();
    if (retry == 0) {
      if (!res.stale && haveZones && zones.count > 0) {
        // The same task (same id; now in "done today"), or the zone in the same
        // place if it no longer exists (the last one if there are fewer).
        focus = -1;
        for (size_t i = 0; i < zones.count; i++) {
          if (strcmp(zones.zones[i].id, zoneId) == 0) focus = static_cast<int>(i);
        }
        if (focus < 0) focus = min(zoneIndex, static_cast<int>(zones.count) - 1);
        ringSolid = false;
        flipRing(focus, false);
      }
      showImage();
    }
  }
  tintero::end();
  lastSync = millis();
  waitMs = retry != 0 ? retry : lastIndex.nextWakeS * 1000;
}

// ---------- Buttons ----------

// The next view in the order of the index, skipping details (views with a
// parent: they are entered with Accept, not with Move).
const View *nextView() {
  int start = -1;
  for (size_t i = 0; i < lastIndex.viewCount; i++) {
    if (strcmp(lastIndex.views[i].id, shownView) == 0) start = static_cast<int>(i);
  }
  for (size_t step = 1; step <= lastIndex.viewCount; step++) {
    const View &v = lastIndex.views[(start + step) % lastIndex.viewCount];
    if (v.parent[0] == '\0') return &v;
  }
  return nullptr;
}

void handleButton(buttons::Event e) {
  Serial.printf("Button: %s\n", buttons::name(e));
  lastButton = millis();
  if (lastIndex.viewCount == 0) {
    Serial.println("  no index yet");
    return;
  }
  switch (e) {
    case buttons::Event::MoveShort:
      moveFocus();
      break;
    case buttons::Event::MoveLong: {
      const View *next = nextView();
      if (next != nullptr) showNow(*next);
      break;
    }
    case buttons::Event::AcceptShort:
      acceptZone();
      break;
    case buttons::Event::AcceptLong: {
      // In a detail: go back to its parent view. In a view: refresh now.
      const View *view = findView(shownView);
      const View *parent =
          view != nullptr && view->parent[0] != '\0' ? findView(view->parent) : nullptr;
      if (parent != nullptr) {
        showNow(*parent);
      } else {
        dropFocus();
        shownHash[0] = '\0';  // force it to be shown again, even if unchanged
        waitMs = 0;
      }
      break;
    }
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.printf("Tintero ESP32 · device %s\n", tintero::deviceId());
  buttons::begin();
  panel::begin();
  tintero::begin();
}

void loop() {
  const buttons::Event e = buttons::poll();
  if (e != buttons::Event::None) handleButton(e);

  // Cleanup when idle: remove the focus and do a fast full refresh that clears
  // the ghosting of the partial refreshes (ADR-0050).
  if (imageValid && (focus >= 0 || panel::partialsSinceFull() > 0) &&
      millis() - lastButton >= IDLE_MS) {
    Serial.println("Cleanup: 30 s idle, fast full refresh without focus");
    dropFocus();
    showImage();
  }

  if (millis() - lastSync >= waitMs) {
    lastSync = millis();
    waitMs = syncOnce();
    Serial.printf("Free: %u bytes of RAM · next check in %lu s\n", (unsigned)ESP.getFreeHeap(),
                  (unsigned long)(waitMs / 1000));
  }
}
