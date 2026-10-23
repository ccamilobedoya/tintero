# ADR-0026 · Fastify como framework web

- **Estado:** aceptada
- **Fecha:** 2026-10-22 · **Decidió:** dueño del proyecto (F-003, puerta 1)

## Contexto
El servidor necesita rutear, limitar cuerpos y cabeceras, y más adelante HTTPS con certificado de cliente (F-004) y la web de configuración.

## Decisión
Fastify 5.x. Sin esquemas de ruta (la validación es la del contrato, ADR-0019; no se usa el compilador de Ajv); cuerpos leídos como texto con `bodyLimit`; registro propio (`logger: false`); errores convertidos al contrato. El arquitecto había propuesto Hono (2 paquetes); el dueño eligió Fastify (47 paquetes, más maduro).

## Consecuencias
Más paquetes de npm bajo las protecciones de ADR-0016 (firmas, auditoría, osv-scanner). Soporta HTTPS con `requestCert` para F-004.
