// @vitest-environment node
import { describe, it, expect } from 'vitest';
import manifoldKernel from '#kernels/manifold/manifold.kernel.js';
import { createGeometryTestHelpers } from '#testing/kernel-geometry-testing.utils.js';
import {
  createGeometryFile,
  createTestWorker,
  createTestGeometry,
  getTestParameters,
} from '#testing/kernel-testing.utils.js';

/* eslint-disable @typescript-eslint/naming-convention -- test fixture filenames include extensions */

const createWorker = async (files: Record<string, string>): ReturnType<typeof createTestWorker> =>
  createTestWorker(manifoldKernel, files);

const getParameters = async (
  files: Record<string, string>,
  mainFile: string,
): Promise<{ jsonSchema: unknown; defaultParameters: Record<string, unknown> }> =>
  getTestParameters(manifoldKernel, files, mainFile);

const createGeometry = async (
  files: Record<string, string>,
  mainFile: string,
  parameters: Record<string, unknown> = {},
): ReturnType<typeof createTestGeometry> =>
  createTestGeometry({ definition: manifoldKernel, files, mainFile, parameters });

const geometryHelpers = createGeometryTestHelpers();

describe('ManifoldWorker', () => {
  describe('canHandle', () => {
    it('should handle TypeScript files importing manifold-3d/manifoldCAD', async () => {
      const worker = await createWorker({
        'cube.ts': `
          import { Manifold } from 'manifold-3d/manifoldCAD';

          export default function main() {
            return Manifold.cube([10, 10, 10], true);
          }
        `,
      });

      const result = await worker.canHandle(createGeometryFile('cube.ts'));
      expect(result).toBe(true);
    });

    it('should handle JavaScript files requiring manifold-3d', async () => {
      const worker = await createWorker({
        'cube.js': `
          const Module = require('manifold-3d');

          async function main() {
            const manifold = await Module.default();
            manifold.setup();
            return manifold.Manifold.cube([10, 10, 10], true);
          }

          module.exports = { main };
        `,
      });

      const result = await worker.canHandle(createGeometryFile('cube.js'));
      expect(result).toBe(true);
    });

    it('should handle files with dynamic imports of manifold-3d', async () => {
      const worker = await createWorker({
        'dynamic.ts': `
          export default async function main() {
            const module = await import('manifold-3d/manifoldCAD');
            return module.Manifold.cube([10, 10, 10], true);
          }
        `,
      });

      const result = await worker.canHandle(createGeometryFile('dynamic.ts'));
      expect(result).toBe(true);
    });

    it('should not handle TS files without manifold imports', async () => {
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

    it('should not handle unsupported file extensions', async () => {
      const worker = await createWorker({
        'model.scad': 'cube([10, 10, 10]);',
      });

      const result = await worker.canHandle(createGeometryFile('model.scad'));
      expect(result).toBe(false);
    });
  });

  describe('getParameters', () => {
    it('should extract defaultParams from ESM module', async () => {
      const { defaultParameters, jsonSchema } = await getParameters(
        {
          'params.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export const defaultParams = {
              size: 20,
              centered: true,
            };

            export default function main(p = defaultParams) {
              return Manifold.cube([p.size, p.size, p.size], p.centered);
            }
          `,
        },
        'params.ts',
      );

      expect(defaultParameters).toEqual({ size: 20, centered: true });
      expect(jsonSchema).toMatchObject({
        type: 'object',
        properties: {
          size: { type: 'integer', default: 20 },
          centered: { type: 'boolean', default: true },
        },
      });
    });

    it('should extract defaultParameters alias', async () => {
      const { defaultParameters } = await getParameters(
        {
          'params.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export const defaultParameters = {
              radius: 15,
            };

            export default function main(p = defaultParameters) {
              return Manifold.sphere(p.radius);
            }
          `,
        },
        'params.ts',
      );

      expect(defaultParameters).toEqual({ radius: 15 });
    });

    it('should return empty parameter defaults when none are exported', async () => {
      const { defaultParameters } = await getParameters(
        {
          'no-params.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default function main() {
              return Manifold.cube([10, 10, 10], true);
            }
          `,
        },
        'no-params.ts',
      );

      expect(defaultParameters).toEqual({});
    });
  });

  describe('createGeometry', () => {
    it('should compute GLTF geometry for a simple cube', async () => {
      const result = await createGeometry(
        {
          'cube.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default function main() {
              return Manifold.cube([10, 10, 10], true);
            }
          `,
        },
        'cube.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
      await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.01, 0.01], 0.0005);
    });

    it('should compute geometry using runtime parameters', async () => {
      const result = await createGeometry(
        {
          'cube.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export const defaultParams = { size: 20 };

            export default function main(p = defaultParams) {
              return Manifold.cube([p.size, p.size, p.size], true);
            }
          `,
        },
        'cube.ts',
        { size: 30 },
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectBoundingBoxSize(result, [0.03, 0.03, 0.03], 0.0005);
    });

    it('should support default export as async function', async () => {
      const result = await createGeometry(
        {
          'async-main.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default async function main() {
              return Manifold.sphere(10);
            }
          `,
        },
        'async-main.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
    });

    it('should return warning when main does not return any geometry', async () => {
      const result = await createGeometry(
        {
          'no-return.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default function main() {
              Manifold.cube([10, 10, 10], true);
            }
          `,
        },
        'no-return.ts',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.issues.some((issue) => issue.severity === 'warning')).toBe(true);
        expect(result.issues.some((issue) => issue.message.includes('did not return any model'))).toBe(true);
      }
    });

    it('should return failure for syntax errors', async () => {
      const result = await createGeometry(
        {
          'syntax-error.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default function main() {
              return Manifold.cube([10, 10, 10], true
            }
          `,
        },
        'syntax-error.ts',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]?.message.length).toBeGreaterThan(0);
      }
    });

    it('should compute geometry from non-function default export (Manifold value)', async () => {
      const result = await createGeometry(
        {
          'value-export.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            const cube = Manifold.cube([10, 10, 10], true);
            export default cube;
          `,
        },
        'value-export.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
    });

    it('should compute geometry from GLTFNode side-effect pattern (non-function default export)', async () => {
      const result = await createGeometry(
        {
          'gltf-nodes.ts': `
            import { GLTFNode, getGLTFNodes, Manifold } from 'manifold-3d/manifoldCAD';

            const node = new GLTFNode();
            node.manifold = Manifold.cube([10, 10, 10], true);

            export default getGLTFNodes();
          `,
        },
        'gltf-nodes.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
    });

    it('should return failure for runtime errors thrown by user code', async () => {
      const result = await createGeometry(
        {
          'runtime-error.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default function main() {
              throw new Error('manifold boom');
            }
          `,
        },
        'runtime-error.ts',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]?.message).toContain('manifold boom');
      }
    });
  });

  describe('exportGeometry', () => {
    it('should export GLB after successful geometry creation', async () => {
      const worker = await createWorker({
        'cube.ts': `
          import { Manifold } from 'manifold-3d/manifoldCAD';

          export default function main() {
            return Manifold.cube([10, 10, 10], true);
          }
        `,
      });

      const createResult = await worker.createGeometry({ file: createGeometryFile('cube.ts'), parameters: {} });
      expect(createResult.success).toBe(true);

      const exportResult = await worker.exportGeometry('glb');
      expect(exportResult.success).toBe(true);
      if (exportResult.success) {
        expect(exportResult.data[0]?.bytes).toBeInstanceOf(Uint8Array);
      }
    });

    it('should export GLTF after successful geometry creation', async () => {
      const worker = await createWorker({
        'cube.ts': `
          import { Manifold } from 'manifold-3d/manifoldCAD';

          export default function main() {
            return Manifold.cube([10, 10, 10], true);
          }
        `,
      });

      const createResult = await worker.createGeometry({ file: createGeometryFile('cube.ts'), parameters: {} });
      expect(createResult.success).toBe(true);

      const exportResult = await worker.exportGeometry('gltf');
      expect(exportResult.success).toBe(true);
      if (exportResult.success) {
        expect(exportResult.data[0]?.mimeType).toBe('model/gltf+json');
      }
    });

    it('should return error when exporting before creating geometry', async () => {
      const worker = await createWorker({
        'cube.ts': `
          import { Manifold } from 'manifold-3d/manifoldCAD';

          export default function main() {
            return Manifold.cube([10, 10, 10], true);
          }
        `,
      });

      const exportResult = await worker.exportGeometry('glb');
      expect(exportResult.success).toBe(false);
    });

    it('should return error for unsupported export formats', async () => {
      const worker = await createWorker({
        'cube.ts': `
          import { Manifold } from 'manifold-3d/manifoldCAD';

          export default function main() {
            return Manifold.cube([10, 10, 10], true);
          }
        `,
      });

      await worker.createGeometry({ file: createGeometryFile('cube.ts'), parameters: {} });
      const exportResult = await worker.exportGeometry('step');
      expect(exportResult.success).toBe(false);
    });
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- end test fixture block */
