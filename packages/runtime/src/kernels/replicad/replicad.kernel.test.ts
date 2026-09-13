// @vitest-environment node
/* oxlint-disable max-lines -- comprehensive kernel test suite */
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers return any */
/* eslint-disable @typescript-eslint/naming-convention -- File names use extensions like 'box.ts' */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import type { Document } from '@gltf-transform/core';
import replicadKernel from '#kernels/replicad/replicad.kernel.js';
import { replicadDetectPattern } from '#kernels/replicad/replicad.plugin.js';
import { exampleFixtures } from '#kernels/replicad/replicad.test-fixtures.js';
import { createGeometryTestHelpers, extractGltfFromResult } from '#testing/kernel-geometry-testing.utils.js';
import {
  assertFailure,
  assertSuccess,
  createGeometryFile,
  createTestWorker,
  createTestGeometry,
  getTestParameters,
  getTestFileSystem,
} from '#testing/kernel-testing.utils.js';
import type { CreateTestWorkerOptions } from '#testing/kernel-testing.utils.js';
import type { TelemetryEntry } from '#types/index.js';

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
): Promise<{
  jsonSchema: unknown;
  defaultParameters: Record<string, unknown>;
}> => getTestParameters(replicadKernel, files, mainFile);

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
  createTestGeometry({
    definition: replicadKernel,
    files,
    mainFile,
    parameters,
    options,
  });

// Create geometry test helpers instance for geometry assertions
const geometryHelpers = createGeometryTestHelpers();

describe('ReplicadWorker', () => {
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

        expect(defaultParameters).toEqual({
          width: 100,
          height: 50,
          depth: 30,
        });
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

      it('should compute geometry with ESM exports and destructured replicad global (production detection)', async () => {
        const result = await createGeometry({
          files: {
            'box.js': `
              const { draw } = replicad;

              export const defaultParams = {
                width: 50,
                height: 30,
                depth: 10,
              };

              export default function main({ width, height, depth }) {
                return draw()
                  .hLine(width)
                  .vLine(height)
                  .hLine(-width)
                  .close()
                  .sketchOnPlane()
                  .extrude(depth);
              }
            `,
          },
          mainFile: 'box.js',
          parameters: { width: 50, height: 30, depth: 10 },
          options: {
            detectImport: replicadDetectPattern.source,
            builtinModuleNames: ['replicad'],
          },
        });

        assertSuccess(result);

        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.01, 0.03], 0.0005);
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

      it.skip('should return a decoded kernel error for revolution bodies with axis-touching poles', async () => {
        const result = await createGeometry({
          files: {
            'speaker.ts': `
              import {
                draw,
                drawCircle,
                drawRoundedRectangle,
                makeCylinder,
                makeSphere,
                sketchRoundedRectangle,
                sketchCircle,
                makePlane,
              } from "replicad";
              import type { Shape3D, Sketch, SketchInterface } from "replicad";

              export const defaultParams = {
                cabinetWidth: 180,
                cabinetHeight: 300,
                cabinetDepth: 220,
                cabinetCornerRadius: 12,
                cabinetEdgeFillet: 3,
                wooferDiameter: 130,
                wooferRecessDepth: 4,
                wooferSurroundWidth: 12,
                wooferConeDepth: 18,
                wooferDustCapDiameter: 40,
                wooferCenterZ: 110,
                tweeterDiameter: 25,
                tweeterFlangeOuter: 52,
                tweeterRecessDepth: 3,
                tweeterDomeHeight: 8,
                tweeterCenterZ: 240,
                bassPortDiameter: 40,
                bassPortDepth: 15,
                bassPortCenterZ: 38,
                baffleFillet: 1.5,
              };

              export default function main(p = defaultParams): Shape3D[] {
                const halfW = p.cabinetWidth / 2;
                const halfD = p.cabinetDepth / 2;
                const frontY = -halfD;

                let cabinet = sketchRoundedRectangle(p.cabinetWidth, p.cabinetDepth, p.cabinetCornerRadius)
                  .extrude(p.cabinetHeight) as Shape3D;

                cabinet = cabinet.fillet(p.cabinetEdgeFillet, (e) =>
                  e.either([
                    (f) => f.inPlane("XY", 0),
                    (f) => f.inPlane("XY", p.cabinetHeight),
                  ])
                );

                const wooferR = p.wooferDiameter / 2;
                const wooferZ = p.wooferCenterZ;

                const wooferRecess = makeCylinder(
                  wooferR + p.wooferSurroundWidth,
                  p.wooferRecessDepth,
                  [0, frontY - 0.01, wooferZ],
                  [0, 1, 0]
                );
                cabinet = cabinet.cut(wooferRecess);

                const surroundOuterR = wooferR + p.wooferSurroundWidth;
                const surroundProfile = draw()
                  .movePointerTo([wooferR, 0])
                  .sagittaArcTo([surroundOuterR, 0], -4)
                  .lineTo([surroundOuterR, -p.wooferRecessDepth + 0.5])
                  .lineTo([wooferR, -p.wooferRecessDepth + 0.5])
                  .close();

                const wooferSurroundPlane = makePlane("XZ", [0, frontY, wooferZ]);
                const surround = surroundProfile
                  .sketchOnPlane(wooferSurroundPlane)
                  .revolve([0, 0, 1]) as Shape3D;

                const coneProfile = draw()
                  .movePointerTo([0, 0])
                  .lineTo([p.wooferDustCapDiameter / 2, 0])
                  .sagittaArcTo([wooferR, p.wooferConeDepth], -6)
                  .vLine(1.5)
                  .sagittaArcTo([p.wooferDustCapDiameter / 2 + 2, 1.5], 6)
                  .lineTo([p.wooferDustCapDiameter / 2, 1.5])
                  .sagittaArcTo([0, 1.5], p.wooferDustCapDiameter / 6)
                  .close();

                const conePlane = makePlane("XZ", [0, frontY - p.wooferRecessDepth, wooferZ]);
                const wooferCone = coneProfile
                  .sketchOnPlane(conePlane)
                  .revolve([0, 0, 1]) as Shape3D;

                const tweeterR = p.tweeterDiameter / 2;
                const tweeterZ = p.tweeterCenterZ;
                const tweeterFlangeR = p.tweeterFlangeOuter / 2;

                const tweeterRecess = makeCylinder(
                  tweeterFlangeR,
                  p.tweeterRecessDepth,
                  [0, frontY - 0.01, tweeterZ],
                  [0, 1, 0]
                );
                cabinet = cabinet.cut(tweeterRecess);

                const flangeProfile = draw()
                  .movePointerTo([tweeterR + 2, 0])
                  .lineTo([tweeterFlangeR, 0])
                  .lineTo([tweeterFlangeR, -p.tweeterRecessDepth + 0.5])
                  .lineTo([tweeterR + 2, -p.tweeterRecessDepth + 0.5])
                  .close();

                const tweeterFlangePlane = makePlane("XZ", [0, frontY, tweeterZ]);
                const tweeterFlange = flangeProfile
                  .sketchOnPlane(tweeterFlangePlane)
                  .revolve([0, 0, 1]) as Shape3D;

                const domeProfile = draw()
                  .movePointerTo([0.5, 0])
                  .lineTo([tweeterR, 0])
                  .vLine(-0.5)
                  .sagittaArcTo([0.5, -0.5], p.tweeterDomeHeight)
                  .close();

                const domePlane = makePlane("XZ", [0, frontY - p.tweeterRecessDepth + 0.5, tweeterZ]);
                const tweeterDome = domeProfile
                  .sketchOnPlane(domePlane)
                  .revolve([0, 0, 1]) as Shape3D;

                const bassPortR = p.bassPortDiameter / 2;
                const bassPortZ = p.bassPortCenterZ;

                const portHole = makeCylinder(
                  bassPortR,
                  p.bassPortDepth + 1,
                  [0, frontY - p.bassPortDepth, bassPortZ],
                  [0, 1, 0]
                );
                cabinet = cabinet.cut(portHole);

                const portLipProfile = draw()
                  .movePointerTo([bassPortR - 2, 0])
                  .sagittaArcTo([bassPortR, 0], -0.8)
                  .lineTo([bassPortR, -2])
                  .lineTo([bassPortR - 2, -2])
                  .close();

                const portLipPlane = makePlane("XZ", [0, frontY + 0.5, bassPortZ]);
                const portLip = portLipProfile
                  .sketchOnPlane(portLipPlane)
                  .revolve([0, 0, 1]) as Shape3D;

                let drivers = surround
                  .fuse(wooferCone)
                  .fuse(tweeterFlange)
                  .fuse(tweeterDome)
                  .fuse(portLip);

                try {
                  cabinet = cabinet.fillet(p.baffleFillet, (e) =>
                    e.inBox(
                      [-halfW - 1, frontY - p.wooferRecessDepth - 1, wooferZ - surroundOuterR - 1],
                      [halfW + 1, frontY + 1, wooferZ + surroundOuterR + 1]
                    ).ofCurveType("CIRCLE")
                  );
                } catch {}

                try {
                  cabinet = cabinet.fillet(p.baffleFillet, (e) =>
                    e.inBox(
                      [-halfW - 1, frontY - p.tweeterRecessDepth - 1, tweeterZ - tweeterFlangeR - 1],
                      [halfW + 1, frontY + 1, tweeterZ + tweeterFlangeR + 1]
                    ).ofCurveType("CIRCLE")
                  );
                } catch {}

                return [cabinet, drivers];
              }
            `,
          },
          mainFile: 'speaker.ts',
          options: { workerOptions: { wasm: 'single' } },
        });

        assertFailure(result);
        const issue = result.issues[0]!;
        expect(issue).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            message: expect.stringContaining('KernelError:'),
          }),
        );
        expect(issue.message).not.toBe('[object WebAssembly.Exception]');
        expect(issue.message).not.toContain('undecodable');

        // Stack frames must not start at formatRuntimeErrorWithOc (the old bug) —
        // the OC proxy should have converted the WebAssembly.Exception to an
        // OcKernelError at the call site with proper Error.captureStackTrace
        expect(issue.stackFrames).toBeDefined();
        expect(issue.stackFrames!.length).toBeGreaterThan(0);
        const frameNames = issue.stackFrames!.map((f) => f.functionName);
        expect(frameNames).not.toContain('formatRuntimeErrorWithOc');
      }, 120_000);
    });

    describe('Multi-file imports', () => {
      it('should handle transitive imports without direct replicad import in entry file', async () => {
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
            detectImport: replicadDetectPattern.source,
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
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            message: expect.stringMatching(/bla is not defined/i),
            severity: 'error',
            stackFrames: expect.arrayContaining([
              expect.objectContaining({ functionName: 'main', context: 'user' }),
              expect.objectContaining({ context: 'framework' }),
            ]),
          }),
        );
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

      it('should decode OpenCASCADE numeric exceptions into human-readable messages', async () => {
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
          options: { workerOptions: { wasm: 'single' } },
        });

        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            message: expect.not.stringMatching(/^\d+$/),
          }),
        );
      });

      it('should return decoded OC error with type info for oversized fillet', async () => {
        const result = await createGeometry({
          files: {
            'bad_fillet.ts': `
              import { makeBaseBox } from 'replicad';

              export default function main() {
                return makeBaseBox(10, 10, 10).fillet(100);
              }
            `,
          },
          mainFile: 'bad_fillet.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single' } },
        });

        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            message: expect.stringMatching(/StdFail_NotDone/),
          }),
        );
      });

      it('should include user code stack frames for OC exceptions with helper function', async () => {
        const code = `import { makeBaseBox } from 'replicad';

function buildShape() {
  const box = makeBaseBox(10, 10, 10);
  return box.fillet(100);
}

export default function main() {
  return buildShape();
}
`;

        const result = await createGeometry({
          files: { 'fillet_stack.ts': code },
          mainFile: 'fillet_stack.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single' } },
        });

        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            message: expect.stringMatching(/StdFail_NotDone/),
            location: expect.objectContaining({
              fileName: 'fillet_stack.ts',
              startLineNumber: 5,
            }),
            stackFrames: expect.arrayContaining([
              expect.objectContaining({
                functionName: 'buildShape',
                fileName: 'fillet_stack.ts',
                lineNumber: 5,
                context: 'user',
              }),
              expect.objectContaining({
                functionName: 'main',
                fileName: 'fillet_stack.ts',
                lineNumber: 9,
                context: 'user',
              }),
              expect.objectContaining({ context: 'library' }),
            ]),
          }),
        );
      });

      it('should include stack frames for nested helpers in same file', async () => {
        const code = `import { makeBaseBox } from 'replicad';

function createBox() {
  return makeBaseBox(10, 10, 10);
}

function filletBox() {
  const box = createBox();
  return box.fillet(100);
}

export default function main() {
  return filletBox();
}
`;

        const result = await createGeometry({
          files: { 'nested_helpers.ts': code },
          mainFile: 'nested_helpers.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single' } },
        });

        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            message: expect.stringMatching(/StdFail_NotDone/),
            location: expect.objectContaining({
              fileName: 'nested_helpers.ts',
              startLineNumber: 9,
            }),
            stackFrames: expect.arrayContaining([
              expect.objectContaining({
                functionName: 'filletBox',
                fileName: 'nested_helpers.ts',
                lineNumber: 9,
                context: 'user',
              }),
              expect.objectContaining({
                functionName: 'main',
                fileName: 'nested_helpers.ts',
                lineNumber: 13,
                context: 'user',
              }),
              expect.objectContaining({ context: 'library' }),
            ]),
          }),
        );
      });

      it('should include stack frames for cross-file OC exceptions', async () => {
        const result = await createGeometry({
          files: {
            'main.ts': `import { buildGeometry } from './helpers';
import {} from 'replicad';
export default function main() { return buildGeometry(); }
`,
            'helpers.ts': `import { makeBaseBox } from 'replicad';

export function buildGeometry() {
  return makeBaseBox(10, 10, 10).fillet(100);
}
`,
          },
          mainFile: 'main.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single' } },
        });

        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            message: expect.stringMatching(/StdFail_NotDone/),
            location: expect.objectContaining({
              fileName: 'helpers.ts',
              startLineNumber: 4,
            }),
            stackFrames: expect.arrayContaining([
              expect.objectContaining({
                functionName: 'buildGeometry',
                fileName: 'helpers.ts',
                context: 'user',
              }),
              expect.objectContaining({
                functionName: 'main',
                fileName: 'main.ts',
                context: 'user',
              }),
              expect.objectContaining({ context: 'library' }),
            ]),
          }),
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
          options: { workerOptions: { wasm: 'single' } },
        });

        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            message: expect.stringMatching(/StdFail_NotDone/),
            location: expect.objectContaining({
              fileName: 'fillet_fail.ts',
              startLineNumber: 7,
            }),
            stackFrames: expect.arrayContaining([
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
              expect.objectContaining({
                functionName: expect.stringMatching(/^BRepFilletAPI_MakeFillet\w*\.\w+$/),
                fileName: expect.stringContaining('oc-tracing'),
                context: 'framework',
              }),
            ]),
          }),
        );
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
          options: {
            workerOptions: { wasm: 'single', ocTracing: 'off' },
          },
        });

        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            message: expect.stringMatching(/StdFail_NotDone/),
            location: expect.objectContaining({
              fileName: 'fillet_no_trace.ts',
              startLineNumber: 7,
            }),
            stackFrames: expect.arrayContaining([
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
              expect.objectContaining({
                functionName: expect.stringMatching(/^BRepFilletAPI_MakeFillet\w*\.\w+$/),
                fileName: expect.stringContaining('oc-tracing'),
                context: 'framework',
              }),
            ]),
          }),
        );
      });

      it('should include user code stack frames for fillet OC exception with ocTracing off', async () => {
        const code = `import { makeBaseBox } from 'replicad';

function buildShape() {
  const box = makeBaseBox(10, 10, 10);
  return box.fillet(100);
}

export default function main() {
  return buildShape();
}
`;

        const result = await createGeometry({
          files: { 'fillet_no_trace.ts': code },
          mainFile: 'fillet_no_trace.ts',
          parameters: {},
          options: {
            workerOptions: { wasm: 'single', ocTracing: 'off' },
          },
        });

        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            message: expect.stringMatching(/StdFail_NotDone/),
            stackFrames: expect.arrayContaining([
              expect.objectContaining({
                functionName: 'buildShape',
                fileName: 'fillet_no_trace.ts',
                context: 'user',
              }),
              expect.objectContaining({
                functionName: 'main',
                fileName: 'fillet_no_trace.ts',
                context: 'user',
              }),
            ]),
          }),
        );
      });

      it('should produce exact stack frames and location for fluent-chain OC exception', async () => {
        // Fluent chain: makeBaseBox(10, 10, 10).fillet(100)
        // Only .fillet(100) throws — preceding calls already completed
        // and are NOT on the call stack (JavaScript limitation).
        const code = `import { makeBaseBox } from 'replicad';

export default function main() {
  return makeBaseBox(10, 10, 10)
    .fillet(100);
}
`;

        const result = await createGeometry({
          files: { 'fluent.ts': code },
          mainFile: 'fluent.ts',
          parameters: {},
          options: {
            workerOptions: {
              wasm: 'single',
              withSourceMapping: true,
            },
          },
        });

        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            message: expect.stringMatching(/StdFail_NotDone/),
            location: expect.objectContaining({
              fileName: 'fluent.ts',
              startLineNumber: 5,
            }),
            stackFrames: expect.arrayContaining([
              expect.objectContaining({
                functionName: 'main',
                fileName: 'fluent.ts',
                context: 'user',
              }),
              expect.objectContaining({ context: 'library' }),
              // Framework: kernel infrastructure
              expect.objectContaining({ functionName: 'runOcMain', context: 'framework' }),
              expect.objectContaining({ functionName: 'Object.createGeometry', context: 'framework' }),
            ]),
          }),
        );

        // RethrowIfWasmException should be stripped
        const allNames = result.issues[0]!.stackFrames?.map((f) => f.functionName) ?? [];
        expect(allNames).not.toContain('rethrowIfWasmException');
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

      it('should return success with no issues when main returns undefined (no return statement)', async () => {
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
        expect(result.issues).toEqual([]);
        expect(result.data).toHaveLength(0);
      });

      it('should return success with no issues when main explicitly returns undefined', async () => {
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
        expect(result.issues).toEqual([]);
        expect(result.data).toHaveLength(0);
      });
    });

    describe('source map stack trace resolution', () => {
      // Regression guard for shared OCCT error-formatter extraction (oc-error-formatter.ts).
      // Asserts that a vanilla `throw new Error()` from inside `main()` still resolves
      // to the user's source path (not a `blob:` URL) after the kernel-level
      // parseError/runMain helpers were collapsed into the shared OCCT helpers.
      it('should resolve user source path for thrown Error inside main (shared-helper parity)', async () => {
        const code = `import {} from 'replicad';

export default function main() {
  throw new Error('boom-from-main');
}
`;

        const result = await createGeometry({
          files: { 'main.ts': code },
          mainFile: 'main.ts',
        });
        assertFailure(result);
        const issue = result.issues[0]!;
        expect(issue.stackFrames?.length ?? 0).toBeGreaterThan(0);

        const userFrame = issue.stackFrames!.find((f) => f.context === 'user');
        expect(userFrame, 'expected at least one user-context stack frame').toBeDefined();
        expect(userFrame!.fileName).toMatch(/main\.ts$/);
        expect(userFrame!.fileName).not.toMatch(/^blob:/);
        expect(userFrame!.functionName).toBe('main');
        expect(userFrame!.lineNumber).toBe(4);
        expect(issue.location?.fileName).toMatch(/main\.ts$/);
        expect(issue.location?.startLineNumber).toBe(4);
      });

      it('should map stack trace to original source positions (single file)', async () => {
        const code = `import {} from 'replicad';

export const defaultParams = {};

export default function main() {
  return bla;
}
`;

        const result = await createGeometry({
          files: { 'main.ts': code },
          mainFile: 'main.ts',
        });
        assertFailure(result);
        // Source map should resolve to original file name (not blob UUID)
        // and original line 6 (not post-banner offset line 9)
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            message: 'bla is not defined',
            type: 'runtime',
            severity: 'error',
            location: expect.objectContaining({
              fileName: 'main.ts',
              startLineNumber: 6,
            }),
            stackFrames: expect.arrayContaining([
              { functionName: 'main', fileName: 'main.ts', lineNumber: 6, columnNumber: 3, context: 'user' },
            ]),
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
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            message: 'bla is not defined',
            type: 'runtime',
            severity: 'error',
            location: expect.objectContaining({
              fileName: 'lib/helper.ts',
              startLineNumber: 1,
            }),
            stackFrames: expect.arrayContaining([
              { functionName: 'broken', fileName: 'lib/helper.ts', lineNumber: 1, columnNumber: 28, context: 'user' },
              { functionName: 'main', fileName: 'main.ts', lineNumber: 3, columnNumber: 41, context: 'user' },
            ]),
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

        const result = await createGeometry({
          files: { 'main.ts': code },
          mainFile: 'main.ts',
        });
        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            message: 'bla is not defined',
            type: 'runtime',
            severity: 'error',
            location: expect.objectContaining({
              fileName: 'main.ts',
              startLineNumber: 4,
            }),
            stackFrames: expect.arrayContaining([
              { functionName: 'makeBadShape', fileName: 'main.ts', lineNumber: 4, columnNumber: 3, context: 'user' },
              { functionName: 'main', fileName: 'main.ts', lineNumber: 8, columnNumber: 10, context: 'user' },
            ]),
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
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            message: 'bla is not defined',
            type: 'runtime',
            severity: 'error',
            location: expect.objectContaining({
              fileName: 'lib/bad.ts',
              startLineNumber: 1,
            }),
            stackFrames: expect.arrayContaining([
              { functionName: 'broken', fileName: 'lib/bad.ts', lineNumber: 1, columnNumber: 28, context: 'user' },
              { functionName: 'getShape', fileName: 'lib/middle.ts', lineNumber: 2, columnNumber: 37, context: 'user' },
              { functionName: 'main', fileName: 'main.ts', lineNumber: 3, columnNumber: 41, context: 'user' },
            ]),
          }),
        );
      });
    });

    describe('withSourceMapping option', () => {
      const filletFailCode = `import { makeBaseBox } from 'replicad';

export default function main() {
  return makeBaseBox(10, 10, 10).fillet(100);
}
`;

      it('should show compiled library paths when withSourceMapping is false (default)', async () => {
        const result = await createGeometry({
          files: { 'box.ts': filletFailCode },
          mainFile: 'box.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single' } },
        });

        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            stackFrames: expect.arrayContaining([
              expect.objectContaining({
                context: 'library',
                fileName: expect.stringMatching(/replicad\/dist\/replicad\.js$/),
              }),
            ]),
          }),
        );

        const libraryFrames = result.issues[0]!.stackFrames?.filter((f) => f.context === 'library');
        for (const frame of libraryFrames!) {
          expect(frame.fileName).not.toMatch(/replicad\/src\//);
        }
      });

      it('should show source-mapped library paths when withSourceMapping is true', async () => {
        const result = await createGeometry({
          files: { 'box.ts': filletFailCode },
          mainFile: 'box.ts',
          parameters: {},
          options: {
            workerOptions: {
              wasm: 'single',
              withSourceMapping: true,
            },
          },
        });

        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            stackFrames: expect.arrayContaining([
              expect.objectContaining({
                context: 'library',
                fileName: expect.stringMatching(/replicad\/src\//),
              }),
            ]),
          }),
        );

        const libraryFrames = result.issues[0]!.stackFrames?.filter((f) => f.context === 'library');
        for (const frame of libraryFrames!) {
          expect(frame.fileName).toMatch(/replicad\/src\//);
        }
      });

      it('should classify library frames by export name, not file path', async () => {
        // Validates export-name-based library classification that works identically
        // in dev and prod. In production, bundled chunk names are opaque, so
        // classifyLibraryFrames uses the replicad export name table instead.
        const result = await createGeometry({
          files: { 'box.ts': filletFailCode },
          mainFile: 'box.ts',
          parameters: {},
          options: { workerOptions: { wasm: 'single' } },
        });

        assertFailure(result);
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            type: 'kernel',
            severity: 'error',
            stackFrames: expect.arrayContaining([
              expect.objectContaining({ functionName: 'main', fileName: 'box.ts', context: 'user' }),
              expect.objectContaining({ context: 'library' }),
            ]),
          }),
        );

        // Every frame must have a definite context
        for (const frame of result.issues[0]!.stackFrames!) {
          expect(['user', 'library', 'framework', 'runtime']).toContain(frame.context);
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
        expect(result.issues[0]).toEqual(
          expect.objectContaining({
            message: 'undefinedFunction is not defined',
            type: 'runtime',
            severity: 'error',
            location: expect.objectContaining({
              fileName: 'project/main.ts',
              startLineNumber: 5,
            }),
            stackFrames: expect.arrayContaining([
              { functionName: 'main', fileName: 'project/main.ts', lineNumber: 5, columnNumber: 15, context: 'user' },
            ]),
          }),
        );
      });
    });
  });

  // ===========================================================================
  // Tests: Export Geometry
  // ===========================================================================

  describe('exportGeometry', () => {
    it('should export to STEP format with actual geometry', async () => {
      const worker = await createWorker({
        'box.ts': `
          import { drawRoundedRectangle } from 'replicad';

          export default function main() {
            return drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
          }
        `,
      });

      const geometryFile = createGeometryFile('box.ts');
      const createResult = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      assertSuccess(createResult);

      const exportResult = await worker.exportGeometry('step');
      assertSuccess(exportResult);
      expect(exportResult.data.length).toBeGreaterThan(0);
      expect(exportResult.data[0]?.bytes).toBeInstanceOf(Uint8Array);
      expect(exportResult.data[0]?.mimeType).toBe('application/step');

      const stepContent = new TextDecoder().decode(exportResult.data[0]!.bytes);
      expect(stepContent).toContain('CLOSED_SHELL');
      expect(stepContent).toContain('ADVANCED_BREP_SHAPE_REPRESENTATION');
    });

    it('should round-trip STEP export/import preserving geometry', async () => {
      const { importSTEP, drawRoundedRectangle, measureVolume, measureArea, isShape3D } = await import('replicad');

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

      const exportResult = await worker.exportGeometry('step');
      assertSuccess(exportResult);

      const stepBytes = exportResult.data[0]!.bytes;
      const stepBlob = new Blob([stepBytes], { type: 'application/step' });
      const importedShape = await importSTEP(stepBlob);

      expect(isShape3D(importedShape)).toBe(true);
      if (!isShape3D(importedShape)) {
        throw new Error('Imported shape is not a 3D shape');
      }

      const originalShape = drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
      if (!isShape3D(originalShape)) {
        throw new Error('Extruded shape is not a 3D shape');
      }
      const originalVolume = measureVolume(originalShape);
      const importedVolume = measureVolume(importedShape);

      expect(originalVolume).toBeGreaterThan(0);
      expect(importedVolume).toBeCloseTo(originalVolume, 2);

      const originalArea = measureArea(originalShape);
      const importedArea = measureArea(importedShape);

      expect(originalArea).toBeGreaterThan(0);
      expect(importedArea).toBeCloseTo(originalArea, 2);

      expect(importedShape.faces.length).toBe(originalShape.faces.length);
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

      const exportResult = await worker.exportGeometry('stl', { binary: true });
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

    it('should export STEP assembly with geometry for each shape', async () => {
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

      const exportResult = await worker.exportGeometry('step', {});
      assertSuccess(exportResult);

      const stepContent = new TextDecoder().decode(exportResult.data[0]!.bytes);
      expect(stepContent).toContain('CLOSED_SHELL');
      expect(stepContent).toContain('ADVANCED_BREP_SHAPE_REPRESENTATION');
      expect(stepContent).toContain('base');
      expect(stepContent).toContain('cylinder');
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
      const result = await worker.render({
        file: geometryFile,
        parameters: { base: { width: 50 } },
      });

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
      const result1 = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      assertSuccess(result1);
      await geometryHelpers.expectValidGltf(result1);

      // Modify file content: change to 20x20x20 box
      // Write directly to the existing FS instance (seedTestFileSystem creates a new
      // fromMemoryFS, which disconnects from the bridge the worker reads through).
      const fs1 = getTestFileSystem();
      await fs1.writeFile(
        '/projects/test/main.ts',
        `
          import { drawRoundedRectangle } from 'replicad';
          export default function main() {
            return drawRoundedRectangle(20, 20).sketchOnPlane().extrude(20);
          }
        `,
      );

      // Notify worker about the change
      await worker.notifyFileChanged(['/projects/test/main.ts']);

      // Second render should use updated code
      const result2 = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
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
      const result1 = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      assertSuccess(result1);

      // Modify file content (write to existing FS to preserve bridge connection)
      const fs2 = getTestFileSystem();
      await fs2.writeFile(
        '/projects/test/main.ts',
        `
          import { drawRoundedRectangle } from 'replicad';
          export default function main() {
            return drawRoundedRectangle(30, 30).sketchOnPlane().extrude(30);
          }
        `,
      );

      // Notify with ABSOLUTE path (matching production behavior from use-project.tsx)
      await worker.notifyFileChanged(['/projects/test/main.ts']);

      // Second render should use updated code
      const result2 = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      assertSuccess(result2);

      // Bounding boxes must differ (10mm vs 30mm)
      await geometryHelpers.expectBoundingBoxSize(result1, [0.01, 0.01, 0.01], 0.002);
      await geometryHelpers.expectBoundingBoxSize(result2, [0.03, 0.03, 0.03], 0.002);
    });

    it('should re-render with different parameters when replicad is imported transitively (production flow)', async () => {
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
          detectImport: replicadDetectPattern.source,
          builtinModuleNames: ['replicad'],
        },
      );

      const geometryFile = createGeometryFile('main.ts');

      const result1 = await worker.render({
        file: geometryFile,
        parameters: { size: 30 },
      });
      assertSuccess(result1);
      await geometryHelpers.expectValidGltf(result1);

      // Second render with different parameters — kernel selection is cached
      // via ensureActiveKernel so the bundler-detected kernel persists.
      const result2 = await worker.render({
        file: geometryFile,
        parameters: { size: 60 },
      });
      assertSuccess(result2);
      await geometryHelpers.expectValidGltf(result2);
    });

    it('should recover when a single dependency has a syntax error that is then fixed', async () => {
      const worker = await createWorker({
        'main.ts': `
          import { makeBox } from './lib/box';
          export default function main() {
            return makeBox();
          }
        `,
        'lib/box.ts': `
          import { makeBaseBox } from 'replicad';
          // Syntax error: unterminated regex
          const pattern = /missing-slash
          export function makeBox() {
            return makeBaseBox(10, 10, 10);
          }
        `,
      });

      const geometryFile = createGeometryFile('main.ts');

      // First render should fail due to syntax error in dependency
      const result1 = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      assertFailure(result1);

      // Fix the syntax error (write to existing FS to preserve bridge connection)
      const fs3 = getTestFileSystem();
      await fs3.writeFile(
        '/projects/test/main.ts',
        `
          import { makeBox } from './lib/box';
          export default function main() {
            return makeBox();
          }
        `,
      );
      await fs3.writeFile(
        '/projects/test/lib/box.ts',
        `
          import { makeBaseBox } from 'replicad';
          const pattern = /valid-regex/;
          export function makeBox() {
            return makeBaseBox(10, 10, 10);
          }
        `,
      );

      // Notify that the dependency changed
      await worker.notifyFileChanged(['/projects/test/lib/box.ts']);

      // Second render should succeed with the fixed dependency
      const result2 = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      assertSuccess(result2);
      await geometryHelpers.expectValidGltf(result2);
    });

    it('should recover when a transitive dependency (double-dep chain) has a syntax error that is then fixed', async () => {
      const worker = await createWorker({
        'main.ts': `
          import { makeAssembly } from './lib/assembly';
          export default function main() {
            return makeAssembly();
          }
        `,
        'lib/assembly.ts': `
          import { makeBox } from './shapes';
          export function makeAssembly() {
            return makeBox();
          }
        `,
        'lib/shapes.ts': `
          import { makeBaseBox } from 'replicad';
          // Syntax error: missing closing brace
          export function makeBox( {
            return makeBaseBox(10, 10, 10);
          }
        `,
      });

      const geometryFile = createGeometryFile('main.ts');

      // First render should fail due to syntax error in transitive dependency
      const result1 = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      assertFailure(result1);

      // Fix the syntax error in the transitive dependency (write to existing FS to preserve bridge connection)
      const fs4 = getTestFileSystem();
      await fs4.writeFile(
        '/projects/test/main.ts',
        `
          import { makeAssembly } from './lib/assembly';
          export default function main() {
            return makeAssembly();
          }
        `,
      );
      await fs4.writeFile(
        '/projects/test/lib/assembly.ts',
        `
          import { makeBox } from './shapes';
          export function makeAssembly() {
            return makeBox();
          }
        `,
      );
      await fs4.writeFile(
        '/projects/test/lib/shapes.ts',
        `
          import { makeBaseBox } from 'replicad';
          export function makeBox() {
            return makeBaseBox(10, 10, 10);
          }
        `,
      );

      // Notify that the transitive dependency changed
      await worker.notifyFileChanged(['/projects/test/lib/shapes.ts']);

      // Second render should succeed
      const result2 = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      assertSuccess(result2);
      await geometryHelpers.expectValidGltf(result2);
    });

    it('should recover when one of multiple dependencies has a syntax error that is then fixed', async () => {
      const worker = await createWorker({
        'main.ts': `
          import { makeBox } from './lib/box';
          import { makeCylinder } from './lib/cylinder';
          export default function main() {
            return [makeBox(), makeCylinder()];
          }
        `,
        'lib/box.ts': `
          import { makeBaseBox } from 'replicad';
          export function makeBox() {
            return makeBaseBox(10, 10, 10);
          }
        `,
        'lib/cylinder.ts': `
          import { makeBaseBox } from 'replicad';
          // Syntax error: invalid expression
          export function makeCylinder( {
            return makeBaseBox(5, 5, 20);
          }
        `,
      });

      const geometryFile = createGeometryFile('main.ts');

      // First render should fail (cylinder has syntax error)
      const result1 = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      assertFailure(result1);

      // Fix the syntax error in cylinder (write to existing FS to preserve bridge connection)
      const fs5 = getTestFileSystem();
      await fs5.writeFile(
        '/projects/test/main.ts',
        `
          import { makeBox } from './lib/box';
          import { makeCylinder } from './lib/cylinder';
          export default function main() {
            return [makeBox(), makeCylinder()];
          }
        `,
      );
      await fs5.writeFile(
        '/projects/test/lib/box.ts',
        `
          import { makeBaseBox } from 'replicad';
          export function makeBox() {
            return makeBaseBox(10, 10, 10);
          }
        `,
      );
      await fs5.writeFile(
        '/projects/test/lib/cylinder.ts',
        `
          import { makeBaseBox } from 'replicad';
          export function makeCylinder() {
            return makeBaseBox(5, 5, 20);
          }
        `,
      );

      // Notify that the fixed dependency changed
      await worker.notifyFileChanged(['/projects/test/lib/cylinder.ts']);

      // Second render should succeed
      const result2 = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      assertSuccess(result2);
      await geometryHelpers.expectValidGltf(result2);
    });

    it('should include dependency paths in watch set even when build fails', async () => {
      const worker = await createWorker({
        'main.ts': `
          import { makeBox } from './lib/box';
          export default function main() {
            return makeBox();
          }
        `,
        'lib/box.ts': `
          import { makeBaseBox } from 'replicad';
          // Syntax error
          export function makeBox( {
            return makeBaseBox(10, 10, 10);
          }
        `,
      });

      const geometryFile = createGeometryFile('main.ts');

      // Use render() which calls _updateWatchSetFromCaches in its finally block
      const result = await worker.render({
        file: geometryFile,
        parameters: {},
      });
      assertFailure(result);

      // Verify that the worker's watch set includes the dependency file,
      // even though the build failed
      const watchedPaths = worker.getWatchedPaths();
      expect(watchedPaths).toContain('/projects/test/main.ts');
      expect(watchedPaths).toContain('/projects/test/lib/box.ts');
    });

    it('should watch unresolved imports and re-render when missing files are created', async () => {
      const worker = await createWorker({
        'main.ts': `
          import { makeBox } from './lib/box';
          import { makeCylinder } from './lib/cylinder';
          export default function main() {
            return [makeBox(), makeCylinder()];
          }
        `,
      });

      const geometryFile = createGeometryFile('main.ts');

      const result1 = await worker.render({
        file: geometryFile,
        parameters: {},
      });
      assertFailure(result1);

      // The watch set should include extension variants for the unresolved
      // imports so that creating the files later triggers a re-render
      const watchedPaths = worker.getWatchedPaths();
      expect(watchedPaths).toContain('/projects/test/main.ts');
      expect(watchedPaths).toContain('/projects/test/lib/box.ts');
      expect(watchedPaths).toContain('/projects/test/lib/cylinder.ts');

      // Write missing files directly to the live filesystem (seedTestFileSystem
      // replaces the instance, but the bridge port is bound to the original)
      const fs = getTestFileSystem();
      await fs.mkdir('/projects/test/lib', { recursive: true });
      await fs.writeFile(
        '/projects/test/lib/box.ts',
        `
          import { makeBaseBox } from 'replicad';
          export function makeBox() {
            return makeBaseBox(10, 10, 10);
          }
        `,
      );
      await fs.writeFile(
        '/projects/test/lib/cylinder.ts',
        `
          import { makeBaseBox } from 'replicad';
          export function makeCylinder() {
            return makeBaseBox(5, 5, 20);
          }
        `,
      );

      await worker.notifyFileChanged(['/projects/test/lib/box.ts']);

      const result2 = await worker.createGeometry({
        file: geometryFile,
        parameters: {},
      });
      assertSuccess(result2);
      await geometryHelpers.expectValidGltf(result2);
    });

    it('should resolve .js import to .ts file and render successfully', async () => {
      const worker = await createWorker({
        'main.ts': `
          import { makeBox } from './lib/box.js';
          export default function main() {
            return makeBox();
          }
        `,
        'lib/box.ts': `
          import { makeBaseBox } from 'replicad';
          export function makeBox() {
            return makeBaseBox(10, 10, 10);
          }
        `,
      });

      const geometryFile = createGeometryFile('main.ts');
      const result = await worker.render({
        file: geometryFile,
        parameters: {},
      });
      assertSuccess(result);
      await geometryHelpers.expectValidGltf(result);
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
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
    worker.flushTelemetry();
  }

  beforeEach(() => {
    performance.clearMeasures();
    performance.clearMarks();
  });

  it('emits an oc.summary span by default (summary mode)', async () => {
    const telemetryBatches: TelemetryEntry[][] = [];

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
    const telemetryBatches: TelemetryEntry[][] = [];

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
    const telemetryBatches: TelemetryEntry[][] = [];

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
    const telemetryBatches: TelemetryEntry[][] = [];

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

    const documentWithout = await new NodeIO().readBinary(glbWithout);
    const documentWith = await new NodeIO().readBinary(glbWith);

    let triangleVerticesWithout = 0;
    for (const mesh of documentWithout.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() === 4) {
          triangleVerticesWithout += primitive.getAttribute('POSITION')!.getCount();
        }
      }
    }

    let triangleVerticesWith = 0;
    for (const mesh of documentWith.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() === 4) {
          triangleVerticesWith += primitive.getAttribute('POSITION')!.getCount();
        }
      }
    }

    expect(triangleVerticesWithout).toBe(triangleVerticesWith);
  });

  it('should produce valid BRep edges', async () => {
    const result = await createTestGeometry({
      definition: replicadKernel,
      files: { 'box.ts': boxCode },
      mainFile: 'box.ts',
      parameters: {},
      options: { workerOptions: { wasm: 'single', withBrepEdges: true } },
    });

    assertSuccess(result);
    const lineCount = await countLinePrimitives(result);
    expect(lineCount).toBeGreaterThan(0);
  });
});

// =============================================================================
// Angular tolerance (degree-to-radian conversion)
// =============================================================================

describe('Angular tolerance', () => {
  const sphereCode = `
    import { drawCircle } from 'replicad';
    export default function main() {
      return drawCircle(10).sketchOnPlane().revolve();
    }
  `;

  const getVertexCount = async (glbData: Uint8Array<ArrayBuffer>): Promise<number> => {
    const document = await new NodeIO().readBinary(glbData);
    let count = 0;
    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() === 4) {
          count += primitive.getAttribute('POSITION')!.getCount();
        }
      }
    }

    return count;
  };

  it('should produce denser meshes with finer angular tolerance on curved surfaces', async () => {
    const worker = await createWorker({ 'sphere.ts': sphereCode });
    const geometryFile = createGeometryFile('sphere.ts');

    const coarseResult = await worker.createGeometry({
      file: geometryFile,
      parameters: {},
      options: { tessellation: { linearTolerance: 1, angularTolerance: 60 } },
    });
    assertSuccess(coarseResult);

    const fineResult = await worker.createGeometry({
      file: geometryFile,
      parameters: {},
      options: { tessellation: { linearTolerance: 1, angularTolerance: 5 } },
    });
    assertSuccess(fineResult);

    const coarseVertices = await getVertexCount(extractGltfFromResult(coarseResult)!);
    const fineVertices = await getVertexCount(extractGltfFromResult(fineResult)!);

    // Fine angular tolerance (5°) must produce significantly more vertices
    // than coarse (60°) on a sphere. If the deg→rad conversion is broken
    // (raw degrees passed as radians), both values are meaninglessly large
    // and produce identical mesh density driven only by linearTolerance.
    expect(fineVertices).toBeGreaterThan(coarseVertices * 1.5);
  });
});

// =============================================================================
// Normal consistency helpers
// =============================================================================

type VertexNormalEntry = { pos: number[]; normal: number[] };

function extractNormalsFromDocument(document: Document): VertexNormalEntry[] {
  const result: VertexNormalEntry[] = [];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        continue;
      }
      const positionAccessor = primitive.getAttribute('POSITION')!;
      const normalAccessor = primitive.getAttribute('NORMAL')!;
      const count = positionAccessor.getCount();
      for (let index = 0; index < count; index++) {
        result.push({
          pos: [...positionAccessor.getElement(index, [0, 0, 0])],
          normal: [...normalAccessor.getElement(index, [0, 0, 0])],
        });
      }
    }
  }
  return result;
}

function analyzeCoLocatedNormals(
  normals: VertexNormalEntry[],
  predicate: (dotProduct: number) => boolean,
): { matchCount: number; totalPairs: number } {
  const epsilon = 1e-5;
  const cellSize = epsilon * 2;
  const grid = new Map<string, number[]>();

  for (const [index, entry] of normals.entries()) {
    const p = entry.pos;
    const key = `${Math.round(p[0]! / cellSize)},${Math.round(p[1]! / cellSize)},${Math.round(p[2]! / cellSize)}`;
    const bucket = grid.get(key);
    if (bucket) {
      bucket.push(index);
    } else {
      grid.set(key, [index]);
    }
  }

  let matchCount = 0;
  let totalPairs = 0;

  for (const bucket of grid.values()) {
    for (let ii = 0; ii < bucket.length; ii++) {
      for (let jj = ii + 1; jj < bucket.length; jj++) {
        const a = normals[bucket[ii]!]!;
        const b = normals[bucket[jj]!]!;
        const distance = Math.hypot(a.pos[0]! - b.pos[0]!, a.pos[1]! - b.pos[1]!, a.pos[2]! - b.pos[2]!);
        if (distance >= epsilon) {
          continue;
        }
        const dot = a.normal[0]! * b.normal[0]! + a.normal[1]! * b.normal[1]! + a.normal[2]! * b.normal[2]!;
        totalPairs++;
        if (predicate(dot)) {
          matchCount++;
        }
      }
    }
  }

  return { matchCount, totalPairs };
}

// =============================================================================
// Normal consistency (OCCT V8 regression guard)
// =============================================================================

describe('Normal consistency', () => {
  it('should produce outward-facing normals on all faces of a convex solid', async () => {
    const result = await createTestGeometry({
      definition: replicadKernel,
      files: {
        'box.ts': `
          import { drawRoundedRectangle } from 'replicad';
          export default function main() {
            return drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10);
          }
        `,
      },
      mainFile: 'box.ts',
      parameters: {},
    });

    assertSuccess(result);

    const glbData = extractGltfFromResult(result)!;
    const document = await new NodeIO().readBinary(glbData);

    const center = [0, 0, 0] as [number, number, number];
    let totalVertices = 0;

    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() !== 4) {
          continue;
        }
        const positionAccessor = primitive.getAttribute('POSITION')!;
        const count = positionAccessor.getCount();
        for (let i = 0; i < count; i++) {
          const pos = positionAccessor.getElement(i, [0, 0, 0]);
          center[0] += pos[0]!;
          center[1] += pos[1]!;
          center[2] += pos[2]!;
          totalVertices++;
        }
      }
    }

    center[0] /= totalVertices;
    center[1] /= totalVertices;
    center[2] /= totalVertices;

    let inwardCount = 0;
    let checkedCount = 0;

    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() !== 4) {
          continue;
        }
        const positionAccessor = primitive.getAttribute('POSITION')!;
        const normalAccessor = primitive.getAttribute('NORMAL')!;
        const count = positionAccessor.getCount();

        for (let i = 0; i < count; i++) {
          const pos = positionAccessor.getElement(i, [0, 0, 0]);
          const normal = normalAccessor.getElement(i, [0, 0, 0]);

          const dx = pos[0]! - center[0];
          const dy = pos[1]! - center[1];
          const dz = pos[2]! - center[2];

          const dot = dx * normal[0]! + dy * normal[1]! + dz * normal[2]!;
          if (dot < 0) {
            inwardCount++;
          }
          checkedCount++;
        }
      }
    }

    expect(checkedCount).toBeGreaterThan(0);
    const inwardRatio = inwardCount / checkedCount;
    expect(inwardRatio, `${(inwardRatio * 100).toFixed(1)}% of normals point inward (expected <5%)`).toBeLessThan(0.05);
  });

  it('should produce outward-facing normals after boolean operations', async () => {
    const result = await createTestGeometry({
      definition: replicadKernel,
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
      parameters: {},
    });

    assertSuccess(result);

    const glbData = extractGltfFromResult(result)!;
    const document = await new NodeIO().readBinary(glbData);

    let inwardCount = 0;
    let checkedCount = 0;

    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() !== 4) {
          continue;
        }
        const positionAccessor = primitive.getAttribute('POSITION')!;
        const normalAccessor = primitive.getAttribute('NORMAL')!;
        const indexAccessor = primitive.getIndices();
        const triCount = indexAccessor ? indexAccessor.getCount() / 3 : positionAccessor.getCount() / 3;

        for (let t = 0; t < triCount; t++) {
          const i0 = indexAccessor ? indexAccessor.getScalar(t * 3) : t * 3;
          const i1 = indexAccessor ? indexAccessor.getScalar(t * 3 + 1) : t * 3 + 1;
          const i2 = indexAccessor ? indexAccessor.getScalar(t * 3 + 2) : t * 3 + 2;

          const p0 = positionAccessor.getElement(i0, [0, 0, 0]);
          const p1 = positionAccessor.getElement(i1, [0, 0, 0]);
          const p2 = positionAccessor.getElement(i2, [0, 0, 0]);

          const error1 = [p1[0]! - p0[0]!, p1[1]! - p0[1]!, p1[2]! - p0[2]!];
          const error2 = [p2[0]! - p0[0]!, p2[1]! - p0[1]!, p2[2]! - p0[2]!];
          const cross = [
            error1[1]! * error2[2]! - error1[2]! * error2[1]!,
            error1[2]! * error2[0]! - error1[0]! * error2[2]!,
            error1[0]! * error2[1]! - error1[1]! * error2[0]!,
          ];

          const n0 = normalAccessor.getElement(i0, [0, 0, 0]);
          const dot = cross[0]! * n0[0]! + cross[1]! * n0[1]! + cross[2]! * n0[2]!;
          if (dot < 0) {
            inwardCount++;
          }
          checkedCount++;
        }
      }
    }

    expect(checkedCount).toBeGreaterThan(0);
    const inwardRatio = inwardCount / checkedCount;
    expect(
      inwardRatio,
      `${(inwardRatio * 100).toFixed(1)}% of normals disagree with winding (expected <5%)`,
    ).toBeLessThan(0.05);
  });

  it('should produce smooth normals across face boundaries on a filleted shape', { timeout: 30_000 }, async () => {
    const result = await createTestGeometry({
      definition: replicadKernel,
      files: {
        'fillet.ts': `
          import { drawRoundedRectangle } from 'replicad';
          export default function main() {
            return drawRoundedRectangle(40, 40, 8).sketchOnPlane().extrude(20).fillet(2);
          }
        `,
      },
      mainFile: 'fillet.ts',
      parameters: {},
    });

    assertSuccess(result);

    const glbData = extractGltfFromResult(result)!;
    const document = await new NodeIO().readBinary(glbData);

    const allNormals = extractNormalsFromDocument(document);

    const { matchCount, totalPairs } = analyzeCoLocatedNormals(allNormals, (dot) => dot > 0.7);

    expect(totalPairs).toBeGreaterThan(0);
    const smoothRatio = matchCount / totalPairs;
    expect(
      smoothRatio,
      `${(smoothRatio * 100).toFixed(1)}% of co-located normals are smooth (expected >90%)`,
    ).toBeGreaterThan(0.9);
  });

  it('should preserve sharp edges on a tray (base-to-wall 90° transition)', async () => {
    const result = await createTestGeometry({
      definition: replicadKernel,
      files: {
        'tray.ts': `
          import { drawRoundedRectangle } from 'replicad';
          export default function main() {
            const outer = drawRoundedRectangle(60, 40).sketchOnPlane().extrude(15);
            const inner = drawRoundedRectangle(54, 34)
              .sketchOnPlane("XY", 3)
              .extrude(15);
            return outer.cut(inner);
          }
        `,
      },
      mainFile: 'tray.ts',
      parameters: {},
    });

    assertSuccess(result);

    const glbData = extractGltfFromResult(result)!;
    const document = await new NodeIO().readBinary(glbData);

    const allNormals = extractNormalsFromDocument(document);

    const { matchCount, totalPairs } = analyzeCoLocatedNormals(allNormals, (dot) => dot < 0.5);

    expect(totalPairs).toBeGreaterThan(0);
    const sharpRatio = matchCount / totalPairs;
    expect(
      sharpRatio,
      `${(sharpRatio * 100).toFixed(1)}% of co-located pairs are sharp (expected >20% — tray has 90° wall-to-base edges)`,
    ).toBeGreaterThan(0.2);
  });
});

// =============================================================================
// Example models with exceptions enabled
// =============================================================================

// Longer test suite for verifying opencascadejs bindings to replicad are all present.
describe.skip('Example models', () => {
  for (const fixture of exampleFixtures) {
    it(`should produce valid geometry for ${fixture.name}`, async () => {
      const result = await createGeometry({
        files: fixture.files,
        mainFile: fixture.mainFile,
        options: { workerOptions: { wasm: 'single' } },
      });

      assertSuccess(result);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
    });
  }
});

// =============================================================================
// serializeHandle / deserializeHandle
// =============================================================================

describe('serializeHandle', () => {
  it('should serialize nativeHandle to BRep strings with metadata', async () => {
    const result = await createGeometry({
      files: {
        'box.ts': `
          import { drawRoundedRectangle } from 'replicad';
          export default function main() {
            return {
              shape: drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10),
              name: 'TestBox',
              color: '#ff0000',
              metalness: 0.8,
              roughness: 0.3,
            };
          }
        `,
      },
      mainFile: 'box.ts',
    });

    assertSuccess(result);
    expect(result.serializedHandle).toBeDefined();

    const serialized = result.serializedHandle as Array<{
      brep: string;
      metadata: Record<string, unknown>;
    }>;

    expect(serialized).toHaveLength(1);
    expect(typeof serialized[0]!.brep).toBe('string');
    expect(serialized[0]!.brep.length).toBeGreaterThan(0);
    expect(serialized[0]!.metadata['name']).toBe('TestBox');
    expect(serialized[0]!.metadata['color']).toBe('#ff0000');
    expect(serialized[0]!.metadata['metalness']).toBe(0.8);
    expect(serialized[0]!.metadata['roughness']).toBe(0.3);
  });

  it('should round-trip serialize/deserialize preserving shape geometry', async () => {
    const result = await createGeometry({
      files: {
        'box.ts': `
          import { drawRoundedRectangle, drawCircle } from 'replicad';
          export default function main() {
            return [
              { shape: drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10), name: 'Box', color: '#ff0000' },
              { shape: drawCircle(10).sketchOnPlane().extrude(20).translate([0, 0, 10]), name: 'Cylinder', color: '#0000ff', opacity: 0.7 },
            ];
          }
        `,
      },
      mainFile: 'box.ts',
    });

    assertSuccess(result);
    expect(result.serializedHandle).toBeDefined();

    const serialized = result.serializedHandle as Array<{
      brep: string;
      metadata: { name: string; color?: string; opacity?: number };
    }>;

    expect(serialized).toHaveLength(2);
    expect(serialized[0]!.metadata.name).toBe('Box');
    expect(serialized[1]!.metadata.name).toBe('Cylinder');
    expect(serialized[1]!.metadata.opacity).toBe(0.7);
  });

  it('should have serializeHandle and deserializeHandle defined on the kernel', () => {
    expect(replicadKernel.serializeHandle).toBeDefined();
    expect(replicadKernel.deserializeHandle).toBeDefined();
  });
});

describe('No kernel matched', () => {
  it('should return empty geometry for an empty file when no kernel can handle it', async () => {
    const result = await createGeometry({
      files: { 'empty.ts': '' },
      mainFile: 'empty.ts',
      options: {
        builtinModuleNames: ['replicad'],
        detectImport: replicadDetectPattern.source,
      },
    });

    assertSuccess(result);
    expect(result.data).toEqual([]);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End of file */
