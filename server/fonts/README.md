# fonts

Letras del tema `base` del motor de vistas (F-005, ADR-0034): DejaVu Sans para títulos y texto, Terminus (mapa de bits) para los detalles. Las monta el contenedor de Chromium de solo lectura, con `fonts.conf` (sin suavizado).

| Archivo | Letra | Tipo | Origen | Licencia | SHA-256 |
|---------|-------|------|--------|----------|---------|
| `DejaVuSans.ttf` | DejaVu Sans | contorno | paquete Debian `fonts-dejavu-core` 2.37-8 | `LICENSE-DejaVu.txt` (Bitstream Vera + Arev; cambios de DejaVu en dominio público) | `57f73e11f51999432bf7ab22ce55b6f945d5eca1bf824404cfa9ec2e3718c84e` |
| `DejaVuSans-Bold.ttf` | DejaVu Sans, negrita | contorno | ídem | ídem | `a4c5bc453ca281d90ea079e596da7ae0dfeb5777497c29ec254e76d97ff6f890` |
| `terminus-normal.otb` | Terminus | mapa de bits: 12, 14, 16, 18, 20, 22, 24, 28 y 32 px | paquete Debian `fonts-terminus-otb` 4.48-3.1 | `LICENSE-Terminus.txt` (SIL OFL 1.1) | `180adf5b1f33a980d9115e9267cec5030672247e9ae27d38bed305c556619d2b` |
| `terminus-bold.otb` | Terminus, negrita | ídem | ídem | ídem | `96ad986e5b2f627772ac2660cab421e3860426555324982d2b77a364111bfefe` |

## Reglas
- **Una letra de mapa de bits solo se usa en las tallas que trae**: en otra talla, Chromium no la dibuja (sale en blanco). `pickFont` lo garantiza.
- Para cambiar o agregar una letra: archivo y licencia aquí, una fila en esta tabla, el tema en `server/src/engine/theme.ts`, y que pase la revisión de letras (`checkThemeGlyphs`). Las pruebas de letras y nitidez están en la nota de investigación del diseño.
- No se modifican los archivos de las letras.
