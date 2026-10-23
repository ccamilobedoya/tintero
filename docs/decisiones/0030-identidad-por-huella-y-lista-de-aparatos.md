# ADR-0030 · Identidad de la pantalla por la huella de su certificado

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · **Decidió:** dueño del proyecto (F-004, puerta 1, D3)

## Contexto
Con la CA privada (ADR-0029), hace falta saber **qué** pantalla habla y poder revocarla.

## Decisión
La identidad es la **huella SHA-256 del certificado** (DER, hexadecimal en minúscula), buscada en una **lista de aparatos** (archivo fuera del repo, `<huella> <id>` por línea). Revocar = quitar la línea; el servidor relee el archivo cuando cambia, sin reiniciar. Una pantalla con certificado válido pero no listada recibe **404 vacío** (L3). Si la lista es inválida, nadie está listado (falla cerrado).

## Consecuencias
Revocar no necesita listas de revocación (CRL) ni reemitir. La lista es un archivo hasta que exista la base de datos.
