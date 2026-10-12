import run from '#assets/geospec-run.json' with { type: 'json' };

/**
 * A recorded GeoSpec run of the example's own spec. Displayed as recorded, never re-run by viewers.
 * @public
 */
export type GeoSpecRun = {
  readonly tool: string;
  readonly example: string;
  readonly commit: string;
  readonly modelSha256: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly summary: {
    readonly selected: number;
    readonly passed: number;
    readonly failed: number;
    readonly inconclusive: number;
  };
  readonly tests: ReadonlyArray<{ readonly name: string; readonly status: string; readonly codes: readonly string[] }>;
};

/**
 * The recorded GeoSpec run of the authored gearbox (3 passed, 0 failed, 7 inconclusive).
 * Inconclusive means GeoSpec cannot measure that evidence yet; it is never a pass.
 * @public
 */
export const geospecRun: GeoSpecRun = run;
