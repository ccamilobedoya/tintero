// CA1 a CA11 y CA15 a CA18: las pruebas nativas en C++ (tests/acceptance/F-019/native/), con tools/probar-firmware.
// Se compila y corre una vez; cada prueba de C++ aparece aquí con su CA.
import { beforeAll, describe, expect, it } from "vitest";
import { HERE, run, type Exit } from "./helpers.ts";

const FILES = ["reader.cpp", "packbits.cpp", "recovery.cpp", "tolerance.cpp", "run.cpp"];

const EXPECTED: [string, string][] = [
  ["CA1 imagen que se traba", "ca1_image_stalls"],
  ["CA2 goteo", "ca2_drip_hits_total_deadline"],
  ["CA3 cabeceras que no terminan", "ca3_headers_never_end"],
  ["CA4 se cierra antes", "ca4_closed_before_the_end"],
  ["CA5 demasiado grande", "ca5_too_large_without_reading_the_body"],
  ["CA6 cabeceras malas", "ca6_bad_headers"],
  ["CA7 Retry-After", "ca7_retry_after"],
  ["CA8 reutilizable", "ca8_reusable"],
  ["CA9 Sink que se llena", "ca9_sink_fills_up"],
  ["CA10 normal en pedazos", "ca10_normal_in_pieces"],
  ["CA10 cuerpos vacíos (204, 304, 404, 500)", "ca10_empty_bodies"],
  ["R1 plazos con millis() que da la vuelta", "reader_deadlines_use_unsigned_time"],
  ["R1 nombres de Outcome", "outcome_names"],
  ["CA11 decodificador: 5 imágenes, de a 1, 7 y de una vez", "ca11_fixtures_decode_identical"],
  ["CA11 control 0x80", "ca11_control_0x80_is_invalid"],
  ["CA11 0x80 como dato", "ca11_0x80_as_data_is_fine"],
  ["CA11 se pasa por 1 byte", "ca11_overrun_by_one_byte"],
  ["CA11 falta el último byte", "ca11_missing_last_byte"],
  ["CA11 nunca escribe más allá de rawBytes", "ca11_never_writes_past_rawBytes"],
  ["CA15 backoffMs", "ca15_backoff"],
  ["CA16 formatFailure", "ca16_format_failure"],
  ["CA16 formatFailure, otros valores y topes", "ca16_format_failure_other_values_and_limits"],
  ["CA17 zonas: act desconocido se salta", "ca17_zones_skip_unknown_act"],
  ["CA17 zonas: campo desconocido se ignora", "ca17_zones_unknown_field_is_ignored"],
  ["CA17 zonas: los demás errores invalidan", "ca17_zones_other_errors_still_invalidate"],
  ["CA18 índice: formato desconocido se salta", "ca18_index_skips_unknown_format"],
  ["CA18 índice: current con formato desconocido", "ca18_index_unknown_format_current_is_invalid"],
  ["CA18 índice: se saltan también los hijos", "ca18_index_skipped_view_takes_its_children"],
  ["CA18 índice: pb1", "ca18_index_pb1"],
];

let exit: Exit;
const verdict = new Map<string, boolean>();

beforeAll(async () => {
  exit = await run(
    "tools/probar-firmware",
    FILES.map((f) => `${HERE}native/${f}`),
    560_000,
  );
  for (const m of exit.out.matchAll(/^(ok {2}|FAIL) (\S+)$/gm)) {
    verdict.set(m[2] ?? "", m[1] !== "FAIL");
  }
}, 600_000);

describe("pruebas nativas del firmware (tools/probar-firmware)", () => {
  it("compila con -Wall -Wextra -Werror y ASan/UBSan, y el binario sale con 0", () => {
    expect(exit.code, exit.out.slice(-3000)).toBe(0);
  });

  for (const [label, name] of EXPECTED) {
    it(label, () => {
      expect(verdict.get(name), `${name}\n${exit.out.slice(-3000)}`).toBe(true);
    });
  }

  it("no sobra ni falta ninguna prueba nativa registrada", () => {
    expect([...verdict.keys()].sort()).toEqual(EXPECTED.map(([, n]) => n).sort());
  });
});
