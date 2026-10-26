# Certificates

[Leer en español](../es/certificates.md)

Every display proves who it is with its own **client certificate** (mTLS). The server only answers displays whose certificate is on its list, and the displays only trust **your** private authority. This page covers the whole way: `init` → `server` → `device` → `firmware` → the list of devices → a test with the emulator.

## How it fits together

- **The authority (CA)** is made once. It signs the other certificates. Its key is the most important file you will have.
- **The server certificate** says "I am `tintero.example.ts.net`". Displays check it against the CA.
- **One certificate per display** (`p1`, `p2`, ...). The server checks it against the CA **and** against its list of devices.
- **The list of devices** (`devices.txt`) has one line per display: its fingerprint and its id.

The tool is `npm run pki`. It uses the `openssl` command line (install `openssl` if you do not have it), makes ECDSA P-256 keys, and **refuses** to write inside the repository or over an existing file. Use a folder **outside** the repository (it is created with mode 700 and the keys with mode 600). In the examples it is `/path/to/pki`.

## Create the authority

```bash
npm run pki -- init /path/to/pki
```

This writes `ca.crt` (public) and `ca.key` (secret) in that folder.

## Create the server certificate

Use the public name that the displays will connect to (see [Exposure](exposure.md)):

```bash
npm run pki -- server /path/to/pki tintero.example.ts.net
```

This writes `server.crt` and `server.key`. The name is required and must be a valid DNS name.

## Create a certificate for each display

```bash
npm run pki -- device /path/to/pki p1
```

This writes `devices/p1.crt` and `devices/p1.key`, and prints one line like `<fingerprint> p1`. Keep that line for the list of devices. The id is 1 to 32 characters: `a-z`, `0-9` and `-`.

## Put the certificate in the firmware

```bash
npm run pki -- firmware /path/to/pki --host tintero.example.ts.net p1
```

This writes `firmware/include/tintero_certs.h` with the server name, the id `p1`, the CA, and the certificate and key of **that display only**. Then build and flash as in [Hardware](hardware.md).

- The command takes **exactly one** display, and `--host` is required (there is no default name). So every device carries only its own key.
- The file gets mode 600, and the tool never prints a key.
- With `--out <file>` you choose another destination. If that file is inside the repository and git does not ignore it, the tool refuses (exit code 2): a file with keys may only be where git cannot see it.

## Authorize the display

Add the line printed by `device` to the list of devices. The list is a file **outside the repository**, with mode 600. Each line is `<fingerprint> <id>`; `#` starts a comment:

```bash
install -m 600 /dev/null /path/to/devices.txt
echo "<the line printed by the device command>" >> /path/to/devices.txt
```

Start the server with TLS (it listens only on `127.0.0.1`; see [Exposure](exposure.md) for how displays reach it):

```bash
npm run server -- --port 8443 \
  --tls-cert /path/to/pki/server.crt --tls-key /path/to/pki/server.key \
  --client-ca /path/to/pki/ca.crt --devices /path/to/devices.txt \
  --views config/hoy.views.example.en.json --data config/hoy.data.example.en.json
```

The four TLS options go together. A valid certificate that is not on the list gets an empty 404. To **revoke** a display, delete its line; the server reads the list again by itself.

## Test with the emulator

The emulator behaves like the ESP32 and uses the same files. The server certificate is only valid for the name it was made for, so for a test on your own machine make a **throwaway** authority in another folder, with the name `localhost`:

```bash
npm run pki -- init /path/to/pki-test
npm run pki -- server /path/to/pki-test localhost
npm run pki -- device /path/to/pki-test p1      # prints "<fingerprint> p1"
```

Put that line in a test list of devices, start the server with those files (as above, with `/path/to/pki-test` and the test list), and in a second terminal:

```bash
npm run emulator -- --server https://localhost:8443 --store /tmp/tintero-emu \
  --ca /path/to/pki-test/ca.crt --cert /path/to/pki-test/devices/p1.crt \
  --key /path/to/pki-test/devices/p1.key --wakes 1
```

The port in the emulator's `--server` must be the same `--port` you started the server with (8443 in the example). If 8443 is already taken, use another port in both.

If `/tmp/tintero-emu/screen.png` appears, the whole chain works. Delete the throwaway folder when you are done. For the real thing, point `--server` at your public name with the real files.

## Keep the authority safe

- Keep the folder **outside the repository** and with mode 700. Never put `ca.key` in git, in a chat, or in a cloud folder that is not encrypted.
- `ca.key` can sign certificates for any display. The server does not need it (it needs `ca.crt`, `server.crt`, `server.key` and the list), so you can keep it on another machine.
- Make an **encrypted** backup of the whole folder (for example, a `tar` archive encrypted with `gpg --symmetric`) and keep it somewhere separate. If you lose `ca.key`, you must make a new authority and reflash every display.

## Validity and renewal

| Certificate | Valid for |
| ----------- | --------- |
| Authority   | 10 years  |
| Display     | 5 years   |
| Server      | 2 years   |

The tool refuses to overwrite files. To renew:

- **Server certificate:** move the old `server.crt` and `server.key` out of the folder, run `server` again, and restart the server. Displays need no change, because they trust the authority, not the certificate.
- **Display certificate:** move the old `devices/p1.*` out of the folder, run `device` again, replace its line in the list (the fingerprint changes), run `firmware` and flash the display.
- **Lost or stolen display:** delete its line from the list. If you want to use the hardware again, give it a new id.
- **Authority:** at the end of its 10 years, start again with `init` and reissue everything.
