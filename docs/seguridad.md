# Reglas de seguridad

> Resumen de las reglas del diseño (documentación de diseño, fuera del repo). Las fichas citan las que aplican; el revisor las usa en modo «juicio». **Estado:** *aprobada* = decidida por el dueño; *propuesta* = diseño del arquitecto aún sin aprobar en detalle.

## Datos y llaves (S)
| # | Regla | Estado |
|---|-------|--------|
| S1 | Las llaves no salen del servidor: el aparato solo recibe imágenes y un mapa de zonas con ids opacos | propuesta |
| S2 | Llaves cifradas en reposo; la llave maestra vive aparte (archivo 600 fuera del repo) | propuesta |
| S3 | Cada llave es de un usuario; la web muestra si existe, nunca su valor | propuesta |
| S4 | Mínimo privilegio: llaves solo para Tintero, revocables, de solo lectura cuando se pueda | propuesta |
| S5 | Solo salida a internet; cada integración declara a qué dominios llama y el resto se bloquea | propuesta |
| S6 | Los registros nunca guardan cabeceras de autorización, llaves ni contenido de respuestas | propuesta |
| S7 | Imágenes siempre por **HTTPS** (aprobado); URL firmadas que caducan; tokens por aparato revocables | aprobada (HTTPS) / propuesta |
| S8 | Vistas sensibles: solo en ciertas pantallas o en modo discreto | propuesta |
| S9 | La web de configuración solo por Tailscale, con usuario por persona | propuesta |
| S10 | Integraciones de terceros aisladas, solo con su propia llave | propuesta |
| S11 | A internet sale solo la API de aparatos; tokens largos, límite de peticiones, alerta por Telegram | propuesta |

## Integraciones (I) — modelo «la integración pide, el núcleo concede» (aprobado como idea; detalle pendiente)
| # | Regla |
|---|-------|
| I1 | La integración no ve las llaves; el núcleo las pone en cada llamada y renueva los tokens |
| I2 | La integración no tiene red propia; solo el cliente HTTP vigilado, hacia sus hosts permitidos |
| I3 | Permisos a la vista al conectar; si una versión pide más, se vuelve a aprobar |
| I4 | Solo lectura por defecto; escribir es un permiso explícito; permisos mínimos con el proveedor |
| I5 | Minimización: solo los campos del tipo común; caché de vida corta |
| I6 | Aislamiento por usuario |
| I7 | Auditoría sin contenido: quién llamó a qué dominio y cuándo |
| I8 | Desconectar borra tokens y caché |
| I9 | Vencimientos vigilados con aviso por Telegram |
| I10 | Niveles de confianza: propias en el núcleo; de terceros, en proceso aparte sin red |
| I11 | Nada entra desde internet por defecto; los avisos entrantes, con firma verificada y a propósito |

## Exposición (L) — Funnel con capa interna «solo mis aparatos» (aprobado; **probar primero L1**)
| # | Capa |
|---|------|
| L1 | Certificado de cliente por pantalla (mTLS) vía `funnel --tcp` — **probar primero** |
| L2 | Firma HMAC de cada petición (alternativa si L1 no funciona) |
| L3 | Silencio ante extraños: sin credencial válida, nada que delate qué hay |
| L4 | Pasarela separada, sin llaves ni bóveda |
| L5 | Límites de peticiones y alertas |
| L6 | Secretos protegidos en el ESP32 (cifrado de flash), más adelante |
| L7 | Ruta secreta: solo complemento, nunca defensa |

**Recordatorio:** el nombre `*.ts.net` del servidor es público (registro de certificados). Nada se apoya en que no lo encuentren.

## Secretos del repo y del servidor
- `.claude/settings.json` niega `Read` sobre `.env*` y `~/.config/**` (Claude Code lo aplica también a Grep y Glob, en la medida de lo posible).
- Los agentes lanzados con `tools/lanzar-agente` solo tienen una **lista cerrada de comandos** de Bash: no pueden correr `cat`, `less` ni similares. Este es el control real.
- El hook `tools/hooks/block-secrets.ts` bloquea comandos de Bash que nombren `.env` o `.config`. Compara texto, así que es una **barrera contra descuidos** en sesiones interactivas, no un control de seguridad (se puede saltar con comodines o comillas partidas). Falla cerrado.

## Excepción: HTTP sin TLS hacia 127.0.0.1 en pruebas
Las pruebas que llaman a servicios locales del repo (simulador, visor) pueden usar `http://127.0.0.1:<puerto>`. Todas las llamadas de un archivo pasan por **una sola función auxiliar** (p. ej. `getLocal(base, path, init)`), cuya **única** llamada a `fetch` se marca con `// nosemgrep: <regla> -- loopback de prueba (docs/seguridad.md)`; la función rechaza cualquier base que no empiece con `http://127.0.0.1:`. (Marcar solo la constante no basta: semgrep sigue la URL hasta cada `fetch`.) Fuera de pruebas, o hacia cualquier otra dirección, la comunicación es HTTPS (ADR-0004), salvo la excepción siguiente.

## Excepción: CDP sin TLS hacia el Chromium local (F-005, ADR-0031)
El motor de vistas habla con su Chromium por CDP en `http://127.0.0.1:<puerto>` (y el *websocket* que este entrega), sin TLS: el puerto se publica solo en `127.0.0.1` y no sale de la máquina. Todo acceso pasa por **un solo archivo** (`server/src/engine/chromium.ts`, zona sensible): una única función arma la URL, rechaza cualquier base que no sea `http://127.0.0.1:<puerto>`, y es la **única** que conecta (`connectOverCDP`) o consulta `/json/version`; cada una de esas llamadas se marca con `// nosemgrep: <regla> -- CDP local (docs/seguridad.md)`. Las opciones del servidor (`--chromium`) solo aceptan esa forma. Cualquier puerto local puede manejar ese Chromium: por eso el contenedor no tiene red del host ni montajes de escritura, y la página no puede pedir nada (CSP `default-src 'none'`, JavaScript apagado, peticiones bloqueadas).
