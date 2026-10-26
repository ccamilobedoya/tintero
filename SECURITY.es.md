# Política de seguridad

[Read in English](SECURITY.md)

## Cómo reportar una vulnerabilidad

Reporta cualquier vulnerabilidad de forma **privada**. Nunca abras un *issue*, un *pull request* ni una discusión pública sobre ella.

Usa el reporte privado de vulnerabilidades de GitHub: abre la pestaña **Security** del repositorio y elige **Report a vulnerability**. Cuenta qué encontraste, cómo reproducirlo y qué le permite hacer a un atacante. Por favor, no incluyas llaves, tokens ni datos personales reales en el reporte.

Te responderemos en cuanto los responsables puedan leerlo. Te pedimos un plazo razonable para corregirlo antes de contárselo a alguien más.

## Qué se considera una vulnerabilidad

Reporta todo lo que rompa alguna de las protecciones de abajo, por ejemplo:

- Un aparato, o un extraño sin certificado de aparato, recibe del servidor algo distinto de un 404 vacío.
- Una llave, un token, una dirección secreta o un archivo privado termina en un registro, una imagen, un mensaje de error o un lugar que git puede ver.
- El servidor o un servicio local escucha en una dirección distinta de `127.0.0.1`, o un documento o una herramienta pide hacerlo.
- Una vista, un bloque o una integración hace una petición de red que no debería, o lee una respuesta sin límite de tamaño.
- Una entrada de la red, de un archivo o de otro programa se interpreta antes de limitar su tamaño.
- Una herramienta o un documento lleva a debilitar la seguridad (HTTP sin TLS, permisos abiertos, apagar la revisión de certificados, apagar la lista de aparatos).

Los fallos que solo afectan la configuración propia y ya confiable de quien instala (por ejemplo, un error de dedo en el archivo de vistas que impide arrancar) son errores normales, no vulnerabilidades.

## Modelo de amenazas en cinco líneas

1. **mTLS por pantalla:** cada pantalla tiene su propio certificado de cliente, y solo se atiende a los aparatos de la lista del servidor.
2. **Silencio ante extraños:** una petición sin un certificado válido y listado recibe un 404 vacío que no delata nada.
3. **Las llaves quedan fuera del repositorio:** llaves, tokens y direcciones de calendarios viven en archivos con permisos 600 fuera del repositorio, y git los rechaza.
4. **Las vistas no tienen red:** el navegador que dibuja las imágenes corre sin red, sin scripts y sin peticiones al exterior.
5. **Solo local:** el servidor y sus servicios locales escuchan en `127.0.0.1`; el TLS termina en el servidor y de internet solo llegan bytes TCP de paso (por ejemplo, con Tailscale Funnel).

La guía completa está en [`docs/guide/es/exposure.md`](docs/guide/es/exposure.md). Las reglas detalladas están en [`docs/seguridad.md`](docs/seguridad.md).
