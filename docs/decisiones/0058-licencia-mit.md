# ADR-0058 · Licencia MIT, sin binarios del firmware

- **Estado:** aceptada
- **Fecha:** 2026-10-26 · **Decidió:** dueño del proyecto (F-018, D1 y D9)

## Contexto
El repositorio es público pero no tenía licencia: sin ella nadie puede usarlo legalmente. El firmware enlaza GxEPD2, que es GPL-3.0.

## Decisión
Todo lo propio (servidor, emulador, contrato, herramientas, firmware, documentos e imágenes) va con **MIT** (`LICENSE`, `Copyright (c) 2026 Tintero contributors`). Las letras conservan sus licencias. **No se publican binarios del firmware:** un binario compilado con GxEPD2 queda entero bajo GPL-3.0 (lo explican `NOTICE` y `firmware/README.md`). Las vulnerabilidades se reportan por el reporte privado de GitHub (`SECURITY.md`); en GitHub se activan *secret scanning* con *push protection* y las alertas de Dependabot.

## Consecuencias
Cualquiera puede usar, cambiar y redistribuir el código. Ninguna dependencia de producción puede ser GPL, AGPL, LGPL ni SSPL sin otra decisión. Un instalador del firmware desde el navegador necesitaría cumplir la GPL-3.0.
