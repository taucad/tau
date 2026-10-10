// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type * as OcctCore from '@taucad/occt-core';
import { asKnownArtifact } from '@taucad/runtime';
import type { Rendering } from '@taucad/runtime';
import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuildBundler } from '@taucad/esbuild';
import { replicadKernel } from '#replicad.kernel.js';

const occt = vi.hoisted(() => ({ instances: [] as unknown[] }));

vi.mock('@taucad/occt-core', async (importOriginal) => {
  const actual = await importOriginal<typeof OcctCore>();
  const initOcct: typeof actual.initOcct = async (...arguments_) => {
    const instance = await actual.initOcct(...arguments_);
    occt.instances.push(instance);
    return instance;
  };
  return { ...actual, initOcct };
});

const files = {
  'box.ts': `
    import { makeBox } from 'replicad';
    export default function main() {
      return makeBox([0, 0, 0], [10, 20, 30]);
    }
  `,
  'shell.ts': `
    import { drawRoundedRectangle } from 'replicad';
    export default function main() {
      return drawRoundedRectangle(100, 150, 5).sketchOnPlane().extrude(50).shell(2, (f) => f.inPlane('XY', 50));
    }
  `,
};

const createClient = (wasm: 'single' | 'multi') =>
  createTestRuntimeClient({
    runtime: defineRuntime({ kernels: [replicadKernel({ wasm })], bundlers: [esbuildBundler()] }),
    files,
  });

const renderOnce = async (client: ReturnType<typeof createClient>, path: string): Promise<Rendering> => {
  const document = client.open({ source: { path } });
  const view = document.view();
  try {
    const outcome = await view.rendering();
    if (outcome.superseded) {
      throw new Error(`Rendering of ${path} was superseded`);
    }
    return outcome.rendering;
  } finally {
    view.close();
    document.close();
  }
};

const glbBytes = (rendering: Rendering): number => {
  if (!rendering.success) {
    throw new Error(`Expected a successful rendering, got issues: ${JSON.stringify(rendering.issues)}`);
  }
  const artifact = asKnownArtifact(rendering.artifact);
  return artifact?.mimeType === 'model/gltf-binary' ? artifact.content.byteLength : 0;
};

// `replicad.setOC` binds one module global, so in-process clients in one module scope must share one OCCT heap.
describe('Replicad — shared OpenCASCADE instance per module scope', { timeout: 120_000 }, () => {
  it('drives interleaved in-process clients through one OCCT instance', async () => {
    const first = createClient('single');
    const second = createClient('single');
    try {
      await Promise.all([first.connect(), second.connect()]);
      const renderings = await Promise.all([
        renderOnce(first, 'shell.ts'),
        renderOnce(second, 'box.ts'),
        renderOnce(first, 'box.ts'),
        renderOnce(second, 'shell.ts'),
      ]);

      for (const rendering of renderings) {
        expect(glbBytes(rendering)).toBeGreaterThan(0);
      }
      expect(occt.instances).toHaveLength(1);
    } finally {
      first.terminate();
      second.terminate();
    }
  });

  it('refuses a different WASM build while a kernel holds the shared instance', async () => {
    const holder = createClient('single');
    const contender = createClient('multi');
    try {
      await holder.connect();
      expect(glbBytes(await renderOnce(holder, 'box.ts'))).toBeGreaterThan(0);

      await contender.connect();
      const refused = await renderOnce(contender, 'box.ts');

      expect(refused.success).toBe(false);
      expect(JSON.stringify(refused.issues)).toContain('a concurrent replicad kernel cannot load');
      expect(glbBytes(await renderOnce(holder, 'shell.ts'))).toBeGreaterThan(0);
      expect(occt.instances).toHaveLength(1);
    } finally {
      holder.terminate();
      contender.terminate();
    }
  });
});
