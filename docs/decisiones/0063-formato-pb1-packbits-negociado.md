# ADR-0063 · Formato `pb1`: la imagen `raw1` comprimida con PackBits, negociada

- **Estado:** aceptada · amplía ADR-0020
- **Fecha:** 2026-11-04 · **Decidió:** dueño del proyecto (F-019, D2)

## Contexto
Cada cambio de vista baja 48 000 bytes de `raw1`, el 98 % de lo que viaja (las zonas pesan menos de 1 KB). Medido sobre 20 imágenes reales de 800×480: PackBits las deja en 9–12 KB; zlib, en 3–6 KB, pero en el ESP32 necesita `tinfl` de la ROM, que no se puede probar en el PC sin traer otra biblioteca.

## Decisión
Formato nuevo `pb1`: PackBits sobre los bytes de `raw1` como un solo flujo (control `0…127` copia `n+1` bytes, `129…255` repite `257−n` veces, `128` es inválido). El aparato lo pide en `Tintero-Formats`; el servidor lo manda solo si achica la imagen. En el índice, `bytes` es el largo del cuerpo `pb1` y `crc32` es el del `raw1` decodificado. `Tintero-Formats` ignora los nombres que no conoce si queda uno conocido.

## Consecuencias
La imagen baja unas 4 veces más rápido y el firmware actual (`raw1`) sigue igual. El decodificador cabe en unas 40 líneas, no necesita biblioteca y decodifica directo en el búfer de la imagen. zlib queda para otra ficha, si hace falta.
