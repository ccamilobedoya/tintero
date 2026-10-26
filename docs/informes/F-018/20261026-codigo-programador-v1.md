## Informe del programador · F-018 · vuelta 1

**Estado:** listo para verificar

**Qué hice**
- **C (i18n):** `locale` en el archivo de vistas (`es` por defecto; otro valor da `ConfigError` en `/locale`). Catálogos `i18n/{index,es,en}.ts` con las mismas claves. `dates.ts`, `holidays.ts` y los bloques toman sus textos del catálogo. Los bloques lo reciben como `context.msgs`.
- **A3, D8, R1, R6:** ejemplos `hoy` en inglés. `example-json`, con sus pruebas, registrado en `main.ts` y apagado si no se configura. Licencia MIT en `package.json`. `.gitignore` con las rutas del firmware.
- **E:** `pki firmware <carpeta> --host <dns> <pN> [--out f]`, una sola pantalla por archivo. Escritura atómica (temporal 600 en la misma carpeta, luego renombrar). No imprime llaves. Cada PEM ≤ 4096 bytes. Se niega a escribir en un archivo del repo que `git check-ignore` no ignore.
- **D:** firmware solo con las 5 constantes de R14; se quitó `Identity` y la lista p1/p2. `tintero::deviceId()` expone `TINTERO_DEVICE_ID` y `main.cpp` lo imprime al arrancar. Comentarios y mensajes serie en inglés, sin «hito», «Claude» ni «M8». `secrets.h.example` solo con Wi-Fi. `firmware/README.md` tiene compilar y grabar, nota GPL-3.0 (D1) y R13.

**Textos fijos pasados al catálogo (R10b y otros)**
- Los de R10b: días, meses cortos y largos, Hoy/Mañana, «sin datos desde» (dos formas), festivo (dos formas), «Todo el día», «· todo el día», «Sin categoría», las etapas, los vacíos y «+N más».
- Otros: «No cabe», «No disponible» y «Detalle» (título de la vista de detalle).
- Calibración: «normal», «negrita», «tachado», «Foco», «Enviando» y la frase de muestra («Ñandú pingüino…»). El «22 oct» sale de los meses del catálogo. En `en` la frase de muestra pierde las tildes: `Quick brown fox 0123 22 oct`.
- No lo cambié: el `title: "Detalle"` de `DETAIL_DEF` en `engine.ts`; ese título no se dibuja.

**Archivos tocados**
- C: `server/src/engine/{dates,holidays,config,view,engine}.ts`, `blocks/{common,types,agenda,detail,month-calendar,task-board,task-list,calibration}.ts`, `i18n/*` (con `i18n.test.ts`).
- Resto: `server/scripts/pki.ts` y `pki.test.ts`; `server/src/integrations/example-json.ts` y su prueba; `config/hoy.*.example.en.json`, `config/example-json.*.example.json`; `firmware/**`; `package.json`; `.gitignore`.
- Fuera de la sección *Archivos* (los necesitaba D8 o para que quedara documentado): `integrations/{config,manifest}.ts`, `main.ts`, `integrations/README.md` y `config/README.md`. El `.gitignore` lleva además `firmware/include/*.tmp`, por si un temporal de `pki firmware` se quedara sin borrar.

**Comprobaciones:** typecheck ✅ · lint ✅ (el eslint estricto de `server`, `contract`, `emulator` y `tools` sale limpio; los 85 avisos son solo de `tests/`, que no tiene `--max-warnings 0`) · test ✅ (534 pruebas) · format ✅ · check-scope ✅

**Aceptación:** las de F-001 a F-006, F-008, F-009 y F-013 a F-015 pasan por carpeta. Las que fallan solo en la corrida completa:
- F-005 CA27 y F-008 CA4, los intermitentes de siempre. Los envoltorios `previous` de F-013 y F-014 repiten F-005, así que fallan también por CA27.
- F-007 CA6 pide `.revisar/semgrep.json`; falta correr `tools/revisar`.

**Lo que no pude comprobar**
- No comparé las imágenes de `es` contra `main` byte a byte. No pude extraer `main` a una carpeta aparte (`git worktree` y `git archive` pedían aprobación). Los cambios son sustituciones literales y las pruebas existentes de textos en español pasan, pero CA8 queda para el verificador.
- No compilé el C++. Lo revisé a mano. El nuevo `tintero::begin()` ya no recibe argumentos y `TINTERO_DEVICE_ID` solo se lee dentro de `tintero.cpp`.
- `net.cpp`: la zona horaria que solo se imprime por serie cambió de Colombia (`<-05>5`) a `UTC0`, para no dejar un lugar en el código. El TLS no se ve afectado.
- Quedan fuera del repo `/tmp/f018-main/` y archivos `/tmp/f018-*`. Los creé para la comparación que no salió y no pude borrarlos sin aprobación.

**Dudas o ambigüedades de la ficha:**
- La ficha no dice qué entrega `example-json`. Elegí una fuente `tasks` de solo lectura, que lee `<baseUrl>/tasks.json`. Su manifiesto permite solo esa ruta y la `baseUrl` debe ser `https:`, aunque sea `127.0.0.1`.
- `firmware/README.md` quedó en español, porque la vuelta 2 es la que arma la guía en los dos idiomas.

**Dependencias:** ninguna nueva
