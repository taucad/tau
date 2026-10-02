// @vitest-environment node
/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { validateTauCadTopology } from '@taucad/geometry-core';
import type { TauCadTopologyPayload } from '@taucad/geometry-core';
import { assimp } from '@taucad/assimp';
import {
  createTestRuntimeClient,
  extractGltfFromResult,
  getBoundingBoxFromInspect,
  getGeometryStatsFromInspect,
  getInspectReport,
  validateGlbData,
} from '@taucad/runtime-testing';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';
import { describe, expect, it, vi } from 'vitest';

import { picogk } from '#index.js';

type ResourceManifest = {
  readonly target: string;
  readonly workerPath: string;
  readonly workerSha256: string;
  readonly resourceFiles: ReadonlyArray<{
    readonly path: string;
    readonly sha256: string;
    readonly label: string;
  }>;
};

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const targetRoot = resolve(workspaceRoot, `apps/desktop/resources/picogk/${process.platform}-${process.arch}`);
const manifest = JSON.parse(readFileSync(resolve(targetRoot, 'tau-runtime-manifest.json'), 'utf8')) as ResourceManifest;

const runtime = defineRuntime({
  plugins: [
    assimp({ preset: 'all', transcoders: { export: { backend: 'native' } } }),
    picogk({
      kernels: {
        default: {
          workerExecutable: resolve(targetRoot, manifest.workerPath),
          workerSha256: manifest.workerSha256,
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

/* Independent programs in one project, the way a person or an agent writes a second model: each
 * entry declares its own `Params` and `ModelPart` (identically named) and both build on one shared
 * helper. The first set uses top-level statements, the second classic `static Main` methods. */
type ProgramFixture = {
  readonly name: string;
  readonly files: (helperScale?: number) => Record<string, string>;
  readonly entries: ReadonlyArray<{ readonly path: string; readonly defaultSizeMm: number }>;
  readonly helper: string;
};
const sharedBox = (scale: number): string => `using System.Numerics;
using PicoGK;
public static partial class Model
{
    public static Mesh Box(float size) => Utils.mshCreateCube(new Vector3(size * ${String(scale)}f, 4f, 4f));
}
`;
const programFixtures: readonly ProgramFixture[] = [
  {
    name: 'top-level statements',
    helper: 'Shared.cs',
    entries: [
      { path: 'main.cs', defaultSizeMm: 10 },
      { path: 'regions/other.cs', defaultSizeMm: 20 },
    ],
    files: (helperScale = 1) => ({
      'main.cs': `using PicoGK;
Library.Go(Params.VoxelSizeMm, () => Library.oViewer().Add(Model.Box(Params.Part == ModelPart.Base ? Params.SizeMm : 1f)));
public enum ModelPart { Base, Lid }
public static class Params
{
    public static float VoxelSizeMm { get; set; } = 1f;
    public static float SizeMm { get; set; } = 10f;
    public static ModelPart Part { get; set; } = ModelPart.Base;
}
`,
      'regions/other.cs': `using PicoGK;
Library.Go(Params.VoxelSizeMm, () => Library.oViewer().Add(Model.Box(Params.Part == ModelPart.Relief ? Params.SizeMm : 2f)));
public enum ModelPart { Relief, Frame, Label }
public static class Params
{
    public static float VoxelSizeMm { get; set; } = 1f;
    public static float SizeMm { get; set; } = 20f;
    public static ModelPart Part { get; set; } = ModelPart.Relief;
}
`,
      'Shared.cs': sharedBox(helperScale),
    }),
  },
  {
    name: 'static Main methods',
    helper: 'ModelParts.cs',
    entries: [
      { path: 'a.cs', defaultSizeMm: 6 },
      { path: 'b.cs', defaultSizeMm: 8 },
    ],
    files: (helperScale = 1) => ({
      'a.cs': `using PicoGK;
public static partial class Model
{
    public static void Main() => Library.Go(1f, () => Library.oViewer().Add(Box(Params.SizeMm)));
}
public enum ModelPart { Base }
public static class Params { public static float SizeMm { get; set; } = 6f; }
`,
      'b.cs': `using PicoGK;
internal static class Program
{
    private static async Task<int> Main(string[] args)
    {
        await Task.Yield();
        Library.Go(1f, () => Library.oViewer().Add(Model.Box(Params.SizeMm)));
        return 0;
    }
}
public enum ModelPart { Relief }
public static class Params { public static float SizeMm { get; set; } = 8f; }
`,
      'ModelParts.cs': sharedBox(helperScale),
    }),
  },
];

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

type GltfJson = {
  readonly nodes: ReadonlyArray<{ readonly mesh?: number }>;
  readonly meshes: ReadonlyArray<{
    readonly primitives: ReadonlyArray<{
      readonly mode?: number;
      readonly indices?: number;
    }>;
  }>;
  readonly accessors: ReadonlyArray<{ readonly count: number }>;
  readonly bufferViews: ReadonlyArray<{
    readonly byteOffset?: number;
    readonly byteLength: number;
  }>;
  readonly extensions: {
    readonly TAU_cad_topology: { readonly topologyBufferView: number };
  };
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

describe('PicoGK native C# kernel', () => {
  it('resolves opt-in C# metadata and applies selected parameters to native geometry', async () => {
    const client = createTestRuntimeClient({
      runtime,
      files: { 'main.cs': parameterizedSphereSource },
    });
    try {
      const description = await client.describe({ source: { path: 'main.cs' } });
      assert.ok(description.success);
      const manifest = description.parameters;
      const document = client.open({ source: { path: 'main.cs' } });
      const initial = await document.view('model').rendering();
      expect(initial.superseded).toBe(false);
      if (initial.superseded) {
        throw new Error('Initial PicoGK render was unexpectedly superseded.');
      }
      assert.ok(initial.rendering.success);
      expect(manifest.defaults).toEqual({
        [voxelSizeParameter]: 1,
        [radiusParameter]: 15,
        [colorParameter]: '4f7dd9',
      });
      expect(manifest.legacyProjection).toMatchObject({
        status: 'usable',
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
            [colorParameter]: {
              type: 'string',
              default: '4f7dd9',
              title: 'Color',
            },
          },
          additionalProperties: false,
        },
      });
      const updated = await document.update({
        parameters: {
          [voxelSizeParameter]: 0.5,
          [radiusParameter]: 24,
          [colorParameter]: 'ff0000',
        },
      });
      expect(updated.superseded).toBe(false);
      if (updated.superseded) {
        throw new Error('Parameterized PicoGK update was unexpectedly superseded.');
      }
      const rendered = await document.view('model').rendering();
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Parameterized PicoGK render was unexpectedly superseded.');
      }
      const { rendering } = rendered;
      assert.ok(rendering.success);
      const glb = extractGltfFromResult(rendering);
      if (!glb) {
        throw new Error('Expected parameterized PicoGK GLB geometry.');
      }
      const bounds = getBoundingBoxFromInspect(await getInspectReport(glb));
      expect(bounds?.size).toEqual([expect.closeTo(0.048, 2), expect.closeTo(0.048, 2), expect.closeTo(0.048, 2)]);
      document.close();
    } finally {
      await client.shutdown();
    }
  }, 180_000);

  it('JIT-renders a standard PicoGK console program and exports retained GLB without system dotnet', async () => {
    const previousPath = process.env['PATH'];
    // Only the system directories the sandbox wrapper resolves `which` from: no user or tool PATH.
    process.env['PATH'] = '/usr/bin:/bin';
    const client = createTestRuntimeClient({
      runtime,
      files: { 'main.cs': sphereSource() },
    });
    try {
      const description = await client.describe({ source: { path: 'main.cs' } });
      assert.ok(description.success);
      const analyzed = description.parameters;
      const document = client.open({ source: { path: 'main.cs' } });
      const rendered = await document.view('model').rendering();
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Native PicoGK render was unexpectedly superseded.');
      }
      expect(analyzed.defaults).toEqual({});
      expect(analyzed.legacyProjection).toMatchObject({
        status: 'usable',
        schema: { type: 'object', additionalProperties: false },
      });
      const { rendering } = rendered;
      assert.ok(rendering.success);
      const glb = extractGltfFromResult(rendering);
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

      const exported = await document.export('glb');
      assert.ok(exported.success);
      expect(exported.files).toHaveLength(1);
      expect(exported.files[0].name).toBe('model.glb');
      validateGlbData(exported.files[0].bytes);

      const stl = await document.export('stl');
      assert.ok(stl.success);
      expect(stl.files).toHaveLength(1);
      const roundTrip = createTestRuntimeClient({
        runtime,
        files: { 'roundtrip.stl': stl.files[0].bytes },
      });
      try {
        const importedDocument = roundTrip.open({ source: { path: 'roundtrip.stl' } });
        const imported = await importedDocument.view('model').rendering();
        expect(imported.superseded).toBe(false);
        if (imported.superseded) {
          throw new Error('PicoGK STL round trip was unexpectedly superseded.');
        }
        assert.ok(imported.rendering.success);
        const roundTripGlb = extractGltfFromResult(imported.rendering);
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
        importedDocument.close();
      } finally {
        await roundTrip.shutdown();
      }
      document.close();
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
    const client = await createNodeClient({
      runtime,
      projectPath: projectRoot,
    });
    const document = client.open({ source: { path: 'main.cs' }, watch: true });
    const view = document.view('model');
    const evaluations: unknown[] = [];
    const renderings: unknown[] = [];
    const statuses: string[] = [];
    const stopEvaluation = document.on('evaluated', (evaluation) => evaluations.push(evaluation));
    const stopRendering = view.on('rendered', (rendering) => renderings.push(rendering));
    const stopStatus = document.on('status', (status) => statuses.push(status));
    try {
      const initial = await view.rendering();
      expect(initial.superseded).toBe(false);
      evaluations.length = 0;
      renderings.length = 0;
      statuses.length = 0;

      writeFileSync(join(projectRoot, 'scale.txt'), '2', 'utf8');
      await vi.waitFor(
        () => {
          expect(evaluations).toHaveLength(1);
          expect(renderings).toHaveLength(1);
          expect(statuses.at(-1)).toBe('ready');
        },
        { timeout: 120_000, interval: 50 },
      );
      writeFileSync(join(projectRoot, 'thumbnail.webp'), new Uint8Array([2]));
      await new Promise((resolve) => {
        setTimeout(resolve, 3000);
      });

      expect(evaluations).toHaveLength(1);
      expect(renderings).toHaveLength(1);
    } finally {
      stopEvaluation();
      stopRendering();
      stopStatus();
      view.close();
      document.close();
      await client.shutdown();
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 180_000);

  it('rerenders secondary C# and project-asset edits and recovers after a Roslyn error', async () => {
    const files = {
      'main.cs': multiFileMain,
      'ShapeFactory.cs': helperSource(1),
      'scale.txt': '1',
    };
    const client = createTestRuntimeClient({ runtime, files });
    const render = async (next: typeof files): Promise<Uint8Array<ArrayBuffer>> => {
      const document = client.open({ source: { files: next, entry: 'main.cs' } });
      try {
        const rendered = await document.view('model').rendering();
        expect(rendered.superseded).toBe(false);
        if (rendered.superseded) {
          throw new Error('Native PicoGK render was unexpectedly superseded.');
        }
        assert.ok(rendered.rendering.success);
        const glb = extractGltfFromResult(rendered.rendering);
        if (!glb) {
          throw new Error('Expected PicoGK GLB geometry.');
        }
        return glb;
      } finally {
        document.close();
      }
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
      const helperEdit = await sizeX({
        ...files,
        'ShapeFactory.cs': helperSource(2),
      });
      const assetEdit = await sizeX({
        ...files,
        'ShapeFactory.cs': helperSource(2),
        'scale.txt': '1.5',
      });
      expect(helperEdit).toBeGreaterThan(initial * 1.8);
      expect(assetEdit).toBeGreaterThan(helperEdit * 1.4);

      const failedDocument = client.open({
        source: {
          files: { ...files, 'ShapeFactory.cs': 'public static class {' },
          entry: 'main.cs',
        },
      });
      const failed = await failedDocument.view('model').rendering();
      expect(failed.superseded).toBe(false);
      if (!failed.superseded) {
        expect(failed.rendering).toMatchObject({
          success: false,
          issues: expect.arrayContaining([
            expect.objectContaining({
              type: 'compilation',
              location: expect.objectContaining({
                fileName: 'ShapeFactory.cs',
              }),
            }),
          ]),
        });
      }
      failedDocument.close();
      await expect(render(files)).resolves.toBeInstanceOf(Uint8Array);
    } finally {
      await client.shutdown();
    }
  }, 180_000);

  it('runs the pinned ShapeKernel HeatX program and captures only its final viewer scene', async () => {
    const client = createTestRuntimeClient({
      runtime,
      files: helixHeatExchangerFiles(),
    });
    try {
      const document = client.open({ source: { path: 'Program.cs' } });
      const rendered = await document.view('model').rendering();
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Native HeatX render was unexpectedly superseded.');
      }
      assert.ok(rendered.rendering.success, JSON.stringify(rendered.rendering.issues));
      const glb = extractGltfFromResult(rendered.rendering);
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
      document.close();
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
      const document = wireframeClient.open({ source: { path: 'Program.cs' } });
      const rendered = await document.view('model').rendering();
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('ShapeKernel wireframe render was unexpectedly superseded.');
      }
      assert.ok(rendered.rendering.success);
      const glb = extractGltfFromResult(rendered.rendering);
      if (!glb) {
        throw new Error('Expected ShapeKernel wireframe GLB geometry.');
      }
      validateGlbData(glb);
      const lineModes = readTopology(glb)
        .json.meshes.flatMap(({ primitives }) => primitives)
        .map(({ mode }) => mode);
      expect(lineModes).toHaveLength(6);
      expect(lineModes.every((mode) => mode === 1)).toBe(true);
      document.close();
    } finally {
      await wireframeClient.shutdown();
    }

    const roverClient = createTestRuntimeClient({
      runtime,
      files: roverFiles(),
    });
    try {
      const document = roverClient.open({ source: { path: 'Program.cs' } });
      const rendered = await document.view('model').rendering();
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('RoverWheel render was unexpectedly superseded.');
      }
      assert.ok(rendered.rendering.success);
      const glb = extractGltfFromResult(rendered.rendering);
      if (!glb) {
        throw new Error('Expected RoverWheel GLB geometry.');
      }
      validateGlbData(glb);
      const report = await getInspectReport(glb);
      expect(getGeometryStatsFromInspect(report).meshCount).toBe(1);
      expect(getBoundingBoxFromInspect(report)?.size.every((size) => size > 0.05)).toBe(true);
      document.close();
    } finally {
      await roverClient.shutdown();
    }
  }, 240_000);

  describe.each(programFixtures)('independent C# programs in one project ($name)', ({ files, entries, helper }) => {
    const [first, second] = entries as readonly [ProgramFixture['entries'][number], ProgramFixture['entries'][number]];

    it('evaluates each entry alone, with its own parameters and exactly the sources it compiled', async () => {
      const client = createTestRuntimeClient({ runtime, files: files() });
      const open = (
        entry: string,
        options: { readonly parameters?: Record<string, unknown>; readonly files?: Record<string, string> } = {},
      ) =>
        client.open({
          source: { files: options.files ?? files(), entry },
          ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
        });
      const evaluate = async (...args: Parameters<typeof open>) => {
        const document = open(...args);
        try {
          return await document.evaluation();
        } finally {
          document.close();
        }
      };
      const widthMm = async (...args: Parameters<typeof open>): Promise<number> => {
        const document = open(...args);
        try {
          const outcome = await document.view('model').rendering();
          assert.ok(!outcome.superseded);
          assert.ok(outcome.rendering.success);
          const glb = extractGltfFromResult(outcome.rendering);
          if (!glb) {
            throw new Error('Expected PicoGK GLB geometry.');
          }
          const bounds = getBoundingBoxFromInspect(await getInspectReport(glb));
          if (!bounds) {
            throw new Error('Expected a PicoGK bounding box.');
          }
          return bounds.size[0] * 1000;
        } finally {
          document.close();
        }
      };
      try {
        // Switching back and forth keeps each model's geometry, and an override stays with its entry.
        await expect(widthMm(first.path)).resolves.toBeCloseTo(first.defaultSizeMm, 1);
        await expect(widthMm(second.path)).resolves.toBeCloseTo(second.defaultSizeMm, 1);
        // eslint-disable-next-line @typescript-eslint/naming-convention -- C# parameter names are PascalCase.
        await expect(widthMm(first.path, { parameters: { SizeMm: 5 } })).resolves.toBeCloseTo(5, 1);
        await expect(widthMm(second.path)).resolves.toBeCloseTo(second.defaultSizeMm, 1);
        await expect(widthMm(first.path)).resolves.toBeCloseTo(first.defaultSizeMm, 1);

        // Provenance names what was compiled: this program and the helper, never the other program.
        const evaluated = await evaluate(first.path);
        assert.ok(!evaluated.superseded);
        expect(Object.keys(evaluated.evaluation.sourceRevision?.files ?? {}).toSorted()).toEqual(
          [helper, first.path].toSorted(),
        );

        // The shared helper is a source of both programs, so an edit to it reaches both.
        await expect(widthMm(first.path, { files: files(2) })).resolves.toBeCloseTo(first.defaultSizeMm * 2, 1);
        await expect(widthMm(second.path, { files: files(2) })).resolves.toBeCloseTo(second.defaultSizeMm * 2, 1);

        // A syntax error in the other program leaves this one running, and is reported where it is.
        const broken = { ...files(), [second.path]: `${files()[second.path]!}\nLibrary.Go(1f, () => {` };
        await expect(widthMm(first.path, { files: broken })).resolves.toBeCloseTo(first.defaultSizeMm, 1);
        const brokenEvaluation = await evaluate(second.path, { files: broken });
        assert.ok(!brokenEvaluation.superseded);
        expect(brokenEvaluation.evaluation).toMatchObject({
          success: false,
          issues: expect.arrayContaining([
            expect.objectContaining({ location: expect.objectContaining({ fileName: second.path }) }),
          ]),
        });

        // A helper names no model of its own when two programs could claim it.
        const helperEvaluation = await evaluate(helper);
        assert.ok(!helperEvaluation.superseded);
        expect(helperEvaluation.evaluation).toMatchObject({
          success: false,
          issues: [expect.objectContaining({ details: expect.objectContaining({ workerCode: 'CS_TAU_ENTRY' }) })],
        });
      } finally {
        await client.shutdown();
      }
    }, 300_000);

    it('rerenders an entry for its helper but never for another program', async () => {
      const projectRoot = mkdtempSync(join(tmpdir(), 'tau-picogk-entries-'));
      const write = (path: string, content: string): void => {
        mkdirSync(dirname(join(projectRoot, path)), { recursive: true });
        writeFileSync(join(projectRoot, path), content, 'utf8');
      };
      for (const [path, content] of Object.entries(files())) {
        write(path, content);
      }
      const client = await createNodeClient({ runtime, projectPath: projectRoot });
      const document = client.open({ source: { path: first.path }, watch: true });
      const view = document.view('model');
      const renderings: unknown[] = [];
      const stopRendering = view.on('rendered', (rendering) => renderings.push(rendering));
      try {
        const initial = await view.rendering();
        expect(initial.superseded).toBe(false);
        renderings.length = 0;

        write(second.path, `${files()[second.path]!}\n// edited\n`);
        await new Promise((resolve) => {
          setTimeout(resolve, 3000);
        });
        expect(renderings).toHaveLength(0);

        write(helper, files(2)[helper]!);
        await vi.waitFor(
          () => {
            expect(renderings).toHaveLength(1);
          },
          { timeout: 120_000, interval: 50 },
        );
      } finally {
        stopRendering();
        view.close();
        document.close();
        await client.shutdown();
        rmSync(projectRoot, { recursive: true, force: true });
      }
    }, 300_000);
  });
});
/* oxlint-enable typescript/no-unsafe-assignment */
