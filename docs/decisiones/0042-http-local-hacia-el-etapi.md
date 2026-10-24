# ADR-0042 · HTTP sin TLS hacia un servicio propio solo en 127.0.0.1

- **Estado:** aceptada
- **Fecha:** 2026-10-24 · **Decidió:** dueño del proyecto (F-009, puerta 1, D11)

## Contexto
La primera integración lee el ETAPI de Trilium, que corre en la misma máquina y solo escucha en `127.0.0.1` sin TLS. ADR-0004 y `docs/seguridad.md` piden HTTPS fuera de las pruebas.

## Decisión
El cliente HTTP vigilado de las integraciones acepta `http://` **solo** hacia `127.0.0.1:<puerto>`; cualquier otro host exige `https://`. La excepción vive en **un único archivo** (`server/src/integrations/http.ts`), con un único `fetch` marcado, igual que la excepción de CDP (F-005).

## Consecuencias
La llave viaja sin cifrar solo dentro de la máquina. Si Tintero pasa a un contenedor, la ficha del servicio permanente decide cómo llega a Trilium (red del host o HTTPS). Todo lo demás sigue por HTTPS.
