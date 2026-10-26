# Configuración local (fuera del repo)

> Todo lo personal, de infraestructura o secreto vive **fuera del repo** (ADR-0023). Aquí solo están las instrucciones.

| Archivo (fuera del repo) | Para qué | Formato |
|--------------------------|----------|---------|
| `~/.config/tintero/local.env` (o `$TINTERO_LOCAL_ENV`) | Dónde está Trilium y en qué nota se publican las fichas (`tools/publicar-ficha`) | Ver `config/local.env.example` |
| El archivo que indique `TRILIUM_TOKEN_FILE` | El token de la API de Trilium | Una línea `TRILIUM_ETAPI_TOKEN=<token>` |
| `~/.config/tintero/private-terms.txt` (o `$TINTERO_PRIVATE_TERMS`) | Términos que **nunca** pueden llegar al repo: nombres, servidores, direcciones, IDs de notas, rutas locales | Uno por línea; `#` para comentarios. Se comparan como palabra completa, sin distinguir mayúsculas |

| `~/.config/tintero/local.env`, claves `TINTERO_DIR`, `TINTERO_NODE`, `TINTERO_ARGS` | El servicio de systemd de usuario (F-010, `tools/instalar-servicio`): carpeta del repo que corre el servicio, ruta absoluta de `node` y las opciones del servidor | Ver `config/local.env.example` |
| `~/.config/tintero/local.env`, claves `TINTERO_FUNNEL_DIR`, `TINTERO_TLS_PORT`, `TINTERO_AUTHKEY_FILE` | El nodo de Tailscale propio (F-012, `tools/instalar-funnel`): carpeta del nodo, puerto TLS local de Tintero y el archivo con `TS_AUTHKEY=<llave>` | Ver `config/local.env.example` |
| `~/.config/tintero/local.env`, claves `TINTERO_EMULATOR_ARGS`, `TINTERO_EMULATOR_SERVER`, `TINTERO_TRILIUM_CONTAINER` (opcionales) | `tools/prueba-recuperacion`: opciones TLS del emulador, la URL pública (con TLS) y el contenedor de Trilium | Ver `config/local.env.example` |
| El archivo que indique `calendarsFile` en las integraciones (`ical-calendario`, F-014) | Las direcciones iCalendar de los calendarios (el «calendario público» de iCloud, la «dirección secreta en formato iCal» de Google…). **Son secretos**: no se pegan en chats ni en el repo | Un arreglo JSON de 1 a 10 `{ "id", "icon", "url" }`; ver `config/calendarios.example.json`. Se crea con `install -m 600 /dev/null <archivo>` y se edita a mano |

Todos con permisos **600** y la carpeta con **700**.

## Qué revisa la lista de términos privados
- `pre-commit`: los archivos que se van a guardar.
- `commit-msg`: el mensaje del *commit*.
- `pre-push`: toda la historia, antes de subir.
- `tools/revisar`: el árbol de trabajo (herramienta «privacidad»).

Solo se reporta **archivo y línea**, nunca el término. Si la lista no existe (por ejemplo, un colaborador externo), el control **avisa y no bloquea**.

## Activar los hooks en una copia nueva
```bash
npm ci && npm run setup
```
