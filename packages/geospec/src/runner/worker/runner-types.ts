import type { GeoSpecRunResult, RunGeoSpecModuleOptions } from '#runner/types.js';
import type { GeoSpecRunProfile } from '#runner/profile.js';
import type { VmFileSystem, VmIssue } from '@taucad/runtime/vm';

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
  /** Wall-clock cost of executing this file, in milliseconds (R1). */
  durationMs?: number;
  /** First deterministic model-load cache key observed in this file (R9 affinity telemetry). */
  primaryLoadKey?: string;
  /** Executing worker's isolate-resident memory at file completion, in bytes (R15 memory-class telemetry). */
  workerMemoryBytes?: number;
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
  /** Wall-clock cost of the whole run, in milliseconds (R1). */
  durationMs?: number;
};

/**
 * Lifecycle event emitted by GeoSpec worker-style runners.
 *
 * @public
 */
export type GeoSpecRunnerEvent =
  | { type: 'run-start'; files: readonly string[] }
  | { type: 'file-start'; file: string }
  | {
      type: 'file-complete';
      file: string;
      result: GeoSpecRunResult;
      durationMs?: number;
      primaryLoadKey?: string;
      workerMemoryBytes?: number;
    }
  | { type: 'run-complete'; result: GeoSpecRunnerResult }
  | GeoSpecForensicEvent
  | { type: 'abort'; reason?: string }
  | { type: 'close' };

/** One structured forensic measurement emitted by a runner. @public */
export type GeoSpecForensicEvent = {
  type: 'forensic';
  name: string;
  value: number;
  unit: 'milliseconds' | 'count';
  shardId?: number;
};

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
  /** Non-verdict matcher wall backstop. Milliseconds. */
  matcherWallBackstop?: number;
  /** Emit structured forensic measurements for this run. */
  forensic?: boolean;
  /**
   * Stop after the first failing file (R1). Interactive fail-fast only —
   * never the default for reward runs, which want the complete red set.
   */
  bail?: boolean;
};

/**
 * Shared options for Node and browser GeoSpec runner factories.
 *
 * @public
 */
export type GeoSpecRunnerOptions = {
  /** Filesystem containing the project and test modules. */
  filesystem: VmFileSystem;
  /** Model loader exposed to authored tests through `geospec/model`. */
  modelLoader?: RunGeoSpecModuleOptions['modelLoader'];
  /** STEP loader exposed to authored tests through `geospec/step`. */
  stepLoader?: RunGeoSpecModuleOptions['stepLoader'];
  /** Additional in-memory modules made available to the VM. */
  builtinModules?: RunGeoSpecModuleOptions['builtinModules'];
  /** Internal profile counters used by opt-in benchmark tooling. */
  internalProfile?: GeoSpecRunProfile;
};

/**
 * Public GeoSpec runner lifecycle surface.
 *
 * @public
 */
export type GeoSpecRunner = {
  /** Execute GeoSpec files and return a compact aggregate result. */
  run(options: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult>;
  /** Subscribe to one lifecycle event type. */
  on<Type extends GeoSpecRunnerEvent['type']>(
    event: Type,
    handler: (event: Extract<GeoSpecRunnerEvent, { type: Type }>) => void,
  ): () => void;
  /** Request cooperative abort before the next file starts. */
  abort(reason?: string): void;
  /** Close the runner and release owned resources. */
  close(): Promise<void>;
};
