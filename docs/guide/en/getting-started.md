# Getting started

[Leer en español](../es/getting-started.md)

This page takes you from a clean machine to seeing the `today` view, **without any hardware**. It takes a few minutes. The steps were checked on Linux.

## What you need

- **Node 24.** The repository has a `.nvmrc` file; with [nvm](https://github.com/nvm-sh/nvm) just run `nvm install` and `nvm use` in the repository folder. Check with `node --version` (it must start with `v24`).
- **Docker**, and your user must be allowed to run it (`docker info` must work without `sudo`). The server draws the views inside a Chromium container that has no network.
- **git** and a terminal. The commands below start in the repository folder.

## Install

```bash
npm ci && npm run setup
```

`npm ci` installs the exact versions from `package-lock.json`. `npm run setup` turns on the git hooks (it only runs `git config core.hooksPath tools/git-hooks`).

## Pull the Chromium image first

The server starts its Chromium container with `--pull never`: it never downloads anything by itself, so the image must already be on your machine. The image is pinned by digest in `tools/images.conf` (the `CHROMIUM_IMAGE` line). This command reads it from there and pulls it:

```bash
docker pull "$(grep '^CHROMIUM_IMAGE=' tools/images.conf | cut -d= -f2 | cut -d' ' -f1)"
```

Run it once. If you skip it, the server keeps waiting and logs `"code":"image-missing"`.

## Start the server with the examples

```bash
npm run server -- --port 8790 \
  --views config/hoy.views.example.en.json \
  --data config/hoy.data.example.en.json
```

Wait for this line (the first start can take a few seconds while Chromium starts):

```
{"listening":"http://127.0.0.1:8790"}
```

Leave this terminal open. The server listens only on `127.0.0.1`, so nothing outside your machine can reach it. Press Ctrl+C when you are done; it also stops the Chromium container.

The two files are plain JSON: `hoy.views.example.en.json` says what each view shows (`"locale": "en"` makes the fixed texts English), and `hoy.data.example.en.json` has the sample tasks and events. For Spanish, use `hoy.views.example.json` and `hoy.data.example.json`.

## See the today view

Open a **second terminal** in the repository folder and run the emulator. It behaves like the ESP32: it wakes up once, asks the server what changed, downloads the image, and saves what the panel would show.

```bash
npm run emulator -- --server http://127.0.0.1:8790 --store /tmp/tintero-emu --wakes 1
```

Now open `/tmp/tintero-emu/screen.png` with any image viewer. That is the `today` view: tasks on the left, upcoming events and the month on the right. The `--store` folder must be outside the repository.

To also press the buttons, add `--keys tab,ok`: `tab` is the Move button (it moves the focus to the next task) and `ok` is the Accept button (it checks the task).

### Without a server: render directly

If you only want the pictures, you do not need the server or the emulator:

```bash
npm run render -- --views config/hoy.views.example.en.json --data config/hoy.data.example.en.json \
  --panel w=800,h=480,dpi=124,depth=1 --now 2026-10-26T13:00:00Z --out /tmp/tintero-views
```

This writes `/tmp/tintero-views/hoy.png` (the image the device receives), `hoy.zones.png` (the same with each focus zone outlined) and the same files for the second view, `tablero`. It still needs Docker and the Chromium image. The output folder must be outside the repository.

## If something fails

- **The server never prints `listening`.** Check that Docker works (`docker info`) and that you pulled the image (see above). The server retries by itself, and logs the reason.
- **`address already in use`.** Pick another port with `--port`, and use the same one in the emulator.
- **The emulator cannot connect.** The server must still be running in the first terminal, and `--server` must match its port.

## Next steps

- Change the examples: [Configuration](configuration.md).
- Build the real display: [Hardware](hardware.md), then [Certificates](certificates.md) and [Exposure](exposure.md).
- Add your own data source: [Integrations](integrations.md). Add your own kind of view: [Blocks](blocks.md).
