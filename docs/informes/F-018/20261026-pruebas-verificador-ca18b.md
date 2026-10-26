## Informe del verificador · F-018 · fase pruebas · puerta 2 (CA18b)

**Veredicto:** PRUEBAS LISTAS

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA18b (imágenes `-en`/`.en.svg`) | PRUEBA ESCRITA | `docs.test.ts` "CA18b las imágenes de cada idioma", caso `en`. Recorre `README.md` y `docs/guide/en/*.md`, con la sintaxis `![]()` y con `<img src>`. Cada imagen debe terminar en `-en.png` o `.en.svg`, o estar bajo `docs/hardware/tintero-buttons/out/`, y debe existir. Aún no la corrí: las imágenes `-en` de `tablero` y `agenda` no existen. |
| CA18b (imágenes `-es`/`.es.svg`) | PRUEBA ESCRITA | Mismo caso `es`, sobre `README.es.md` y `docs/guide/es/*.md`, con el sufijo `-es.png` o `.es.svg`. Aún no la corrí. |
| CA18b (sección `## How it works` / `## Cómo funciona`) | FALLA (esperado) | Dos pruebas en `docs.test.ts`. La sección debe enlazar `architecture.en.svg`, `hoy-en.png`, `tablero-en.png` y `agenda-en.png`; en el README en español, los pares `-es`. Obtenido: no existe la sección. |
| CA18b (HTML de `tablero` y `agenda` sin textos de `es`) | FALLA (esperado) | `i18n.test.ts` "CA18b ejemplos en inglés de tablero y agenda": 2 pruebas por vista. Usan `config/{tablero,agenda}.{views,data}.example.en.json` y las mismas comprobaciones de CA10b. Pasan la validación con `locale: "en"`, y el HTML no contiene `Hoy`, `Mañana`, `FESTIVO`, `sin datos desde`, `más` ni `Todo el día`, ni textos del catálogo `es` (`spanishLeft`). Obtenido: los ejemplos `.en.json` no existen. |
| CA19 | Sin cambios | La prueba compara los SHA-256 de lo que haya en `docs/guide/images/`. No lista nombres, así que no hubo nada que ajustar. |

**Resultado de la corrida** (`-t CA18b`): 6 fallan, 2 pasan, 37 omitidas. Los 2 que pasan son los dos casos de imágenes por idioma. No pude explicar ese pase y no lo investigué. Antes de dar la fase por cerrada, hay que comprobar que esos dos casos fallan cuando falta una imagen o un sufijo.

**Pruebas:** `tests/acceptance/F-018/docs.test.ts` y `tests/acceptance/F-018/i18n.test.ts` (8 pruebas nuevas). Reutilizan `htmlOf` y `spanishLeft`, que ya estaban en `i18n.test.ts`.
**Comprobaciones:** `tsc -p tests/acceptance`, eslint y prettier salen sin errores. No pude medir contraste, ejes ni desbordes: no hay navegador aquí.
**Pruebas corregidas por contradecir la ficha:** ninguna
**check-scope verificador:** ✅ con `--base HEAD`. Con `--base main` ❌, porque la rama ya trae los cambios anteriores del programador y del arquitecto. Lo que cambié yo son solo los dos archivos de pruebas.
