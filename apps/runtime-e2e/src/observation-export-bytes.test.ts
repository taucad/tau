/**
 * T08: operation observation is read-only. The same model must deliver the same bytes whether nobody observes or the
 * client asks the worker for facts, through a downgraded (budgeted) preview and its exports; and with facts on, the
 * render observation's `triangles` is the delivered tessellation report's count.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { esbuild } from '@taucad/esbuild';
import { middleware } from '@taucad/middleware';
import { replicadKernel } from '@taucad/replicad';
import { createRuntimeClient } from '@taucad/runtime/client';
import type { RuntimeOperationObservation } from '@taucad/runtime/types';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { loadFixture } from '@taucad/tau-examples/fixtures';

/** The birdhouse export fixture of `bundler-parity.test.ts`. */
const fixture = loadFixture('replicad', 'birdhouse');
/** Below the birdhouse's medium preview (1,754 triangles), so the preview is coarsened and reported as downgraded. */
const previewTriangleBudget = 1500;

const sha256 = (bytes: Uint8Array<ArrayBuffer> | string): string => createHash('sha256').update(bytes).digest('hex');

/**
 * The bytes an export delivers, less the one field that is not a function of the model: OCCT stamps the wall-clock
 * write time into a STEP file's `FILE_NAME` header, so two STEP exports a second apart differ there and nowhere else.
 *
 * @param target - The export id.
 * @param bytes - The exported file.
 * @returns The bytes to compare.
 */
const comparable = (target: string, bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> | string =>
  target === 'step'
    ? new TextDecoder()
        .decode(bytes)
        .replace(/^(FILE_NAME\('[^']*',)'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d'/mu, "$1'<written>'")
    : bytes;

type Arm = Readonly<{
  preview: string;
  triangles: number;
  downgraded: number;
  exports: Readonly<Record<string, string>>;
  observations: readonly RuntimeOperationObservation[];
}>;

/**
 * Render the budgeted preview and export the model once, with observation off or asking for facts.
 *
 * @param observe - Whether the client subscribes and asks the worker for facts.
 * @returns What the arm delivered and observed.
 */
const runArm = async (observe: boolean): Promise<Arm> => {
  const runtime = defineRuntime({
    plugins: [esbuild(), middleware()],
    kernels: [replicadKernel({ wasm: 'multi', previewTriangleBudget })],
  });
  const client = createRuntimeClient({
    transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs(fixture.files) }),
  });
  const observations: RuntimeOperationObservation[] = [];
  if (observe) {
    client.on('operation', (observation) => observations.push(observation));
    client.observe('facts');
  }
  const document = client.open({ source: { path: fixture.mainFile }, watch: false });
  try {
    const view = document.view('model');
    const outcome = await view.rendering();
    view.close();
    if (outcome.superseded || !outcome.rendering.success) {
      throw new Error('The preview did not render.');
    }
    const { artifact, issues } = outcome.rendering;
    expect(issues.map(({ code }) => code)).toContain('TESSELLATION_DOWNGRADED');
    const results = await Promise.all(
      (['glb', 'stl', 'step'] as const).map(async (target) => ({ target, result: await document.export(target) })),
    );
    const exports: Record<string, string> = {};
    for (const { target, result } of results) {
      if (!result.success) {
        throw new Error(result.issues.map(({ message }) => message).join('; '));
      }
      for (const file of result.files) {
        exports[`${target}:${file.name}`] = sha256(comparable(target, file.bytes));
      }
    }
    if (observe) {
      await expect
        .poll(() => observations.filter(({ operation }) => operation === 'export').map(({ facts }) => facts))
        .toEqual(['joined', 'joined', 'joined']);
    }
    return {
      preview: sha256(artifact.content),
      triangles: artifact.tessellation?.triangles ?? Number.NaN,
      downgraded: artifact.tessellation?.downgraded ?? 0,
      exports,
      observations,
    };
  } finally {
    document.close();
    await client.shutdown();
  }
};

describe('operation observation leaves delivered bytes unchanged (T08)', () => {
  it('should deliver identical preview and export bytes with observation off and with facts', async () => {
    const off = await runArm(false);
    const on = await runArm(true);

    expect(off.observations).toEqual([]);
    expect(off.downgraded).toBeGreaterThanOrEqual(1);
    expect(Object.keys(off.exports)).toHaveLength(3);
    expect(on.exports).toEqual(off.exports);
    expect(on.preview).toBe(off.preview);
    expect(on.triangles).toBe(off.triangles);
    expect(on.downgraded).toBe(off.downgraded);
  }, 300_000);

  it("should report a render's triangles as its delivered tessellation report", async () => {
    const on = await runArm(true);
    const renders = on.observations.filter(({ operation }) => operation === 'render');

    expect(renders).toHaveLength(1);
    expect(renders[0]).toMatchObject({ outcome: { type: 'succeeded' }, facts: 'joined' });
    expect(renders[0]?.adaptations).toContain('TESSELLATION_DOWNGRADED');
    expect(on.triangles).toBeGreaterThan(0);
    expect(renders[0]?.worker?.triangles).toBe(on.triangles);
  }, 300_000);
});
