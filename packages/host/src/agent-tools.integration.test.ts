/**
 * `test_model` as `tau serve` composes it: the registry is given a runtime
 * client and no GeoSpec runner, so the default runner borrows that client and
 * the native engine verifies the example's own acceptance suite.
 *
 * The proof runs in a child process (`fixtures/test-model-child-probe.ts`)
 * over the supervised runtime child, like the render probe, so the kernels
 * and the engine never load inside the vitest worker pool.
 */

import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const probePath = resolve(here, 'fixtures/test-model-child-probe.ts');
const tsxCliPath = fileURLToPath(import.meta.resolve('tsx/cli'));
const benchVise = resolve(repoRoot, 'libs/tau-examples/src/kernels/replicad/bench-vise');

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/* CI ships the native engine only to its Darwin lane; a Linux shard resolves the loader but has no binding, and this
 * proof is about the registry composition, not about provisioning. It runs wherever the engine actually loads. */
const nativeEngineLoads = await import('geospec-engine/node').then(
  ({ Engine }) => {
    try {
      new Engine().close();
      return true;
    } catch {
      return false;
    }
  },
  () => false,
);

type ProbeOutcome = { readonly offered: boolean; readonly isError: boolean; readonly content: unknown };

const probe = async (
  workspaceRoot: string,
  testNamePattern: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProbeOutcome> => {
  const child = spawn(process.execPath, [tsxCliPath, probePath, workspaceRoot, testNamePattern], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chunks: string[] = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => chunks.push(chunk));
  child.stderr.on('data', (chunk: string) => chunks.push(chunk));
  const exitCode = await new Promise<number | undefined>((resolve) => {
    child.once('exit', (code) => {
      resolve(code ?? undefined);
    });
  });
  const output = chunks.join('');
  const answer = output.split('\n').find((entry) => entry.startsWith('PROBE '));
  if (answer === undefined) {
    throw new Error(`test_model probe produced no answer (exit ${String(exitCode)}):\n${output}`);
  }
  return JSON.parse(answer.slice('PROBE '.length)) as ProbeOutcome;
};

describe.skipIf(!nativeEngineLoads)('test_model over the attached runtime (needs the native GeoSpec binding)', () => {
  it('should verify a bench vise requirement with the default runner', { timeout: 300_000 }, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-geospec-'));
    roots.push(workspaceRoot);
    await cp(benchVise, workspaceRoot, { recursive: true });

    /* One requirement keeps the default suite affordable; it still exports through the borrowed runtime
     * and checks exact BRep validity, topology, closure and volume on the native engine. */
    const outcome = await probe(workspaceRoot, 'R10 Frame:');

    expect(outcome.offered).toBe(true);
    expect(outcome.isError, JSON.stringify(outcome.content)).toBe(false);
    expect(outcome.content).toMatchObject({
      success: true,
      passed: 1,
      total: 1,
      accounting: { selected: 1, passed: 1, failed: 0, inconclusive: 0 },
    });
  });
});

describe('test_model without a loadable native binding', () => {
  it(
    'should not offer test_model when the engine resolves but its addon does not load (F-B3)',
    { timeout: 120_000 },
    async () => {
      const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-geospec-'));
      roots.push(workspaceRoot);
      await cp(benchVise, workspaceRoot, { recursive: true });

      /* The NAPI-RS loader takes this path instead of the platform package, so the binding fails to load exactly as
       * it does on a platform with no prebuilt addon, while every GeoSpec module still resolves. */
      const outcome = await probe(workspaceRoot, 'R10 Frame:', {
        ...process.env,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- The NAPI-RS loader's environment variable.
        NAPI_RS_NATIVE_LIBRARY_PATH: join(workspaceRoot, 'missing-geospec-engine.node'),
      });

      expect(outcome.offered).toBe(false);
    },
  );
});
