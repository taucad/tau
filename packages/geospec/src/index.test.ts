import { describe, expect, it } from 'vitest';
import { runGeoSpecModule } from '#runner/index.js';
import type { VmFileSystem } from '@taucad/vm';
import type { GeometrySubject } from '#mesh/types.js';

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

const geometrySubjectModule = [
  'export const makeBox = () => ({',
  "  kind: 'geometry-subject',",
  '  provenance: {',
  "    source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'fixture-box' },",
  "    unit: 'mm',",
  "    loader: 'memory-fixture',",
  '  },',
  '  capabilities: [],',
  '  diagnostics: [],',
  '  mesh: {',
  "    format: 'mesh-buffer',",
  '    stats: {',
  '      boundingBox: {',
  '        size: [10, 20, 30],',
  '        center: [5, 10, 15],',
  '        primitives: [],',
  '      },',
  '      analyseConnectedComponents: () => ({ count: 1, clusters: [], gaps: [] }),',
  '      connectedComponents: () => 1,',
  '      watertight: true,',
  '      analyseWatertight: () => ({',
  '        watertight: true,',
  '        irregularEdges: 0,',
  '        openBoundaryEdges: 0,',
  '        nonManifoldEdges: 0,',
  '        irregularEdgeKindCounts: { openBoundary: 0, nonManifold: 0 },',
  '        irregularEdgeClusters: [],',
  '        totalEdges: 0,',
  '        irregularEdgeFraction: 0,',
  '        perPrimitive: [],',
  '      }),',
  '      vertexCount: 8,',
  '      meshCount: 1,',
  '      triangleCount: 12,',
  '      meshQuality: {',
  '        triangleCount: 12,',
  '        nonFiniteVertices: [],',
  '        degenerateTriangles: [],',
  '        duplicateFaces: [],',
  '        surfaceArea: 1,',
  '        signedVolume: 1,',
  '      },',
  '    },',
  '  },',
  '});',
].join('\n');

const createGeometrySubject = (sizeX: number): GeometrySubject =>
  ({
    kind: 'geometry-subject',
    provenance: {
      source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: `box-${sizeX}` },
      unit: 'mm',
      loader: 'memory-fixture',
    },
    capabilities: [],
    diagnostics: [],
    mesh: {
      format: 'mesh-buffer',
      stats: {
        boundingBox: {
          size: [sizeX, 20, 30],
          center: [sizeX / 2, 10, 15],
          primitives: [],
        },
        analyseConnectedComponents: () => ({ count: 1, clusters: [], gaps: [] }),
        connectedComponents: () => 1,
        watertight: true,
        analyseWatertight: () => ({
          watertight: true,
          irregularEdges: 0,
          openBoundaryEdges: 0,
          nonManifoldEdges: 0,
          irregularEdgeKindCounts: { openBoundary: 0, nonManifold: 0 },
          irregularEdgeClusters: [],
          totalEdges: 0,
          irregularEdgeFraction: 0,
          perPrimitive: [],
        }),
        vertexCount: 8,
        meshCount: 1,
        triangleCount: 12,
        meshQuality: {
          triangleCount: 12,
          nonFiniteVertices: [],
          degenerateTriangles: [],
          duplicateFaces: [],
          surfaceArea: 1,
          signedVolume: 1,
        },
      },
    },
  }) as unknown as GeometrySubject;

describe('runGeoSpecModule', () => {
  it('should collect vitest-style geometry assertions from an ESM module', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/model.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { makeBox } from './model';",
        "describe('bracket', () => {",
        "  it('has expected bounds', () => {",
        '    expectGeo(makeBox()).toHaveBoundingBox([0, 0, 0], [10, 20, 30]);',
        '  });',
        '});',
      ].join('\n'),
    );
    filesystem.setText('/project/model.ts', geometrySubjectModule);

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/model.geospec.ts',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tests).toHaveLength(1);
      expect(result.tests[0]).toMatchObject({
        suite: ['bracket'],
        name: 'has expected bounds',
        status: 'passed',
        diagnostics: [],
        assertions: [
          {
            kind: 'boundingBox',
            expected: {
              min: [0, 0, 0],
              max: [10, 20, 30],
            },
            passed: true,
            diagnostics: [],
          },
        ],
      });
      expect(result.tests[0]?.assertions[0]?.subject).toMatchObject({ kind: 'geometry-subject' });
      expect(result.bundle.dependencies).toEqual(
        expect.arrayContaining(['/project/model.geospec.ts', '/project/model.ts']),
      );
    }
  });

  it('should expose loadModel from geospec/model when a runner model loader is supplied', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/model.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('runner model loader', () => {",
        "  it('should load the model through the runner builtin', async () => {",
        "    const model = await loadModel({ file: 'main.ts', parameters: { width: 42 } });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 10 } });',
        '  });',
        '});',
      ].join('\n'),
    );

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/model.geospec.ts',
      modelLoader: async (options) => {
        expect(options).toEqual({
          file: 'main.ts',
          parameters: { width: 42 },
        });
        return {
          kind: 'geometry-subject',
          provenance: {
            source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'runner-box' },
            unit: 'mm',
            loader: 'in-memory',
          },
          capabilities: [],
          diagnostics: [],
          mesh: {
            format: 'mesh-buffer',
            stats: {
              boundingBox: {
                size: [10, 20, 30],
                center: [5, 10, 15],
                primitives: [],
              },
              analyseConnectedComponents: () => ({ count: 1, clusters: [], gaps: [] }),
              connectedComponents: () => 1,
              watertight: true,
              analyseWatertight: () => ({
                watertight: true,
                irregularEdges: 0,
                openBoundaryEdges: 0,
                nonManifoldEdges: 0,
                irregularEdgeKindCounts: { openBoundary: 0, nonManifold: 0 },
                irregularEdgeClusters: [],
                totalEdges: 0,
                irregularEdgeFraction: 0,
                perPrimitive: [],
              }),
              vertexCount: 8,
              meshCount: 1,
              triangleCount: 12,
              meshQuality: {
                triangleCount: 12,
                nonFiniteVertices: [],
                degenerateTriangles: [],
                duplicateFaces: [],
                surfaceArea: 1,
                signedVolume: 1,
              },
            },
          },
        } as unknown as GeometrySubject;
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.passed).toBe(true);
      expect(result.tests).toEqual([
        expect.objectContaining({
          suite: ['runner model loader'],
          name: 'should load the model through the runner builtin',
          status: 'passed',
        }),
      ]);
    }
  });

  it('should filter collected tests by Vitest-style testNamePattern regex', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/model.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { makeBox } from './model';",
        "describe('bracket dimensions', () => {",
        "  it('should check width', () => {",
        '    expectGeo(makeBox()).toHaveBoundingBox({ size: { x: 10 } });',
        '  });',
        "  it('should check height', () => {",
        '    expectGeo(makeBox()).toHaveBoundingBox({ size: { z: 30 } });',
        '  });',
        '});',
      ].join('\n'),
    );
    filesystem.setText('/project/model.ts', geometrySubjectModule);

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/model.geospec.ts',
      testNamePattern: 'width$',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tests.map((test) => test.name)).toEqual(['should check width']);
      expect(result.passed).toBe(true);
    }
  });

  it('should not execute tests excluded by a negative-lookahead testNamePattern', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/model.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('planetary gearbox assembly', () => {",
        "  it('should check carrier spacing', async () => {",
        "    const model = await loadModel({ file: 'main.ts', parameters: { size: 10 } });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 10 } });',
        '  });',
        "  it('has correctly phased gear teeth (no meshing interference)', async () => {",
        "    await loadModel({ file: 'main.ts', parameters: { size: 999 } });",
        '    throw new Error("known failing check should not run");',
        '  });',
        '});',
      ].join('\n'),
    );
    const loadCalls: unknown[] = [];

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/model.geospec.ts',
      testNamePattern: '^(?!.*no meshing interference).*',
      modelLoader: async (options) => {
        loadCalls.push(options);
        return createGeometrySubject(10);
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tests.map((test) => test.name)).toEqual(['should check carrier spacing']);
      expect(result.passed).toBe(true);
    }
    expect(loadCalls).toEqual([{ file: 'main.ts', parameters: { size: 10 } }]);
  });

  it('should fail clearly when testNamePattern is an invalid regular expression', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/model.geospec.ts',
      [
        "import { describe, it } from 'geospec';",
        "describe('box', () => {",
        "  it('should not execute', () => {});",
        '});',
      ].join('\n'),
    );

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/model.geospec.ts',
      testNamePattern: '[',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual([
        expect.objectContaining({
          code: 'INVALID_GEOSPEC_TEST_NAME_PATTERN',
          message: 'testNamePattern is not a valid JavaScript regular expression.',
          severity: 'error',
          type: 'runtime',
        }),
      ]);
    }
  });

  it('should return structured VM issues when the test module fails during execution', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/model.geospec.ts',
      [
        "import { expectGeo } from 'geospec';",
        "expectGeo({ kind: 'box' }).toHaveBoundingBox([0, 0, 0], [1, 1, 1]);",
      ].join('\n'),
    );

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/model.geospec.ts',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual([
        {
          code: 'RUNTIME',
          message: 'expectGeo() must be called inside it().',
          severity: 'error',
          type: 'runtime',
        },
      ]);
    }
  });

  it('should collect async test failures as structured test diagnostics', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/model.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { makeBox } from './model';",
        "describe('async geometry', () => {",
        "  it('fails after awaiting', async () => {",
        '    await Promise.resolve();',
        '    expectGeo(makeBox()).toHaveBoundingBox([0, 0, 0], [10, 20, 30]);',
        '    throw new Error("bad parameter case");',
        '  });',
        '});',
      ].join('\n'),
    );
    filesystem.setText('/project/model.ts', geometrySubjectModule);

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/model.geospec.ts',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.passed).toBe(false);
      expect(result.tests).toHaveLength(1);
      expect(result.tests[0]).toMatchObject({
        suite: ['async geometry'],
        name: 'fails after awaiting',
        status: 'failed',
        assertions: [
          {
            kind: 'boundingBox',
            expected: { min: [0, 0, 0], max: [10, 20, 30] },
            passed: true,
            diagnostics: [],
          },
        ],
        diagnostics: [
          {
            code: 'TEST_FAILED',
            message: 'bad parameter case',
            severity: 'error',
          },
        ],
      });
      expect(result.tests[0]?.assertions[0]?.subject).toMatchObject({ kind: 'geometry-subject' });
    }
  });

  it('should diagnose direct GeometrySubject measurement method misuse', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/model.geospec.ts',
      [
        "import { describe, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('authoring mistake', () => {",
        "  it('should report matcher guidance for direct volume calls', async () => {",
        "    const model = await loadModel({ file: 'main.ts' });",
        '    model.volume();',
        '  });',
        '});',
      ].join('\n'),
    );

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/model.geospec.ts',
      modelLoader: async () =>
        ({
          kind: 'geometry-subject',
          provenance: {
            source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'runner-box' },
            unit: 'mm',
            loader: 'in-memory',
          },
          capabilities: [],
          diagnostics: [],
          mesh: {
            format: 'mesh-buffer',
            stats: {
              boundingBox: {
                size: [10, 20, 30],
                center: [5, 10, 15],
                primitives: [],
              },
              analyseConnectedComponents: () => ({ count: 1, clusters: [], gaps: [] }),
              connectedComponents: () => 1,
              watertight: true,
              analyseWatertight: () => ({
                watertight: true,
                irregularEdges: 0,
                openBoundaryEdges: 0,
                nonManifoldEdges: 0,
                irregularEdgeKindCounts: { openBoundary: 0, nonManifold: 0 },
                irregularEdgeClusters: [],
                totalEdges: 0,
                irregularEdgeFraction: 0,
                perPrimitive: [],
              }),
              vertexCount: 8,
              meshCount: 1,
              triangleCount: 12,
              meshQuality: {
                triangleCount: 12,
                nonFiniteVertices: [],
                degenerateTriangles: [],
                duplicateFaces: [],
                surfaceArea: 1,
                signedVolume: 1,
              },
            },
          },
        }) as unknown as GeometrySubject,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.passed).toBe(false);
      expect(result.tests[0]?.diagnostics).toEqual([
        expect.objectContaining({
          code: 'GEOSPEC_SUBJECT_API_MISUSE',
          message: 'GeoSpec GeometrySubject does not expose model.volume().',
          suggestion: 'Use expectGeo(model).toHaveVolume({ value, tolerance }) instead of reading model.volume().',
        }),
      ]);
    }
  });

  it('should collect skipped tests without executing their callbacks', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/model.geospec.ts',
      [
        "import { describe, it } from 'geospec';",
        "describe('skip suite', () => {",
        "  it.skip('does not run', () => { throw new Error('nope'); });",
        '});',
      ].join('\n'),
    );

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/model.geospec.ts',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.passed).toBe(true);
      expect(result.tests).toEqual([
        {
          suite: ['skip suite'],
          name: 'does not run',
          assertions: [],
          status: 'skipped',
          diagnostics: [],
        },
      ]);
    }
  });

  it('should re-execute the same test module on repeated runs', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/model.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { makeBox } from './model';",
        "describe('repeatable', () => {",
        "  it('collects every run', () => {",
        '    expectGeo(makeBox()).toHaveBoundingBox([0, 0, 0], [10, 20, 30]);',
        '  });',
        '});',
      ].join('\n'),
    );
    filesystem.setText('/project/model.ts', geometrySubjectModule);

    const first = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/model.geospec.ts',
    });
    const second = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/model.geospec.ts',
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.tests).toHaveLength(1);
      const firstTest = first.tests[0];
      const firstAssertion = firstTest?.assertions[0];
      expect(firstTest).toBeDefined();
      expect(firstAssertion).toBeDefined();
      if (firstTest === undefined || firstAssertion === undefined) {
        return;
      }
      expect(second.tests).toEqual([
        expect.objectContaining({
          suite: firstTest.suite,
          name: firstTest.name,
          status: firstTest.status,
          diagnostics: firstTest.diagnostics,
          assertions: [
            expect.objectContaining({
              kind: firstAssertion.kind,
              expected: firstAssertion.expected,
              passed: firstAssertion.passed,
              diagnostics: firstAssertion.diagnostics,
            }),
          ],
        }),
      ]);
    }
  });

  it('should keep concurrent model-loader bindings isolated per invocation', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/first.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('first invocation', () => {",
        "  it('should use the first loader', async () => {",
        "    const model = await loadModel({ file: 'main.ts', parameters: { width: 10 } });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 10 } });',
        '  });',
        '});',
      ].join('\n'),
    );
    filesystem.setText(
      '/project/second.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "import { loadModel } from 'geospec/model';",
        "describe('second invocation', () => {",
        "  it('should use the second loader', async () => {",
        "    const model = await loadModel({ file: 'main.ts', parameters: { width: 20 } });",
        '    expectGeo(model).toHaveBoundingBox({ size: { x: 20 } });',
        '  });',
        '});',
      ].join('\n'),
    );

    const [first, second] = await Promise.all([
      runGeoSpecModule({
        filesystem,
        projectPath: '/project',
        entryPath: '/project/first.geospec.ts',
        modelLoader: async (options) => {
          await Promise.resolve();
          expect(options.parameters).toEqual({ width: 10 });
          return createGeometrySubject(10);
        },
      }),
      runGeoSpecModule({
        filesystem,
        projectPath: '/project',
        entryPath: '/project/second.geospec.ts',
        modelLoader: async (options) => {
          expect(options.parameters).toEqual({ width: 20 });
          return createGeometrySubject(20);
        },
      }),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.passed).toBe(true);
      expect(second.passed).toBe(true);
      expect(first.tests[0]?.suite).toEqual(['first invocation']);
      expect(second.tests[0]?.suite).toEqual(['second invocation']);
    }
  });

  it('should fail unsupported geometry subjects with actionable diagnostics', async () => {
    const filesystem = new MemoryFileSystem();
    filesystem.setText(
      '/project/model.geospec.ts',
      [
        "import { describe, expectGeo, it } from 'geospec';",
        "describe('wrong subject', () => {",
        "  it('reports the authoring error', () => {",
        "    expectGeo({ kind: 'box' }).toBeWatertight();",
        '  });',
        '});',
      ].join('\n'),
    );

    const result = await runGeoSpecModule({
      filesystem,
      projectPath: '/project',
      entryPath: '/project/model.geospec.ts',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.passed).toBe(false);
      expect(result.tests).toEqual([
        expect.objectContaining({
          suite: ['wrong subject'],
          name: 'reports the authoring error',
          status: 'failed',
          assertions: [
            expect.objectContaining({
              kind: 'watertight',
              passed: false,
              diagnostics: [
                expect.objectContaining({
                  code: 'UNSUPPORTED_GEOMETRY_SUBJECT',
                  message: 'toBeWatertight requires a GeoSpec GeometrySubject loaded from geometry evidence.',
                  severity: 'error',
                  suggestion:
                    'Use loadMesh(...) or loadModel(...) and pass the returned GeometrySubject to expectGeo(...).',
                }),
              ],
            }),
          ],
          diagnostics: [
            expect.objectContaining({
              code: 'UNSUPPORTED_GEOMETRY_SUBJECT',
              message: 'toBeWatertight requires a GeoSpec GeometrySubject loaded from geometry evidence.',
              severity: 'error',
              suggestion:
                'Use loadMesh(...) or loadModel(...) and pass the returned GeometrySubject to expectGeo(...).',
            }),
          ],
        }),
      ]);
    }
  });
});
