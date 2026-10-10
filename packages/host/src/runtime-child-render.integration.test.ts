/**
 * The daemon's geometry vertical, from source.
 *
 * `tau serve` forks `packages/cli/src/host-runtime-child.ts` under the tsx
 * loader, dials it over loopback with `fromNodeFs(workspaceRoot)` bridged back,
 * and answers `evaluate_model` from it. Every layer of that was covered by a
 * unit test with a fake runtime client and none of it was covered *together*:
 * the G4 live proof (2026-09-03 07:14) answered all 20 `evaluate_model` and
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
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import '@taucad/geospec-engine/register';
import { analyzeMesh } from 'geospec/mesh';
import { loadStep } from 'geospec/step';
import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';

import { startRuntimeChild } from '#runtime-child-supervisor.js';
import type { RuntimeChildHandle } from '#runtime-child-supervisor.js';

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
  it('answers evaluate_model for a valid model on the supervised child', { timeout: 120_000 }, async () => {
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
     * `evaluate_model` on a broken model, an edit that fixes it, and a
     * second `evaluate_model` on the same registry and runtime client. */
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

/*
 * One realm per connection (kernel-realm-shared-state blueprint, WP-B4, invariant I8).
 *
 * The daemon dials its runtime child once per agent root and once per relay
 * session (`host-daemon.ts`, `agentRuntimes`). Today every connection's kernel
 * worker runs in the child's one realm, so replicad's module-level OpenCASCADE
 * binding belongs to whichever root initialised last and an earlier root's
 * shapes meet a foreign heap (`KERNEL_BINDING_FAILED`), and one root's
 * runaway model blocks every root. These cases dial the real CLI child the way
 * the daemon does: one `webSocketTransport` client per root.
 */

const replicadBox = (x: number, y: number, z: number): string =>
  `import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(${String(x)}, ${String(y)}, ${String(z)});\n`;

/** Never returns: the box keeps the replicad import live through bundling. */
const hungModel =
  "import { makeBaseBox } from 'replicad';\nexport default () => { const box = makeBaseBox(1, 1, 1); while (box) { /* hang */ } return box; };\n";

const startSourceChild = async (): Promise<RuntimeChildHandle> => {
  /* The supervisor forks a `.ts` child only from a tsx-carrying parent; the
   * daemon test at `host-daemon.test.ts` grants it the same way. */
  const originalExecArgv = process.execArgv;
  process.execArgv = [...originalExecArgv, '--import', 'tsx'];
  try {
    return await startRuntimeChild({ modulePath: resolve(here, '../../cli/src/host-runtime-child.ts') });
  } finally {
    process.execArgv = originalExecArgv;
  }
};

const dial = (child: RuntimeChildHandle, root: string) =>
  createRuntimeClient({
    transport: webSocketTransport({
      url: child.url,
      fileSystem: fromNodeFs(root),
      createSocket: (url) => new WebSocket(url, { headers: { authorization: `Bearer ${child.authorizationToken}` } }),
    }),
  });

type RuntimeClient = ReturnType<typeof dial>;
type RuntimeDocument = ReturnType<RuntimeClient['open']>;

const projectRoot = async (source: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-host-realm-'));
  roots.push(root);
  await writeFile(join(root, 'main.ts'), source, 'utf8');
  return root;
};

const withTimeout = async <Value>(promise: Promise<Value>, milliseconds: number, label: string): Promise<Value> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} did not settle within ${String(milliseconds)} ms`));
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const issuesOf = (issues: ReadonlyArray<{ readonly code: string; readonly message: string }>): string =>
  issues
    .map(({ code, message }) => `${code}: ${message}`)
    .join('; ')
    .slice(0, 240);

/** `'ok'`, or the reason the step failed — collected so one run shows the whole matrix. */
const step = async (label: string, action: () => Promise<string>, milliseconds = 60_000): Promise<string> => {
  try {
    return await withTimeout(action(), milliseconds, label);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const render = async (document: RuntimeDocument): Promise<string> => {
  const outcome = await document.view().rendering();
  if (outcome.superseded) {
    return 'superseded';
  }
  return outcome.rendering.success ? 'ok' : issuesOf(outcome.rendering.issues);
};

/** Sorted bounding-box size of the document's STEP export, re-imported through GeoSpec's own STEP reader. */
const stepSize = async (document: RuntimeDocument): Promise<string> => {
  const exported = await document.export('step');
  if (!exported.success) {
    return issuesOf(exported.issues);
  }
  const analysis = await analyzeMesh({ subject: await loadStep({ source: exported.files[0].bytes, mesh: true }) });
  if (!analysis.success) {
    return `STEP did not re-import: ${JSON.stringify(analysis).slice(0, 240)}`;
  }
  const size = [...(analysis.stats.boundingBox?.size ?? [])].sort((left, right) => left - right);
  return size.map((value) => value.toFixed(3)).join('x');
};

const exportsGlb = async (document: RuntimeDocument): Promise<string> => {
  const exported = await document.export('glb');
  return exported.success ? 'ok' : issuesOf(exported.issues);
};

describe('runtime child realm per connection (from source)', () => {
  it(
    'renders and STEP-exports two replicad roots interleaved and concurrently on one child',
    { timeout: 300_000 },
    async () => {
      const rootA = await projectRoot(replicadBox(10, 20, 30));
      const rootB = await projectRoot(replicadBox(12, 24, 36));
      const child = await startSourceChild();
      const clientA = dial(child, rootA);
      const clientB = dial(child, rootB);
      const log: Record<string, string> = {};
      try {
        let documentA = clientA.open({ source: { path: 'main.ts' }, watch: false });
        const documentB = clientB.open({ source: { path: 'main.ts' }, watch: false });

        log['1 render A'] = await step('render A', async () => render(documentA));
        log['2 render B'] = await step('render B', async () => render(documentB));
        log['3 STEP A after B'] = await step('STEP A after B', async () => stepSize(documentA));
        log['4 GLB A after B'] = await step('GLB A after B', async () => exportsGlb(documentA));

        documentA.close();
        documentA = clientA.open({ source: { path: 'main.ts' }, watch: false });
        log['5 re-opened A render'] = await step('re-opened A render', async () => render(documentA));
        log['6 re-opened A STEP'] = await step('re-opened A STEP', async () => stepSize(documentA));

        documentA.close();
        await writeFile(join(rootA, 'main.ts'), replicadBox(14, 20, 30), 'utf8');
        documentA = clientA.open({ source: { path: 'main.ts' }, watch: false });
        log['7 edited A render'] = await step('edited A render', async () => render(documentA));
        log['8 edited A STEP'] = await step('edited A STEP', async () => stepSize(documentA));

        const [concurrentA, concurrentB] = await Promise.all([
          step('concurrent STEP A', async () => stepSize(documentA)),
          step('concurrent STEP B', async () => stepSize(documentB)),
        ]);
        log['9 concurrent STEP A'] = concurrentA;
        log['9 concurrent STEP B'] = concurrentB;
      } finally {
        clientA.terminate();
        clientB.terminate();
        await child.close();
      }

      expect(log).toEqual({
        '1 render A': 'ok',
        '2 render B': 'ok',
        '3 STEP A after B': '10.000x20.000x30.000',
        '4 GLB A after B': 'ok',
        '5 re-opened A render': 'ok',
        '6 re-opened A STEP': '10.000x20.000x30.000',
        '7 edited A render': 'ok',
        '8 edited A STEP': '14.000x20.000x30.000',
        '9 concurrent STEP A': '14.000x20.000x30.000',
        '9 concurrent STEP B': '12.000x24.000x36.000',
      });
    },
  );

  it(
    "keeps serving other roots while one root's model hangs, and serves that root again after its client closes",
    { timeout: 300_000 },
    async () => {
      const rootB = await projectRoot(replicadBox(12, 24, 36));
      const rootH = await projectRoot(hungModel);
      const child = await startSourceChild();
      const clientB = dial(child, rootB);
      const clientH = dial(child, rootH);
      let clientH2: RuntimeClient | undefined;
      const log: Record<string, string> = {};
      try {
        const documentB = clientB.open({ source: { path: 'main.ts' }, watch: false });
        log['1 render B'] = await step('render B', async () => render(documentB));

        const documentH = clientH.open({ source: { path: 'main.ts' }, watch: false });
        /* Settles only when its client closes: the model loops. `allSettled` observes that rejection. */
        const hungRendering = Promise.allSettled([documentH.view().rendering()]);
        /* Let the hung root's kernel initialise and enter its loop. */
        await delay(5000);

        log['2 STEP B while H hangs'] = await step('STEP B while H hangs', async () => stepSize(documentB), 30_000);
        log['3 GLB B while H hangs'] = await step('GLB B while H hangs', async () => exportsGlb(documentB), 30_000);

        clientH.terminate();
        await Promise.race([hungRendering, delay(10_000)]);
        await writeFile(join(rootH, 'main.ts'), replicadBox(5, 6, 7), 'utf8');
        clientH2 = dial(child, rootH);
        const documentH2 = clientH2.open({ source: { path: 'main.ts' }, watch: false });
        log['4 new client for H after close'] = await step(
          'new client for H after close',
          async () => stepSize(documentH2),
          60_000,
        );
      } finally {
        clientB.terminate();
        clientH.terminate();
        clientH2?.terminate();
        await child.close();
      }

      expect(log).toEqual({
        '1 render B': 'ok',
        '2 STEP B while H hangs': '12.000x24.000x36.000',
        '3 GLB B while H hangs': 'ok',
        '4 new client for H after close': '5.000x6.000x7.000',
      });
    },
  );

  it('terminates every connected client when the child exits', { timeout: 120_000 }, async () => {
    /* Keep-green: one realm per connection must not hide a child exit from the daemon, which replaces a
     * terminated client and reports `CHILD_EXIT` (`host-daemon.ts`, `ensureRuntimeChild`). */
    const rootA = await projectRoot(replicadBox(10, 20, 30));
    const rootB = await projectRoot(replicadBox(12, 24, 36));
    const child = await startSourceChild();
    const clientA = dial(child, rootA);
    const clientB = dial(child, rootB);
    try {
      const documentA = clientA.open({ source: { path: 'main.ts' }, watch: false });
      const documentB = clientB.open({ source: { path: 'main.ts' }, watch: false });
      expect([await render(documentA), await render(documentB)]).toEqual(['ok', 'ok']);

      await child.close();

      await vi.waitFor(
        () => {
          expect([clientA.lifecycleState, clientB.lifecycleState]).toEqual(['terminated', 'terminated']);
        },
        { timeout: 15_000 },
      );
    } finally {
      clientA.terminate();
      clientB.terminate();
      await child.close();
    }
  });
});
