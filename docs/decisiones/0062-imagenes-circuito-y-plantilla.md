# ADR-0062 · Imágenes solo con datos de ejemplo, circuito con `protoboard-iso` y una integración de ejemplo

- **Estado:** aceptada
- **Fecha:** 2026-10-26 · **Decidió:** dueño del proyecto (F-018, D6, D7 y D8)

## Contexto
La documentación pública necesita mostrar lo que se ve, cómo se cablea y cómo se escribe una integración, sin datos reales.

## Decisión
- Las imágenes de la guía las genera un script (`tools/imagenes-guia`) con los ejemplos de `config/`, reloj y panel fijos, sin metadatos. Ninguna foto del panel real salvo una que el dueño apruebe aparte, con datos de ejemplo.
- El circuito de ejemplo (ESP32 DevKit, DESPI-C02 y los dos botones) se hace con el kit `protoboard-iso` (MIT); en el repo va su JSON y su SVG.
- `example-json` es una integración real, con pruebas, que sirve de plantilla: solo `GET` por `https`, sin llave, respuesta acotada, sin redirecciones. Está apagada si no se configura.

## Consecuencias
Volver a correr el script da los mismos bytes. La guía de integraciones usa `festivos` como ejemplo resuelto y `example-json` como plantilla para copiar.
