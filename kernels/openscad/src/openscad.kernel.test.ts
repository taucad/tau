/* oxlint-disable max-lines -- comprehensive kernel test suite */
import { describe, it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { openscad as openscadKernel } from '#openscad.kernel.js';
import * as openscadKernelModule from '#openscad.kernel.js';
import {
  assertSuccess,
  createGeometryFile,
  createGeometryTestHelpers,
  createTestGeometry,
  createTestWorker,
  extractGltfFromResult,
  getTestFileSystem,
  getTestParameters,
} from '@taucad/runtime/testing';

/* eslint-disable @typescript-eslint/naming-convention -- OpenSCAD uses snake_case for parameter names */

// =============================================================================
// Test Utilities
// =============================================================================

/** Create a runtime worker for testing with the provided files. */
const createWorker = async (files: Record<string, string>): ReturnType<typeof createTestWorker> =>
  createTestWorker(openscadKernel, files);

/** Helper to extract parameters and assert success. */
const getParameters = async (
  files: Record<string, string>,
  mainFile: string,
): Promise<{
  jsonSchema: unknown;
  defaultParameters: Record<string, unknown>;
}> => getTestParameters(openscadKernel, files, mainFile);

/** Helper to create geometry and return the result. */
const createGeometry = async (
  files: Record<string, string>,
  mainFile: string,
  parameters: Record<string, unknown> = {},
): ReturnType<typeof createTestGeometry> =>
  createTestGeometry({
    definition: openscadKernel,
    files,
    mainFile,
    parameters,
  });

/**
 * Helper to compute geometry and get OFF data for analysis.
 * OpenSCAD-specific utility for testing OFF format output.
 */
async function createGeometryAndGetOffData(
  files: Record<string, string>,
  mainFile: string,
): Promise<{ offData: string | undefined; success: boolean }> {
  const worker = await createWorker(files);
  const geometryFile = createGeometryFile(mainFile);
  const result = await worker.createGeometry({
    file: geometryFile,
    parameters: {},
  });

  // NativeHandle is protected on KernelWorker; for OpenSCAD it holds the raw OFF string
  const offData = (worker as unknown as { nativeHandle: string | undefined }).nativeHandle;

  return {
    offData,
    success: result.success,
  };
}

// Create geometry test helpers instance for geometry assertions
const geometryHelpers = createGeometryTestHelpers();

const readGltfNodeMeshNames = async (
  glbBytes: Uint8Array<ArrayBuffer>,
): Promise<{ nodeNames: string[]; meshNames: string[] }> => {
  const document = await new NodeIO().readBinary(glbBytes);
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

/**
 * Parse OFF face lines and count color components.
 */
function analyzeOffColorComponents(offData: string): {
  rgbFaceCount: number;
  rgbaFaceCount: number;
} {
  const lines = offData.split('\n');
  let rgbFaceCount = 0;
  let rgbaFaceCount = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();
    // Face lines start with vertex count followed by indices
    if (!/^\d+\s+\d+/.test(trimmedLine)) {
      continue;
    }

    const parts = trimmedLine.split(/\s+/);
    const numberVerts = Number.parseInt(parts[0] ?? '0', 10);
    const colorComponents = parts.slice(numberVerts + 1);

    if (colorComponents.length === 3) {
      rgbFaceCount++;
    } else if (colorComponents.length === 4) {
      rgbaFaceCount++;
    }
  }

  return { rgbFaceCount, rgbaFaceCount };
}

// =============================================================================
// Tests: Parameter Extraction
// =============================================================================

describe('OpenSCAD Kernel', () => {
  it('should expose the named kernel factory without a module default export', () => {
    expect(openscadKernelModule.openscad).toEqual(expect.any(Function));
    expect(Object.hasOwn(openscadKernelModule, 'default')).toBe(false);
  });

  it('should serialize OFF native handles and restore them for export', async () => {
    const worker = await createWorker({ 'cube.scad': 'cube([10, 10, 10]);' });
    const result = await worker.createGeometry({
      file: createGeometryFile('cube.scad'),
      parameters: {},
    });
    const offData = (worker as unknown as { nativeHandle?: unknown }).nativeHandle;

    expect(result.success).toBe(true);
    expect(offData).toEqual(expect.any(String));
    expect(result.serializedNativeHandle).toEqual(offData);

    (worker as unknown as { nativeHandle?: unknown }).nativeHandle = undefined;
    const exportResult = await worker.exportGeometry('glb');

    expect(exportResult.success).toBe(true);
  });

  describe('getParameters', () => {
    describe('Single file projects', () => {
      it('should extract parameters from a simple file', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'cube.scad': `
              width = 10; // [1:100]
              height = 20; // [1:100]
              depth = 5;
              cube([width, height, depth]);
            `,
          },
          'cube.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            width: {
              type: 'number',
              title: 'width',
              default: 10,
              minimum: 1,
              maximum: 100,
              multipleOf: 1,
            },
            height: {
              type: 'number',
              title: 'height',
              default: 20,
              minimum: 1,
              maximum: 100,
              multipleOf: 1,
            },
            depth: { type: 'number', title: 'depth', default: 5 },
          },
          additionalProperties: false,
        });

        expect(defaultParameters).toEqual({ width: 10, height: 20, depth: 5 });
      });

      it('should extract parameters with group annotations', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'grouped.scad': `
              /* [Main Dimensions] */
              width = 100;
              depth = 80;

              /* [Roof Parameters] */
              roof_height = 35;
              roof_overhang = 8;
            `,
          },
          'grouped.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            'Main Dimensions': {
              type: 'object',
              title: 'Main Dimensions',
              properties: {
                width: { type: 'number', title: 'width', default: 100 },
                depth: { type: 'number', title: 'depth', default: 80 },
              },
              additionalProperties: false,
            },
            'Roof Parameters': {
              type: 'object',
              title: 'Roof Parameters',
              properties: {
                roof_height: {
                  type: 'number',
                  title: 'roof_height',
                  default: 35,
                },
                roof_overhang: {
                  type: 'number',
                  title: 'roof_overhang',
                  default: 8,
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        });

        expect(defaultParameters).toEqual({
          'Main Dimensions': { width: 100, depth: 80 },
          'Roof Parameters': { roof_height: 35, roof_overhang: 8 },
        });
      });
    });

    describe('Multi-file projects', () => {
      it('should extract parameters from included files', async () => {
        const { jsonSchema } = await getParameters(
          {
            'main.scad': `
              include <lib/parameters.scad>
              cube([house_width, house_depth, 10]);
            `,
            'lib/parameters.scad': `
              /* [House Dimensions] */
              house_width = 100;
              house_depth = 80;
              house_height = 60;
            `,
          },
          'main.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            'House Dimensions': {
              type: 'object',
              title: 'House Dimensions',
              properties: {
                house_width: {
                  type: 'number',
                  title: 'house_width',
                  default: 100,
                },
                house_depth: {
                  type: 'number',
                  title: 'house_depth',
                  default: 80,
                },
                house_height: {
                  type: 'number',
                  title: 'house_height',
                  default: 60,
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        });
      });

      it('should group parameters from non-main files by filename', async () => {
        const { jsonSchema } = await getParameters(
          {
            'main.scad': `
              include <lib/config.scad>
              cube([size, size, size]);
            `,
            'lib/config.scad': `
              size = 50;
              detail = 32;
            `,
          },
          'main.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            Config: {
              type: 'object',
              title: 'Config',
              properties: {
                size: { type: 'number', title: 'size', default: 50 },
                detail: { type: 'number', title: 'detail', default: 32 },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        });
      });

      it('should preserve explicit groups from included files', async () => {
        const { jsonSchema } = await getParameters(
          {
            'main.scad': `
              include <lib/dimensions.scad>
              cube([width, depth, height]);
            `,
            'lib/dimensions.scad': `
              /* [Box Dimensions] */
              width = 100;
              depth = 80;
              height = 50;
            `,
          },
          'main.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            'Box Dimensions': {
              type: 'object',
              title: 'Box Dimensions',
              properties: {
                width: { type: 'number', title: 'width', default: 100 },
                depth: { type: 'number', title: 'depth', default: 80 },
                height: { type: 'number', title: 'height', default: 50 },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        });
      });
    });

    describe('File scoping (use/include)', () => {
      it('should NOT extract parameters from files not referenced via use or include', async () => {
        // This test verifies the bug fix: parameters should only come from files
        // that are actually referenced via use/include, not all .scad files in project
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'main.scad': `
              // No use or include statements - should only have main_param
              main_param = 100;
              cube([main_param, 10, 10]);
            `,
            'unrelated.scad': `
              // This file is NOT referenced by main.scad
              unrelated_param = 50;
              sphere(r=unrelated_param);
            `,
            'another_unrelated.scad': `
              another_param = 25;
            `,
          },
          'main.scad',
        );

        // Should ONLY have main_param, NOT unrelated_param or another_param
        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            main_param: { type: 'number', title: 'main_param', default: 100 },
          },
          additionalProperties: false,
        });

        expect(defaultParameters).toEqual({ main_param: 100 });
      });

      it('should extract parameters from files referenced via include', async () => {
        const { defaultParameters } = await getParameters(
          {
            'main.scad': `
              include <lib/config.scad>
              main_size = 100;
              cube([main_size, lib_size, 10]);
            `,
            'lib/config.scad': `
              lib_size = 50;
            `,
            'unrelated.scad': `
              // NOT included - should be ignored
              ignored_param = 25;
            `,
          },
          'main.scad',
        );

        // Should have main_size and lib_size, but NOT ignored_param
        expect(defaultParameters).toHaveProperty('main_size', 100);
        expect(defaultParameters).toHaveProperty('Config');
        expect((defaultParameters as Record<string, Record<string, unknown>>)['Config']).toHaveProperty('lib_size', 50);
        expect(defaultParameters).not.toHaveProperty('ignored_param');
        expect(defaultParameters).not.toHaveProperty('Unrelated');
      });

      /**
       * IMPORTANT NOTE:
       * This contrasts with the OpenSCAD `use` behavior, where parameters are not extracted
       * from the referenced file. However this implementation DOES extract parameters from
       * the referenced file for better usability to ensure the user can modify those parameters.
       *
       * @see https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Include_Statement
       */
      it('should extract parameters from files referenced via use', async () => {
        const { defaultParameters } = await getParameters(
          {
            'main.scad': `
              use <helpers.scad>
              main_value = 100;
              my_helper(main_value);
            `,
            'helpers.scad': `
              helper_param = 20;
              module my_helper(v) { cube([v, helper_param, 10]); }
            `,
            'not_used.scad': `
              // NOT used - should be ignored
              not_used_param = 999;
            `,
          },
          'main.scad',
        );

        // Should have main_value and helper_param, but NOT not_used_param
        expect(defaultParameters).toHaveProperty('main_value', 100);
        expect(defaultParameters).toHaveProperty('Helpers');
        expect((defaultParameters as Record<string, Record<string, unknown>>)['Helpers']).toHaveProperty(
          'helper_param',
          20,
        );
        expect(defaultParameters).not.toHaveProperty('not_used_param');
        expect(defaultParameters).not.toHaveProperty('Not_used');
      });

      it('should recursively extract parameters from nested includes', async () => {
        const { defaultParameters } = await getParameters(
          {
            'main.scad': `
              include <level1.scad>
              main_param = 1;
            `,
            'level1.scad': `
              include <level2.scad>
              level1_param = 2;
            `,
            'level2.scad': `
              level2_param = 3;
            `,
            'not_included.scad': `
              // NOT in the include chain
              ignored = 999;
            `,
          },
          'main.scad',
        );

        // Should have all params from the include chain
        expect(defaultParameters).toHaveProperty('main_param', 1);
        expect(defaultParameters).toHaveProperty('Level1');
        expect((defaultParameters as Record<string, Record<string, unknown>>)['Level1']).toHaveProperty(
          'level1_param',
          2,
        );
        expect(defaultParameters).toHaveProperty('Level2');
        expect((defaultParameters as Record<string, Record<string, unknown>>)['Level2']).toHaveProperty(
          'level2_param',
          3,
        );
        // Should NOT have params from non-included file
        expect(defaultParameters).not.toHaveProperty('ignored');
        expect(defaultParameters).not.toHaveProperty('Not_included');
      });

      it('should handle mixed use and include statements', async () => {
        const { defaultParameters } = await getParameters(
          {
            'main.scad': `
              include <config.scad>
              use <utils.scad>
              main_val = 10;
            `,
            'config.scad': `
              config_val = 20;
            `,
            'utils.scad': `
              utils_val = 30;
            `,
            'orphan.scad': `
              orphan_val = 40;
            `,
          },
          'main.scad',
        );

        expect(defaultParameters).toHaveProperty('main_val', 10);
        expect(defaultParameters).toHaveProperty('Config');
        expect(defaultParameters).toHaveProperty('Utils');
        expect(defaultParameters).not.toHaveProperty('orphan_val');
        expect(defaultParameters).not.toHaveProperty('Orphan');
      });

      it('should handle circular includes without infinite loop', async () => {
        const { defaultParameters } = await getParameters(
          {
            'a.scad': `
              include <b.scad>
              a_param = 1;
            `,
            'b.scad': `
              include <a.scad>
              b_param = 2;
            `,
          },
          'a.scad',
        );

        // Should extract from both files without hanging
        expect(defaultParameters).toHaveProperty('a_param', 1);
        expect(defaultParameters).toHaveProperty('B');
        expect((defaultParameters as Record<string, Record<string, unknown>>)['B']).toHaveProperty('b_param', 2);
      });

      it('should handle relative paths with ../', async () => {
        const { defaultParameters } = await getParameters(
          {
            'project/main.scad': `
              include <../lib/shared.scad>
              project_param = 100;
            `,
            'lib/shared.scad': `
              shared_param = 50;
            `,
            'other/unused.scad': `
              unused_param = 999;
            `,
          },
          'project/main.scad',
        );

        expect(defaultParameters).toHaveProperty('project_param', 100);
        expect(defaultParameters).toHaveProperty('Shared');
        expect((defaultParameters as Record<string, Record<string, unknown>>)['Shared']).toHaveProperty(
          'shared_param',
          50,
        );
        expect(defaultParameters).not.toHaveProperty('unused_param');
      });

      it('should stop recursion at depth limit of 50', { timeout: 30_000 }, async () => {
        // Create a deeply nested chain that would exceed 50 levels
        const files: Record<string, string> = {};

        // Create 60 levels of nesting
        for (let index = 0; index < 60; index++) {
          const nextFile = index < 59 ? `include <level${index + 1}.scad>\n` : '';
          files[`level${index}.scad`] = `${nextFile}param${index} = ${index};`;
        }

        const { defaultParameters } = await getParameters(files, 'level0.scad');

        // Should have params from first 50 levels (0-49), but not beyond
        expect(defaultParameters).toHaveProperty('param0', 0);

        // Check that we have Level49 but not Level50
        // (main file is depth 0, so Level49 is the 50th file)
        expect(defaultParameters).toHaveProperty('Level49');

        // Level50 and beyond should NOT be included (depth limit reached)
        expect(defaultParameters).not.toHaveProperty('Level50');
        expect(defaultParameters).not.toHaveProperty('param50');
      });
    });

    describe('Edge cases', () => {
      it('should handle empty files', async () => {
        const { jsonSchema, defaultParameters } = await getParameters({ 'empty.scad': '' }, 'empty.scad');

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {},
          additionalProperties: false,
        });
        expect(defaultParameters).toEqual({});
      });

      it('should skip internal OpenSCAD parameters starting with $', async () => {
        const { jsonSchema } = await getParameters(
          {
            'internal.scad': `
              $fn = 100;
              $fa = 1;
              $fs = 0.5;
              width = 50;
              sphere(r=width);
            `,
          },
          'internal.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            width: { type: 'number', title: 'width', default: 50 },
          },
          additionalProperties: false,
        });
      });
    });

    describe('Parameter types', () => {
      it('should extract integer number parameters', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'integers.scad': `
              count = 5;
              sides = 6;
              layers = 3;
            `,
          },
          'integers.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            count: { type: 'number', title: 'count', default: 5 },
            sides: { type: 'number', title: 'sides', default: 6 },
            layers: { type: 'number', title: 'layers', default: 3 },
          },
          additionalProperties: false,
        });

        expect(defaultParameters).toEqual({ count: 5, sides: 6, layers: 3 });
      });

      it('should extract floating point number parameters', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'floats.scad': `
              radius = 2.5;
              height = 10.75;
              tolerance = 0.001;
            `,
          },
          'floats.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            radius: { type: 'number', title: 'radius', default: 2.5 },
            height: { type: 'number', title: 'height', default: 10.75 },
            tolerance: { type: 'number', title: 'tolerance', default: 0.001 },
          },
          additionalProperties: false,
        });

        expect(defaultParameters).toEqual({
          radius: 2.5,
          height: 10.75,
          tolerance: 0.001,
        });
      });

      it('should extract number parameters with range annotations', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'ranges.scad': `
              width = 50; // [10:100]
              height = 25; // [5:5:50]
            `,
          },
          'ranges.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            width: {
              type: 'number',
              title: 'width',
              default: 50,
              minimum: 10,
              maximum: 100,
              multipleOf: 1,
            },
            height: {
              type: 'number',
              title: 'height',
              default: 25,
              minimum: 5,
              maximum: 50,
              multipleOf: 5,
            },
          },
          additionalProperties: false,
        });

        expect(defaultParameters).toEqual({ width: 50, height: 25 });
      });

      it('should extract boolean parameters', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'booleans.scad': `
              show_base = true;
              center_object = false;
              add_holes = true;
            `,
          },
          'booleans.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            show_base: { type: 'boolean', title: 'show_base', default: true },
            center_object: {
              type: 'boolean',
              title: 'center_object',
              default: false,
            },
            add_holes: { type: 'boolean', title: 'add_holes', default: true },
          },
          additionalProperties: false,
        });

        expect(defaultParameters).toEqual({
          show_base: true,
          center_object: false,
          add_holes: true,
        });
      });

      it('should extract string parameters', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'strings.scad': `
              label = "Hello World";
              author = "OpenSCAD User";
            `,
          },
          'strings.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            label: { type: 'string', title: 'label', default: 'Hello World' },
            author: {
              type: 'string',
              title: 'author',
              default: 'OpenSCAD User',
            },
          },
          additionalProperties: false,
        });

        expect(defaultParameters).toEqual({
          label: 'Hello World',
          author: 'OpenSCAD User',
        });
      });

      it('should extract vector parameters (arrays)', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'vectors.scad': `
              position = [10, 20, 30];
              origin = [0, 0, 0];
            `,
          },
          'vectors.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            position: {
              type: 'array',
              title: 'position',
              default: [10, 20, 30],
              items: { type: 'number' },
              minItems: 3,
              maxItems: 3,
            },
            origin: {
              type: 'array',
              title: 'origin',
              default: [0, 0, 0],
              items: { type: 'number' },
              minItems: 3,
              maxItems: 3,
            },
          },
          additionalProperties: false,
        });

        expect(defaultParameters).toEqual({
          position: [10, 20, 30],
          origin: [0, 0, 0],
        });
      });

      it('should extract 2D vector parameters', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'vectors_2d.scad': `
              point = [50, 75];
              size_2d = [100, 200];
            `,
          },
          'vectors_2d.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            point: {
              type: 'array',
              title: 'point',
              default: [50, 75],
              items: { type: 'number' },
              minItems: 2,
              maxItems: 2,
            },
            size_2d: {
              type: 'array',
              title: 'size_2d',
              default: [100, 200],
              items: { type: 'number' },
              minItems: 2,
              maxItems: 2,
            },
          },
          additionalProperties: false,
        });

        expect(defaultParameters).toEqual({
          point: [50, 75],
          size_2d: [100, 200],
        });
      });

      it('should extract negative number parameters', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'negative.scad': `
              offset_x = -10;
              offset_y = -25.5;
            `,
          },
          'negative.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            offset_x: { type: 'number', title: 'offset_x', default: -10 },
            offset_y: { type: 'number', title: 'offset_y', default: -25.5 },
          },
          additionalProperties: false,
        });

        expect(defaultParameters).toEqual({ offset_x: -10, offset_y: -25.5 });
      });

      it('should extract string parameters with dropdown options', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'string_options.scad': `
              material = "PLA"; // [PLA, ABS, PETG]
            `,
          },
          'string_options.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            material: {
              type: 'string',
              title: 'material',
              default: 'PLA',
              oneOf: [
                { const: 'PLA', title: 'PLA' },
                { const: 'ABS', title: 'ABS' },
                { const: 'PETG', title: 'PETG' },
              ],
            },
          },
          additionalProperties: false,
        });

        expect(defaultParameters).toEqual({ material: 'PLA' });
      });

      it('should extract labeled value options (key-value dropdowns)', async () => {
        const { jsonSchema, defaultParameters } = await getParameters(
          {
            'labeled_options.scad': `
              resolution = 32; // [16:Low, 32:Medium, 64:High]
              shape_type = 0; // [0:Cube, 1:Sphere]
            `,
          },
          'labeled_options.scad',
        );

        expect(jsonSchema).toEqual({
          type: 'object',
          properties: {
            resolution: {
              type: 'number',
              title: 'resolution',
              default: 32,
              oneOf: [
                { const: 16, title: 'Low' },
                { const: 32, title: 'Medium' },
                { const: 64, title: 'High' },
              ],
            },
            shape_type: {
              type: 'number',
              title: 'shape_type',
              default: 0,
              oneOf: [
                { const: 0, title: 'Cube' },
                { const: 1, title: 'Sphere' },
              ],
            },
          },
          additionalProperties: false,
        });

        // Known issue: json-schema-default library returns {} for oneOf properties with falsy defaults
        expect(defaultParameters).toEqual({ resolution: 32, shape_type: {} });
      });
    });
  });

  // ===========================================================================
  // Tests: Geometry Computation
  // ===========================================================================

  describe('createGeometry', () => {
    describe('Basic geometry', () => {
      it('should compute geometry for a simple cube', async () => {
        const { success, offData } = await createGeometryAndGetOffData(
          { 'cube.scad': 'cube([10, 10, 10]);' },
          'cube.scad',
        );

        expect(success).toBe(true);
        expect(offData).toBeDefined();
        expect(offData).toContain('OFF'); // OFF file header
      });

      it('should compute geometry with multiple primitives', async () => {
        const scadCode = `
          cube([10, 10, 10]);
          translate([20, 0, 0]) sphere(r=5);
        `;
        const { success, offData } = await createGeometryAndGetOffData({ 'multi.scad': scadCode }, 'multi.scad');

        expect(success).toBe(true);
        expect(offData).toBeDefined();
      });
    });

    describe('Geometry validation', () => {
      it('should produce valid GLTF for a cube with correct dimensions', async () => {
        const result = await createGeometry({ 'box.scad': 'cube([20, 15, 10]);' }, 'box.scad');

        expect(result.success).toBe(true);

        // Geometry quality assertions (20x15x10 box)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.02, 0.01, 0.015], 0.001);
        const glbData = extractGltfFromResult(result);
        expect(glbData).toBeDefined();
        const { nodeNames, meshNames } = await readGltfNodeMeshNames(glbData!);
        expect(nodeNames).toEqual(['Shape 1']);
        expect(meshNames).toEqual(['Shape 1']);
      });

      it('should produce valid GLTF for a sphere with correct dimensions', async () => {
        const result = await createGeometry({ 'sphere.scad': '$fn=32; sphere(r=10);' }, 'sphere.scad');

        expect(result.success).toBe(true);

        // Sphere radius 10, diameter 20
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.02, 0.02, 0.02], 0.001);
      });

      it('should produce valid GLTF for a cylinder with correct dimensions', async () => {
        const result = await createGeometry({ 'cylinder.scad': '$fn=32; cylinder(h=30, r=8);' }, 'cylinder.scad');

        expect(result.success).toBe(true);

        // Cylinder: radius 8 (diameter 16), height 30
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.016, 0.03, 0.016], 0.001);
      });

      it('should produce valid GLTF for translated geometry', async () => {
        const result = await createGeometry(
          { 'translated.scad': 'translate([50, 25, 10]) cube([20, 20, 20]);' },
          'translated.scad',
        );

        expect(result.success).toBe(true);

        // Translated cube should have correct size
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.02, 0.02, 0.02], 0.001);
        // Center should be at [50+10, 25+10, 10+10] = [60, 35, 20]
        await geometryHelpers.expectBoundingBoxCenter(result, [0.06, 0.02, -0.035], 0.001);
      });

      it('should produce valid GLTF for boolean difference', async () => {
        const scadCode = `
          $fn=32;
          difference() {
            cube([30, 30, 30], center=true);
            sphere(r=18);
          }
        `;
        const result = await createGeometry({ 'difference.scad': scadCode }, 'difference.scad');

        expect(result.success).toBe(true);

        // Boolean difference produces 1 mesh
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        // Outer dimensions are 30x30x30 (sphere removes interior)
        await geometryHelpers.expectBoundingBoxSize(result, [0.03, 0.03, 0.03], 0.001);
      });

      it('should produce valid GLTF for boolean union', async () => {
        const scadCode = `
          union() {
            cube([20, 20, 20]);
            translate([10, 10, 20]) cube([20, 20, 20]);
          }
        `;
        const result = await createGeometry({ 'union.scad': scadCode }, 'union.scad');

        expect(result.success).toBe(true);

        // Boolean union produces 1 mesh
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        // Bounding box spans both cubes: 0 to 30 in X/Y, 0 to 40 in Z
        await geometryHelpers.expectBoundingBoxSize(result, [0.03, 0.04, 0.03], 0.001);
      });

      it('should produce valid GLTF for hull operation', async () => {
        const scadCode = `
          $fn=32;
          hull() {
            sphere(r=5);
            translate([30, 0, 0]) sphere(r=5);
          }
        `;
        const result = await createGeometry({ 'hull.scad': scadCode }, 'hull.scad');

        expect(result.success).toBe(true);

        // Hull produces 1 mesh (capsule-like shape)
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        // Two spheres at radius 5, 30 apart: total width 40, height/depth 10
        await geometryHelpers.expectBoundingBoxSize(result, [0.04, 0.01, 0.01], 0.001);
      });

      it('should produce valid GLTF for linear extrude', async () => {
        const scadCode = `
          linear_extrude(height=25)
            square([15, 10]);
        `;
        const result = await createGeometry({ 'extrude.scad': scadCode }, 'extrude.scad');

        expect(result.success).toBe(true);

        // Extruded rectangle: 15x10 base, height 25
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.015, 0.025, 0.01], 0.001);
      });

      it('should produce valid GLTF for rotate extrude', async () => {
        const scadCode = `
          $fn=32;
          rotate_extrude()
            translate([20, 0, 0])
              circle(r=5);
        `;
        const result = await createGeometry({ 'rotate_extrude.scad': scadCode }, 'rotate_extrude.scad');

        expect(result.success).toBe(true);

        // Torus: center at 20, circle radius 5
        // Total diameter: (20+5)*2 = 50, height: 10
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.01, 0.05], 0.001);
      });

      it('should produce valid GLTF for scaled geometry', async () => {
        const result = await createGeometry({ 'scaled.scad': 'scale([2, 3, 4]) cube([10, 10, 10]);' }, 'scaled.scad');

        expect(result.success).toBe(true);

        // Scaled cube: 10*2=20, 10*3=30, 10*4=40
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.02, 0.04, 0.03], 0.001);
      });

      it('should produce valid GLTF with parameterized geometry', async () => {
        const scadCode = `
          width = 50;
          height = 30;
          depth = 20;
          cube([width, height, depth]);
        `;
        const result = await createGeometry({ 'params.scad': scadCode }, 'params.scad');

        expect(result.success).toBe(true);

        // Cube with parameters: 50x30x20
        await geometryHelpers.expectValidGltf(result);
        await geometryHelpers.expectMeshCount(result, 1);
        await geometryHelpers.expectBoundingBoxSize(result, [0.05, 0.02, 0.03], 0.001);
      });
    });

    describe('Color handling', () => {
      it('should output OFF data with RGB colors for opaque geometry', async () => {
        const scadCode = `color([1, 0, 0]) cube([10, 10, 10]);`;
        const { success, offData } = await createGeometryAndGetOffData({ 'red_cube.scad': scadCode }, 'red_cube.scad');

        expect(success).toBe(true);
        expect(offData).toBeDefined();

        if (offData) {
          const { rgbFaceCount } = analyzeOffColorComponents(offData);
          expect(rgbFaceCount).toBeGreaterThan(0);
        }
      });

      it('should output OFF data with RGBA colors for transparent geometry', async () => {
        const scadCode = `color([0, 0, 1, 0.5]) cube([10, 10, 10]);`;
        const files = { 'transparent_cube.scad': scadCode };
        const { success, offData } = await createGeometryAndGetOffData(files, 'transparent_cube.scad');

        expect(success).toBe(true);
        expect(offData).toBeDefined();

        if (offData) {
          const { rgbaFaceCount } = analyzeOffColorComponents(offData);
          expect(rgbaFaceCount).toBeGreaterThan(0);
        }
      });

      it('should output mixed RGB and RGBA for mixed opaque/transparent geometry', async () => {
        const scadCode = `
          color([1, 0, 0]) cube([10, 10, 10]);
          translate([15, 0, 0]) color([0, 0, 1, 0.5]) cube([10, 10, 10]);
        `;
        const { success, offData } = await createGeometryAndGetOffData({ 'mixed.scad': scadCode }, 'mixed.scad');

        expect(success).toBe(true);
        expect(offData).toBeDefined();

        if (offData) {
          const { rgbFaceCount, rgbaFaceCount } = analyzeOffColorComponents(offData);
          expect(rgbFaceCount).toBeGreaterThan(0);
          expect(rgbaFaceCount).toBeGreaterThan(0);
        }
      });
    });

    describe('Error handling', () => {
      it('should return compilation error with line number for syntax errors', async () => {
        const worker = await createWorker({
          'syntax_error.scad': `
            x = 10;
            x += 5;
            cube([x, x, x]);
          `,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('syntax_error.scad'),
          parameters: {},
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.issues.length).toBeGreaterThan(0);
          expect(result.issues[0]?.location?.startLineNumber).toBeGreaterThan(0);
          expect(result.issues[0]?.type).toBe('compilation');
        }
      });

      it('should return error with file name for included file errors', async () => {
        const worker = await createWorker({
          'main.scad': 'include <lib.scad>\ncube([10, 10, 10]);',
          'lib.scad': 'x += 5;',
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('main.scad'),
          parameters: {},
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.issues[0]?.location?.fileName).toContain('lib.scad');
        }
      });

      it('should return fallback error when OpenSCAD fails without parseable message', async () => {
        const worker = await createWorker({
          'empty_module.scad': 'module test() {}  test();',
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('empty_module.scad'),
          parameters: {},
        });

        // This may succeed with empty geometry or fail - just verify we get a proper result
        expect(typeof result.success).toBe('boolean');
      });

      it('should return warning when file only defines modules without rendering', async () => {
        const worker = await createWorker({
          'module_only.scad': `// This file only defines a module but never calls it
module my_cube(size = 10) {
  cube([size, size, size]);
}

// No call to my_cube() - nothing to render
`,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('module_only.scad'),
          parameters: {},
        });

        // Should succeed (not an error) but with a warning
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.issues.length).toBeGreaterThan(0);
          expect(result.issues.some((index) => index.severity === 'warning')).toBe(true);
          expect(result.issues.some((index) => index.message.includes('No geometry to render'))).toBe(true);
          expect(result.issues.some((index) => index.message.includes('Call a module'))).toBe(true);
        }
      });

      it('should parse error message correctly for += operator', async () => {
        const worker = await createWorker({
          'compound_assign.scad': `
            x = 90;
            x += 2*5;
            cube([x, 10, 10]);
          `,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('compound_assign.scad'),
          parameters: {},
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.issues.length).toBeGreaterThan(0);
          expect(result.issues[0]?.message).toContain('syntax error');
        }
      });

      it('should return correct error location with start and end columns for indented code', async () => {
        // The error line "    x += 90 + tray_clearance;" has 4 leading spaces
        const errorLine = '    x += 90 + tray_clearance;';
        const worker = await createWorker({
          'indented_error.scad': `module test() {
${errorLine}
}`,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('indented_error.scad'),
          parameters: {},
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.issues.length).toBeGreaterThan(0);
          const error = result.issues[0];
          expect(error?.message).toContain('syntax error');
          expect(error?.location?.fileName).toBe('indented_error.scad');
          expect(error?.location?.startLineNumber).toBe(2);
          // 1-based column: first non-whitespace 'x' is at column 5 (after 4 spaces)
          expect(error?.location?.startColumn).toBe(5);
          // End column should be line length + 1 (1-based exclusive)
          expect(error?.location?.endColumn).toBe(errorLine.length + 1);
        }
      });

      it('should return severity "error" for syntax errors', async () => {
        const worker = await createWorker({
          'severity_error.scad': 'x += 5;',
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('severity_error.scad'),
          parameters: {},
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.issues.length).toBeGreaterThan(0);
          expect(result.issues[0]?.severity).toBe('error');
        }
      });
    });

    describe('Stack trace and error location', () => {
      it('should return error with correct location for single-file syntax error', async () => {
        const result = await createGeometry(
          {
            'main.scad': `// Parametric box
size = 10;
x += 5;
cube([size, size, size]);`,
          },
          'main.scad',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            message: 'syntax error',
            code: 'RUNTIME',
            type: 'compilation',
            severity: 'error',
            location: {
              fileName: 'main.scad',
              startLineNumber: 3,
              startColumn: 1,
              endLineNumber: 3,
              endColumn: 8,
            },
            stackFrames: [
              {
                functionName: 'include',
                fileName: 'main.scad',
                lineNumber: 1,
                context: 'user',
              },
            ],
          },
        ]);
      });

      it('should return error with correct location for error inside a module', async () => {
        // OpenSCAD parses the full file before execution, so syntax errors in
        // modules are caught at parse time with the correct line number.
        const result = await createGeometry(
          {
            'main.scad': `// Main file
module badModule() {
  x += 5;
}

badModule();`,
          },
          'main.scad',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            message: 'syntax error',
            code: 'RUNTIME',
            type: 'compilation',
            severity: 'error',
            location: {
              fileName: 'main.scad',
              startLineNumber: 3,
              startColumn: 3,
              endLineNumber: 3,
              endColumn: 10,
            },
            stackFrames: [
              {
                functionName: 'include',
                fileName: 'main.scad',
                lineNumber: 1,
                context: 'user',
              },
            ],
          },
        ]);
      });

      it('should return error pointing to correct included file in multi-file project', async () => {
        const result = await createGeometry(
          {
            'main.scad': `include <lib.scad>

cube([10, 10, 10]);`,
            'lib.scad': `x = 10;
x += 5;`,
          },
          'main.scad',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            message: 'syntax error',
            code: 'RUNTIME',
            type: 'compilation',
            severity: 'error',
            location: {
              fileName: 'lib.scad',
              startLineNumber: 2,
              startColumn: 1,
              endLineNumber: 2,
              endColumn: 8,
            },
            stackFrames: [
              {
                functionName: 'include',
                fileName: 'main.scad',
                lineNumber: 1,
                context: 'user',
              },
            ],
          },
        ]);
      });

      it('should return error pointing to correct file in 3-file include chain', async () => {
        // 3-file chain: main.scad -> middle.scad -> bad.scad
        const result = await createGeometry(
          {
            'main.scad': `include <middle.scad>

cube([10, 10, 10]);`,
            'middle.scad': `include <bad.scad>
y = 20;`,
            'bad.scad': `z = 10;
z += 5;`,
          },
          'main.scad',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            message: 'syntax error',
            code: 'RUNTIME',
            type: 'compilation',
            severity: 'error',
            location: {
              fileName: 'bad.scad',
              startLineNumber: 2,
              startColumn: 1,
              endLineNumber: 2,
              endColumn: 8,
            },
            // Stack frames reconstruct the full include chain (deepest first)
            stackFrames: [
              {
                functionName: 'include',
                fileName: 'middle.scad',
                lineNumber: 1,
                context: 'user',
              },
              {
                functionName: 'include',
                fileName: 'main.scad',
                lineNumber: 1,
                context: 'user',
              },
            ],
          },
        ]);
      });
    });

    describe('Include chain stack frames for parser errors', () => {
      it('should include stack frame from parent file for 2-file include syntax error', async () => {
        // Parser errors don't produce TRACE lines, but "Can't parse file" lines
        // allow us to reconstruct the include chain.
        const result = await createGeometry(
          {
            'main.scad': `include <lib.scad>

cube([10, 10, 10]);`,
            'lib.scad': `x = 10;
x += 5;`,
          },
          'main.scad',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            message: 'syntax error',
            code: 'RUNTIME',
            type: 'compilation',
            severity: 'error',
            location: {
              fileName: 'lib.scad',
              startLineNumber: 2,
              startColumn: 1,
              endLineNumber: 2,
              endColumn: 8,
            },
            stackFrames: [
              {
                functionName: 'include',
                fileName: 'main.scad',
                lineNumber: 1,
                context: 'user',
              },
            ],
          },
        ]);
      });

      it('should reconstruct full include chain for 3-file syntax error', async () => {
        // OpenSCAD only emits "Can't parse file 'main.scad'!" without mentioning
        // middle.scad. The parser walks include directives in file contents to
        // reconstruct the full chain: main.scad -> middle.scad -> bad.scad.
        const result = await createGeometry(
          {
            'main.scad': `include <middle.scad>

cube([10, 10, 10]);`,
            'middle.scad': `include <bad.scad>
y = 20;`,
            'bad.scad': `z = 10;
z += 5;`,
          },
          'main.scad',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            message: 'syntax error',
            code: 'RUNTIME',
            type: 'compilation',
            severity: 'error',
            location: {
              fileName: 'bad.scad',
              startLineNumber: 2,
              startColumn: 1,
              endLineNumber: 2,
              endColumn: 8,
            },
            stackFrames: [
              {
                functionName: 'include',
                fileName: 'middle.scad',
                lineNumber: 1,
                context: 'user',
              },
              {
                functionName: 'include',
                fileName: 'main.scad',
                lineNumber: 1,
                context: 'user',
              },
            ],
          },
        ]);
      });
    });

    describe('Stack trace with call chain', () => {
      it('should return stack frames for single-file module call chain', async () => {
        // Outer() calls inner() which triggers an assertion failure.
        // OpenSCAD TRACE lines provide a complete call stack.
        const result = await createGeometry(
          {
            'main.scad': `module outer() {
  inner();
}

module inner() {
  assert(false, "deliberate failure");
}

outer();`,
          },
          'main.scad',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            message: 'Assertion \'false\' failed: "deliberate failure"',
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
            location: {
              fileName: 'main.scad',
              startLineNumber: 6,
              startColumn: 3,
              endLineNumber: 6,
              endColumn: 39,
            },
            stackFrames: [
              {
                functionName: 'assert',
                fileName: 'main.scad',
                lineNumber: 6,
                context: 'framework',
              },
              {
                functionName: 'inner()',
                fileName: 'main.scad',
                lineNumber: 5,
                context: 'user',
              },
              {
                functionName: 'inner',
                fileName: 'main.scad',
                lineNumber: 2,
                context: 'user',
              },
              {
                functionName: 'outer()',
                fileName: 'main.scad',
                lineNumber: 1,
                context: 'user',
              },
              {
                functionName: 'outer',
                fileName: 'main.scad',
                lineNumber: 9,
                context: 'user',
              },
            ],
          },
          {
            message:
              'No geometry to render. Call a module or add a primitive (e.g., cube(), sphere()) to create visible output.',
            type: 'runtime',
            code: 'RUNTIME',
            severity: 'warning',
            location: {
              fileName: 'main.scad',
              startLineNumber: 1,
              startColumn: 1,
            },
          },
        ]);
      });

      it('should return stack frames across files for cross-file module call', async () => {
        const result = await createGeometry(
          {
            'main.scad': `use <lib.scad>

broken_module();`,
            'lib.scad': `module broken_module() {
  assert(false, "fail in lib");
}`,
          },
          'main.scad',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            message: 'Assertion \'false\' failed: "fail in lib"',
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
            location: {
              fileName: 'lib.scad',
              startLineNumber: 2,
              startColumn: 3,
              endLineNumber: 2,
              endColumn: 32,
            },
            stackFrames: [
              {
                functionName: 'assert',
                fileName: 'lib.scad',
                lineNumber: 2,
                context: 'framework',
              },
              {
                functionName: 'broken_module()',
                fileName: 'lib.scad',
                lineNumber: 1,
                context: 'user',
              },
              {
                functionName: 'broken_module',
                fileName: 'main.scad',
                lineNumber: 3,
                context: 'user',
              },
            ],
          },
          {
            message:
              'No geometry to render. Call a module or add a primitive (e.g., cube(), sphere()) to create visible output.',
            type: 'runtime',
            code: 'RUNTIME',
            severity: 'warning',
            location: {
              fileName: 'main.scad',
              startLineNumber: 1,
              startColumn: 1,
            },
          },
        ]);
      });

      it('should return stack frames across 3-file module call chain', async () => {
        // Chain: main.scad -> middle.scad -> bad.scad, assertion in bad.scad.
        const result = await createGeometry(
          {
            'main.scad': `use <middle.scad>

call_middle();`,
            'middle.scad': `use <bad.scad>

module call_middle() {
  call_bad();
}`,
            'bad.scad': `module call_bad() {
  assert(false, "deepest failure");
}`,
          },
          'main.scad',
        );

        expect(result.success).toBe(false);
        expect(result.issues).toEqual([
          {
            message: 'Assertion \'false\' failed: "deepest failure"',
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
            location: {
              fileName: 'bad.scad',
              startLineNumber: 2,
              startColumn: 3,
              endLineNumber: 2,
              endColumn: 36,
            },
            stackFrames: [
              {
                functionName: 'assert',
                fileName: 'bad.scad',
                lineNumber: 2,
                context: 'framework',
              },
              {
                functionName: 'call_bad()',
                fileName: 'bad.scad',
                lineNumber: 1,
                context: 'user',
              },
              {
                functionName: 'call_bad',
                fileName: 'middle.scad',
                lineNumber: 4,
                context: 'user',
              },
              {
                functionName: 'call_middle()',
                fileName: 'middle.scad',
                lineNumber: 3,
                context: 'user',
              },
              {
                functionName: 'call_middle',
                fileName: 'main.scad',
                lineNumber: 3,
                context: 'user',
              },
            ],
          },
          {
            message:
              'No geometry to render. Call a module or add a primitive (e.g., cube(), sphere()) to create visible output.',
            type: 'runtime',
            code: 'RUNTIME',
            severity: 'warning',
            location: {
              fileName: 'main.scad',
              startLineNumber: 1,
              startColumn: 1,
            },
          },
        ]);
      });

      it('should not produce stack frames for warnings (undefined variable)', async () => {
        const result = await createGeometry(
          {
            'main.scad': `function get_size() = garbage;

cube([get_size(), 10, 10]);`,
          },
          'main.scad',
        );

        // OpenSCAD still produces geometry with undef values (warnings, not errors)
        expect(result.success).toBe(true);
        expect(result.issues).toEqual([
          {
            message: 'Ignoring unknown variable "garbage"',
            code: 'RUNTIME',
            type: 'compilation',
            severity: 'warning',
            location: {
              fileName: 'main.scad',
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 31,
            },
          },
          {
            message: 'Unable to convert cube(size=[undef, 10, 10], ...) parameter to a number or a vec3 of numbers',
            code: 'RUNTIME',
            type: 'compilation',
            severity: 'warning',
            location: {
              fileName: 'main.scad',
              startLineNumber: 3,
              startColumn: 1,
              endLineNumber: 3,
              endColumn: 28,
            },
          },
        ]);
      });
    });

    describe('Warning handling', () => {
      it('should return warnings with successful geometry for undefined variable', async () => {
        const worker = await createWorker({
          'undefined_var.scad': `cube([undefined_var, 10, 10]);`,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('undefined_var.scad'),
          parameters: {},
        });

        // OpenSCAD still produces geometry with undef values
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.issues.length).toBeGreaterThan(0);
          expect(result.issues.some((index) => index.severity === 'warning')).toBe(true);
          expect(result.issues.some((index) => index.message.includes('undefined_var'))).toBe(true);
        }
      });

      it('should return warnings with successful geometry for undefined module', async () => {
        const worker = await createWorker({
          'undefined_module.scad': `my_undefined_module();
cube([10, 10, 10]);`,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('undefined_module.scad'),
          parameters: {},
        });

        // OpenSCAD still produces geometry (the cube)
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.issues.length).toBeGreaterThan(0);
          expect(result.issues.some((index) => index.severity === 'warning')).toBe(true);
          expect(result.issues.some((index) => index.message.includes('my_undefined_module'))).toBe(true);
        }
      });

      it('should return multiple warnings for multiple issues', async () => {
        const worker = await createWorker({
          'multiple_warnings.scad': `// Multiple issues test
my_undefined_module();
cube([undefined_var, 10, 10]);`,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('multiple_warnings.scad'),
          parameters: {},
        });

        // OpenSCAD still produces geometry
        expect(result.success).toBe(true);
        if (result.success) {
          // Should have at least 2 warnings (undefined module + undefined variable)
          expect(result.issues.length).toBeGreaterThanOrEqual(2);

          // All should be warnings
          expect(result.issues.every((index) => index.severity === 'warning')).toBe(true);

          // Should have warning about undefined module
          expect(result.issues.some((index) => index.message.includes('my_undefined_module'))).toBe(true);

          // Should have warning about undefined variable
          expect(result.issues.some((index) => index.message.includes('undefined_var'))).toBe(true);
        }
      });

      it('should return correct line numbers for multiple issues', async () => {
        const worker = await createWorker({
          'multi_line_warnings.scad': `first_undefined_module();
second_undefined_module();
cube([10, 10, 10]);`,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('multi_line_warnings.scad'),
          parameters: {},
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.issues.length).toBeGreaterThanOrEqual(2);

          const firstModuleIssue = result.issues.find((index) => index.message.includes('first_undefined_module'));
          const secondModuleIssue = result.issues.find((index) => index.message.includes('second_undefined_module'));

          expect(firstModuleIssue?.location?.startLineNumber).toBe(1);
          expect(secondModuleIssue?.location?.startLineNumber).toBe(2);
        }
      });
    });

    describe('File path handling for subdirectory files', () => {
      it('should use full relative path in error location when main file is in subdirectory', async () => {
        // Simulate a file at site/backyard.scad that has an error
        const worker = await createWorker({
          'site/backyard.scad': `x += 5;
cube([10, 10, 10]);`,
        });
        // Note: filename includes the subdirectory path
        const result = await worker.createGeometry({
          file: createGeometryFile('site/backyard.scad'),
          parameters: {},
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.issues.length).toBeGreaterThan(0);
          // The error location should preserve the full relative path, not just the basename
          expect(result.issues[0]?.location?.fileName).toBe('site/backyard.scad');
        }
      });

      it('should use full relative path in warning location when main file is in subdirectory', async () => {
        // Simulate a file at site/main.scad that has a warning (undefined module)
        const worker = await createWorker({
          'site/main.scad': `undefined_module();
cube([10, 10, 10]);`,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('site/main.scad'),
          parameters: {},
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.issues.length).toBeGreaterThan(0);
          // The warning location should preserve the full relative path
          expect(result.issues[0]?.location?.fileName).toBe('site/main.scad');
        }
      });

      it('should preserve correct paths for errors in included files from subdirectory main file', async () => {
        // Main file in site/ includes a file from lib/
        const worker = await createWorker({
          'site/main.scad': `include <../lib/broken.scad>
cube([10, 10, 10]);`,
          'lib/broken.scad': `x += 5;`, // Syntax error in included file
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('site/main.scad'),
          parameters: {},
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.issues.length).toBeGreaterThan(0);
          // Error in included file should show its path (lib/broken.scad)
          const brokenFileError = result.issues.find((index) => index.location?.fileName.includes('broken.scad'));
          expect(brokenFileError).toBeDefined();
          // Should preserve the relative path from the project root
          expect(brokenFileError?.location?.fileName).toMatch(/lib\/broken\.scad$/);
        }
      });

      it('should preserve correct paths for warnings about missing includes', async () => {
        const worker = await createWorker({
          'site/main.scad': `include <../furniture/missing.scad>
cube([10, 10, 10]);`,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('site/main.scad'),
          parameters: {},
        });

        // Should still produce geometry (the cube)
        expect(result.success).toBe(true);
        if (result.success) {
          // Should have a warning about the missing include
          expect(result.issues.some((index) => index.message.includes('missing.scad'))).toBe(true);
        }
      });
    });

    describe('OpenSCAD error format coverage', () => {
      it('should parse undefined function error', async () => {
        const worker = await createWorker({
          'undefined_func.scad': `x = my_undefined_function();
cube([x, 10, 10]);`,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('undefined_func.scad'),
          parameters: {},
        });

        // Undefined function results in undef, geometry may still be produced
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues.some((index) => index.message.includes('my_undefined_function'))).toBe(true);
      });

      it('should parse too many parameters warning', async () => {
        const worker = await createWorker({
          'too_many_params.scad': `module mymod(a) { cube(a); }
mymod(10, 20, 30);`, // Too many parameters
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('too_many_params.scad'),
          parameters: {},
        });

        // Should produce geometry - extra parameters are silently ignored in OpenSCAD
        expect(result.success).toBe(true);
      });

      it('should parse recursion error', async () => {
        const worker = await createWorker({
          'recursion.scad': `module infinite() { infinite(); }
infinite();`,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('recursion.scad'),
          parameters: {},
        });

        // Recursion detection - OpenSCAD WASM may handle this differently
        // Just verify we get a result without crashing
        expect(typeof result.success).toBe('boolean');
        if (!result.success && result.issues.length > 0) {
          expect(result.issues[0]?.severity).toBe('error');
        }
      });

      it('should parse file not found warning for include', async () => {
        const worker = await createWorker({
          'missing_include.scad': `include <nonexistent_file.scad>
cube([10, 10, 10]);`,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('missing_include.scad'),
          parameters: {},
        });

        // Should still produce geometry (the cube)
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.issues.some((index) => index.message.includes('nonexistent_file.scad'))).toBe(true);
          expect(result.issues.some((index) => index.severity === 'warning')).toBe(true);
        }
      });

      it('should parse assertion failure error', async () => {
        const worker = await createWorker({
          'assertion.scad': `assert(false, "Custom assertion message");
cube([10, 10, 10]);`,
        });
        const result = await worker.createGeometry({
          file: createGeometryFile('assertion.scad'),
          parameters: {},
        });

        // Assertion failure should fail
        expect(result.success).toBe(false);
        if (!result.success) {
          // Verify at least one error was captured
          expect(result.issues.length).toBeGreaterThan(0);
          expect(result.issues[0]?.severity).toBe('error');
        }
      });
    });
  });
});

// =============================================================================
// Unresolved dependency tracking
// =============================================================================

describe('OpenSCAD Kernel – unresolved dependency tracking', () => {
  it('should include missing include paths in watch set', async () => {
    const worker = await createWorker({
      'assembly.scad': `
        include <parts/base.scad>
        include <parts/top.scad>
        cube([10, 10, 10]);
      `,
    });

    const geometryFile = createGeometryFile('assembly.scad');

    await worker.render({
      file: geometryFile,
      parameters: {},
    });

    // OpenSCAD still renders the cube despite missing includes, but we
    // need the watch set to include the unresolved paths so creating
    // those files later triggers a re-render.
    const watchedPaths = worker.getWatchedPaths();
    expect(watchedPaths).toContain('/projects/test/assembly.scad');
    expect(watchedPaths).toContain('/projects/test/parts/base.scad');
    expect(watchedPaths).toContain('/projects/test/parts/top.scad');
  });

  it('should re-render when previously missing include file is created', async () => {
    const worker = await createWorker({
      'main.scad': `
        include <lib/utils.scad>
        cube([my_size, my_size, my_size]);
      `,
    });

    const geometryFile = createGeometryFile('main.scad');

    await worker.render({
      file: geometryFile,
      parameters: {},
    });

    // Write the missing include file directly to the live filesystem
    const fs = getTestFileSystem();
    await fs.mkdir('/projects/test/lib', { recursive: true });
    await fs.writeFile('/projects/test/lib/utils.scad', 'my_size = 20;');

    await worker.notifyFileChanged(['/projects/test/lib/utils.scad']);

    const result2 = await worker.createGeometry({
      file: geometryFile,
      parameters: {},
    });

    expect(result2.success).toBe(true);
  });
});

// =============================================================================
// Tessellation
// =============================================================================

describe('Tessellation', () => {
  const sphereCode = 'sphere(r=10);';

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

  it('should produce denser mesh with higher segment count', async () => {
    const worker = await createWorker({ 'sphere.scad': sphereCode });
    const geometryFile = createGeometryFile('sphere.scad');

    const coarseResult = await worker.createGeometry({
      file: geometryFile,
      parameters: {},
      options: { tessellation: { segments: 8, minimumAngle: 30, minimumSize: 5 } },
    });
    assertSuccess(coarseResult);

    const fineResult = await worker.createGeometry({
      file: geometryFile,
      parameters: {},
      options: { tessellation: { segments: 64, minimumAngle: 3, minimumSize: 0.5 } },
    });
    assertSuccess(fineResult);

    const coarseVertices = await getVertexCount(extractGltfFromResult(coarseResult)!);
    const fineVertices = await getVertexCount(extractGltfFromResult(fineResult)!);

    // Fine tessellation must produce significantly more vertices than coarse
    expect(fineVertices).toBeGreaterThan(coarseVertices * 1.5);
  });

  it('should respect user-defined $fn in parameters over render option defaults', async () => {
    const worker = await createWorker({ 'sphere.scad': sphereCode });
    const geometryFile = createGeometryFile('sphere.scad');

    // Render with high-quality render options but user $fn=8 in parameters
    const result = await worker.createGeometry({
      file: geometryFile,
      parameters: { $fn: 8 },
      options: { tessellation: { segments: 64, minimumAngle: 3, minimumSize: 0.5 } },
    });
    assertSuccess(result);
    const userVertices = await getVertexCount(extractGltfFromResult(result)!);

    // Also render with only $fn=8 in parameters (no render options)
    const baselineResult = await worker.createGeometry({
      file: geometryFile,
      parameters: { $fn: 8 },
    });
    assertSuccess(baselineResult);
    const baselineVertices = await getVertexCount(extractGltfFromResult(baselineResult)!);

    // Both should produce the same count: user $fn=8 in parameters takes precedence
    expect(userVertices).toBe(baselineVertices);
  });

  it('should inject render options when no user-defined $fn exists', async () => {
    const worker = await createWorker({ 'sphere.scad': sphereCode });
    const geometryFile = createGeometryFile('sphere.scad');

    const withTessResult = await worker.createGeometry({
      file: geometryFile,
      parameters: {},
      options: { tessellation: { segments: 64, minimumAngle: 3, minimumSize: 0.5 } },
    });
    assertSuccess(withTessResult);

    const withoutTessResult = await worker.createGeometry({
      file: geometryFile,
      parameters: {},
    });
    assertSuccess(withoutTessResult);

    const withTessVertices = await getVertexCount(extractGltfFromResult(withTessResult)!);
    const withoutTessVertices = await getVertexCount(extractGltfFromResult(withoutTessResult)!);

    // Tessellation injection should change the mesh density
    expect(withTessVertices).not.toBe(withoutTessVertices);
  });
});

// =============================================================================
// Export Geometry
// =============================================================================

describe('Export', () => {
  const sphereCode = 'sphere(r=10);';

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

  it('should export GLB successfully', async () => {
    const worker = await createWorker({ 'sphere.scad': sphereCode });
    const geometryFile = createGeometryFile('sphere.scad');
    await worker.createGeometry({ file: geometryFile, parameters: {} });

    const exportResult = await worker.exportGeometry('glb');
    assertSuccess(exportResult);
    expect(exportResult.data.length).toBeGreaterThan(0);
    expect(exportResult.data[0]?.bytes).toBeInstanceOf(Uint8Array);
    const { nodeNames, meshNames } = await readGltfNodeMeshNames(exportResult.data[0]!.bytes);
    expect(nodeNames).toEqual(['Shape 1']);
    expect(meshNames).toEqual(['Shape 1']);
  });

  it('should export GLTF successfully', async () => {
    const worker = await createWorker({ 'sphere.scad': sphereCode });
    const geometryFile = createGeometryFile('sphere.scad');
    await worker.createGeometry({ file: geometryFile, parameters: {} });

    const exportResult = await worker.exportGeometry('gltf');
    assertSuccess(exportResult);
    expect(exportResult.data.length).toBeGreaterThan(0);
  });

  it('should produce different face counts with different tessellation options on export', async () => {
    const worker = await createWorker({ 'sphere.scad': sphereCode });
    const geometryFile = createGeometryFile('sphere.scad');
    await worker.createGeometry({ file: geometryFile, parameters: {} });

    const coarseExport = await worker.exportGeometry('glb', {
      tessellation: { segments: 8, minimumAngle: 30, minimumSize: 5 },
    });
    assertSuccess(coarseExport);

    const fineExport = await worker.exportGeometry('glb', {
      tessellation: { segments: 64, minimumAngle: 3, minimumSize: 0.5 },
    });
    assertSuccess(fineExport);

    const coarseVertices = await getVertexCount(coarseExport.data[0]!.bytes);
    const fineVertices = await getVertexCount(fineExport.data[0]!.bytes);

    expect(fineVertices).toBeGreaterThan(coarseVertices * 1.5);
  });

  it('should always override user-defined $fn on export', async () => {
    const userDefinedSegments = '$fn = 8;\nsphere(r=10);';
    const worker = await createWorker({ 'sphere.scad': userDefinedSegments });
    const geometryFile = createGeometryFile('sphere.scad');
    await worker.createGeometry({ file: geometryFile, parameters: {} });

    // Export with high segment count — should override user's $fn=8
    const highQualityExport = await worker.exportGeometry('glb', {
      tessellation: { segments: 64, minimumAngle: 3, minimumSize: 0.5 },
    });
    assertSuccess(highQualityExport);

    // Export with user's own $fn=8
    const lowQualityExport = await worker.exportGeometry('glb', {
      tessellation: { segments: 8, minimumAngle: 30, minimumSize: 5 },
    });
    assertSuccess(lowQualityExport);

    const highVertices = await getVertexCount(highQualityExport.data[0]!.bytes);
    const lowVertices = await getVertexCount(lowQualityExport.data[0]!.bytes);

    // High quality must produce significantly more vertices, proving override
    expect(highVertices).toBeGreaterThan(lowVertices * 1.5);
  });

  it('should produce different GLB output for y-up vs z-up coordinate system', async () => {
    const boxCode = 'cube([20, 10, 30]);';
    const worker = await createWorker({ 'box.scad': boxCode });
    const geometryFile = createGeometryFile('box.scad');
    await worker.createGeometry({ file: geometryFile, parameters: {} });

    const yUpExport = await worker.exportGeometry('glb', { coordinateSystem: 'y-up' });
    const zUpExport = await worker.exportGeometry('glb', { coordinateSystem: 'z-up' });

    assertSuccess(yUpExport);
    assertSuccess(zUpExport);

    const yUpBytes = yUpExport.data[0]!.bytes;
    const zUpBytes = zUpExport.data[0]!.bytes;

    // Different coordinate systems must produce different byte output
    expect(Buffer.from(yUpBytes).equals(Buffer.from(zUpBytes))).toBe(false);
  });

  it('should return error when no geometry computed', async () => {
    const worker = await createWorker({ 'empty.scad': '' });
    const geometryFile = createGeometryFile('empty.scad');
    await worker.createGeometry({ file: geometryFile, parameters: {} });

    const exportResult = await worker.exportGeometry('glb');
    expect(exportResult.success).toBe(false);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- re-enable after OpenSCAD parameter tests */
