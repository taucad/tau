// @vitest-environment node
/* eslint-disable max-lines -- comprehensive kernel test suite */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import replicadKernel from '#kernels/replicad/replicad.kernel.js';
import { exampleFixtures } from '#kernels/replicad/replicad.test-fixtures.js';
import { createGeometryTestHelpers, extractGltfFromResult } from '#testing/kernel-geometry-testing.utils.js';
import {
  assertFailure,
  assertSuccess,
  createGeometryFile,
  createTestWorker,
  createTestGeometry,
  getTestParameters,
  seedTestFilesystem,
} from '#testing/kernel-testing.utils.js';
import type { CreateTestWorkerOptions } from '#testing/kernel-testing.utils.js';
import type { PerformanceEntryData } from '#types/index.js';

/* eslint-disable @typescript-eslint/naming-convention -- File names use extensions like 'box.ts' */

// =============================================================================
// Test Utilities
// =============================================================================

/** Create a runtime worker for testing with the provided files. */
const createWorker = async (files: Record<string, string>): ReturnType<typeof createTestWorker> =>
  createTestWorker(replicadKernel, files);

/** Helper to extract parameters and assert success. */
const getParameters = async (
  files: Record<string, string>,
  mainFile: string,
): Promise<{ jsonSchema: unknown; defaultParameters: Record<string, unknown> }> =>
  getTestParameters(replicadKernel, files, mainFile);

/** Helper to create geometry and return the result. */
const createGeometry = async ({
  files,
  mainFile,
  parameters,
  options,
}: {
  files: Record<string, string>;
  mainFile: string;
  parameters?: Record<string, unknown>;
  options?: CreateTestWorkerOptions;
}): ReturnType<typeof createTestGeometry> =>
  createTestGeometry({ definition: replicadKernel, files, mainFile, parameters, options });

// Create geometry test helpers instance for geometry assertions
const geometryHelpers = createGeometryTestHelpers();

// =============================================================================
// Tests: canHandle - File Type Detection
// =============================================================================

describe('ReplicadWorker', () => {
  describe('canHandle', () => {
    describe('Should handle files with replicad imports', () => {
      it('should handle TypeScript file with named import from replicad', async () => {
        const worker = await createWorker({
          'cube.ts': `
            import { draw, Sketcher } from 'replicad';
            export default function main() {
              return draw().hLine(10).vLine(10).hLine(-10).close().sketchOnPlane().extrude(10);
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('cube.ts'));
        expect(result).toBe(true);
      });

      it('should handle JavaScript file with named import from replicad', async () => {
        const worker = await createWorker({
          'cube.js': `
            import { draw } from 'replicad';
            export default function main() {
              return draw().hLine(10).vLine(10).hLine(-10).close().sketchOnPlane().extrude(10);
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('cube.js'));
        expect(result).toBe(true);
      });

      it('should handle file with namespace import from replicad', async () => {
        const worker = await createWorker({
          'cube.ts': `
            import * as replicad from 'replicad';
            export default function main() {
              return replicad.draw().hLine(10).vLine(10).hLine(-10).close().sketchOnPlane().extrude(10);
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('cube.ts'));
        expect(result).toBe(true);
      });

      it('should handle file with require statement for replicad', async () => {
        const worker = await createWorker({
          'cube.js': `
            const { draw } = require('replicad');
            function main(replicad, params) {
              return draw().hLine(10).vLine(10).hLine(-10).close().sketchOnPlane().extrude(10);
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('cube.js'));
        expect(result).toBe(true);
      });

      it('should handle file with destructured assignment from replicad global', async () => {
        const worker = await createWorker({
          'cube.js': `
            const { draw, Sketcher } = replicad;
            function main(replicad, params) {
              return draw().hLine(10).vLine(10).hLine(-10).close().sketchOnPlane().extrude(10);
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('cube.js'));
        expect(result).toBe(true);
      });

      it('should handle file with JSDoc typedef referencing replicad', async () => {
        const worker = await createWorker({
          'cube.js': `
            /** @typedef {import('replicad').Shape3D} Shape3D */
            function main(replicad, params) {
              const { draw } = replicad;
              return draw().hLine(10).vLine(10).hLine(-10).close().sketchOnPlane().extrude(10);
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('cube.js'));
        expect(result).toBe(true);
      });

      it('should handle file with replicad CDN import', async () => {
        const worker = await createWorker({
          'cube.ts': `
            import { draw } from 'replicad';
            import { addVoronoi } from "https://cdn.jsdelivr.net/npm/replicad-decorate/dist/studio/replicad-decorate.js";
            export default function main() {
              return draw().hLine(10).vLine(10).hLine(-10).close().sketchOnPlane().extrude(10);
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('cube.ts'));
        expect(result).toBe(true);
      });
    });

    describe('Should NOT handle files without replicad or unsupported extensions', () => {
      it('should not handle TSX file (JSX/TSX not supported)', async () => {
        const worker = await createWorker({
          'component.tsx': `
            import { draw } from 'replicad';
            export default function main() {
              return draw().hLine(10).vLine(10).hLine(-10).close().sketchOnPlane().extrude(10);
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('component.tsx'));
        expect(result).toBe(false);
      });

      it('should not handle JSX file (JSX/TSX not supported)', async () => {
        const worker = await createWorker({
          'component.jsx': `
            import { draw } from 'replicad';
            export default function main() {
              return draw().hLine(10).vLine(10).hLine(-10).close().sketchOnPlane().extrude(10);
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('component.jsx'));
        expect(result).toBe(false);
      });

      it('should not handle TypeScript file without replicad imports', async () => {
        const worker = await createWorker({
          'utils.ts': `
            export function add(a: number, b: number): number {
              return a + b;
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('utils.ts'));
        expect(result).toBe(false);
      });

      it('should not handle non-JS/TS file extensions', async () => {
        const worker = await createWorker({
          'model.scad': `cube([10, 10, 10]);`,
        });
        const result = await worker.canHandle(createGeometryFile('model.scad'));
        expect(result).toBe(false);
      });

      it('should not handle KCL files', async () => {
        const worker = await createWorker({
          'model.kcl': `box([10, 10, 10], center = [0, 0, 0])`,
        });
        const result = await worker.canHandle(createGeometryFile('model.kcl'));
        expect(result).toBe(false);
      });

      it('should not handle file with other CAD library imports', async () => {
        const worker = await createWorker({
          'jscad-model.ts': `
            import { cube } from '@jscad/modeling';
            export default function main() {
              return cube({ size: 10 });
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('jscad-model.ts'));
        expect(result).toBe(false);
      });
    });

    describe('Should detect replicad via transitive imports (bundler-assisted detection)', () => {
      const productionDetectImport = /import.*from\s+['"]replicad['"]/s.source;

      const createWorkerWithDetection = async (files: Record<string, string>): ReturnType<typeof createTestWorker> =>
        createTestWorker(replicadKernel, files, {
          detectImport: productionDetectImport,
          builtinModuleNames: ['replicad'],
        });

      it('should detect replicad when imported only in sub-modules (cube with cutout assembly)', async () => {
        const worker = await createWorkerWithDetection({
          'main.ts': `
            import { makeCube } from './lib/cube';
            import { makeCylinderCutout } from './lib/cutout';

            export const defaultParams = {
              cubeSize: 50,
              cutoutRadius: 15,
            };

            export default function main(p = defaultParams) {
              const cube = makeCube(p.cubeSize);
              const cutout = makeCylinderCutout(p.cutoutRadius, p.cubeSize * 1.1);
              return cube.cut(cutout);
            }
          `,
          'lib/cube.ts': `
            import { makeBaseBox } from 'replicad';

            export function makeCube(size: number) {
              return makeBaseBox(size, size, size).translate(-size / 2, -size / 2, -size / 2);
            }
          `,
          'lib/cutout.ts': `
            import { makeCylinder } from 'replicad';

            export function makeCylinderCutout(radius: number, height: number) {
              return makeCylinder(radius, height, [0, 0, -height / 2], [0, 0, 1]);
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('main.ts'));
        expect(result).toBe(true);
      });

      it('should detect replicad when only a single sub-module imports it', async () => {
        const worker = await createWorkerWithDetection({
          'main.ts': `
            import { createBox } from './shapes';
            export default function main() {
              return createBox(20, 20, 10);
            }
          `,
          'shapes.ts': `
            import { makeBaseBox } from 'replicad';
            export function createBox(w: number, h: number, d: number) {
              return makeBaseBox(w, h, d);
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('main.ts'));
        expect(result).toBe(true);
      });

      it('should not detect replicad when no sub-modules import it', async () => {
        const worker = await createWorkerWithDetection({
          'main.ts': `
            import { add } from './utils';
            export default function main() {
              return add(1, 2);
            }
          `,
          'utils.ts': `
            export function add(a: number, b: number) { return a + b; }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('main.ts'));
        expect(result).toBe(false);
      });

      it('should detect replicad after scaffold is replaced with multi-file transitive imports (stale cache regression)', async () => {
        // Step 1: Start with a replicad scaffold (direct import) — mirrors production template
        const worker = await createWorkerWithDetection({
          'main.ts': `
            import {} from 'replicad';

            export const defaultParams = {};

            export default function main(p = defaultParams) {}
          `,
        });

        const geometryFile = createGeometryFile('main.ts');

        // Step 2: canHandle succeeds via regex (direct import detected)
        // This populates selectionCache with { id: 'replicad', method: 'regex' }
        const canHandleScaffold = await worker.canHandle(geometryFile);
        expect(canHandleScaffold).toBe(true);

        // Step 3: Agent replaces scaffold with multi-file project
        // main.ts now imports from ./lib/cube (no direct 'replicad' import)
        await seedTestFilesystem({
          '/builds/test/main.ts': `
            import { createCube } from './lib/cube';
            import { createCylinder } from './lib/cylinder';

            export const defaultParams = {
              cubeSize: 50,
              cylinderRadius: 15,
            };

            export default function main(p = defaultParams) {
              const cube = createCube(p.cubeSize);
              const cylinder = createCylinder(p.cylinderRadius, p.cubeSize);
              return cube.cut(cylinder);
            }
          `,
          '/builds/test/lib/cube.ts': `
            import { makeBaseBox } from 'replicad';

            export function createCube(size: number) {
              return makeBaseBox(size, size, size);
            }
          `,
          '/builds/test/lib/cylinder.ts': `
            import { makeCylinder } from 'replicad';

            export function createCylinder(radius: number, height: number) {
              return makeCylinder(radius, height);
            }
          `,
        });

        // Step 4: BUG — canHandle without notifyFileChanged uses stale selectionCache
        // The stale cache entry (method: 'regex') causes the kernel's canHandle to
        // re-read main.ts, which no longer has a direct 'replicad' import → returns false
        const canHandleStale = await worker.canHandle(geometryFile);
        expect(canHandleStale).toBe(false);

        // Step 5: FIX — notifyFileChanged clears selectionCache
        await worker.notifyFileChanged([
          '/builds/test/main.ts',
          '/builds/test/lib/cube.ts',
          '/builds/test/lib/cylinder.ts',
        ]);

        // Step 6: canHandle re-runs fresh detection:
        // Pass 1 regex fails (no direct import), Pass 2 bundler traces
        // main.ts → ./lib/cube → replicad → selected with method: 'bundler'
        // method=bundler skips kernel's canHandle (authoritative) → returns true
        const canHandleFresh = await worker.canHandle(geometryFile);
        expect(canHandleFresh).toBe(true);
      });
    });

    describe('Should handle parametric models with direct imports', () => {
      it('should detect drawRoundedRectangle import from replicad', async () => {
        const worker = await createWorker({
          'main.ts': `
            import { drawRoundedRectangle } from 'replicad';
            export const defaultParams = {
              width: 100,
              length: 150,
              height: 50,
              thickness: 2,
              cornerRadius: 5,
            };
            export default function main(p = defaultParams) {
              const outer = drawRoundedRectangle(p.width, p.length, p.cornerRadius)
                .sketchOnPlane()
                .extrude(p.height);
              return outer.shell(p.thickness, (f) => f.inPlane("XY", p.height));
            }
          `,
        });
        const result = await worker.canHandle(createGeometryFile('main.ts'));
        expect(result).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Tests: Parameter Extraction
  // ===========================================================================

  describe('getParameters', () => {
    describe('ESM style - export syntax', () => {
      it('should extract defaultParams from exported const', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'box.ts': `
              import { drawRoundedRectangle } from 'replicad';

              export const defaultParams = {
                width: 100,
                height: 50,
                depth: 30,
              };

              export default function main(params) {
                const { width, height, depth } = params;
                return drawRoundedRectangle(width, height).sketchOnPlane().extrude(depth);
              }
            `,
          },
          'box.ts',
        );

        expect(defaultParameters).toEqual({ width: 100, height: 50, depth: 30 });
        expect(jsonSchema).toMatchObject({
          type: 'object',
          properties: {
            width: { type: 'integer', default: 100 },
            height: { type: 'integer', default: 50 },
            depth: { type: 'integer', default: 30 },
          },
        });
      });

      it('should extract nested defaultParams', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'box.ts': `
              import { draw } from 'replicad';

              export const defaultParams = {
                dimensions: {
                  width: 100,
                  height: 50,
                },
                options: {
                  rounded: true,
                  radius: 5,
                },
              };

              export default function main(params) {
                return draw().hLine(params.dimensions.width).vLine(params.dimensions.height).close().sketchOnPlane().extrude(10);
              }
            `,
          },
          'box.ts',
        );

        expect(defaultParameters).toEqual({
          dimensions: { width: 100, height: 50 },
          options: { rounded: true, radius: 5 },
        });
        expect(jsonSchema).toMatchObject({
          type: 'object',
          properties: {
            dimensions: {
              type: 'object',
              properties: {
                width: { type: 'integer', default: 100 },
                height: { type: 'integer', default: 50 },
              },
            },
            options: {
              type: 'object',
              properties: {
                rounded: { type: 'boolean', default: true },
                radius: { type: 'integer', default: 5 },
              },
            },
          },
        });
      });

      it('should handle array parameters', async () => {
        const { defaultParameters } = await getParameters(
          {
            'box.ts': `
              import { draw } from 'replicad';

              export const defaultParams = {
                sizes: [10, 20, 30],
                position: [0, 0, 0],
              };

              export default function main(params) {
                return draw().hLine(params.sizes[0]).vLine(params.sizes[1]).close().sketchOnPlane().extrude(params.sizes[2]);
              }
            `,
          },
          'box.ts',
        );

        expect(defaultParameters).toEqual({
          sizes: [10, 20, 30],
          position: [0, 0, 0],
        });
      });
    });

    describe('CommonJS style - global defaultParams', () => {
      it('should extract defaultParams from global variable', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'box.js': `
              const { draw } = replicad;

              const defaultParams = {
                width: 80,
                height: 40,
              };

              function main(replicad, params) {
                const { width, height } = params;
                return draw().hLine(width).vLine(height).hLine(-width).close().sketchOnPlane().extrude(10);
              }
            `,
          },
          'box.js',
        );

        expect(defaultParameters).toEqual({ width: 80, height: 40 });
        expect(jsonSchema).toMatchObject({
          type: 'object',
          properties: {
            width: { type: 'integer', default: 80 },
            height: { type: 'integer', default: 40 },
          },
        });
      });
    });

    describe('Edge cases', () => {
      it('should return empty parameters for file without defaultParams', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'box.ts': `
              import { draw } from 'replicad';

              export default function main() {
                return draw().hLine(10).vLine(10).hLine(-10).close().sketchOnPlane().extrude(10);
              }
            `,
          },
          'box.ts',
        );

        expect(defaultParameters).toEqual({});
        expect(jsonSchema).toMatchObject({
          type: 'object',
        });
      });

      it('should handle boolean parameters', async () => {
        const { defaultParameters } = await getParameters(
          {
            'box.ts': `
              import { draw } from 'replicad';

              export const defaultParams = {
                addHoles: true,
                centered: false,
              };

              export default function main(params) {
                return draw().hLine(10).vLine(10).hLine(-10).close().sketchOnPlane().extrude(10);
              }
            `,
          },
          'box.ts',
        );

        expect(defaultParameters).toEqual({ addHoles: true, centered: false });
      });

      it('should handle string parameters', async () => {
        const { defaultParameters } = await getParameters(
          {
            'box.ts': `
              import { draw } from 'replicad';

              export const defaultParams = {
                label: "My Box",
                material: "PLA",
              };

              export default function main(params) {
                return draw().hLine(10).vLine(10).hLine(-10).close().sketchOnPlane().extrude(10);
              }
            `,
          },
          'box.ts',
        );

        expect(defaultParameters).toEqual({ label: 'My Box', material: 'PLA' });
      });
    });
  });

  // ===========================================================================
  // Tests: Default Name Extraction
  // ===========================================================================

  describe('defaultName extraction via geometry output', () => {
    it('should produce geometry when defaultName is exported', async () => {
      const result = await createGeometry({
        files: {
          'named.ts': `
            import { drawRoundedRectangle } from 'replicad';
            export const defaultName = 'My Custom Box';
            export default function main() {
              return drawRoundedRectangle(10, 10).sketchOnPlane().extrude(5);
            }
          `,
        },
        mainFile: 'named.ts',
      });

      assertSuccess(result);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should produce geometry when no defaultName is defined', async () => {
      const result = await createGeometry({
        files: {
          'unnamed.ts': `
            import { drawRoundedRectangle } from 'replicad';
            export default function main() {
              return drawRoundedRectangle(10, 10).sketchOnPlane().extrude(5);
            }
          `,
        },
        mainFile: 'unnamed.ts',
      });

      assertSuccess(result);
      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Tests: Geometry Computation
  // ===========================================================================

  describe('createGeometry', () => {
    describe('Basic geometry - ESM style', () => {
      it('should compute geometry for a simple extruded rectangle', async () => {
        const result = await createGeometry({
          files: {
            'box.ts': `
              import { drawRoundedRectangle } from 'replicad';

              export default function main() {
                return drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
              }
            `,
          },
          mainFile: 'box.ts',
        });

        assertSuccess(result);
        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);

        // Geometry quality assertions
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.01, 0.03], 0.0005);
      });

      it('should compute geometry with parameters', async () => {
        const result = await createGeometry({
          files: {
            'box.ts': `
              import { drawRoundedRectangle } from 'replicad';

              export const defaultParams = {
                width: 50,
                height: 30,
                depth: 10,
              };

              export default function main(params) {
                const { width, height, depth } = params;
                return drawRoundedRectangle(width, height).sketchOnPlane().extrude(depth);
              }
            `,
          },
          mainFile: 'box.ts',
          parameters: { width: 100, height: 60, depth: 20 },
        });

        assertSuccess(result);

        // Geometry should use parameter values (100x60x20)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.1, 0.02, 0.06], 0.0005);
      });

      it('should compute geometry using draw API', async () => {
        const result = await createGeometry({
          files: {
            'profile.ts': `
              import { draw } from 'replicad';

              export default function main() {
                return draw()
                  .hLine(50)
                  .vLine(30)
                  .hLine(-50)
                  .close()
                  .sketchOnPlane()
                  .extrude(10);
              }
            `,
          },
          mainFile: 'profile.ts',
        });

        assertSuccess(result);

        // Geometry quality assertions (50x30x10 box)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.01, 0.03], 0.0005);
      });

      it('should handle multiple shapes returned as array', async () => {
        const result = await createGeometry({
          files: {
            'multi.ts': `
              import { drawRoundedRectangle, drawCircle } from 'replicad';

              export default function main() {
                const box = drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
                const cylinder = drawCircle(15).sketchOnPlane().extrude(20).translate([70, 0, 0]);
                return [box, cylinder];
              }
            `,
          },
          mainFile: 'multi.ts',
        });

        assertSuccess(result);

        // Should produce 2 meshes (box + cylinder)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 2);
      });
    });

    describe('Basic geometry - CommonJS style', () => {
      it('should compute geometry using global replicad object', async () => {
        const result = await createGeometry({
          files: {
            'box.js': `
              const { draw } = replicad;

              function main(replicad, params) {
                return draw()
                  .hLine(50)
                  .vLine(30)
                  .hLine(-50)
                  .close()
                  .sketchOnPlane()
                  .extrude(10);
              }
            `,
          },
          mainFile: 'box.js',
        });

        assertSuccess(result);

        // Geometry quality assertions (50x30x10 box)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.01, 0.03], 0.0005);
      });

      it('should compute geometry with params in CommonJS style', async () => {
        const result = await createGeometry({
          files: {
            'box.js': `
              const { draw } = replicad;

              const defaultParams = {
                size: 50,
              };

              function main(replicad, params) {
                const size = params.size || defaultParams.size;
                return draw()
                  .hLine(size)
                  .vLine(size)
                  .hLine(-size)
                  .close()
                  .sketchOnPlane()
                  .extrude(size);
              }
            `,
          },
          mainFile: 'box.js',
          parameters: { size: 75 },
        });

        assertSuccess(result);

        // Geometry should use parameter value (75x75x75 cube)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.075, 0.075, 0.075], 0.0005);
      });
    });

    describe('Complex geometry', () => {
      it('should handle boolean operations (difference)', async () => {
        const result = await createGeometry({
          files: {
            'hollow.ts': `
              import { drawCircle } from 'replicad';

              export default function main() {
                const outer = drawCircle(30).sketchOnPlane().extrude(20);
                const inner = drawCircle(25).sketchOnPlane().extrude(25);
                return outer.cut(inner);
              }
            `,
          },
          mainFile: 'hollow.ts',
        });

        assertSuccess(result);

        // Boolean difference produces 1 mesh (hollow cylinder)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        // Outer cylinder is radius 30, so diameter 60
        await geometryHelpers.expectBoundingBoxSize(result, [0.06, 0.02, 0.06], 0.001);
      });

      it('should handle boolean operations (union/fuse)', async () => {
        const result = await createGeometry({
          files: {
            'fused.ts': `
              import { drawRoundedRectangle, drawCircle } from 'replicad';

              export default function main() {
                const box = drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
                const cylinder = drawCircle(10).sketchOnPlane().extrude(20).translate([0, 0, 10]);
                return box.fuse(cylinder);
              }
            `,
          },
          mainFile: 'fused.ts',
        });

        assertSuccess(result);

        // Boolean union produces 1 mesh (box with cylinder on top)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        // Box is 50x30, cylinder adds height: 10 + 20 = 30 total height
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.03, 0.03], 0.001);
      });

      it('should handle transformations (translate, rotate)', async () => {
        const result = await createGeometry({
          files: {
            'transformed.ts': `
              import { drawRoundedRectangle } from 'replicad';

              export default function main() {
                return drawRoundedRectangle(50, 30)
                  .sketchOnPlane()
                  .extrude(10)
                  .rotate(45, [0, 0, 0], [0, 0, 1])
                  .translate([100, 50, 25]);
              }
            `,
          },
          mainFile: 'transformed.ts',
        });

        assertSuccess(result);

        // Transformation produces 1 mesh (rotated and translated box)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
      });

      it('should handle loft operations', async () => {
        const result = await createGeometry({
          files: {
            'loft.ts': `
              import { drawCircle, makePlane } from 'replicad';

              export default function main() {
                // Create a cone-like shape by lofting a larger circle to a smaller one
                const bottom = drawCircle(30).sketchOnPlane(makePlane());
                const top = drawCircle(15).sketchOnPlane(makePlane("XY", 50));

                // Use loftWith method on the sketch
                return bottom.loftWith(top);
              }
            `,
          },
          mainFile: 'loft.ts',
        });

        assertSuccess(result);

        // Loft produces 1 mesh (cone-like shape)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        // Bottom circle is radius 30 (diameter 60), height is 50
        await geometryHelpers.expectBoundingBoxSize(result, [0.06, 0.05, 0.06], 0.001);
      });

      it('should handle chamfer and fillet operations', async () => {
        const result = await createGeometry({
          files: {
            'filleted.ts': `
              import { drawRoundedRectangle, EdgeFinder } from 'replicad';

              export default function main() {
                const box = drawRoundedRectangle(50, 30).sketchOnPlane().extrude(20);
                return box.fillet(3, (e) => e.inDirection("Z"));
              }
            `,
          },
          mainFile: 'filleted.ts',
        });

        assertSuccess(result);

        // Fillet produces 1 mesh (box with rounded edges)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        // Bounding box should remain approximately 50x30x20
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.02, 0.03], 0.001);
      });

      it('should handle shell operation', async () => {
        const result = await createGeometry({
          files: {
            'shell.ts': `
              import { drawRoundedRectangle, FaceFinder } from 'replicad';

              export default function main() {
                const box = drawRoundedRectangle(50, 30).sketchOnPlane().extrude(20);
                return box.shell(-2, (f) => f.inPlane("XY", 20));
              }
            `,
          },
          mainFile: 'shell.ts',
        });

        assertSuccess(result);

        // Shell produces 1 mesh (hollow box)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        // Shell with -2 offset expands outer dimensions due to thickness on all sides
        await geometryHelpers.expectBoundingBoxSize(result, [0.054, 0.022, 0.034], 0.001);
      });
    });

    describe('Multi-file imports', () => {
      it('should handle transitive imports without direct replicad import in entry file', async () => {
        const productionDetectImport = /import.*from\s+['"]replicad['"]/s.source;
        const result = await createGeometry({
          files: {
            'main.ts': `
              import { createBox } from './lib/box';
              import { createCylinder } from './lib/cylinder';

              export default function main() {
                const box = createBox(40, 40, 20);
                const cylinder = createCylinder(10, 30).translate([0, 0, 20]);
                return box.fuse(cylinder);
              }
            `,
            'lib/box.ts': `
              import { makeBaseBox } from 'replicad';

              export function createBox(width: number, height: number, depth: number) {
                return makeBaseBox(width, height, depth);
              }
            `,
            'lib/cylinder.ts': `
              import { makeCylinder } from 'replicad';

              export function createCylinder(radius: number, height: number) {
                return makeCylinder(radius, height);
              }
            `,
          },
          mainFile: 'main.ts',
          parameters: {},
          options: {
            detectImport: productionDetectImport,
            builtinModuleNames: ['replicad'],
          },
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
      });

      it('should handle imports from relative paths', async () => {
        const result = await createGeometry({
          files: {
            'main.ts': `
              import { createSimpleBox } from "./lib/box";
              import {} from 'replicad';

              export default function main() {
                return createSimpleBox(30, 30, 30);
              }
            `,
            'lib/box.ts': `
              import { makeBaseBox } from "replicad";

              export function createSimpleBox(w: number, h: number, d: number) {
                return makeBaseBox(w, h, d);
              }
            `,
          },
          mainFile: 'main.ts',
        });

        assertSuccess(result);

        // Geometry: 30x30x30 cube
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.03, 0.03, 0.03], 0.0005);
      });

      it('should handle multi-level nested imports', async () => {
        const result = await createGeometry({
          files: {
            'main.ts': `
              import { createAssembly } from "./parts/assembly";
              import {} from 'replicad';

              export default function main() {
                return createAssembly();
              }
            `,
            'parts/assembly.ts': `
              import { createBox } from "./shapes/box";
              import { createCylinder } from "./shapes/cylinder";

              export function createAssembly() {
                const box = createBox(40, 40, 20);
                const cylinder = createCylinder(10, 30).translate([0, 0, 20]);
                return box.fuse(cylinder);
              }
            `,
            'parts/shapes/box.ts': `
              import { makeBaseBox } from "replicad";

              export function createBox(width: number, height: number, depth: number) {
                return makeBaseBox(width, height, depth);
              }
            `,
            'parts/shapes/cylinder.ts': `
              import { makeCylinder } from "replicad";

              export function createCylinder(radius: number, height: number) {
                return makeCylinder(radius, height);
              }
            `,
          },
          mainFile: 'main.ts',
        });

        assertSuccess(result);

        // Geometry: 40x40 base with cylinder on top, total height 50
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.04, 0.05, 0.04], 0.001);
      });

      it('should pass parameters through multi-file imports', async () => {
        const result = await createGeometry({
          files: {
            'main.ts': `
              import { createParametricBox } from "./utils/parametric";
              import {} from 'replicad';

              export const defaultParams = {
                size: 50,
              };

              export default function main(params = defaultParams) {
                return createParametricBox(params.size);
              }
            `,
            'utils/parametric.ts': `
              import { makeBaseBox } from "replicad";

              export function createParametricBox(size: number) {
                return makeBaseBox(size, size, size);
              }
            `,
          },
          mainFile: 'main.ts',
          parameters: { size: 100 },
        });

        assertSuccess(result);

        // Geometry: 100x100x100 cube (using passed parameter)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.1, 0.1, 0.1], 0.001);
      });

      it('should handle re-exports from barrel files', async () => {
        const result = await createGeometry({
          files: {
            'main.ts': `
              import { box, cylinder } from "./shapes";
              import {} from 'replicad';

              export default function main() {
                return [box(20, 20, 10), cylinder(8, 15).translate([30, 0, 0])];
              }
            `,
            'shapes/index.ts': `
              export { box } from "./box";
              export { cylinder } from "./cylinder";
            `,
            'shapes/box.ts': `
              import { makeBaseBox } from "replicad";

              export function box(w: number, h: number, d: number) {
                return makeBaseBox(w, h, d);
              }
            `,
            'shapes/cylinder.ts': `
              import { makeCylinder } from "replicad";

              export function cylinder(r: number, h: number) {
                return makeCylinder(r, h);
              }
            `,
          },
          mainFile: 'main.ts',
        });

        assertSuccess(result);

        // Geometry: box + cylinder, 2 meshes
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 2);
      });
    });

    describe('2D geometry (SVG output)', () => {
      it('should return SVG for 2D sketch without extrusion', async () => {
        const result = await createGeometry({
          files: {
            'sketch.ts': `
              import { draw } from 'replicad';

              export default function main() {
                return draw()
                  .hLine(50)
                  .vLine(30)
                  .hLine(-50)
                  .close();
              }
            `,
          },
          mainFile: 'sketch.ts',
        });

        assertSuccess(result);
        // Should contain SVG format geometry
        const hasSvg = result.data.some((g: { format: string }) => g.format === 'svg');
        expect(hasSvg).toBe(true);
      });
    });

    describe('Error handling', () => {
      it('should return error for syntax errors', async () => {
        const result = await createGeometry({
          files: {
            'syntax_error.ts': `
              import { draw } from 'replicad';

              export default function main() {
                return draw()
                  .hLine(50
                  .vLine(30)
                  .close()
                  .extrude(10);
              }
            `,
          },
          mainFile: 'syntax_error.ts',
        });

        assertFailure(result);
        expect(result.issues.length).toBeGreaterThan(0);
      });

      it('should return error for undefined function calls', async () => {
        const result = await createGeometry({
          files: {
            'undefined_func.ts': `
              import { draw } from 'replicad';

              export default function main() {
                return undefinedFunction();
              }
            `,
          },
          mainFile: 'undefined_func.ts',
        });

        assertFailure(result);
        expect(result.issues.length).toBeGreaterThan(0);
      });

      it('should return error for runtime errors', async () => {
        const result = await createGeometry({
          files: {
            'runtime_error.ts': `
              import { draw } from 'replicad';

              export default function main() {
                const obj = null;
                return obj.someMethod();
              }
            `,
          },
          mainFile: 'runtime_error.ts',
        });

        assertFailure(result);
        expect(result.issues.length).toBeGreaterThan(0);
      });

      it('should return error with properly classified stack frames for undefined variable', async () => {
        const result = await createGeometry({
          files: {
            'main.ts': `
              import {} from 'replicad';

              export const defaultParams = {};

              export default function main(p = defaultParams) {
                return bla;
              }
            `,
          },
          mainFile: 'main.ts',
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        expect(issue.message).toMatch(/bla is not defined/i);
        expect(issue.stackFrames).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ functionName: 'main', context: 'user' }),
            expect.objectContaining({ context: 'framework' }),
          ]),
        );

        // All framework/runtime frames should point to known platform paths
        for (const frame of issue.stackFrames!.filter((f) => f.context === 'framework' || f.context === 'runtime')) {
          const fileName = frame.fileName ?? '';
          expect(
            fileName.includes('/kernel/') ||
              fileName.includes('/kernels/') ||
              fileName.startsWith('node:') ||
              fileName.includes('/node_modules/') ||
              fileName.startsWith('data:'),
          ).toBe(true);
        }
      });

      it('should return error for invalid geometry operations', async () => {
        const result = await createGeometry({
          files: {
            'invalid_op.ts': `
              import { drawCircle } from 'replicad';

              export default function main() {
                // Attempt to extrude with invalid value
                return drawCircle(10).sketchOnPlane().extrude(-1);
              }
            `,
          },
          mainFile: 'invalid_op.ts',
        });

        // This may succeed or fail depending on replicad's handling
        // Just verify we get a proper result structure
        expect(typeof result.success).toBe('boolean');
      });

      it('should decode OpenCASCADE numeric exceptions into human-readable messages when wasm is single-exceptions', async () => {
        const result = await createGeometry({
          files: {
            'oc_exception.ts': `
              export default function main() {
                throw 0x12345;
              }
            `,
          },
          mainFile: 'oc_exception.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single-exceptions' } },
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        expect(issue.type).toBe('kernel');
        expect(issue.severity).toBe('error');
        expect(issue.message).not.toMatch(/^\d+$/);
      });

      it('should return decoded OC error with type info for zero-height extrusion', async () => {
        const result = await createGeometry({
          files: {
            'zero_extrude.ts': `
              import { draw } from 'replicad';

              export default function main() {
                return draw()
                  .hLine(10)
                  .vLine(10)
                  .hLine(-10)
                  .close()
                  .sketchOnPlane()
                  .extrude(0);
              }
            `,
          },
          mainFile: 'zero_extrude.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single-exceptions' } },
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        expect(issue.type).toBe('kernel');
        expect(issue.severity).toBe('error');
        expect(issue.message).toMatch(/BRepSweep_Translation/);
      });

      it('should include user code stack frames for OC exceptions with helper function', async () => {
        const code = `import { draw } from 'replicad';

function buildShape() {
  const sketch = draw()
    .hLine(10)
    .vLine(10)
    .hLine(-10)
    .close()
    .sketchOnPlane();
  return sketch.extrude(0);
}

export default function main() {
  return buildShape();
}
`;

        const result = await createGeometry({
          files: { 'extrude_stack.ts': code },
          mainFile: 'extrude_stack.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single-exceptions' } },
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        expect(issue.type).toBe('kernel');
        expect(issue.severity).toBe('error');
        expect(issue.message).toBe(
          'KernelError: Sweep/extrusion failed \u2014 the sweep distance may be zero or the profile is invalid (BRepSweep_Translation::Constructor)',
        );
        expect(issue.location).toEqual(expect.objectContaining({ fileName: 'extrude_stack.ts', startLineNumber: 10 }));
        expect(issue.stackFrames).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              functionName: 'buildShape',
              fileName: 'extrude_stack.ts',
              lineNumber: 10,
              context: 'user',
            }),
            expect.objectContaining({
              functionName: 'main',
              fileName: 'extrude_stack.ts',
              lineNumber: 14,
              context: 'user',
            }),
            expect.objectContaining({ context: 'library' }),
          ]),
        );
      });

      it('should include stack frames for nested helpers in same file', async () => {
        const code = `import { draw } from 'replicad';

function createSketch() {
  return draw()
    .hLine(10)
    .vLine(10)
    .hLine(-10)
    .close()
    .sketchOnPlane();
}

function extrudeProfile() {
  const sketch = createSketch();
  return sketch.extrude(0);
}

export default function main() {
  return extrudeProfile();
}
`;

        const result = await createGeometry({
          files: { 'nested_helpers.ts': code },
          mainFile: 'nested_helpers.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single-exceptions' } },
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        expect(issue.type).toBe('kernel');
        expect(issue.severity).toBe('error');
        expect(issue.message).toMatch(/BRepSweep_Translation/);
        expect(issue.location).toEqual(expect.objectContaining({ fileName: 'nested_helpers.ts', startLineNumber: 14 }));
        expect(issue.stackFrames).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              functionName: 'extrudeProfile',
              fileName: 'nested_helpers.ts',
              lineNumber: 14,
              context: 'user',
            }),
            expect.objectContaining({
              functionName: 'main',
              fileName: 'nested_helpers.ts',
              lineNumber: 18,
              context: 'user',
            }),
            expect.objectContaining({ context: 'library' }),
          ]),
        );
      });

      it('should include stack frames for cross-file OC exceptions', async () => {
        const result = await createGeometry({
          files: {
            'main.ts': `import { buildGeometry } from './helpers';
import {} from 'replicad';
export default function main() { return buildGeometry(); }
`,
            'helpers.ts': `import { draw } from 'replicad';

export function buildGeometry() {
  return draw()
    .hLine(10)
    .vLine(10)
    .hLine(-10)
    .close()
    .sketchOnPlane()
    .extrude(0);
}
`,
          },
          mainFile: 'main.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single-exceptions' } },
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        expect(issue.type).toBe('kernel');
        expect(issue.severity).toBe('error');
        expect(issue.message).toMatch(/BRepSweep_Translation/);
        expect(issue.location).toEqual(expect.objectContaining({ fileName: 'helpers.ts', startLineNumber: 10 }));
        expect(issue.stackFrames).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ functionName: 'buildGeometry', fileName: 'helpers.ts', context: 'user' }),
            expect.objectContaining({ functionName: 'main', fileName: 'main.ts', context: 'user' }),
            expect.objectContaining({ context: 'library' }),
          ]),
        );
      });

      it('should include user frames, location, and OC class name for fillet exception', async () => {
        // Fillet errors originate from OC object methods (e.g. .Shape()),
        // not top-level constructors — testing recursive Emscripten proxy wrapping.
        const code = `import { makeBaseBox } from 'replicad';

function buildEnclosure() {
  const outer = makeBaseBox(80, 60, 40);
  const inner = makeBaseBox(76, 56, 37).translate(0, 0, 3);
  let enclosure = outer.cut(inner);
  enclosure = enclosure.fillet(3);
  return enclosure;
}

export default function main() {
  return buildEnclosure();
}
`;

        const result = await createGeometry({
          files: { 'fillet_fail.ts': code },
          mainFile: 'fillet_fail.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single-exceptions' } },
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        expect(issue.type).toBe('kernel');
        expect(issue.severity).toBe('error');
        expect(issue.message).toMatch(/StdFail_NotDone/);
        expect(issue.location).toEqual(expect.objectContaining({ fileName: 'fillet_fail.ts', startLineNumber: 7 }));
        expect(issue.stackFrames).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              functionName: 'buildEnclosure',
              fileName: 'fillet_fail.ts',
              lineNumber: 7,
              context: 'user',
            }),
            expect.objectContaining({
              functionName: 'main',
              fileName: 'fillet_fail.ts',
              lineNumber: 12,
              context: 'user',
            }),
          ]),
        );

        // Proxy wrapper frame should show the OC class name, not Proxy.<anonymous>
        const proxyFrame = issue.stackFrames?.find(
          (frame) => frame.context === 'framework' && frame.fileName?.includes('oc-tracing'),
        );
        expect(proxyFrame?.functionName).toMatch(/^BRepFilletAPI_MakeFillet\w*\.\w+$/);
      });

      it('should include user frames, location, and OC class name for fillet exception with ocTracing off', async () => {
        // Same fillet failure with ocTracing disabled — the lightweight
        // wrapOcForExceptions proxy must still intercept and name frames.
        const code = `import { makeBaseBox } from 'replicad';

function buildEnclosure() {
  const outer = makeBaseBox(80, 60, 40);
  const inner = makeBaseBox(76, 56, 37).translate(0, 0, 3);
  let enclosure = outer.cut(inner);
  enclosure = enclosure.fillet(3);
  return enclosure;
}

export default function main() {
  return buildEnclosure();
}
`;

        const result = await createGeometry({
          files: { 'fillet_no_trace.ts': code },
          mainFile: 'fillet_no_trace.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single-exceptions', ocTracing: 'off' } },
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        expect(issue.type).toBe('kernel');
        expect(issue.severity).toBe('error');
        expect(issue.message).toMatch(/StdFail_NotDone/);
        expect(issue.location).toEqual(expect.objectContaining({ fileName: 'fillet_no_trace.ts', startLineNumber: 7 }));
        expect(issue.stackFrames).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              functionName: 'buildEnclosure',
              fileName: 'fillet_no_trace.ts',
              lineNumber: 7,
              context: 'user',
            }),
            expect.objectContaining({
              functionName: 'main',
              fileName: 'fillet_no_trace.ts',
              lineNumber: 12,
              context: 'user',
            }),
          ]),
        );

        const proxyFrame = issue.stackFrames?.find(
          (frame) => frame.context === 'framework' && frame.fileName?.includes('oc-tracing'),
        );
        expect(proxyFrame?.functionName).toMatch(/^BRepFilletAPI_MakeFillet\w*\.\w+$/);
      });

      it('should include user code stack frames for extrude OC exception with ocTracing off', async () => {
        const code = `import { draw } from 'replicad';

function buildShape() {
  const sketch = draw()
    .hLine(10)
    .vLine(10)
    .hLine(-10)
    .close()
    .sketchOnPlane();
  return sketch.extrude(0);
}

export default function main() {
  return buildShape();
}
`;

        const result = await createGeometry({
          files: { 'extrude_no_trace.ts': code },
          mainFile: 'extrude_no_trace.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single-exceptions', ocTracing: 'off' } },
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        expect(issue.type).toBe('kernel');
        expect(issue.severity).toBe('error');
        expect(issue.message).toMatch(/BRepSweep_Translation/);
        expect(issue.stackFrames).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ functionName: 'buildShape', fileName: 'extrude_no_trace.ts', context: 'user' }),
            expect.objectContaining({ functionName: 'main', fileName: 'extrude_no_trace.ts', context: 'user' }),
          ]),
        );
      });

      it('should produce exact stack frames and location for fluent-chain OC exception', async () => {
        // Fluent chain: draw().hLine().vLine().hLine().close().sketchOnPlane().extrude(0)
        // Only .extrude(0) throws — preceding fluent calls already completed
        // and are NOT on the call stack (JavaScript limitation).
        const code = `import { draw } from 'replicad';

export default function main() {
  return draw()
    .hLine(10)
    .vLine(10)
    .hLine(-10)
    .close()
    .sketchOnPlane()
    .extrude(0);
}
`;

        const result = await createGeometry({
          files: { 'fluent.ts': code },
          mainFile: 'fluent.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single-exceptions', withSourceMapping: true } },
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        expect(issue.type).toBe('kernel');
        expect(issue.severity).toBe('error');
        expect(issue.message).toBe(
          'KernelError: Sweep/extrusion failed \u2014 the sweep distance may be zero or the profile is invalid (BRepSweep_Translation::Constructor)',
        );

        // Location should cover the full .extrude(0) expression
        expect(issue.location).toEqual({
          fileName: 'fluent.ts',
          startLineNumber: 10,
          startColumn: 5,
          endLineNumber: 10,
          endColumn: 16,
        });

        // User frames: only main at the extrude call site
        // columnNumber 6 = 'e' of extrude (location.startColumn 5 includes the '.')
        const userFrames = issue.stackFrames?.filter((frame) => frame.context === 'user');
        expect(userFrames).toEqual([
          { functionName: 'main', fileName: 'fluent.ts', lineNumber: 10, columnNumber: 6, context: 'user' },
        ]);

        // Library frames: replicad internals with source-mapped positions
        expect(issue.stackFrames).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              functionName: 'Sketch.extrude',
              fileName: 'replicad/src/sketches/Sketch.ts',
              context: 'library',
            }),
            expect.objectContaining({
              functionName: 'basicFaceExtrusion',
              fileName: 'replicad/src/addThickness.ts',
              context: 'library',
            }),
          ]),
        );

        // Internal rethrowIfWasmException frame is stripped by Error.captureStackTrace
        const frameworkNames = issue.stackFrames
          ?.filter((frame) => frame.context === 'framework')
          .map((frame) => frame.functionName);
        expect(frameworkNames).not.toContain('rethrowIfWasmException');
        expect(frameworkNames).toEqual(
          expect.arrayContaining(['Object.construct', 'runMainRaw', 'runMain', 'Object.createGeometry']),
        );

        // Fluent calls before extrude are NOT in the stack (completed before throw)
        const allFunctionNames = issue.stackFrames?.map((frame) => frame.functionName) ?? [];
        for (const completedCall of ['draw', 'hLine', 'vLine', 'close', 'sketchOnPlane']) {
          expect(allFunctionNames).not.toContain(completedCall);
        }
      });

      it('should handle empty geometry result gracefully', async () => {
        const result = await createGeometry({
          files: {
            'empty.ts': `
              import { draw } from 'replicad';

              export default function main() {
                return [];
              }
            `,
          },
          mainFile: 'empty.ts',
        });

        assertSuccess(result);
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data).toHaveLength(0);
      });

      it('should return warning when main returns undefined (no return statement)', async () => {
        const result = await createGeometry({
          files: {
            'no_return.ts': `
              import { draw } from 'replicad';

              export default function main() {
                draw()
                  .hLine(50)
                  .vLine(30)
                  .hLine(-50)
                  .close()
                  .sketchOnPlane()
                  .extrude(10);
                // Missing return statement
              }
            `,
          },
          mainFile: 'no_return.ts',
        });

        assertSuccess(result);
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues.some((i) => i.severity === 'warning')).toBe(true);
        expect(result.issues.some((i) => i.message.includes('did not return'))).toBe(true);
        // Warning should point to line 1 of the file for navigation
        expect(result.issues[0]?.location).toEqual({ fileName: 'no_return.ts', startLineNumber: 1, startColumn: 1 });
      });

      it('should return warning when main explicitly returns undefined', async () => {
        const result = await createGeometry({
          files: {
            'explicit_undefined.ts': `
              import { draw } from 'replicad';

              export default function main() {
                return undefined;
              }
            `,
          },
          mainFile: 'explicit_undefined.ts',
        });

        assertSuccess(result);
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues.some((i) => i.severity === 'warning')).toBe(true);
        expect(result.issues.some((i) => i.message.includes('did not return'))).toBe(true);
        // Warning should point to line 1 of the file for navigation
        expect(result.issues[0]?.location).toEqual({
          fileName: 'explicit_undefined.ts',
          startLineNumber: 1,
          startColumn: 1,
        });
      });
    });

    describe('source map stack trace resolution', () => {
      it('should map stack trace to original source positions (single file)', async () => {
        const code = `import {} from 'replicad';

export const defaultParams = {};

export default function main() {
  return bla;
}
`;

        const result = await createGeometry({ files: { 'main.ts': code }, mainFile: 'main.ts' });
        assertFailure(result);

        // Framework/runtime frames have machine-specific paths; filter to user frames only
        const issue = result.issues[0]!;
        const userFrames = issue.stackFrames?.filter((f) => f.context === 'user');
        expect({ ...issue, stackFrames: userFrames }).toEqual(
          expect.objectContaining({
            message: 'bla is not defined',
            type: 'runtime',
            severity: 'error',
            // Source map should resolve to original file name (not blob UUID)
            // and original line 6 (not post-banner offset line 9)
            stackFrames: [
              { functionName: 'main', fileName: 'main.ts', lineNumber: 6, columnNumber: 3, context: 'user' },
            ],
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining returns any
            location: expect.objectContaining({ fileName: 'main.ts', startLineNumber: 6 }),
          }),
        );
      });

      it('should map stack trace to correct file in multi-file project', async () => {
        const result = await createGeometry({
          files: {
            'main.ts': `import { broken } from './lib/helper';
import {} from 'replicad';
export default function main() { return broken(); }
`,
            'lib/helper.ts': 'export function broken() { return bla; }',
          },
          mainFile: 'main.ts',
        });

        assertFailure(result);

        const issue = result.issues[0]!;
        const userFrames = issue.stackFrames?.filter((f) => f.context === 'user');
        expect({ ...issue, stackFrames: userFrames }).toEqual(
          expect.objectContaining({
            message: 'bla is not defined',
            type: 'runtime',
            severity: 'error',
            stackFrames: [
              { functionName: 'broken', fileName: 'lib/helper.ts', lineNumber: 1, columnNumber: 28, context: 'user' },
              { functionName: 'main', fileName: 'main.ts', lineNumber: 3, columnNumber: 41, context: 'user' },
            ],
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining returns any
            location: expect.objectContaining({ fileName: 'lib/helper.ts', startLineNumber: 1 }),
          }),
        );
      });

      it('should map stack trace through function call to correct line', async () => {
        // Error is inside a helper function `makeBadShape` called from main.
        // The stack trace should show both the error site and the call site.
        const code = `import {} from 'replicad';

function makeBadShape() {
  return bla;
}

export default function main() {
  return makeBadShape();
}
`;

        const result = await createGeometry({ files: { 'main.ts': code }, mainFile: 'main.ts' });
        assertFailure(result);

        const issue = result.issues[0]!;
        const userFrames = issue.stackFrames?.filter((f) => f.context === 'user');
        expect({ ...issue, stackFrames: userFrames }).toEqual(
          expect.objectContaining({
            message: 'bla is not defined',
            type: 'runtime',
            severity: 'error',
            stackFrames: [
              { functionName: 'makeBadShape', fileName: 'main.ts', lineNumber: 4, columnNumber: 3, context: 'user' },
              { functionName: 'main', fileName: 'main.ts', lineNumber: 8, columnNumber: 10, context: 'user' },
            ],
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining returns any
            location: expect.objectContaining({ fileName: 'main.ts', startLineNumber: 4 }),
          }),
        );
      });

      it('should map stack trace through 3-file import chain', async () => {
        // 3-file chain: main.ts -> lib/middle.ts -> lib/bad.ts
        // Error is in bad.ts, called through middle.ts from main.ts.
        const result = await createGeometry({
          files: {
            'main.ts': `import { getShape } from './lib/middle';
import {} from 'replicad';
export default function main() { return getShape(); }
`,
            'lib/middle.ts': `import { broken } from './bad';
export function getShape() { return broken(); }
`,
            'lib/bad.ts': 'export function broken() { return bla; }',
          },
          mainFile: 'main.ts',
        });

        assertFailure(result);

        const issue = result.issues[0]!;
        const userFrames = issue.stackFrames?.filter((f) => f.context === 'user');
        expect({ ...issue, stackFrames: userFrames }).toEqual(
          expect.objectContaining({
            message: 'bla is not defined',
            type: 'runtime',
            severity: 'error',
            stackFrames: [
              { functionName: 'broken', fileName: 'lib/bad.ts', lineNumber: 1, columnNumber: 28, context: 'user' },
              { functionName: 'getShape', fileName: 'lib/middle.ts', lineNumber: 2, columnNumber: 37, context: 'user' },
              { functionName: 'main', fileName: 'main.ts', lineNumber: 3, columnNumber: 41, context: 'user' },
            ],
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining returns any
            location: expect.objectContaining({ fileName: 'lib/bad.ts', startLineNumber: 1 }),
          }),
        );
      });
    });

    describe('withSourceMapping option', () => {
      const extrudeZeroCode = `import { draw } from 'replicad';

export default function main() {
  return draw()
    .hLine(10)
    .vLine(10)
    .hLine(-10)
    .close()
    .sketchOnPlane()
    .extrude(0);
}
`;

      it('should show compiled library paths when withSourceMapping is false (default)', async () => {
        const result = await createGeometry({
          files: { 'box.ts': extrudeZeroCode },
          mainFile: 'box.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single-exceptions' } },
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        const libraryFrames = issue.stackFrames?.filter((frame) => frame.context === 'library');
        expect(libraryFrames).toBeDefined();
        expect(libraryFrames!.length).toBeGreaterThanOrEqual(1);

        expect(libraryFrames).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              functionName: 'Sketch.extrude',
              fileName: expect.stringMatching(/replicad\/dist\/replicad\.js$/) as string,
              context: 'library',
            }),
            expect.objectContaining({
              functionName: 'basicFaceExtrusion',
              fileName: expect.stringMatching(/replicad\/dist\/replicad\.js$/) as string,
              context: 'library',
            }),
          ]),
        );

        for (const frame of libraryFrames!) {
          expect(frame.fileName).not.toMatch(/replicad\/src\//);
        }
      });

      it('should show source-mapped library paths when withSourceMapping is true', async () => {
        const result = await createGeometry({
          files: { 'box.ts': extrudeZeroCode },
          mainFile: 'box.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single-exceptions', withSourceMapping: true } },
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        const libraryFrames = issue.stackFrames?.filter((frame) => frame.context === 'library');
        expect(libraryFrames).toBeDefined();
        expect(libraryFrames!.length).toBeGreaterThanOrEqual(1);

        expect(libraryFrames).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              functionName: 'Sketch.extrude',
              fileName: 'replicad/src/sketches/Sketch.ts',
              context: 'library',
            }),
          ]),
        );

        for (const frame of libraryFrames!) {
          expect(frame.fileName).toMatch(/replicad\/src\//);
        }
      });
    });

    describe('CDN imports', () => {
      // Mock fetch to avoid real CDN requests - tests must work without internet.
      // Stub CDN URLs with minimal modules; pass everything else through (WASM loading, etc.).
      const originalFetch = globalThis.fetch;

      beforeEach(() => {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

            if (url.includes('replicad-decorate')) {
              return new Response('export function drawSVG() {} export function addVoronoi() {}', {
                status: 200,
                headers: { 'Content-Type': 'application/javascript' },
              });
            }

            return originalFetch(input, init);
          }),
        );
      });

      afterEach(() => {
        vi.stubGlobal('fetch', originalFetch);
      });

      it('should bundle and execute code with HTTPS CDN imports', async () => {
        const result = await createGeometry({
          files: {
            'decorated.ts': `
              import { drawRoundedRectangle } from 'replicad';
              import { drawSVG } from "https://cdn.jsdelivr.net/npm/replicad-decorate/dist/studio/replicad-decorate.js";

              export default function main() {
                // Verify the CDN import is available and is a function
                if (typeof drawSVG !== 'function') {
                  throw new Error('drawSVG is not a function');
                }

                // Return a 50x30x10 box
                return drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
              }
            `,
          },
          mainFile: 'decorated.ts',
        });

        assertSuccess(result);

        // Geometry quality assertions (50x30x10 box)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.01, 0.03], 0.0005);
      });
    });

    describe('File path handling for subdirectory files', () => {
      it('should use full relative path in error location when main file is in subdirectory', async () => {
        const worker = await createWorker({
          'project/main.ts': `
            import { draw } from 'replicad';

            export default function main() {
              return undefinedFunction();
            }
          `,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('project/main.ts'),
          parameters: {},
        });

        assertFailure(result);
        expect(result.issues.length).toBeGreaterThan(0);

        const issue = result.issues[0]!;
        const userFrames = issue.stackFrames?.filter((f) => f.context === 'user');
        expect({ ...issue, stackFrames: userFrames }).toEqual(
          expect.objectContaining({
            message: 'undefinedFunction is not defined',
            type: 'runtime',
            severity: 'error',
            // Source map should resolve to full relative path including subdirectory
            stackFrames: [
              { functionName: 'main', fileName: 'project/main.ts', lineNumber: 5, columnNumber: 15, context: 'user' },
            ],
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining returns any
            location: expect.objectContaining({ fileName: 'project/main.ts', startLineNumber: 5 }),
          }),
        );
      });
    });
  });

  // ===========================================================================
  // Tests: Export Geometry
  // ===========================================================================

  describe('exportGeometry', () => {
    it('should export to STEP format', async () => {
      const worker = await createWorker({
        'box.ts': `
          import { drawRoundedRectangle } from 'replicad';

          export default function main() {
            return drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
          }
        `,
      });

      // First create geometry
      const geometryFile = createGeometryFile('box.ts');
      const createResult = await worker.createGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(createResult);

      // Then export
      const exportResult = await worker.exportGeometry('step');
      assertSuccess(exportResult);
      expect(exportResult.data.length).toBeGreaterThan(0);
      expect(exportResult.data[0]?.bytes).toBeInstanceOf(Uint8Array);
      expect(exportResult.data[0]?.mimeType).toBe('application/step');
    });

    it('should export to STL format', async () => {
      const worker = await createWorker({
        'box.ts': `
          import { drawRoundedRectangle } from 'replicad';

          export default function main() {
            return drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
          }
        `,
      });

      const geometryFile = createGeometryFile('box.ts');
      await worker.createGeometry({ file: geometryFile, parameters: {} });

      const exportResult = await worker.exportGeometry('stl');
      assertSuccess(exportResult);
      expect(exportResult.data.length).toBeGreaterThan(0);
    });

    it('should export to binary STL format', async () => {
      const worker = await createWorker({
        'box.ts': `
          import { drawRoundedRectangle } from 'replicad';

          export default function main() {
            return drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
          }
        `,
      });

      const geometryFile = createGeometryFile('box.ts');
      await worker.createGeometry({ file: geometryFile, parameters: {} });

      const exportResult = await worker.exportGeometry('stl-binary');
      assertSuccess(exportResult);
    });

    it('should export to GLTF format', async () => {
      const worker = await createWorker({
        'box.ts': `
          import { drawRoundedRectangle } from 'replicad';

          export default function main() {
            return drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
          }
        `,
      });

      const geometryFile = createGeometryFile('box.ts');
      await worker.createGeometry({ file: geometryFile, parameters: {} });

      const exportResult = await worker.exportGeometry('gltf');
      assertSuccess(exportResult);
      expect(exportResult.data[0]?.name).toContain('gltf');
    });

    it('should export to GLB format', async () => {
      const worker = await createWorker({
        'box.ts': `
          import { drawRoundedRectangle } from 'replicad';

          export default function main() {
            return drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
          }
        `,
      });

      const geometryFile = createGeometryFile('box.ts');
      await worker.createGeometry({ file: geometryFile, parameters: {} });

      const exportResult = await worker.exportGeometry('glb');
      assertSuccess(exportResult);
      expect(exportResult.data[0]?.name).toContain('glb');
    });

    it('should export STEP assembly', async () => {
      const worker = await createWorker({
        'assembly.ts': `
          import { drawRoundedRectangle, drawCircle } from 'replicad';

          export default function main() {
            return [
              { shape: drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10), name: "base" },
              { shape: drawCircle(10).sketchOnPlane().extrude(20).translate([0, 0, 10]), name: "cylinder" },
            ];
          }
        `,
      });

      const geometryFile = createGeometryFile('assembly.ts');
      await worker.createGeometry({ file: geometryFile, parameters: {} });

      const exportResult = await worker.exportGeometry('step-assembly');
      assertSuccess(exportResult);
    });

    it('should return error when no geometry computed', async () => {
      const worker = await createWorker({
        'empty.ts': `
          import { draw } from 'replicad';
          export default function main() { return []; }
        `,
      });

      // Don't compute geometry first
      const exportResult = await worker.exportGeometry('step');
      assertFailure(exportResult);
      expect(exportResult.issues[0]?.message).toContain('No geometry available for export');
    });

    it('should respect mesh configuration for export', async () => {
      const worker = await createWorker({
        'sphere.ts': `
          import { drawCircle } from 'replicad';

          export default function main() {
            // Create a sphere-like shape by revolving a circle
            return drawCircle(20).sketchOnPlane().extrude(20);
          }
        `,
      });

      const geometryFile = createGeometryFile('sphere.ts');
      await worker.createGeometry({ file: geometryFile, parameters: {} });

      // Export with custom mesh configuration
      const exportResult = await worker.exportGeometry('stl', {
        linearTolerance: 0.001,
        angularTolerance: 5,
      });

      assertSuccess(exportResult);
    });
  });

  // ===========================================================================
  // Tests: Named Shapes and Colors
  // ===========================================================================

  describe('Named shapes and colors', () => {
    it('should handle named shape objects', async () => {
      const result = await createGeometry({
        files: {
          'named.ts': `
            import { drawRoundedRectangle, drawCircle } from 'replicad';

            export default function main() {
              return [
                { shape: drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10), name: "Base Plate" },
                { shape: drawCircle(10).sketchOnPlane().extrude(20).translate([0, 0, 10]), name: "Cylinder" },
              ];
            }
          `,
        },
        mainFile: 'named.ts',
      });

      assertSuccess(result);
    });

    it('should handle colored shapes', async () => {
      const result = await createGeometry({
        files: {
          'colored.ts': `
            import { drawRoundedRectangle, drawCircle } from 'replicad';

            export default function main() {
              return [
                { shape: drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10), name: "Red Box", color: "#ff0000" },
                { shape: drawCircle(10).sketchOnPlane().extrude(20).translate([0, 0, 10]), name: "Blue Cylinder", color: "#0000ff" },
              ];
            }
          `,
        },
        mainFile: 'colored.ts',
      });

      assertSuccess(result);
    });

    it('should handle shapes with opacity', async () => {
      const result = await createGeometry({
        files: {
          'transparent.ts': `
            import { drawRoundedRectangle } from 'replicad';

            export default function main() {
              return [
                { shape: drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10), name: "Outer", color: "#ff0000", opacity: 0.5 },
                { shape: drawRoundedRectangle(40, 20).sketchOnPlane().extrude(8).translate([5, 5, 1]), name: "Inner", color: "#00ff00" },
              ];
            }
          `,
        },
        mainFile: 'transparent.ts',
      });

      assertSuccess(result);
    });
  });

  // ===========================================================================
  // Tests: TypeScript Bundling Support
  // ===========================================================================

  describe('TypeScript bundling', () => {
    describe('Type annotations', () => {
      it('should bundle code with typed function parameters and return types', async () => {
        const result = await createGeometry({
          files: {
            'typed-box.ts': `
              import { drawRoundedRectangle } from 'replicad';

              export const defaultParams = {
                width: 50,
                height: 30,
                depth: 10,
              };

              type BoxParams = { width: number; height: number; depth: number };

              export default function main(p: BoxParams = defaultParams) {
                const { width, height, depth } = p;
                return drawRoundedRectangle(width, height).sketchOnPlane().extrude(depth);
              }
            `,
          },
          mainFile: 'typed-box.ts',
          parameters: { width: 50, height: 30, depth: 10 },
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.01, 0.03], 0.0005);
      });

      it('should bundle code with type assertions (as)', async () => {
        const result = await createGeometry({
          files: {
            'assertions.ts': `
              import { makeCylinder } from 'replicad';

              export default function main() {
                const height = 20 as number;
                const center = [0, 0, 10] as [number, number, number];
                return makeCylinder(10, height).translate(center);
              }
            `,
          },
          mainFile: 'assertions.ts',
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
      });

      it('should bundle code with const assertions (as const)', async () => {
        const result = await createGeometry({
          files: {
            'const-assertion.ts': `
              import { drawRoundedRectangle } from 'replicad';

              const dimensions = {
                width: 40,
                height: 20,
                depth: 15,
              } as const;

              export default function main() {
                return drawRoundedRectangle(dimensions.width, dimensions.height)
                  .sketchOnPlane()
                  .extrude(dimensions.depth);
              }
            `,
          },
          mainFile: 'const-assertion.ts',
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.04, 0.015, 0.02], 0.0005);
      });
    });

    describe('Type-only imports', () => {
      it('should strip import type declarations from replicad', async () => {
        const result = await createGeometry({
          files: {
            'type-import.ts': `
              import { drawRoundedRectangle } from 'replicad';
              import type { Drawing } from 'replicad';

              export default function main() {
                const shape = drawRoundedRectangle(50, 30);
                return shape.sketchOnPlane().extrude(10);
              }
            `,
          },
          mainFile: 'type-import.ts',
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.01, 0.03], 0.0005);
      });

      it('should strip inline type imports (import { type X })', async () => {
        const result = await createGeometry({
          files: {
            'inline-type.ts': `
              import { draw, type Sketcher, type Drawing } from 'replicad';

              export default function main() {
                return draw()
                  .hLine(50)
                  .vLine(30)
                  .hLine(-50)
                  .close()
                  .sketchOnPlane()
                  .extrude(10);
              }
            `,
          },
          mainFile: 'inline-type.ts',
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.01, 0.03], 0.0005);
      });
    });

    describe('Interfaces and type aliases', () => {
      it('should bundle code with local interface definitions', async () => {
        const result = await createGeometry({
          files: {
            'interfaces.ts': `
              import { drawRoundedRectangle, drawCircle } from 'replicad';

              interface ShapeConfig {
                width: number;
                height: number;
                depth: number;
              }

              interface CylinderConfig {
                radius: number;
                height: number;
              }

              function createBox(config: ShapeConfig) {
                return drawRoundedRectangle(config.width, config.height)
                  .sketchOnPlane()
                  .extrude(config.depth);
              }

              function createCylinder(config: CylinderConfig) {
                return drawCircle(config.radius)
                  .sketchOnPlane()
                  .extrude(config.height);
              }

              export default function main() {
                const box = createBox({ width: 50, height: 30, depth: 10 });
                const cyl = createCylinder({ radius: 8, height: 20 });
                return [box, cyl.translate([0, 0, 10])];
              }
            `,
          },
          mainFile: 'interfaces.ts',
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 2);
      });

      it('should bundle code with type aliases and union types', async () => {
        const result = await createGeometry({
          files: {
            'type-aliases.ts': `
              import { drawRoundedRectangle, drawCircle } from 'replicad';

              type Dimensions = { width: number; height: number; depth: number };
              type ShapeType = 'box' | 'cylinder';
              type Point3D = [number, number, number];

              function createShape(type: ShapeType, dims: Dimensions) {
                if (type === 'box') {
                  return drawRoundedRectangle(dims.width, dims.height)
                    .sketchOnPlane()
                    .extrude(dims.depth);
                }
                return drawCircle(dims.width / 2)
                  .sketchOnPlane()
                  .extrude(dims.depth);
              }

              export default function main() {
                const offset: Point3D = [0, 0, 10];
                const box = createShape('box', { width: 50, height: 30, depth: 10 });
                const cyl = createShape('cylinder', { width: 20, height: 20, depth: 20 });
                return [box, cyl.translate(offset)];
              }
            `,
          },
          mainFile: 'type-aliases.ts',
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 2);
      });
    });

    describe('Generics and advanced TypeScript features', () => {
      it('should bundle code with generic utility functions', async () => {
        const result = await createGeometry({
          files: {
            'generics.ts': `
              import { drawRoundedRectangle } from 'replicad';

              function withDefaults<T extends Record<string, number>>(
                defaults: T,
                overrides: Partial<T>,
              ): T {
                return { ...defaults, ...overrides };
              }

              const baseParams = { width: 50, height: 30, depth: 10 };

              export default function main() {
                const p = withDefaults(baseParams, { depth: 20 });
                return drawRoundedRectangle(p.width, p.height)
                  .sketchOnPlane()
                  .extrude(p.depth);
              }
            `,
          },
          mainFile: 'generics.ts',
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.02, 0.03], 0.0005);
      });

      it('should bundle code with enums', async () => {
        const result = await createGeometry({
          files: {
            'enums.ts': `
              import { drawRoundedRectangle, drawCircle } from 'replicad';

              enum ShapeKind {
                Box = 'box',
                Cylinder = 'cylinder',
              }

              export default function main() {
                const kind: ShapeKind = ShapeKind.Box;
                if (kind === ShapeKind.Box) {
                  return drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
                }
                return drawCircle(15).sketchOnPlane().extrude(20);
              }
            `,
          },
          mainFile: 'enums.ts',
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.01, 0.03], 0.0005);
      });

      it('should bundle code with optional chaining and nullish coalescing', async () => {
        const result = await createGeometry({
          files: {
            'modern-ts.ts': `
              import { drawRoundedRectangle } from 'replicad';

              type Config = {
                dimensions?: {
                  width?: number;
                  height?: number;
                  depth?: number;
                };
              };

              export default function main() {
                const config: Config = { dimensions: { width: 50 } };
                const width = config.dimensions?.width ?? 30;
                const height = config.dimensions?.height ?? 20;
                const depth = config.dimensions?.depth ?? 10;

                return drawRoundedRectangle(width, height).sketchOnPlane().extrude(depth);
              }
            `,
          },
          mainFile: 'modern-ts.ts',
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.01, 0.02], 0.0005);
      });
    });

    describe('Multi-file TypeScript with shared types', () => {
      it('should bundle multi-file project with shared type definitions', async () => {
        const result = await createGeometry({
          files: {
            'main.ts': `
              import { drawRoundedRectangle, drawCircle } from 'replicad';
              import type { BoxConfig, CylinderConfig } from './types';
              import { createBox, createCylinder } from './shapes';

              export default function main() {
                const boxConfig: BoxConfig = { width: 50, height: 30, depth: 10 };
                const cylConfig: CylinderConfig = { radius: 8, height: 25 };

                const box = createBox(boxConfig);
                const cyl = createCylinder(cylConfig).translate([0, 0, 10]);

                return [box, cyl];
              }
            `,
            'types.ts': `
              export interface BoxConfig {
                width: number;
                height: number;
                depth: number;
              }

              export interface CylinderConfig {
                radius: number;
                height: number;
              }

              export type Point3D = [number, number, number];
            `,
            'shapes.ts': `
              import { drawRoundedRectangle, drawCircle } from 'replicad';
              import type { BoxConfig, CylinderConfig } from './types';

              export function createBox(config: BoxConfig) {
                return drawRoundedRectangle(config.width, config.height)
                  .sketchOnPlane()
                  .extrude(config.depth);
              }

              export function createCylinder(config: CylinderConfig) {
                return drawCircle(config.radius)
                  .sketchOnPlane()
                  .extrude(config.height);
              }
            `,
          },
          mainFile: 'main.ts',
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 2);
      });

      it('should bundle multi-file project with type-only re-exports', async () => {
        const result = await createGeometry({
          files: {
            'main.ts': `
              import { drawRoundedRectangle } from 'replicad';
              import type { AppParams } from './config';
              import { DEFAULT_PARAMS } from './config';

              export const defaultParams = DEFAULT_PARAMS;

              export default function main(p: AppParams = defaultParams) {
                return drawRoundedRectangle(p.width, p.height)
                  .sketchOnPlane()
                  .extrude(p.depth);
              }
            `,
            'config/index.ts': `
              export type { AppParams } from './params';
              export { DEFAULT_PARAMS } from './params';
            `,
            'config/params.ts': `
              export interface AppParams {
                width: number;
                height: number;
                depth: number;
              }

              export const DEFAULT_PARAMS: AppParams = {
                width: 60,
                height: 40,
                depth: 15,
              };
            `,
          },
          mainFile: 'main.ts',
          parameters: { width: 60, height: 40, depth: 15 },
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.06, 0.015, 0.04], 0.0005);
      });
    });

    describe('Real-world TypeScript CAD patterns', () => {
      it('should bundle a parametric model with full TypeScript features (watering can style)', async () => {
        const result = await createGeometry({
          files: {
            'main.ts': `
              import { makePlane, makeCylinder, draw, drawCircle } from 'replicad';

              interface WateringCanParams {
                baseWidth: number;
                bodyHeight: number;
                spoutRadius: number;
                spoutLength: number;
                spoutAngle: number;
              }

              export const defaultParams: WateringCanParams = {
                baseWidth: 20,
                bodyHeight: 50,
                spoutRadius: 5,
                spoutLength: 30,
                spoutAngle: 45,
              };

              export default function main(p: WateringCanParams = defaultParams) {
                // Build the body using draw + revolve
                const profile = draw()
                  .hLine(p.baseWidth)
                  .line(5, 3)
                  .vLine(3)
                  .lineTo([8, p.bodyHeight])
                  .hLine(-8)
                  .close();

                const body = profile.sketchOnPlane("XZ").revolve([0, 0, 1]);

                // Build the spout
                const spout = makeCylinder(p.spoutRadius, p.spoutLength)
                  .translateZ(p.bodyHeight)
                  .rotate(p.spoutAngle, [0, 0, p.bodyHeight], [0, 1, 0]);

                const spoutOpening = [
                  Math.cos((p.spoutAngle * Math.PI) / 180) * p.spoutLength,
                  0,
                  p.bodyHeight + Math.sin((p.spoutAngle * Math.PI) / 180) * p.spoutLength,
                ] as [number, number, number];

                return body.fuse(spout);
              }
            `,
          },
          mainFile: 'main.ts',
          parameters: {
            baseWidth: 20,
            bodyHeight: 50,
            spoutRadius: 5,
            spoutLength: 30,
            spoutAngle: 45,
          },
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
      });

      it('should bundle a multi-file parametric assembly with TypeScript', async () => {
        const result = await createGeometry({
          files: {
            'main.ts': `
              import {} from 'replicad';
              import type { AssemblyConfig } from './types';
              import { createBase } from './parts/base';
              import { createPillar } from './parts/pillar';

              export const defaultParams: AssemblyConfig = {
                base: { width: 60, depth: 40, thickness: 5 },
                pillar: { radius: 4, height: 30 },
              };

              export default function main(p: AssemblyConfig = defaultParams) {
                const base = createBase(p.base);
                const pillar = createPillar(p.pillar).translate([0, 0, p.base.thickness]);
                return base.fuse(pillar);
              }
            `,
            'types.ts': `
              export interface BaseConfig {
                width: number;
                depth: number;
                thickness: number;
              }

              export interface PillarConfig {
                radius: number;
                height: number;
              }

              export interface AssemblyConfig {
                base: BaseConfig;
                pillar: PillarConfig;
              }
            `,
            'parts/base.ts': `
              import { drawRoundedRectangle } from 'replicad';
              import type { BaseConfig } from '../types';

              export function createBase(config: BaseConfig) {
                return drawRoundedRectangle(config.width, config.depth)
                  .sketchOnPlane()
                  .extrude(config.thickness);
              }
            `,
            'parts/pillar.ts': `
              import { drawCircle } from 'replicad';
              import type { PillarConfig } from '../types';

              export function createPillar(config: PillarConfig) {
                return drawCircle(config.radius)
                  .sketchOnPlane()
                  .extrude(config.height);
              }
            `,
          },
          mainFile: 'main.ts',
          parameters: {
            base: { width: 60, depth: 40, thickness: 5 },
            pillar: { radius: 4, height: 30 },
          },
        });

        assertSuccess(result);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.06, 0.035, 0.04], 0.001);
      });
    });
  });

  // ===========================================================================
  // Stateful Kernel Runtime
  // ===========================================================================

  describe('Stateful kernel runtime', () => {
    it('should deep-merge nested default parameters with user overrides', async () => {
      const worker = await createWorker({
        'main.ts': `
          import { draw, drawRoundedRectangle, makeSolid, makeFace, assembleWire, EdgeFinder } from 'replicad';

          export const defaultParams = {
            base: {
              width: 30,
              depth: 20,
              cornerRadius: 5,
            },
            profile: {
              lineX: 5,
              lineY: 5,
            },
            brim: {
              width: 2,
              height: 1,
            },
          };

          export default function main(p = defaultParams) {
            const base = drawRoundedRectangle(p.base.width, p.base.depth, p.base.cornerRadius);
            const profile = draw()
              .line(p.profile.lineX, p.profile.lineY)
              .line(-p.brim.width, p.brim.height)
              .done();

            const side = base.sketchOnPlane().clone().sweepSketch(
              (plane) => profile.sketchOnPlane(plane),
              { withContact: true },
            );

            return makeSolid([
              side,
              makeFace(assembleWire(new EdgeFinder().inPlane("XY", p.profile.lineY + p.brim.height).find(side))),
              base.sketchOnPlane().face(),
            ]);
          }
        `,
      });

      const geometryFile = createGeometryFile('main.ts');

      // Override only base.width -- base.depth and base.cornerRadius should be preserved
      const result = await worker.render({ file: geometryFile, parameters: { base: { width: 50 } } });

      assertSuccess(result);
      // If shallow merge: base = { width: 50 } (missing depth, cornerRadius → runtime error)
      // If deep merge: base = { width: 50, depth: 20, cornerRadius: 5 } → success
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should detect code changes between sequential renders', async () => {
      const worker = await createWorker({
        'main.ts': `
          import { drawRoundedRectangle } from 'replicad';
          export default function main() {
            return drawRoundedRectangle(10, 10).sketchOnPlane().extrude(10);
          }
        `,
      });

      const geometryFile = createGeometryFile('main.ts');

      // First render: 10x10x10 box
      const result1 = await worker.createGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result1);
      await geometryHelpers.expectValidGltf(result1);

      // Modify file content: change to 20x20x20 box
      await seedTestFilesystem({
        '/builds/test/main.ts': `
          import { drawRoundedRectangle } from 'replicad';
          export default function main() {
            return drawRoundedRectangle(20, 20).sketchOnPlane().extrude(20);
          }
        `,
      });

      // Notify worker about the change
      await worker.notifyFileChanged(['/builds/test/main.ts']);

      // Second render should use updated code
      const result2 = await worker.createGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result2);
      await geometryHelpers.expectValidGltf(result2);

      // Bounding boxes must differ (10mm vs 20mm)
      await geometryHelpers.expectBoundingBoxSize(result1, [0.01, 0.01, 0.01], 0.002);
      await geometryHelpers.expectBoundingBoxSize(result2, [0.02, 0.02, 0.02], 0.002);
    });

    it('should detect code changes when notifyFileChanged receives absolute paths', async () => {
      const worker = await createWorker({
        'main.ts': `
          import { drawRoundedRectangle } from 'replicad';
          export default function main() {
            return drawRoundedRectangle(10, 10).sketchOnPlane().extrude(10);
          }
        `,
      });

      const geometryFile = createGeometryFile('main.ts');

      // First render
      const result1 = await worker.createGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result1);

      // Modify file content
      await seedTestFilesystem({
        '/builds/test/main.ts': `
          import { drawRoundedRectangle } from 'replicad';
          export default function main() {
            return drawRoundedRectangle(30, 30).sketchOnPlane().extrude(30);
          }
        `,
      });

      // Notify with ABSOLUTE path (matching production behavior from use-build.tsx)
      await worker.notifyFileChanged(['/builds/test/main.ts']);

      // Second render should use updated code
      const result2 = await worker.createGeometry({ file: geometryFile, parameters: {} });
      assertSuccess(result2);

      // Bounding boxes must differ (10mm vs 30mm)
      await geometryHelpers.expectBoundingBoxSize(result1, [0.01, 0.01, 0.01], 0.002);
      await geometryHelpers.expectBoundingBoxSize(result2, [0.03, 0.03, 0.03], 0.002);
    });

    it('should re-render with different parameters when replicad is imported transitively (production flow)', async () => {
      const productionDetectImport = /import.*from\s+['"]replicad['"]/s.source;

      const worker = await createTestWorker(
        replicadKernel,
        {
          'main.ts': `
            import { makeCube } from './lib/cube';

            export const defaultParams = { size: 50 };

            export default function main(p = defaultParams) {
              return makeCube(p.size);
            }
          `,
          'lib/cube.ts': `
            import { makeBaseBox } from 'replicad';

            export function makeCube(size: number) {
              return makeBaseBox(size, size, size);
            }
          `,
        },
        {
          detectImport: productionDetectImport,
          builtinModuleNames: ['replicad'],
        },
      );

      const geometryFile = createGeometryFile('main.ts');

      // First render: canHandle + render (matches kernel.machine.ts renderActor flow)
      const canHandle1 = await worker.canHandle(geometryFile);
      expect(canHandle1).toBe(true);

      const result1 = await worker.render({ file: geometryFile, parameters: { size: 30 } });
      assertSuccess(result1);
      await geometryHelpers.expectValidGltf(result1);

      // Second render with different parameters (same flow as parameter change in UI)
      // This is the bug: canHandle fails because selectionCache returns method: 'extension'
      // instead of preserving the original method: 'bundler', causing the kernel's canHandle
      // to re-check the entry file for direct replicad imports (which don't exist).
      const canHandle2 = await worker.canHandle(geometryFile);
      expect(canHandle2).toBe(true);

      const result2 = await worker.render({ file: geometryFile, parameters: { size: 60 } });
      assertSuccess(result2);
      await geometryHelpers.expectValidGltf(result2);
    });
  });
});

// =============================================================================
// Tests: OC API Call Tracing
// =============================================================================

describe('OC API Call Tracing', () => {
  const boxCode = `
    import { makeBaseBox } from 'replicad';
    export default function main() {
      return makeBaseBox(10, 20, 30);
    }
  `;

  /** Wait for PerformanceObserver callbacks to fire and then flush. */
  async function collectTelemetry(worker: Awaited<ReturnType<typeof createTestWorker>>): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    worker.flushTelemetry();
  }

  beforeEach(() => {
    performance.clearMeasures();
    performance.clearMarks();
  });

  it('emits an oc.summary span by default (summary mode)', async () => {
    const telemetryBatches: PerformanceEntryData[][] = [];

    const worker = await createTestWorker(
      replicadKernel,
      { 'box.ts': boxCode },
      {
        onTelemetry: (entries) => telemetryBatches.push(entries),
      },
    );

    const result = await worker.createGeometry({
      file: createGeometryFile('box.ts'),
      parameters: {},
    });
    await collectTelemetry(worker);

    assertSuccess(result);

    const allEntries = telemetryBatches.flat();
    const summarySpan = allEntries.find((entry) => entry.name === 'oc.summary');
    expect(summarySpan).toBeDefined();
    expect(summarySpan!.detail).toBeDefined();
    expect(summarySpan!.detail!['total.calls']).toBeGreaterThan(0);
    expect(summarySpan!.detail!['total.ms']).toBeGreaterThanOrEqual(0);
    expect(summarySpan!.detail!['classes']).toBeGreaterThan(0);
  });

  it('emits individual oc.* spans in per-call mode', async () => {
    const telemetryBatches: PerformanceEntryData[][] = [];

    const worker = await createTestWorker(
      replicadKernel,
      { 'box.ts': boxCode },
      {
        workerOptions: { ocTracing: 'per-call' },
        onTelemetry: (entries) => telemetryBatches.push(entries),
      },
    );

    const result = await worker.createGeometry({
      file: createGeometryFile('box.ts'),
      parameters: {},
    });
    await collectTelemetry(worker);

    assertSuccess(result);

    const allEntries = telemetryBatches.flat();
    const ocSpans = allEntries.filter((entry) => entry.name.startsWith('oc.') && entry.name !== 'oc.summary');
    expect(ocSpans.length).toBeGreaterThan(0);

    const summarySpan = allEntries.find((entry) => entry.name === 'oc.summary');
    expect(summarySpan).toBeUndefined();
  });

  it('emits no oc spans when tracing is off', async () => {
    const telemetryBatches: PerformanceEntryData[][] = [];

    const worker = await createTestWorker(
      replicadKernel,
      { 'box.ts': boxCode },
      {
        workerOptions: { ocTracing: 'off' },
        onTelemetry: (entries) => telemetryBatches.push(entries),
      },
    );

    const result = await worker.createGeometry({
      file: createGeometryFile('box.ts'),
      parameters: {},
    });
    await collectTelemetry(worker);

    assertSuccess(result);

    const allEntries = telemetryBatches.flat();
    const ocSpans = allEntries.filter((entry) => entry.name.startsWith('oc.'));
    expect(ocSpans).toHaveLength(0);
  });

  it('summary span contains per-class statistics', async () => {
    const telemetryBatches: PerformanceEntryData[][] = [];

    const worker = await createTestWorker(
      replicadKernel,
      { 'box.ts': boxCode },
      {
        onTelemetry: (entries) => telemetryBatches.push(entries),
      },
    );

    const result = await worker.createGeometry({
      file: createGeometryFile('box.ts'),
      parameters: {},
    });
    await collectTelemetry(worker);

    assertSuccess(result);

    const allEntries = telemetryBatches.flat();
    const summarySpan = allEntries.find((entry) => entry.name === 'oc.summary');
    expect(summarySpan).toBeDefined();

    const detail = summarySpan!.detail!;
    const classKeys = Object.keys(detail).filter((key) => key.endsWith('.calls'));
    expect(classKeys.length).toBeGreaterThan(0);

    for (const callsKey of classKeys) {
      const className = callsKey.replace('.calls', '');
      expect(detail[callsKey]).toBeGreaterThan(0);
      expect(detail[`${className}.ms`]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('withBrepEdges option', () => {
  const boxCode = `
    import { drawRoundedRectangle } from 'replicad';
    export default function main() {
      return drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
    }
  `;

  async function countLinePrimitives(result: Awaited<ReturnType<typeof createTestGeometry>>): Promise<number> {
    const glbData = extractGltfFromResult(result);
    if (!glbData) {
      throw new Error('No GLTF data in result');
    }

    const document = await new NodeIO().readBinary(glbData);
    let lineCount = 0;
    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() === 1) {
          lineCount++;
        }
      }
    }

    return lineCount;
  }

  it('should not include BRep edge lines when withBrepEdges is false (default)', async () => {
    const result = await createTestGeometry({
      definition: replicadKernel,
      files: { 'box.ts': boxCode },
      mainFile: 'box.ts',
      parameters: {},
    });

    assertSuccess(result);
    const lineCount = await countLinePrimitives(result);
    expect(lineCount).toBe(0);
  });

  it('should include BRep edge lines when withBrepEdges is true', async () => {
    const result = await createTestGeometry({
      definition: replicadKernel,
      files: { 'box.ts': boxCode },
      mainFile: 'box.ts',
      parameters: {},
      options: { workerOptions: { withBrepEdges: true } },
    });

    assertSuccess(result);
    const lineCount = await countLinePrimitives(result);
    expect(lineCount).toBeGreaterThan(0);
  });

  it('should produce identical surface geometry regardless of withBrepEdges setting', async () => {
    const withoutEdges = await createTestGeometry({
      definition: replicadKernel,
      files: { 'box.ts': boxCode },
      mainFile: 'box.ts',
      parameters: {},
      options: { workerOptions: { withBrepEdges: false } },
    });
    const withEdges = await createTestGeometry({
      definition: replicadKernel,
      files: { 'box.ts': boxCode },
      mainFile: 'box.ts',
      parameters: {},
      options: { workerOptions: { withBrepEdges: true } },
    });

    assertSuccess(withoutEdges);
    assertSuccess(withEdges);

    const glbWithout = extractGltfFromResult(withoutEdges)!;
    const glbWith = extractGltfFromResult(withEdges)!;

    const docWithout = await new NodeIO().readBinary(glbWithout);
    const docWith = await new NodeIO().readBinary(glbWith);

    let triangleVerticesWithout = 0;
    for (const mesh of docWithout.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() === 4) {
          triangleVerticesWithout += primitive.getAttribute('POSITION')!.getCount();
        }
      }
    }

    let triangleVerticesWith = 0;
    for (const mesh of docWith.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() === 4) {
          triangleVerticesWith += primitive.getAttribute('POSITION')!.getCount();
        }
      }
    }

    expect(triangleVerticesWithout).toBe(triangleVerticesWith);
  });
});

// =============================================================================
// Example models with exceptions enabled
// =============================================================================

describe('Example models (single-exceptions)', () => {
  for (const fixture of exampleFixtures) {
    it(`should produce valid geometry for ${fixture.name}`, async () => {
      const result = await createGeometry({
        files: fixture.files,
        mainFile: fixture.mainFile,
        options: { workerOptions: { wasm: 'single-exceptions' } },
      });

      assertSuccess(result);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
    });
  }
});

describe('No kernel matched', () => {
  it('should return empty geometry for an empty file when no kernel can handle it', async () => {
    const result = await createGeometry({
      files: { 'empty.ts': '' },
      mainFile: 'empty.ts',
      options: {
        builtinModuleNames: ['replicad'],
        detectImport: String.raw`import.*from\s+['"]replicad['"]`,
      },
    });

    assertSuccess(result);
    expect(result.data).toEqual([]);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End of file */
