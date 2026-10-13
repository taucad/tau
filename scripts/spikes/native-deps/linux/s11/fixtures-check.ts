/**
 * Spike S11: runs the `tau check` prototype over every `libs/tau-examples` fixture, one process
 * per fixture (as `tau check <file>` runs), as a node:test suite.
 * Usage: node --test scripts/spikes/native-deps/linux/s11/fixtures-check.ts
 * Environment: S11_OUT (JSON record path, optional), S11_CONCURRENCY (default 2),
 *   S11_FILTER (regex over kernel/name, default all).
 * Exit codes: 0 when every fixture is classified 0/1/3 by its process exit, and 0, 1 and 3 are all observed.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

type Entry = { kind: string; kernel: string; name: string; mainFile?: string; files: string[] };
type Issue = { code: string; severity: string; message: string };
type Result = {
  status: string;
  exit: number;
  processExit: number | undefined;
  issues: Issue[];
  parameters: 'absent' | 'present';
  ms: number;
  views?: string[];
  exports?: string[];
};
type CheckOutput = {
  status: string;
  exit: number;
  issues: Issue[];
  parameters?: unknown;
  views: string[];
  exports: string[];
};

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const examplesRoot = join(repoRoot, 'libs/tau-examples/src/kernels');
const filter = new RegExp(process.env['S11_FILTER'] ?? '.', 'u');
const manifest = (
  JSON.parse(await readFile(join(repoRoot, 'libs/tau-examples/src/manifest.json'), 'utf8')) as Entry[]
).filter((entry) => filter.test(`${entry.kernel}/${entry.name}`));
const concurrency = Number(process.env['S11_CONCURRENCY'] ?? '2');

const runCheck = async (file: string): Promise<Result> =>
  new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(process.execPath, ['--import', 'tsx', join(import.meta.dirname, 'check.ts'), file], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      stdout += Buffer.from(chunk).toString('utf8');
    });
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      stderr += Buffer.from(chunk).toString('utf8');
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 300_000);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      const ms = Math.round(performance.now() - started);
      const line = stdout.trim().split('\n').at(-1) ?? '';
      try {
        const record = JSON.parse(line) as CheckOutput;
        resolve({
          ...record,
          processExit: code ?? undefined,
          parameters: record.parameters === undefined ? 'absent' : 'present',
          ms,
        });
      } catch {
        const tail = stderr
          .split('\n')
          .filter((text) => !text.startsWith('[kernel-worker]'))
          .slice(-5)
          .join(' | ');
        resolve({
          status: `crash${signal === null ? '' : ` ${signal}`}`,
          exit: code ?? 4,
          processExit: code ?? undefined,
          issues: [{ code: 'CHECK_CRASHED', severity: 'error', message: tail.slice(0, 600) }],
          parameters: 'absent',
          ms,
        });
      }
    });
  });

await test('tau check classifies every libs/tau-examples fixture', { timeout: 3_600_000 }, async () => {
  const queue = [...manifest];
  const records: Array<Partial<Entry> & Result> = [];
  const drain = async (): Promise<void> => {
    for (let entry = queue.shift(); entry !== undefined; entry = queue.shift()) {
      // A spec fixture without a main file is checked through its first test export.
      const entryFile = entry.mainFile ?? entry.files.find((file) => file.startsWith('test-exports/')) ?? '';
      // oxlint-disable-next-line no-await-in-loop -- a bounded worker pool drains the queue.
      const result = await runCheck(join(examplesRoot, entry.kernel, entry.name, entryFile));
      const record = { ...entry, entryFile, ...result };
      records.push(record);
      const first = record.issues[0];
      const detail =
        first === undefined
          ? ''
          : `${first.code} ${first.severity} ${first.message.replaceAll('\n', ' ').slice(0, 160)}`;
      process.stdout.write(
        `${String(record.exit)} ${record.status} ${entry.kernel}/${entry.name}:${entryFile} ${String(record.ms)}ms ${detail}\n`,
      );
    }
  };
  await Promise.all(Array.from({ length: concurrency }, drain));

  // A synthetic model error, so exit 1 is exercised even when every shipped fixture evaluates.
  const broken = await mkdtemp(join(tmpdir(), 's11-broken-'));
  await writeFile(
    join(broken, 'main.ts'),
    "import { primitives } from '@jscad/modeling';\nexport default function main() {\n  if (primitives) throw new Error('s11 synthetic model error');\n  return primitives;\n}\n",
  );
  const synthetic = await runCheck(join(broken, 'main.ts'));
  records.push({
    kind: 'synthetic',
    kernel: 'jscad (synthetic)',
    name: 'synthetic-throw',
    mainFile: 'main.ts',
    files: ['main.ts'],
    ...synthetic,
  });
  process.stdout.write(
    `${String(synthetic.exit)} ${synthetic.status} synthetic-throw ${String(synthetic.ms)}ms ${synthetic.issues[0]?.code ?? ''} ${synthetic.issues[0]?.message.slice(0, 160) ?? ''}\n`,
  );

  const output = process.env['S11_OUT'];
  if (output !== undefined) {
    await writeFile(output, `${JSON.stringify(records, undefined, 2)}\n`);
  }
  const counts: Record<string, number> = {};
  for (const record of records) {
    counts[String(record.exit)] = (counts[String(record.exit)] ?? 0) + 1;
  }
  process.stdout.write(`summary ${JSON.stringify(counts)} of ${String(records.length)}\n`);
  assert.equal(records.length, manifest.length + 1);
  for (const record of records) {
    const label = `${record.kernel ?? ''}/${record.name ?? ''}`;
    assert.ok(
      [0, 1, 3].includes(record.exit),
      `${label} unclassified: ${record.status} ${JSON.stringify(record.issues)}`,
    );
    assert.equal(record.processExit, record.exit, `${label} process exit differs from the record`);
  }
  assert.equal(synthetic.exit, 1);
  assert.ok((counts['0'] ?? 0) > 0 && (counts['3'] ?? 0) > 0, 'exit codes 0 and 3 both observed over the fixtures');
});
