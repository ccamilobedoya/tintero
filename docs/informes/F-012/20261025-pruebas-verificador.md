## Informe del verificador · F-012 · CA1 · vuelta 1

**Veredicto:** pruebas de CA1 escritas y corridas contra el código que ya existe → **CUMPLE** para CA1. CA2–CA7 son en vivo y no llevan prueba automática.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PASA | 13 pruebas en `funnel.test.ts`, todas verdes. Con `--dry-run`, el `compose.yaml` trae `network_mode: host`, `cap_drop` con ALL, `no-new-privileges:true`, `TS_USERSPACE=true`, `TS_ACCEPT_DNS=false`, `TS_HOSTNAME=tintero`, `--advertise-tags=tag:tintero`, `--port=0` y una imagen con `@sha256:` de 64 hexadecimales. El archivo de llave sale en `env_file`. El `serve.json` es JSON válido, con `TCP` solo en 443, `TCPForward` en `127.0.0.1:8443` y `AllowFunnel` con una sola entrada `:443`. No quedan marcadores `@…@`. No crea la carpeta de destino. Sin `TINTERO_TLS_PORT` sale con 2 y la nombra. Con el puerto 80 sale con 2. También salen con 2 los puertos 1023, 65536, `abc` y `8443x`, un valor con `@` y una configuración inexistente. El `compose.yaml` impreso pasa `docker compose config -q` con un `env_file` temporal vacío. |

**Hallazgos:** ninguno contra el código. Mi primera versión de la prueba buscaba `TS_HOSTNAME=tintero` en texto literal. El `compose.yaml` generado usa la forma de mapa de Compose (`TS_HOSTNAME: tintero`), que es el mismo ajuste. Corregí la prueba para aceptar las dos formas. Es un error mío de interpretación, no un fallo del programador.

**Pruebas:** `tests/acceptance/F-012/funnel.test.ts` (13 pruebas).
- Siempre uso `--dry-run`, con `TINTERO_LOCAL_ENV` y `HOME` en una carpeta temporal fuera del repo.
- No levanto ningún contenedor. `docker compose config -q` solo valida el archivo.
- La prueba de Docker se salta si `docker compose` no está disponible.

**Pruebas corregidas por contradecir la ficha:** ninguna que la contradijera. Solo la de `TS_*=valor` descrita arriba, que se ajustó a la forma de mapa de Compose.

**Comprobaciones:** `npm run typecheck`, `npx tsc --noEmit -p tests/acceptance` y `npx prettier --check` limpios. `npx eslint tests/acceptance/F-012` sale limpio tras añadir dos comentarios `eslint-disable` con motivo (ruta en carpeta temporal y expresión regular con literales fijos). No corrí `npm test` completo. Sin *commit*.

**check-scope verificador:** ✅

