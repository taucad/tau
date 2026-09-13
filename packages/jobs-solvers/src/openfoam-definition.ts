import type { JobDefinition, JobInputSnapshot, JobJsonObject } from '@taucad/jobs';

/** Durable OpenFOAM job type. @public */
export const openFoamJobType = 'tau.solver.openfoam.case';

/** OpenCFD release selected by an OpenFOAM job. @public */
export type OpenFoamSolverVersion = '2506' | '2606';

/** Closed, host-authored OpenFOAM execution pipelines. @public */
export type OpenFoamJobPreset = 'block-rho-central-foam' | 'block-simple-foam' | 'snappy-simple-foam';

/** Provider-owned, JSON-safe OpenFOAM job options. @public */
export type OpenFoamJobOptions = JobJsonObject & {
  readonly preset: OpenFoamJobPreset;
  readonly solverVersion: OpenFoamSolverVersion;
  readonly ranks: number;
};

/** Pinned OpenCFD container references used unless a daemon explicitly overrides them. @public */
export const openFoamContainerImages: Readonly<Partial<Record<OpenFoamSolverVersion, string>>> = Object.freeze({
  '2506': 'opencfd/openfoam-default:2506@sha256:1578f5ded8bcbc68aa6a98dedd0693c3990bbab3bd6f1c01984e911c681f4e63',
});

const openFoamOutputs = [
  { role: 'raw', logicalPath: 'openfoam/execution.json', mediaType: 'application/json' },
  { role: 'logs', logicalPath: 'openfoam/logs.txt', mediaType: 'text/plain' },
  { role: 'summary', logicalPath: 'openfoam/summary.json', mediaType: 'application/json' },
  { role: 'report', logicalPath: 'openfoam/report.md', mediaType: 'text/markdown' },
  { role: 'geometry', logicalPath: 'openfoam/geometry.glb', mediaType: 'model/gltf-binary' },
  { role: 'conversion', logicalPath: 'openfoam/conversion.json', mediaType: 'application/json' },
] as const;

const assertPositiveInteger = (name: string, value: number): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
};

/**
 * Create an immutable OpenFOAM case job definition.
 *
 * The definition selects a closed pipeline; it never contains a shell command. Release
 * `2506` is the default. Release `2606` must be selected explicitly.
 *
 * @param input - Snapshot, pipeline, release, and scheduling settings.
 * @returns A serializable OpenFOAM job definition.
 * @public
 *
 * @example <caption>Submit a pinned OpenFOAM 2506 case</caption>
 * ```typescript
 * import { createOpenFoamJobDefinition } from '@taucad/jobs-solvers/definitions';
 *
 * const definition = createOpenFoamJobDefinition({
 *   input: {
 *     digest: 'sha256:9e107d9d372bb6826bd81d3542a419d6',
 *     size: 4096,
 *     mediaType: 'application/vnd.tau.openfoam-case',
 *     storageKey: 'cas/openfoam/case-1',
 *   },
 *   preset: 'block-simple-foam',
 * });
 * ```
 */
export const createOpenFoamJobDefinition = (input: {
  readonly input: JobInputSnapshot;
  readonly preset: OpenFoamJobPreset;
  readonly solverVersion?: OpenFoamSolverVersion;
  readonly ranks?: number;
  readonly maxAttempts?: number;
}): JobDefinition<OpenFoamJobOptions> => {
  const ranks = input.ranks ?? 1;
  const maxAttempts = input.maxAttempts ?? 1;
  assertPositiveInteger('ranks', ranks);
  assertPositiveInteger('maxAttempts', maxAttempts);
  const solverVersion = input.solverVersion ?? '2506';
  return {
    type: openFoamJobType,
    version: '1.0.0',
    input: input.input,
    requirements: [
      { key: 'container.engine', condition: 'equals', value: 'docker' },
      { key: 'solver.openfoam.version', condition: 'equals', value: solverVersion },
      { key: 'cpu.count', condition: 'at-least', value: ranks },
    ],
    slotCost: ranks,
    maxAttempts,
    options: { preset: input.preset, solverVersion, ranks },
    outputs: openFoamOutputs,
  };
};
