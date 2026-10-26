# Certificados

[Read in English](../en/certificates.md)

Cada pantalla demuestra quién es con su propio **certificado de cliente** (mTLS). El servidor solo atiende a las pantallas cuyo certificado está en su lista, y las pantallas solo confían en **tu** autoridad privada. Esta página cubre todo el camino: `init` → `server` → `device` → `firmware` → la lista de aparatos → una prueba con el emulador.

## Cómo encaja todo

- **La autoridad (CA)** se crea una sola vez. Firma los demás certificados. Su llave es el archivo más importante que vas a tener.
- **El certificado del servidor** dice «soy `tintero.example.ts.net`». Las pantallas lo comprueban contra la CA.
- **Un certificado por pantalla** (`p1`, `p2`, ...). El servidor lo comprueba contra la CA **y** contra su lista de aparatos.
- **La lista de aparatos** (`devices.txt`) tiene una línea por pantalla: su huella y su id.

La herramienta es `npm run pki`. Usa la línea de comandos de `openssl` (instálalo si no lo tienes), crea llaves ECDSA P-256 y **se niega** a escribir dentro del repositorio o sobre un archivo que ya existe. Usa una carpeta **fuera** del repositorio (se crea con permisos 700 y las llaves con 600). En los ejemplos es `/path/to/pki`.

## Crear la autoridad

```bash
npm run pki -- init /path/to/pki
```

Escribe `ca.crt` (pública) y `ca.key` (secreta) en esa carpeta.

## Crear el certificado del servidor

Usa el nombre público al que se conectarán las pantallas (ver [Exposición](exposure.md)):

```bash
npm run pki -- server /path/to/pki tintero.example.ts.net
```

Escribe `server.crt` y `server.key`. El nombre es obligatorio y debe ser un nombre DNS válido.

## Crear un certificado por pantalla

```bash
npm run pki -- device /path/to/pki p1
```

Escribe `devices/p1.crt` y `devices/p1.key`, e imprime una línea como `<huella> p1`. Guarda esa línea para la lista de aparatos. El id tiene de 1 a 32 caracteres: `a-z`, `0-9` y `-`.

## Poner el certificado en el firmware

```bash
npm run pki -- firmware /path/to/pki --host tintero.example.ts.net p1
```

Escribe `firmware/include/tintero_certs.h` con el nombre del servidor, el id `p1`, la CA, y el certificado y la llave **solo de esa pantalla**. Luego compila y graba como en [Hardware](hardware.md).

- El comando recibe **exactamente una** pantalla, y `--host` es obligatorio (no hay un nombre por defecto). Así cada aparato lleva solo su propia llave.
- El archivo queda con permisos 600 y la herramienta nunca imprime una llave.
- Con `--out <archivo>` eliges otro destino. Si ese archivo está dentro del repositorio y git no lo ignora, la herramienta se niega (salida 2): un archivo con llaves solo puede quedar donde git no lo vea.

## Autorizar la pantalla

Agrega la línea que imprimió `device` a la lista de aparatos. La lista es un archivo **fuera del repositorio**, con permisos 600. Cada línea es `<huella> <id>`; `#` empieza un comentario:

```bash
install -m 600 /dev/null /path/to/devices.txt
echo "<la línea que imprimió el comando device>" >> /path/to/devices.txt
```

Arranca el servidor con TLS (escucha solo en `127.0.0.1`; en [Exposición](exposure.md) está cómo llegan las pantallas a él):

```bash
npm run server -- --port 8443 \
  --tls-cert /path/to/pki/server.crt --tls-key /path/to/pki/server.key \
  --client-ca /path/to/pki/ca.crt --devices /path/to/devices.txt \
  --views config/hoy.views.example.json --data config/hoy.data.example.json
```

Las cuatro opciones de TLS van juntas. Un certificado válido que no está en la lista recibe un 404 vacío. Para **revocar** una pantalla, borra su línea; el servidor relee la lista solo.

## Probar con el emulador

El emulador se porta como el ESP32 y usa los mismos archivos. El certificado del servidor solo vale para el nombre con el que se creó, así que para probar en tu propia máquina crea una autoridad **desechable** en otra carpeta, con el nombre `localhost`:

```bash
npm run pki -- init /path/to/pki-test
npm run pki -- server /path/to/pki-test localhost
npm run pki -- device /path/to/pki-test p1      # imprime "<huella> p1"
```

Pon esa línea en una lista de aparatos de prueba, arranca el servidor con esos archivos (como arriba, con `/path/to/pki-test` y la lista de prueba) y, en una segunda terminal:

```bash
npm run emulator -- --server https://localhost:8443 --store /tmp/tintero-emu \
  --ca /path/to/pki-test/ca.crt --cert /path/to/pki-test/devices/p1.crt \
  --key /path/to/pki-test/devices/p1.key --wakes 1
```

El puerto del `--server` del emulador debe ser el mismo `--port` con el que arrancaste el servidor (8443 en el ejemplo). Si 8443 ya está ocupado, usa otro en los dos.

Si aparece `/tmp/tintero-emu/screen.png`, toda la cadena funciona. Borra la carpeta desechable al terminar. Para lo real, apunta `--server` a tu nombre público con los archivos reales.

## Cuidar la autoridad

- Guarda la carpeta **fuera del repositorio** y con permisos 700. Nunca pongas `ca.key` en git, en un chat ni en una carpeta de la nube sin cifrar.
- `ca.key` puede firmar certificados para cualquier pantalla. El servidor no la necesita (le bastan `ca.crt`, `server.crt`, `server.key` y la lista), así que puedes guardarla en otra máquina.
- Haz una copia de respaldo **cifrada** de toda la carpeta (por ejemplo, un archivo `tar` cifrado con `gpg --symmetric`) y guárdala aparte. Si pierdes `ca.key`, tendrás que crear una autoridad nueva y volver a grabar todas las pantallas.

## Vigencias y renovación

| Certificado | Vigencia |
| ----------- | -------- |
| Autoridad   | 10 años  |
| Pantalla    | 5 años   |
| Servidor    | 2 años   |

La herramienta se niega a sobrescribir archivos. Para renovar:

- **Certificado del servidor:** saca de la carpeta los `server.crt` y `server.key` viejos, corre `server` otra vez y reinicia el servidor. Las pantallas no cambian, porque confían en la autoridad, no en el certificado.
- **Certificado de una pantalla:** saca de la carpeta los `devices/p1.*` viejos, corre `device` otra vez, cambia su línea en la lista (la huella cambia), corre `firmware` y graba la pantalla.
- **Pantalla perdida o robada:** borra su línea de la lista. Si quieres volver a usar el aparato, dale un id nuevo.
- **Autoridad:** al cumplirse sus 10 años, empieza de nuevo con `init` y vuelve a emitir todo.
