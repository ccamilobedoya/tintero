# Configuración

[Read in English](../en/configuration.md)

Tintero lee archivos JSON simples. El repositorio trae ejemplos con valores de relleno en `config/`; copia uno y cámbialo. Tus archivos reales van **fuera del repositorio**.

## Los archivos

| Qué                 | Opción           | Tope de tamaño | Dónde hay un ejemplo                                                           |
| ------------------- | ---------------- | -------------- | ------------------------------------------------------------------------------ |
| Vistas              | `--views`        | 64 KiB         | `config/hoy.views.example.json`, `config/hoy.views.example.en.json` (inglés)   |
| Datos               | `--data`         | 512 KiB        | `config/hoy.data.example.json`, `config/hoy.data.example.en.json`              |
| Integraciones       | `--integrations` | 64 KiB         | `config/integrations.example.json`                                             |
| Aparatos (lista)    | `--devices`      | 64 KiB         | ver [Certificados](certificates.md)                                            |

`--views` y `--data` van siempre juntos. Si un archivo tiene un error, el servidor sale con código 2 e imprime la ruta JSON del campo (nunca su valor).

## El archivo de vistas

Dice qué vistas existen, cómo se distribuye cada una y qué vistas muestra cada pantalla.

```json
{
  "version": 1,
  "timezone": "UTC",
  "locale": "es",
  "theme": "base",
  "devices": { "*": { "views": ["remota"] } },
  "views": [
    {
      "id": "remota",
      "title": "Lista remota",
      "grid": { "columns": [100], "rows": [100], "areas": [["lista"]] },
      "slots": {
        "lista": {
          "block": "task-list",
          "source": "remota",
          "options": { "group_by": "none" }
        }
      }
    }
  ]
}
```

- `timezone`: el nombre de una zona IANA (por ejemplo `UTC` o `Europe/Madrid`). «Hoy» se decide en esa zona.
- `devices`: qué vistas muestra cada pantalla y en qué orden. `"*"` es cualquier pantalla; puedes agregar una pantalla por su id (`"p1"`).
- `views[].grid`: la distribución. `columns` y `rows` son porcentajes; `areas` pone nombre a cada celda. Un área debe ser un rectángulo. `portrait` es lo mismo para un panel girado a vertical, y `tab` es el orden de las áreas con foco.
- `views[].slots`: para cada área, un `block` (ver [Bloques](blocks.md)), la `source` que lee del archivo de datos, un `title` opcional y sus `options`. Los bloques son `task-list`, `task-board`, `issue-list`, `agenda`, `month-calendar` y `calibration`.
- `holidays` (opcional): `{ "country": "CO" }` le pide a la integración `festivos` los festivos de ese país. Puedes agregar tus propios días con `"add": [{ "date": "2026-12-24", "name": "..." }]` y ocultar otros con `"remove": ["2026-12-25"]`. Usa `"holidays": true` en las opciones de `agenda` para listarlos.

## Idioma

`locale` es `"es"` (por defecto) o `"en"`. Fija el idioma de todo texto fijo que dibuja el servidor: nombres de días y meses, `Hoy`, `Todo el día`, `+N más`, `FESTIVO`, `sin datos desde`, etc. Se elige una vez en el archivo de vistas, no en el aparato. Cualquier otro valor da error en `/locale`. Tus propios datos (títulos de tareas, nombres de eventos) se dibujan como los escribiste.

## El archivo de datos

Guarda las fuentes que leen las vistas. Una fuente es una lista de `tasks` (tareas) o de `events` (eventos):

```json
{
  "version": 1,
  "sources": {
    "remota": {
      "type": "tasks",
      "readonly": true,
      "items": [{ "id": "a1", "title": "Regar las plantas", "done": false, "due": "2026-10-30" }]
    }
  }
}
```

Las tareas tienen `id`, `title`, `done` y, opcionalmente, `stage` (`todo`, `doing`, `done`), `category`, `due` y más. Los eventos tienen `id`, `title`, `start` y, opcionalmente, `end`, `location` e `icon`. Cuando una integración alimenta una fuente, reemplaza los `items` de ese nombre mientras el servidor corre. `readonly: true` significa que las pantallas no pueden cambiarla; entonces el botón Aceptar abre un detalle en vez de marcar una tarea.

## Integraciones

Una integración lee un servicio y le entrega una fuente al motor. Se configuran en el archivo de integraciones (`--integrations <archivo>`, junto con `--views` y `--data`). Las que vienen con Tintero:

| Integración       | Qué hace                                                                 | ¿Necesita llave?              |
| ----------------- | ------------------------------------------------------------------------ | ----------------------------- |
| `festivos`        | Festivos de un país (Nager.Date). Necesita `holidays` en el archivo de vistas. | No                      |
| `ical-calendario` | Tus calendarios por su dirección iCalendar.                              | Las direcciones son secretos  |
| `trilium-tareas`  | Un tablero Kanban de Trilium (lee y puede marcar tareas).                | Sí (token ETAPI)              |
| `example-json`    | La plantilla: un archivo JSON público leído por `https`.                 | No                            |

Una integración solo existe cuando aparece en el archivo. Cada una declara el servidor y las rutas a los que puede llamar; todo lo demás está bloqueado. Para escribir una nueva, mira [Integraciones](integrations.md).

## Llaves y archivos privados

Las llaves, los tokens, las direcciones de calendarios y los archivos de estado **nunca van en el repositorio**. Ponlos en una carpeta fuera de él con permisos 700, y cada archivo con 600:

```bash
mkdir -p -m 700 /path/to/private
install -m 600 /dev/null /path/to/private/trilium.token   # luego edítalo; una línea, solo el token
```

- Usa una ruta **absoluta** en la configuración (`"keyFile": "/path/to/private/trilium.token"`). El servidor rechaza un archivo de llave que falte, esté vacío, pese más de 4 KiB o sea legible por otros usuarios, y nunca imprime su contenido.
- Crea el token solo para Tintero, con los menores permisos que permita el servicio, para poder revocarlo sin afectar nada más.
- Los archivos de estado (`stateFile`) guardan la última lectura buena y pueden tener títulos de tareas o nombres de eventos: trátalos también como privados.
- No pegues llaves en chats, *issues* ni *commits*. Git rechaza archivos como `*.key`, `*.pem`, `devices.txt`, `integrations.json` y `.env*`.
