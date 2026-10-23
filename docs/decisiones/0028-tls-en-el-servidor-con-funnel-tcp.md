# ADR-0028 · El servidor termina el TLS; Funnel en modo `--tcp`

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · **Decidió:** dueño del proyecto (F-004, puerta 1, D1)

## Contexto
ADR-0007 pide probar primero L1 (certificado de cliente). Si Funnel termina el TLS (modo HTTPS o `--tls-terminated-tcp`), el servidor no ve el certificado del aparato.

## Decisión
Funnel reenvía la conexión **sin tocarla** (`tailscale funnel --tcp <puerto> tcp://127.0.0.1:<puerto-local>`) y el propio servidor (Fastify con `https` de Node) termina el TLS con `requestCert` y `rejectUnauthorized`. El servidor escucha **solo en 127.0.0.1**, con o sin TLS. Comprobado en vivo el 2026-10-23: el *relay* público entrega el certificado del servidor tal cual y el saludo con certificado de cliente funciona de punta a punta.

## Consecuencias
Sin proxy intermedio. El servidor maneja el saludo TLS: necesita tiempo máximo de saludo, de petición y de conexiones (F-004). El nombre público solo resuelve mientras Tailscale lo publique (D6 de F-004, pendiente).
