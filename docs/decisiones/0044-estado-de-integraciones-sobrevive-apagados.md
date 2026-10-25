# ADR-0044 · El estado de las integraciones sobrevive a un apagado

- **Estado:** aceptada (amplía ADR-0041)
- **Fecha:** 2026-10-24 · **Decidió:** dueño del proyecto (F-009, vuelta 2, D17)

## Contexto
El servidor de la casa se apaga a veces (cortes de luz, racionamiento) y puede quedarse sin internet. ADR-0041 dejaba las marcas pendientes en memoria: un apagado las perdía, y al volver sin Trilium la pantalla salía vacía.

## Decisión
Cada integración puede guardar sus **pendientes** y su **última lectura buena** (con la hora) en un archivo local fuera del repo (permisos 600), escrito de forma **atómica** (temporal, `fsync`, `rename`). Al arrancar se carga: la pantalla vuelve con lo último y «sin datos desde» con la hora real (y el día si no es hoy), y los pendientes se escriben cuando el servicio vuelva; las 24 h de ADR-0041 siguen contando aunque el servidor esté apagado. Una lectura guardada de más de 24 h se descarta. Un archivo dañado, enorme o con permisos abiertos se ignora y se registra: **nunca impide arrancar**.

## Consecuencias
El archivo guarda títulos de tareas en el mismo servidor que ya guarda Trilium; se puede borrar sin perder nada de Trilium (solo las marcas aún no escritas). La bóveda cifrada, cuando llegue, decide si este archivo se cifra.
