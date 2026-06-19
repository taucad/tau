/**
 * Converter Transcoder
 *
 * Wraps `@taucad/converter`'s `exportFromGlb` as a transcoder plugin, enabling
 * GLB-to-any-format conversion via the runtime route planner. This replaces
 * the direct converter dependency in individual kernels with a single,
 * plugin-managed conversion pipeline.
 */

import { exportFromGlb } from '@taucad/converter';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';
import { converterExportOptions } from '#transcoders/converter/converter-export-options.js';

type ConverterOptionsKey = keyof typeof converterExportOptions;

const hasConverterOptions = (format: string): format is ConverterOptionsKey => format in converterExportOptions;

/**
 * Static edges declared as a `readonly` tuple so that each element preserves its
 * literal `to` type. The tuple powers {@link TranscodeInput} discriminated narrowing —
 * `input.to === '3mf'` narrows `input.options` to `z.input<typeof converterExportOptions['3mf'].schema>`.
 *
 * Drift guard: a runtime test asserts this tuple matches `@taucad/converter`'s
 * `supportedExportFormats` (excluding `glb`).
 */
const edges = [
  { from: 'glb', to: '3mf', fidelity: 'mesh', optionsSchema: converterExportOptions['3mf'].schema },
  { from: 'glb', to: '3ds', fidelity: 'mesh' },
  { from: 'glb', to: 'dae', fidelity: 'mesh' },
  { from: 'glb', to: 'fbx', fidelity: 'mesh' },
  { from: 'glb', to: 'gltf', fidelity: 'mesh' },
  { from: 'glb', to: 'obj', fidelity: 'mesh' },
  { from: 'glb', to: 'ply', fidelity: 'mesh' },
  { from: 'glb', to: 'stl', fidelity: 'mesh' },
  { from: 'glb', to: 'step', fidelity: 'mesh' },
  { from: 'glb', to: 'usda', fidelity: 'mesh' },
  { from: 'glb', to: 'usdz', fidelity: 'mesh' },
  { from: 'glb', to: 'x', fidelity: 'mesh' },
  { from: 'glb', to: 'x3d', fidelity: 'mesh' },
] as const;

export const converterTranscoder = defineTranscoder({
  id: 'converter',
  name: 'ConverterTranscoder',
  version: '1.0.0',
  edges,

  async initialize() {
    return {};
  },

  async transcode(input, runtime) {
    if (input.files.length === 0) {
      return {
        success: false,
        data: [],
        issues: [
          { message: 'No input files provided for transcoding', code: 'RUNTIME', type: 'runtime', severity: 'error' },
        ],
      };
    }

    const glbBytes = input.files[0]!.bytes;
    let exportProperties: Record<string, boolean | number | string> | undefined;

    if (hasConverterOptions(input.to) && Object.keys(input.options).length > 0) {
      exportProperties = converterExportOptions[input.to].toAssimpProperties.parse(input.options);
    }

    try {
      runtime.logger.log(`Transcoding GLB → ${input.to}`);
      const files = await exportFromGlb(glbBytes, input.to, exportProperties);
      runtime.logger.log(`Successfully transcoded to ${input.to}`);
      return { success: true, data: files, issues: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcoding failed';
      return {
        success: false,
        data: [],
        issues: [{ message, code: 'RUNTIME', type: 'runtime', severity: 'error' }],
      };
    }
  },

  async cleanup() {
    // No resources to release
  },
});
