/* eslint-disable @typescript-eslint/naming-convention -- Assimp export property keys use CONSTANT_CASE */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { exportFromGlb } from '@taucad/converter';
import type { ExportFile } from '@taucad/types';
import type { TranscoderRuntime } from '#types/runtime-transcoder.types.js';
import { converterTranscoder } from '#transcoders/converter/converter.transcoder.js';
import { converterEdgeSchemas, converterExportOptions } from '#transcoders/converter/converter-export-options.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';

vi.mock('@taucad/converter', () => ({
  exportFromGlb: vi.fn(),
}));

const createRuntime = (): TranscoderRuntime =>
  mock<TranscoderRuntime>({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });

describe('converter transcoder', () => {
  const resolveConverterDefinition = async () => resolveRuntimePluginDefinition('transcoder', converterTranscoder());
  let converterDefinition: Awaited<ReturnType<typeof resolveConverterDefinition>>;
  let context: Record<string, never>;
  let runtime: TranscoderRuntime;

  beforeEach(async () => {
    runtime = createRuntime();
    converterDefinition = await resolveConverterDefinition();
    context = (await converterDefinition.initialize({}, runtime)) as Record<string, never>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should initialize without error', () => {
      expect(context).toBeDefined();
    });
  });

  describe('edges', () => {
    it('should declare a non-empty list of edges as a static property', () => {
      expect(Array.isArray(converterDefinition.edges)).toBe(true);
      expect(converterDefinition.edges.length).toBeGreaterThan(0);
    });

    it('should declare every edge as a glb→<format> mesh conversion (excluding glb→glb)', () => {
      for (const edge of converterDefinition.edges) {
        expect(edge.from).toBe('glb');
        expect(edge.to).not.toBe('glb');
        expect(edge.fidelity).toBe('mesh');
      }
    });

    it('should attach optionsSchema to the 3mf edge', () => {
      const threeMfEdge = converterDefinition.edges.find((edge) => edge.to === '3mf');

      expect(threeMfEdge).toBeDefined();
      expect(threeMfEdge!.optionsSchema).toBeDefined();
    });

    it('should not attach optionsSchema to non-3mf edges', () => {
      const stlEdge = converterDefinition.edges.find((edge) => edge.to === 'stl');

      expect(stlEdge).toBeDefined();
      expect('optionsSchema' in stlEdge!).toBe(false);
    });

    it('should pin every converter source GLB to spec-native Y-up meters', () => {
      for (const edge of converterDefinition.edges) {
        expect(edge.sourceOptions).toEqual({ coordinateSystem: 'y-up', unit: { length: 'meter' } });
      }
    });

    it('should include common export formats', () => {
      const toFormats = converterDefinition.edges.map((edge) => edge.to);

      expect(toFormats).toContain('stl');
      expect(toFormats).toContain('step');
      expect(toFormats).toContain('obj');
      expect(toFormats).toContain('usdz');
      expect(toFormats).toContain('fbx');
      expect(toFormats).toContain('gltf');
    });
  });

  describe('compile-time / runtime parity (drift guard)', () => {
    // The plugin-side `converterEdgeSchemas` (compile-time `EdgeMap`) and the
    // runtime `defineTranscoder` `edges` tuple are two declarations that must
    // refer to the same set of target formats. These tests fail loudly if a
    // future change adds a target to one source without adding it to the other.

    it('should declare a runtime edge for every key in converterEdgeSchemas', () => {
      const runtimeTargets = new Set(converterDefinition.edges.map((edge) => edge.to));

      for (const target of Object.keys(converterEdgeSchemas)) {
        expect(runtimeTargets).toContain(target);
      }
    });

    it('should expose an entry in converterEdgeSchemas for every runtime edge', () => {
      const schemaTargets = new Set(Object.keys(converterEdgeSchemas));

      for (const edge of converterDefinition.edges) {
        expect(schemaTargets).toContain(edge.to);
      }
    });

    it('should share the same Zod instance between converterEdgeSchemas[3mf] and the runtime 3mf edge optionsSchema', () => {
      const threeMfEdge = converterDefinition.edges.find((edge) => edge.to === '3mf');

      expect(threeMfEdge).toBeDefined();
      expect(threeMfEdge!.optionsSchema).toBe(converterExportOptions['3mf'].schema);
      expect(threeMfEdge!.optionsSchema).toBe(converterEdgeSchemas['3mf']);
    });
  });

  describe('transcode', () => {
    it('should call exportFromGlb and return transcoded files on success', async () => {
      const inputBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      const outputFiles: ExportFile[] = [
        { name: 'model.stl', bytes: new Uint8Array([1, 2, 3]), mimeType: 'model/stl' },
      ];
      vi.mocked(exportFromGlb).mockResolvedValue(outputFiles);

      const result = await converterDefinition.transcode(
        {
          from: 'glb',
          to: 'stl',
          files: [{ name: 'model.glb', bytes: inputBytes, mimeType: 'model/gltf-binary' }],
          options: {},
        },
        runtime,
        context,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(outputFiles);
      }
      expect(exportFromGlb).toHaveBeenCalledWith(inputBytes, 'stl', undefined);
    });

    it('should forward transformed options as exportProperties for 3mf', async () => {
      const inputBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      const outputFiles: ExportFile[] = [
        { name: 'model.3mf', bytes: new Uint8Array([1, 2, 3]), mimeType: 'model/3mf' },
      ];
      vi.mocked(exportFromGlb).mockResolvedValue(outputFiles);

      const result = await converterDefinition.transcode(
        {
          from: 'glb',
          to: '3mf',
          files: [{ name: 'model.glb', bytes: inputBytes, mimeType: 'model/gltf-binary' }],
          options: { unit: 'centimeter', application: 'PrusaSlicer 2.8' },
        },
        runtime,
        context,
      );

      expect(result.success).toBe(true);
      expect(exportFromGlb).toHaveBeenCalledWith(inputBytes, '3mf', {
        '3MF_EXPORT_UNIT': 'centimeter',
        '3MF_EXPORT_APPLICATION': 'PrusaSlicer 2.8',
      });
    });

    it('should apply millimeter default when 3mf options have no unit', async () => {
      const inputBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      vi.mocked(exportFromGlb).mockResolvedValue([]);

      await converterDefinition.transcode(
        {
          from: 'glb',
          to: '3mf',
          files: [{ name: 'model.glb', bytes: inputBytes, mimeType: 'model/gltf-binary' }],
          options: { application: 'Cura 5.6' },
        },
        runtime,
        context,
      );

      expect(exportFromGlb).toHaveBeenCalledWith(inputBytes, '3mf', {
        '3MF_EXPORT_UNIT': 'millimeter',
        '3MF_EXPORT_APPLICATION': 'Cura 5.6',
      });
    });

    it('should not pass exportProperties when 3mf options are empty', async () => {
      const inputBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      vi.mocked(exportFromGlb).mockResolvedValue([]);

      await converterDefinition.transcode(
        {
          from: 'glb',
          to: '3mf',
          files: [{ name: 'model.glb', bytes: inputBytes, mimeType: 'model/gltf-binary' }],
          options: {},
        },
        runtime,
        context,
      );

      expect(exportFromGlb).toHaveBeenCalledWith(inputBytes, '3mf', undefined);
    });

    it('should return error result when exportFromGlb throws', async () => {
      vi.mocked(exportFromGlb).mockRejectedValue(new Error('conversion failed'));

      const result = await converterDefinition.transcode(
        {
          from: 'glb',
          to: 'stl',
          files: [{ name: 'model.glb', bytes: new Uint8Array([1, 2, 3]), mimeType: 'model/gltf-binary' }],
          options: {},
        },
        runtime,
        context,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]!.message).toContain('conversion failed');
      }
    });

    it('should return error result when no input files are provided', async () => {
      const result = await converterDefinition.transcode(
        {
          from: 'glb',
          to: 'stl',
          files: [],
          options: {},
        },
        runtime,
        context,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]!.message).toContain('No input files');
      }
    });
  });

  describe('cleanup', () => {
    it('should clean up without error', async () => {
      await expect(converterDefinition.cleanup(context)).resolves.toBeUndefined();
    });
  });
});
