import type { GeoSpecRunResult, RunGeoSpecModuleOptions } from '#runner/types.js';
import type { VmFileSystem, VmIssue } from '@taucad/vm';

/**
 * One GeoSpec test file executed by a worker-style runner.
 *
 * @public
 */
export type GeoSpecRunnerFileResult = {
  /** Absolute or project-relative GeoSpec test file path supplied to the runner. */
  file: string;
  /** Low-level module execution result for this file. */
  result: GeoSpecRunResult;
};

/**
 * Aggregate result returned by GeoSpec worker-style runners.
 *
 * @public
 */
export type GeoSpecRunnerResult = {
  /** True when no files or tests failed and at least one test was selected. */
  success: boolean;
  /** Number of non-skipped tests that passed. */
  passed: number;
  /** Number of file-level or test-level failures. */
  failed: number;
  /** Number of collected tests after filters were applied. */
  selectedTests: number;
  /** Per-file module execution results. */
  files: GeoSpecRunnerFileResult[];
  /** Run-level issues such as aborts or empty filter selections. */
  issues?: VmIssue[];
};

/**
 * Lifecycle event emitted by GeoSpec worker-style runners.
 *
 * @public
 */
export type GeoSpecRunnerEvent =
  | { type: 'run-start'; files: readonly string[] }
  | { type: 'file-start'; file: string }
  | { type: 'file-complete'; file: string; result: GeoSpecRunResult }
  | { type: 'run-complete'; result: GeoSpecRunnerResult }
  | { type: 'abort'; reason?: string }
  | { type: 'close' };

/**
 * Options accepted by a GeoSpec worker-style runner run.
 *
 * @public
 */
export type GeoSpecRunnerRunOptions = {
  /** GeoSpec test files to execute. Files run serially by default. */
  files: readonly string[];
  /** JavaScript regular expression matched against full `suite > test` names. */
  testNamePattern?: string | RegExp;
  /** Timeout for each async test callback, in milliseconds. */
  testTimeout?: number;
};

/**
 * Shared options for Node and browser GeoSpec runner factories.
 *
 * @public
 */
export type GeoSpecRunnerOptions = {
  /** Filesystem containing the project and test modules. */
  filesystem: VmFileSystem;
  /** Absolute project root path. */
  projectPath: string;
  /** Model loader exposed to authored tests through `geospec/model`. */
  modelLoader?: RunGeoSpecModuleOptions['modelLoader'];
  /** STEP loader exposed to authored tests through `geospec/step`. */
  stepLoader?: RunGeoSpecModuleOptions['stepLoader'];
  /** Additional in-memory modules made available to the VM. */
  builtinModules?: RunGeoSpecModuleOptions['builtinModules'];
  /** Observe lifecycle events without receiving raw worker or port primitives. */
  onEvent?: (event: GeoSpecRunnerEvent) => void;
};

/**
 * Public GeoSpec runner lifecycle surface.
 *
 * @public
 */
export type GeoSpecRunner = {
  /** Execute GeoSpec files and return a compact aggregate result. */
  run(options: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult>;
  /** Request cooperative abort before the next file starts. */
  abort(reason?: string): void;
  /** Close the runner and release owned resources. */
  close(): Promise<void>;
};

/**
 * Create a run-level issue when filters select no tests.
 *
 * @returns A structured VM issue for empty GeoSpec filter selections.
 *
 * @public
 */
export const createNoMatchingGeoSpecTestsIssue = (): VmIssue => ({
  code: 'NO_MATCHING_GEOSPEC_TESTS',
  message: 'No matching GeoSpec tests were selected by the supplied filters.',
  severity: 'error',
  type: 'runtime',
});
