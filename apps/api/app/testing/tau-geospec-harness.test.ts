// @vitest-environment node
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { Engine } from '@taucad/geospec-engine-native/node';
import { describe, expect, it, vi } from 'vitest';
import { runTauGeoSpecTests } from '#testing/tau-geospec-harness.js';
import type { TauModelRendererOutput } from '#testing/tau-geospec-harness.js';
import { GeoSpecModelLoadError } from 'geospec/model';

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

const boxIndices = [
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
] as const;

const createGeometrySource = async (sizeX: number, sizeY = 1, sizeZ = 1): Promise<TauModelRendererOutput> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setBuffer(buffer)
    .setArray(
      new Float32Array(
        [
          0,
          0,
          0,
          sizeX,
          0,
          0,
          sizeX,
          sizeY,
          0,
          0,
          sizeY,
          0,
          0,
          0,
          sizeZ,
          sizeX,
          0,
          sizeZ,
          sizeX,
          sizeY,
          sizeZ,
          0,
          sizeY,
          sizeZ,
        ].map((millimeters) => millimeters / 1000),
      ),
    );
  const indices = document
    .createAccessor()
    .setType(Accessor.Type['SCALAR']!)
    .setBuffer(buffer)
    .setArray(new Uint32Array(boxIndices));
  const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh('box').addPrimitive(primitive);
  document.createScene('scene').addChild(document.createNode('box').setMesh(mesh));
  return { format: 'glb', source: await new WebIO().writeBinary(document), name: 'box' };
};

const brepFixture = resolve(
  import.meta.dirname,
  '../../../../packages/geospec-engine/fixtures/contact/valve-seat-cone-positive/model.step',
);

describe('runTauGeoSpecTests', () => {
  it('releases renderer results that arrive after a test timeout', async () => {
    const pending = Promise.withResolvers<TauModelRendererOutput>();
    const entered = Promise.withResolvers<void>();
    const geometry = await createGeometrySource(1);
    const release = vi.spyOn(Engine.prototype, 'releaseSubject');
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      'late.geospec.ts',
      "import { it } from 'geospec'; import { loadModel } from 'geospec/model'; it('late', async () => { await loadModel({ file: 'main.ts' }); });",
    );
    const running = runTauGeoSpecTests({
      filesystem,
      entryPaths: ['late.geospec.ts'],
      testTimeout: 5,
      renderer: async () => {
        entered.resolve();
        return pending.promise;
      },
    });
    try {
      await entered.promise;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      pending.resolve(geometry);
      const result = await running;
      expect(result.failures).toHaveLength(1);
      expect(release).toHaveBeenCalledTimes(1);
      const encoded: unknown = release.mock.results[0]?.value;
      if (!(encoded instanceof Uint8Array)) {
        throw new TypeError('The native release response must be encoded bytes.');
      }
      const response: unknown = JSON.parse(new TextDecoder().decode(encoded));
      expect(response).toMatchObject({ result: { released: true } });
    } finally {
      pending.resolve(geometry);
      await running;
      release.mockRestore();
    }
  });

  it('releases renderer-created subjects even after a failed assertion', async () => {
    const release = vi.spyOn(Engine.prototype, 'releaseSubject');
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      'cleanup.geospec.ts',
      "import { it, expectGeo } from 'geospec'; import { loadModel } from 'geospec/model'; it('width', async () => { expectGeo(await loadModel({ file: 'main.ts' })).toHaveBoundingBox({ size: { x: 99 }, tolerance: 0.01 }); });",
    );
    try {
      const result = await runTauGeoSpecTests({
        filesystem,
        entryPaths: ['cleanup.geospec.ts'],
        renderer: async () => createGeometrySource(1),
      });
      expect(result.failures).toHaveLength(1);
      expect(release).toHaveBeenCalledTimes(1);
      const encoded: unknown = release.mock.results[0]?.value;
      if (!(encoded instanceof Uint8Array)) {
        throw new TypeError('The native release response must be encoded bytes.');
      }
      const response: unknown = JSON.parse(new TextDecoder().decode(encoded));
      expect(response).toMatchObject({ result: { released: true } });
    } finally {
      release.mockRestore();
    }
  });

  it('uses shared missing-file accounting', async () => {
    const result = await runTauGeoSpecTests({
      filesystem: new MemoryFileSystem(),
      entryPaths: [],
      renderer: async () => createGeometrySource(1),
    });
    expect(result).toMatchObject({
      passed: 0,
      total: 0,
      passes: [],
      failures: [{ id: 'missing_geospec_file' }, { id: 'NO_MATCHING_GEOSPEC_TESTS' }],
      accounting: { discovered: 0, selected: 0, completed: 0, requestedFiles: [], completedFiles: [] },
    });
  });

  it('preserves every original renderer failure as one failed test', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      'failure.geospec.ts',
      "import { it } from 'geospec'; import { loadModel } from 'geospec/model'; it('export', async () => { await loadModel({ file: 'main.ts' }); });",
    );
    const diagnostics = [
      { code: 'BUILD_FAILED', severity: 'error', message: 'Compile failed', details: { file: 'main.ts' } },
      { code: 'GEOMETRY_INVALID', severity: 'warning', message: 'Open shell', spatial: { center: [1, 2, 3] } },
    ] as const;
    const result = await runTauGeoSpecTests({
      filesystem,
      entryPaths: ['failure.geospec.ts'],
      renderer: async () => {
        throw new GeoSpecModelLoadError(diagnostics);
      },
    });
    expect(result).toMatchObject({
      passed: 0,
      total: 1,
      failures: [{ targetFile: 'failure.geospec.ts', diagnostics }],
    });
    expect(result.failures[0]?.reason).toBe('Compile failed\nOpen shell');
  });

  it('should group all assertion results under the GeoSpec test file', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      'main.geospec.ts',
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

    const geometry = await createGeometrySource(800, 600, 750);
    const result = await runTauGeoSpecTests({
      filesystem,
      entryPaths: ['main.geospec.ts'],
      renderer: async () => geometry,
    });

    expect(result.failures).toEqual([]);
    expect(result.passes).toHaveLength(2);
    expect(result.passes.map((pass) => pass.targetFile)).toEqual(['main.geospec.ts', 'main.geospec.ts']);
    expect(result.passes.map((pass) => pass.requirement)).toEqual([
      'table geometry > should have the expected width',
      'table geometry > should be watertight',
    ]);
    expect(result.accounting).toMatchObject({
      discovered: 2,
      selected: 2,
      completed: 2,
      passed: 2,
      failed: 0,
      requestedFiles: ['main.geospec.ts'],
      completedFiles: ['main.geospec.ts'],
      notRunFiles: [],
      discoveryComplete: true,
      cancelled: false,
    });
    const lineage = result.lineage?.[0]?.lineage;
    expect(lineage?.modules).toMatchObject([
      {
        entryPath: 'main.geospec.ts',
        files: {
          'main.geospec.ts': `sha256:${createHash('sha256')
            .update(await filesystem.readFile('main.geospec.ts'))
            .digest('hex')}`,
        },
        consistent: true,
      },
    ]);
    if (!(geometry.source instanceof Uint8Array)) {
      throw new TypeError('The GLB fixture must expose its original encoded bytes.');
    }
    expect(lineage?.loads).toHaveLength(2);
    for (const load of lineage?.loads ?? []) {
      expect(load.evidence).toMatchObject({
        status: 'complete',
        parameters: {},
        artifacts: [
          {
            name: 'main.scad',
            sha256: createHash('sha256').update(geometry.source).digest('hex'),
            byteLength: geometry.source.byteLength,
          },
        ],
      });
      expect(load.evidence).not.toHaveProperty('sourceRevision');
      expect(load.evidence).not.toHaveProperty('sourcePath');
      expect(load.evidence?.artifacts[0]).not.toHaveProperty('sourcePath');
    }
  });

  it('should filter Tau GeoSpec results by Vitest-style testNamePattern regex', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      'main.geospec.ts',
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

    const result = await runTauGeoSpecTests({
      filesystem,
      entryPaths: ['main.geospec.ts'],
      testNamePattern: 'width$',
      renderer: async () => createGeometrySource(800, 600, 750),
    });

    expect(result.failures).toEqual([]);
    expect(result.passes.map((pass) => pass.requirement)).toEqual(['filtered table geometry > should check width']);
    expect(result.total).toBe(1);
    expect(result.accounting).toMatchObject({ selected: 1, completed: 1 });
  });

  it('should not execute Tau GeoSpec tests excluded by negative-lookahead testNamePattern', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      'main.geospec.ts',
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
      entryPaths: ['main.geospec.ts'],
      testNamePattern: '^(?!.*no meshing interference).*',
      renderer: async (input) => {
        calls.push(input);
        return createGeometrySource(10);
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
      'main.geospec.ts',
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
      entryPaths: ['main.geospec.ts'],
      testNamePattern: 'height',
      renderer: async () => createGeometrySource(800),
    });

    expect(result.passed).toBe(0);
    expect(result.total).toBe(0);
    expect(result.accounting).toMatchObject({ selected: 0, completed: 0 });
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
      'first.geospec.ts',
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
      'second.geospec.ts',
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
        entryPaths: ['first.geospec.ts'],
        renderer: async (input) => {
          await Promise.resolve();
          expect(input.parameters).toEqual({ width: 10 });
          return createGeometrySource(10);
        },
      }),
      runTauGeoSpecTests({
        filesystem,
        entryPaths: ['second.geospec.ts'],
        renderer: async (input) => {
          expect(input.parameters).toEqual({ width: 20 });
          return createGeometrySource(20);
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
      'main.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('brep feature checks', () => {",
        "  it('should validate exact feature evidence', async () => {",
        "    const model = await loadModel({ file: 'main.ts', format: 'step' });",
        '    expectGeo(model).toHavePlanarFace({ normal: { x: 0, y: 0, z: 1 }, offset: 6, area: { greaterThan: 270 }, tolerance: 0.05 });',
        "    expectGeo(model).toHaveCylindricalFace({ radius: 16, axis: 'z', tolerance: 0.05 });",
        "    expectGeo(model).toHaveCircularHole({ diameter: 20, through: false, axis: 'z', center: { x: 0, y: 0 }, tolerance: 0.05 });",
        "    expectGeo(model).toHaveChamferFeature({ distance: 3, selection: 'revolved chamfer (axis z)', tolerance: 0.05 });",
        '    expectGeo(model).toHaveMinimumWallThickness({ value: { greaterThanOrEqual: 3 }, tolerance: 0.05 });',
        '  });',
        '});',
      ].join('\n'),
    );

    const rendererCalls: Array<{ file: string; format?: string }> = [];
    const result = await runTauGeoSpecTests({
      filesystem,
      entryPaths: ['main.geospec.ts'],
      renderer: async (input) => {
        rendererCalls.push(input);
        return {
          source: new Uint8Array(await readFile(brepFixture)),
          format: 'step',
          name: 'valve-seat-cone-positive',
        };
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
