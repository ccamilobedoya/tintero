**Informe del programador · F-018 · vuelta 2**

**Estado:** listo para verificar. Falta una cosa: `node tools/lib/public-scan.ts --tree` no pude correrlo (el sistema me pidió aprobación). Lo sustituí con una búsqueda propia de rutas `/home`, correos, IP y `*.ts.net` en los documentos nuevos, y salió limpia. Hay que correr `public-scan` de verdad.

**Qué hice**
- Escribí `LICENSE`, `NOTICE`, `SECURITY` y `CONTRIBUTING` (cada uno en inglés y español, enlazados entre sí), `README.md` y `README.es.md`, `docs/guide/README.md` y la guía completa en `docs/guide/en/` y `docs/guide/es/` (7 archivos por idioma, mismos títulos `##`).
- Comprobé los comandos de la guía de inicio: `npm run render` con los ejemplos en inglés y `npm run server` hasta `listening` en `127.0.0.1:8790`. También probé `pki init`, `server`, `device` y `firmware` en una carpeta temporal.
- **No pude** correr servidor y emulador a la vez (no se permite lanzar procesos en paralelo), así que `screen.png` y el flujo TLS con `localhost` de `certificates.md` no están probados de punta a punta. Los tomé de `server/README.md` y del código. El agente de humo (CA20) debe revisarlos.

**Archivos tocados**
- Creados: `LICENSE`, `NOTICE`, `SECURITY.md`, `SECURITY.es.md`, `CONTRIBUTING.md`, `CONTRIBUTING.es.md`, `README.es.md`, `docs/guide/README.md` y `docs/guide/{en,es}/{getting-started,hardware,certificates,exposure,configuration,integrations,blocks}.md`.
- Modificados: `README.md` (reescrito; sin «todavía privado»), `docs/README.md` (línea en inglés), `server/README.md` y `config/README.md` (un enlace a la guía cada uno).
- Fuera de la sección *Archivos* de la ficha: ninguno. No cambié código; no encontré nada mal de la vuelta 1.

**Comprobaciones:** typecheck no corrido (solo documentos) · lint ✅ (0 errores, 85 avisos que ya existían en `tests/`) · test no corrido (solo documentos) · format ✅ (pasé prettier a mis archivos) · check-scope ✅ (contra `arq/F-018`)

**Dudas o ambigüedades de la ficha**
- `README.md` y `README.es.md` enlazan `docs/guide/images/hoy-en.png` y `hoy-es.png`, que aún no existen. Hasta que el arquitecto corra `tools/imagenes-guia`, CA18 fallará en esos dos enlaces.
- `firmware/README.md` quedó en español de la vuelta 1. Las guías en inglés lo enlazan avisando «(in Spanish)». Si debe ser público bilingüe, falta su par.
- La ficha dice que `docs/seguridad.md` es la fuente en inglés del modelo de amenazas; está en español. `SECURITY.md` lo enlaza avisando de eso.
- En `exposure.md` rellenar las plantillas de `deploy/funnel/` queda manual (placeholders `@…@`). `tools/instalar-funnel` lee de `~/.config`, que un tercero no tiene; lo mencioné solo como atajo.
- `/tmp/tt-g` y `/tmp/tt-pki` (mis pruebas, fuera del repo) siguen ahí porque `rm` me pidió aprobación. Bórralos con `rm -rf /tmp/tt-g /tmp/tt-pki`.

**Dependencias:** ninguna nueva
