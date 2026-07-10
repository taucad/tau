import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { analyzeTauModel, renderTauModel, runTauGeoSpecTests } from '#tau.js';
import type { GeometrySubject } from 'geospec';
import type { GeoSpecModelFormat } from 'geospec/model';
import type { WatertightResult } from '#geometry/types.js';

type TestVmFileSystem = {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
};

class MemoryFileSystem implements TestVmFileSystem {
  private readonly files = new Map<string, string>();

  public setText(path: string, content: string): void {
    this.files.set(path, content);
  }

  public async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  public async readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  public async readFile(path: string, encoding: 'utf8'): Promise<string>;
  public async readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }

    return encoding === 'utf8' ? content : new TextEncoder().encode(content);
  }

  public async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  public async ensureDir(_path: string): Promise<void> {
    return undefined;
  }
}

const createTriangleGlb = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const indices = document
    .createAccessor()
    .setType(Accessor.Type['SCALAR']!)
    .setBuffer(buffer)
    .setArray(new Uint32Array([0, 1, 2]));
  const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh('triangle').addPrimitive(primitive);
  document.createScene().addChild(document.createNode('triangle').setMesh(mesh));
  return new WebIO().writeBinary(document);
};

const watertightResult = (overrides: Partial<WatertightResult> = {}): WatertightResult => ({
  watertight: true,
  irregularEdges: 0,
  openBoundaryEdges: 0,
  nonManifoldEdges: 0,
  irregularEdgeKindCounts: { openBoundary: 0, nonManifold: 0 },
  irregularEdgeClusters: [],
  totalEdges: 0,
  irregularEdgeFraction: 0,
  perPrimitive: [],
  ...overrides,
});

const createGeometrySubject = (sizeX: number): GeometrySubject =>
  ({
    kind: 'geometry-subject',
    capabilities: ['mesh'],
    provenance: {
      source: { kind: 'bytes', path: 'main.scad' },
      parameters: {},
    },
    mesh: {
      stats: {
        boundingBox: { center: [sizeX / 2, 0, 0], size: [sizeX, 1, 1] },
        analyseConnectedComponents: () => ({ count: 1, components: [] }),
        analyseWatertight: () => watertightResult(),
      },
    },
  }) as unknown as GeometrySubject;

describe('Tau model render helpers', () => {
  it('should require an explicit renderer outside a Tau GeoSpec runner', async () => {
    await expect(renderTauModel({ file: 'main.ts' })).rejects.toThrow('requires a Tau test renderer');
  });

  it('should render with explicit parameters and preserve provenance', async () => {
    const bytes = await createTriangleGlb();
    const calls: Array<{
      file: string;
      format?: string;
      parameters?: Record<string, unknown>;
    }> = [];

    const subject = await renderTauModel({
      file: 'main.ts',
      parameters: { width: 60 },
      renderer: async (input) => {
        calls.push(input);
        return bytes;
      },
    });

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.provenance.parameters).toEqual({ width: 60 });
    expect(calls).toEqual([{ file: 'main.ts', format: 'glb', parameters: { width: 60 } }]);
  });

  it('should analyze rendered geometry with GeoSpec provenance parameters', async () => {
    const bytes = await createTriangleGlb();
    const result = await analyzeTauModel({
      file: 'main.ts',
      parameters: { width: 12 },
      renderer: async () => bytes,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subject.provenance.parameters).toEqual({ width: 12 });
      expect(result.stats.triangleCount).toBe(1);
    }
  });

  it('should analyze runtime GLB bytes for OpenSCAD source filenames as millimetre evidence', async () => {
    const bytes = await createTriangleGlb();
    const subject = await renderTauModel({
      file: 'main.scad',
      renderer: async () => bytes,
    });

    expect(subject.provenance.source.path).toBe('main.glb');
    expect(subject.provenance.unit).toBe('mm');
    expect(subject.mesh.stats.boundingBox?.size[0]).toBeCloseTo(1, 5);
    expect(subject.mesh.stats.boundingBox?.size[1]).toBeCloseTo(1, 5);
    expect(subject.mesh.stats.triangleCount).toBe(1);
  });
});

describe('runTauGeoSpecTests', () => {
  it('should group all assertion results under the GeoSpec test file', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/main.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('table geometry', () => {",
        "  it('should have the expected width', async () => {",
        "    const model = await loadModel({ file: 'main.scad' });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 800 }, tolerance: 2 });',
        '  });',
        "  it('should be watertight', async () => {",
        "    const model = await loadModel({ file: 'main.scad' });",
        '    expectGeo(model).toBeWatertight();',
        '  });',
        '});',
      ].join('\n'),
    );

    const subject: GeometrySubject = {
      kind: 'geometry-subject',
      capabilities: ['mesh'],
      provenance: {
        source: { kind: 'bytes', path: 'main.scad' },
        parameters: {},
      },
      mesh: {
        stats: {
          boundingBox: { center: [0, 0, 0], size: [800, 600, 750] },
          analyseConnectedComponents: () => ({ count: 1, components: [] }),
          analyseWatertight: () => watertightResult(),
        },
      },
    } as unknown as GeometrySubject;

    const result = await runTauGeoSpecTests({
      filesystem,
      projectPath: '/project',
      entryPaths: ['main.geospec.ts'],
      renderer: async () => subject,
    });

    expect(result.failures).toEqual([]);
    expect(result.passes).toHaveLength(2);
    expect(result.passes.map((pass) => pass.targetFile)).toEqual(['main.geospec.ts', 'main.geospec.ts']);
    expect(result.passes.map((pass) => pass.requirement)).toEqual([
      'table geometry > should have the expected width',
      'table geometry > should be watertight',
    ]);
  });

  it('should group runtime byte assertions for OpenSCAD source targets under the GeoSpec test file', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/main.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('OpenSCAD geometry', () => {",
        "  it('should use exported GLB evidence for the source file', async () => {",
        "    const model = await loadModel({ file: 'main.scad' });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 1, y: 1 }, tolerance: 0.01 });',
        '  });',
        '});',
      ].join('\n'),
    );
    const bytes = await createTriangleGlb();
    const calls: Array<{ file: string; format?: GeoSpecModelFormat }> = [];

    const result = await runTauGeoSpecTests({
      filesystem,
      projectPath: '/project',
      entryPaths: ['main.geospec.ts'],
      renderer: async (input) => {
        calls.push({ file: input.file, format: input.format });
        return bytes;
      },
    });

    expect(calls).toEqual([{ file: 'main.scad', format: 'glb' }]);
    expect(result.failures).toEqual([]);
    expect(result.passes).toEqual([
      {
        id: 'main.geospec.ts:OpenSCAD geometry > should use exported GLB evidence for the source file',
        requirement: 'OpenSCAD geometry > should use exported GLB evidence for the source file',
        targetFile: 'main.geospec.ts',
      },
    ]);
  });

  it('should filter Tau GeoSpec results by Vitest-style testNamePattern regex', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/main.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('filtered table geometry', () => {",
        "  it('should check width', async () => {",
        "    const model = await loadModel({ file: 'main.scad' });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 800 }, tolerance: 2 });',
        '  });',
        "  it('should check height', async () => {",
        "    const model = await loadModel({ file: 'main.scad' });",
        '    expectGeo(model).toHaveBoundingBox({ size: { z: 750 }, tolerance: 2 });',
        '  });',
        '});',
      ].join('\n'),
    );

    const subject: GeometrySubject = {
      kind: 'geometry-subject',
      capabilities: ['mesh'],
      provenance: {
        source: { kind: 'bytes', path: 'main.scad' },
        parameters: {},
      },
      mesh: {
        stats: {
          boundingBox: { center: [0, 0, 0], size: [800, 600, 750] },
          analyseConnectedComponents: () => ({ count: 1, components: [] }),
          analyseWatertight: () => watertightResult(),
        },
      },
    } as unknown as GeometrySubject;

    const result = await runTauGeoSpecTests({
      filesystem,
      projectPath: '/project',
      entryPaths: ['main.geospec.ts'],
      testNamePattern: 'width$',
      renderer: async () => subject,
    });

    expect(result.failures).toEqual([]);
    expect(result.passes.map((pass) => pass.requirement)).toEqual(['filtered table geometry > should check width']);
    expect(result.total).toBe(1);
  });

  it('should not execute Tau GeoSpec tests excluded by negative-lookahead testNamePattern', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/main.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('planetary gearbox assembly', () => {",
        "  it('should check carrier spacing', async () => {",
        "    const model = await loadModel({ file: 'main.scad', parameters: { size: 10 } });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 10 }, tolerance: 0.001 });',
        '  });',
        "  it('has correctly phased gear teeth (no meshing interference)', async () => {",
        "    await loadModel({ file: 'main.scad', parameters: { size: 999 } });",
        "    throw new Error('known failing check should not run');",
        '  });',
        '});',
      ].join('\n'),
    );
    const calls: unknown[] = [];

    const result = await runTauGeoSpecTests({
      filesystem,
      projectPath: '/project',
      entryPaths: ['main.geospec.ts'],
      testNamePattern: '^(?!.*no meshing interference).*',
      renderer: async (input) => {
        calls.push(input);
        return createGeometrySubject(10);
      },
    });

    expect(result.failures).toEqual([]);
    expect(result.passes.map((pass) => pass.requirement)).toEqual([
      'planetary gearbox assembly > should check carrier spacing',
    ]);
    expect(calls).toEqual([
      expect.objectContaining({
        file: 'main.scad',
        parameters: { size: 10 },
      }),
    ]);
  });

  it('should fail when filters select no GeoSpec tests', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/main.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('filtered geometry', () => {",
        "  it('should check width', async () => {",
        "    const model = await loadModel({ file: 'main.scad' });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 800 }, tolerance: 2 });',
        '  });',
        '});',
      ].join('\n'),
    );

    const result = await runTauGeoSpecTests({
      filesystem,
      projectPath: '/project',
      entryPaths: ['main.geospec.ts'],
      testNamePattern: 'height',
      renderer: async () => createGeometrySubject(800),
    });

    expect(result.passed).toBe(0);
    expect(result.total).toBe(1);
    expect(result.failures).toEqual([
      expect.objectContaining({
        id: 'NO_MATCHING_GEOSPEC_TESTS',
        requirement: 'At least one selected GeoSpec test must run',
        targetFile: 'main.geospec.ts',
      }),
    ]);
  });

  it('should keep concurrent Tau GeoSpec renderer bindings isolated per invocation', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/first.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('first tau run', () => {",
        "  it('should use the first renderer', async () => {",
        "    const model = await loadModel({ file: 'main.scad', parameters: { width: 10 } });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 10 }, tolerance: 0.001 });',
        '  });',
        '});',
      ].join('\n'),
    );
    filesystem.setText(
      '/project/second.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('second tau run', () => {",
        "  it('should use the second renderer', async () => {",
        "    const model = await loadModel({ file: 'main.scad', parameters: { width: 20 } });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 20 }, tolerance: 0.001 });',
        '  });',
        '});',
      ].join('\n'),
    );

    const [first, second] = await Promise.all([
      runTauGeoSpecTests({
        filesystem,
        projectPath: '/project',
        entryPaths: ['first.geospec.ts'],
        renderer: async (input) => {
          await Promise.resolve();
          expect(input.parameters).toEqual({ width: 10 });
          return createGeometrySubject(10);
        },
      }),
      runTauGeoSpecTests({
        filesystem,
        projectPath: '/project',
        entryPaths: ['second.geospec.ts'],
        renderer: async (input) => {
          expect(input.parameters).toEqual({ width: 20 });
          return createGeometrySubject(20);
        },
      }),
    ]);

    expect(first.failures).toEqual([]);
    expect(second.failures).toEqual([]);
    expect(first.passed).toBe(1);
    expect(second.passed).toBe(1);
  });

  it('should run initial BRep feature matchers through the Tau GeoSpec harness', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/main.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('brep feature checks', () => {",
        "  it('should validate exact feature evidence', async () => {",
        "    const model = await loadModel({ file: 'main.ts', format: 'step' });",
        '    expectGeo(model).toHavePlanarFace({ normal: { x: 0, y: 0, z: 1 }, offset: 20, area: { greaterThan: 5000 }, tolerance: 0.05 });',
        "    expectGeo(model).toHaveCylindricalFace({ radius: 15, axis: 'z', tolerance: 0.05 });",
        "    expectGeo(model).toHaveCircularHole({ diameter: 8, through: true, axis: 'z', center: { x: 25, y: 15 }, tolerance: 0.05 });",
        "    expectGeo(model).toHaveChamferFeature({ distance: 2, selection: 'outer top perimeter', tolerance: 0.05 });",
        '    expectGeo(model).toHaveMinimumWallThickness({ value: { greaterThanOrEqual: 2 }, tolerance: 0.05 });',
        '  });',
        '});',
      ].join('\n'),
    );

    const subject: GeometrySubject = {
      kind: 'geometry-subject',
      capabilities: [
        { kind: 'brep', feature: 'planar-faces' },
        { kind: 'brep', feature: 'cylindrical-faces' },
        { kind: 'brep', feature: 'circular-holes' },
        { kind: 'brep', feature: 'chamfer-features' },
        { kind: 'brep', feature: 'wall-thickness' },
      ],
      provenance: {
        source: { kind: 'bytes', format: 'step', path: 'main.ts' },
        unit: 'mm',
        loader: 'in-memory',
        parameters: {},
      },
      diagnostics: [],
      mesh: {
        format: 'mesh-buffer',
        stats: {
          vertexCount: 0,
          meshCount: 0,
          triangleCount: 0,
          meshQuality: {
            triangleCount: 0,
            nonFiniteVertices: [],
            degenerateTriangles: [],
            duplicateFaces: [],
            triangles: [],
            surfaceArea: 0,
            signedVolume: 0,
          },
          connectedComponents: () => 0,
          analyseConnectedComponents: () => ({ count: 0, clusters: [], gaps: [] }),
          watertight: false,
          analyseWatertight: () => watertightResult({ watertight: false }),
        },
      },
      brep: {
        validity: { valid: true },
        planarFaces: [{ normal: [0, 0, 1], offset: 20, area: 6000 }],
        cylindricalFaces: [{ radius: 15, axis: 'z' }],
        circularHoles: [{ diameter: 8, through: true, axis: 'z', center: [25, 15, 0] }],
        chamferFeatures: [{ distance: 2, selection: 'outer top perimeter' }],
        minimumWallThickness: { value: 2.5, location: [0, 0, 0] },
      },
    };

    const rendererCalls: Array<{ file: string; format?: string }> = [];
    const result = await runTauGeoSpecTests({
      filesystem,
      projectPath: '/project',
      entryPaths: ['main.geospec.ts'],
      renderer: async (input) => {
        rendererCalls.push(input);
        return subject;
      },
    });

    expect(result.failures).toEqual([]);
    expect(result.passes).toEqual([
      {
        id: 'main.geospec.ts:brep feature checks > should validate exact feature evidence',
        requirement: 'brep feature checks > should validate exact feature evidence',
        targetFile: 'main.geospec.ts',
      },
    ]);
    expect(result.passed).toBe(1);
    expect(result.total).toBe(1);
    expect(rendererCalls).toEqual([expect.objectContaining({ file: 'main.ts', format: 'step' })]);
  });
});
