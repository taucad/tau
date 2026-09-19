/**
 * Spawn one arm of the promoted compute-baseline harness.
 *
 * Every arm runs in its own process behind the harness loader hook, so a "fresh
 * process" arm really is one (Q4) and a concurrent arm really is several. The
 * executed-source provenance log is mandatory (Q5): a run without it fails
 * rather than producing an unattributable sample.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { loadavg, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const harness = resolve(import.meta.dirname, 'harness');
const repoRoot = resolve(import.meta.dirname, '../../../..');

export type StepReport = {
  readonly step: string;
  /**
   * Milliseconds.
   *
   * oxlint-disable-next-line tau-lint/no-time-unit-suffix -- mirrors the harness
   * JSON field name; renaming it would break the on-disk report contract the
   * W11 receipts were recorded against.
   */
  // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- Mirrors the harness JSON field name (see the JSDoc above).
  readonly wallMs: number;
  readonly loadavg: readonly number[];
  readonly spans: Record<string, { count: number; ms: number }>;
  readonly counters: Record<string, { calls: number; ms: number; bytes: number }>;
  readonly lookups: { hit: number; miss: number; session: number; cache: number };
  readonly records: { staged: number; rejected: number; bytes: number };
  readonly poisonedLookups: number;
  readonly output: {
    bytes: number;
    sha256: string;
    nodes: number;
    meshes: number;
    triangles: number;
    geometrySha256: string;
    structureSha256: string;
  };
};

export type ArmReport = {
  readonly model: string;
  readonly arm: string;
  readonly steps: readonly StepReport[];
  readonly partial?: boolean;
  readonly error?: string;
};

export type RunOptions = {
  readonly model: string;
  readonly arm: 'bypass' | 'memory' | 'durable' | 'poison';
  readonly steps: readonly string[];
  readonly store?: string;
  readonly captureBrep?: string;
  readonly poisonBrep?: string;
  readonly dumpGlb?: string;
  readonly label?: string;
};

/** A scratch directory for stores, dumps and provenance logs of one test file. */
export const scratch = async (name: string): Promise<string> => mkdtemp(join(tmpdir(), `compute-baseline-${name}-`));

/**
 * Run one arm to completion and return its report. Rejects on a non-zero exit
 * or a partial report so a broken arm can never be summarised as a result.
 */
export const runArm = async (options: RunOptions, workspace: string): Promise<ArmReport> => {
  const label = options.label ?? `${options.model}-${options.arm}`;
  const out = join(workspace, `${label}.json`);
  const loadLog = join(workspace, `${label}.loaded.jsonl`);
  await writeFile(loadLog, '');
  const argv = [
    '--import',
    '@oxc-node/core/register',
    '--import',
    join(harness, 'hooks.mjs'),
    join(harness, 'run-arm.mts'),
    '--model',
    options.model,
    '--arm',
    options.arm,
    '--steps',
    options.steps.join(','),
    '--out',
    out,
    '--label',
    label,
    ...(options.store ? ['--store', options.store] : []),
    ...(options.captureBrep ? ['--captureBrep', options.captureBrep] : []),
    ...(options.poisonBrep ? ['--poisonBrep', options.poisonBrep] : []),
    ...(options.dumpGlb ? ['--dumpGlb', options.dumpGlb] : []),
  ];
  const child = spawn(process.execPath, argv, {
    cwd: repoRoot,
    /* eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are SCREAMING_SNAKE. */
    env: { ...process.env, TAU_COMPUTE_BASELINE_LOAD_LOG: loadLog },
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
    throw new Error(`arm ${label} exited ${code} (load ${loadavg()[0]!.toFixed(2)}):\n${stderr}`);
  }
  const report = JSON.parse(await readFile(out, 'utf8')) as ArmReport;
  if (report.partial) {
    throw new Error(`arm ${label} reported partial: ${report.error ?? 'no error recorded'}`);
  }
  return report;
};

/** Locate one GLB written by `--dumpGlb`. `index` is the step's position in the run. */
export type DumpRef = {
  readonly directory: string;
  readonly model: string;
  readonly arm: string;
  readonly step: string;
  readonly index?: number;
};

/** Read one GLB written by `--dumpGlb`. */
export const readDump = async (dump: DumpRef): Promise<Uint8Array<ArrayBuffer>> => {
  const file = join(dump.directory, `${dump.model}-${dump.arm}-${dump.step}-${dump.index ?? 0}.glb`);
  const bytes = await readFile(file);
  // Copy out of Node's pooled Buffer so the result owns a plain ArrayBuffer.
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
};
