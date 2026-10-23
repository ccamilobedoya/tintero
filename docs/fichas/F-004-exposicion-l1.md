# F-004 · Exposición con certificado por pantalla (L1)

**Estado:** borrador (espera la puerta 1 del dueño) · 2026-10-23
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** ninguna (TLS con `node:https`/`node:tls`; certificados con la CLI `openssl` del sistema).

## Decisiones que pide esta ficha (puerta 1)

| # | Decisión | Propuesta | Por qué |
|---|----------|-----------|---------|
| **D1** | ¿Quién termina el TLS? | **El propio servidor (Node/Fastify con `https`)**, con `requestCert` y `rejectUnauthorized`; Funnel en modo `--tcp` solo reenvía bytes (ADR-0007: probar L1 primero) | Una pieza menos que un proxy (Caddy); el servidor ve el certificado del aparato y lo usa como identidad |
| **D2** | ¿Cómo se hacen los certificados? | **Autoridad privada de Tintero** con la CLI `openssl`: una CA y un certificado por pantalla. Llaves y certificados **fuera del repo** (`~/.config/tintero/pki/`, 600) | Estándar; el ESP32 puede llevar su certificado y su llave |
| **D3** | ¿Cómo se identifica cada pantalla? | Por la **huella SHA-256 de su certificado**, en una lista de aparatos permitidos **fuera del repo**. Revocar = quitarla de la lista | Simple y revocable sin reemitir nada |
| **D4** | ¿Cómo se prueba? | **Primero en local** (HTTPS en 127.0.0.1 con certificados de prueba generados en cada prueba): todo lo automatizable. **Después, una prueba en vivo por Funnel**, manual, con el dueño corriendo los pasos con `sudo` (están en la nota privada de Trilium, no en el repo) | La infraestructura real no la tocan los agentes |

## Contexto
ADR-0007 decidió exponer la API de aparatos por Tailscale Funnel con una capa «solo mis aparatos», probando primero **L1 (certificado de cliente)**. Esta ficha lo implementa y lo prueba. Incluye las mejoras **obligatorias** que dejó la revisión de F-003.

## Alcance
- Modo HTTPS del servidor: certificado del servidor + CA de aparatos; **sin certificado válido no hay conexión** (L1) y un aparato no listado recibe 404 vacío (L3).
- `tools/pki`: crear la CA, emitir y revocar certificados de pantalla (CLI `openssl`), todo fuera del repo.
- Emulador: opciones TLS (`--ca`, `--cert`, `--key`) para hablar con el servidor en HTTPS con su certificado.
- **De F-003 (obligatorio):** caché con expulsión del más viejo (no vaciado total) y **límite de paneles distintos por aparato**; `requestTimeout` (15 s) y `maxConnections` en el servidor.
- Prueba en vivo por Funnel (manual, registrada en el resultado de la ficha).

**Fuera de alcance:** L2 (firma HMAC; solo si L1 no funciona, ADR-0007); la web de configuración; varios usuarios; base de datos (la lista de aparatos es un archivo).

## Por verificar antes de programar (arquitecto)
- [ ] Sintaxis exacta de `tailscale funnel --tcp` en la versión instalada, y que entregue el TLS sin tocar.
- [ ] Cómo obtiene el servidor el certificado de `*.ts.net` (`tailscale cert` y sus permisos) y cómo se renueva.
- [ ] Que el cliente HTTPS de Node (emulador) y el del ESP32 validen ese certificado público.

## Criterios de aceptación (borrador; se completan con lo verificado)
- **CA1.** Con `--tls`, el servidor escucha HTTPS en 127.0.0.1; una conexión **sin** certificado de cliente **falla en el saludo TLS** (sin respuesta HTTP).
- **CA2.** Con un certificado firmado por **otra** CA, el saludo falla.
- **CA3.** Con un certificado válido de la CA pero **no listado**, toda ruta responde **404 sin cuerpo**.
- **CA4.** Con un certificado válido y listado, el emulador (con `--ca/--cert/--key`) hace una despertada completa sin errores.
- **CA5.** Quitar la huella de la lista (sin reiniciar) → la siguiente petición responde 404 vacío.
- **CA6.** `tools/pki` crea la CA y un certificado de pantalla en una carpeta dada, con permisos 600 en las llaves, y nunca escribe dentro del repo.
- **CA7.** Caché: con el límite de paneles por aparato (p. ej. 2), un tercer panel distinto responde **400** `invalid_request` y no dibuja; la caché expulsa la entrada más vieja, nunca se vacía entera.
- **CA8.** Un cuerpo enviado muy despacio se corta antes de `requestTimeout`; el servidor no acepta más de `maxConnections` conexiones a la vez.
- **CA9.** Sin `--tls`, el servidor sigue negándose a escuchar fuera de 127.0.0.1 (D3 de F-003); con `--tls` puede escuchar en la dirección que use Funnel.
- **CA10 (manual).** Prueba en vivo por Funnel: el emulador, con su certificado, despierta contra la URL pública; sin certificado, la conexión falla. Resultado anotado en la ficha.

## Seguridad
- [ ] Toda entrada externa con límite de tamaño antes de parsear (se mantiene de F-003).
- [ ] Servicios locales solo en 127.0.0.1 salvo con TLS y certificado de cliente.
- [ ] Dependencias nuevas: ninguna.
- Llaves, certificados, lista de aparatos y nombres del servidor: **fuera del repo** (ADR-0023).
