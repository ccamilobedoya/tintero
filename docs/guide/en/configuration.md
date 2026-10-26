# Configuration

[Leer en español](../es/configuration.md)

Tintero reads plain JSON files. The repository has examples with placeholder values in `config/`; copy one and change it. Your real files go **outside the repository**.

## The files

| What                  | Option           | Size limit | Where to find an example                                                      |
| --------------------- | ---------------- | ---------- | ----------------------------------------------------------------------------- |
| Views                 | `--views`        | 64 KiB     | `config/hoy.views.example.json` (Spanish), `config/hoy.views.example.en.json` |
| Data                  | `--data`         | 512 KiB    | `config/hoy.data.example.json`, `config/hoy.data.example.en.json`             |
| Integrations          | `--integrations` | 64 KiB     | `config/integrations.example.json`                                            |
| Devices (list)        | `--devices`      | 64 KiB     | see [Certificates](certificates.md)                                           |

`--views` and `--data` always go together. If a file has a mistake, the server exits with code 2 and prints the JSON path of the field (never its value).

## The views file

It says which views exist, how each one is laid out, and which views each display shows.

```json
{
  "version": 1,
  "timezone": "UTC",
  "locale": "en",
  "theme": "base",
  "devices": { "*": { "views": ["remote"] } },
  "views": [
    {
      "id": "remote",
      "title": "Remote list",
      "grid": { "columns": [100], "rows": [100], "areas": [["list"]] },
      "slots": {
        "list": {
          "block": "task-list",
          "source": "remote",
          "options": { "group_by": "none" }
        }
      }
    }
  ]
}
```

- `timezone`: an IANA zone name (for example `UTC` or `Europe/Madrid`). "Today" is decided in this zone.
- `devices`: which views each display shows and in what order. `"*"` is every display; you can add a display by its id (`"p1"`).
- `views[].grid`: the layout. `columns` and `rows` are percentages; `areas` names each cell. An area must be a rectangle. `portrait` is the same for a panel turned upright, and `tab` is the order of the focus areas.
- `views[].slots`: for each area, a `block` (see [Blocks](blocks.md)), the `source` it reads from the data file, an optional `title` and its `options`. The blocks are `task-list`, `task-board`, `issue-list`, `agenda`, `month-calendar` and `calibration`.
- `holidays` (optional): `{ "country": "CO" }` asks the `festivos` integration for that country's public holidays. You can add your own days with `"add": [{ "date": "2026-12-24", "name": "..." }]` and hide some with `"remove": ["2026-12-25"]`. Use `"holidays": true` in the `agenda` options to list them.

## Language

`locale` is `"es"` (default) or `"en"`. It sets the language of every fixed text the server draws: day and month names, `Today`, `All day`, `+N more`, `HOLIDAY`, `no data since`, and so on. It is chosen once in the views file, not on the device. Any other value is an error at `/locale`. Your own data (task titles, event names) is drawn as you wrote it.

## The data file

It holds the sources the views read. A source is a list of `tasks` or of `events`:

```json
{
  "version": 1,
  "sources": {
    "remote": {
      "type": "tasks",
      "readonly": true,
      "items": [{ "id": "a1", "title": "Water the plants", "done": false, "due": "2026-10-30" }]
    }
  }
}
```

Tasks have `id`, `title`, `done` and optionally `stage` (`todo`, `doing`, `done`), `category`, `due` and more. Events have `id`, `title`, `start` and optionally `end`, `location` and `icon`. When an integration feeds a source, it replaces the `items` of the same name while the server runs. `readonly: true` means the displays cannot change it; the Accept button then opens a detail instead of ticking a task.

## Integrations

An integration reads a service and gives the engine a source. They are configured in the integrations file (`--integrations <file>`, together with `--views` and `--data`). The ones that come with Tintero:

| Integration       | What it does                                                       | Needs a key? |
| ----------------- | ------------------------------------------------------------------ | ------------ |
| `festivos`        | Public holidays of a country (Nager.Date). Needs `holidays` in the views file. | No           |
| `ical-calendario` | Your calendars by their iCalendar address.                         | The addresses are secrets |
| `trilium-tareas`  | A Trilium Kanban board (reads, and can tick tasks).                | Yes (ETAPI token)         |
| `example-json`    | The template: a public JSON file read over `https`.                | No           |

An integration only exists when it appears in the file. Each one declares the host and routes it may call; everything else is blocked. To write a new one, see [Integrations](integrations.md).

## Keys and private files

Keys, tokens, calendar addresses and state files **never go in the repository**. Put them in a folder outside it with mode 700, and each file with mode 600:

```bash
mkdir -p -m 700 /path/to/private
install -m 600 /dev/null /path/to/private/trilium.token   # then edit it; one line, the token only
```

- Use an **absolute** path in the configuration (`"keyFile": "/path/to/private/trilium.token"`). The server refuses a key file that is missing, empty, bigger than 4 KiB, or readable by other users, and never prints its content.
- Make the token only for Tintero, with the fewest permissions the service allows, so you can revoke it without affecting anything else.
- State files (`stateFile`) keep the last good reading, and may contain task titles or event names: treat them as private too.
- Do not paste keys in chats, issues or commits. Git refuses files such as `*.key`, `*.pem`, `devices.txt`, `integrations.json` and `.env*`.
