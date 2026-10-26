# Primeros pasos

[Read in English](../en/getting-started.md)

Esta página te lleva de una máquina limpia a ver la vista `hoy`, **sin ningún hardware**. Toma unos minutos. Los pasos se comprobaron en Linux.

## Qué necesitas

- **Node 24.** El repositorio trae un archivo `.nvmrc`; con [nvm](https://github.com/nvm-sh/nvm) basta correr `nvm install` y `nvm use` en la carpeta del repositorio. Comprueba con `node --version` (debe empezar con `v24`).
- **Docker**, y tu usuario debe poder usarlo (`docker info` tiene que funcionar sin `sudo`). El servidor dibuja las vistas dentro de un contenedor de Chromium sin red.
- **git** y una terminal. Los comandos de abajo parten de la carpeta del repositorio.

## Instalar

```bash
npm ci && npm run setup
```

`npm ci` instala las versiones exactas de `package-lock.json`. `npm run setup` activa los hooks de git (solo corre `git config core.hooksPath tools/git-hooks`).

## Trae primero la imagen de Chromium

El servidor arranca su contenedor de Chromium con `--pull never`: nunca descarga nada por su cuenta, así que la imagen ya tiene que estar en tu máquina. La imagen está fijada por *digest* en `tools/images.conf` (la línea `CHROMIUM_IMAGE`). Este comando la lee de ahí y la descarga:

```bash
docker pull "$(grep '^CHROMIUM_IMAGE=' tools/images.conf | cut -d= -f2 | cut -d' ' -f1)"
```

Córrelo una vez. Si te lo saltas, el servidor se queda esperando y registra `"code":"image-missing"`.

## Arrancar el servidor con los ejemplos

```bash
npm run server -- --port 8790 \
  --views config/hoy.views.example.json \
  --data config/hoy.data.example.json
```

Espera esta línea (el primer arranque puede tardar unos segundos mientras sube Chromium):

```
{"listening":"http://127.0.0.1:8790"}
```

Deja esta terminal abierta. El servidor escucha solo en `127.0.0.1`, así que nada fuera de tu máquina puede llegar a él. Con Ctrl+C lo detienes, y también detiene el contenedor de Chromium.

Los dos archivos son JSON simple: `hoy.views.example.json` dice qué muestra cada vista y `hoy.data.example.json` trae las tareas y los eventos de ejemplo. Para ver los textos en inglés, usa `hoy.views.example.en.json` y `hoy.data.example.en.json`.

## Ver la vista hoy

Abre una **segunda terminal** en la carpeta del repositorio y corre el emulador. Se porta como el ESP32: despierta una vez, pregunta al servidor qué cambió, descarga la imagen y guarda lo que mostraría el panel.

```bash
npm run emulator -- --server http://127.0.0.1:8790 --store /tmp/tintero-emu --wakes 1
```

Ahora abre `/tmp/tintero-emu/screen.png` con cualquier visor de imágenes. Esa es la vista `hoy`: las tareas a la izquierda, y los próximos eventos y el mes a la derecha. La carpeta de `--store` tiene que quedar fuera del repositorio.

Para pulsar también los botones, agrega `--keys tab,ok`: `tab` es el botón Mover (pasa el foco a la tarea siguiente) y `ok` es el botón Aceptar (marca la tarea).

### Sin servidor: dibujar directamente

Si solo quieres las imágenes, no necesitas el servidor ni el emulador:

```bash
npm run render -- --views config/hoy.views.example.json --data config/hoy.data.example.json \
  --panel w=800,h=480,dpi=124,depth=1 --now 2026-10-26T13:00:00Z --out /tmp/tintero-views
```

Esto escribe `/tmp/tintero-views/hoy.png` (la imagen que recibe el aparato), `hoy.zones.png` (la misma con el borde de cada zona de foco) y los mismos archivos de la segunda vista, `tablero`. También necesita Docker y la imagen de Chromium. La carpeta de salida debe quedar fuera del repositorio.

## Si algo falla

- **El servidor nunca imprime `listening`.** Comprueba que Docker funcione (`docker info`) y que hayas traído la imagen (arriba). El servidor reintenta solo y registra el motivo.
- **`address already in use`.** Elige otro puerto con `--port` y usa el mismo en el emulador.
- **El emulador no se conecta.** El servidor tiene que seguir corriendo en la primera terminal, y `--server` debe llevar su puerto.

## Siguientes pasos

- Cambiar los ejemplos: [Configuración](configuration.md).
- Armar la pantalla real: [Hardware](hardware.md), luego [Certificados](certificates.md) y [Exposición](exposure.md).
- Agregar tu propia fuente de datos: [Integraciones](integrations.md). Agregar tu propio tipo de vista: [Bloques](blocks.md).
