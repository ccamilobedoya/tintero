// What an integration declares (ADR-0040, ADR-0043): the core grants only this.
export interface Route {
  method: "GET" | "PATCH";
  prefix: string;
}

export interface Manifest {
  id: string;
  version: string;
  delivers: "tasks" | "events" | "holidays";
  /** "configured": only the origin of the configured base URL (the owner's own service). */
  hosts: "configured" | string[];
  /** Methods and paths the integration uses; the guarded client rejects the rest without calling. */
  routes: Route[];
  /** `false`: a public service; no key file is read and no `Authorization` header is sent. */
  needsKey: boolean;
  /** I4: writing is an explicit permission. */
  writes: boolean;
  /** Seconds between reads (I11: it polls, nothing comes in). */
  pollS: number;
}

export const triliumTasksManifest: Manifest = {
  id: "trilium-tareas",
  version: "1",
  delivers: "tasks",
  hosts: "configured",
  routes: [
    { method: "GET", prefix: "/notes" },
    { method: "PATCH", prefix: "/attributes/" },
  ],
  needsKey: true,
  writes: true,
  pollS: 60,
};

/** Public holidays from Nager.Date (F-013, ADR-0052): only the year and the country go out. */
export const holidaysManifest: Manifest = {
  id: "festivos",
  version: "1",
  delivers: "holidays",
  needsKey: false,
  hosts: "configured",
  routes: [{ method: "GET", prefix: "/api/v3/PublicHolidays/" }],
  writes: false,
  pollS: 3600,
};

/** The template integration (F-018, D8): one public JSON file over https, read with a GET. */
export const exampleJsonManifest: Manifest = {
  id: "example-json",
  version: "1",
  delivers: "tasks",
  needsKey: false,
  hosts: "configured",
  routes: [{ method: "GET", prefix: "/tasks.json" }],
  writes: false,
  pollS: 300,
};

/** The owner's calendars by iCalendar address (F-014, ADR-0054): any HTTPS host the owner configures. */
export const icalManifest: Manifest = {
  id: "ical-calendario",
  version: "1",
  delivers: "events",
  needsKey: false,
  hosts: "configured",
  routes: [{ method: "GET", prefix: "/" }],
  writes: false,
  pollS: 240,
};
