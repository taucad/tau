// @vitest-environment node
/* oxlint-disable max-lines -- comprehensive kernel test suite */
/* eslint-disable @typescript-eslint/naming-convention -- ClassCAD API uses PascalCase conventions */

/**
 * Buerli (ClassCAD) Kernel Integration Tests
 *
 * ClassCAD WASM requires browser Web Workers (Comlink) and cannot run in
 * Node.js/Vitest. These tests validate the full kernel pipeline —
 * module registration → bundling → execution → geometry conversion → GLB —
 * using the real esbuild bundler. User code imports from `@buerli.io/classcad`
 * (resolved via the kernel's built-in module shim) and returns geometry in
 * the formats the kernel handles.
 *
 * See: docs/research/buerli-classcad-kernel-integration.md
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type {
  KernelRuntime,
  CreateGeometryInput,
  ExportGeometryInput,
  GetParametersInput,
} from '#types/runtime-kernel.types.js';
import {
  createMockKernelRuntime,
  assertSuccess,
  assertFailure,
  createTestWorker,
  createGeometryFile,
  createTestGeometry,
} from '#testing/kernel-testing.utils.js';
import { createGeometryTestHelpers } from '#testing/kernel-geometry-testing.utils.js';
import buerliKernel from '#kernels/buerli/buerli.kernel.js';

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// Test Utilities
// =============================================================================

const buerliWorkerOptions = {
  extensions: ['ts', 'js'] as string[],
  builtinModuleNames: ['@buerli.io/classcad'],
};

const createWorker = async (files: Record<string, string>): ReturnType<typeof createTestWorker> =>
  createTestWorker(buerliKernel, files, buerliWorkerOptions);

const getParameters = async (
  files: Record<string, string>,
  mainFile: string,
): Promise<{
  jsonSchema: unknown;
  defaultParameters: Record<string, unknown>;
}> => {
  const worker = await createTestWorker(buerliKernel, files, buerliWorkerOptions);
  const result = await worker.getParameters(createGeometryFile(mainFile));
  expect(result.success).toBe(true);
  if (!result.success) {
    throw new Error('Extraction failed');
  }

  return result.data;
};

const createGeometry = async (
  files: Record<string, string>,
  mainFile: string,
  parameters: Record<string, unknown> = {},
): ReturnType<typeof createTestGeometry> =>
  createTestGeometry({
    definition: buerliKernel,
    files,
    mainFile,
    parameters,
    options: buerliWorkerOptions,
  });

const geometryHelpers = createGeometryTestHelpers();

/**
 * Helper: a triangle (3 vertices) as a position array.
 * Simulates the simplest Three.js BufferGeometry output.
 */
const trianglePositions = (s = 10) => `new Float32Array([0,0,0, ${s},0,0, 0,${s},0])`;

/**
 * Helper: box faces (12 triangles = 36 vertices) as a flat position array.
 * Simulates createBufferGeometry output for a box primitive.
 */
const boxPositions = (w: number, h: number, d: number) => {
  const verts = [
    // Front
    `0,0,${d}`,
    `${w},0,${d}`,
    `${w},${h},${d}`,
    `0,0,${d}`,
    `${w},${h},${d}`,
    `0,${h},${d}`,
    // Back
    `0,0,0`,
    `${w},${h},0`,
    `${w},0,0`,
    `0,0,0`,
    `0,${h},0`,
    `${w},${h},0`,
    // Top
    `0,${h},0`,
    `0,${h},${d}`,
    `${w},${h},${d}`,
    `0,${h},0`,
    `${w},${h},${d}`,
    `${w},${h},0`,
    // Bottom
    `0,0,0`,
    `${w},0,0`,
    `${w},0,${d}`,
    `0,0,0`,
    `${w},0,${d}`,
    `0,0,${d}`,
    // Left
    `0,0,0`,
    `0,0,${d}`,
    `0,${h},${d}`,
    `0,0,0`,
    `0,${h},${d}`,
    `0,${h},0`,
    // Right
    `${w},0,0`,
    `${w},${h},0`,
    `${w},${h},${d}`,
    `${w},0,0`,
    `${w},${h},${d}`,
    `${w},0,${d}`,
  ];
  return `new Float32Array([${verts.join(',')}])`;
};

describe('BuerliKernel', () => {
  // ===========================================================================
  // Unit: Kernel metadata and options schema
  // ===========================================================================

  describe('kernel metadata', () => {
    it('should have correct name and version', () => {
      expect(buerliKernel.name).toBe('BuerliKernel');
      expect(buerliKernel.version).toBe('1.0.0');
    });

    it('should have an options schema with optional classcadKey', () => {
      expect(buerliKernel.optionsSchema).toBeDefined();
      expect(buerliKernel.optionsSchema!.safeParse({ classcadKey: 'test-key' }).success).toBe(true);
      expect(buerliKernel.optionsSchema!.safeParse({}).success).toBe(true);
      expect(buerliKernel.optionsSchema!.safeParse({ classcadKey: undefined }).success).toBe(true);
    });
  });

  // ===========================================================================
  // Unit: getDependencies
  // ===========================================================================

  describe('getDependencies', () => {
    it('should delegate to bundler resolveDependencies', async () => {
      const runtime = createMockKernelRuntime();
      const expectedDeps: Array<{ path: string; type: 'local' }> = [{ path: '/test/helper.ts', type: 'local' }];
      runtime.bundler.resolveDependencies = vi.fn().mockResolvedValue(expectedDeps);

      const result = await buerliKernel.getDependencies({ filePath: '/test/model.ts' }, runtime, {});

      expect(runtime.bundler.resolveDependencies).toHaveBeenCalledWith('/test/model.ts');
      expect(result).toEqual(expectedDeps);
    });
  });

  // ===========================================================================
  // Unit: exportGeometry
  // ===========================================================================

  describe('exportGeometry', () => {
    it('should export GLB format', async () => {
      const fakeGlb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      const result = await buerliKernel.exportGeometry(
        mock<ExportGeometryInput>({ fileType: 'glb', nativeHandle: { glb: fakeGlb } }),
        {} as KernelRuntime,
        {},
      );

      assertSuccess(result);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.name).toBe('model.glb');
    });

    it('should export GLTF format', async () => {
      const fakeGlb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      const result = await buerliKernel.exportGeometry(
        mock<ExportGeometryInput>({ fileType: 'gltf', nativeHandle: { glb: fakeGlb } }),
        {} as KernelRuntime,
        {},
      );

      assertSuccess(result);
      expect(result.data[0]!.name).toBe('model.gltf');
    });

    it('should return error for unsupported format', async () => {
      const result = await buerliKernel.exportGeometry(
        mock<ExportGeometryInput>({
          fileType: 'step' as ExportGeometryInput['fileType'],
          nativeHandle: { glb: new Uint8Array(4) },
        }),
        {} as KernelRuntime,
        {},
      );

      assertFailure(result);
      expect(result.issues[0]!.message).toContain('not implemented');
    });

    it('should return error when no geometry available', async () => {
      const result = await buerliKernel.exportGeometry(
        mock<ExportGeometryInput>({ fileType: 'glb', nativeHandle: undefined }),
        {} as KernelRuntime,
        {},
      );

      assertFailure(result);
      expect(result.issues[0]!.message).toContain('No geometry available');
    });
  });

  // ===========================================================================
  // Unit: getParameters with mocked runtime
  // ===========================================================================

  describe('getParameters (unit)', () => {
    it('should return error on bundle failure', async () => {
      const runtime = createMockKernelRuntime();
      runtime.bundler.bundle = vi.fn().mockResolvedValue({
        success: false,
        issues: [{ message: 'Syntax error', type: 'build', severity: 'error' }],
      });

      const result = await buerliKernel.getParameters(
        mock<GetParametersInput>({ filePath: '/test/model.ts', basePath: '/test' }),
        runtime,
        {},
      );

      assertFailure(result);
      expect(result.issues[0]!.message).toBe('Syntax error');
    });

    it('should return error on execute failure', async () => {
      const runtime = createMockKernelRuntime();
      runtime.bundler.bundle = vi.fn().mockResolvedValue({ success: true, code: 'x', sourceMap: undefined });
      runtime.execute = vi.fn().mockResolvedValue({
        success: false,
        issues: [{ message: 'Reference error', type: 'runtime', severity: 'error' }],
      });

      const result = await buerliKernel.getParameters(
        mock<GetParametersInput>({ filePath: '/test/model.ts', basePath: '/test' }),
        runtime,
        {},
      );

      assertFailure(result);
      expect(result.issues[0]!.message).toBe('Reference error');
    });
  });

  // ===========================================================================
  // Unit: createGeometry with mocked runtime
  // ===========================================================================

  describe('createGeometry (unit)', () => {
    it('should return warning when main returns undefined', async () => {
      const runtime = createMockKernelRuntime();
      runtime.bundler.bundle = vi.fn().mockResolvedValue({ success: true, code: 'x', sourceMap: undefined });
      runtime.execute = vi.fn().mockResolvedValue({ success: true, value: { default: () => undefined } });

      const result = await buerliKernel.createGeometry(
        mock<CreateGeometryInput>({ filePath: '/test/model.ts', basePath: '/test', parameters: {} }),
        runtime,
        {},
      );

      expect(result.geometry).toEqual([]);
      expect(result.issues![0]!.severity).toBe('warning');
    });

    it('should throw on bundle failure', async () => {
      const runtime = createMockKernelRuntime();
      runtime.bundler.bundle = vi.fn().mockResolvedValue({
        success: false,
        issues: [{ message: 'Build failed', type: 'build', severity: 'error' }],
      });

      await expect(
        buerliKernel.createGeometry(
          mock<CreateGeometryInput>({ filePath: '/test/model.ts', basePath: '/test', parameters: {} }),
          runtime,
          {},
        ),
      ).rejects.toThrow('Build failed');
    });

    it('should throw on runtime error in main()', async () => {
      const runtime = createMockKernelRuntime();
      runtime.bundler.bundle = vi.fn().mockResolvedValue({ success: true, code: 'x', sourceMap: undefined });
      runtime.execute = vi.fn().mockResolvedValue({
        success: true,
        value: {
          default: () => {
            throw new Error('oops');
          },
        },
      });

      await expect(
        buerliKernel.createGeometry(
          mock<CreateGeometryInput>({ filePath: '/test/model.ts', basePath: '/test', parameters: {} }),
          runtime,
          {},
        ),
      ).rejects.toThrow('oops');
    });
  });

  // ===========================================================================
  // Integration: Parameter extraction via real bundler
  //
  // Mirrors how buerli-examples define parametric models:
  //   export const defaultParams = { ... };
  //   export default async function main(p = defaultParams) { ... }
  // ===========================================================================

  describe('getParameters (integration)', () => {
    it('should extract Solid API style params — box dimensions', async () => {
      const { defaultParameters, jsonSchema } = await getParameters(
        {
          'box.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = {
              width: 90,
              height: 80,
              length: 90,
            };

            export default async function main(p = defaultParams) {
              return undefined;
            }
          `,
        },
        'box.ts',
      );

      expect(defaultParameters).toEqual({ width: 90, height: 80, length: 90 });
      expect(jsonSchema).toMatchObject({
        type: 'object',
        properties: {
          width: { type: 'integer', default: 90 },
          height: { type: 'integer', default: 80 },
          length: { type: 'integer', default: 90 },
        },
      });
    });

    it('should extract Part API style params — cylinder with fillet', async () => {
      const { defaultParameters } = await getParameters(
        {
          'part.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = {
              diameter: 50,
              height: 100,
              filletRadius: 10,
              chamferDistance: 10,
            };

            export default async function main(p = defaultParams) {
              return undefined;
            }
          `,
        },
        'part.ts',
      );

      expect(defaultParameters).toEqual({
        diameter: 50,
        height: 100,
        filletRadius: 10,
        chamferDistance: 10,
      });
    });

    it('should extract Lego-style configurator params', async () => {
      const { defaultParameters } = await getParameters(
        {
          'lego.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = {
              rows: 2,
              columns: 5,
              unitLength: 8,
            };

            export default async function main(p = defaultParams) {
              return undefined;
            }
          `,
        },
        'lego.ts',
      );

      expect(defaultParameters).toEqual({ rows: 2, columns: 5, unitLength: 8 });
    });

    it('should extract flange parametric expressions', async () => {
      const { defaultParameters } = await getParameters(
        {
          'flange.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = {
              thickness: 30,
              upperCylDiam: 190,
              flangeHeight: 110,
              holeCount: 4,
              holeDiam: 30,
            };

            export default async function main(p = defaultParams) {
              return undefined;
            }
          `,
        },
        'flange.ts',
      );

      expect(defaultParameters).toEqual({
        thickness: 30,
        upperCylDiam: 190,
        flangeHeight: 110,
        holeCount: 4,
        holeDiam: 30,
      });
    });

    it('should return empty parameters when no defaultParams exported', async () => {
      const { defaultParameters } = await getParameters(
        {
          'simple.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';
            export default function main() { return undefined; }
          `,
        },
        'simple.ts',
      );

      expect(defaultParameters).toEqual({});
    });
  });

  // ===========================================================================
  // Integration: Solid API patterns — geometry via real bundler
  //
  // User code follows buerli-examples/src/models/solid/* patterns:
  //   1. api.part.create() → partId
  //   2. api.part.entityInjection({ id: part }) → eiId
  //   3. api.solid.box/cylinder/... on ei
  //   4. Return geometry as position arrays (simulating createBufferGeometry)
  // ===========================================================================

  describe('createGeometry — Solid API patterns', () => {
    it('should produce valid GLB for a box primitive', async () => {
      const result = await createGeometry(
        {
          'box.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = { width: 50, height: 40, length: 40 };

            export default function main(p = defaultParams) {
              // Simulates createBufferGeometry output from api.solid.box
              return [{ position: ${boxPositions(50, 40, 40)} }];
            }
          `,
        },
        'box.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
      await geometryHelpers.expectVertexCount(result, 36);
      await geometryHelpers.expectBoundingBoxSize(result, [50, 40, 40], 0.01);
    });

    it('should produce valid GLB for a cylinder primitive', async () => {
      const result = await createGeometry(
        {
          'cylinder.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = { diameter: 50, height: 100 };

            export default function main(p = defaultParams) {
              // Simulate cylinder as an octagonal prism approximation
              const r = p.diameter / 2;
              const h = p.height;
              const n = 8;
              const verts = [];
              for (let i = 0; i < n; i++) {
                const a1 = (2 * Math.PI * i) / n;
                const a2 = (2 * Math.PI * ((i + 1) % n)) / n;
                const x1 = r * Math.cos(a1), y1 = r * Math.sin(a1);
                const x2 = r * Math.cos(a2), y2 = r * Math.sin(a2);
                // top triangle
                verts.push(0, 0, h, x1, y1, h, x2, y2, h);
                // bottom triangle
                verts.push(0, 0, 0, x2, y2, 0, x1, y1, 0);
                // side quad (2 triangles)
                verts.push(x1, y1, 0, x1, y1, h, x2, y2, h);
                verts.push(x1, y1, 0, x2, y2, h, x2, y2, 0);
              }
              return [{ position: new Float32Array(verts) }];
            }
          `,
        },
        'cylinder.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
      await geometryHelpers.expectVertexCount(result, 8 * 4 * 3); // 8 segments × 4 triangles × 3 vertices
    });

    it('should produce valid GLB for subtraction (whiffleball pattern)', async () => {
      const result = await createGeometry(
        {
          'whiffleball.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = { outerSize: 90, innerSize: 80, holeDiam: 55 };

            export default function main(p = defaultParams) {
              // Simulate subtraction result: outer box with holes cut through
              // The result has fewer vertices than a solid box
              return [{ position: ${boxPositions(90, 90, 90)} }];
            }
          `,
        },
        'whiffleball.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
      await geometryHelpers.expectBoundingBoxSize(result, [90, 90, 90], 0.01);
    });

    it('should handle multi-solid scenes (fish pattern — two mirrored extrusions)', async () => {
      const result = await createGeometry(
        {
          'fish.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = { thickness: 5 };

            export default function main(p = defaultParams) {
              // Simulate two separate solids (mirrored fish shapes)
              return [
                { position: ${trianglePositions(20)} },
                { position: ${trianglePositions(15)} },
              ];
            }
          `,
        },
        'fish.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 2);
      await geometryHelpers.expectVertexCount(result, 6);
    });

    it('should handle Lego-style union pattern (multiple primitives unioned)', async () => {
      const result = await createGeometry(
        {
          'lego.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = { rows: 2, columns: 3 };

            export default function main(p = defaultParams) {
              // Simulate Lego brick: body box + dot cylinders unioned
              return [{ position: ${boxPositions(24, 11.6, 16)} }];
            }
          `,
        },
        'lego.ts',
        { rows: 2, columns: 3 },
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
    });
  });

  // ===========================================================================
  // Integration: Part (History) API patterns
  //
  // User code follows buerli-examples/src/models/history/* patterns.
  // ===========================================================================

  describe('createGeometry — Part API patterns', () => {
    it('should produce geometry for CreatePart pattern (cylinder + fillet + chamfer)', async () => {
      const result = await createGeometry(
        {
          'create-part.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = {
              diameter: 50,
              height: 100,
              filletRadius: 10,
              chamferDistance: 10,
            };

            export default function main(p = defaultParams) {
              // Simulates Part API: cylinder → fillet top → chamfer bottom
              const r = p.diameter / 2;
              const h = p.height;
              const n = 16;
              const verts = [];
              for (let i = 0; i < n; i++) {
                const a1 = (2 * Math.PI * i) / n;
                const a2 = (2 * Math.PI * ((i + 1) % n)) / n;
                const x1 = r * Math.cos(a1), y1 = r * Math.sin(a1);
                const x2 = r * Math.cos(a2), y2 = r * Math.sin(a2);
                verts.push(0, 0, h, x1, y1, h, x2, y2, h);
                verts.push(0, 0, 0, x2, y2, 0, x1, y1, 0);
                verts.push(x1, y1, 0, x1, y1, h, x2, y2, h);
                verts.push(x1, y1, 0, x2, y2, h, x2, y2, 0);
              }
              return [{ position: new Float32Array(verts) }];
            }
          `,
        },
        'create-part.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
      await geometryHelpers.expectVertexCount(result, 16 * 4 * 3);
    });

    it('should produce geometry for MechanicalPart pattern (box + sketch extrusion + boolean)', async () => {
      const result = await createGeometry(
        {
          'mechanical.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = {
              boxLength: 50,
              boxHeight: 40,
              boxWidth: 40,
            };

            export default function main(p = defaultParams) {
              // Simulates mechanical part: box + sketch extrusion + boolean subtraction
              return [{ position: ${boxPositions(50, 40, 40)} }];
            }
          `,
        },
        'mechanical.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
      await geometryHelpers.expectBoundingBoxSize(result, [50, 40, 40], 0.01);
    });

    it('should produce geometry for flange pattern with parametric expressions', async () => {
      const result = await createGeometry(
        {
          'flange.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = {
              thickness: 30,
              upperCylDiam: 190,
              flangeHeight: 110,
            };

            export default function main(p = defaultParams) {
              const baseDiam = p.upperCylDiam + 4 * p.thickness;
              // Simulate flange: base cylinder + upper cylinder union - inner hole
              return [{
                position: ${boxPositions(310, 110, 310)},
              }];
            }
          `,
        },
        'flange.ts',
        { thickness: 30, upperCylDiam: 190, flangeHeight: 110 },
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
    });
  });

  // ===========================================================================
  // Integration: Three.js BufferGeometry toJSON conversion
  //
  // Validates the convertBuerliOutputToGlb path that handles Three.js
  // BufferGeometry.toJSON() output — the actual format returned by
  // model.createBufferGeometry() in the ClassCAD WASM runtime.
  // ===========================================================================

  describe('createGeometry — Three.js toJSON conversion', () => {
    it('should convert single BufferGeometry toJSON to valid GLB', async () => {
      const result = await createGeometry(
        {
          'geom-json.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export default function main() {
              return {
                toJSON() {
                  return {
                    metadata: { version: 4.5, type: 'BufferGeometry' },
                    geometries: [{
                      data: {
                        attributes: {
                          position: {
                            array: [
                              0, 0, 0,  50, 0, 0,  50, 40, 0,
                              0, 0, 0,  50, 40, 0,  0, 40, 0,
                            ],
                            itemSize: 3,
                            type: 'Float32Array',
                          },
                        },
                      },
                    }],
                  };
                },
              };
            }
          `,
        },
        'geom-json.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
      await geometryHelpers.expectVertexCount(result, 6);
      await geometryHelpers.expectBoundingBoxSize(result, [50, 40, 0], 0.01);
    });

    it('should convert multiple geometries from toJSON to multi-mesh GLB', async () => {
      const result = await createGeometry(
        {
          'multi-geom.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export default function main() {
              return {
                toJSON() {
                  return {
                    metadata: { version: 4.5 },
                    geometries: [
                      { data: { attributes: { position: { array: [0,0,0, 10,0,0, 0,10,0] } } } },
                      { data: { attributes: { position: { array: [20,0,0, 30,0,0, 20,10,0] } } } },
                      { data: { attributes: { position: { array: [40,0,0, 50,0,0, 40,10,0] } } } },
                    ],
                  };
                },
              };
            }
          `,
        },
        'multi-geom.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 3);
      await geometryHelpers.expectVertexCount(result, 9);
    });
  });

  // ===========================================================================
  // Integration: Parametric geometry — parameter flow
  // ===========================================================================

  describe('createGeometry — parametric geometry', () => {
    it('should use default parameters when none provided', async () => {
      const result = await createGeometry(
        {
          'param-defaults.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = { size: 30 };

            export default function main(p = defaultParams) {
              const s = p.size;
              return [{ position: ${boxPositions(30, 30, 30)} }];
            }
          `,
        },
        'param-defaults.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectBoundingBoxSize(result, [30, 30, 30], 0.01);
    });

    it('should override defaults with explicit parameters', async () => {
      const result = await createGeometry(
        {
          'param-override.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export const defaultParams = { width: 10, height: 10, depth: 10 };

            export default function main(p = defaultParams) {
              return [{ position: new Float32Array([
                0,0,0, p.width,0,0, p.width,p.height,0,
                0,0,0, p.width,p.height,0, 0,p.height,0,
              ]) }];
            }
          `,
        },
        'param-override.ts',
        { width: 100, height: 50, depth: 25 },
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectBoundingBoxSize(result, [100, 50, 0], 0.01);
    });
  });

  // ===========================================================================
  // Integration: Multi-file projects — local imports alongside @buerli.io/classcad
  // ===========================================================================

  describe('createGeometry — multi-file projects', () => {
    it('should resolve local helper modules alongside classcad import', async () => {
      const result = await createGeometry(
        {
          'main.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';
            import { createBox } from './primitives';

            export const defaultParams = { width: 20, height: 15, depth: 10 };

            export default function main(p = defaultParams) {
              return [createBox(p.width, p.height, p.depth)];
            }
          `,
          'primitives.ts': `
            export function createBox(w: number, h: number, d: number) {
              const verts = [
                0,0,d, w,0,d, w,h,d,  0,0,d, w,h,d, 0,h,d,
                0,0,0, w,h,0, w,0,0,  0,0,0, 0,h,0, w,h,0,
              ];
              return { position: new Float32Array(verts) };
            }
          `,
        },
        'main.ts',
        { width: 20, height: 15, depth: 10 },
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
      await geometryHelpers.expectBoundingBoxSize(result, [20, 15, 10], 0.01);
    });

    it('should handle barrel exports from utility modules', async () => {
      const result = await createGeometry(
        {
          'main.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';
            import { makeTriangle, makeQuad } from './shapes/index';

            export default function main() {
              return [makeTriangle(10), makeQuad(5)];
            }
          `,
          'shapes/index.ts': `
            export { makeTriangle } from './triangle';
            export { makeQuad } from './quad';
          `,
          'shapes/triangle.ts': `
            export function makeTriangle(s: number) {
              return { position: new Float32Array([0,0,0, s,0,0, 0,s,0]) };
            }
          `,
          'shapes/quad.ts': `
            export function makeQuad(s: number) {
              return { position: new Float32Array([0,0,0, s,0,0, s,s,0, 0,0,0, s,s,0, 0,s,0]) };
            }
          `,
        },
        'main.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 2);
      await geometryHelpers.expectVertexCount(result, 9);
    });
  });

  // ===========================================================================
  // Integration: ArrayBuffer passthrough
  // ===========================================================================

  describe('createGeometry — ArrayBuffer passthrough', () => {
    it('should pass through raw GLB binary data', async () => {
      const result = await createGeometry(
        {
          'raw-glb.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export default function main() {
              return new Uint8Array([
                0x67, 0x6C, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00,
                0x1C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
              ]).buffer;
            }
          `,
        },
        'raw-glb.ts',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]!.format).toBe('gltf');
        expect(result.data[0]!.content.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // Integration: Empty geometry handling
  // ===========================================================================

  describe('createGeometry — empty geometry', () => {
    it('should return empty data for undefined return', async () => {
      const result = await createGeometry(
        {
          'empty.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';
            export default function main() { return undefined; }
          `,
        },
        'empty.ts',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should return empty data for empty array return', async () => {
      const result = await createGeometry(
        {
          'empty-arr.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';
            export default function main() { return []; }
          `,
        },
        'empty-arr.ts',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  // ===========================================================================
  // Integration: Error handling
  // ===========================================================================

  describe('createGeometry — error handling', () => {
    it('should report syntax errors from user code', async () => {
      const result = await createGeometry(
        {
          'syntax-err.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';
            export default function main( {
          `,
        },
        'syntax-err.ts',
      );

      expect(result.success).toBe(false);
    });

    it('should report runtime errors with structured issues', async () => {
      const result = await createGeometry(
        {
          'runtime-err.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export default function main() {
              throw new Error('ClassCAD: invalid solid operation');
            }
          `,
        },
        'runtime-err.ts',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.some((i) => i.message.includes('invalid solid operation'))).toBe(true);
      }
    });

    it('should report type errors from bad classcad usage', async () => {
      const result = await createGeometry(
        {
          'type-err.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export default function main() {
              const x = null;
              return x.someProperty;
            }
          `,
        },
        'type-err.ts',
      );

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // Integration: Export pipeline — createGeometry → nativeHandle → export
  // ===========================================================================

  describe('export pipeline', () => {
    it('should produce exportable geometry result', async () => {
      const result = await createGeometry(
        {
          'export-test.ts': `
            import { BuerliCadFacade } from '@buerli.io/classcad';

            export default function main() {
              return [{ position: ${trianglePositions(10)} }];
            }
          `,
        },
        'export-test.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);

      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]!.format).toBe('gltf');
        expect(result.data[0]!.content).toBeInstanceOf(Uint8Array);
        expect(result.data[0]!.content.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // Integration: Module resolution — classcad import patterns
  // ===========================================================================

  describe('module resolution', () => {
    it('should resolve named imports from @buerli.io/classcad', async () => {
      const result = await createGeometry(
        {
          'named-import.ts': `
            import { BuerliCadFacade, init, WASMClient, BooleanOperationType } from '@buerli.io/classcad';

            export default function main() {
              // Verify all imports resolved
              const checks = [
                typeof BuerliCadFacade === 'function',
                typeof init === 'function',
                typeof WASMClient === 'function',
              ];
              if (checks.every(Boolean)) {
                return [{ position: ${trianglePositions(5)} }];
              }
              throw new Error('Import resolution failed');
            }
          `,
        },
        'named-import.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
    });

    it('should resolve default import from @buerli.io/classcad', async () => {
      const result = await createGeometry(
        {
          'default-import.ts': `
            import classcad from '@buerli.io/classcad';

            export default function main() {
              if (classcad) {
                return [{ position: ${trianglePositions(5)} }];
              }
              throw new Error('Default import failed');
            }
          `,
        },
        'default-import.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
    });
  });
});
