# ADR-0061 · El correo del autor se queda; las brechas se quitan de la historia; revisión doble antes de publicar

- **Estado:** aceptada · excepción acotada a ADR-0022
- **Fecha:** 2026-10-26 · **Decidió:** dueño del proyecto (F-018, D10 y D11)

## Contexto
El repositorio es público. Los *commits* llevan el correo del dueño como autor. Una llave o un dato privado que llegue a un *commit* queda en la historia aunque se borre después.

## Decisión
- El correo del dueño **se queda** como autor de los *commits*. En el contenido de los archivos y en los mensajes no puede aparecer ningún dato personal, de infraestructura ni privilegiado.
- Antes de publicar un cambio grande hay **dos revisiones independientes**: (1) herramientas que fallan cerrado: lista de términos privados, gitleaks, `tools/lib/public-scan.ts` y **trufflehog** (sin red y sin verificación), sobre el árbol y la historia de todas las ramas; (2) un revisor con modelo que no ve el resultado de la primera, y el dueño, que mira la hoja de contactos de las imágenes.
- Si una revisión encuentra una **brecha en la historia**, se revoca primero lo filtrado y después se reescriben todas las ramas con `git filter-repo` y se suben con `git push --force-with-lease` (procedimiento R23 de F-018). Es la **única** excepción a ADR-0022, la hace el integrador y necesita la aprobación del dueño para cada caso.

## Consecuencias
Quitar algo de la historia no deshace que alguien lo haya copiado: por eso se revoca primero. Las copias de trabajo y las carpetas de los agentes se vuelven a clonar tras una limpieza.
