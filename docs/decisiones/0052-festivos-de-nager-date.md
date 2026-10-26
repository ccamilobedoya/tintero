# ADR-0052 · Festivos por país desde Nager.Date

- **Estado:** aceptada
- **Fecha:** 2026-10-25 · **Decidió:** dueño del proyecto (F-013, D4 y D5)

## Contexto
Los festivos cambian por ley (en 2026 un país del primer ejemplo agregó uno nuevo a mitad de año) y el proyecto debe servir en cualquier país. Escribir reglas por país obliga a una ficha por cada cambio de ley; la librería `date-holidays` suma 11 MB y 12 dependencias.

## Decisión
Los festivos se leen de **Nager.Date** (`date.nager.at`, sin llave), una consulta por país y año, con caché opcional en un archivo de estado. El país va en la configuración de vistas (`holidays.country`, ISO 3166-1 de dos letras; los ejemplos usan `CO`) con correcciones locales `add` y `remove`. La lectura es una integración (`festivos`) y solo sale a la red si el archivo de integraciones la enciende.

## Consecuencias
Sin red y sin caché el mes se dibuja sin festivos, nunca falla. El cliente con guardia acepta integraciones sin llave (`needsKey: false`). Nager.Date solo recibe el país y el año.
