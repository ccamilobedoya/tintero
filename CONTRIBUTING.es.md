# Cómo contribuir

[Read in English](CONTRIBUTING.md)

Gracias por ayudar. Esta página explica cómo preparar el proyecto, qué revisar antes de enviar un cambio y qué nunca debe entrar al repositorio.

## Preparar el entorno

Necesitas Node 24 (ver `.nvmrc`) y Docker. Luego, desde la carpeta del repositorio:

```bash
npm ci && npm run setup   # dependencias + hooks de git
```

`npm ci` instala exactamente lo que dice `package-lock.json`. Por favor, no corras `npm install <paquete>`: una dependencia nueva necesita un buen motivo, y la revisión lo va a pedir.

## Comprobaciones antes de enviar un cambio

Todas tienen que pasar:

```bash
npm run typecheck     # TypeScript estricto
npm run lint          # ESLint con reglas de seguridad
npm test              # pruebas unitarias (Vitest), junto al código en *.test.ts
npm run format:check  # Prettier
tools/revisar         # la revisión completa (necesita Docker); el resumen queda en .revisar/resumen.md
```

Escribe pruebas unitarias para el código que agregues. El código, los identificadores y los comentarios van en inglés.

## Lo que nunca debe entrar

- **Nada personal, nada de tu propia infraestructura, ningún secreto.** Ni nombres reales, ni redes de tu casa o tu oficina, ni nombres `*.ts.net`, direcciones IP, correos, rutas de tu máquina, llaves, tokens o direcciones de calendarios. Usa valores de relleno como `tintero.example.ts.net`, `example.com`, `p1` y `/path/to/pki`.
- Archivos como `secrets.h`, `tintero_certs.h`, `*.key`, `*.pem`, `devices.txt` y `.env*` los bloquea por nombre el hook de *pre-commit* (la lista completa está en `tools/never-commit.txt`).
- Toda entrada de afuera (red, archivos, cabeceras, salida de otros programas) lleva un límite de tamaño **antes** de interpretarse.
- Los servicios locales escuchan solo en `127.0.0.1`. Por favor, no agregues ejemplos ni documentos que usen HTTP sin TLS, permisos abiertos o que apaguen la revisión de certificados.

Si encuentras un problema de seguridad, no abras un *issue*: sigue [SECURITY.es.md](SECURITY.es.md).

## Sobre el proceso con agentes

El autor construye Tintero con un proceso de agentes de IA (fichas, decisiones de arquitectura, revisiones) descrito en [`docs/PROCESO.md`](docs/PROCESO.md). Ese proceso es el del autor y **no** se te exige. Un *pull request* normal que pase las comprobaciones de arriba es bienvenido.

Al contribuir aceptas que tu trabajo se publique bajo la [licencia MIT](LICENSE).
