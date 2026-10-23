# server

Servidor mínimo de Tintero (F-003): habla el contrato v1 con vistas de demostración (`demo`, `detalle`, `patron`) dibujadas por código en `raw1`, para cualquier panel declarado. Solo escucha en `127.0.0.1` (sin autenticación hasta F-004); el estado vive en memoria.

## Arrancar

```bash
npm run server -- [--port 8790] [--host 127.0.0.1] [--next-wake-s 1800] [--headers-timeout-ms 10000]
```

La primera línea de la salida es `{"listening":"http://127.0.0.1:<puerto>"}` (`--port 0` elige un puerto libre). `--host` distinto de `127.0.0.1` sale con código 2. Cada petición escribe una línea JSON en la salida estándar, sin contenido (S6).

## Probarlo con el emulador

```bash
npm run server -- --port 8790
# en otra terminal (la carpeta de --store debe estar fuera del repo):
npm run emulator -- --server http://127.0.0.1:8790 --store /tmp/tintero-emu --wakes 1 --keys tab,ok
```

`screen.png` en la carpeta del emulador muestra la demostración; con `--keys tab,ok` se marca una casilla. La vista `patron` trae una cuadrícula de 1 cm para comprobar el tamaño con una regla.

## Código (`src/`)

- `index.ts`: `createApp`, `startServer`, `demoViews` (interfaz para pruebas). `main.ts` y `args.ts`: arranque.
- `app.ts`: rutas, límites, errores, caché y registro de peticiones. `log.ts`: registro.
- `views.ts`, `draw.ts`, `state.ts`: vistas de demostración, dibujo `raw1` y estado.
