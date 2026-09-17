/**
 * Measurement governance shared by the two benchmark harnesses that exist
 * (realtime CAD performance charter D14, invariant I13).
 *
 * A performance number may bind a budget only when it is tagged with the
 * conditions that produced it and its variance is low enough to mean anything.
 * Anything else is attribution evidence. This module owns that definition for
 * both `apps/runtime-e2e/src/benchmarks/*` and
 * `apps/ui-e2e/src/support/headless-capture-performance.ts`, which imports it
 * relatively (precedent: `apps/ui-e2e/src/support/host-fixture.ts`).
 *
 * It stays dependency-free and environment-free on purpose: the ui-e2e harness
 * loads in browser mode, so no `node:*` import may appear here. Callers read
 * their own load average, process id and launch arguments and pass them in.
 */

/** A result whose coefficient of variation exceeds this is refused, not averaged. */
export const maximumBudgetCoefficientOfVariation = 0.1;

/** Whether the code under measurement was built for production or for development. */
export type BuildMode = 'development' | 'production';

/** The renderer a sample was drawn with; `none` for a headless kernel benchmark. */
export type RendererAdapterTag = Readonly<{
  api: 'none' | 'webgl' | 'webgpu';
  /** ANGLE/adapter backend selected by launch arguments. */
  angle: 'default' | 'metal' | 'none' | 'swiftshader';
  /** Vendor/architecture/description as the adapter reported it. */
  name: string;
  implementation: 'ambiguous' | 'hardware' | 'software';
}>;

/** Which process actually ran the kernel, and its role there. */
export type KernelProcessTag = Readonly<{
  kind: 'in-process' | 'native' | 'utility' | 'worker';
  role: string;
  pid?: number | undefined;
}>;

/** Machine load at the time of the run. Recorded, never inferred after the fact. */
export type ContentionTag = Readonly<{
  tag: 'contended' | 'quiet';
  source: 'load-average' | 'operator';
  /** One-minute load average read immediately before the run. */
  loadAverage1m: number;
  cpuCount: number;
}>;

/** The conditions I13 requires before a measurement may bind a budget. */
export type MeasurementTags = Readonly<{
  build: BuildMode;
  /** WASM variant of the kernel under measurement (`single`, `multi`, `auto`, a URL, or `none`). */
  wasmVariant: string;
  adapter: RendererAdapterTag;
  kernelProcess: KernelProcessTag;
  crossOriginIsolated: boolean;
  contention: ContentionTag;
  /**
   * Seam for D8/W28a: the runtime JSONL trace file both harnesses will read once
   * the exporter lane writes one. Until then it is absent and each harness keeps
   * its current input.
   */
  runtimeTraceJsonl?: string | undefined;
}>;

/** The renderer tag for a run with no renderer at all (a Node kernel benchmark). */
export const noRendererAdapter: RendererAdapterTag = {
  api: 'none',
  angle: 'none',
  name: '',
  implementation: 'ambiguous',
};

/** Reads the adapter backend out of the browser launch arguments that selected it. */
export const rendererAngle = (launchArguments: readonly string[]): RendererAdapterTag['angle'] => {
  if (launchArguments.includes('--use-angle=metal')) {
    return 'metal';
  }
  if (launchArguments.some((argument) => argument.includes('swiftshader'))) {
    return 'swiftshader';
  }
  return 'default';
};

/**
 * Records the contention tag. An operator statement wins; otherwise the tag is
 * derived from the one-minute load average against half the CPU count, and the
 * raw numbers are kept so the operator can re-judge the run.
 *
 * @throws When the operator tag is neither `quiet` nor `contended`.
 */
export const readContention = (input: {
  readonly loadAverage1m: number;
  readonly cpuCount: number;
  readonly operatorTag?: string | undefined;
}): ContentionTag => {
  const { loadAverage1m, cpuCount, operatorTag } = input;
  const measured = { loadAverage1m, cpuCount } as const;
  if (operatorTag !== undefined && operatorTag !== '') {
    if (operatorTag !== 'quiet' && operatorTag !== 'contended') {
      throw new Error(`Contention tag must be 'quiet' or 'contended'; received '${operatorTag}'.`);
    }
    return { tag: operatorTag, source: 'operator', ...measured };
  }
  return { tag: loadAverage1m > cpuCount / 2 ? 'contended' : 'quiet', source: 'load-average', ...measured };
};

/** Why a measurement may not bind a budget, or an empty list when it may. */
export type BudgetVerdict = Readonly<{ eligible: boolean; refusals: readonly string[] }>;

/**
 * Applies I13: budgets bind only to a quiet, production, fully tagged run whose
 * coefficient of variation is at or below ten percent.
 */
export const budgetVerdict = (input: {
  readonly tags?: MeasurementTags | undefined;
  readonly coefficientOfVariation?: number | undefined;
}): BudgetVerdict => {
  const { tags, coefficientOfVariation } = input;
  const refusals: string[] = [];
  if (tags) {
    if (tags.contention.tag !== 'quiet') {
      refusals.push(`run was ${tags.contention.tag} (load average ${tags.contention.loadAverage1m.toFixed(2)})`);
    }
    if (tags.build !== 'production') {
      refusals.push(`run measured a ${tags.build} build`);
    }
  } else {
    refusals.push('measurement tags are absent');
  }
  if (coefficientOfVariation === undefined) {
    refusals.push('coefficient of variation is unrecorded');
  } else if (coefficientOfVariation > maximumBudgetCoefficientOfVariation) {
    refusals.push(
      `coefficient of variation ${(coefficientOfVariation * 100).toFixed(1)}% exceeds ${maximumBudgetCoefficientOfVariation * 100}%`,
    );
  }
  return { eligible: refusals.length === 0, refusals };
};
