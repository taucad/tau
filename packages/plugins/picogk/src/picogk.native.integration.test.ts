// @vitest-environment node
/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { validateTauCadTopology } from '@taucad/geometry-core';
import type { TauCadTopologyPayload } from '@taucad/geometry-core';
import { digestContent } from '@taucad/cache-core';
import { assimp } from '@taucad/assimp';
import { geometryCache } from '@taucad/middleware';
import {
  assertSuccess,
  createTestRuntimeClient,
  extractGltfFromResult,
  getBoundingBoxFromInspect,
  getGeometryStatsFromInspect,
  getInspectReport,
  validateGlbData,
} from '@taucad/runtime-testing';
import { createNodeClient } from '@taucad/runtime/node';
import type { ProgressiveSceneUpdate, WorkerState } from '@taucad/runtime/types';
import { defineRuntime } from '@taucad/runtime/worker';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { picogk } from '#index.js';
import { picogkArtifactToGlb } from '#picogk-mesh.js';
import { picogkBuildSchema } from '#picogk.protocol.js';
import { PicogkSession } from '#picogk-session.js';

type ResourceManifest = {
  readonly target: string;
  readonly workerPath: string;
  readonly workerSha256: string;
  readonly resourceFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string; readonly label: string }>;
};

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

const sphereSource = (radius = 15): string => `using System.Numerics;
using PicoGK;
Library.Go(1f, () =>
{
    Library.oViewer().SetGroupMaterial(0, "4f7dd9", 0.2f, 0.7f);
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, ${String(radius)}f));
});
`;

const parameterizedSphereSource = `using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;

Library.Go(Params.VoxelSizeMm, () =>
{
    Library.oViewer().SetGroupMaterial(0, Params.Color, 0.2f, 0.7f);
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, Params.RadiusMm));
});

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Description = "OpenVDB voxel size in millimetres", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 1f;

    [Range(1.0, 100.0)]
    [Display(Name = "Radius", Description = "Sphere radius in millimetres", Order = 1)]
    public static float RadiusMm { get; set; } = 15f;

    [Display(Name = "Color", Order = 2)]
    public static string Color { get; set; } = "4f7dd9";
}
`;
const voxelSizeParameter = 'VoxelSizeMm';
const radiusParameter = 'RadiusMm';
const colorParameter = 'Color';

const multiFileMain = `using PicoGK;
Library.Go(1f, () =>
{
    Library.oViewer().SetGroupMaterial(0, "25a18e", 0.2f, 0.7f);
    Library.oViewer().Add(ShapeFactory.Create(10f));
});
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

const helixHeatExchangerFixtureRoot = resolve(import.meta.dirname, '../dotnet/fixtures/helix-heat-exchanger');
const readCsharpFiles = (root: string): Record<string, string> => {
  const files: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.name.endsWith('.cs')) {
        files[relative(root, path)] = readFileSync(path, 'utf8');
      }
    }
  };
  visit(root);
  return files;
};
const helixHeatExchangerFiles = (): Record<string, string> => readCsharpFiles(helixHeatExchangerFixtureRoot);
const shapeKernelFiles = (): Record<string, string> =>
  readCsharpFiles(resolve(helixHeatExchangerFixtureRoot, 'ShapeKernel'));
const roverFiles = (): Record<string, string> => ({
  ...shapeKernelFiles(),
  ...readCsharpFiles(resolve(import.meta.dirname, '../dotnet/fixtures/rover-wheel')),
});

const comparableTimeline = (
  updates: readonly ProgressiveSceneUpdate[],
): ReadonlyArray<{
  readonly kind: ProgressiveSceneUpdate['type'];
  readonly label?: string;
  readonly sceneDigest: string;
}> =>
  updates.map((update) =>
    update.type === 'bookmark'
      ? {
          kind: update.type,
          ...(update.bookmark.label ? { label: update.bookmark.label } : {}),
          sceneDigest: update.bookmark.sceneDigest,
        }
      : { kind: update.type, sceneDigest: update.sceneDigest },
  );

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
  it('rehydrates component materialization across worker generations with byte-exact final GLB parity', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tau-picogk-compute-native-'));
    const artifactLink = join(root, 'artifacts');
    mkdirSync(artifactLink);
    const artifacts = realpathSync(artifactLink);
    writeFileSync(join(root, 'main.cs'), sphereSource(8));
    const session = new PicogkSession({
      workerExecutable: resolve(targetRoot, manifest.workerPath),
      workerSha256: manifest.workerSha256,
      workspacePath: root,
      artifactPath: artifacts,
      trustFile,
      resourceFiles: manifest.resourceFiles.map(({ path, ...resource }) => ({
        ...resource,
        path: resolve(targetRoot, path),
      })),
      requestTimeout: 120_000,
      maxArtifactBytes: 512 * 1024 * 1024,
      logger: { log: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(), custom: vi.fn() },
    });
    const { signal } = new AbortController();
    try {
      const compute = { modelDigest: `sha256:${'1'.repeat(64)}`, prepared: [] };
      const cold = await session.request({
        method: 'build',
        params: { entryPath: 'main.cs', parameters: {}, streamScene: false, compute },
        schema: picogkBuildSchema,
        signal,
      });
      const publication = cold.computePublications?.[0];
      expect(publication).toBeDefined();
      const coldArtifact = await session.readArtifact(cold);
      const coldGlb = picogkArtifactToGlb(coldArtifact, cold);
      const cachedBytes = await session.readArtifact(publication!);
      const prepared = await session.prehydrateCompute([
        {
          identity: {
            cacheKey: publication!.cacheKey,
            kind: publication!.kind,
            positionCount: publication!.positionCount,
            indexCount: publication!.indexCount,
          },
          bytes: cachedBytes,
          contentDigest: await digestContent({ bytes: cachedBytes }),
        },
      ]);
      await session.recycle();
      const warm = await session.request({
        method: 'build',
        params: { entryPath: 'main.cs', parameters: {}, streamScene: false, compute: { ...compute, prepared } },
        schema: picogkBuildSchema,
        signal,
      });
      expect(warm.computePublications).toEqual([]);
      expect(warm.timings.meshConstruction).toBe(0);
      expect(warm.timings.meshExtraction).toBe(0);
      const warmArtifact = await session.readArtifact(warm);
      expect(picogkArtifactToGlb(warmArtifact, warm)).toEqual(coldGlb);
    } finally {
      await session.cleanup();
      rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);

  it.each([
    ['native compute cache', runtime],
    ['whole-build cache', defineRuntime({ ...runtime, middleware: [geometryCache()] })],
  ])(
    'preserves warm and cold progressive timeline semantics with %s',
    async (_cache, runtime) => {
      const source = `using System.IO;
using System.Numerics;
using PicoGK;
Library.Go(1f, () =>
{
    var viewer = Library.oViewer();
    viewer.SetBackgroundColor(new ColorFloat(0.1f, 0.2f, 0.3f, 1f));
    viewer.SetFov(float.Pi / 3f);
    var mesh = Utils.mshCreateCube(new Vector3(2, 4, 6));
    viewer.Add(mesh, 1);
    viewer.RequestScreenShot(Path.Combine(Library.strLogFolder, "added.tga"));
    viewer.SetObjectMatrix(mesh, Matrix4x4.CreateTranslation(7, 0, 0));
    viewer.RequestScreenShot(Path.Combine(Library.strLogFolder, "moved.tga"));
});
`;
      const client = createTestRuntimeClient({ runtime });
      const timelines = new Map<string, ProgressiveSceneUpdate[]>();
      const stopScene = client.on('sceneUpdate', (update) => {
        const timeline = timelines.get(update.renderId) ?? [];
        timeline.push(update);
        timelines.set(update.renderId, timeline);
      });
      try {
        const render = async (content = source): Promise<void> => {
          const result = await client.render({
            source: { files: { 'main.cs': content } },
            renderOptions: {
              capture: { mode: 'operation', minimumIntervalMilliseconds: 0, maximumPendingCommands: 16 },
            },
          });
          expect(result.superseded).toBe(false);
          if (!result.superseded) {
            assertSuccess(result.geometry);
          }
        };
        await render();
        await render(sphereSource(5));
        await render();

        const [cold, changed, warm] = [...timelines.values()];
        expect(changed).toBeDefined();
        if (!cold || !warm) {
          throw new Error('Expected both cold and warm PicoGK scene timelines.');
        }
        const coldSemantic = comparableTimeline(cold);
        const warmSemantic = comparableTimeline(warm);
        expect(warmSemantic).toEqual(coldSemantic);
        expect(coldSemantic.map(({ kind }) => kind)).toEqual([
          'reset',
          'delta',
          'delta',
          'bookmark',
          'delta',
          'bookmark',
        ]);
        expect(coldSemantic.filter(({ kind }) => kind === 'bookmark').map(({ label }) => label)).toEqual([
          'added.tga',
          'moved.tga',
        ]);
        const presented = cold
          .filter(
            (update): update is Extract<ProgressiveSceneUpdate, { readonly type: 'delta' }> => update.type === 'delta',
          )
          .flatMap(({ operations }) => operations)
          .find(
            (operation) =>
              operation.type === 'set-presentation' && operation.presentation.fieldOfViewDegrees !== undefined,
          );
        expect(presented?.type === 'set-presentation' ? presented.presentation : undefined).toEqual({
          background: [0.1, 0.2, 0.3, 1],
          fieldOfViewDegrees: expect.closeTo(60),
        });
      } finally {
        stopScene();
        await client.shutdown();
      }
    },
    180_000,
  );

  it('publishes one reset then changed-component deltas before one byte-exact terminal result', async () => {
    const source = `using System.Numerics;
using System.Threading;
using PicoGK;
Library.Go(1f, () =>
{
    var mesh = Utils.mshCreateCube(new Vector3(4, 4, 4));
    Library.oViewer().Add(mesh, 1);
    Thread.Sleep(500);
    Library.oViewer().SetObjectMatrix(mesh, Matrix4x4.CreateTranslation(10, 0, 0));
});
`;
    const client = createTestRuntimeClient({ runtime, files: { 'main.cs': source } });
    const updates: ProgressiveSceneUpdate[] = [];
    const firstReset = Promise.withResolvers<void>();
    let terminalSettled = false;
    const stopScene = client.on('sceneUpdate', (update) => {
      updates.push(update);
      if (update.type === 'reset') {
        firstReset.resolve();
      }
    });
    const geometryEvents: unknown[] = [];
    const stopGeometry = client.on('geometry', (geometry) => {
      terminalSettled = true;
      geometryEvents.push(geometry);
    });
    try {
      const rendering = client.render({
        source: { path: 'main.cs' },
        renderOptions: {
          capture: { mode: 'operation', minimumIntervalMilliseconds: 0, maximumPendingCommands: 2 },
        },
      });
      await firstReset.promise;
      expect(terminalSettled).toBe(false);

      const rendered = await rendering;
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Progressive PicoGK render was unexpectedly superseded.');
      }
      assertSuccess(rendered.geometry);
      const finalGlb = extractGltfFromResult(rendered.geometry);
      if (!finalGlb) {
        throw new Error('Expected a final PicoGK GLB.');
      }
      expect(updates.map(({ type }) => type)).toEqual(['reset', 'delta']);
      const delta = updates[1];
      expect(delta?.type).toBe('delta');
      if (delta?.type !== 'delta') {
        throw new Error('Expected a PicoGK changed-component delta.');
      }
      expect(delta.operations).toEqual([
        expect.objectContaining({ type: 'upsert-node', node: expect.objectContaining({ id: 'component:picogk-1' }) }),
      ]);
      const changedGeometry = delta.assets[0]?.geometry;
      expect(changedGeometry?.format).toBe('gltf');
      if (changedGeometry?.format !== 'gltf') {
        throw new Error('Expected the changed PicoGK component GLB.');
      }
      expect(changedGeometry.content).toEqual(finalGlb);
      expect(geometryEvents).toHaveLength(1);
    } finally {
      stopScene();
      stopGeometry();
      await client.shutdown();
    }
  }, 180_000);

  it('transfers an unchanged component once and removes it without retransmitting its asset', async () => {
    const source = `using System.IO;
using System.Numerics;
using PicoGK;
Library.Go(1f, () =>
{
    var viewer = Library.oViewer();
    var retained = Utils.mshCreateCube(new Vector3(2, 3, 4));
    var changing = Utils.mshCreateCube(new Vector3(5, 6, 7));
    viewer.Add(retained, 1);
    viewer.RequestScreenShot(Path.Combine(Library.strLogFolder, "retained.tga"));
    viewer.Add(changing, 2);
    viewer.RequestScreenShot(Path.Combine(Library.strLogFolder, "added.tga"));
    viewer.SetObjectMatrix(changing, Matrix4x4.CreateTranslation(9, 0, 0));
    viewer.RequestScreenShot(Path.Combine(Library.strLogFolder, "moved.tga"));
    viewer.RequestScreenShot(Path.Combine(Library.strLogFolder, "unchanged.tga"));
    viewer.Remove(retained);
    viewer.RequestScreenShot(Path.Combine(Library.strLogFolder, "removed.tga"));
});
`;
    const client = createTestRuntimeClient({ runtime, files: { 'main.cs': source } });
    const updates: ProgressiveSceneUpdate[] = [];
    const stopScene = client.on('sceneUpdate', (update) => updates.push(update));
    try {
      const rendered = await client.render({
        source: { path: 'main.cs' },
        renderOptions: {
          capture: { mode: 'explicit', minimumIntervalMilliseconds: 0, maximumPendingCommands: 16 },
        },
      });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Transfer-once PicoGK render was unexpectedly superseded.');
      }
      assertSuccess(rendered.geometry);
      const finalGlb = extractGltfFromResult(rendered.geometry);
      if (!finalGlb) {
        throw new Error('Expected a final PicoGK GLB.');
      }

      expect(updates.map(({ type }) => type)).toEqual([
        'reset',
        'bookmark',
        'delta',
        'bookmark',
        'delta',
        'bookmark',
        'bookmark',
        'delta',
        'bookmark',
      ]);
      const reset = updates[0];
      if (reset?.type !== 'reset') {
        throw new Error('Expected an initial PicoGK reset.');
      }
      const retainedDigest = reset.snapshot.manifest.nodes['component:picogk-1']?.geometry?.contentDigest;
      expect(retainedDigest).toBeDefined();
      const deltas = updates.filter(
        (update): update is Extract<ProgressiveSceneUpdate, { readonly type: 'delta' }> => update.type === 'delta',
      );
      expect(deltas).toHaveLength(3);
      expect(deltas[0]?.operations).toEqual([
        expect.objectContaining({ type: 'upsert-node', node: expect.objectContaining({ id: 'component:picogk-2' }) }),
      ]);
      expect(deltas[1]?.operations).toEqual([
        expect.objectContaining({ type: 'upsert-node', node: expect.objectContaining({ id: 'component:picogk-2' }) }),
      ]);
      expect(deltas[2]?.operations).toEqual([{ type: 'remove-node', nodeId: 'component:picogk-1' }]);
      expect(deltas.flatMap(({ assets }) => assets).some(({ contentDigest }) => contentDigest === retainedDigest)).toBe(
        false,
      );
      const movedGeometry = deltas[1]?.assets[0]?.geometry;
      expect(movedGeometry?.format).toBe('gltf');
      if (movedGeometry?.format !== 'gltf') {
        throw new Error('Expected the moved PicoGK component GLB.');
      }
      expect(movedGeometry.content).toEqual(finalGlb);
      const unchangedBookmark = updates[6];
      expect(unchangedBookmark?.type).toBe('bookmark');
      if (unchangedBookmark?.type === 'bookmark') {
        expect(unchangedBookmark.bookmark.label).toBe('unchanged.tga');
        expect(unchangedBookmark.bookmark.sceneDigest).toBe(
          updates[5]?.type === 'bookmark' ? updates[5].bookmark.sceneDigest : '',
        );
      }
    } finally {
      stopScene();
      await client.shutdown();
    }
  }, 180_000);

  it('resolves opt-in C# metadata and applies selected parameters to native geometry', async () => {
    const client = createTestRuntimeClient({ runtime, files: { 'main.cs': parameterizedSphereSource } });
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
      const initial = await client.render({ source: { path: 'main.cs' } });
      expect(initial.superseded).toBe(false);
      if (initial.superseded) {
        throw new Error('Initial PicoGK render was unexpectedly superseded.');
      }
      expect(await parameters).toEqual({
        defaults: { [voxelSizeParameter]: 1, [radiusParameter]: 15, [colorParameter]: '4f7dd9' },
        schema: {
          type: 'object',
          properties: {
            [voxelSizeParameter]: {
              type: 'number',
              default: 1,
              minimum: 0.05,
              maximum: 5,
              title: 'Voxel size',
              description: 'OpenVDB voxel size in millimetres',
            },
            [radiusParameter]: {
              type: 'number',
              default: 15,
              minimum: 1,
              maximum: 100,
              title: 'Radius',
              description: 'Sphere radius in millimetres',
            },
            [colorParameter]: { type: 'string', default: '4f7dd9', title: 'Color' },
          },
          additionalProperties: false,
        },
      });
      const rendered = await client.updateParameters({
        [voxelSizeParameter]: 0.5,
        [radiusParameter]: 24,
        [colorParameter]: 'ff0000',
      });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Parameterized PicoGK render was unexpectedly superseded.');
      }
      assertSuccess(rendered.geometry);
      const glb = extractGltfFromResult(rendered.geometry);
      if (!glb) {
        throw new Error('Expected parameterized PicoGK GLB geometry.');
      }
      const bounds = getBoundingBoxFromInspect(await getInspectReport(glb));
      expect(bounds?.size).toEqual([expect.closeTo(0.048, 2), expect.closeTo(0.048, 2), expect.closeTo(0.048, 2)]);
    } finally {
      await client.shutdown();
    }
  }, 180_000);

  it('JIT-renders a standard PicoGK console program and exports retained GLB without system dotnet', async () => {
    const previousPath = process.env['PATH'];
    process.env['PATH'] = '';
    const client = createTestRuntimeClient({ runtime, files: { 'main.cs': sphereSource() } });
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
      const rendered = await client.render({ source: { path: 'main.cs' } });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Native PicoGK render was unexpectedly superseded.');
      }
      const analyzed = await parameters;
      expect(analyzed.defaults).toEqual({});
      expect(analyzed.schema).toEqual({ type: 'object', properties: {}, additionalProperties: false });
      assertSuccess(rendered.geometry);
      const glb = extractGltfFromResult(rendered.geometry);
      if (!glb) {
        throw new Error('Expected PicoGK GLB geometry.');
      }
      validateGlbData(glb);
      const { json, payload } = readTopology(glb);
      expect(payload.components).toEqual([
        expect.objectContaining({
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

  it('publishes one render cycle for one watched C# edit and its derived thumbnail refresh', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'tau-picogk-watch-'));
    writeFileSync(join(projectRoot, 'main.cs'), multiFileMain, 'utf8');
    writeFileSync(join(projectRoot, 'ShapeFactory.cs'), helperSource(1), 'utf8');
    writeFileSync(join(projectRoot, 'scale.txt'), '1', 'utf8');
    writeFileSync(join(projectRoot, 'thumbnail.webp'), new Uint8Array([1]));
    const client = await createNodeClient({ runtime, projectPath: projectRoot });
    const states: WorkerState[] = [];
    const geometries: unknown[] = [];
    const stopState = client.on('state', (state) => states.push(state));
    const stopGeometry = client.on('geometry', (geometry) => geometries.push(geometry));
    try {
      const initial = await client.render({ source: { path: 'main.cs' } });
      expect(initial.superseded).toBe(false);
      states.length = 0;
      geometries.length = 0;

      writeFileSync(join(projectRoot, 'scale.txt'), '2', 'utf8');
      await vi.waitFor(
        () => {
          expect(geometries).toHaveLength(1);
          expect(states.at(-1)).toBe('idle');
        },
        { timeout: 120_000, interval: 50 },
      );
      writeFileSync(join(projectRoot, 'thumbnail.webp'), new Uint8Array([2]));
      await new Promise((resolve) => {
        setTimeout(resolve, 3000);
      });

      expect(states.filter((state) => state === 'buffering')).toEqual(['buffering']);
      expect(states.filter((state) => state === 'rendering')).toEqual(['rendering']);
      expect(geometries).toHaveLength(1);
    } finally {
      stopState();
      stopGeometry();
      await client.shutdown({ drain: true });
      client.terminate();
      rmSync(projectRoot, { recursive: true, force: true });
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

  it('runs the pinned ShapeKernel HeatX program and captures only its final viewer scene', async () => {
    const client = createTestRuntimeClient({ runtime, files: helixHeatExchangerFiles() });
    try {
      const rendered = await client.render({ source: { path: 'Program.cs' } });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Native HeatX render was unexpectedly superseded.');
      }
      assertSuccess(rendered.geometry);
      const glb = extractGltfFromResult(rendered.geometry);
      if (!glb) {
        throw new Error('Expected HeatX GLB geometry.');
      }
      validateGlbData(glb);
      const report = await getInspectReport(glb);
      const bounds = getBoundingBoxFromInspect(report);
      expect(bounds).toBeDefined();
      expect(bounds?.size.every((size) => size > 0.05)).toBe(true);
      expect(getGeometryStatsFromInspect(report).meshCount).toBe(1);
      expect(readTopology(glb).payload.components).toHaveLength(1);
    } finally {
      await client.shutdown();
    }
  }, 180_000);

  it('captures ShapeKernel wireframes and a second unchanged ShapeKernel application', async () => {
    const wireframeClient = createTestRuntimeClient({
      runtime,
      files: {
        ...shapeKernelFiles(),
        'Program.cs': `using Leap71.ShapeKernel;
using PicoGK;
Library.Go(1f, () => Sh.PreviewBoxWireframe(new BaseBox(new LocalFrame(), 10f, 20f, 30f), Cp.clrBlack));
`,
      },
    });
    try {
      const rendered = await wireframeClient.render({ source: { path: 'Program.cs' } });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('ShapeKernel wireframe render was unexpectedly superseded.');
      }
      assertSuccess(rendered.geometry);
      const glb = extractGltfFromResult(rendered.geometry);
      if (!glb) {
        throw new Error('Expected ShapeKernel wireframe GLB geometry.');
      }
      validateGlbData(glb);
      const lineModes = readTopology(glb)
        .json.meshes.flatMap(({ primitives }) => primitives)
        .map(({ mode }) => mode);
      expect(lineModes).toHaveLength(6);
      expect(lineModes.every((mode) => mode === 1)).toBe(true);
    } finally {
      await wireframeClient.shutdown();
    }

    const roverClient = createTestRuntimeClient({ runtime, files: roverFiles() });
    try {
      const rendered = await roverClient.render({ source: { path: 'Program.cs' } });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('RoverWheel render was unexpectedly superseded.');
      }
      assertSuccess(rendered.geometry);
      const glb = extractGltfFromResult(rendered.geometry);
      if (!glb) {
        throw new Error('Expected RoverWheel GLB geometry.');
      }
      validateGlbData(glb);
      const report = await getInspectReport(glb);
      expect(getGeometryStatsFromInspect(report).meshCount).toBe(1);
      expect(getBoundingBoxFromInspect(report)?.size.every((size) => size > 0.05)).toBe(true);
    } finally {
      await roverClient.shutdown();
    }
  }, 240_000);
});
/* oxlint-enable typescript/no-unsafe-assignment */
