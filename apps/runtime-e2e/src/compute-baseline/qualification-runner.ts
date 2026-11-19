/**
 * Spawn one arm of the compute-reuse qualification harness (`harness/qualify-arm.mts`) and return its report.
 *
 * Every arm runs in its own process, so arms never share a kernel, a WASM heap or a compute store. A non-zero
 * exit or an incomplete report rejects, so a broken arm can never be summarised as a result (Q5).
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { loadavg, tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';

const harness = resolvePath(import.meta.dirname, 'harness');
const repoRoot = resolvePath(import.meta.dirname, '../../../..');

/** Deterministic work counts of one step. */
export type QualifyCounts = {
  readonly modelRuns: number;
  readonly tessellations: number;
  readonly storeWrites: number;
};

export type QualifyStep = {
  readonly index: number;
  readonly token: string;
  readonly geometry?: string;
  readonly phase?: string;
  readonly history?: number;
  readonly call?: number;
  readonly action?: string;
  readonly content?: string;
  /**
   * Stop-latency trial outcome. Its timings are data the summarizer reports, except `nextBuildAfterIssue`, which CI
   * bounds, and the superseded render's outcome, which CI requires to be `cancelled` for a pack trial.
   */
  readonly abort?: {
    /** The phase the supersede was placed on: the superseded build's `main()`, or its render's GLB pack. */
    readonly target?: 'main' | 'pack';
    readonly valid: boolean;
    /** The superseded render's operation outcome, for a pack trial. */
    readonly supersededRender?: string;
    /** Milliseconds from the supersede to the start of the committed edit's `main()`. */
    readonly nextBuildAfterIssue?: number;
  };
  readonly counts: QualifyCounts;
  readonly output?: {
    readonly sha256?: string;
    readonly triangles?: number;
    readonly evaluated?: boolean;
  };
};

export type QualifyReport = {
  readonly model: string;
  readonly arm: string;
  readonly scenario: string;
  readonly complete?: boolean;
  readonly error?: string;
  readonly steps: readonly QualifyStep[];
};

export type QualifyOptions = {
  readonly model: string;
  readonly arm: 'off' | 'memory' | 'durable';
  readonly scenario: 'matrix' | 'scrub' | 'agent' | 'history' | 'abort';
  readonly wasm?: 'single' | 'multi';
  readonly steps?: readonly string[];
  readonly histories?: number;
  readonly seed?: number;
};

/** A scratch directory for the reports of one test file. */
export const qualifyScratch = async (name: string): Promise<string> =>
  mkdtemp(join(tmpdir(), `compute-qualify-${name}-`));

/** Run one arm to completion. */
export const runQualifyArm = async (options: QualifyOptions, workspace: string): Promise<QualifyReport> => {
  const label = `${options.model}-${options.scenario}-${options.arm}-${options.wasm ?? 'single'}`;
  const out = join(workspace, `${label}.json`);
  const argv = [
    '--import',
    '@oxc-node/core/register',
    join(harness, 'qualify-arm.mts'),
    '--model',
    options.model,
    '--arm',
    options.arm,
    '--scenario',
    options.scenario,
    '--out',
    out,
    ...(options.wasm ? ['--wasm', options.wasm] : []),
    ...(options.steps ? ['--steps', options.steps.join(',')] : []),
    ...(options.histories === undefined ? [] : ['--histories', String(options.histories)]),
    ...(options.seed === undefined ? [] : ['--seed', String(options.seed)]),
  ];
  const child = spawn(process.execPath, argv, {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (status) => {
      resolve(status ?? -1);
    });
  });
  if (code !== 0) {
    throw new Error(
      `qualification arm ${label} exited ${code} (load ${loadavg()[0]!.toFixed(2)}):\n${stderr.slice(-4000)}`,
    );
  }

  const report = JSON.parse(await readFile(out, 'utf8')) as QualifyReport;
  if (report.complete !== true) {
    throw new Error(`qualification arm ${label} is incomplete: ${report.error ?? 'no error recorded'}`);
  }

  return report;
};
