// Ordered shutdown: every step runs, in order, even if a previous one failed or hung.
export interface ShutdownStep {
  name: string;
  run(): Promise<unknown> | undefined;
  /** Time limit of this step; after it the next step runs anyway. */
  timeoutMs: number;
}

async function withLimit(step: ShutdownStep): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, step.timeoutMs);
  });
  try {
    await Promise.race([Promise.resolve().then(() => step.run()), limit]);
  } catch {
    // keep going: the container must be stopped whatever happened before
  } finally {
    clearTimeout(timer);
  }
}

export async function shutdown(steps: ShutdownStep[]): Promise<void> {
  for (const step of steps) await withLimit(step);
}
