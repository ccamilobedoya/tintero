# config

Ejemplos de configuración local con valores de relleno. Los valores reales van fuera del repo (ver docs/configuracion-local.md). Cómo se usan estos archivos: [`docs/guide/es/configuration.md`](../docs/guide/es/configuration.md).

- `agenda.views.example.json` y `agenda.data.example.json` (F-014): la agenda de pantalla completa con un pictograma por calendario y los festivos (`holidays: true`) junto al mes.
- `hoy.views.example.json` y `hoy.data.example.json` (F-015): la distribución de «hoy» (tareas a la izquierda, próximos eventos en columna de día y el mes a la derecha) más el tablero; los datos son los de `tablero` y `calendario` de los ejemplos del tablero y de la agenda.
- `hoy.views.example.en.json` y `hoy.data.example.en.json` (F-018): los mismos de `hoy` en inglés (`"locale": "en"`, títulos y datos traducidos); son los que muestra el `README.md`.
- `tablero.views.example.en.json`, `tablero.data.example.en.json`, `agenda.views.example.en.json` y `agenda.data.example.en.json` (F-018): los mismos de `tablero` y `agenda` en inglés (`"locale": "en"`); de ellos salen las imágenes en inglés del `README.md`.
- `example-json.views.example.json`, `example-json.data.example.json` y `example-json.integrations.example.json` (F-018): la integración de ejemplo `example-json` (un JSON público por `https`, apagada si no se configura). El archivo de integraciones solo trae valores de relleno (`https://example.com/…`).
- `calendarios.example.json` (F-014): el archivo de calendarios (id, pictograma y dirección de cada uno). Las direcciones reales son secretas: el archivo va fuera del repo, con permisos 600.
