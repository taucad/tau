// @vitest-environment node
import { esbuildBundler } from '@taucad/esbuild';
import { createTestGeometry, createTestRuntimeClient, getTestParameters } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { describe, expect, it } from 'vitest';

import { loadNativeBackend, OpencascadeNativeUnavailableError } from '#opencascade-native-backend.js';
import {
  normalizeSolids,
  opencascadeNativeDetectPattern,
  opencascadeNativeKernel,
  toModelApi,
} from '#opencascade-native.kernel.js';

const model = (body: string) => ({ 'model.ts': `import oc from '@taucad/opencascade-native';\n${body}` });
const runtime = defineRuntime({ kernels: [opencascadeNativeKernel()], bundlers: [esbuildBundler()] });

const render = async (files: Record<string, string>, parameters: Record<string, unknown> = {}) =>
  createTestGeometry({ runtime, files, mainFile: 'model.ts', parameters });

const glbOf = (result: Awaited<ReturnType<typeof createTestGeometry>>): Uint8Array<ArrayBuffer> => {
  if (!result.success) {
    throw new Error(`render failed: ${result.issues.map((issue) => issue.message).join('; ')}`);
  }
  if (result.data.format !== 'gltf') {
    throw new Error(`expected gltf, received ${result.data.format}`);
  }
  return result.data.content;
};

describe('native OpenCascade backend', () => {
  it('loads the addon and reports the OCCT pin it was built against', () => {
    const version = loadNativeBackend().version();
    expect(version.backend).toBe('native');
    // OCCT's patch level is a parity axis, so the addon states it rather than
    // leaving the caller to assume it.
    expect(version.occt).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exposes the whole curated facade in one binding', () => {
    const api = toModelApi(loadNativeBackend());
    expect(Object.keys(api.createSolid).sort()).toEqual(['box', 'cone', 'cylinder', 'sphere', 'torus']);
    for (const name of [
      'boolean',
      'fuseAll',
      'cutAll',
      'commonAll',
      'extrude',
      'loft',
      'sweep',
      'sweepLine',
      'mesh',
      'toGlb',
      'readStep',
      'writeStep',
      'readBrep',
      'writeBrep',
    ]) {
      expect(typeof (api as unknown as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('rejects invalid arguments as errors rather than aborting the process', () => {
    const binding = loadNativeBackend();
    expect(() => binding.Solid.createBox([0, 0, 0], [0, 0, 0])).toThrow(/max > min/);
    expect(() => binding.Solid.createSphere(Number.NaN)).toThrow(/finite/);
    expect(() => binding.Solid.createBox([0, 0], [1, 1, 1])).toThrow(/exactly 3 components/);
  });

  it('meshes and encodes a batch in one crossing', () => {
    const binding = loadNativeBackend();
    const a = binding.Solid.createBox([0, 0, 0], [10, 10, 10]);
    const b = binding.Solid.createCylinder(3, [0, 0, 20]);
    const tessellation = { deflectionLinear: 0.25, deflectionAngular: 0.5, relativeLinear: false };
    const mesh = binding.mesh([a, b], tessellation);
    expect(mesh.triangles).toBeGreaterThan(12);
    expect(mesh.positions).toBeInstanceOf(Float64Array);
    expect(mesh.faceIds.length).toBe(mesh.triangles);
    expect(
      Buffer.from(binding.toGlb([a, b], tessellation))
        .subarray(0, 4)
        .toString(),
    ).toBe('glTF');
  });

  it('routes a DNF boolean expression through one kernel pass', () => {
    const binding = loadNativeBackend();
    const a = binding.Solid.createBox([0, 0, 0], [10, 10, 10]);
    const b = binding.Solid.createBox([5, 5, 5], [15, 15, 15]);
    // [1, -2, 0] is `a AND NOT b`.
    const [difference] = binding.boolean([a, b], Int32Array.from([1, -2, 0]));
    expect(difference?.metrics().volume).toBeCloseTo(875, 6);
    expect(binding.cutAll(a, [b]).metrics().volume).toBeCloseTo(875, 6);
    expect(binding.commonAll([a, b]).metrics().volume).toBeCloseTo(125, 6);
  });

  it('names the missing addon loudly instead of degrading to WASM', () => {
    const error = new OpencascadeNativeUnavailableError(new Error('boom'));
    expect(error.message).toContain('no WASM fallback');
    expect(error.cause).toBeInstanceOf(Error);
  });
});

describe('OpenCascadeNativeKernel', () => {
  it('detects the facade import', () => {
    expect(opencascadeNativeDetectPattern.test("import oc from '@taucad/opencascade-native';")).toBe(true);
    expect(opencascadeNativeDetectPattern.test("import { draw } from 'replicad';")).toBe(false);
  });

  it('keeps only real solids in a native handle', () => {
    const solid = loadNativeBackend().Solid.createSphere(1);
    expect(normalizeSolids(solid)).toHaveLength(1);
    expect(normalizeSolids([solid, undefined, 3])).toHaveLength(1);
    expect(normalizeSolids(undefined)).toHaveLength(0);
  });

  it('extracts default parameters from the model', async () => {
    const { defaultParameters } = await getTestParameters({
      runtime,
      files: model(
        'export const defaultParams = { size: 12 };\nexport default (oc, p) => oc.createSolid.box([0,0,0],[p.size,p.size,p.size]);',
      ),
      mainFile: 'model.ts',
    });
    expect(defaultParameters).toEqual({ size: 12 });
  });

  it('renders a parameterized model to a glTF artifact', async () => {
    const result = await render(
      model('export default (oc, p) => oc.createSolid.box([0,0,0],[p.size,p.size,p.size]);'),
      { size: 8 },
    );
    const glb = glbOf(result);
    expect(Buffer.from(glb).subarray(0, 4).toString()).toBe('glTF');
    expect(glb.byteLength).toBeGreaterThan(256);
  });

  it('returns an empty scene when the model exports no main function', async () => {
    const result = await render(model('export const notMain = 1;'));
    expect(glbOf(result).byteLength).toBeGreaterThan(0);
  });

  it('reports a model exception as a kernel issue', async () => {
    const result = await render(model('export default () => { throw new Error("bad model"); };'));
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.issues.map((issue) => issue.message)).toContain('bad model');
  });

  it('exports glb and step from the same native handle', async () => {
    const client = createTestRuntimeClient({
      runtime,
      files: model('export default (oc) => oc.createSolid.cylinder(5, [0,0,15]);'),
    });
    try {
      const created = await client.render({ source: { path: 'model.ts' } });
      expect(created.superseded).toBe(false);

      const glb = await client.export('glb');
      expect(glb.success).toBe(true);
      expect(glb.success && Buffer.from(glb.data[0]!.bytes).subarray(0, 4).toString()).toBe('glTF');

      const step = await client.export('step');
      expect(step.success).toBe(true);
      expect(step.success && Buffer.from(step.data[0]!.bytes).subarray(0, 13).toString()).toBe('ISO-10303-21;');
    } finally {
      await client.shutdown();
    }
  });

  it('round-trips a native handle through byte-stable BRep', async () => {
    const binding = loadNativeBackend();
    const solid = binding.Solid.createBox([0, 0, 0], [2, 3, 4]);
    const brep = binding.writeBrep([solid]);
    expect(Buffer.compare(brep, binding.writeBrep([solid]))).toBe(0);
    const [restored] = binding.readBrep(brep);
    expect(restored?.metrics().volume).toBeCloseTo(24, 6);
  });
});
