# Integrations

[Leer en español](../es/integrations.md)

An **integration** reads one outside service on a schedule and gives the view engine a **source** (a list of tasks, events or holidays). It never draws anything and never sees your keys. This page explains the model, shows a finished example (`festivos`), and gives a template you can copy (`example-json`).

## How an integration works

- **"The integration asks, the core grants."** Each integration declares a *manifest*: which host it may call (`"configured"` means only the address you put in the settings), which methods and paths, whether it needs a key, whether it may write, and how often it reads. The guarded HTTP client rejects anything else **without making the call**.
- **One HTTP client.** All integrations go through `server/src/integrations/http.ts`. It is the only place that calls `fetch`. It holds the key (the integration never sees it), allows `https` (and `http://127.0.0.1` for your own local services), refuses redirects, limits time and **response size before parsing**, and logs each call without content.
- **Read-only by default.** Writing is a permission the manifest must ask for.
- **It polls.** Nothing comes in from the internet. The integration reads every `pollS` seconds, and if a read fails, the engine keeps the last good data, and a block with a title can say `no data since HH:MM`.

## A worked example: `festivos`

`festivos` is the simplest real integration: public holidays from [Nager.Date](https://date.nager.at), no key, only `GET`. Read it in `server/src/integrations/holidays-nager.ts`.

- **Manifest** (`manifest.ts`): `needsKey: false`, `writes: false`, one route `GET /api/v3/PublicHolidays/`, `pollS: 3600`. Only the year and the country go out.
- **Limits:** the answer and the cache file are capped at 64 KiB (`HOLIDAYS_HTTP_LIMITS`).
- **`parseNager(json)`:** keeps only the public, nationwide holidays, checks each date with `validDate`, cuts each name to 60 characters, and drops every other field. A wrong shape throws `bad-json`.
- **Cycle:** read the local year (and the next one from 1 December), cache each year in a file with mode 600 for 30 days, retry an hour after an error, treat `404` as "unknown country" for 24 hours. It never blocks drawing or start-up.
- **Settings:** a `festivos` entry in the integrations file (`baseUrl`, optional `stateFile`) plus `holidays.country` in the views file.
- **Logs** carry the year, the status and counts, never the names of holidays.

## The template: `example-json`

`example-json` is a small integration made to be copied. It does one `GET` to `<baseUrl>/tasks.json` over `https`, with no key, no redirects and a response of at most 64 KiB, and gives the engine a read-only `tasks` source. It is **off** unless the integrations file configures it. The files:

| File                                          | What it holds                                                   |
| --------------------------------------------- | --------------------------------------------------------------- |
| `server/src/integrations/example-json.ts`     | The integration: limits, `parseExampleTasks`, `createExampleJson` |
| `server/src/integrations/example-json.test.ts`| Its tests                                                       |
| `server/src/integrations/manifest.ts`         | `exampleJsonManifest`                                           |
| `server/src/integrations/config.ts`           | Its settings in the integrations file                           |
| `server/src/main.ts`                          | Where it is created, started and stopped                        |
| `config/example-json.*.example.json`          | Example views, data and integrations files                      |

The JSON it expects is a list of at most 100 items; any other field is dropped:

```json
[{ "id": "a1", "title": "Water the plants", "done": false, "due": "2026-10-30" }]
```

The settings (use your own host, over `https`):

```json
{
  "version": 1,
  "integrations": {
    "example-json": { "source": "remote", "baseUrl": "https://example.com/tintero" }
  }
}
```

## Step by step: your own integration

Say you want to read `https://example.com/tintero/events.json`. Copy `example-json` and change it in these steps.

### 1. The manifest

In `manifest.ts`, add a `Manifest` with a new `id`, `version`, what it `delivers` (`tasks`, `events` or `holidays`), `hosts: "configured"`, `needsKey` (use `false` for a public file), `writes: false`, and `pollS`. Keep `routes` as narrow as you can:

```ts
routes: [{ method: "GET", prefix: "/events.json" }],
```

### 2. Allowed routes and limits

In your file, name the only path you read (`EXAMPLE_JSON_PATH`) and set the limits the guarded client is built with, like `{ maxBytes: 65_536, timeoutMs: 5000 }`. The response is cut at `maxBytes` **while reading**, before anyone parses it. Pick the smallest number that fits the real answer.

### 3. The `parse…` function

Write one function (like `parseExampleTasks`) that takes the already-parsed JSON and returns your typed list. Rules: check the type of **every** field, limit the number of items and the length of each text, check ids and dates, and drop fields you do not know. If **anything** is wrong, throw `IntegrationHttpError("bad-json")`: one bad field rejects the whole answer, so nothing half-checked reaches the engine.

### 4. The cycle

Write `createYours({ http, source, engine, clock, log })` with `start()`, `cycle()`, `idle()` and `stop()`. In each cycle: call `http.request("GET", PATH)`, run your parse function, then `engine.setSource(source, items, { readAt })`. On an error, only log a code (and a status): the engine keeps the old data. Never log titles, URLs with secrets or response bodies. Copy the small queue in `example-json.ts` so `stop()` waits for a read in progress.

### 5. The settings in `config.ts`

In `server/src/integrations/config.ts`: add an interface for your settings and add it to `IntegrationsFile`; add its name to the list of allowed keys in `parseIntegrations`; write a `parseYours` that validates every field (use `https` only, as `parseExampleJson` does); and, in `checkAgainstData`, check that the source named in the settings exists in the data file with the right type and `readonly`.

### 6. Register it in `main.ts`

In `server/src/main.ts`: when the settings have your entry, build the client with `guardedHttp(parseBase(baseUrl), undefined, yourManifest, { ...YOUR_LIMITS, log })`, create your integration with the `engine`, and call `start()`. Add a step for it to `steps()` so it stops before the engine on shutdown.

### 7. The tests

Next to your code, in `yours.test.ts`. Use a tiny fake server on `127.0.0.1` (see `startFake()` in `example-json.test.ts`) and a fake `engine` that records `setSource`. Cover at least:

- a response of the limit plus 1 byte fails **before parsing** and delivers nothing;
- a redirect is an error and is not followed;
- an `http:` address in the settings gives a `ConfigError`;
- a field of the wrong type never reaches the engine;
- the manifest allows no other path and no write.

Then add example files in `config/` with placeholder values (`example.com`), and run `npm run typecheck && npm run lint && npm test && npm run format:check`.

## Try it

Serve a `tasks.json` from any `https` address you control, put its address in an integrations file (outside the repository), and start the server with `--integrations`:

```bash
npm run server -- --port 8790 \
  --views config/example-json.views.example.json \
  --data config/example-json.data.example.json \
  --integrations /path/to/integrations.json
```

The `remote` list on the display shows the tasks. If the address stops answering, the list keeps the last good tasks.
