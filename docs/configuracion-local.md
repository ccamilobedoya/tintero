# Configuración local (fuera del repo)

> Todo lo personal, de infraestructura o secreto vive **fuera del repo** (ADR-0023). Aquí solo están las instrucciones.

| Archivo (fuera del repo) | Para qué | Formato |
|--------------------------|----------|---------|
| `~/.config/tintero/local.env` (o `$TINTERO_LOCAL_ENV`) | Dónde está Trilium y en qué nota se publican las fichas (`tools/publicar-ficha`) | Ver `config/local.env.example` |
| El archivo que indique `TRILIUM_TOKEN_FILE` | El token de la API de Trilium | Una línea `TRILIUM_ETAPI_TOKEN=<token>` |
| `~/.config/tintero/private-terms.txt` (o `$TINTERO_PRIVATE_TERMS`) | Términos que **nunca** pueden llegar al repo: nombres, servidores, direcciones, IDs de notas, rutas locales | Uno por línea; `#` para comentarios. Se comparan como palabra completa, sin distinguir mayúsculas |

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
