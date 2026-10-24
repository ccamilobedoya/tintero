# ADR-0036 · El aparato informará la vista que muestra

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · **Decidió:** dueño del proyecto (F-005, puerta 1, D7)

## Contexto
El aparato cambia de vista con Mover largo sin avisar al servidor; al despertar muestra el `current` del índice y vuelve a la primera vista.

## Decisión
Una ficha aparte (F-008) agregará una cabecera opcional `Tintero-View` (compatible con v1) para que el aparato informe su vista actual. Mientras tanto (F-005), `current` es la primera vista del aparato, o el detalle solo en el índice que sigue a abrirlo.

## Consecuencias
Cambia el contrato (zona sensible) y el emulador; el firmware del dueño la puede ignorar mientras no la use.
