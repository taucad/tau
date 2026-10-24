/**
 * The `test_model` adapter: discovery, one run, one projection.
 *
 * The runner is injected rather than chosen here — `createNativeGeoSpecRunner`
 * from `geospec/runner/native` over the WASM engine in a browser worker or the
 * Node add-on on a daemon, or `createGeoSpecNativeNodePoolRunner` for a pool —
 * because the compiled engine is the only host-specific part of a GeoSpec run.
 * Constructing it at the consumer is what lets a browser bundle stay free of
 * the Node graph.
 *
 * @module
 */

import type { RunGeoSpecTestsRpcInput } from '@taucad/chat';
import { discoverGeoSpecFiles } from 'geospec/runner/worker';
import type { GeoSpecDiscoveryFileSystem, GeoSpecRunner, GeoSpecRunnerResult } from 'geospec/runner/worker';

import type { GeoSpecTestModelConfig } from '#geospec/config-session.js';
import { runnerResultToTestModelOutput } from '#geospec/result.js';
import type { GeoSpecKernelEvidence, TestModelOutput } from '#geospec/result.js';
import { observeGeoSpecRunProgress } from '#geospec/run-progress.js';
import type { GeoSpecRunProgressEvent } from '#geospec/run-progress.js';

/**
 * Whether the caller narrowed the run, which changes the empty-selection
 * failure the model is shown: a typo'd filter and an empty project are
 * different problems with different fixes.
 *
 * @param args - The validated `test_model` input.
 * @returns True when any selection filter was supplied.
 * @public
 */
export const hasGeoSpecSelectionFilters = (args: RunGeoSpecTestsRpcInput): boolean =>
  Boolean(
    (args.files !== undefined && args.files.length > 0) ||
    (args.include !== undefined && args.include.length > 0) ||
    (args.exclude !== undefined && args.exclude.length > 0) ||
    (args.testNamePattern ?? '') !== '',
  );

/** Options for {@link runGeoSpecTests}. @public */
export type RunGeoSpecTestsOptions = {
  /** Recursive discovery over this host's filesystem. */
  readonly discovery: GeoSpecDiscoveryFileSystem;
  /** The host's runner; `run` executes, and `on` is needed only with `onProgress`. */
  readonly runner: Pick<GeoSpecRunner, 'run'> & Partial<Pick<GeoSpecRunner, 'on'>>;
  /** Validated `test_model` input. */
  readonly args: RunGeoSpecTestsRpcInput;
  /** Discovery root. `''` for a project-relative host such as a browser bridge. */
  readonly projectPath?: string | undefined;
  /** Receives projected progress while the run executes; never the answer. */
  readonly onProgress?: ((event: GeoSpecRunProgressEvent) => void) | undefined;
  /**
   * Resolves the kernel that evaluates a model source, so evidence refusals
   * name a next step that kernel can take. Asked only when a failure is an
   * evidence refusal; an error or `undefined` leaves the generic guidance.
   */
  readonly kernelEvidence?: ((sourcePath: string) => Promise<GeoSpecKernelEvidence | undefined>) | undefined;
  /**
   * The project's `geospec.config.*` for this call, from `createGeoSpecConfigSession`: its data fields are the
   * defaults an input field of the same name replaces, as a `geospec run` flag replaces them.
   */
  readonly config?: GeoSpecTestModelConfig | undefined;
};

/**
 * The input with the config's data fields filled in where the input leaves them out.
 *
 * @param args - The validated `test_model` input.
 * @param defaults - The applied config's data fields.
 * @returns The selection and timing this call runs with, and whether to stop at the first failure.
 */
const withConfigDefaults = (
  args: RunGeoSpecTestsRpcInput,
  defaults: GeoSpecTestModelConfig['defaults'] = {},
): { readonly args: RunGeoSpecTestsRpcInput; readonly bail: boolean } => {
  const include = args.include !== undefined && args.include.length > 0 ? args.include : defaults.include;
  const exclude = args.exclude !== undefined && args.exclude.length > 0 ? args.exclude : defaults.exclude;
  const testNamePattern = args.testNamePattern ?? defaults.testNamePattern;
  const testTimeout = args.testTimeout ?? defaults.testTimeout;
  return {
    args: {
      ...args,
      ...(include === undefined ? {} : { include: [...include] }),
      ...(exclude === undefined ? {} : { exclude: [...exclude] }),
      ...(testNamePattern === undefined ? {} : { testNamePattern }),
      ...(testTimeout === undefined ? {} : { testTimeout }),
    },
    bail: defaults.bail === true,
  };
};

/**
 * Kernel facts for every model source an evidence refusal loaded.
 *
 * @param output - The first projection.
 * @param resolve - The host's kernel lookup.
 * @returns Kernel facts by source path; empty when nothing needs them.
 */
const evidenceKernels = async (
  output: TestModelOutput,
  resolve: NonNullable<RunGeoSpecTestsOptions['kernelEvidence']>,
): Promise<Map<string, GeoSpecKernelEvidence>> => {
  const kernels = new Map<string, GeoSpecKernelEvidence>();
  const refusedFiles = new Set(
    output.failures.flatMap((failure) => (failure.category === 'unsupported-evidence' ? [failure.targetFile] : [])),
  );
  if (refusedFiles.size === 0) {
    return kernels;
  }
  const sources = new Set(
    (output.lineage ?? []).flatMap(({ file, lineage }) =>
      refusedFiles.has(file)
        ? lineage.loads.flatMap((load) => (load.evidence?.sourcePath === undefined ? [] : [load.evidence.sourcePath]))
        : [],
    ),
  );
  await Promise.all(
    [...sources].map(async (source) => {
      try {
        const kernel = await resolve(source);
        if (kernel !== undefined) {
          kernels.set(source, kernel);
        }
      } catch {
        // Kernel facts sharpen a suggestion; their absence leaves the generic one.
      }
    }),
  );
  return kernels;
};

/**
 * Discover, run and project one `test_model` call.
 *
 * @param options - Discovery filesystem, runner, input and project root.
 * @returns The compact model-facing verdict.
 * @public
 *
 * @example <caption>A browser worker run over a project-relative bridge</caption>
 * ```typescript
 * import { runGeoSpecTests } from '@taucad/agent-tools/geospec';
 * import type { RunGeoSpecTestsOptions } from '@taucad/agent-tools/geospec';
 *
 * declare const discovery: RunGeoSpecTestsOptions['discovery'];
 * declare const runner: RunGeoSpecTestsOptions['runner'];
 * declare const args: RunGeoSpecTestsOptions['args'];
 *
 * const output = await runGeoSpecTests({ discovery, runner, args });
 * ```
 */
export const runGeoSpecTests = async (options: RunGeoSpecTestsOptions): Promise<TestModelOutput> => {
  const { args, bail } = withConfigDefaults(options.args, options.config?.defaults);
  const configReport = options.config?.report;
  const discovery = await discoverGeoSpecFiles({
    filesystem: options.discovery,
    projectPath: options.projectPath ?? '',
    ...(args.files === undefined ? {} : { files: args.files }),
    ...(args.include === undefined ? {} : { include: args.include }),
    ...(args.exclude === undefined ? {} : { exclude: args.exclude }),
  });
  const entryPaths = discovery.files;
  const { onProgress, runner } = options;
  const stopProgress =
    onProgress === undefined || runner.on === undefined
      ? undefined
      : observeGeoSpecRunProgress({ on: runner.on.bind(runner) }, onProgress);
  let result: GeoSpecRunnerResult;
  try {
    result =
      entryPaths.length === 0
        ? { success: false, passed: 0, failed: 1, selectedTests: 0, files: [] }
        : await runner.run({
            files: entryPaths,
            ...(args.testNamePattern === undefined ? {} : { testNamePattern: args.testNamePattern }),
            ...(args.testTimeout === undefined ? {} : { testTimeout: args.testTimeout }),
            ...(args.workUnitLimit === undefined ? {} : { workUnitLimit: args.workUnitLimit }),
            ...(bail ? { bail: true } : {}),
          });
  } finally {
    stopProgress?.();
  }
  const filtersApplied = hasGeoSpecSelectionFilters(args);
  const output = runnerResultToTestModelOutput(result, entryPaths, { filtersApplied });
  const kernels =
    options.kernelEvidence === undefined ? undefined : await evidenceKernels(output, options.kernelEvidence);
  const projected =
    kernels === undefined || kernels.size === 0
      ? output
      : runnerResultToTestModelOutput(result, entryPaths, { filtersApplied, kernels });
  return configReport === undefined ? projected : { ...projected, config: configReport };
};
