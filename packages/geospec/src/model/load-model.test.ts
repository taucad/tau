import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { describe, expect, it, vi } from 'vitest';
import { GeoSpecModelLoadError, createModelLoader, loadModel, parameterGroups, params } from '#model/index.js';
import type { GeometryDiagnostic } from '#mesh/types.js';
import { runGeoSpecModule } from '#runner/index.js';
import type { VmFileSystem } from '@taucad/vm';

const replicadBoxCode = `
  import { makeBaseBox } from 'replicad';

  export default function main() {
    return makeBaseBox(10, 20, 30);
  }
`;
const mainFile = 'main.ts';
const openscadFile = 'main.scad';
const openscadCubeCutoutCode = `
$fa = 2;
$fs = 0.4;

difference() {
  cube([50, 50, 50], center = true);
  cylinder(h = 60, r = 10, center = true);
}
`;

class MemoryFileSystem implements VmFileSystem {
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
    .setBuffer(buffer)
    .setType(Accessor.Type['VEC3']!)
    .setArray(new Float32Array([0, 0, 0, 50, 0, 0, 0, 50, 0]));
  const indices = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['SCALAR']!)
    .setArray(new Uint16Array([0, 1, 2]));
  const primitive = document.createPrimitive().setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh().addPrimitive(primitive);
  const node = document.createNode().setMesh(mesh);
  document.createScene().addChild(node);
  return new WebIO().writeBinary(document);
};

describe('loadModel', () => {
  it('should load direct mesh-buffer sources as geometry subjects', async () => {
    const subject = await loadModel({
      source: {
        format: 'mesh-buffer',
        name: 'triangle',
        positions: [0, 0, 0, 10, 0, 0, 0, 10, 0],
        indices: [0, 1, 2],
      },
      parameters: { variant: 'direct' },
    });

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.provenance.parameters).toEqual({ variant: 'direct' });
    expect(subject.provenance.source).toEqual(
      expect.objectContaining({
        kind: 'mesh-buffer',
        name: 'triangle',
      }),
    );
    expect(subject.mesh.stats.triangleCount).toBe(1);
  });

  it('should load Replicad code through the Tau runtime as mesh evidence', { timeout: 30_000 }, async () => {
    const subject = await loadModel({
      code: { [mainFile]: replicadBoxCode },
      file: mainFile,
      kernel: 'replicad',
      format: 'glb',
      parameters: { width: 10 },
    });

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.provenance.parameters).toEqual({ width: 10 });
    expect(subject.provenance.unit).toBe('mm');
    const sortedSize = [...(subject.mesh.stats.boundingBox?.size ?? [])].sort((a, b) => a - b);
    expect(sortedSize[0]).toBeCloseTo(10, 5);
    expect(sortedSize[1]).toBeCloseTo(20, 5);
    expect(sortedSize[2]).toBeCloseTo(30, 5);
    expect(subject.mesh.stats.meshQuality.surfaceArea).toBeGreaterThan(0);
    expect(Math.abs(subject.mesh.stats.meshQuality.signedVolume)).toBeGreaterThan(0);
  });

  it(
    'should load OpenSCAD source files through the optional runtime as millimetre mesh evidence',
    { timeout: 120_000 },
    async () => {
      const subject = await loadModel({
        code: { [openscadFile]: openscadCubeCutoutCode },
        file: openscadFile,
        kernel: 'openscad',
      });

      expect(subject.kind).toBe('geometry-subject');
      expect(subject.provenance.source.format).toBe('glb');
      expect(subject.provenance.unit).toBe('mm');
      expect(subject.mesh.stats.boundingBox?.size[0]).toBeCloseTo(50, 1);
      expect(subject.mesh.stats.boundingBox?.size[1]).toBeCloseTo(50, 1);
      expect(subject.mesh.stats.boundingBox?.size[2]).toBeCloseTo(50, 1);
      expect(subject.mesh.stats.boundingBox?.center[0]).toBeCloseTo(0, 1);
      expect(subject.mesh.stats.boundingBox?.center[1]).toBeCloseTo(0, 1);
      expect(subject.mesh.stats.boundingBox?.center[2]).toBeCloseTo(0, 1);
      expect(subject.mesh.stats.watertight).toBe(true);
      expect(subject.mesh.stats.connectedComponents(0.1)).toBe(1);
    },
  );

  it('should request canonical z-up millimeter exports from runtime route metadata', async () => {
    const bytes = await createTriangleGlb();
    const exportMock = vi.fn(async (_format: string, _input: unknown) => ({
      success: true,
      data: { bytes, name: 'model.glb' },
      issues: [],
    }));
    const runtime = {
      export: exportMock,
      bestRouteFor: vi.fn(() => ({
        kernelId: 'replicad',
        sourceFormat: 'glb',
        targetFormat: 'glb',
        fidelity: 'mesh',
        schema: {
          properties: {
            coordinateSystem: {},
            unit: {},
          },
        },
        defaults: {
          coordinateSystem: 'z-up',
          unit: { length: 'meter' },
        },
      })),
    };

    const subject = await loadModel({
      file: mainFile,
      runtime,
    });

    expect(exportMock).toHaveBeenCalledWith(
      'glb',
      expect.objectContaining({
        file: mainFile,
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
      }),
    );
    expect(subject.mesh.stats.boundingBox?.size[0]).toBeCloseTo(50, 5);
    expect(subject.mesh.stats.boundingBox?.size[1]).toBeCloseTo(50, 5);
    const honoredIntent = subject.provenance.exportIntent?.honored;
    expect(honoredIntent).toBeDefined();
    if (!honoredIntent) {
      throw new Error('Expected loadModel to record honored export intent');
    }
    expect(honoredIntent.coordinateSystem).toBe('z-up');
    expect(honoredIntent.sourceUnit).toBe('mm');
    expect(honoredIntent.unit).toEqual({ length: 'millimeter' });
  });

  it('should treat custom runtimes without route metadata as canonical millimeter exporters', async () => {
    const bytes = await createTriangleGlb();
    const exportMock = vi.fn(async (_format: string, _input: unknown) => ({
      success: true,
      data: { bytes, name: 'model.glb' },
      issues: [],
    }));

    const subject = await loadModel({
      file: mainFile,
      runtime: {
        export: exportMock,
      },
    });

    expect(exportMock).toHaveBeenCalledWith('glb', { file: mainFile, parameters: undefined });
    expect(subject.mesh.stats.boundingBox?.size[0]).toBeCloseTo(50, 5);
    expect(subject.mesh.stats.boundingBox?.size[1]).toBeCloseTo(50, 5);
    expect(subject.provenance.exportIntent?.honored).toEqual({
      format: 'glb',
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      sourceUnit: 'mm',
    });
  });

  it('should report unsupported canonical exports when route-aware mesh routes lack unit intent', async () => {
    const exportMock = vi.fn();
    const runtime = {
      export: exportMock,
      bestRouteFor: vi.fn(() => ({
        kernelId: 'legacy',
        sourceFormat: 'glb',
        targetFormat: 'glb',
        fidelity: 'mesh',
        schema: { properties: { coordinateSystem: {} } },
      })),
    };

    let thrown: unknown;
    try {
      await loadModel({
        file: mainFile,
        runtime,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GeoSpecModelLoadError);
    const { diagnostics } = thrown as GeoSpecModelLoadError;
    const [diagnostic] = diagnostics;
    expect(diagnostic).toMatchObject({
      code: 'GEOSPEC_CANONICAL_EXPORT_UNSUPPORTED',
      severity: 'error',
      details: {
        format: 'glb',
        missing: ['unit'],
        route: {
          kernelId: 'legacy',
          fidelity: 'mesh',
          direct: true,
        },
      },
    });
    expect(exportMock).not.toHaveBeenCalled();
  });

  it('should reject mesh-fidelity STEP transcodes for exact BRep evidence', async () => {
    const exportMock = vi.fn();
    const runtime = {
      export: exportMock,
      bestRouteFor: vi.fn(() => ({
        kernelId: 'replicad',
        sourceFormat: 'glb',
        targetFormat: 'step',
        transcoderId: 'converter',
        fidelity: 'mesh',
        schema: { properties: {} },
        defaults: {},
      })),
    };

    let thrown: unknown;
    try {
      await loadModel({
        file: mainFile,
        format: 'step',
        runtime,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GeoSpecModelLoadError);
    const { diagnostics } = thrown as GeoSpecModelLoadError;
    const [diagnostic] = diagnostics;
    expect(diagnostic).toMatchObject({
      code: 'GEOSPEC_DIRECT_STEP_ROUTE_REQUIRED',
      severity: 'error',
    });
    expect(exportMock).not.toHaveBeenCalled();
  });

  it('should run OpenSCAD GeoSpec modules without treating .scad as a mesh file', { timeout: 120_000 }, async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/main.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('cube with cylinder cutout', () => {",
        "  it('should have bounding box approximately 50mm cubic', async () => {",
        "    const model = await loadModel({ file: 'main.scad' });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 50, y: 50, z: 50 }, tolerance: 1 });',
        '  });',
        "  it('should be centered at origin', async () => {",
        "    const model = await loadModel({ file: 'main.scad' });",
        '    expectGeo(model).toHaveBoundingBox({ center: { x: 0, y: 0, z: 0 }, tolerance: 0.5 });',
        '  });',
        "  it('should be a single watertight solid', async () => {",
        "    const model = await loadModel({ file: 'main.scad' });",
        '    expectGeo(model).toBeWatertight();',
        '  });',
        "  it('should be one connected component', async () => {",
        "    const model = await loadModel({ file: 'main.scad' });",
        '    expectGeo(model).toHaveConnectedComponents({ count: 1 });',
        '  });',
        '});',
      ].join('\n'),
    );

    let subjectPromise: Promise<Awaited<ReturnType<typeof loadModel>>> | undefined;
    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/main.geospec.ts',
      modelLoader: async (input) => {
        if ('source' in input) {
          return loadModel(input);
        }
        if ('code' in input) {
          return loadModel(input);
        }
        subjectPromise ??= loadModel({
          code: { [openscadFile]: openscadCubeCutoutCode },
          file: openscadFile,
          kernel: 'openscad',
          format: input.format,
          parameters: input.parameters,
        });
        return subjectPromise;
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tests.map((test) => test.status)).toEqual(['passed', 'passed', 'passed', 'passed']);
    }
  });

  it('should throw typed diagnostics for invalid STEP sources', async () => {
    await expect(
      loadModel({
        source: new Uint8Array([1, 2, 3]),
        format: 'step',
      }),
    ).rejects.toMatchObject({
      name: 'GeoSpecModelLoadError',
      diagnostics: [
        {
          code: 'STEP_LOAD_FAILED',
          severity: 'error',
          suggestion: 'Check that the STEP bytes are valid and that the configured STEP loader can parse this source.',
        },
      ],
    });
  });

  it('should load Replicad code through the Tau runtime as STEP and BRep evidence', { timeout: 60_000 }, async () => {
    const subject = await loadModel({
      code: { [mainFile]: replicadBoxCode },
      file: mainFile,
      kernel: 'replicad',
      format: 'step',
      parameters: { width: 10 },
    });

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.step?.unit).toBe('mm');
    expect(typeof subject.step?.readStrategy.bytesRead).toBe('number');
    expect(subject.brep?.validity).toEqual({ valid: true });
    expect(typeof subject.brep?.massProperties?.volume).toBe('number');
    expect(typeof subject.brep?.massProperties?.surfaceArea).toBe('number');
    expect(subject.mesh.stats.triangleCount).toBeGreaterThan(0);
  });

  it('should expose merged parameter groups for model tests', () => {
    const groups = parameterGroups(
      {
        activeGroup: 'wide',
        order: ['wide', 'narrow'],
        groups: {
          wide: { values: { base: { width: 20 } } },
          narrow: { values: { base: { width: 10 } } },
        },
      },
      { defaults: { base: { width: 5, depth: 7 } }, parameterFile: '.tau/parameters/main.ts.json' },
    );

    expect(groups).toEqual([
      {
        name: 'wide',
        active: true,
        values: { base: { width: 20, depth: 7 } },
        overrides: { base: { width: 20 } },
        provenance: {
          parameterFile: '.tau/parameters/main.ts.json',
          activeGroup: 'wide',
          groupName: 'wide',
        },
      },
      {
        name: 'narrow',
        active: false,
        values: { base: { width: 10, depth: 7 } },
        overrides: { base: { width: 10 } },
        provenance: {
          parameterFile: '.tau/parameters/main.ts.json',
          activeGroup: 'wide',
          groupName: 'narrow',
        },
      },
    ]);
  });

  it('should expose a typed model-load error for instanceof checks', async () => {
    await expect(
      loadModel({
        source: new Uint8Array([1, 2, 3]),
        format: 'step',
      }),
    ).rejects.toBeInstanceOf(GeoSpecModelLoadError);
  });

  it('should snapshot and freeze model-load diagnostics', () => {
    const diagnostics: GeometryDiagnostic[] = [
      {
        code: 'RUNTIME_UNAVAILABLE',
        message: 'runtime failed',
        severity: 'error',
        details: { reason: 'initial' },
      },
    ];

    const error = new GeoSpecModelLoadError(diagnostics);
    diagnostics[0]!.message = 'mutated after construction';
    (diagnostics[0]!.details as { reason: string }).reason = 'mutated';

    expect(Object.isFrozen(error.diagnostics)).toBe(true);
    expect(error.diagnostics[0]).toEqual({
      code: 'RUNTIME_UNAVAILABLE',
      message: 'runtime failed',
      severity: 'error',
      details: { reason: 'initial' },
    });
    expect(() => {
      (error.diagnostics as GeometryDiagnostic[]).push({
        code: 'EXTRA',
        message: 'should fail',
        severity: 'error',
      });
    }).toThrow(TypeError);
  });

  it('should wrap runtime factory failures in typed model-load diagnostics', async () => {
    await expect(
      loadModel({
        file: mainFile,
        runtime: async () => {
          throw new Error('factory offline');
        },
      }),
    ).rejects.toMatchObject({
      name: 'GeoSpecModelLoadError',
      diagnostics: [
        expect.objectContaining({
          code: 'RUNTIME_UNAVAILABLE',
          severity: 'error',
          message: 'factory offline',
        }),
      ],
    });
  });

  it('should create a configured model loader with shared defaults', async () => {
    const loadTriangle = createModelLoader({
      format: 'mesh-buffer',
    });

    const subject = await loadTriangle({
      source: {
        format: 'mesh-buffer',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      },
      unit: 'cm',
      parameters: { case: 'factory' },
    });

    expect(subject.provenance.unit).toBe('cm');
    expect(subject.provenance.parameters).toEqual({ case: 'factory' });
    expect(subject.mesh.stats.triangleCount).toBe(1);
  });

  it('should deep-clone parameter defaults and overrides for isolated test cases', () => {
    const entry = {
      activeGroup: 'wide',
      groups: {
        wide: { values: { base: { width: 20 } } },
      },
    };
    const defaults = { base: { width: 5, depth: 7 } };

    const resolved = params(entry, { defaults });
    (resolved.active.values as { base: { depth: number } }).base.depth = 99;
    (resolved.active.overrides as { base: { width: number } }).base.width = 99;

    expect(defaults).toEqual({ base: { width: 5, depth: 7 } });
    expect(entry.groups.wide.values).toEqual({ base: { width: 20 } });
    expect(params(entry, { defaults }).active.values).toEqual({ base: { width: 20, depth: 7 } });
  });

  it('should reject path-like parameter strings before JSON parsing', () => {
    expect(() => params('.tau/parameters/main.ts.json')).toThrow('pass parsed JSON or raw JSON text');
  });

  it('should reject runtime-backed unit and scale workarounds with structured diagnostics', async () => {
    const bytes = await createTriangleGlb();
    const runtime = {
      export: vi.fn(async () => ({
        success: true,
        data: { bytes, name: 'model.glb' },
        issues: [],
      })),
    };

    await expect(
      loadModel({
        file: mainFile,
        runtime,
        unit: 'm',
        scale: 0.001,
        coordinateSystem: 'z-up',
        sourceUnit: 'm',
      } as Parameters<typeof loadModel>[0]),
    ).rejects.toMatchObject({
      name: 'GeoSpecModelLoadError',
      diagnostics: [
        expect.objectContaining({
          code: 'GEOSPEC_INVALID_LOAD_MODEL_OPTIONS',
          severity: 'error',
          details: {
            forbidden: ['unit', 'sourceUnit', 'scale', 'coordinateSystem'],
          },
        }),
      ],
    });
    expect(runtime.export).not.toHaveBeenCalled();
  });
});
