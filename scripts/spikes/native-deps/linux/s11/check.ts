/**
 * Spike S11 (native-dependency-resolution charter): a `tau check` prototype.
 *
 * Spike code only, not the W17 implementation. It reuses `tau export`'s runtime loading and client
 * creation and stops at `document.evaluation()`, returning `{ kind: 'evaluation', status, issues,
 * parameters, views, exports, exit }`. Parameters come from the `described` event: an `Evaluation`
 * carries none. Exit codes follow `packages/cli/src/output.ts`: 0 ok, 1 model error, 3 refused.
 * Usage: node --import tsx scripts/spikes/native-deps/linux/s11/check.ts <file>
 */

import { stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

type Issue = { code: string; severity: string; message: string };
type Description = { success: boolean; parameters?: unknown; issues: readonly Issue[] };
type Evaluation = {
  success: boolean;
  issues: readonly Issue[];
  views?: ReadonlyArray<{ id: string }>;
  exports?: ReadonlyArray<{ id: string }>;
};
type CliClient = {
  open(input: { source: { path: string }; parameters: Record<string, unknown>; watch: boolean }): {
    on(event: 'described', handler: (description: Description) => void): () => void;
    evaluation(options: {
      signal: AbortSignal;
    }): Promise<{ superseded: false; evaluation: Evaluation } | { superseded: true }>;
    close(): void;
  };
  shutdown(): Promise<void>;
};

/** The check record. */
export type CheckRecord = {
  kind: 'evaluation';
  status: 'ok' | 'error' | 'refused';
  exit: 0 | 1 | 3;
  issues: Issue[];
  parameters: unknown;
  views: string[];
  exports: string[];
};

/** Issue codes for a well-formed request that the runtime declines (exit 3), as in `export.ts`. */
const refusedCodes = new Set(['KERNEL_CAPABILITY_MISSING', 'TRANSCODER_CAPABILITY_MISSING', 'KERNEL_NOT_PREPARED']);
// The CLI's own modules, loaded by path: the spike adds no dependency edge to `scripts`.
const cliSource = pathToFileURL(
  resolve(import.meta.dirname, '../../../../../packages/cli/src/runtime-options.ts'),
).href;

/**
 * Evaluates one source file without exporting it.
 *
 * @param file - Source path.
 * @param parameters - Model parameters.
 * @returns The check record.
 */
export const checkFile = async (file: string, parameters: Record<string, unknown> = {}): Promise<CheckRecord> => {
  const inputPath = resolve(file);
  await stat(inputPath);
  const { loadCliRuntime } = (await import(cliSource)) as {
    loadCliRuntime: (options: { projectRoot: string; plugin: unknown }) => Promise<unknown>;
  };
  const { createNodeClient } = (await import('@taucad/runtime/node')) as unknown as {
    createNodeClient: (options: { runtime: unknown; projectPath: string }) => Promise<CliClient>;
  };
  const runtime = await loadCliRuntime({ projectRoot: process.cwd(), plugin: undefined });
  const client = await createNodeClient({ runtime, projectPath: dirname(inputPath) });
  let description: Description | undefined;
  const document = client.open({ source: { path: basename(inputPath) }, parameters, watch: false });
  document.on('described', (value) => {
    description = value;
  });
  try {
    const outcome = await document.evaluation({ signal: AbortSignal.timeout(120_000) });
    const evaluation = outcome.superseded ? undefined : outcome.evaluation;
    const issues = [...(description?.issues ?? []), ...(evaluation?.issues ?? [])];
    const refused = issues.some((issue) => refusedCodes.has(issue.code));
    const ok = evaluation?.success === true && !issues.some((issue) => issue.severity === 'error');
    return {
      kind: 'evaluation',
      status: ok ? 'ok' : refused ? 'refused' : 'error',
      exit: ok ? 0 : refused ? 3 : 1,
      issues: issues.map(({ code, severity, message }) => ({ code, severity, message })),
      parameters: description?.success === true ? description.parameters : undefined,
      views: (evaluation?.views ?? []).map((view) => view.id),
      exports: (evaluation?.exports ?? []).map((offer) => offer.id),
    };
  } finally {
    document.close();
    await client.shutdown();
  }
};

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  const record = await checkFile(process.argv[2] ?? '');
  process.stdout.write(`${JSON.stringify(record)}\n`);
  process.exitCode = record.exit;
}
