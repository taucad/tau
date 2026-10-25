// @vitest-environment node
import { gltfEdgeDetection } from '@taucad/middleware';
import { esbuildBundler } from '@taucad/esbuild';
import { defineMiddleware } from '@taucad/runtime/middleware';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import {
  createMockRuntime,
  createTestRuntimeClient,
  extractGltfFromResult,
  glbToDocument,
} from '@taucad/runtime-testing';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { opencascadeKernel } from '#opencascade.kernel.js';

const box = `import { BRepPrimAPI_MakeBox } from 'libcascade';
export default function main() { return { shape: new BRepPrimAPI_MakeBox(10, 20, 30).Shape(), name: 'Box' }; }`;

const primitiveModeLines = 1;

/** The extras of every `LINES` primitive in a GLB. */
const lineExtras = async (bytes: Uint8Array<ArrayBuffer>): Promise<Array<Record<string, unknown>>> => {
  const document = await glbToDocument(bytes);
  return document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .filter((primitive) => primitive.getMode() === primitiveModeLines)
    .map((primitive) => primitive.getExtras());
};

const probe = vi.fn();
const fallbackProbe = defineMiddleware({
  id: 'fallbackEdgeProbe',
  name: 'FallbackEdgeProbe',
  version: '1.0.0',
  content: { views: { 'model/gltf-binary': ['includeEdges'] } },
  async wrapRender(input, handler) {
    probe(input);
    return handler(input);
  },
});

/* The kernel, its wasm, the bundler, the middleware planner and `GltfEdgeDetection` are all real. */
const client = createTestRuntimeClient({
  runtime: defineRuntime({
    kernels: [opencascadeKernel()],
    bundlers: [esbuildBundler()],
    middleware: [gltfEdgeDetection(), fallbackProbe()],
  }),
  files: { 'main.ts': box },
});
const document = client.open({ source: { path: 'main.ts' }, watch: false });

afterAll(async () => {
  await client.shutdown();
});

const renderModel = async (includeEdges: boolean): Promise<Uint8Array<ArrayBuffer>> => {
  const view = document.view('model', { content: { includeEdges } });
  const outcome = await view.rendering();
  view.close();
  if (outcome.superseded) {
    throw new Error('Unexpected superseded OpenCascade render');
  }
  expect(outcome.rendering.success ? [] : outcome.rendering.issues).toEqual([]);
  const bytes = extractGltfFromResult(outcome.rendering);
  if (!bytes) {
    throw new Error('OpenCascade render returned no GLB');
  }
  return bytes;
};

describe('OpenCascade native edge claim', { timeout: 60_000 }, () => {
  it('should render with includeEdges without running any fallback edge middleware', async () => {
    probe.mockClear();
    const bytes = await renderModel(true);

    // The planner skips every middleware whose only reason to run is a key the kernel owns.
    expect(probe).not.toHaveBeenCalled();
    // The one line primitive is the kernel's B-rep set: GltfEdgeDetection's lines carry no component kind.
    const extras = await lineExtras(bytes);
    expect(extras).toEqual([
      expect.objectContaining({ tauComponentKind: 'line', tauComponentSelector: 'node/0/edges' }),
    ]);
    expect(extras[0]?.['edgeGroups']).toHaveLength(12);

    // The same bytes would gain overlay lines had the fallback detector run, so the check above is not vacuous.
    const detector = await resolveRuntimePluginDefinition('middleware', gltfEdgeDetection());
    const fallback = await detector.wrapRender!(
      { view: 'model', mimeType: 'model/gltf-binary', options: {}, content: { includeEdges: true } },
      async () => ({ success: true, data: { mimeType: 'model/gltf-binary', content: bytes }, issues: [] }),
      createMockRuntime({ options: { thresholdDegrees: 30 } }),
    );
    if (!fallback.success || !(fallback.data.content instanceof Uint8Array)) {
      throw new Error('GltfEdgeDetection returned no GLB');
    }
    const fallbackLines = await lineExtras(fallback.data.content);
    expect(fallbackLines.length).toBeGreaterThan(1);
  });

  it('should render no lines when includeEdges is off', async () => {
    probe.mockClear();

    expect(await lineExtras(await renderModel(false))).toEqual([]);
    expect(probe).not.toHaveBeenCalled();
  });

  it('should export a GLB with the kernel lines only when includeEdges is asked', async () => {
    const withEdges = await document.export('glb', { content: { includeEdges: true } });
    const withoutEdges = await document.export('glb', {});
    if (!withEdges.success || !withoutEdges.success) {
      throw new Error('OpenCascade GLB export failed');
    }

    expect(await lineExtras(withEdges.files[0].bytes)).toEqual([
      expect.objectContaining({ tauComponentKind: 'line', tauComponentSelector: 'node/0/edges' }),
    ]);
    expect(await lineExtras(withoutEdges.files[0].bytes)).toEqual([]);
  });
});
