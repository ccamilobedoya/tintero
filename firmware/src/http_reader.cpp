// HTTP/1.1 response reader with deadlines (see http_reader.h).
//
// The header block is parsed one byte at a time with a small state, so no line
// buffer is needed: the stack stays under 600 bytes and nothing is allocated.

#include "http_reader.h"

namespace http {

namespace {

constexpr size_t MAX_LINE = 512;
constexpr size_t MAX_HEADERS = 48;
constexpr size_t MAX_BLOCK = 4096;
constexpr uint32_t MAX_RETRY_AFTER_S = 3600;
constexpr size_t NAME_KEEP = 20;   // enough for "transfer-encoding"
constexpr size_t VALUE_KEEP = 24;  // enough for what is compared ("close")
constexpr size_t CHUNK = 256;
constexpr uint64_t NUMBER_CAP = static_cast<uint64_t>(1) << 40;  // saturates, never overflows

char lower(char c) { return c >= 'A' && c <= 'Z' ? static_cast<char>(c + 32) : c; }

bool nameIs(const char *name, size_t len, const char *want) {
  return len == strlen(want) && memcmp(name, want, len) == 0;
}

struct HeaderParser {
  // current line
  size_t lineLen = 0;
  bool lastCR = false;
  bool isStatus = true;
  size_t block = 0;
  size_t headerCount = 0;
  char status[16] = {};
  // current header
  char name[NAME_KEEP] = {};
  size_t nameLen = 0;
  bool inValue = false;
  bool nameTooLong = false;
  char value[VALUE_KEEP] = {};
  size_t valueLen = 0;
  size_t valueTotal = 0;
  bool blankSeen = false;
  bool digitsOnly = true;
  uint64_t number = 0;
  // results
  int statusCode = 0;
  bool http11 = false;
  bool haveLength = false;
  uint64_t contentLength = 0;
  bool transferEncoding = false;
  bool connectionClose = false;
  uint32_t retryAfter = 0;
  bool bad = false;

  void startLine() {
    lineLen = 0;
    lastCR = false;
    nameLen = 0;
    inValue = false;
    nameTooLong = false;
    valueLen = 0;
    valueTotal = 0;
    blankSeen = false;
    digitsOnly = true;
    number = 0;
  }

  // "HTTP/1.1 NNN" or "HTTP/1.0 NNN", then the end of the line or a space.
  bool parseStatus(size_t len) {
    if (len < 12) return false;
    if (memcmp(status, "HTTP/1.", 7) != 0) return false;
    if (status[7] != '0' && status[7] != '1') return false;
    if (status[8] != ' ') return false;
    int code = 0;
    for (size_t i = 9; i < 12; i++) {
      if (status[i] < '0' || status[i] > '9') return false;
      code = code * 10 + (status[i] - '0');
    }
    if (len > 12 && status[12] != ' ') return false;
    statusCode = code;
    http11 = status[7] == '1';
    return true;
  }

  void finishHeader() {
    if (!inValue || nameTooLong) return;
    if (nameIs(name, nameLen, "content-length")) {
      if (valueTotal == 0 || !digitsOnly || (haveLength && contentLength != number)) {
        bad = true;
        return;
      }
      haveLength = true;
      contentLength = number;
    } else if (nameIs(name, nameLen, "transfer-encoding")) {
      transferEncoding = true;
    } else if (nameIs(name, nameLen, "connection")) {
      for (size_t i = 0; i + 5 <= valueLen; i++) {
        if (lower(value[i]) == 'c' && lower(value[i + 1]) == 'l' && lower(value[i + 2]) == 'o' &&
            lower(value[i + 3]) == 's' && lower(value[i + 4]) == 'e') {
          connectionClose = true;
        }
      }
    } else if (nameIs(name, nameLen, "retry-after")) {
      if (valueTotal > 0 && digitsOnly) {
        retryAfter = number > MAX_RETRY_AFTER_S ? MAX_RETRY_AFTER_S : static_cast<uint32_t>(number);
      } else {
        retryAfter = 0;
      }
    }
  }

  void feedValue(char c) {
    if (c == '\r') return;  // the CR before '\n'
    if (c == ' ' || c == '\t') {
      if (valueTotal > 0) blankSeen = true;  // leading blanks are skipped
      return;
    }
    if (blankSeen) digitsOnly = false;  // a blank in the middle
    valueTotal++;
    if (valueLen < VALUE_KEEP) value[valueLen++] = c;
    if (c >= '0' && c <= '9') {
      if (number < NUMBER_CAP) number = number * 10 + static_cast<uint64_t>(c - '0');
    } else {
      digitsOnly = false;
    }
  }

  // Feeds one byte. Returns true when the blank line ends the headers.
  bool feed(uint8_t b) {
    if (++block > MAX_BLOCK) {
      bad = true;
      return false;
    }
    if (b != '\n') {
      lineLen++;
      lastCR = b == '\r';
      if (lineLen > MAX_LINE + 1) {  // +1: a possible CR before the '\n'
        bad = true;
        return false;
      }
      const char c = static_cast<char>(b);
      if (isStatus) {
        if (lineLen <= sizeof status) status[lineLen - 1] = c;
      } else if (inValue) {
        feedValue(c);
      } else if (c == ':') {
        inValue = true;
      } else if (nameLen < NAME_KEEP) {
        name[nameLen++] = lower(c);
      } else {
        nameTooLong = true;
      }
      return false;
    }

    const size_t len = lineLen - (lastCR ? 1 : 0);
    if (len > MAX_LINE) {
      bad = true;
      return false;
    }
    if (isStatus) {
      if (!parseStatus(len)) bad = true;
      isStatus = false;
    } else {
      if (len == 0) return true;  // blank line: end of the headers
      if (++headerCount > MAX_HEADERS) {
        bad = true;
        return false;
      }
      finishHeader();
    }
    startLine();
    return false;
  }
};

}  // namespace

bool BufferSink::write(const uint8_t *data, size_t n) {
  if (n > cap_ - len_) return false;
  memcpy(buf_ + len_, data, n);
  len_ += n;
  return true;
}

const char *outcomeName(Outcome o) {
  switch (o) {
    case Outcome::Ok:
      return "ok";
    case Outcome::Stalled:
      return "stalled";
    case Outcome::Timeout:
      return "timeout";
    case Outcome::Closed:
      return "closed";
    case Outcome::TooLarge:
      return "too-large";
    case Outcome::BadHeader:
      return "bad-header";
    case Outcome::BadBody:
      return "bad-body";
  }
  return "unknown";
}

Result readResponse(Source &src, Clock &clock, const Limits &limits, Sink &sink) {
  Result r = {Outcome::Ok, 0, 0, 0, false};
  HeaderParser p;
  uint8_t chunk[CHUNK];

  const uint32_t start = clock.nowMs();
  uint32_t lastProgress = start;
  bool headersDone = false;
  bool reusable = false;
  size_t bodyLeft = 0;

  for (;;) {
    size_t want = CHUNK;
    if (headersDone && bodyLeft < want) want = bodyLeft;
    const int got = src.read(chunk, want);
    if (got < 0) {
      r.outcome = Outcome::Closed;
      return r;
    }

    if (got > 0) {
      lastProgress = clock.nowMs();
      const size_t n = static_cast<size_t>(got) > want ? want : static_cast<size_t>(got);
      size_t i = 0;
      while (!headersDone && i < n) {
        const bool end = p.feed(chunk[i++]);
        if (p.bad) {
          r.status = p.statusCode;
          r.outcome = Outcome::BadHeader;
          return r;
        }
        if (!end) continue;

        headersDone = true;
        r.status = p.statusCode;
        r.retryAfterS = p.retryAfter;
        if (p.transferEncoding || (p.statusCode == 200 && !p.haveLength)) {
          r.outcome = Outcome::BadHeader;
          return r;
        }
        const bool noBody = p.statusCode == 204 || p.statusCode == 304;
        if (!noBody && p.haveLength) {
          if (p.contentLength > limits.maxBody) {
            r.outcome = Outcome::TooLarge;
            return r;
          }
          bodyLeft = static_cast<size_t>(p.contentLength);
        }
        // Without a length (and not 204/304) the body is taken as empty and the
        // connection is not reused.
        reusable = p.http11 && !p.connectionClose && (noBody || p.haveLength);
      }
      if (headersDone && i < n && bodyLeft > 0) {
        const size_t take = n - i < bodyLeft ? n - i : bodyLeft;
        if (!sink.write(chunk + i, take)) {
          r.outcome = Outcome::BadBody;
          return r;
        }
        r.bodyBytes += take;
        bodyLeft -= take;
      }
      if (headersDone && bodyLeft == 0) {
        r.reusable = reusable;
        return r;
      }
      if (clock.nowMs() - start >= limits.totalMs) {
        r.outcome = Outcome::Timeout;
        return r;
      }
      continue;
    }

    // Nothing yet: check the deadlines and give the CPU (and the watchdog) a turn.
    const uint32_t now = clock.nowMs();
    if (now - start >= limits.totalMs) {
      r.outcome = Outcome::Timeout;
      return r;
    }
    if (now - lastProgress >= limits.idleMs) {
      r.outcome = Outcome::Stalled;
      return r;
    }
    clock.pause();
  }
}

}  // namespace http
