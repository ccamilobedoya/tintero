// The action queue (Accept on a zone) and how it is sent.
//
// An action is not marked on the screen before the server applies it (no
// optimistic mark, ADR-0025): if there is no network, the ring goes back to
// dotted and the action waits in the queue. Each one carries a unique id: if it
// is sent twice (e.g. the network dropped right after sending it), the server
// applies it only once and the second answer is "duplicate".

#include "actions.h"

#include <ArduinoJson.h>
#include <esp_random.h>
#include <string.h>
#include <time.h>

#include "tintero.h"

namespace actions {
namespace {

struct Action {
  char id[17];
  char view[17];
  char zone[17];
  bool open;
  uint32_t at;
};

Action queue[MAX_ACTIONS];
size_t count = 0;

// 12 random characters from [a-z0-9] (the ESP32 hardware generator uses radio
// noise): the contract's ^[a-z0-9_-]{8,24}$.
void newId(char (&id)[17]) {
  static const char ALPHABET[] = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (int i = 0; i < 12; i++) id[i] = ALPHABET[esp_random() % 36];
  id[12] = '\0';
}

void removeAt(size_t i) {
  for (size_t j = i + 1; j < count; j++) queue[j - 1] = queue[j];
  count--;
}

}  // namespace

bool add(const char *view, const char *zone, bool open) {
  if (count >= MAX_ACTIONS) {
    Serial.println("Actions: the queue is full (8), not adding");
    return false;
  }
  Action &a = queue[count];
  newId(a.id);
  strlcpy(a.view, view, sizeof a.view);
  strlcpy(a.zone, zone, sizeof a.zone);
  a.open = open;
  a.at = static_cast<uint32_t>(time(nullptr));
  count++;
  Serial.printf("Actions: %s %s/%s queued (id %s, %u pending)\n", open ? "open" : "toggle", view,
                zone, a.id, (unsigned)count);
  return true;
}

size_t pending() { return count; }

FlushResult flush() {
  FlushResult result;
  if (count == 0) return result;

  // The body: {"actions":[{"id","view","zone","act","at"}, …]}; 8 fit in < 1 KB.
  JsonDocument req;
  JsonArray list = req["actions"].to<JsonArray>();
  for (size_t i = 0; i < count; i++) {
    JsonObject o = list.add<JsonObject>();
    o["id"] = queue[i].id;
    o["view"] = queue[i].view;
    o["zone"] = queue[i].zone;
    o["act"] = queue[i].open ? "open" : "toggle";
    o["at"] = queue[i].at;
  }
  static uint8_t body[1024];
  const size_t bodyLen = serializeJson(req, body, sizeof body);

  static uint8_t answer[1024];
  const tintero::Response r = tintero::post("/api/v1/actions", body, bodyLen, answer, sizeof answer);
  if (r.status == 409) {
    // The view or the zone no longer exists: these actions cannot be applied.
    Serial.println("Actions: 409, the view changed; dropping them");
    count = 0;
    result.sent = true;
    result.stale = true;
    return result;
  }
  if (r.status != 200 || r.tooLarge) return result;  // no useful answer: the queue stays
  result.sent = true;

  JsonDocument res;
  if (deserializeJson(res, answer, r.length)) {
    Serial.println("Actions: unreadable answer");
    return result;
  }
  result.indexChanged = res["index_changed"] | false;
  for (JsonVariantConst item : res["results"].as<JsonArrayConst>()) {
    const char *id = item["id"].as<const char *>();
    const char *status = item["status"].as<const char *>();
    if (id == nullptr || status == nullptr) continue;
    for (size_t i = 0; i < count; i++) {
      if (strcmp(queue[i].id, id) != 0) continue;
      Serial.printf("Actions: %s → %s\n", id, status);
      if (strcmp(status, "stale") == 0) result.stale = true;
      removeAt(i);  // applied, duplicate or stale: it is not sent again
      break;
    }
  }
  return result;
}

}  // namespace actions
