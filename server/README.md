# server

Servidor mínimo de Tintero (F-003): habla el contrato v1 con vistas de demostración (`demo`, `detalle`, `patron`) dibujadas por código en `raw1`, para cualquier panel declarado. Solo escucha en `127.0.0.1`, sin TLS (demostración local) o con TLS y certificado de cliente (F-004); el estado vive en memoria.

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

## Exponerlo con certificado por pantalla (F-004, L1)

Con las cuatro opciones TLS el servidor escucha **HTTPS** en `127.0.0.1` y exige el certificado de cliente de una pantalla de la lista. Funnel (`tailscale funnel --tcp`) solo reenvía bytes a ese puerto; el servidor es quien ve el certificado.

```bash
# 1. Autoridad privada y certificados, SIEMPRE en una carpeta fuera del repo (700; llaves 600):
npm run pki -- init /ruta/privada/pki
npm run pki -- server /ruta/privada/pki tintero.ejemplo.ts.net
npm run pki -- device /ruta/privada/pki p1      # imprime «<huella> p1»

# 2. Lista de aparatos (fuera del repo): una línea «<huella> <id>» por pantalla; # = comentario
echo "<la línea impresa>" >> /ruta/privada/devices.txt

# 3. Arrancar
npm run server -- --port 8443 \
  --tls-cert /ruta/privada/pki/server.crt --tls-key /ruta/privada/pki/server.key \
  --client-ca /ruta/privada/pki/ca.crt --devices /ruta/privada/devices.txt
```

- El conteo de paneles por aparato empieza al arrancar el servidor y no se poda; está acotado por aparatos listados × `--max-panels`.
- Las cuatro opciones TLS van juntas; si falta una o un archivo no se lee, sale con 2 sin escuchar. `--max-panels N` (2) limita los paneles distintos por aparato; `--max-connections N` (32).
- Revocar una pantalla = quitar su línea de la lista; se relee sola (sin reiniciar). Si la lista es ilegible, pasa de 64 KiB o tiene una línea inválida, nadie está listado y se registra `devices_error`. Un certificado válido pero no listado recibe 404 vacío.
- `pki` usa la CLI `openssl` (sin _shell_), ECDSA P-256, y se niega a escribir dentro del repo o sobre archivos existentes. Vigencias: CA 10 años, pantalla 5, servidor 2.
- El emulador: `npm run emulator -- --server https://tintero.ejemplo.ts.net:8443 --ca ca.crt --cert devices/p1.crt --key devices/p1.key`.

## Código (`src/`)

- `index.ts`: `createApp`, `startServer`, `demoViews`, `fingerprint` (interfaz para pruebas). `main.ts` y `args.ts`: arranque.
- `app.ts`: rutas, límites, errores, caché (expulsa la menos usada), paneles por aparato y registro de peticiones. `log.ts`: registro.
- `tls.ts`: opciones TLS y huella. `devices.ts`: lista de aparatos. `../scripts/pki.ts`: CA y certificados.
- `views.ts`, `draw.ts`, `state.ts`: vistas de demostración, dibujo `raw1` y estado.
