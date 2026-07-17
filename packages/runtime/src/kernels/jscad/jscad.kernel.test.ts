// @vitest-environment node
/* oxlint-disable max-lines -- comprehensive kernel test suite */
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any in structured assertions. */
/* eslint-disable @typescript-eslint/naming-convention -- File names use extensions like 'box.ts' */
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';
import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import type { JSONSchema7 } from '@taucad/json-schema';
import { describe, it, expect, beforeAll } from 'vitest';
import { jscad as jscadKernel } from '#kernels/jscad/jscad.kernel.js';
import { resolveJscadModeling } from '#kernels/jscad/jscad-modeling.js';
import { jscadToGltf } from '#kernels/jscad/jscad-to-gltf.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import {
  createGeometryTestHelpers,
  extractGltfFromExportResult,
  extractGltfFromResult,
} from '#testing/kernel-geometry-testing.utils.js';
import {
  createGeometryFile,
  createMockKernelRuntime,
  createTestWorker,
  createTestGeometry,
  getTestParameters,
} from '#testing/kernel-testing.utils.js';
import { geometryMemoryCache, exportMemoryCache } from '#middleware/geometry-cache.middleware.js';
import { createNodeClient } from '#node.js';

// =============================================================================
// Test Utilities
// =============================================================================

/** Create a runtime worker for testing with the provided files. */
const createWorker = async (files: Record<string, string>): ReturnType<typeof createTestWorker> =>
  createTestWorker(jscadKernel, files);

type JscadSerializedNativeHandleEntry = { type: 'geom2' | 'geom3' | 'path2'; data: Float32Array; name?: string };

/** Helper to extract parameters and assert success. */
const getParameters = async (
  files: Record<string, string>,
  mainFile: string,
): Promise<{
  jsonSchema: JSONSchema7;
  defaultParameters: Record<string, unknown>;
}> => getTestParameters(jscadKernel, files, mainFile);

/** Helper to create geometry and return the result. */
const createGeometry = async (
  files: Record<string, string>,
  mainFile: string,
  parameters: Record<string, unknown> = {},
): ReturnType<typeof createTestGeometry> =>
  createTestGeometry({ definition: jscadKernel, files, mainFile, parameters });

// Create geometry test helpers instance for geometry assertions
const geometryHelpers = createGeometryTestHelpers();
const primitiveModeTriangles = 4;
const primitiveModeLines = 1;

const createNodeIo = (): NodeIO => new NodeIO().registerExtensions([KHRMaterialsUnlit]);

const resolveJscadDefinition = async () => resolveRuntimePluginDefinition('kernel', jscadKernel());
let jscadDefinition: Awaited<ReturnType<typeof resolveJscadDefinition>>;

const readNodeMeshNames = async (
  glb: Uint8Array<ArrayBuffer>,
): Promise<{ nodeNames: Array<string | undefined>; meshNames: Array<string | undefined> }> => {
  const document = await createNodeIo().readBinary(glb);
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
};

const readPrimitiveModes = async (glb: Uint8Array<ArrayBuffer>): Promise<number[][]> => {
  const document = await createNodeIo().readBinary(glb);
  return document
    .getRoot()
    .listMeshes()
    .map((mesh) => mesh.listPrimitives().map((primitive) => primitive.getMode()));
};

const readNodeMeshNamesFromResult = async (
  result: Awaited<ReturnType<typeof createGeometry>>,
): Promise<{ nodeNames: Array<string | undefined>; meshNames: Array<string | undefined> }> => {
  const glb = extractGltfFromResult(result);
  expect(glb).toBeDefined();
  return readNodeMeshNames(glb!);
};

const jscadCubeCutoutSource = `
  import { primitives, booleans } from '@jscad/modeling';

  export const defaultParams = {
    cubeSize: 50,
    cylinderRadius: 10,
    cylinderHeight: 60,
  };

  export default function main(p = defaultParams) {
    const params = { ...defaultParams, ...p };
    const cube = primitives.cuboid({
      size: [params.cubeSize, params.cubeSize, params.cubeSize],
      center: [0, 0, params.cubeSize / 2],
    });
    const cylinder = primitives.cylinder({
      radius: params.cylinderRadius,
      height: params.cylinderHeight,
      center: [0, 0, params.cubeSize / 2],
      segments: 64,
    });
    return booleans.subtract(cube, cylinder);
  }
`;

const jscadGlbExportOptions = {
  coordinateSystem: 'z-up',
  unit: { length: 'millimeter' },
} as const;

describe('JscadWorker', () => {
  beforeAll(async () => {
    jscadDefinition = await resolveJscadDefinition();
  });

  describe('modeling import resolution', () => {
    it('should resolve the Node ESM package import shape through default', async () => {
      const module = await import('@jscad/modeling');
      const modeling = resolveJscadModeling(module);

      expect(modeling.geometries.geom3).toBeDefined();
      expect(modeling.geometries.geom2).toBeDefined();
      expect(modeling.geometries.path2).toBeDefined();
      expect(modeling.modifiers.generalize).toBeTypeOf('function');
    });
  });

  // ===========================================================================
  // Tests: Parameter Extraction
  // ===========================================================================

  describe('getParameters', () => {
    describe('ESM style - defaultParams export', () => {
      it('should extract defaultParams from exported const', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'cube.ts': `
              import { primitives } from '@jscad/modeling';

              export const defaultParams = {
                size: 20,
              };

              export default function main(p = defaultParams) {
                return primitives.cube({ size: p.size });
              }
            `,
          },
          'cube.ts',
        );

        expect(defaultParameters).toEqual({ size: 20 });
        expect(jsonSchema).toMatchObject({
          type: 'object',
          properties: {
            size: { type: 'integer', default: 20 },
          },
        });
      });

      it('should extract multiple parameters', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'cylinder.ts': `
              import { primitives } from '@jscad/modeling';

              export const defaultParams = {
                height: 20,
                radius: 8,
                segments: 48,
              };

              export default function main(p = defaultParams) {
                return primitives.cylinder({ height: p.height, radius: p.radius, segments: p.segments });
              }
            `,
          },
          'cylinder.ts',
        );

        expect(defaultParameters).toEqual({
          height: 20,
          radius: 8,
          segments: 48,
        });
        expect(jsonSchema).toMatchObject({
          type: 'object',
          properties: {
            height: { type: 'integer', default: 20 },
            radius: { type: 'integer', default: 8 },
            segments: { type: 'integer', default: 48 },
          },
        });
      });
    });

    describe('CommonJS style - getParameterDefinitions', () => {
      it('should extract parameters from getParameterDefinitions function', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'gear.js': `
              const jscad = require('@jscad/modeling');
              const { cube } = jscad.primitives;

              const getParameterDefinitions = () => [
                { name: 'numTeeth', caption: 'Number of teeth:', type: 'int', initial: 10, min: 5, max: 20 },
                { name: 'thickness', caption: 'Thickness:', type: 'float', initial: 5, min: 0 },
              ];

              const main = (params) => {
                return cube({ size: params.numTeeth });
              };

              module.exports = { main, getParameterDefinitions };
            `,
          },
          'gear.js',
        );

        expect(defaultParameters).toEqual({ numTeeth: 10, thickness: 5 });
        expect(jsonSchema).toMatchObject({
          type: 'object',
          properties: {
            numTeeth: { type: 'integer', default: 10, minimum: 5, maximum: 20 },
            thickness: { type: 'number', default: 5, minimum: 0 },
          },
        });
      });
    });

    describe('Edge cases', () => {
      it('should return empty parameters for file without defaultParams', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'cube.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                return primitives.cube({ size: 10 });
              }
            `,
          },
          'cube.ts',
        );

        expect(defaultParameters).toEqual({});
        expect(jsonSchema).toMatchObject({
          type: 'object',
        });
      });

      it('should handle boolean parameters', async () => {
        const { defaultParameters } = await getParameters(
          {
            'cube.ts': `
              import { primitives } from '@jscad/modeling';

              export const defaultParams = {
                centered: true,
              };

              export default function main(p = defaultParams) {
                return primitives.cube({ size: 10, center: [0, 0, 0] });
              }
            `,
          },
          'cube.ts',
        );

        expect(defaultParameters).toEqual({ centered: true });
      });

      it('should handle string parameters', async () => {
        const { defaultParameters } = await getParameters(
          {
            'cube.ts': `
              import { primitives } from '@jscad/modeling';

              export const defaultParams = {
                mode: 'normal',
              };

              export default function main(p = defaultParams) {
                return primitives.cube({ size: 10 });
              }
            `,
          },
          'cube.ts',
        );

        expect(defaultParameters).toEqual({ mode: 'normal' });
      });
    });
  });

  // ===========================================================================
  // Tests: Geometry Computation
  // ===========================================================================

  describe('createGeometry', () => {
    describe('Basic geometry - ESM style', () => {
      it('should compute geometry for a simple cube', async () => {
        const result = await createGeometry(
          {
            'cube.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                return primitives.cube({ size: 10 });
              }
            `,
          },
          'cube.ts',
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBeDefined();
          expect(result.data.format).toBe('gltf');
        }

        // Geometry quality assertions (10x10x10 cube)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.01, 0.01], 0.0005);
      });

      it('should compute geometry with parameters', async () => {
        const result = await createGeometry(
          {
            'cube.ts': `
              import { primitives } from '@jscad/modeling';

              export const defaultParams = { size: 20 };

              export default function main(p = defaultParams) {
                return primitives.cube({ size: p.size });
              }
            `,
          },
          'cube.ts',
          { size: 30 },
        );

        expect(result.success).toBe(true);

        // Geometry should use parameter value (30x30x30 cube)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.03, 0.03, 0.03], 0.0005);
      });

      it('should handle JSCAD minimal starter pattern with destructured primitives', async () => {
        // This is the JSCAD minimal starter pattern that uses destructured primitives
        // Note: In production, kernel.machine.ts merges defaultParams with passed parameters.
        // In tests, we pass the default parameters explicitly.
        const result = await createGeometry(
          {
            'main.ts': `
              // JSCAD minimal starter
              // This code requires the @jscad/modeling API at runtime.
              import { primitives } from '@jscad/modeling';
              const { cube } = primitives;

              export const defaultParams = { size: 20 };

              export default function main(p = defaultParams) {
                return cube({ size: p.size });
              }
            `,
          },
          'main.ts',
          { size: 20 }, // Pass default parameters explicitly for tests
        );

        expect(result.success).toBe(true);

        // Geometry should use default parameter value (20x20x20 cube)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.02, 0.02, 0.02], 0.0005);
      });

      it('should compute geometry for a cylinder', async () => {
        const result = await createGeometry(
          {
            'cylinder.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                return primitives.cylinder({ height: 20, radius: 5 });
              }
            `,
          },
          'cylinder.ts',
        );

        expect(result.success).toBe(true);

        // Cylinder: radius 5 (diameter 10), height 20
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.02, 0.01], 0.0005);
      });

      it('should compute geometry for a sphere', async () => {
        const result = await createGeometry(
          {
            'sphere.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                return primitives.sphere({ radius: 10 });
              }
            `,
          },
          'sphere.ts',
        );

        expect(result.success).toBe(true);

        // Sphere: radius 10 (diameter 20)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.02, 0.02, 0.02], 0.0005);
      });

      it('should handle multiple shapes returned as array', async () => {
        const result = await createGeometry(
          {
            'multi.ts': `
              import { primitives, transforms } from '@jscad/modeling';

              export default function main() {
                const housing = Object.assign(primitives.cube({ size: 10 }), { name: 'Housing' });
                const sunGear = Object.assign(
                  transforms.translate([20, 0, 0], primitives.cube({ size: 10 })),
                  { name: 'Sun Gear' },
                );
                const planetGear = Object.assign(
                  transforms.translate([40, 0, 0], primitives.cube({ size: 10 })),
                  { name: 'Planet Gear' },
                );
                return [housing, [sunGear, planetGear]];
              }
            `,
          },
          'multi.ts',
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.format).toBe('gltf');
        }

        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 3);

        const { nodeNames, meshNames } = await readNodeMeshNamesFromResult(result);
        expect(nodeNames).toEqual(['Housing', 'Sun Gear', 'Planet Gear']);
        expect(meshNames).toEqual(nodeNames);

        const glb = extractGltfFromResult(result);
        expect(glb).toBeDefined();
        const primitiveModes = await readPrimitiveModes(glb!);
        expect(primitiveModes).toEqual([
          [primitiveModeTriangles, primitiveModeLines],
          [primitiveModeTriangles, primitiveModeLines],
          [primitiveModeTriangles, primitiveModeLines],
        ]);
      });
    });

    describe('Basic geometry - CommonJS style', () => {
      it('should compute geometry using require syntax', async () => {
        const result = await createGeometry(
          {
            'cube.js': `
              const jscad = require('@jscad/modeling');
              const { cube } = jscad.primitives;

              function main() {
                return cube({ size: 10 });
              }

              module.exports = { main };
            `,
          },
          'cube.js',
        );

        expect(result.success).toBe(true);

        // Geometry quality assertions (10x10x10 cube)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.01, 0.01], 0.0005);
      });

      it('should handle CommonJS with "use strict" and multiple destructured requires', async () => {
        const result = await createGeometry(
          {
            'gear.js': `
"use strict"

const jscad = require('@jscad/modeling')
const { cylinder, polygon } = jscad.primitives
const { rotateZ } = jscad.transforms
const { extrudeLinear } = jscad.extrusions
const { union, subtract } = jscad.booleans
const { vec2 } = jscad.maths
const { degToRad } = jscad.utils

const getParameterDefinitions = () => [
  { name: 'numTeeth', caption: 'Number of teeth:', type: 'int', initial: 10, min: 5, max: 20 },
  { name: 'circularPitch', caption: 'Circular pitch:', type: 'float', initial: 5 },
  { name: 'thickness', caption: 'Thickness:', type: 'float', initial: 5, min: 0 },
]

const main = (params) => {
  // Simplified gear for test - just a cylinder
  const gear = cylinder({
    height: params.thickness,
    radius: params.numTeeth * params.circularPitch / (2 * Math.PI),
    center: [0, 0, params.thickness / 2],
    segments: 32
  })
  return gear
}

module.exports = { main, getParameterDefinitions }
            `,
          },
          'gear.js',
          { numTeeth: 10, circularPitch: 5, thickness: 5 },
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
      });

      it('should compute geometry with params in CommonJS style', async () => {
        const result = await createGeometry(
          {
            'cube.js': `
              const jscad = require('@jscad/modeling');
              const { cube } = jscad.primitives;

              const getParameterDefinitions = () => [
                { name: 'size', type: 'float', initial: 10 },
              ];

              function main(params) {
                return cube({ size: params.size });
              }

              module.exports = { main, getParameterDefinitions };
            `,
          },
          'cube.js',
          { size: 20 },
        );

        expect(result.success).toBe(true);

        // Geometry should use parameter value (20x20x20 cube)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.02, 0.02, 0.02], 0.0005);
      });
    });

    describe('Submodule imports', () => {
      it('should support ESM import from @jscad/modeling/primitives', async () => {
        const result = await createGeometry(
          {
            'cube.ts': `
              import { cuboid } from '@jscad/modeling/primitives';

              export default function main() {
                return cuboid({ size: [10, 10, 10] });
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

      it('should support CJS require of @jscad/modeling/primitives submodule', async () => {
        const result = await createGeometry(
          {
            'cube.js': `
              const { cuboid } = require('@jscad/modeling/primitives');

              function main() {
                return cuboid({ size: [10, 10, 10] });
              }

              module.exports = { main };
            `,
          },
          'cube.js',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.01, 0.01], 0.0005);
      });

      it('should support mixed root and submodule imports', async () => {
        const result = await createGeometry(
          {
            'mixed.ts': `
              import { primitives } from '@jscad/modeling';
              import { union } from '@jscad/modeling/booleans';

              export default function main() {
                const cube1 = primitives.cube({ size: 10 });
                const cube2 = primitives.cube({ size: 8 });
                return union(cube1, cube2);
              }
            `,
          },
          'mixed.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
      });

      it('should support multiple submodule imports', async () => {
        const result = await createGeometry(
          {
            'multi-sub.ts': `
              import { cuboid } from '@jscad/modeling/primitives';
              import { translate } from '@jscad/modeling/transforms';

              export default function main() {
                const cube1 = cuboid({ size: [10, 10, 10] });
                const cube2 = translate([20, 0, 0], cuboid({ size: [10, 10, 10] }));
                return [cube1, cube2];
              }
            `,
          },
          'multi-sub.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
      });

      it('should keep unnamed multi-part assemblies quiet while preserving fallback names', async () => {
        const result = await createGeometry(
          {
            'unnamed.ts': `
              import { primitives, transforms } from '@jscad/modeling';

              export default function main() {
                return [
                  primitives.cube({ size: 10 }),
                  transforms.translate([20, 0, 0], primitives.cube({ size: 8 })),
                ];
              }
            `,
          },
          'unnamed.ts',
        );

        expect(result.success).toBe(true);
        if (!result.success) {
          return;
        }
        expect(result.issues).toEqual([]);
        const { nodeNames, meshNames } = await readNodeMeshNamesFromResult(result);
        expect(nodeNames).toEqual(['Shape 1', 'Shape 2']);
        expect(meshNames).toEqual(['Shape 1', 'Shape 2']);
      });

      it('should warn when JSCAD native validation finds non-manifold 3D mesh CSG', async () => {
        const result = await createGeometry(
          {
            'invalid-union.ts': `
              import { primitives, booleans, transforms } from '@jscad/modeling';

              export default function main() {
                const body = primitives.cylinder({ radius: 20, height: 5, segments: 64 });
                const ear = transforms.translate(
                  [22, 0, 0],
                  primitives.cylinder({ radius: 8, height: 5, segments: 32 }),
                );
                return Object.assign(booleans.union(body, ear), { name: 'Housing' });
              }
            `,
          },
          'invalid-union.ts',
        );

        expect(result.success).toBe(true);
        if (!result.success) {
          return;
        }
        expect(result.data.format).toBe('gltf');
        const invalidIssue = result.issues.find((issue) => issue.code === 'GEOMETRY_INVALID');
        expect(invalidIssue).toBeDefined();
        if (!invalidIssue) {
          return;
        }
        expect(invalidIssue).toEqual(
          expect.objectContaining({
            code: 'GEOMETRY_INVALID',
            severity: 'warning',
            message: expect.stringContaining("JSCAD part 'Housing' is not a closed oriented solid: non-manifold edges"),
            details: expect.objectContaining({
              producer: {
                kernelId: 'jscad',
                validator: 'geom3.validate',
              },
              geometry: expect.objectContaining({
                partName: 'Housing',
                partIndex: 0,
                polygonCount: 90,
                nativeValidation: {
                  valid: false,
                  message: expect.stringContaining('non-manifold edges'),
                },
                topology: expect.objectContaining({
                  nonManifoldEdges: expect.any(Number),
                  totalEdges: expect.any(Number),
                  aabb: expect.objectContaining({
                    min: expect.any(Array),
                    max: expect.any(Array),
                    center: expect.any(Array),
                  }),
                }),
                hints: [expect.stringContaining('prefer 2D profile composition followed by one extrudeLinear()')],
              }),
            }),
          }),
        );
        const invalidIssueDetails = invalidIssue.details as { geometry: { topology: { irregularEdges: number } } };
        expect(invalidIssueDetails.geometry.topology.irregularEdges).toBeGreaterThan(0);
      });

      it('should not warn for the equivalent 2D profile composed before one extrusion', async () => {
        const result = await createGeometry(
          {
            'valid-profile.ts': `
              import { primitives, booleans, transforms, extrusions } from '@jscad/modeling';

              export default function main() {
                const profile = booleans.union(
                  primitives.circle({ radius: 20, segments: 64 }),
                  transforms.translate([22, 0, 0], primitives.circle({ radius: 8, segments: 32 })),
                );
                return Object.assign(extrusions.extrudeLinear({ height: 5 }, profile), { name: 'Housing' });
              }
            `,
          },
          'valid-profile.ts',
        );

        expect(result.success).toBe(true);
        if (!result.success) {
          return;
        }
        expect(result.issues.filter((issue) => issue.code === 'GEOMETRY_INVALID')).toEqual([]);
        await geometryHelpers.expectValidGltf(result);
      });

      it('should report minimized planetary-style invalid part diagnostics by name', async () => {
        const result = await createGeometry(
          {
            'planetary-minimized.ts': `
              import { primitives, booleans, transforms, extrusions } from '@jscad/modeling';

              const named = (shape, name) => Object.assign(shape, { name });

              export default function main() {
                const invalidHousing = named(
                  booleans.union(
                    primitives.cylinder({ radius: 20, height: 5, segments: 64 }),
                    transforms.translate([22, 0, 0], primitives.cylinder({ radius: 8, height: 5, segments: 32 })),
                  ),
                  'Invalid Housing',
                );
                const validHousing = named(
                  extrusions.extrudeLinear(
                    { height: 5 },
                    booleans.union(
                      primitives.circle({ radius: 20, segments: 64 }),
                      transforms.translate([22, 0, 0], primitives.circle({ radius: 8, segments: 32 })),
                    ),
                  ),
                  'Valid Housing',
                );
                const invalidBoltSocket = named(
                  booleans.subtract(
                    primitives.cylinder({ radius: 10, height: 8, segments: 32 }),
                    primitives.cylinder({ radius: 5, height: 8, segments: 32 }),
                    transforms.translate([7, 0, 0], primitives.cylinder({ radius: 4, height: 8, segments: 16 })),
                  ),
                  'Bolt Socket',
                );
                return [invalidHousing, validHousing, invalidBoltSocket];
              }
            `,
          },
          'planetary-minimized.ts',
        );

        expect(result.success).toBe(true);
        if (!result.success) {
          return;
        }
        const invalidIssues = result.issues.filter((issue) => issue.code === 'GEOMETRY_INVALID');
        expect(
          invalidIssues.map((issue) => (issue.details as { geometry: { partName: string } }).geometry.partName),
        ).toEqual(['Invalid Housing', 'Bolt Socket']);
        expect(invalidIssues).toEqual([
          expect.objectContaining({
            details: expect.objectContaining({
              geometry: expect.objectContaining({
                hints: [expect.stringContaining('3D mesh CSG with overlapping, touching, or contained primitives')],
              }),
            }),
          }),
          expect.objectContaining({
            details: expect.objectContaining({
              geometry: expect.objectContaining({
                hints: [expect.stringContaining('3D mesh CSG with overlapping, touching, or contained primitives')],
              }),
            }),
          }),
        ]);
      });
    });

    describe('Complex geometry', () => {
      it('should handle boolean operations (union)', async () => {
        const result = await createGeometry(
          {
            'union.ts': `
              import { primitives, booleans } from '@jscad/modeling';

              export default function main() {
                const cube1 = primitives.cube({ size: 10 });
                const cube2 = primitives.cube({ size: 8 });
                return booleans.union(cube1, cube2);
              }
            `,
          },
          'union.ts',
        );

        expect(result.success).toBe(true);

        // Boolean union produces 1 mesh (larger cube encompasses smaller)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        // Bounding box is determined by larger cube (10x10x10)
        await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.01, 0.01], 0.0005);
      });

      it('should handle boolean operations (subtract)', async () => {
        const result = await createGeometry(
          {
            'subtract.ts': `
              import { primitives, booleans } from '@jscad/modeling';

              export default function main() {
                const outer = primitives.cube({ size: 20 });
                const inner = primitives.cube({ size: 15 });
                return booleans.subtract(outer, inner);
              }
            `,
          },
          'subtract.ts',
        );

        expect(result.success).toBe(true);

        // Boolean subtract produces 1 mesh (hollow cube)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        // Outer dimensions remain 20x20x20
        await geometryHelpers.expectBoundingBoxSize(result, [0.02, 0.02, 0.02], 0.0005);
      });

      it('should handle boolean operations (intersect)', async () => {
        const result = await createGeometry(
          {
            'intersect.ts': `
              import { primitives, booleans, transforms } from '@jscad/modeling';

              export default function main() {
                const cube = primitives.cube({ size: 10 });
                const sphere = primitives.sphere({ radius: 7 });
                return booleans.intersect(cube, sphere);
              }
            `,
          },
          'intersect.ts',
        );

        expect(result.success).toBe(true);

        // Boolean intersect produces 1 mesh (cube/sphere intersection)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        // Bounding box is constrained by cube (10x10x10)
        await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.01, 0.01], 0.0005);
      });

      it('should handle transformations (translate, rotate, scale)', async () => {
        const result = await createGeometry(
          {
            'transformed.ts': `
              import { primitives, transforms } from '@jscad/modeling';

              export default function main() {
                const cube = primitives.cube({ size: 10 });
                const translated = transforms.translate([10, 5, 0], cube);
                const rotated = transforms.rotateZ(Math.PI / 4, translated);
                return transforms.scale([2, 2, 2], rotated);
              }
            `,
          },
          'transformed.ts',
        );

        expect(result.success).toBe(true);

        // Transformation produces 1 mesh (scaled, rotated, translated cube)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
      });

      it('should handle extrusion operations', async () => {
        const result = await createGeometry(
          {
            'extruded.ts': `
              import { primitives, extrusions } from '@jscad/modeling';

              export default function main() {
                const rectangle = primitives.rectangle({ size: [20, 10] });
                return extrusions.extrudeLinear({ height: 15 }, rectangle);
              }
            `,
          },
          'extruded.ts',
        );

        expect(result.success).toBe(true);

        // Extrusion produces 1 mesh (20x10x15 box)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.02, 0.015, 0.01], 0.0005);
      });

      it('should handle hull operations', async () => {
        const result = await createGeometry(
          {
            'hull.ts': `
              import { primitives, hulls, transforms } from '@jscad/modeling';

              export default function main() {
                const sphere1 = primitives.sphere({ radius: 5 });
                const sphere2 = transforms.translate([20, 0, 0], primitives.sphere({ radius: 5 }));
                return hulls.hull(sphere1, sphere2);
              }
            `,
          },
          'hull.ts',
        );

        expect(result.success).toBe(true);

        // Hull produces 1 mesh (capsule-like shape)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        // Two spheres at radius 5, 20 apart: total width ~30, height/depth ~10
        await geometryHelpers.expectBoundingBoxSize(result, [0.03, 0.01, 0.01], 0.001);
      });

      it('should handle torus geometry', async () => {
        const result = await createGeometry(
          {
            'torus.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                return primitives.torus({ innerRadius: 5, outerRadius: 10 });
              }
            `,
          },
          'torus.ts',
        );

        expect(result.success).toBe(true);
      });

      it('should handle roundedCuboid geometry', async () => {
        const result = await createGeometry(
          {
            'rounded.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                return primitives.roundedCuboid({ size: [20, 15, 10], roundRadius: 2 });
              }
            `,
          },
          'rounded.ts',
        );

        expect(result.success).toBe(true);
      });
    });

    describe('2D geometry', () => {
      it('should render 2D rectangle output as an empty GLB artifact', async () => {
        const result = await createGeometry(
          {
            'rect.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                return primitives.rectangle({ size: [20, 10] });
              }
            `,
          },
          'rect.ts',
        );

        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 0);
      });

      it('should render 2D circle output as an empty GLB artifact', async () => {
        const result = await createGeometry(
          {
            'circle.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                return primitives.circle({ radius: 10 });
              }
            `,
          },
          'circle.ts',
        );

        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 0);
      });
    });

    describe('Error handling', () => {
      it('should return error for syntax errors', async () => {
        const result = await createGeometry(
          {
            'syntax_error.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                return primitives.cube({ size: 10
              }
            `,
          },
          'syntax_error.ts',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            code: 'BUNDLER_FAILED',
            message: 'Expected ")" but found end of file',
            type: 'compilation',
            severity: 'error',
            location: {
              fileName: 'syntax_error.ts',
              startLineNumber: 7,
              startColumn: 12,
            },
          },
        ]);
      });

      it('should return error for undefined function calls', async () => {
        const result = await createGeometry(
          {
            'undefined_func.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                return primitives.nonExistentShape({ size: 10 });
              }
            `,
          },
          'undefined_func.ts',
        );

        expect(result.success).toBe(false);
        // Framework/runtime frames have machine-specific paths; filter to user frames only
        const issue = result.issues[0]!;
        const userFrames = issue.stackFrames?.filter((f) => f.context === 'user');
        expect({ ...issue, stackFrames: userFrames }).toEqual(
          expect.objectContaining({
            message: 'primitives.nonExistentShape is not a function',
            type: 'runtime',
            severity: 'error',
            stackFrames: [
              {
                functionName: 'main',
                fileName: 'undefined_func.ts',
                lineNumber: 5,
                columnNumber: 35,
                context: 'user',
              },
            ],
            location: expect.objectContaining({
              fileName: 'undefined_func.ts',
              startLineNumber: 5,
            }),
          }),
        );
      });

      it('should return error for runtime errors', async () => {
        const result = await createGeometry(
          {
            'runtime_error.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                throw new Error('Something went wrong');
              }
            `,
          },
          'runtime_error.ts',
        );

        expect(result.success).toBe(false);
        const issue = result.issues[0]!;
        const userFrames = issue.stackFrames?.filter((f) => f.context === 'user');
        expect({ ...issue, stackFrames: userFrames }).toEqual(
          expect.objectContaining({
            message: 'Something went wrong',
            type: 'runtime',
            severity: 'error',
            stackFrames: [
              {
                functionName: 'main',
                fileName: 'runtime_error.ts',
                lineNumber: 5,
                columnNumber: 23,
                context: 'user',
              },
            ],
            location: expect.objectContaining({
              fileName: 'runtime_error.ts',
              startLineNumber: 5,
            }),
          }),
        );
      });

      it('should render an empty GLB when main returns undefined (no return statement)', async () => {
        const result = await createGeometry(
          {
            'no_return.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                primitives.cube({ size: 10 });
                // Missing return statement
              }
            `,
          },
          'no_return.ts',
        );

        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 0);
      });

      it('should render an empty GLB when main explicitly returns undefined', async () => {
        const result = await createGeometry(
          {
            'explicit_undefined.ts': `
              import { primitives } from '@jscad/modeling';

              export default function main() {
                return undefined;
              }
            `,
          },
          'explicit_undefined.ts',
        );

        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 0);
      });
    });
  });

  // ===========================================================================
  // Tests: Export Geometry
  // ===========================================================================

  describe('exportGeometry', () => {
    it('should return error for unsupported gltf format', async () => {
      const worker = await createWorker({
        'cube.ts': `
          import { primitives } from '@jscad/modeling';

          export default function main() {
            return primitives.cube({ size: 10 });
          }
        `,
      });

      const geometryFile = createGeometryFile('cube.ts');
      const createResult = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      expect(createResult.success).toBe(true);

      const exportResult = await worker.exportGeometry('gltf');
      expect(exportResult.success).toBe(false);
      if (!exportResult.success) {
        expect(exportResult.issues[0]?.message).toContain('gltf');
      }
    });

    it('should export the full named assembly to GLB format', async () => {
      const worker = await createWorker({
        'glb_assembly.ts': `
          import { primitives, transforms } from '@jscad/modeling';

          export default function main() {
            const base = Object.assign(primitives.cube({ size: 10 }), { name: 'Base' });
            const cap = Object.assign(
              transforms.translate([20, 0, 0], primitives.cube({ size: 6 })),
              { name: 'Cap' },
            );
            return [base, cap];
          }
        `,
      });

      const geometryFile = createGeometryFile('glb_assembly.ts');
      const createResult = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      expect(createResult.success).toBe(true);

      const exportResult = await worker.exportGeometry('glb');
      expect(exportResult.success).toBe(true);
      if (exportResult.success) {
        expect(exportResult.data).toHaveLength(1);
        const exportedGlb = exportResult.data[0]!.bytes;
        const { nodeNames, meshNames } = await readNodeMeshNames(exportedGlb);
        expect(nodeNames).toEqual(['Base', 'Cap']);
        expect(meshNames).toEqual(nodeNames);
      }
    });

    it('should preserve JSCAD invalid-geometry warnings during direct GLB export', async () => {
      const worker = await createWorker({
        'invalid-export.ts': `
          import { primitives, booleans, transforms } from '@jscad/modeling';

          export default function main() {
            const body = primitives.cylinder({ radius: 20, height: 5, segments: 64 });
            const ear = transforms.translate(
              [22, 0, 0],
              primitives.cylinder({ radius: 8, height: 5, segments: 32 }),
            );
            return Object.assign(booleans.union(body, ear), { name: 'Housing' });
          }
        `,
      });

      const geometryFile = createGeometryFile('invalid-export.ts');
      const createResult = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      expect(createResult.success).toBe(true);

      const exportResult = await worker.exportGeometry('glb');
      expect(exportResult.success).toBe(true);
      if (!exportResult.success) {
        return;
      }
      expect(exportResult.data[0]?.bytes.byteLength).toBeGreaterThan(0);
      expect(exportResult.issues).toEqual([
        expect.objectContaining({
          code: 'GEOMETRY_INVALID',
          severity: 'warning',
          details: expect.objectContaining({
            geometry: expect.objectContaining({
              partName: 'Housing',
              nativeValidation: {
                valid: false,
                message: expect.stringContaining('non-manifold edges'),
              },
            }),
          }),
        }),
      ]);
    });

    it('should export an empty GLB after an empty render', async () => {
      const worker = await createWorker({
        'no_return.ts': `
          export default function main() {
            // Missing return statement.
          }
        `,
      });

      const geometryFile = createGeometryFile('no_return.ts');
      const createResult = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      expect(createResult.success).toBe(true);

      const exportResult = await worker.exportGeometry('glb');
      expect(exportResult.success).toBe(true);
      if (!exportResult.success) {
        return;
      }

      const document = await createNodeIo().readBinary(exportResult.data[0]!.bytes);
      expect(document.getRoot().listMeshes()).toHaveLength(0);
    });

    it('should return error when no geometry computed', async () => {
      const worker = await createWorker({
        'empty.ts': `
          import { primitives } from '@jscad/modeling';

          export default function main() {
            return primitives.cube({ size: 10 });
          }
        `,
      });

      // Don't create geometry, just try to export
      const exportResult = await worker.exportGeometry('gltf');
      expect(exportResult.success).toBe(false);
    });

    it('should return error for unsupported export formats', async () => {
      const worker = await createWorker({
        'cube.ts': `
          import { primitives } from '@jscad/modeling';

          export default function main() {
            return primitives.cube({ size: 10 });
          }
        `,
      });

      const geometryFile = createGeometryFile('cube.ts');
      await worker.createGeometry({ file: geometryFile, parameters: {} });

      // JSCAD only supports gltf/glb
      const exportResult = await worker.exportGeometry('step');
      expect(exportResult.success).toBe(false);
    });
  });

  // ===========================================================================
  // Tests: TypeScript Bundling Support
  // ===========================================================================

  describe('TypeScript bundling', () => {
    describe('Type annotations', () => {
      it('should bundle code with typed function parameters and return types', async () => {
        const result = await createGeometry(
          {
            'typed-cube.ts': `
              import { primitives, type Geom3 } from '@jscad/modeling';

              export const defaultParams = {
                size: 20,
                segments: 32,
              };

              type CubeParams = { size: number; segments: number };

              export default function main(p: CubeParams = defaultParams): Geom3 {
                return primitives.cube({ size: p.size });
              }
            `,
          },
          'typed-cube.ts',
          { size: 20, segments: 32 },
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.02, 0.02, 0.02], 0.0005);
      });

      it('should bundle code with type assertions (as)', async () => {
        const result = await createGeometry(
          {
            'assertions.ts': `
              import { primitives, transforms, type Vec3 } from '@jscad/modeling';

              export default function main() {
                const size = 10 as number;
                const offset: Vec3 = [20, 0, 0];
                const cube = primitives.cube({ size });
                return transforms.translate(offset, cube);
              }
            `,
          },
          'assertions.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
      });

      it('should bundle code with const assertions (as const)', async () => {
        const result = await createGeometry(
          {
            'const-assertion.ts': `
              import { primitives } from '@jscad/modeling';

              const config = {
                size: 15,
                center: [0, 0, 0] as const,
              } as const;

              export default function main() {
                return primitives.cuboid({ size: [config.size, config.size, config.size] });
              }
            `,
          },
          'const-assertion.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.015, 0.015, 0.015], 0.0005);
      });
    });

    describe('Type-only imports', () => {
      it('should strip import type declarations from @jscad/modeling', async () => {
        const result = await createGeometry(
          {
            'type-import.ts': `
              import { primitives } from '@jscad/modeling';
              import type { Geom3 } from '@jscad/modeling';

              export default function main() {
                const cube: Geom3 = primitives.cube({ size: 10 });
                return cube;
              }
            `,
          },
          'type-import.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.01, 0.01], 0.0005);
      });

      it('should strip inline type imports (import { type X })', async () => {
        const result = await createGeometry(
          {
            'inline-type.ts': `
              import { primitives, booleans, type Geom3, type Vec3 } from '@jscad/modeling';

              export default function main() {
                const cube1: Geom3 = primitives.cube({ size: 10 });
                const cube2: Geom3 = primitives.cube({ size: 8 });
                return booleans.union(cube1, cube2);
              }
            `,
          },
          'inline-type.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
      });

      it('should strip type imports from submodules', async () => {
        const result = await createGeometry(
          {
            'submodule-type.ts': `
              import { cuboid } from '@jscad/modeling/primitives';
              import type { Geom3 } from '@jscad/modeling';

              export default function main() {
                const cube: Geom3 = cuboid({ size: [10, 10, 10] });
                return cube;
              }
            `,
          },
          'submodule-type.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.01, 0.01], 0.0005);
      });

      it('should handle Geom3 type import from root with submodule value imports', async () => {
        const result = await createGeometry(
          {
            'geom-type.ts': `
              import { cube } from '@jscad/modeling/primitives';
              import type { Geom3 } from '@jscad/modeling';

              export const defaultParams = { size: 20 };

              export default function main(p = defaultParams): Geom3 {
                return cube({ size: p.size });
              }
            `,
          },
          'geom-type.ts',
          { size: 20 },
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.02, 0.02, 0.02], 0.0005);
      });

      it('should handle Geom3 type with multiple submodule value imports', async () => {
        const result = await createGeometry(
          {
            'multi-type.ts': `
              import { cylinder } from '@jscad/modeling/primitives';
              import { subtract } from '@jscad/modeling/booleans';
              import type { Geom3 } from '@jscad/modeling';

              export const defaultParams = { radius: 10, height: 20, holeRadius: 3 };

              export default function main(p = defaultParams): Geom3 {
                const outer = cylinder({ radius: p.radius, height: p.height });
                const inner = cylinder({ radius: p.holeRadius, height: p.height + 2 });
                return subtract(outer, inner);
              }
            `,
          },
          'multi-type.ts',
          { radius: 10, height: 20, holeRadius: 3 },
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
      });

      it('should handle geom3.Geom3 namespace type from @jscad/modeling/geometries (non-standard)', async () => {
        const result = await createGeometry(
          {
            'ns-type.ts': `
              import { cube } from '@jscad/modeling/primitives';
              import type { geom3 } from '@jscad/modeling/geometries';

              export default function main(): geom3.Geom3 {
                return cube({ size: 10 });
              }
            `,
          },
          'ns-type.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.01, 0.01], 0.0005);
      });
    });

    describe('Interfaces and type aliases', () => {
      it('should bundle code with local interface definitions', async () => {
        const result = await createGeometry(
          {
            'interfaces.ts': `
              import { primitives, transforms, booleans, type Vec3 } from '@jscad/modeling';

              interface CubeConfig {
                size: number;
                offset: Vec3;
              }

              function createOffsetCube(config: CubeConfig) {
                const cube = primitives.cube({ size: config.size });
                return transforms.translate(config.offset, cube);
              }

              export default function main() {
                const cubes: CubeConfig[] = [
                  { size: 10, offset: [0, 0, 0] },
                  { size: 8, offset: [15, 0, 0] },
                ];

                return cubes.map((c) => createOffsetCube(c));
              }
            `,
          },
          'interfaces.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
      });

      it('should bundle code with type aliases and union types', async () => {
        const result = await createGeometry(
          {
            'type-aliases.ts': `
              import { primitives } from '@jscad/modeling';

              type ShapeType = 'cube' | 'sphere' | 'cylinder';
              type Size3D = [number, number, number];

              function createShape(type: ShapeType, size: number) {
                switch (type) {
                  case 'cube':
                    return primitives.cube({ size });
                  case 'sphere':
                    return primitives.sphere({ radius: size / 2 });
                  case 'cylinder':
                    return primitives.cylinder({ height: size, radius: size / 2 });
                }
              }

              export default function main() {
                return createShape('cube', 10);
              }
            `,
          },
          'type-aliases.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.01, 0.01], 0.0005);
      });
    });

    describe('Generics and advanced TypeScript features', () => {
      it('should bundle code with generic utility functions', async () => {
        const result = await createGeometry(
          {
            'generics.ts': `
              import { primitives } from '@jscad/modeling';

              function withDefaults<T extends Record<string, number>>(
                defaults: T,
                overrides: Partial<T>,
              ): T {
                return { ...defaults, ...overrides };
              }

              const baseParams = { size: 10, segments: 32 };

              export default function main() {
                const p = withDefaults(baseParams, { size: 20 });
                return primitives.cube({ size: p.size });
              }
            `,
          },
          'generics.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.02, 0.02, 0.02], 0.0005);
      });

      it('should bundle code with enums', async () => {
        const result = await createGeometry(
          {
            'enums.ts': `
              import { primitives } from '@jscad/modeling';

              enum ShapeKind {
                Cube = 'cube',
                Sphere = 'sphere',
              }

              export default function main() {
                const kind: ShapeKind = ShapeKind.Cube;
                if (kind === ShapeKind.Cube) {
                  return primitives.cube({ size: 10 });
                }
                return primitives.sphere({ radius: 5 });
              }
            `,
          },
          'enums.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.01, 0.01], 0.0005);
      });

      it('should bundle code with optional chaining and nullish coalescing', async () => {
        const result = await createGeometry(
          {
            'modern-ts.ts': `
              import { primitives } from '@jscad/modeling';

              type Config = {
                shape?: {
                  size?: number;
                  segments?: number;
                };
              };

              export default function main() {
                const config: Config = { shape: { size: 15 } };
                const size = config.shape?.size ?? 10;
                const segments = config.shape?.segments ?? 32;

                return primitives.cube({ size });
              }
            `,
          },
          'modern-ts.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.015, 0.015, 0.015], 0.0005);
      });
    });

    describe('Multi-file TypeScript with shared types', () => {
      it('should bundle multi-file project with shared type definitions', async () => {
        const result = await createGeometry(
          {
            'main.ts': `
              import { primitives, booleans } from '@jscad/modeling';
              import type { BoxConfig, SphereConfig } from './types';
              import { createBox, createSphere } from './shapes';

              export default function main() {
                const boxConfig: BoxConfig = { size: [20, 15, 10] };
                const sphereConfig: SphereConfig = { radius: 8 };

                const box = createBox(boxConfig);
                const sphere = createSphere(sphereConfig);
                return booleans.union(box, sphere);
              }
            `,
            'types.ts': `
              export interface BoxConfig {
                size: [number, number, number];
              }

              export interface SphereConfig {
                radius: number;
                segments?: number;
              }

              export type Point3D = [number, number, number];
            `,
            'shapes.ts': `
              import { primitives } from '@jscad/modeling';
              import type { BoxConfig, SphereConfig } from './types';

              export function createBox(config: BoxConfig) {
                return primitives.cuboid({ size: config.size });
              }

              export function createSphere(config: SphereConfig) {
                return primitives.sphere({
                  radius: config.radius,
                  segments: config.segments ?? 32,
                });
              }
            `,
          },
          'main.ts',
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
      });

      it('should bundle multi-file project with type-only re-exports', async () => {
        const result = await createGeometry(
          {
            'main.ts': `
              import { primitives, extrusions } from '@jscad/modeling';
              import type { AppParams } from './config';
              import { DEFAULT_PARAMS } from './config';

              export const defaultParams = DEFAULT_PARAMS;

              export default function main(p: AppParams = defaultParams) {
                const rect = primitives.rectangle({ size: [p.width, p.height] });
                return extrusions.extrudeLinear({ height: p.depth }, rect);
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
                width: 30,
                height: 20,
                depth: 15,
              };
            `,
          },
          'main.ts',
          { width: 30, height: 20, depth: 15 },
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.03, 0.015, 0.02], 0.0005);
      });
    });

    describe('Real-world TypeScript CAD patterns', () => {
      it('should bundle a parametric model with full TypeScript features', async () => {
        const result = await createGeometry(
          {
            'main.ts': `
              import { primitives, transforms, booleans, type Geom3, type Vec3 } from '@jscad/modeling';

              interface BracketParams {
                baseWidth: number;
                baseHeight: number;
                baseDepth: number;
                holeRadius: number;
                holeOffset: number;
              }

              export const defaultParams: BracketParams = {
                baseWidth: 40,
                baseHeight: 30,
                baseDepth: 5,
                holeRadius: 3,
                holeOffset: 10,
              };

              function createHole(radius: number, depth: number): Geom3 {
                return primitives.cylinder({ radius, height: depth + 2 });
              }

              export default function main(p: BracketParams = defaultParams): Geom3 {
                // Create the base plate
                const base = primitives.cuboid({
                  size: [p.baseWidth, p.baseHeight, p.baseDepth],
                });

                // Create mounting holes
                const holePositions: Vec3[] = [
                  [-p.holeOffset, -p.holeOffset, 0],
                  [p.holeOffset, -p.holeOffset, 0],
                  [-p.holeOffset, p.holeOffset, 0],
                  [p.holeOffset, p.holeOffset, 0],
                ];

                let result: Geom3 = base;
                for (const pos of holePositions) {
                  const hole = transforms.translate(pos, createHole(p.holeRadius, p.baseDepth));
                  result = booleans.subtract(result, hole);
                }

                return result;
              }
            `,
          },
          'main.ts',
          {
            baseWidth: 40,
            baseHeight: 30,
            baseDepth: 5,
            holeRadius: 3,
            holeOffset: 10,
          },
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.04, 0.005, 0.03], 0.0005);
      });

      it('should bundle a multi-file parametric assembly with TypeScript', async () => {
        const result = await createGeometry(
          {
            'main.ts': `
              import { booleans } from '@jscad/modeling';
              import type { AssemblyConfig } from './types';
              import { createBase } from './parts/base';
              import { createPillar } from './parts/pillar';

              export const defaultParams: AssemblyConfig = {
                base: { width: 40, depth: 30, thickness: 5 },
                pillar: { radius: 4, height: 25 },
              };

              export default function main(p: AssemblyConfig = defaultParams) {
                const base = createBase(p.base);
                const pillar = createPillar(p.pillar, p.base.thickness);
                return booleans.union(base, pillar);
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
              import { primitives } from '@jscad/modeling';
              import type { BaseConfig } from '../types';

              export function createBase(config: BaseConfig) {
                return primitives.cuboid({
                  size: [config.width, config.depth, config.thickness],
                });
              }
            `,
            'parts/pillar.ts': `
              import { primitives, transforms } from '@jscad/modeling';
              import type { PillarConfig } from '../types';

              export function createPillar(config: PillarConfig, baseThickness: number) {
                const pillar = primitives.cylinder({
                  radius: config.radius,
                  height: config.height,
                });
                // Position pillar on top of base
                return transforms.translate(
                  [0, 0, baseThickness / 2 + config.height / 2],
                  pillar,
                );
              }
            `,
          },
          'main.ts',
          {
            base: { width: 40, depth: 30, thickness: 5 },
            pillar: { radius: 4, height: 25 },
          },
        );

        expect(result.success).toBe(true);
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
      });
    });
  });
});

// =============================================================================
// serializeNativeHandle / deserializeNativeHandle
// =============================================================================

describe('serializeNativeHandle', () => {
  it('should serialize nativeHandle to compact binary arrays', async () => {
    const result = await createGeometry(
      {
        'box.ts': `
          const { cuboid } = require('@jscad/modeling').primitives;
          module.exports = { main: () => cuboid({ size: [20, 20, 20] }) };
        `,
      },
      'box.ts',
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.serializedNativeHandle).toBeDefined();
    const serialized = result.serializedNativeHandle as Array<{ type: string; data: Float32Array; name?: string }>;
    expect(serialized).toHaveLength(1);
    expect(serialized[0]!.type).toBe('geom3');
    expect(serialized[0]!.name).toBe('Shape 1');
    expect(serialized[0]!.data).toBeInstanceOf(Float32Array);
    expect(serialized[0]!.data.length).toBeGreaterThan(0);
  });

  it('should deserialize serialized handles using the normalized package import shape', async () => {
    const result = await createGeometry(
      {
        'cutout.ts': jscadCubeCutoutSource,
      },
      'cutout.ts',
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const { deserializeNativeHandle } = jscadDefinition;
    expect(deserializeNativeHandle).toBeDefined();
    if (!deserializeNativeHandle) {
      return;
    }

    const restored = deserializeNativeHandle(
      { serializedNativeHandle: result.serializedNativeHandle as JscadSerializedNativeHandleEntry[] },
      createMockKernelRuntime(),
      { modulesRegistered: true },
    );
    const glb = jscadToGltf(restored, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
    });

    const { nodeNames } = await readNodeMeshNames(glb);
    expect(nodeNames).toEqual(['Shape 1']);
  });

  it('should deserialize MessagePack-decoded compact binary handles and export GLB bytes', async () => {
    const result = await createGeometry({ 'cutout.ts': jscadCubeCutoutSource }, 'cutout.ts');

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const { deserializeNativeHandle, exportGeometry } = jscadDefinition;
    expect(deserializeNativeHandle).toBeDefined();
    if (!deserializeNativeHandle) {
      return;
    }

    const decodedSerializedNativeHandle = msgpackDecode(msgpackEncode(result.serializedNativeHandle));
    const decodedEntry = (decodedSerializedNativeHandle as Array<{ data: unknown }>)[0];
    expect(decodedEntry?.data).not.toBeInstanceOf(Float32Array);
    expect(ArrayBuffer.isView(decodedEntry?.data)).toBe(true);

    const restoredHandle = deserializeNativeHandle(
      { serializedNativeHandle: decodedSerializedNativeHandle as JscadSerializedNativeHandleEntry[] },
      createMockKernelRuntime(),
      { modulesRegistered: true },
    );
    const exportResult = await exportGeometry(
      {
        format: 'glb',
        nativeHandle: restoredHandle,
        options: jscadGlbExportOptions,
      },
      createMockKernelRuntime(),
      { modulesRegistered: true },
    );

    expect(exportResult.success).toBe(true);
    if (!exportResult.success) {
      return;
    }
    expect(exportResult.data).toHaveLength(1);
    expect(exportResult.data[0]?.name).toBe('model.glb');
    expect(exportResult.data[0]?.bytes.byteLength).toBeGreaterThan(0);
  });

  it('should reject malformed serialized compact binary with precise errors', () => {
    const { deserializeNativeHandle } = jscadDefinition;
    expect(deserializeNativeHandle).toBeDefined();
    if (!deserializeNativeHandle) {
      return;
    }
    const deserializeInvalidHandle = (data: unknown): void => {
      deserializeNativeHandle(
        { serializedNativeHandle: data as JscadSerializedNativeHandleEntry[] },
        createMockKernelRuntime(),
        { modulesRegistered: true },
      );
    };

    expect(() => {
      deserializeInvalidHandle([{ type: 'geom3', data: new Uint8Array([1, 2, 3]) }]);
    }).toThrow(
      'Invalid JSCAD serialized handle compact binary at entry 0 (geom3): byte length 3 is not divisible by 4.',
    );
    expect(() => {
      deserializeInvalidHandle([{ type: 'sphere', data: new Uint8Array([0, 0, 0, 0]) }]);
    }).toThrow('Invalid JSCAD serialized handle entry 0: unsupported type "sphere"; expected geom2, geom3, or path2.');
    expect(() => {
      deserializeInvalidHandle([{ type: 'geom3', data: 'not-binary' }]);
    }).toThrow(
      'Invalid JSCAD serialized handle compact binary at entry 0 (geom3): expected Float32Array, ArrayBuffer, or ArrayBuffer view; got string.',
    );
  });

  it('should export from L2 create cache after MessagePack restoration when export cache is absent', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'tau-jscad-create-cache-export-'));
    const cacheDirectory = join(projectPath, '.tau', 'cache', 'geometry');
    const exportRequest = {
      source: { path: 'main.ts' },
      exportOptions: jscadGlbExportOptions,
    };

    try {
      await writeFile(join(projectPath, 'main.ts'), jscadCubeCutoutSource);
      await writeFile(join(projectPath, 'package.json'), '{"type":"module"}\n');
      geometryMemoryCache.clear();
      exportMemoryCache.clear();

      const coldClient = await createNodeClient(projectPath);
      const coldExport = await coldClient.export('glb', exportRequest);
      coldClient.terminate();
      expect(coldExport.success).toBe(true);
      if (!coldExport.success) {
        return;
      }
      expect(extractGltfFromExportResult(coldExport)?.byteLength).toBeGreaterThan(0);

      geometryMemoryCache.clear();
      exportMemoryCache.clear();
      const cacheEntries = await readdir(cacheDirectory);
      const exportCacheEntries = cacheEntries.filter((entry) => entry.startsWith('export-'));
      expect(exportCacheEntries.length).toBeGreaterThan(0);
      await Promise.all(exportCacheEntries.map(async (entry) => rm(join(cacheDirectory, entry), { force: true })));

      const restoredClient = await createNodeClient(projectPath);
      const restoredExport = await restoredClient.export('glb', exportRequest);
      restoredClient.terminate();

      expect(restoredExport.success).toBe(true);
      if (!restoredExport.success) {
        return;
      }
      expect(restoredExport.data.map(({ name }) => name)).toEqual(['model.glb']);
      expect(extractGltfFromExportResult(restoredExport)?.byteLength).toBeGreaterThan(0);
    } finally {
      geometryMemoryCache.clear();
      exportMemoryCache.clear();
      await rm(projectPath, { recursive: true, force: true });
    }
  });

  it('should serialize multiple shapes', async () => {
    const result = await createGeometry(
      {
        'shapes.ts': `
          const { cuboid, sphere } = require('@jscad/modeling').primitives;
          module.exports = {
            main: () => [
              Object.assign(cuboid({ size: [10, 10, 10] }), { name: 'Box' }),
              Object.assign(sphere({ radius: 5 }), { name: 'Ball' }),
            ],
          };
        `,
      },
      'shapes.ts',
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.serializedNativeHandle).toBeDefined();
    const serialized = result.serializedNativeHandle as Array<{ type: string; data: Float32Array; name?: string }>;
    expect(serialized).toHaveLength(2);
    expect(serialized[0]!.type).toBe('geom3');
    expect(serialized[0]!.name).toBe('Box');
    expect(serialized[1]!.type).toBe('geom3');
    expect(serialized[1]!.name).toBe('Ball');
  });

  it('should preserve serialized part names after handle deserialization for GLB output', async () => {
    const result = await createGeometry(
      {
        'assembly.ts': `
          const { cuboid } = require('@jscad/modeling').primitives;
          const { translate } = require('@jscad/modeling').transforms;
          module.exports = {
            main: () => [
              Object.assign(cuboid({ size: [10, 10, 10] }), { name: 'Housing' }),
              Object.assign(translate([20, 0, 0], cuboid({ size: [6, 6, 6] })), { name: 'Carrier' }),
            ],
          };
        `,
      },
      'assembly.ts',
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.serializedNativeHandle).toBeDefined();
    const { deserializeNativeHandle } = jscadDefinition;
    expect(deserializeNativeHandle).toBeDefined();
    if (!deserializeNativeHandle) {
      return;
    }

    const restoredHandle = deserializeNativeHandle(
      { serializedNativeHandle: result.serializedNativeHandle as JscadSerializedNativeHandleEntry[] },
      createMockKernelRuntime(),
      { modulesRegistered: true },
    );

    const glb = jscadToGltf(restoredHandle, {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
    });
    const { nodeNames, meshNames } = await readNodeMeshNames(glb);
    expect(nodeNames).toEqual(['Housing', 'Carrier']);
    expect(meshNames).toEqual(nodeNames);
  });

  it('should have serializeNativeHandle and deserializeNativeHandle defined on the kernel', () => {
    expect(jscadDefinition.serializeNativeHandle).toBeDefined();
    expect(jscadDefinition.deserializeNativeHandle).toBeDefined();
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End of file */
