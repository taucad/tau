// @vitest-environment node
/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { validateTauCadTopology } from '@taucad/geometry-core';
import type { TauCadTopologyPayload } from '@taucad/geometry-core';
import { assimp } from '@taucad/assimp';
import {
  assertSuccess,
  createTestRuntimeClient,
  extractGltfFromResult,
  getBoundingBoxFromInspect,
  getInspectReport,
  validateGlbData,
} from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { afterAll, describe, expect, it } from 'vitest';

import { picogk } from '#index.js';

type ResourceManifest = {
  readonly target: string;
  readonly workerPath: string;
  readonly workerSha256: string;
  readonly resourceFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string; readonly label: string }>;
};

const radiusProperty = 'RadiusMm';
const voxelSizeProperty = 'VoxelSizeMm';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const targetRoot = resolve(workspaceRoot, `apps/desktop/resources/picogk/${process.platform}-${process.arch}`);
const manifest = JSON.parse(readFileSync(resolve(targetRoot, 'tau-runtime-manifest.json'), 'utf8')) as ResourceManifest;
const trustRoot = mkdtempSync(join(tmpdir(), 'tau-picogk-native-test-'));
const trustFile = join(trustRoot, 'trust.json');
writeFileSync(trustFile, '{"version":1,"trusted":true}\n');

const runtime = defineRuntime({
  plugins: [
    assimp({ preset: 'all', transcoders: { export: { backend: 'native' } } }),
    picogk({
      kernels: {
        default: {
          workerExecutable: resolve(targetRoot, manifest.workerPath),
          workerSha256: manifest.workerSha256,
          trustFile,
          resourceFiles: manifest.resourceFiles.map(({ path, ...resource }) => ({
            ...resource,
            path: resolve(targetRoot, path),
          })),
          requestTimeout: 120_000,
        },
      },
    }),
  ],
});

const sphereSource = `using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;
using Tau.PicoGK;

public sealed record Params
{
    [Range(0.25, 4.0), Display(Name = "Voxel size", Description = "millimetres", Order = 0)]
    public float VoxelSizeMm { get; init; } = 1.0f;
    [Range(5.0, 50.0)]
    public float RadiusMm { get; init; } = 20.0f;
}

public static class Model
{
    public static TauModel Build(Params p) => TauModel.Create(
        TauComponent.FromVoxels("Sphere", Voxels.voxSphere(Vector3.Zero, p.RadiusMm), "#4f7dd9"));
}
`;

const multiFileMain = `using System.ComponentModel.DataAnnotations;
using Tau.PicoGK;
public sealed record Params
{
    [Range(0.25, 4.0)] public float VoxelSizeMm { get; init; } = 1.0f;
    public float RadiusMm { get; init; } = 10.0f;
}
public static class Model
{
    public static TauModel Build(Params p) => TauModel.Create(
        TauComponent.FromVoxels("Asset sphere", ShapeFactory.Create(p.RadiusMm), "#25a18e"));
}
`;
const helperSource = (factor: number): string => `using System.Globalization;
using System.IO;
using System.Numerics;
using PicoGK;
public static class ShapeFactory
{
    public static Voxels Create(float radius) => Voxels.voxSphere(
        Vector3.Zero, radius * ${String(factor)}f * float.Parse(File.ReadAllText("scale.txt"), CultureInfo.InvariantCulture));
}
`;

type GltfJson = {
  readonly nodes: ReadonlyArray<{ readonly mesh?: number }>;
  readonly meshes: ReadonlyArray<{
    readonly primitives: ReadonlyArray<{ readonly mode?: number; readonly indices?: number }>;
  }>;
  readonly accessors: ReadonlyArray<{ readonly count: number }>;
  readonly bufferViews: ReadonlyArray<{ readonly byteOffset?: number; readonly byteLength: number }>;
  readonly extensions: { readonly TAU_cad_topology: { readonly topologyBufferView: number } };
};

const readTopology = (
  bytes: Uint8Array<ArrayBuffer>,
): { readonly json: GltfJson; readonly payload: TauCadTopologyPayload } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GltfJson;
  const binaryStart = 20 + jsonLength + 8;
  const topologyView = json.bufferViews[json.extensions.TAU_cad_topology.topologyBufferView]!;
  const start = binaryStart + (topologyView.byteOffset ?? 0);
  return {
    json,
    payload: JSON.parse(
      new TextDecoder().decode(bytes.subarray(start, start + topologyView.byteLength)),
    ) as TauCadTopologyPayload,
  };
};

afterAll(() => {
  rmSync(trustRoot, { recursive: true, force: true });
});

describe('PicoGK native C# kernel', () => {
  it('extracts parameters, JIT-renders canonical topology, and exports retained GLB without system dotnet', async () => {
    const previousPath = process.env['PATH'];
    process.env['PATH'] = '';
    const client = createTestRuntimeClient({ runtime, files: { 'main.cs': sphereSource } });
    const parameters = new Promise<{ readonly defaults: Record<string, unknown>; readonly schema: unknown }>(
      (resolve) => {
        client.on('parametersResolved', (result) => {
          if (result.success) {
            resolve({ defaults: result.data.defaultParameters, schema: result.data.jsonSchema });
          }
        });
      },
    );
    try {
      const rendered = await client.render({ source: { path: 'main.cs' }, parameters: { [radiusProperty]: 15 } });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Native PicoGK render was unexpectedly superseded.');
      }
      const analyzed = await parameters;
      expect(analyzed.defaults).toEqual({ [voxelSizeProperty]: 1, [radiusProperty]: 20 });
      expect(analyzed.schema).toMatchObject({
        properties: {
          [voxelSizeProperty]: { minimum: 0.25, maximum: 4, title: 'Voxel size', description: 'millimetres' },
          [radiusProperty]: { minimum: 5, maximum: 50 },
        },
      });
      assertSuccess(rendered.geometry);
      const glb = extractGltfFromResult(rendered.geometry);
      if (!glb) {
        throw new Error('Expected PicoGK GLB geometry.');
      }
      validateGlbData(glb);
      const { json, payload } = readTopology(glb);
      expect(payload.components).toEqual([
        expect.objectContaining({
          id: 'component:sphere',
          name: 'Sphere',
          kind: 'mesh',
          selector: 'node/0/surface',
          capabilities: {
            hasPreciseTopology: false,
            exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
          },
        }),
      ]);
      expect(
        validateTauCadTopology(payload, {
          nodes: json.nodes.map(({ mesh }) => ({ meshIndex: mesh })),
          meshes: json.meshes.map(({ primitives }) =>
            primitives.map(({ mode = 4, indices }) => ({
              mode,
              indexCount: indices === undefined ? 0 : json.accessors[indices]!.count,
            })),
          ),
        }),
      ).toEqual([]);
      const bounds = getBoundingBoxFromInspect(await getInspectReport(glb));
      expect(bounds?.size).toEqual([expect.closeTo(0.03, 2), expect.closeTo(0.03, 2), expect.closeTo(0.03, 2)]);

      const exported = await client.export('glb');
      assertSuccess(exported);
      expect(exported.data).toHaveLength(1);
      expect(exported.data[0]?.name).toBe('model.glb');
      validateGlbData(exported.data[0]!.bytes);

      const stl = await client.export('stl');
      assertSuccess(stl);
      expect(stl.data).toHaveLength(1);
      const roundTrip = createTestRuntimeClient({ runtime, files: { 'roundtrip.stl': stl.data[0]!.bytes } });
      try {
        const imported = await roundTrip.render({ source: { path: 'roundtrip.stl' } });
        expect(imported.superseded).toBe(false);
        if (imported.superseded) {
          throw new Error('PicoGK STL round trip was unexpectedly superseded.');
        }
        assertSuccess(imported.geometry);
        const roundTripGlb = extractGltfFromResult(imported.geometry);
        if (!roundTripGlb) {
          throw new Error('Expected Assimp to reimport the PicoGK STL as GLB.');
        }
        validateGlbData(roundTripGlb);
        const roundTripBounds = getBoundingBoxFromInspect(await getInspectReport(roundTripGlb));
        expect(roundTripBounds?.size).toEqual([
          expect.closeTo(0.03, 2),
          expect.closeTo(0.03, 2),
          expect.closeTo(0.03, 2),
        ]);
      } finally {
        await roundTrip.shutdown();
      }
    } finally {
      process.env['PATH'] = previousPath;
      await client.shutdown();
    }
  }, 180_000);

  it('rerenders secondary C# and project-asset edits and recovers after a Roslyn error', async () => {
    const files = { 'main.cs': multiFileMain, 'ShapeFactory.cs': helperSource(1), 'scale.txt': '1' };
    const client = createTestRuntimeClient({ runtime, files });
    const render = async (next: typeof files): Promise<Uint8Array<ArrayBuffer>> => {
      const rendered = await client.render({ source: { files: next, entry: 'main.cs' } });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Native PicoGK render was unexpectedly superseded.');
      }
      assertSuccess(rendered.geometry);
      const glb = extractGltfFromResult(rendered.geometry);
      if (!glb) {
        throw new Error('Expected PicoGK GLB geometry.');
      }
      return glb;
    };
    try {
      const sizeX = async (sourceFiles: typeof files): Promise<number> => {
        const bounds = getBoundingBoxFromInspect(await getInspectReport(await render(sourceFiles)));
        if (!bounds) {
          throw new Error('Expected a PicoGK bounding box.');
        }
        return bounds.size[0];
      };
      const initial = await sizeX(files);
      const helperEdit = await sizeX({ ...files, 'ShapeFactory.cs': helperSource(2) });
      const assetEdit = await sizeX({ ...files, 'ShapeFactory.cs': helperSource(2), 'scale.txt': '1.5' });
      expect(helperEdit).toBeGreaterThan(initial * 1.8);
      expect(assetEdit).toBeGreaterThan(helperEdit * 1.4);

      const failed = await client.render({
        source: { files: { ...files, 'ShapeFactory.cs': 'public static class {' }, entry: 'main.cs' },
      });
      expect(failed.superseded).toBe(false);
      if (!failed.superseded) {
        expect(failed.geometry).toMatchObject({
          success: false,
          issues: expect.arrayContaining([
            expect.objectContaining({
              type: 'compilation',
              location: expect.objectContaining({ fileName: 'ShapeFactory.cs' }),
            }),
          ]),
        });
      }
      await expect(render(files)).resolves.toBeInstanceOf(Uint8Array);
    } finally {
      await client.shutdown();
    }
  }, 180_000);
});
/* oxlint-enable typescript/no-unsafe-assignment */
