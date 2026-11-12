/**
 * CLI headless scenario T11, its fixture sweep (charter D29, W17): `tau check --json` on every libs/tau-examples
 * fixture classifies it with one of the three exit codes and prints one record. Split from
 * `cli-scenarios.integration.test.ts`, which holds the rest of T11, because the sweep alone takes about ten minutes:
 * a sharded `CLI end-to-end` lane gives each shard every count-th fixture (`shardSlice`), so the shards together
 * still check every fixture once. Unsharded, it checks them all.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  cliBinPath,
  examplesRoot,
  recordOf,
  repoRoot,
  scenarioProcesses,
  shardSlice,
} from '#cli-scenarios.test-utils.js';
import type { Run } from '#cli-scenarios.test-utils.js';

let scratch = '';

const { tau } = scenarioProcesses(() => scratch);

beforeAll(async () => {
  if (!existsSync(cliBinPath)) {
    throw new Error(
      `${cliBinPath} is missing: run \`pnpm nx run cli-e2e:test:scenarios\`, which builds the CLI first.`,
    );
  }
  scratch = await mkdtemp(join(tmpdir(), 'tau-cli-examples-check-'));
  await mkdir(join(scratch, 'home'), { recursive: true });
  await mkdir(join(scratch, 'config'), { recursive: true });
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('T11 — tau check and tau test in CI', () => {
  it('should classify every libs/tau-examples fixture with the three exit codes, one record each', async () => {
    type Entry = { kernel: string; name: string; mainFile?: string; files: string[] };
    const manifest = JSON.parse(
      await readFile(resolvePath(repoRoot, 'libs/tau-examples/src/manifest.json'), 'utf8'),
    ) as Entry[];
    const broken = join(scratch, 'broken');
    await mkdir(broken, { recursive: true });
    /* A kernel is chosen by the model's imports, so the synthetic error imports one and then throws. */
    await writeFile(
      join(broken, 'main.ts'),
      "import { primitives } from '@jscad/modeling';\nexport default function main() {\n  if (primitives) throw new Error('a model error');\n  return primitives;\n}\n",
    );
    /* A sharded lane splits the fixtures across its shards; the synthetic error runs on every shard. */
    const inputs = [
      ...shardSlice(manifest).map((entry) => ({
        label: `${entry.kernel}/${entry.name}`,
        file: join(
          examplesRoot,
          entry.kernel,
          entry.name,
          entry.mainFile ?? entry.files.find((file) => file.startsWith('test-exports/')) ?? '',
        ),
      })),
      { label: 'synthetic/model-error', file: join(broken, 'main.ts') },
    ];
    const statusExit: Record<string, number> = { ok: 0, error: 1, refused: 3 };
    const outcomes: Array<
      Pick<Run, 'code' | 'signal' | 'pid' | 'timedOut' | 'elapsed'> & { label: string; status: unknown }
    > = [];
    const queue = [...inputs];
    const worker = async (): Promise<void> => {
      for (let input = queue.shift(); input !== undefined; input = queue.shift()) {
        // oxlint-disable-next-line no-await-in-loop -- a bounded pool drains the queue.
        const run = await tau(['check', input.file, '--json']);
        let status: unknown;
        try {
          ({ status } = recordOf(run));
        } catch {
          status = `unparsed: ${run.stderr.slice(-400)}`;
        }
        outcomes.push({
          label: input.label,
          code: run.code,
          signal: run.signal,
          pid: run.pid,
          timedOut: run.timedOut,
          elapsed: run.elapsed,
          status,
        });
      }
    };
    await Promise.all(Array.from({ length: Math.max(2, Math.min(4, availableParallelism() - 1)) }, worker));

    /* Evidence: one line per fixture where the run asks for it. */
    const log = process.env['TAU_CLI_SCENARIO_LOG'];
    if (log !== undefined && log !== '') {
      await writeFile(
        log,
        outcomes
          .toSorted((left, right) => left.label.localeCompare(right.label))
          .map(
            ({ label, code, status, signal, pid, timedOut, elapsed }) =>
              `${String(code)} ${String(status)} ${label}\t${JSON.stringify({ signal, pid, timedOut, elapsed })}`,
          )
          .join('\n'),
      );
    }
    const unclassified = outcomes.filter(
      ({ code, status }) =>
        typeof status !== 'string' || statusExit[status] === undefined || statusExit[status] !== code,
    );
    expect(unclassified).toEqual([]);
    expect(outcomes).toHaveLength(inputs.length);
    /* Up to four shards each still see all three codes: the build123d and PicoGK fixtures sit at manifest positions 0-1 and 23-26. */
    expect(new Set(outcomes.map(({ code }) => code))).toEqual(new Set([0, 1, 3]));
    expect(outcomes.find(({ label }) => label === 'synthetic/model-error')?.code).toBe(1);
    expect(outcomes.filter(({ label }) => /^(?:build123d|picogk)\//u.test(label)).every(({ code }) => code === 3)).toBe(
      true,
    );
  }, 1_800_000);
});
