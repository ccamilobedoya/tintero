// Fixture for the agent regression (tests/agents/README.md). Contains ONE planted bug on purpose:
// do not fix it.
const EMPTY_MV = 3300;
const FULL_MV = 4200;

export function batteryPercent(millivolts: number): number {
  if (!Number.isFinite(millivolts)) {
    throw new RangeError("millivolts must be a finite number");
  }
  const percent = Math.round(((millivolts - EMPTY_MV) / (FULL_MV - EMPTY_MV)) * 100);
  return Math.min(100, percent);
}
