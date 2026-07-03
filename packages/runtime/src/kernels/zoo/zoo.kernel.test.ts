// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { JSONDocument } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import type { JSONSchema7 } from '@taucad/json-schema';
import { zoo as zooKernel } from '#kernels/zoo/zoo.kernel.js';
import type { KclUtilities } from '#kernels/zoo/kcl-utils.js';
import { createMockKernelRuntime, createTestWorker, createGeometryFile } from '#testing/kernel-testing.utils.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { writeGlb, writeGltfJson } from '#utils/glb-writer.js';
import type { GlbPrimitive } from '#utils/glb-writer.js';

/* eslint-disable @typescript-eslint/naming-convention -- File names use extensions like 'main.kcl' */

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Initialize a Zoo runtime worker for parameter extraction.
 * Seeds the filesystem with provided files before creating the worker.
 *
 * Note: createGeometry requires a cloud websocket connection and is not tested here.
 * These tests focus on getParameters which uses the local KCL WASM parser.
 */
async function createWorker(files: Record<string, string>): ReturnType<typeof createTestWorker> {
  const worker = await createTestWorker(zooKernel, files);

  return worker;
}

const createTrianglePrimitive = (materialName?: string): GlbPrimitive => ({
  mode: 4,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
  material: {
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0,
    roughnessFactor: 1,
    doubleSided: true,
    alphaMode: 'OPAQUE',
    ...(materialName ? { name: materialName } : {}),
  },
});

const createNamedGlb = async (
  name: string,
  options: { materialName?: string; sceneName?: string } = {},
): Promise<Uint8Array<ArrayBuffer>> => {
  const glb = writeGlb({ nodes: [{ name, primitives: [createTrianglePrimitive(options.materialName)] }] });
  if (!options.sceneName) {
    return glb;
  }

  const io = new NodeIO();
  const document = await io.readBinary(glb);
  document.getRoot().listScenes()[0]!.setName(options.sceneName);
  return io.writeBinary(document);
};

const createNamedGltf = (
  name: string,
  options: { materialName?: string; sceneName?: string } = {},
): Uint8Array<ArrayBuffer> => {
  const bytes = writeGltfJson({ nodes: [{ name, primitives: [createTrianglePrimitive(options.materialName)] }] });
  if (!options.sceneName) {
    return bytes;
  }

  const json = JSON.parse(new TextDecoder().decode(bytes)) as JSONDocument['json'];
  const scenes = json.scenes ?? [];
  if (scenes[0]) {
    scenes[0].name = options.sceneName;
  }
  return new TextEncoder().encode(JSON.stringify(json));
};

const readGlbNodeNames = async (glbBytes: Uint8Array<ArrayBuffer>): Promise<string[]> => {
  const document = await new NodeIO().readBinary(glbBytes);
  return document
    .getRoot()
    .listNodes()
    .map((node) => node.getName());
};

const readGlbMaterialAndSceneNames = async (
  glbBytes: Uint8Array<ArrayBuffer>,
): Promise<{ materialNames: string[]; sceneNames: string[] }> => {
  const document = await new NodeIO().readBinary(glbBytes);
  return {
    materialNames: document
      .getRoot()
      .listMaterials()
      .map((material) => material.getName()),
    sceneNames: document
      .getRoot()
      .listScenes()
      .map((scene) => scene.getName()),
  };
};

const readGltfNodeNames = async (gltfBytes: Uint8Array<ArrayBuffer>): Promise<string[]> => {
  const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as JSONDocument['json'];
  const document = await new NodeIO().readJSON({
    json,
    resources: {},
  });
  return document
    .getRoot()
    .listNodes()
    .map((node) => node.getName());
};

const readGltfMaterialAndSceneNames = async (
  gltfBytes: Uint8Array<ArrayBuffer>,
): Promise<{ materialNames: string[]; sceneNames: string[] }> => {
  const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as JSONDocument['json'];
  const document = await new NodeIO().readJSON({
    json,
    resources: {},
  });
  return {
    materialNames: document
      .getRoot()
      .listMaterials()
      .map((material) => material.getName()),
    sceneNames: document
      .getRoot()
      .listScenes()
      .map((scene) => scene.getName()),
  };
};

/**
 * Helper to extract parameters and assert success.
 */
async function getParameters(
  files: Record<string, string>,
  mainFile: string,
): Promise<{
  jsonSchema: JSONSchema7;
  defaultParameters: Record<string, unknown>;
}> {
  const worker = await createWorker(files);
  const result = await worker.getParameters(createGeometryFile(mainFile));

  if (!result.success) {
    console.error('getParameters failed:', JSON.stringify(result.issues, null, 2));
  }

  expect(result.success).toBe(true);

  if (!result.success) {
    throw new Error('Extraction failed');
  }

  return result.data;
}

/**
 * Helper to get parameters with expected failure.
 */
async function getParametersWithError(
  files: Record<string, string>,
  mainFile: string,
): Promise<{ success: boolean; issues?: unknown[] }> {
  const worker = await createWorker(files);
  return worker.getParameters(createGeometryFile(mainFile));
}

describe('ZooWorker', () => {
  const resolveZooDefinition = async () => resolveRuntimePluginDefinition('kernel', zooKernel());
  let zooDefinition: Awaited<ReturnType<typeof resolveZooDefinition>>;

  beforeAll(async () => {
    zooDefinition = await resolveZooDefinition();
  });

  // ===========================================================================
  // Tests: Parameter Extraction - Single File Projects
  // ===========================================================================

  describe('getParameters', () => {
    describe('Single file projects', () => {
      it('should extract numeric parameters', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'box.kcl': `
              width = 10
              height = 20
              depth = 5

              box = startSketchOn(XY)
                |> startProfile(at = [0, 0])
                |> line(end = [width, 0])
                |> line(end = [0, height])
                |> line(end = [-width, 0])
                |> close(%)
                |> extrude(length = depth)
            `,
          },
          'box.kcl',
        );

        expect(defaultParameters).toMatchObject({
          width: 10,
          height: 20,
          depth: 5,
        });

        expect(jsonSchema).toMatchObject({
          type: 'object',
          properties: {
            width: { type: 'number', default: 10 },
            height: { type: 'number', default: 20 },
            depth: { type: 'number', default: 5 },
          },
        });
      });

      it('should extract decimal parameters', async () => {
        const { defaultParameters } = await getParameters(
          {
            'cylinder.kcl': `
              radius = 5.5
              height = 12.75

              cylinder = startSketchOn(XY)
                |> circle(center = [0, 0], radius = radius)
                |> extrude(length = height)
            `,
          },
          'cylinder.kcl',
        );

        expect(defaultParameters).toMatchObject({
          radius: 5.5,
          height: 12.75,
        });
      });

      it('should extract computed parameters', async () => {
        // Parameters that are computed from other values
        const { defaultParameters } = await getParameters(
          {
            'bracket.kcl': `
              // Parametric shelf bracket from zoo-modeling-app
              sigmaAllow = 35000
              width = 9
              p = 150
              distance = 6
              FOS = 2

              leg1 = 5
              leg2 = 8
              thickness = sqrt(distance * p * FOS * 6 / sigmaAllow / width)

              bracket = startSketchOn(XY)
                |> startProfile(at = [0, 0])
                |> line(end = [0, leg1])
                |> line(end = [leg2, 0])
                |> line(end = [0, -thickness])
                |> line(end = [-leg2 + thickness, 0])
                |> line(end = [0, -leg1 + thickness])
                |> close(%)
                |> extrude(length = width)
            `,
          },
          'bracket.kcl',
        );

        // Check that computed values are resolved
        expect(defaultParameters['sigmaAllow']).toBe(35_000);
        expect(defaultParameters['width']).toBe(9);
        expect(defaultParameters['p']).toBe(150);
        expect(defaultParameters['distance']).toBe(6);
        expect(defaultParameters['FOS']).toBe(2);
        expect(defaultParameters['leg1']).toBe(5);
        expect(defaultParameters['leg2']).toBe(8);
        // Thickness is computed: sqrt(6 * 150 * 2 * 6 / 35000 / 9) ≈ 0.135
        expect(typeof defaultParameters['thickness']).toBe('number');
      });

      it('should extract string parameters', async () => {
        const { defaultParameters } = await getParameters(
          {
            'text.kcl': `
              label = "Hello World"
              mode = "normal"

              // Just define some parameters, geometry not needed for extraction
              box = startSketchOn(XY)
                |> startProfile(at = [0, 0])
                |> line(end = [10, 0])
                |> line(end = [0, 10])
                |> line(end = [-10, 0])
                |> close(%)
                |> extrude(length = 5)
            `,
          },
          'text.kcl',
        );

        expect(defaultParameters).toMatchObject({
          label: 'Hello World',
          mode: 'normal',
        });
      });

      it('should extract boolean parameters', async () => {
        const { defaultParameters } = await getParameters(
          {
            'options.kcl': `
              addHoles = true
              roundCorners = false

              box = startSketchOn(XY)
                |> startProfile(at = [0, 0])
                |> line(end = [10, 0])
                |> line(end = [0, 10])
                |> line(end = [-10, 0])
                |> close(%)
                |> extrude(length = 5)
            `,
          },
          'options.kcl',
        );

        expect(defaultParameters).toMatchObject({
          addHoles: true,
          roundCorners: false,
        });
      });

      it('should handle empty file', async () => {
        const { defaultParameters, jsonSchema } = await getParameters(
          {
            'empty.kcl': '',
          },
          'empty.kcl',
        );

        expect(defaultParameters).toEqual({});
        expect(jsonSchema).toMatchObject({
          type: 'object',
        });
      });

      it('should handle file with only comments', async () => {
        const { defaultParameters } = await getParameters(
          {
            'comments.kcl': `
              // This is a comment
              // Another comment
            `,
          },
          'comments.kcl',
        );

        expect(defaultParameters).toEqual({});
      });
    });

    // ===========================================================================
    // Tests: Parameter Extraction - Multi-file Projects
    // ===========================================================================

    describe('Multi-file projects', () => {
      it('should extract parameters from main file with simple import', async () => {
        // Based on pattern from zoo-modeling-app/rust/kcl-lib/tests/pattern_linear_in_module
        const { defaultParameters } = await getParameters(
          {
            'main.kcl': `
              import thing from "thing.kcl"

              width = 20
              height = 15

              thing()
            `,
            'thing.kcl': `
              export fn thing() {
                return startSketchOn(XZ)
                  |> circle(center = [0, 0], radius = 1)
                  |> extrude(length = 1)
              }

              thing()
            `,
          },
          'main.kcl',
        );

        // Parameters should come from main.kcl, not imported modules
        expect(defaultParameters).toMatchObject({
          width: 20,
          height: 15,
        });
      });

      it('should extract parameters with module import alias', async () => {
        // Based on pattern from zoo-modeling-app/rust/kcl-lib/tests/nested_main_kcl
        const { defaultParameters } = await getParameters(
          {
            'main.kcl': `
              import "component.kcl" as comp

              mainParam = 100

              comp
            `,
            'component.kcl': `
              // A simple component
              startSketchOn(XY)
                |> circle(center = [0, 0], radius = 5)
                |> extrude(length = 10)
            `,
          },
          'main.kcl',
        );

        // Only parameters from main.kcl should be extracted
        expect(defaultParameters).toMatchObject({
          mainParam: 100,
        });
      });

      it('should extract parameters with whole file import', async () => {
        // Based on pattern from zoo-modeling-app/rust/kcl-lib/tests/import_whole_transitive_import
        const { defaultParameters } = await getParameters(
          {
            'main.kcl': `
              import "part.kcl"

              assemblyWidth = 50

              part
            `,
            'part.kcl': `
              // Part component
              startSketchOn(XY)
                |> circle(center = [0, 0], radius = 10)
                |> extrude(length = 5)
            `,
          },
          'main.kcl',
        );

        expect(defaultParameters).toMatchObject({
          assemblyWidth: 50,
        });
      });

      it('should include exported variables from imported parameter files via glob import', async () => {
        // Based on pattern from zoo-modeling-app/public/kcl-samples/car-wheel-assembly
        // Main file uses `import * from "parameters.kcl"` to import all exported variables
        const { defaultParameters } = await getParameters(
          {
            'main.kcl': `
              // Car Wheel Assembly
              @settings(defaultLengthUnit = in, kclVersion = 1.0)

              // Import all parameters from the shared parameters file
              import * from "parameters.kcl"

              // Import component modules
              import "wheel.kcl" as wheel
              import "tire.kcl" as tire

              // Assembly-specific parameter
              assemblyOffset = 10

              // Use the imported components
              wheel
              tire
            `,
            'parameters.kcl': `
              // Shared parameters file with exported variables
              @settings(defaultLengthUnit = in, kclVersion = 1.0)

              // Wheel parameters
              export wheelDiameter = 19
              export wheelWidth = 9.5
              export spokeCount = 6

              // Tire parameters
              export tireInnerDiameter = 19
              export tireOuterDiameter = 24
              export tireDepth = 11.02
            `,
            'wheel.kcl': `
              // Wheel component that uses imported parameters
              @settings(defaultLengthUnit = in, kclVersion = 1.0)

              import wheelDiameter, wheelWidth, spokeCount from "parameters.kcl"

              // Simple wheel representation
              startSketchOn(XY)
                |> circle(center = [0, 0], radius = wheelDiameter / 2)
                |> extrude(length = wheelWidth)
            `,
            'tire.kcl': `
              // Tire component that uses imported parameters
              @settings(defaultLengthUnit = in, kclVersion = 1.0)

              import tireInnerDiameter, tireOuterDiameter, tireDepth from "parameters.kcl"

              // Simple tire representation
              startSketchOn(XY)
                |> circle(center = [0, 0], radius = tireOuterDiameter / 2)
                |> subtract2d(tool = circle(center = [0, 0], radius = tireInnerDiameter / 2))
                |> extrude(length = tireDepth)
            `,
          },
          'main.kcl',
        );

        // Should include parameters from main.kcl
        expect(defaultParameters['assemblyOffset']).toBe(10);

        // Should include all exported parameters from parameters.kcl via `import * from`
        expect(defaultParameters['wheelDiameter']).toBe(19);
        expect(defaultParameters['wheelWidth']).toBe(9.5);
        expect(defaultParameters['spokeCount']).toBe(6);
        expect(defaultParameters['tireInnerDiameter']).toBe(19);
        expect(defaultParameters['tireOuterDiameter']).toBe(24);
        expect(defaultParameters['tireDepth']).toBe(11.02);
      });

      it('should include exported variables from imported parameter files via named imports', async () => {
        // Tests named import syntax: `import foo, bar from "file.kcl"`
        const { defaultParameters } = await getParameters(
          {
            'main.kcl': `
              // Main file with named imports
              @settings(defaultLengthUnit = mm, kclVersion = 1.0)

              // Import specific parameters by name
              import width, height, depth from "dimensions.kcl"

              // Local parameter
              scale = 2

              // Use the dimensions
              box = startSketchOn(XY)
                |> startProfile(at = [0, 0])
                |> line(end = [width * scale, 0])
                |> line(end = [0, height * scale])
                |> line(end = [-width * scale, 0])
                |> close(%)
                |> extrude(length = depth * scale)
            `,
            'dimensions.kcl': `
              // Shared dimensions
              @settings(defaultLengthUnit = mm, kclVersion = 1.0)

              export width = 100
              export height = 50
              export depth = 25
              export unusedParam = 999
            `,
          },
          'main.kcl',
        );

        // Should include local parameter
        expect(defaultParameters['scale']).toBe(2);

        // Should include imported parameters
        expect(defaultParameters['width']).toBe(100);
        expect(defaultParameters['height']).toBe(50);
        expect(defaultParameters['depth']).toBe(25);

        // Should NOT include parameters that weren't imported
        expect(defaultParameters['unusedParam']).toBeUndefined();
      });
    });

    // ===========================================================================
    // Tests: Subdirectory File Resolution
    // ===========================================================================

    describe('Subdirectory file resolution', () => {
      it('should extract parameters from a file in a subdirectory', async () => {
        const { defaultParameters } = await getParameters(
          {
            'samples/ball-bearing/main.kcl': `
              outsideDiameter = 1.625
              shaftDia = 0.75
              thickness = 0.313
            `,
          },
          'samples/ball-bearing/main.kcl',
        );

        expect(defaultParameters).toMatchObject({
          outsideDiameter: 1.625,
          shaftDia: 0.75,
          thickness: 0.313,
        });
      });

      it('should resolve imports relative to the subdirectory file', async () => {
        const { defaultParameters } = await getParameters(
          {
            'samples/bearing/main.kcl': `
              import diameter from "params.kcl"

              thickness = 5
            `,
            'samples/bearing/params.kcl': `
              export diameter = 42
            `,
          },
          'samples/bearing/main.kcl',
        );

        expect(defaultParameters).toMatchObject({
          diameter: 42,
          thickness: 5,
        });
      });
    });

    // ===========================================================================
    // Tests: Error Handling
    // ===========================================================================

    describe('Error handling', () => {
      it('should return error for undefined variable references', async () => {
        const result = await getParametersWithError(
          {
            'undefined_var.kcl': `
              width = undefinedVariable
              box = startSketchOn(XY)
                |> startProfile(at = [0, 0])
                |> line(end = [width, 0])
                |> close(%)
            `,
          },
          'undefined_var.kcl',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toBeDefined();
      });

      it('should return error with correct location for single-file undefined variable', async () => {
        const result = await getParametersWithError(
          {
            'main.kcl': `@settings(defaultLengthUnit = mm, kclVersion = 1.0)

export cube = garbage`,
          },
          'main.kcl',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            code: 'RUNTIME',
            message: '`garbage` is not defined',
            severity: 'error',
            type: 'unknown',
            stack: '    at <anonymous> (main.kcl:3:14)',
            location: {
              fileName: 'main.kcl',
              startLineNumber: 3,
              startColumn: 14,
            },
            stackFrames: [
              {
                fileName: 'main.kcl',
                lineNumber: 3,
                columnNumber: 14,
                context: 'user',
                functionName: undefined,
              },
            ],
          },
        ]);
      });

      it('should return error with imported file name in message for multi-file project', async () => {
        // NOTE: The KCL WASM only provides sourceRanges/backtrace for the import
        // site in main.kcl (moduleId 0), not for the actual error in bad.kcl.
        // The imported filename and sub-error are embedded in the message string.
        const result = await getParametersWithError(
          {
            'main.kcl': `@settings(defaultLengthUnit = mm, kclVersion = 1.0)

import cube from "bad.kcl"`,
            'bad.kcl': `@settings(defaultLengthUnit = mm, kclVersion = 1.0)

export cube = garbage`,
          },
          'main.kcl',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            code: 'BUNDLER_FAILED',
            message: 'Error loading imported file (bad.kcl). Open it to view more details.\n  `garbage` is not defined',
            severity: 'error',
            type: 'compilation',
            stack: '    at <anonymous> (main.kcl:3:0)',
            // Location points to the import site in main.kcl (WASM limitation)
            location: {
              fileName: 'main.kcl',
              startLineNumber: 3,
              startColumn: 0,
            },
            stackFrames: [
              {
                fileName: 'main.kcl',
                lineNumber: 3,
                columnNumber: 0,
                context: 'user',
                functionName: undefined,
              },
            ],
          },
        ]);
      });

      it('should return error with correct stack trace for function call error', async () => {
        // Error is inside a custom function `makeBadShape` called from the top level.
        // The WASM provides a backtrace through function calls within a single file.
        const result = await getParametersWithError(
          {
            'main.kcl': `@settings(defaultLengthUnit = mm, kclVersion = 1.0)

fn makeBadShape() {
  return garbage
}

result = makeBadShape()`,
          },
          'main.kcl',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            code: 'RUNTIME',
            message: '`garbage` is not defined',
            severity: 'error',
            type: 'unknown',
            stack: '    at makeBadShape (main.kcl:4:9)\n    at <anonymous> (main.kcl:7:9)',
            location: {
              fileName: 'main.kcl',
              startLineNumber: 4,
              startColumn: 9,
            },
            // Stack frames show the call chain:
            // Frame 0: makeBadShape at line 4 (error site)
            // Frame 1: <anonymous> at line 7 (call site)
            stackFrames: [
              {
                functionName: 'makeBadShape',
                fileName: 'main.kcl',
                lineNumber: 4,
                columnNumber: 9,
                context: 'user',
              },
              {
                fileName: 'main.kcl',
                lineNumber: 7,
                columnNumber: 9,
                context: 'user',
                functionName: undefined,
              },
            ],
          },
        ]);
      });

      it('should return error with nested import chain in message for 3-file project', async () => {
        // 3-file chain: main.kcl -> middle.kcl -> bad.kcl
        // Error is in bad.kcl, imported transitively through middle.kcl.
        //
        // NOTE: Same WASM limitation as 2-file imports -- the backtrace only
        // contains a single frame at the import site in main.kcl. The import
        // chain is encoded in the nested error message instead.
        const result = await getParametersWithError(
          {
            'main.kcl': `@settings(defaultLengthUnit = mm, kclVersion = 1.0)

import shape from "middle.kcl"`,
            'middle.kcl': `@settings(defaultLengthUnit = mm, kclVersion = 1.0)

import badThing from "bad.kcl"

export shape = badThing`,
            'bad.kcl': `@settings(defaultLengthUnit = mm, kclVersion = 1.0)

export badThing = garbage`,
          },
          'main.kcl',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            code: 'BUNDLER_FAILED',
            message:
              'Error loading imported file (middle.kcl). Open it to view more details.\n  Error loading imported file (bad.kcl). Open it to view more details.\n  `garbage` is not defined',
            severity: 'error',
            type: 'compilation',
            stack: '    at <anonymous> (main.kcl:3:0)',
            // Location points to the import site in main.kcl (WASM limitation)
            location: {
              fileName: 'main.kcl',
              startLineNumber: 3,
              startColumn: 0,
            },
            // Only one stack frame at the import site (no cross-file frames)
            stackFrames: [
              {
                fileName: 'main.kcl',
                lineNumber: 3,
                columnNumber: 0,
                context: 'user',
                functionName: undefined,
              },
            ],
          },
        ]);
      });

      it('should return error for syntax error with missing closing parenthesis', async () => {
        // This tests a syntax error: missing closing parenthesis on close(
        const result = await getParametersWithError(
          {
            'syntax_error.kcl': `@settings(defaultLengthUnit = mm, kclVersion = 1.0)

// Parametric Cone
// A cone created by revolving a triangular profile

// Parameters
coneHeight = 80       // mm - height of the cone
baseDiameter = 50     // mm - diameter of the base

// Create triangular profile and revolve to form cone
cone = startSketchOn(XZ)
  |> startProfile(at = [0, 0])
  |> xLine(length = baseDiameter / 2)
  |> line(endAbsolute = [0, coneHeight])
  |> line(endAbsolute = profileStart(%))
  |> close(
  |> revolve(axis = X)
`,
          },
          'syntax_error.kcl',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            code: 'BUNDLER_FAILED',
            message: 'There was an unexpected `|>`. Try removing it.',
            severity: 'error',
            type: 'compilation',
            location: {
              fileName: 'syntax_error.kcl',
              startLineNumber: 17,
              startColumn: 2,
            },
          },
        ]);
      });
    });
  });

  describe('exportGeometry', () => {
    it('should use live engine-session native handles instead of durable snapshots', async () => {
      expect(zooDefinition.serializeNativeHandle).toBeUndefined();
      expect(zooDefinition.deserializeNativeHandle).toBeUndefined();
      expect(zooDefinition.isNativeHandleValid).toBeDefined();

      const context: Parameters<typeof zooDefinition.createGeometry>[2] = {
        baseUrl: 'ws://fake.example/modeling-commands',
        fileSystemManager: undefined,
        kclUtils: undefined,
      };
      const result = await zooDefinition.createGeometry(
        {
          filePath: '/projects/test/main.kcl',
          basePath: '/projects/test',
          parameters: {},
          options: {},
        },
        createMockKernelRuntime({ filesystemOverrides: { readFileResult: '' } }),
        context,
      );

      expect(result.nativeHandle).toEqual({ kind: 'zoo-live-engine-session', hasGeometry: false });
      expect(result.geometry.format).toBe('gltf');
      if (result.geometry.format === 'gltf') {
        const document = await new NodeIO().readBinary(result.geometry.content);
        expect(document.getRoot().listMeshes()).toHaveLength(0);
      }
    });

    it('should invalidate geometry handles when the KCL engine no longer has an executed program', async () => {
      const { isNativeHandleValid } = zooDefinition;
      expect(isNativeHandleValid).toBeDefined();
      if (!isNativeHandleValid) {
        throw new Error('Zoo kernel must declare live-handle validity');
      }

      type ZooValidityContext = Parameters<typeof isNativeHandleValid>[2];
      const runtime = createMockKernelRuntime();
      const liveHandle = { kind: 'zoo-live-engine-session', hasGeometry: true } as const;
      const emptyHandle = { kind: 'zoo-live-engine-session', hasGeometry: false } as const;

      await expect(
        Promise.resolve(
          isNativeHandleValid({ nativeHandle: liveHandle }, runtime, {
            baseUrl: 'ws://fake.example/modeling-commands',
            fileSystemManager: undefined,
            kclUtils: { canExportFromMemory: false },
          } as ZooValidityContext),
        ),
      ).resolves.toBe(false);

      await expect(
        Promise.resolve(
          isNativeHandleValid({ nativeHandle: liveHandle }, runtime, {
            baseUrl: 'ws://fake.example/modeling-commands',
            fileSystemManager: undefined,
            kclUtils: { canExportFromMemory: true },
          } as ZooValidityContext),
        ),
      ).resolves.toBe(true);

      await expect(
        Promise.resolve(
          isNativeHandleValid({ nativeHandle: emptyHandle }, runtime, {
            baseUrl: 'ws://fake.example/modeling-commands',
            fileSystemManager: undefined,
            kclUtils: undefined,
          } as ZooValidityContext),
        ),
      ).resolves.toBe(true);
    });

    it('should export empty GLB and glTF files for empty handles but reject STEP and STL', async () => {
      const context: Parameters<typeof zooDefinition.exportGeometry>[2] = {
        baseUrl: 'ws://fake.example/modeling-commands',
        fileSystemManager: undefined,
        kclUtils: undefined,
      };
      const runtime = createMockKernelRuntime();
      const nativeHandle = { kind: 'zoo-live-engine-session', hasGeometry: false } as const;

      const glbResult = await zooDefinition.exportGeometry(
        {
          format: 'glb',
          nativeHandle,
          options: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
        },
        runtime,
        context,
      );
      expect(glbResult.success).toBe(true);
      if (glbResult.success) {
        const document = await new NodeIO().readBinary(glbResult.data[0]!.bytes);
        expect(document.getRoot().listMeshes()).toHaveLength(0);
      }

      const gltfResult = await zooDefinition.exportGeometry(
        {
          format: 'gltf',
          nativeHandle,
          options: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
        },
        runtime,
        context,
      );
      expect(gltfResult.success).toBe(true);
      if (gltfResult.success) {
        const json = JSON.parse(new TextDecoder().decode(gltfResult.data[0]!.bytes)) as { meshes: unknown[] };
        expect(json.meshes).toEqual([]);
      }

      const stepResult = await zooDefinition.exportGeometry(
        { format: 'step', nativeHandle, options: { coordinateSystem: 'y-up' } },
        runtime,
        context,
      );
      expect(stepResult.success).toBe(false);

      const stlResult = await zooDefinition.exportGeometry(
        {
          format: 'stl',
          nativeHandle,
          options: { binary: true, coordinateSystem: 'y-up', unit: { length: 'meter' } },
        },
        runtime,
        context,
      );
      expect(stlResult.success).toBe(false);
    });

    it('should normalize generated GLB names from the KCL engine', async () => {
      const engineMaterialName = ['Material', 'Default'].join('_');
      const exportFromMemory = vi
        .fn()
        .mockResolvedValue([
          { contents: await createNamedGlb('Mesh', { materialName: engineMaterialName, sceneName: 'Scene' }) },
        ]);
      const context: Parameters<typeof zooDefinition.exportGeometry>[2] = {
        baseUrl: 'ws://fake.example/modeling-commands',
        fileSystemManager: undefined,
        kclUtils: {
          initializeEngine: vi.fn().mockResolvedValue(undefined),
          exportFromMemory,
        } as unknown as KclUtilities,
      };

      const result = await zooDefinition.exportGeometry(
        {
          format: 'glb',
          nativeHandle: { kind: 'zoo-live-engine-session', hasGeometry: true },
          options: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
        },
        createMockKernelRuntime(),
        context,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(await readGlbNodeNames(result.data[0]!.bytes)).toEqual(['Shape 1']);
        expect(await readGlbMaterialAndSceneNames(result.data[0]!.bytes)).toEqual({
          materialNames: [''],
          sceneNames: [''],
        });
      }
    });

    it('should normalize generated embedded glTF names from the KCL engine', async () => {
      const engineMaterialName = ['Material', 'Default'].join('_');
      const exportFromMemory = vi
        .fn()
        .mockResolvedValue([
          { contents: createNamedGltf('Geometry', { materialName: engineMaterialName, sceneName: 'Scene' }) },
        ]);
      const context: Parameters<typeof zooDefinition.exportGeometry>[2] = {
        baseUrl: 'ws://fake.example/modeling-commands',
        fileSystemManager: undefined,
        kclUtils: {
          initializeEngine: vi.fn().mockResolvedValue(undefined),
          exportFromMemory,
        } as unknown as KclUtilities,
      };

      const result = await zooDefinition.exportGeometry(
        {
          format: 'gltf',
          nativeHandle: { kind: 'zoo-live-engine-session', hasGeometry: true },
          options: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
        },
        createMockKernelRuntime(),
        context,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(await readGltfNodeNames(result.data[0]!.bytes)).toEqual(['Shape 1']);
        expect(await readGltfMaterialAndSceneNames(result.data[0]!.bytes)).toEqual({
          materialNames: [''],
          sceneNames: [''],
        });
      }
    });
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End of file */
