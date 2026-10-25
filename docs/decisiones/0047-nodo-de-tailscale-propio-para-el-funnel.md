# ADR-0047 · Funnel en un nodo de Tailscale propio de Tintero

- **Estado:** aceptada (reemplaza el «puerto libre del servidor» de ADR-0007 y fija la URL de ADR-0008)
- **Fecha:** 2026-10-25 · **Decidió:** dueño del proyecto (F-012, opción A)

## Contexto
El ESP32 no corre Tailscale. Cualquier Funnel en el servidor publica el nombre del servidor en DNS público, y los servicios que solo viven en el tailnet dejan de funcionar desde los clientes que no resuelven por MagicDNS (pasó el 2026-10-24).

## Decisión
Un contenedor `tailscale/tailscale` (fijado por *digest*) entra al tailnet como el aparato **`tintero`** con la etiqueta `tag:tintero`, en modo *userspace* y con la red del servidor, sin aceptar DNS y con puerto UDP automático. El Funnel se abre **solo en ese nodo**: TCP 443 reenviado tal cual a Tintero en `127.0.0.1`, que sigue terminando el TLS con certificado de cliente (ADR-0028). La URL pública de las pantallas es `https://tintero.<tailnet>.ts.net`. Abrir y cerrar el Funnel lo hace el dueño (`docker compose up -d` / `down`).

## Consecuencias
Solo se publica el nombre `tintero`; el del servidor sigue sin existir en DNS público. Usa uno de los 50 aparatos etiquetados gratis del plan. El contenedor ve los puertos de loopback del servidor: va sin capacidades, de solo lectura y con imagen fijada. El patrón queda documentado para otros proyectos del homelab.
