import type { JobDefinition, JobInputSnapshot, JobJsonObject } from '@taucad/jobs';

/** Durable CalculiX cantilever verification job type. @public */
export const calculixCantileverJobType = 'tau.solver.calculix.cantilever';

/** CalculiX release required by this provider. @public */
export const calculixSolverVersion = '2.23';

/** User-authored, JSON-safe cantilever parameters in SI units. @public */
export type CalculixCantileverJobParameters = JobJsonObject & {
  /** Beam length in metres. */
  readonly length: number;
  /** Beam width in metres. */
  readonly width: number;
  /** Beam height in metres, aligned to the load direction. */
  readonly height: number;
  /** Young's modulus in pascals. */
  readonly elasticModulus: number;
  readonly poissonRatio: number;
  /** Signed tip load in newtons. */
  readonly tipLoad: number;
  readonly coarseElementsAlongLength?: number;
  readonly elementsAcrossWidth?: number;
  readonly elementsAcrossHeight?: number;
  readonly refinementFactor?: number;
  readonly displacementRelativeTolerance?: number;
  readonly reactionRelativeTolerance?: number;
};

/** Resolved provider-owned, JSON-safe CalculiX job options. @public */
export type CalculixCantileverJobOptions = JobJsonObject & {
  readonly solverVersion: typeof calculixSolverVersion;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly elasticModulus: number;
  readonly poissonRatio: number;
  readonly tipLoad: number;
  readonly coarseElementsAlongLength: number;
  readonly elementsAcrossWidth: number;
  readonly elementsAcrossHeight: number;
  readonly refinementFactor: number;
  readonly displacementRelativeTolerance: number;
  readonly reactionRelativeTolerance: number;
};

/** Exact runnable container selected by a native CalculiX attempt host. @public */
export type CalculixContainerImage = {
  readonly reference: string;
  readonly solverVersion: typeof calculixSolverVersion;
};

/** Discriminated engineering validation retained in the result and report. @public */
export type CalculixValidationResult =
  | {
      readonly status: 'failed';
      readonly analyticalDisplacement: number;
      readonly coarseDisplacement: number;
      readonly refinedDisplacement: number;
      readonly coarseDisplacementRelativeError: number;
      readonly refinedDisplacementRelativeError: number;
      readonly refinedReaction: number;
      readonly reactionRelativeError: number;
      readonly reasons: readonly string[];
    }
  | {
      readonly status: 'passed';
      readonly analyticalDisplacement: number;
      readonly coarseDisplacement: number;
      readonly refinedDisplacement: number;
      readonly coarseDisplacementRelativeError: number;
      readonly refinedDisplacementRelativeError: number;
      readonly refinedReaction: number;
      readonly reactionRelativeError: number;
      readonly reasons: readonly string[];
    };

const calculixOutputs = [
  { role: 'raw', logicalPath: 'calculix/coarse/cantilever.inp', mediaType: 'text/plain' },
  { role: 'raw', logicalPath: 'calculix/coarse/cantilever.dat', mediaType: 'text/plain' },
  { role: 'raw', logicalPath: 'calculix/coarse/cantilever.frd', mediaType: 'text/plain' },
  { role: 'raw', logicalPath: 'calculix/refined/cantilever.inp', mediaType: 'text/plain' },
  { role: 'raw', logicalPath: 'calculix/refined/cantilever.dat', mediaType: 'text/plain' },
  { role: 'raw', logicalPath: 'calculix/refined/cantilever.frd', mediaType: 'text/plain' },
  { role: 'logs', logicalPath: 'calculix/coarse.log', mediaType: 'text/plain' },
  { role: 'logs', logicalPath: 'calculix/refined.log', mediaType: 'text/plain' },
  { role: 'summary', logicalPath: 'calculix/summary.json', mediaType: 'application/json' },
  { role: 'report', logicalPath: 'calculix/report.md', mediaType: 'text/markdown' },
  {
    role: 'geometry-input',
    logicalPath: 'calculix/undeformed-input.glb',
    mediaType: 'model/gltf-binary',
  },
  { role: 'conversion', logicalPath: 'calculix/conversion.json', mediaType: 'application/json' },
] as const;

const assertPositive = (name: string, value: number): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number.`);
  }
};

const assertPositiveInteger = (name: string, value: number): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
};

/**
 * Create a CalculiX 2.23 cantilever convergence job.
 *
 * The provider authors both coarse and refined C3D8 decks from these physical
 * parameters, then checks load reaction, beam displacement, and refinement trend.
 *
 * @param input - Immutable source snapshot, physical parameters, and retry policy.
 * @returns A serializable CalculiX cantilever definition.
 * @public
 *
 * @example <caption>Define a steel cantilever verification</caption>
 * ```typescript
 * import { createCalculixCantileverJobDefinition } from '@taucad/jobs-solvers/definitions';
 *
 * const definition = createCalculixCantileverJobDefinition({
 *   input: {
 *     digest: 'sha256:2fd4e1c67a2d28fced849ee1bb76e739',
 *     size: 256,
 *     mediaType: 'application/vnd.tau.solver-input',
 *     storageKey: 'cas/design/cantilever-1',
 *   },
 *   parameters: {
 *     length: 1,
 *     width: 0.1,
 *     height: 0.1,
 *     elasticModulus: 210e9,
 *     poissonRatio: 0.3,
 *     tipLoad: -1_000,
 *   },
 * });
 * ```
 */
export const createCalculixCantileverJobDefinition = (input: {
  readonly input: JobInputSnapshot;
  readonly parameters: CalculixCantileverJobParameters;
  readonly maxAttempts?: number;
}): JobDefinition<CalculixCantileverJobOptions> => {
  const { parameters } = input;
  for (const [name, value] of [
    ['length', parameters.length],
    ['width', parameters.width],
    ['height', parameters.height],
    ['elasticModulus', parameters.elasticModulus],
  ] as const) {
    assertPositive(name, value);
  }
  if (!Number.isFinite(parameters.tipLoad) || parameters.tipLoad === 0) {
    throw new TypeError('tipLoad must be a non-zero finite number.');
  }
  if (!Number.isFinite(parameters.poissonRatio) || parameters.poissonRatio <= -1 || parameters.poissonRatio >= 0.5) {
    throw new TypeError('poissonRatio must be finite and between -1 and 0.5.');
  }
  const coarseElementsAlongLength = parameters.coarseElementsAlongLength ?? 8;
  const elementsAcrossWidth = parameters.elementsAcrossWidth ?? 2;
  const elementsAcrossHeight = parameters.elementsAcrossHeight ?? 2;
  const refinementFactor = parameters.refinementFactor ?? 2;
  const maxAttempts = input.maxAttempts ?? 1;
  for (const [name, value] of [
    ['coarseElementsAlongLength', coarseElementsAlongLength],
    ['elementsAcrossWidth', elementsAcrossWidth],
    ['elementsAcrossHeight', elementsAcrossHeight],
    ['refinementFactor', refinementFactor],
    ['maxAttempts', maxAttempts],
  ] as const) {
    assertPositiveInteger(name, value);
  }
  const displacementRelativeTolerance = parameters.displacementRelativeTolerance ?? 0.2;
  const reactionRelativeTolerance = parameters.reactionRelativeTolerance ?? 0.02;
  assertPositive('displacementRelativeTolerance', displacementRelativeTolerance);
  assertPositive('reactionRelativeTolerance', reactionRelativeTolerance);
  return {
    type: calculixCantileverJobType,
    version: '1.0.0',
    input: input.input,
    requirements: [
      { key: 'container.engine', condition: 'equals', value: 'docker' },
      { key: 'solver.calculix.version', condition: 'equals', value: calculixSolverVersion },
      { key: 'cpu.count', condition: 'at-least', value: 1 },
    ],
    slotCost: 1,
    maxAttempts,
    options: {
      solverVersion: calculixSolverVersion,
      length: parameters.length,
      width: parameters.width,
      height: parameters.height,
      elasticModulus: parameters.elasticModulus,
      poissonRatio: parameters.poissonRatio,
      tipLoad: parameters.tipLoad,
      coarseElementsAlongLength,
      elementsAcrossWidth,
      elementsAcrossHeight,
      refinementFactor,
      displacementRelativeTolerance,
      reactionRelativeTolerance,
    },
    outputs: calculixOutputs,
  };
};
