# ADR-0050 · Refresco completo: una vez al día lo pide el servidor; al quedarse quieto, el aparato

- **Estado:** aceptada
- **Fecha:** 2026-10-25 · **Decidió:** dueño del proyecto (F-008, D4)

## Contexto
Cada refresco parcial del foco deja algo de fantasma, y el completo rápido no limpia del todo. `full_refresh` existía en el índice, pero sin significado ni uso.

## Decisión
`full_refresh: true` significa **«la próxima imagen, con el refresco completo lento (limpio)»**. El servidor lo pone en el **primer índice de cada día local** de cada pantalla. El aparato, por su lado, hace un completo rápido en cada cambio de imagen o de vista, y otro **al quedarse quieto** (unos 30 s sin toques, quitando el foco) o tras un tope de parciales seguidos que se mide en el panel (M9).

## Consecuencias
El servidor recuerda en memoria el día del último `true` por pantalla; tras un reinicio, el primer índice vuelve a pedir el completo lento (una limpieza de más, sin daño).
