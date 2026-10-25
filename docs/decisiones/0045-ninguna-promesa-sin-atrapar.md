# ADR-0045 · Ningún fallo pasajero tumba el servidor

- **Estado:** aceptada
- **Fecha:** 2026-10-24 · **Decidió:** dueño del proyecto (F-009, vuelta 2, D18)

## Contexto
En Node 24 un rechazo de promesa sin atrapar termina el proceso. El revisor de F-009 encontró `void flujo.cancel()` sin `.catch`, y la misma forma existía en otras partes del servidor. El dueño pidió que el servidor se recupere solo de fallos y apagados.

## Decisión
`@typescript-eslint/no-floating-promises` con `ignoreVoid: false` es error en todo el TypeScript: toda promesa se espera o se atrapa (`.catch` que registre sin contenido, o `.catch(() => undefined)` con el motivo escrito). Sin `eslint-disable`. Las integraciones reintentan sin fin cuando su servicio no responde, y sus registros de fallo no se repiten en cada intento (al caer, cada hora y al volver).

## Consecuencias
La revisión automática atrapa sola este error. Lo que no es de una integración (arrancar con el sistema, reiniciar el proceso, relanzar Chromium, esperar a Docker) va en F-010.
