/**
 * The daemon's geometry vertical, from source.
 *
 * `tau serve` forks `packages/cli/src/host-runtime-child.ts` under the tsx
 * loader, dials it over loopback with `fromNodeFs(workspaceRoot)` bridged back,
 * and answers `get_kernel_result` from it. Every layer of that was covered by a
 * unit test with a fake runtime client and none of it was covered *together*:
 * the G4 live proof (2026-09-03 07:14) answered all 20 `get_kernel_result` and
 * both `screenshot` calls with `This Tau Host could not render main.scad:
 * Runtime render failed` on a valid OpenSCAD file, and no vertical caught it.
 *
 * This one does. The model is the live proof's own hex nut, and the probe runs
 * in its own process because a TypeScript runtime child needs a tsx parent
 * (`fixtures/render-child-probe.ts`).
 *
 * Root cause and status of the failure it pins:
 * `docs/research/agent-host-transports-and-offline.md` § "Addendum:
 * FIX-DAEMON-RENDER".
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const probePath = resolve(here, 'fixtures/render-child-probe.ts');
const tsxCliPath = fileURLToPath(import.meta.resolve('tsx/cli'));

/** The `main.scad` the live daemon refused to render. */
const hexNut = 'difference(){ cylinder(d=34,h=14,$fn=6); cylinder(d=8,h=16,$fn=32); }\n';

/* A bundled TypeScript entry, because the reported stale verdicts were served from a retained
 * *bundle*: a kernel that re-reads its own entry (OpenSCAD) cannot show the defect. */
const brokenModel =
  "import { makeCylinder } from 'replicad';\nexport default () => makeCylinder(5, 20).notAMethod();\n";
const repairedModel = "import { makeCylinder } from 'replicad';\nexport default () => makeCylinder(5, 20);\n";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

type ProbeOutcome = { readonly isError: boolean; readonly content: unknown };

const probe = async (workspaceRoot: string, targetFile: string, repairedSource?: string): Promise<ProbeOutcome> => {
  const answers = await probeSequence(workspaceRoot, targetFile, repairedSource);
  return answers[0]!;
};

/** Every `PROBE`/`PROBE2` answer the driver printed, in order. */
const probeSequence = async (
  workspaceRoot: string,
  targetFile: string,
  repairedSource?: string,
): Promise<ProbeOutcome[]> => {
  const argv = [tsxCliPath, probePath, workspaceRoot, targetFile];
  if (repairedSource !== undefined) {
    argv.push(repairedSource);
  }
  const child = spawn(process.execPath, argv, {
    cwd: repoRoot,
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
  const answers = output
    .split('\n')
    .filter((entry) => entry.startsWith('PROBE ') || entry.startsWith('PROBE2 '))
    .map((entry) => JSON.parse(entry.slice(entry.indexOf(' ') + 1)) as ProbeOutcome);
  if (answers.length === 0) {
    throw new Error(`render probe produced no answer (exit ${String(exitCode)}):\n${output}`);
  }
  return answers;
};

describe('runtime child render (from source)', () => {
  it('answers get_kernel_result for a valid model on the supervised child', { timeout: 120_000 }, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-render-'));
    roots.push(workspaceRoot);
    await writeFile(join(workspaceRoot, 'main.scad'), hexNut, 'utf8');

    const outcome = await probe(workspaceRoot, 'main.scad');

    expect(outcome.isError, JSON.stringify(outcome.content)).toBe(false);
    expect(JSON.stringify(outcome.content)).toContain('"status":"ready"');
  });

  it('names the reason it could not render, never an invented one', { timeout: 120_000 }, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-render-'));
    roots.push(workspaceRoot);
    await writeFile(join(workspaceRoot, 'main.scad'), 'this is not OpenSCAD @@@\n', 'utf8');

    const outcome = await probe(workspaceRoot, 'main.scad');

    /* A geometry error is a verdict, not a host failure: it comes back as a
     * successful tool call carrying the kernel's own issues. What must never
     * come back is `Runtime render failed` — the placeholder
     * `runtime-client-core` invents when a terminal error state arrives with
     * nothing to say. */
    expect(JSON.stringify(outcome.content)).not.toContain('Runtime render failed');
  });

  it('answers the repaired source, not the failure it already reported', { timeout: 120_000 }, async () => {
    /* The reported desktop sequence, on the daemon's own vertical: one
     * `get_kernel_result` on a broken model, an edit that fixes it, and a
     * second `get_kernel_result` on the same registry and runtime client. */
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-render-'));
    roots.push(workspaceRoot);
    await writeFile(join(workspaceRoot, 'main.ts'), brokenModel, 'utf8');

    const [broken, repaired] = await probeSequence(workspaceRoot, 'main.ts', repairedModel);

    expect(JSON.stringify(broken?.content)).not.toContain('"status":"ready"');
    expect(repaired, 'the driver printed no second answer').toBeDefined();
    expect(repaired?.isError, JSON.stringify(repaired?.content)).toBe(false);
    expect(JSON.stringify(repaired?.content)).toContain('"status":"ready"');
  });
});
