# ADR-0059 · Lo público en inglés y español; las vistas con idioma

- **Estado:** aceptada
- **Fecha:** 2026-10-26 · **Decidió:** dueño del proyecto (F-018, D2 y D3)

## Contexto
Lo que ve alguien que llega al repositorio estaba solo en español, y las vistas dibujaban textos fijos en español.

## Decisión
- `README.md`, `SECURITY.md`, `CONTRIBUTING.md` y la guía de uso (`docs/guide/en/`) en **inglés**, cada uno con su par en español (`*.es.md`, `docs/guide/es/`). Lo interno (fichas, ADR, informes, lecciones, proceso) sigue en español.
- El archivo de vistas lleva `"locale": "es" | "en"` (por defecto `es`). Todo texto fijo que dibuja el motor sale de un catálogo por idioma, con las mismas claves en todos.

## Consecuencias
Con `es` las imágenes no cambian. Cada texto fijo nuevo de un bloque se agrega a todos los catálogos (lo comprueba una prueba). Los títulos de las vistas los escribe quien configura, en su idioma.
