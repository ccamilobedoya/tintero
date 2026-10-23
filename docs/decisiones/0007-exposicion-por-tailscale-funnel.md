# ADR-0007 · Exposición por Tailscale Funnel con capa «solo mis aparatos»

- **Estado:** aceptada
- **Fecha:** 2026-10-21 · **Decidió:** dueño del proyecto

## Contexto
El ESP32 no corre Tailscale y las pantallas funcionan también fuera de casa. El nombre `*.ts.net` del servidor es público (queda en el registro de certificados), así que nada puede apoyarse en que no lo encuentren.

## Decisión
La API de aparatos se expone por Tailscale Funnel, en uno de los puertos que Funnel permite (443, 8443, 10000) que esté libre. Capa interna: **probar primero L1** (certificado de cliente vía `funnel --tcp`); si no funciona, se vuelve a decidir (L2 es la alternativa). Ver `docs/seguridad.md`.

## Consecuencias
Antes de exponer, revisar que ningún servicio del servidor reinicie la configuración de Funnel al arrancar (detalle de infraestructura fuera del repo). Activar Funnel pide permisos de administrador del servidor.

**Nota (2026-10-23, F-004):** activar Funnel **no** pide permisos de administrador si el usuario del servidor es operador de Tailscale (comprobado). L1 se probó en vivo y funciona: ver ADR-0028 a ADR-0030.
