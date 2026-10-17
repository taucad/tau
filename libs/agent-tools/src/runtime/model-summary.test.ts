import { describe, expect, it, vi } from 'vitest';
import type { KernelIssue } from '@taucad/runtime/types';

import { summarizeRenderedModel } from '#runtime/model-summary.js';
import type { ModelAdmissionLimits } from '#runtime/model-summary.js';

/** A GLB holding only a JSON chunk: the summary reads accessor counts and bounds, never the BIN chunk. */
const glbOf = (json: Readonly<Record<string, unknown>>): Uint8Array<ArrayBuffer> => {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(text.byteLength / 4) * 4;
  const bytes = new Uint8Array(20 + padded);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  bytes.set(text, 20);
  bytes.fill(0x20, 20 + text.byteLength);
  return bytes;
};

const glbArtifact = (json: Readonly<Record<string, unknown>>) => ({
  mimeType: 'model/gltf-binary',
  content: glbOf(json),
});

/** One triangle-list mesh over a POSITION accessor, optionally indexed. */
const triangleMesh = (position: number, indices?: number) => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics are uppercase by specification.
  primitives: [{ attributes: { POSITION: position }, ...(indices === undefined ? {} : { indices }) }],
});

const engineLimits: ModelAdmissionLimits = {
  maxTriangles: 4_000_000,
  maxVertices: 2_000_000,
  maxSubjectBytes: 67_108_864,
};

/** What every admission warning ends with: what an estimate from the display mesh cannot know. */
const estimateCaveat =
  'The estimate comes from the display mesh: a kernel can export a finer subject, so a figure within a factor of about two of its limit is uncertain, and STEP and region loads are not estimated.';

describe('summarizeRenderedModel', () => {
  it('should report the box in the model frame, the parts and the mesh the default scene draws', async () => {
    const summary = await summarizeRenderedModel({
      artifact: glbArtifact({
        scene: 0,
        scenes: [{ nodes: [0, 1] }],
        nodes: [
          { name: 'lid', mesh: 0, translation: [0.1, 0, 0] },
          { name: 'stand', children: [2], translation: [0, 0.5, 0] },
          { name: 'post', mesh: 1 },
          { name: 'unused', mesh: 0, translation: [9, 9, 9] },
        ],
        meshes: [triangleMesh(0), triangleMesh(1, 2)],
        accessors: [
          { componentType: 5126, type: 'VEC3', count: 3, min: [0, 0, 0], max: [0.01, 0.02, 0.03] },
          { componentType: 5126, type: 'VEC3', count: 4, min: [-0.01, -0.01, -0.01], max: [0.01, 0.01, 0.01] },
          { componentType: 5125, type: 'SCALAR', count: 6 },
        ],
      }),
      issues: [],
    });

    // The Y-up metres of glTF become the model's Z-up millimetres: x = 1000 X, y = -1000 Z, z = 1000 Y.
    expect(summary).toEqual({
      bounds: {
        min: { x: -10, y: -30, z: 0 },
        max: { x: 110, y: 10, z: 510 },
        size: { x: 120, y: 40, z: 510 },
        unit: 'mm',
      },
      componentCount: 2,
      triangles: 3,
      vertices: 7,
    });
  });

  it('should transform each part through its node matrices and count every occurrence of a shared mesh', async () => {
    const quarterTurnAboutZ = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    const summary = await summarizeRenderedModel({
      artifact: glbArtifact({
        scenes: [{ nodes: [0, 2] }],
        nodes: [
          { matrix: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1], children: [1] },
          { mesh: 0, rotation: quarterTurnAboutZ },
          { mesh: 0, translation: [0, 0, -0.1] },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics are uppercase by specification.
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 5 }] }],
        accessors: [{ componentType: 5126, type: 'VEC3', count: 5, min: [0, 0, 0], max: [0.02, 0.01, 0.005] }],
      }),
      issues: [],
    });

    // The scaled, quarter-turned box spans X -0.02..0, Y 0..0.04, Z 0..0.01; the shifted copy Z -0.1..-0.095.
    expect(summary).toEqual({
      bounds: {
        min: { x: -20, y: -10, z: 0 },
        max: { x: 20, y: 100, z: 40 },
        size: { x: 40, y: 110, z: 40 },
        unit: 'mm',
      },
      componentCount: 2,
      triangles: 6,
      vertices: 10,
    });
  });

  it('should count the vertices of a POSITION accessor shared by the primitives of one part once', async () => {
    const summary = await summarizeRenderedModel({
      artifact: glbArtifact({
        nodes: [{ mesh: 0 }, { mesh: 0, translation: [0, 0.1, 0] }],
        meshes: [{ primitives: [...triangleMesh(0, 1).primitives, ...triangleMesh(0, 2).primitives] }],
        accessors: [
          { componentType: 5126, type: 'VEC3', count: 4, min: [0, 0, 0], max: [0.01, 0.01, 0.01] },
          { componentType: 5125, type: 'SCALAR', count: 3 },
          { componentType: 5125, type: 'SCALAR', count: 6 },
        ],
      }),
      issues: [],
    });

    // Each occurrence decodes the four shared vertices once and draws both primitives: 1 + 2 triangles.
    expect(summary).toMatchObject({ componentCount: 2, triangles: 6, vertices: 8 });
  });

  it('should dequantize a normalized position box before transforming it', async () => {
    const summary = await summarizeRenderedModel({
      artifact: glbArtifact({
        nodes: [{ mesh: 0, scale: [0.1, 0.1, 0.1] }],
        meshes: [triangleMesh(0)],
        accessors: [
          { componentType: 5121, normalized: true, type: 'VEC3', count: 3, min: [0, 0, 0], max: [255, 51, 255] },
        ],
      }),
      issues: [],
    });

    expect(summary?.bounds).toEqual({
      min: { x: 0, y: -100, z: 0 },
      max: { x: 100, y: 0, z: 20 },
      size: { x: 100, y: 100, z: 20 },
      unit: 'mm',
    });
  });

  it('should estimate a whole-model load at 72 bytes per triangle and warn for each limit it exceeds', async () => {
    const admissionLimits = vi.fn(async () => engineLimits);
    const summary = await summarizeRenderedModel({
      artifact: glbArtifact({
        nodes: [{ mesh: 0 }],
        meshes: [triangleMesh(0)],
        accessors: [{ componentType: 5126, type: 'VEC3', count: 3_000_192, min: [0, 0, 0], max: [0.1, 0.1, 0.1] }],
      }),
      issues: [],
      admissionLimits,
    });

    expect(admissionLimits).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({ componentCount: 1, triangles: 1_000_064, vertices: 3_000_192 });
    expect(summary?.admission).toEqual({
      triangles: { estimated: 1_000_064, limit: 4_000_000 },
      vertices: { estimated: 3_000_192, limit: 2_000_000 },
      subjectBytes: { estimated: 72_004_608, limit: 67_108_864 },
      warning: `A whole-model GeoSpec loadModel of this model is estimated to exceed the engine's admission limits (subject bytes about 72004608, limit 67108864; vertices about 3000192, limit 2000000). The engine refuses such a load, so its claims would be not decided at this capacity, not failed. ${estimateCaveat}`,
    });
  });

  it('should report a mesh within the limits without a warning', async () => {
    const summary = await summarizeRenderedModel({
      artifact: glbArtifact({
        nodes: [{ mesh: 0 }],
        meshes: [triangleMesh(0, 1)],
        accessors: [
          { componentType: 5126, type: 'VEC3', count: 71_144, min: [0, 0, 0], max: [0.1, 0.1, 0.1] },
          { componentType: 5125, type: 'SCALAR', count: 213_138 },
        ],
      }),
      issues: [],
      admissionLimits: async () => engineLimits,
    });

    expect(summary?.admission).toEqual({
      triangles: { estimated: 71_046, limit: 4_000_000 },
      vertices: { estimated: 71_144, limit: 2_000_000 },
      subjectBytes: { estimated: 5_115_312, limit: 67_108_864 },
    });
  });

  it('should estimate admission from the mesh a display simplification started from', async () => {
    const simplified: KernelIssue = {
      message: 'The display mesh had 2000000 triangles, over the preview budget.',
      code: 'DISPLAY_SIMPLIFIED',
      type: 'kernel',
      severity: 'warning',
      details: { producer: 'displaySimplification', from: 2_000_000, to: 500_000, maxErrorMm: 0.25 },
    };
    const summary = await summarizeRenderedModel({
      artifact: glbArtifact({
        nodes: [{ mesh: 0 }],
        meshes: [triangleMesh(0, 1)],
        accessors: [
          { componentType: 5126, type: 'VEC3', count: 250_000, min: [0, 0, 0], max: [0.1, 0.1, 0.1] },
          { componentType: 5125, type: 'SCALAR', count: 1_500_000 },
        ],
      }),
      issues: [simplified],
      admissionLimits: async () => engineLimits,
    });

    expect(summary).toMatchObject({ triangles: 500_000, vertices: 250_000 });
    expect(summary?.admission).toEqual({
      triangles: { estimated: 2_000_000, limit: 4_000_000 },
      vertices: { estimated: 1_000_000, limit: 2_000_000 },
      subjectBytes: { estimated: 144_000_000, limit: 67_108_864 },
      warning: `A whole-model GeoSpec loadModel of this model is estimated to exceed the engine's admission limits (subject bytes about 144000000, limit 67108864). The engine refuses such a load, so its claims would be not decided at this capacity, not failed. ${estimateCaveat}`,
    });
  });

  it('should leave the box out when the default scene draws no triangles', async () => {
    const summary = await summarizeRenderedModel({
      artifact: glbArtifact({
        nodes: [{ mesh: 0 }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics are uppercase by specification.
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 1 }] }],
        accessors: [{ componentType: 5126, type: 'VEC3', count: 2, min: [0, 0, 0], max: [1, 1, 1] }],
      }),
      issues: [],
    });

    expect(summary).toEqual({ componentCount: 0, triangles: 0, vertices: 0 });
  });

  it('should summarize nothing, and ask for no limits, when the default view is not a readable GLB', async () => {
    const admissionLimits = vi.fn(async () => engineLimits);
    const header = glbOf({}).slice(0, 12);
    const unreadable = glbOf({ nodes: [] });
    unreadable.set(new TextEncoder().encode('{"nodes"::'), 20);

    await expect(
      summarizeRenderedModel({
        artifact: { mimeType: 'image/svg+xml', content: '<svg/>' },
        issues: [],
        admissionLimits,
      }),
    ).resolves.toBeUndefined();
    await expect(
      summarizeRenderedModel({
        artifact: { mimeType: 'model/gltf-binary', content: header },
        issues: [],
        admissionLimits,
      }),
    ).resolves.toBeUndefined();
    await expect(
      summarizeRenderedModel({
        artifact: { mimeType: 'model/gltf-binary', content: unreadable },
        issues: [],
        admissionLimits,
      }),
    ).resolves.toBeUndefined();
    expect(admissionLimits).not.toHaveBeenCalled();
  });
});
