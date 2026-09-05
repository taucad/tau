/**
 * The `test_model` adapter: discovery, one run, one projection.
 *
 * The runner is injected rather than chosen here — `createGeoSpecWebRunner` in
 * a browser worker, `createGeoSpecNodeRunner` on a daemon — because that is the
 * only part of a GeoSpec run that is host-specific. Keeping the side-effect
 * `@taucad/geospec-engine/register*` import at the consumer is what lets a
 * browser bundle stay free of the Node graph.
 *
 * @module
 */

import type { RunGeoSpecTestsRpcInput } from '@taucad/chat';
import { discoverGeoSpecFiles } from 'geospec/runner';
import type { GeoSpecDiscoveryFileSystem } from 'geospec/runner';
import type { GeoSpecRunner, GeoSpecRunnerResult } from 'geospec/runner/worker';

import { runnerResultToTestModelOutput } from '#geospec/result.js';
import type { TestModelOutput } from '#geospec/result.js';

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
  /** The host's runner; only `run` is used, so a fake needs only `run`. */
  readonly runner: Pick<GeoSpecRunner, 'run'>;
  /** Validated `test_model` input. */
  readonly args: RunGeoSpecTestsRpcInput;
  /** Discovery root. `''` for a project-relative host such as a browser bridge. */
  readonly projectPath?: string | undefined;
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
  const { args } = options;
  const discovery = await discoverGeoSpecFiles({
    filesystem: options.discovery,
    projectPath: options.projectPath ?? '',
    ...(args.files === undefined ? {} : { files: args.files }),
    ...(args.include === undefined ? {} : { include: args.include }),
    ...(args.exclude === undefined ? {} : { exclude: args.exclude }),
  });
  const entryPaths = discovery.files;
  const result: GeoSpecRunnerResult =
    entryPaths.length === 0
      ? { success: false, passed: 0, failed: 1, selectedTests: 0, files: [] }
      : await options.runner.run({
          files: entryPaths,
          ...(args.testNamePattern === undefined ? {} : { testNamePattern: args.testNamePattern }),
          ...(args.testTimeout === undefined ? {} : { testTimeout: args.testTimeout }),
        });
  return runnerResultToTestModelOutput(result, entryPaths, { filtersApplied: hasGeoSpecSelectionFilters(args) });
};
