// What an integration declares (ADR-0040, ADR-0043): the core grants only this.
export interface Route {
  method: "GET" | "PATCH";
  prefix: string;
}

export interface Manifest {
  id: string;
  version: string;
  delivers: "tasks" | "events";
  /** "configured": only the origin of the configured base URL (the owner's own service). */
  hosts: "configured" | string[];
  /** Methods and paths the integration uses; the guarded client rejects the rest without calling. */
  routes: Route[];
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
  writes: true,
  pollS: 60,
};
