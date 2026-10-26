# ADR-0060 · El firmware vive en el repo y sus certificados salen de `npm run pki`

- **Estado:** aceptada · amplía ADR-0013
- **Fecha:** 2026-10-26 · **Decidió:** dueño del proyecto (F-018, D4 y D5)

## Contexto
El firmware probado en el panel vivía fuera del repo, con un generador de certificados aparte (en otro lenguaje) que traía el nombre público escrito en el código.

## Decisión
- `firmware/` es la **copia maestra** del firmware (PlatformIO). Sin nombres de personas, nombres públicos, redes ni direcciones; comentarios en inglés. El dueño sigue siendo quien decide cada cambio (ADR-0013).
- `npm run pki -- firmware <carpeta-pki> --host <nombre> <pN>…` escribe `firmware/include/tintero_certs.h` (600) con la CA, el certificado y la llave de cada pantalla y el nombre del servidor. El nombre es obligatorio, sin valor por defecto; la herramienta se niega a escribir en un archivo que git vea y nunca imprime una llave.

## Consecuencias
Un solo lenguaje y una sola herramienta para toda la PKI. El archivo generado y `secrets.h` los ignora git y los bloquea el *pre-commit* por nombre.
