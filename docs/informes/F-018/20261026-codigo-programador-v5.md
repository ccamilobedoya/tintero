**Informe del programador — F-018, vuelta 5 (R18b, R21b)**

**Resultado:** hecho. `typecheck`, `lint` (0 errores), `npm test` (547 pasan, 2 omitidas), `format:check` y `tools/check-scope programador --base arq/F-018` pasan.

**Archivos**
- `README.md`: sección «How it works» entre la imagen principal y «What you need».
  - Contiene el diagrama `architecture.en.svg` con 4 líneas de recorrido.
  - Incluye una galería de `today`, `board` y `agenda` con `hoy-en.png`, `tablero-en.png` y `agenda-en.png`.
  - Explica los botones Move y Accept y enlaza `firmware/README.md`.
  - Muestra el circuito `tintero-buttons.front.svg` con enlace a la guía de hardware.
- `README.es.md`: sección «Cómo funciona», equivalente, con `architecture.es.svg` y las imágenes `-es.png`.
- Nuevos: `config/tablero.views.example.en.json`, `config/tablero.data.example.en.json`, `config/agenda.views.example.en.json` y `config/agenda.data.example.en.json`.
  - Llevan `"locale": "en"` y títulos y datos traducidos, reutilizando los de `hoy.data.example.en.json`.
- `config/README.md`: lista los cuatro ejemplos nuevos.

**Comprobación de los ejemplos**
- Dibujé `tablero` (vistas `hoy` y `tablero`) y `agenda` con los parámetros pedidos y sin error.
- Vi los `.png` de `tablero` y `agenda` y salen en inglés («Board», «IN PROGRESS», «Upcoming events», «mon 26 oct»), sin textos del catálogo `es`. No abrí `hoy.png`, la vista `hoy` de `tablero`.
- La columna «Done today» del tablero sale con 0 y «Nothing done today.». Es lo que dan los datos de ejemplo, igual que en español.

**Pendientes**
- Los PNG `hoy-en`, `tablero-en`, `agenda-en` y los `-es` no existen aún en `docs/guide/images/` (solo están los dos SVG de arquitectura). Los genera el arquitecto con `tools/imagenes-guia`. Hasta entonces los enlaces de ambos README apuntan a archivos que no existen.
- Quedan salidas de prueba fuera del repo en `/tmp/o-tab` y `/tmp/o-age`. El borrado quedó bloqueado por permisos y no afecta al repo.
