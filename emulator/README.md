# emulator

Emulador de pantalla: un cliente que se porta como el ESP32 (contrato v1, navegación con dos botones) y deja en una carpeta lo que mostraría el panel.

## Uso desde la línea de comandos

```bash
npm run contract:mock        # simulador Prism en 127.0.0.1:4010 (otra terminal)
npm run emulator -- --server http://127.0.0.1:4010 --store /tmp/emu --wakes 1 --keys tab,ok
```

Opciones: `--server <url>` (http o https, obligatoria), `--store <carpeta>` (por defecto, una carpeta en el directorio temporal del sistema; que quede fuera del repo), `--panel w=800,h=480,dpi=124,depth=1`, `--formats raw1`, `--power battery|usb`, `--battery-mv N`, `--rssi N`, `--firmware txt`, `--extra-views N`, `--flash-bytes N`, `--timeout-ms N`, `--wakes N` (1) y `--keys tab,long-tab,ok,long-ok`.

Corre las despertadas seguidas (sin dormir), luego los toques, e imprime un JSON por línea (`WakeReport` o `PressReport`). Salida 0 si terminó (aunque reporte errores); 2 con opciones inválidas.

## Desde código

`runWake(config)` y `press(config, key)` (ver `src/index.ts`); `defaultConfig(server, store)` da la configuración por defecto.

## Carpeta de almacenamiento (la «flash»)

| Archivo                                                          | Contenido                                       |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| `index.json`                                                     | Último índice válido                            |
| `views/<id>.raw1`, `views/<id>.zones.json`, `views/<id>.meta.json` | Imagen, zonas y huella de cada vista guardada |
| `queue.json`                                                     | Acciones pendientes (se mandan en la despertada) |
| `state.json`                                                     | Vista actual y zona con foco                    |
| `screen.raw1`, `screen.png`                                      | Lo que muestra el panel ahora (ábrelo con cualquier visor) |

La suma de `views/*` y `queue.json` nunca pasa `flashBytes`. El emulador no estima batería: reporta peticiones, bytes y conexiones.
