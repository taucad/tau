// @vitest-environment node
/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */

/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers return any */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import type { FileExtension, GeometryResponse, GetParametersResult, HashedGeometryResult } from '@taucad/runtime/types';
import type { ExportResult } from '@taucad/runtime';
import { opencascadeKernel } from '#opencascade.kernel.js';
import { getModuleRegistry } from '@taucad/runtime/kernel';
import type { OpenCascadeInstance } from 'libcascade/init';
import {
  assertFailure,
  assertSuccess,
  createGeometryFile,
  createGeometryTestHelpers,
  createTestRuntimeClient,
  mapZupMillimetersToYupMeters,
  readCoordinateEvidence,
} from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';

// =============================================================================
// Test Utilities
// =============================================================================

const geometryHelpers = createGeometryTestHelpers();

type OpenCascadeSnapshotForTest = {
  kind: 'opencascade-native-handle';
  version: 1;
  format: 'brep-ascii';
  occtFormatVersion: 'TopTools_FormatVersion_CURRENT';
  entries: Array<{
    brep: Uint8Array<ArrayBuffer>;
    metadata: Record<string, unknown>;
  }>;
};

function expectOpenCascadeSnapshot(value: unknown): OpenCascadeSnapshotForTest {
  expect(value).toEqual(
    expect.objectContaining({
      kind: 'opencascade-native-handle',
      version: 1,
      format: 'brep-ascii',
      occtFormatVersion: 'TopTools_FormatVersion_CURRENT',
      entries: expect.any(Array),
    }),
  );

  const snapshot = value as OpenCascadeSnapshotForTest;
  expect(snapshot.entries.length).toBeGreaterThan(0);
  for (const entry of snapshot.entries) {
    expect(entry.brep).toBeInstanceOf(Uint8Array);
    expect(entry.brep.byteLength).toBeGreaterThan(0);
    expect(entry.metadata).toEqual(expect.any(Object));
  }
  return snapshot;
}

async function readGltfSize(glbBytes: Uint8Array<ArrayBuffer>): Promise<[number, number, number]> {
  const document = await new NodeIO().readBinary(glbBytes);
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) {
        continue;
      }
      const point: [number, number, number] = [0, 0, 0];
      for (let index = 0; index < position.getCount(); index++) {
        position.getElement(index, point);
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis]!, point[axis]!);
          max[axis] = Math.max(max[axis]!, point[axis]!);
        }
      }
    }
  }
  return [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
}

async function readGltfNodeMeshNames(
  glbBytes: Uint8Array<ArrayBuffer>,
): Promise<{ nodeNames: string[]; meshNames: string[] }> {
  const document = await new NodeIO().readBinary(glbBytes);
  return {
    nodeNames: document
      .getRoot()
      .listNodes()
      .map((node) => node.getName()),
    meshNames: document
      .getRoot()
      .listMeshes()
      .map((mesh) => mesh.getName()),
  };
}

async function readGltfMaterialNames(glbBytes: Uint8Array<ArrayBuffer>): Promise<string[]> {
  const document = await new NodeIO().readBinary(glbBytes);
  return document
    .getRoot()
    .listMaterials()
    .map((material) => material.getName());
}

function extractGltfBytes(result: { data: GeometryResponse }): Uint8Array<ArrayBuffer> {
  if (result.data.format !== 'gltf') {
    throw new Error(`Expected GLTF geometry, received ${result.data.format}`);
  }
  return result.data.content;
}

function assertStepRoundTripVolumeMm3(stepBytes: Uint8Array<ArrayBuffer>, expectedMm3: number): void {
  const oc = getModuleRegistry().get('libcascade') as unknown as OpenCascadeInstance | undefined;
  expect(oc, 'expected worker to have registered libcascade module').toBeDefined();
  const cascade = oc!;

  const importPath = `/tmp/roundtrip_${Date.now()}_${String(expectedMm3).replace('.', '_')}.step`;
  cascade.FS.writeFile(importPath, stepBytes);

  const reader = new cascade.STEPControl_Reader();
  const status = reader.ReadFile(importPath);
  expect(status).toBe(cascade.IFSelect_ReturnStatus.IFSelect_RetDone);

  const progress = new cascade.Message_ProgressRange();
  reader.TransferRoots(progress);
  const importedShape = reader.OneShape();
  expect(importedShape.IsNull()).toBe(false);

  const props = new cascade.GProp_GProps();
  cascade.BRepGProp.VolumeProperties(importedShape, props, true, false, false);
  expect(props.Mass()).toBeCloseTo(expectedMm3, 0);

  importedShape.delete();
  cascade.FS.unlink(importPath);
  props.delete();
  progress.delete();
  reader.delete();
}

afterEach(() => {
  vi.restoreAllMocks();
});

const runtime = defineRuntime({
  kernels: [opencascadeKernel({ wasm: 'full', ocTracing: 'off' })],
  bundlers: [esbuildBundler()],
});

type GeometryFile = ReturnType<typeof createGeometryFile>;

const sourcePath = (file: GeometryFile): string => (file.path === '' ? file.filename : `${file.path}/${file.filename}`);

// =============================================================================
// All tests share a single worker to avoid Embind type registry conflicts
// that occur when initializing multiple WASM instances in the same process.
// =============================================================================

describe('OpenCascade Kernel', { timeout: 30_000 }, () => {
  let client: ReturnType<typeof createTestRuntimeClient>;

  const renderGeometry = async ({
    file,
    parameters,
  }: {
    file: GeometryFile;
    parameters: Record<string, unknown>;
  }): Promise<HashedGeometryResult> => {
    const outcome = await client.render({ source: { path: sourcePath(file) }, parameters });
    expect(outcome.superseded).toBe(false);
    if (outcome.superseded) {
      throw new Error('OpenCascade test render was superseded');
    }
    return outcome.geometry;
  };

  const readParameters = async (file: GeometryFile): Promise<GetParametersResult> => {
    const result = Promise.withResolvers<GetParametersResult>();
    const unsubscribe = client.on('parametersResolved', result.resolve);
    try {
      await client.render({ source: { path: sourcePath(file) } });
      return await result.promise;
    } finally {
      unsubscribe();
    }
  };

  const exportLastRender = async (
    format: FileExtension,
    exportOptions?: Record<string, unknown>,
  ): Promise<ExportResult> => client.export(format, exportOptions === undefined ? undefined : { exportOptions });

  it('should expose libcascade as its only authored-code module coordinate', () => {
    const plugin = opencascadeKernel();

    expect(plugin.builtinModuleNames).toEqual(['libcascade']);
    expect(plugin.detectImport?.test("import init from 'libcascade';")).toBe(true);
    expect(plugin.detectImport?.test("import init from 'opencascade';")).toBe(false);
    expect(plugin.detectImport?.test("import init from 'opencascade.js';")).toBe(false);
  });

  beforeAll(async () => {
    client = createTestRuntimeClient({
      runtime,
      files: {
        'box-import.ts': `import oc, { BRepPrimAPI_MakeBox } from 'libcascade';\nexport default function main() { if (oc.BRepPrimAPI_MakeBox !== BRepPrimAPI_MakeBox) throw new Error('libcascade default and named exports diverged'); return new oc.BRepPrimAPI_MakeBox(10, 10, 10).Shape(); }`,
        'box-import-js.ts': `import { BRepPrimAPI_MakeBox } from 'libcascade';\nexport default function main() { return new BRepPrimAPI_MakeBox(10, 10, 10).Shape(); }`,
        'no-import.ts': `export default function main() { return { x: 1 }; }`,
        'model.scad': `cube([10, 10, 10]);`,
        'box-require.js': `const { BRepPrimAPI_MakeBox } = require('libcascade');\nmodule.exports = function main() { return new BRepPrimAPI_MakeBox(10, 10, 10).Shape(); }`,
        'params.ts': `
import { BRepPrimAPI_MakeBox } from 'libcascade';
export const defaultParams = { width: 10, height: 20, depth: 30 };
export default function main(params = defaultParams) {
  return new BRepPrimAPI_MakeBox(params.width, params.height, params.depth).Shape();
}`,
        'no-params.ts': `
import { BRepPrimAPI_MakeBox } from 'libcascade';
export default function main() {
  return new BRepPrimAPI_MakeBox(10, 20, 30).Shape();
}`,
        'box.ts': `
import { BRepPrimAPI_MakeBox } from 'libcascade';
export default function main() {
  const box = new BRepPrimAPI_MakeBox(10, 20, 30);
  return box.Shape();
}`,
        'coordinate.ts': `
import { BRepPrimAPI_MakeBox, gp_Pnt } from 'libcascade';
export default function main() {
  const origin = new gp_Pnt(7, 11, 13);
  const box = new BRepPrimAPI_MakeBox(origin, 10, 20, 30);
  const shape = box.Shape();
  origin.delete();
  box.delete();
  return [{ shape, name: 'Asymmetric Box', color: '#ff0000' }];
}`,
        'multi.ts': `
import { BRepPrimAPI_MakeBox } from 'libcascade';
export default function main() {
  const box1 = new BRepPrimAPI_MakeBox(10, 10, 10);
  const box2 = new BRepPrimAPI_MakeBox(20, 20, 20);
  return [box1.Shape(), box2.Shape()];
}`,
        'named.ts': `
import { BRepPrimAPI_MakeBox } from 'libcascade';
export default function main() {
  const box = new BRepPrimAPI_MakeBox(10, 10, 10);
  return [{ shape: box.Shape(), name: 'MyBox', color: '#ff0000' }];
}`,
        'named-pbr.ts': `
import { BRepPrimAPI_MakeBox } from 'libcascade';
export default function main() {
  const box = new BRepPrimAPI_MakeBox(10, 10, 10);
  return [{ shape: box.Shape(), name: 'PbrBox', color: '#ff0000', metalness: 0.2, roughness: 0.7, density: 1.25 }];
}`,
        'parameterized.ts': `
import { BRepPrimAPI_MakeBox } from 'libcascade';
export const defaultParams = { size: 10 };
export default function main(params = defaultParams) {
  return new BRepPrimAPI_MakeBox(params.size, params.size, params.size).Shape();
}`,
        'assembly.ts': `
import { BRepPrimAPI_MakeBox } from 'libcascade';
export default function main() {
  const box1 = new BRepPrimAPI_MakeBox(10, 10, 10);
  const box2 = new BRepPrimAPI_MakeBox(20, 20, 20);
  return [
    { shape: box1.Shape(), name: 'SmallBox' },
    { shape: box2.Shape(), name: 'LargeBox' },
  ];
}`,
        'fuse.ts': `
import { BRepPrimAPI_MakeBox, Message_ProgressRange, BRepAlgoAPI_Fuse } from 'libcascade';
export default function main() {
  const box1 = new BRepPrimAPI_MakeBox(10, 10, 10).Shape();
  const box2 = new BRepPrimAPI_MakeBox(10, 10, 10).Shape();
  const progress = new Message_ProgressRange();
  const fused = new BRepAlgoAPI_Fuse(box1, box2, progress);
  const result = fused.Shape();
  progress.delete();
  fused.delete();
  return result;
}`,
        'common.ts': `
import { BRepPrimAPI_MakeBox, Message_ProgressRange, BRepAlgoAPI_Common } from 'libcascade';
export default function main() {
  const box1 = new BRepPrimAPI_MakeBox(20, 20, 20).Shape();
  const box2 = new BRepPrimAPI_MakeBox(10, 10, 10).Shape();
  const progress = new Message_ProgressRange();
  const common = new BRepAlgoAPI_Common(box1, box2, progress);
  const result = common.Shape();
  progress.delete();
  common.delete();
  return result;
}`,
        'cut.ts': `
import { BRepPrimAPI_MakeBox, Message_ProgressRange, BRepAlgoAPI_Cut } from 'libcascade';
export default function main() {
  const box1 = new BRepPrimAPI_MakeBox(20, 20, 20).Shape();
  const box2 = new BRepPrimAPI_MakeBox(10, 10, 10).Shape();
  const progress = new Message_ProgressRange();
  const cut = new BRepAlgoAPI_Cut(box1, box2, progress);
  const result = cut.Shape();
  progress.delete();
  cut.delete();
  return result;
}`,
        'fillet.ts': `
import { BRepPrimAPI_MakeBox, BRepFilletAPI_MakeFillet, ChFi3d_FilletShape, TopExp_Explorer, TopAbs_ShapeEnum, TopoDS } from 'libcascade';
export default function main() {
  const box = new BRepPrimAPI_MakeBox(20, 20, 20).Shape();
  const fillet = new BRepFilletAPI_MakeFillet(box, ChFi3d_FilletShape.ChFi3d_Rational);
  const explorer = new TopExp_Explorer(box, TopAbs_ShapeEnum.TopAbs_EDGE, TopAbs_ShapeEnum.TopAbs_SHAPE);
  if (explorer.More()) {
    const edge = TopoDS.Edge(explorer.Current());
    fillet.Add(2, edge);
  }
  explorer.delete();
  const result = fillet.Shape();
  fillet.delete();
  return result;
}`,
        'transform.ts': `
import { BRepPrimAPI_MakeBox, gp_Trsf, gp_Vec, BRepBuilderAPI_Transform } from 'libcascade';
export default function main() {
  const box = new BRepPrimAPI_MakeBox(10, 10, 10).Shape();
  const trsf = new gp_Trsf();
  const vec = new gp_Vec(50, 50, 50);
  trsf.SetTranslation(vec);
  const transformed = new BRepBuilderAPI_Transform(box, trsf, true, false);
  const result = transformed.Shape();
  vec.delete();
  trsf.delete();
  transformed.delete();
  return result;
}`,
        'compound.ts': `
import { TopoDS_Builder, TopoDS_Compound, BRepPrimAPI_MakeBox } from 'libcascade';
export default function main() {
  const builder = new TopoDS_Builder();
  const compound = new TopoDS_Compound();
  builder.MakeCompound(compound);
  const box1 = new BRepPrimAPI_MakeBox(10, 10, 10).Shape();
  const box2 = new BRepPrimAPI_MakeBox(5, 5, 5).Shape();
  builder.Add(compound, box1);
  builder.Add(compound, box2);
  return compound;
}`,
        'empty.ts': `
import init from 'libcascade';
export default function main() {}`,
        'default-not-function.ts': `
import 'libcascade';
export default 42;`,
        'bad-call.ts': `
import { BRepPrimAPI_MakeBox, BRepFilletAPI_MakeFillet, ChFi3d_FilletShape, TopExp_Explorer, TopAbs_ShapeEnum, TopoDS } from 'libcascade';
export default function main() {
  const box = new BRepPrimAPI_MakeBox(10, 10, 10).Shape();
  const fillet = new BRepFilletAPI_MakeFillet(box, ChFi3d_FilletShape.ChFi3d_Rational);
  const explorer = new TopExp_Explorer(box, TopAbs_ShapeEnum.TopAbs_EDGE, TopAbs_ShapeEnum.TopAbs_SHAPE);
  if (explorer.More()) {
    const edge = TopoDS.Edge(explorer.Current());
    fillet.Add(100, edge);
  }
  return fillet.Shape();
}`,
        'throw-in-params.ts': `
import 'libcascade';
const trap = {};
Object.defineProperty(trap, 'badKey', {
  enumerable: true,
  get() {
    throw new Error('boom-in-params-getter');
  },
});
export const defaultParams = trap;
export default function main() {}
`,
        'bad-wedge-arity.ts': `
import { BRepPrimAPI_MakeWedge, gp_Pnt, gp_Dir, gp_Ax2 } from 'libcascade';
export default function main() {
  const ax = new gp_Ax2(new gp_Pnt(0, 0, 0), new gp_Dir(0, 0, 1));
  return new BRepPrimAPI_MakeWedge(ax, 1, 1, 1, 0, 1, 0, 0, 0, 1).Shape();
}`,
      },
    });
  });

  afterAll(async () => client.shutdown());

  // =============================================================================
  // getParameters
  // =============================================================================

  describe('getParameters', () => {
    it('should extract defaultParams', async () => {
      const geometryFile = createGeometryFile('params.ts');
      const result = await readParameters(geometryFile);
      assertSuccess(result, 'getParameters');
      expect(result.data.defaultParameters).toEqual({ width: 10, height: 20, depth: 30 });
      expect(result.data.jsonSchema).toBeDefined();
    });

    it('should return empty params when none defined', async () => {
      const geometryFile = createGeometryFile('no-params.ts');
      const result = await readParameters(geometryFile);
      assertSuccess(result, 'getParameters empty');
      expect(result.data.defaultParameters).toEqual({});
    });
  });

  // =============================================================================
  // createGeometry + exportGeometry
  // =============================================================================

  describe('geometry and export', () => {
    // -- createGeometry --

    it('should create a box shape and return GLTF', async () => {
      const geometryFile = createGeometryFile('box.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'box createGeometry');
      expect(result.data).toBeDefined();
      expect(result.data.format).toBe('gltf');
      await geometryHelpers.expectValidGltf(result);
      const { nodeNames, meshNames } = await readGltfNodeMeshNames(extractGltfBytes(result));
      expect(nodeNames).toEqual(['Shape 1']);
      expect(meshNames).toEqual(['Shape 1']);
    });

    it('should handle parameterized geometry', async () => {
      const geometryFile = createGeometryFile('parameterized.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: { size: 25 } });
      assertSuccess(result, 'parameterized createGeometry');
    });

    it('should handle array of shapes', async () => {
      const geometryFile = createGeometryFile('multi.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'multi-shape createGeometry');
      const { nodeNames, meshNames } = await readGltfNodeMeshNames(extractGltfBytes(result));
      expect(nodeNames).toEqual(['Shape 1', 'Shape 2']);
      expect(meshNames).toEqual(['Shape 1', 'Shape 2']);
    });

    it('should handle named shape entries', async () => {
      const geometryFile = createGeometryFile('named.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'named shapes createGeometry');
    });

    it('should keep shape labels out of generated GLB material names', async () => {
      const geometryFile = createGeometryFile('named-pbr.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'named PBR shape createGeometry');

      const gltfBytes = extractGltfBytes(result);
      const { nodeNames, meshNames } = await readGltfNodeMeshNames(gltfBytes);
      expect(nodeNames).toEqual(['PbrBox']);
      expect(meshNames).toEqual(['PbrBox']);
      expect(await readGltfMaterialNames(gltfBytes)).toEqual(['']);
    });

    it('should serialize native handles as versioned geometry-only BRep snapshots', async () => {
      const oc = getModuleRegistry().get('libcascade') as unknown as OpenCascadeInstance | undefined;
      expect(oc, 'expected worker to have registered libcascade module').toBeDefined();
      const cascade = oc!;
      const writeSpy = vi.spyOn(cascade.BRepTools, 'Write');

      const geometryFile = createGeometryFile('named-pbr.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'named PBR shape createGeometry for native-handle snapshot');

      const snapshot = expectOpenCascadeSnapshot(result.serializedNativeHandle);
      expect(snapshot.entries).toHaveLength(1);
      expect(snapshot.entries[0]!.metadata).toEqual(
        expect.objectContaining({
          name: 'PbrBox',
          color: '#ff0000',
          metalness: 0.2,
          roughness: 0.7,
          density: 1.25,
        }),
      );
      expect(writeSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        false,
        false,
        cascade.TopTools_FormatVersion.TopTools_FormatVersion_CURRENT,
        expect.any(Object),
      );
    });

    it('should render an empty GLB when main returns undefined (empty body)', async () => {
      const geometryFile = createGeometryFile('empty.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'empty createGeometry');
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 0);
    });

    it('should render an empty GLB when default export is not a function', async () => {
      const geometryFile = createGeometryFile('default-not-function.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'default-not-function createGeometry');
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 0);
    });

    // -- exportGeometry --

    it('should fail export with no geometry', async () => {
      const freshClient = createTestRuntimeClient({ runtime });
      try {
        await expect(freshClient.export('step')).rejects.toMatchObject({ code: 'RUNTIME_NO_RENDER_OUTCOME' });
      } finally {
        await freshClient.shutdown();
      }
    });

    it('should export to STEP format', async () => {
      const geometryFile = createGeometryFile('box.ts');
      const createResult = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(createResult, 'createGeometry for STEP export');

      const exportResult = await exportLastRender('step');
      assertSuccess(exportResult, 'STEP export');
      expect(exportResult.data.length).toBeGreaterThan(0);
      expect(exportResult.data[0]?.bytes).toBeInstanceOf(Uint8Array);
      expect(exportResult.data[0]?.mimeType).toBe('application/step');

      const stepContent = new TextDecoder().decode(exportResult.data[0]!.bytes);
      expect(stepContent).toContain('CLOSED_SHELL');
      expect(stepContent).toContain('ADVANCED_BREP_SHAPE_REPRESENTATION');
      expect(stepContent).toContain('MANIFOLD_SOLID_BREP');
      // GeoSpec R1: a single-shape export is a one-component assembly, never a free shape.
      expect([...stepContent.matchAll(/NEXT_ASSEMBLY_USAGE_OCCURRENCE/g)]).toHaveLength(1);
    });

    it('should export to STL format', async () => {
      const geometryFile = createGeometryFile('box.ts');
      const createResult = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(createResult, 'createGeometry for STL export');

      const exportResult = await exportLastRender('stl');
      assertSuccess(exportResult, 'STL export');
      expect(exportResult.data.length).toBeGreaterThan(0);
      expect(exportResult.data[0]?.name).toBe('Shape 1');
      expect(exportResult.data[0]?.bytes).toBeInstanceOf(Uint8Array);
    });

    it('should export to binary STL format', async () => {
      const geometryFile = createGeometryFile('box.ts');
      const createResult = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(createResult, 'createGeometry for STL-binary export');

      const exportResult = await exportLastRender('stl', { binary: true });
      assertSuccess(exportResult, 'STL-binary export');
      expect(exportResult.data.length).toBeGreaterThan(0);
    });

    it('should export to GLB format', async () => {
      const geometryFile = createGeometryFile('box.ts');
      const createResult = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(createResult, 'createGeometry for GLB export');

      const exportResult = await exportLastRender('glb');
      assertSuccess(exportResult, 'GLB export');
      expect(exportResult.data[0]?.name).toContain('glb');
    });

    it('should export an empty GLB after an empty render but keep STEP and STL unavailable', async () => {
      const geometryFile = createGeometryFile('empty.ts');
      const createResult = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(createResult, 'empty createGeometry for export');

      const glbResult = await exportLastRender('glb');
      assertSuccess(glbResult, 'empty GLB export');
      const document = await new NodeIO().readBinary(glbResult.data[0]!.bytes);
      expect(document.getRoot().listMeshes()).toHaveLength(0);

      assertFailure(await exportLastRender('step'), 'empty STEP export');
      assertFailure(await exportLastRender('stl'), 'empty STL export');
    });

    it('should export STEP assembly with multiple named shapes', async () => {
      const geometryFile = createGeometryFile('assembly.ts');
      const createResult = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(createResult, 'createGeometry for assembly export');

      const exportResult = await exportLastRender('step');
      assertSuccess(exportResult, 'STEP export');
      expect(exportResult.data.length).toBe(1);
      expect(exportResult.data[0]?.name).toBe('assembly');

      const stepContent = new TextDecoder().decode(exportResult.data[0]!.bytes);
      expect(stepContent).toContain('CLOSED_SHELL');
      expect(stepContent).toContain('ADVANCED_BREP_SHAPE_REPRESENTATION');
      expect(stepContent).toContain('MANIFOLD_SOLID_BREP');
      expect(stepContent).toContain('SmallBox');
      expect(stepContent).toContain('LargeBox');
      // GeoSpec R1: one NEXT_ASSEMBLY_USAGE_OCCURRENCE per component, carrying
      // the authored instance name.
      expect([...stepContent.matchAll(/NEXT_ASSEMBLY_USAGE_OCCURRENCE/g)]).toHaveLength(2);
      expect(stepContent).toMatch(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\('[^']*','SmallBox'/);
      expect(stepContent).toMatch(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\('[^']*','LargeBox'/);
      expect(stepContent).toContain("PRODUCT('SmallBox'");
      expect(stepContent).toContain("PRODUCT('LargeBox'");
    });

    it('should export STEP with non-shape material labels', async () => {
      const geometryFile = createGeometryFile('named-pbr.ts');
      const createResult = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(createResult, 'createGeometry for PBR STEP export');

      const exportResult = await exportLastRender('step');
      assertSuccess(exportResult, 'PBR STEP export');

      const stepContent = new TextDecoder().decode(exportResult.data[0]!.bytes);
      expect(stepContent).toContain('PbrBox');
      expect(stepContent).toContain('tau-material');
    });

    it('should round-trip STEP export/import preserving box volume', async () => {
      const geometryFile = createGeometryFile('box.ts');
      const createResult = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(createResult, 'createGeometry for STEP round-trip');

      const exportResult = await exportLastRender('step');
      assertSuccess(exportResult, 'STEP export');
      assertStepRoundTripVolumeMm3(exportResult.data[0]!.bytes, 6000);
    });

    it('should round-trip STEP export/import preserving assembly volume', async () => {
      const geometryFile = createGeometryFile('assembly.ts');
      const createResult = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(createResult, 'createGeometry for assembly STEP round-trip');

      const exportResult = await exportLastRender('step');
      assertSuccess(exportResult, 'STEP assembly export');
      // SmallBox 10³ + LargeBox 20³
      assertStepRoundTripVolumeMm3(exportResult.data[0]!.bytes, 9000);
    });

    it('should return error for unsupported export format', async () => {
      const geometryFile = createGeometryFile('box.ts');
      const createResult = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(createResult, 'createGeometry for unsupported format test');

      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid format for error-path testing
      const exportResult = await exportLastRender('obj' as unknown as 'step');
      expect(exportResult.success).toBe(false);
    });

    // -- Tessellation --

    it('should respect tessellation parameter for GLB export', async () => {
      const geometryFile = createGeometryFile('fillet.ts');
      await renderGeometry({ file: geometryFile, parameters: {} });

      const coarseExport = await exportLastRender('glb', {
        tessellation: { linearTolerance: 1, angularTolerance: 60 },
      });
      assertSuccess(coarseExport, 'coarse GLB export');

      const fineExport = await exportLastRender('glb', {
        tessellation: { linearTolerance: 0.001, angularTolerance: 5 },
      });
      assertSuccess(fineExport, 'fine GLB export');

      const coarseSize = coarseExport.data[0]!.bytes.byteLength;
      const fineSize = fineExport.data[0]!.bytes.byteLength;

      // Finer tessellation must produce a larger GLB (more triangles on curved fillet surfaces)
      expect(fineSize).toBeGreaterThan(coarseSize);
    });

    it('should respect tessellation parameter for STL export', async () => {
      const geometryFile = createGeometryFile('fillet.ts');
      await renderGeometry({ file: geometryFile, parameters: {} });

      const coarseExport = await exportLastRender('stl', {
        tessellation: { linearTolerance: 1, angularTolerance: 60 },
      });
      assertSuccess(coarseExport, 'coarse STL export');

      const fineExport = await exportLastRender('stl', {
        tessellation: { linearTolerance: 0.001, angularTolerance: 5 },
      });
      assertSuccess(fineExport, 'fine STL export');

      const coarseSize = coarseExport.data[0]!.bytes.byteLength;
      const fineSize = fineExport.data[0]!.bytes.byteLength;

      expect(fineSize).toBeGreaterThan(coarseSize);
    });

    // -- Coordinate system --

    it('should convert asymmetric GLB geometry from z-up millimeters to y-up meters exactly once', async () => {
      const geometryFile = createGeometryFile('coordinate.ts');
      await renderGeometry({ file: geometryFile, parameters: {} });

      const yUpExport = await exportLastRender('glb', {
        coordinateSystem: 'y-up',
        unit: { length: 'meter' },
      });
      const zUpExport = await exportLastRender('glb', {
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
      });

      assertSuccess(yUpExport, 'y-up GLB export');
      assertSuccess(zUpExport, 'z-up GLB export');

      const yUpEvidence = await readCoordinateEvidence({ bytes: yUpExport.data[0]!.bytes });
      const zUpEvidence = await readCoordinateEvidence({ bytes: zUpExport.data[0]!.bytes });
      expect(yUpEvidence).toEqual(mapZupMillimetersToYupMeters(zUpEvidence));
    });

    it('should export GLB in z-up millimeters when unit length is millimeter', async () => {
      const geometryFile = createGeometryFile('box.ts');
      await renderGeometry({ file: geometryFile, parameters: {} });

      const exportResult = await exportLastRender('glb', {
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
      });

      assertSuccess(exportResult, 'z-up millimeter GLB export');
      const size = await readGltfSize(exportResult.data[0]!.bytes);
      expect(size[0]).toBeCloseTo(10, 4);
      expect(size[1]).toBeCloseTo(20, 4);
      expect(size[2]).toBeCloseTo(30, 4);
    });

    // -- Boolean operations --

    it('should perform boolean union (fuse)', async () => {
      const geometryFile = createGeometryFile('fuse.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'Boolean fuse');
      await geometryHelpers.expectValidGltf(result);
    });

    it('should perform boolean intersection (common)', async () => {
      const geometryFile = createGeometryFile('common.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'Boolean common');
      await geometryHelpers.expectValidGltf(result);
    });

    it('should perform boolean difference (cut)', async () => {
      const geometryFile = createGeometryFile('cut.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'Boolean cut');
      await geometryHelpers.expectValidGltf(result);
    });

    // -- Fillet, Transform, Compound --

    it('should apply fillet to a box edge', async () => {
      const geometryFile = createGeometryFile('fillet.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'Fillet operation');
      await geometryHelpers.expectValidGltf(result);
    });

    it('should apply a translation transform', async () => {
      const geometryFile = createGeometryFile('transform.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'Transform operation');
      await geometryHelpers.expectValidGltf(result);
      // OpenCASCADE Z-up mm -> GLTF Y-up m: x'=x/1000, y'=z/1000, z'=-y/1000
      // OpenCASCADE center (55,55,55)mm -> GLTF (0.055, 0.055, -0.055)m
      await geometryHelpers.expectBoundingBoxCenter(result, [0.055, 0.055, -0.055], 0.001);
    });

    it('should build a compound from multiple shapes', async () => {
      const geometryFile = createGeometryFile('compound.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result, 'Compound shape');
      await geometryHelpers.expectValidGltf(result);
    });
  });

  // =============================================================================
  // Exception decoding
  // =============================================================================

  describe('exception decoding', () => {
    it('should decode OC WebAssembly.Exception via getExceptionMessage and capture JS stack frames', async () => {
      const geometryFile = createGeometryFile('bad-call.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });

      assertFailure(result, 'bad-call createGeometry');
      const issue = result.issues[0]!;
      expect(issue).toEqual(
        expect.objectContaining({
          type: 'kernel',
          severity: 'error',
          message: expect.stringContaining('StdFail_NotDone'),
        }),
      );
      expect(issue.message).not.toContain('undecodable');
      expect(issue.message).not.toBe('[object WebAssembly.Exception]');
      expect(issue.stackFrames?.length ?? 0).toBeGreaterThan(0);
    });

    it('should resolve user source path for getParameters errors via inline source map', async () => {
      const geometryFile = createGeometryFile('throw-in-params.ts');
      const result = await readParameters(geometryFile);
      assertFailure(result, 'throw-in-params getParameters');
      const issue = result.issues[0]!;
      expect(issue.stackFrames?.length ?? 0).toBeGreaterThan(0);
      const userFrame = issue.stackFrames!.find((f) => f.context === 'user');
      expect(userFrame, 'expected at least one user-context stack frame').toBeDefined();
      expect(userFrame!.fileName).toMatch(/throw-in-params\.ts$/);
      expect(userFrame!.fileName).not.toMatch(/^blob:/);
    });

    it('should map embind invalid-arity errors (BRepPrimAPI_MakeWedge) to the offending user line', async () => {
      const geometryFile = createGeometryFile('bad-wedge-arity.ts');
      const result = await renderGeometry({ file: geometryFile, parameters: {} });

      assertFailure(result, 'bad-wedge-arity createGeometry');
      const issue = result.issues[0]!;
      expect(issue.message).toMatch(/BRepPrimAPI_MakeWedge/);
      expect(issue.message).toMatch(/invalid number of parameters \(10\)/);
      expect(issue.message).toMatch(/expected \(4,5,7,8\)/);
      expect(issue.message).not.toContain('undecodable');

      expect(issue.stackFrames?.length ?? 0).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // GD&T (deferred until full libcascade build has XCAF symbols)
  // =============================================================================

  describe('GD&T', () => {
    it.skip('should create an XCAF document with dimension annotations', () => {
      // Deferred until full libcascade build has XCAF symbols properly bound.
      // This test requires TDocStd_Application, XCAFDoc_DocumentTool, XCAFDimTolObjects_DimensionObject.
    });
  });
});
