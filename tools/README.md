# tools

Herramientas del proceso: revisar, check-scope, publicar-ficha, mapa, hooks de git y de Claude Code, y las reglas propias de semgrep (`semgrep/`). Las mantiene el arquitecto.

## Publicación (F-018, ADR-0061)
- `tools/revision-publicacion`: la revisión 1 antes de publicar. Términos privados, gitleaks, `lib/public-scan.ts` y trufflehog (sin red y sin verificación), sobre el árbol y la historia de todas las ramas, más la hoja de contactos de las imágenes en `.revisar/publicacion/`. Falla cerrado.
- `lib/public-scan.ts --tree | --history`: rutas personales, correos, nombres `*.ts.net`, IP, llaves privadas, cadenas de alta entropía y metadatos de imágenes. Las excepciones van en `public-scan-allow.txt`, con su motivo; también sirven para trufflehog (`trufflehog:<Detector>`).
- `lib/never-commit.ts` y `never-commit.txt`: el *pre-commit* rechaza esos archivos por nombre, aunque se agreguen con `git add -f`.
- `tools/imagenes-guia`: las imágenes de `docs/guide/images/`, dibujadas solo con los ejemplos de `config/`.
