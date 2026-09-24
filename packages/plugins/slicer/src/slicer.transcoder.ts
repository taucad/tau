import { defineTranscoder } from '@taucad/runtime/transcoder';
import { createExportFile } from '@taucad/runtime/types';
import type { KernelIssue } from '@taucad/runtime/types';

import { writeBambuContainer } from '#container.js';
import { readTriangleMesh } from '#glb-mesh.js';
import { ReferenceEngineError, sliceReference } from '#reference-engine.js';
import { ServiceEngineError, sliceWithService } from '#service-engine.js';
import { resolveSlicerOptions, slicerOptionsSchema } from '#slicer-options.js';

const edges = [{ from: 'glb', to: 'gcode.3mf', fidelity: 'mesh', optionsSchema: slicerOptionsSchema }] as const;

const issue = (message: string, code: KernelIssue['code'], details?: KernelIssue['details']): KernelIssue => ({
  message,
  code,
  type: 'runtime',
  severity: 'error',
  ...(details === undefined ? {} : { details }),
});

const failure = (issues: KernelIssue[]): { success: false; issues: KernelIssue[] } => ({ success: false, issues });

const modelNameOf = (fileName: string): string => {
  const base = fileName.slice(fileName.lastIndexOf('/') + 1);
  const dot = base.indexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base) || 'model';
};

/**
 * `glb → gcode.3mf` transcoder: FFF slicing into a print-ready Bambu container.
 *
 * The reference engine slices in-process on `manifold-3d`; the service engine
 * delegates to a configured `tau-slicer-service/1` companion. Either way the
 * output is one `model.gcode.3mf` whose plate member is the G-code.
 *
 * @public
 * @example <caption>Register slicing in a runtime</caption>
 * ```typescript
 * import { defineRuntime } from '@taucad/runtime/worker';
 * import { slicerTranscoder } from '@taucad/slicer';
 *
 * const runtime = defineRuntime({ transcoders: [slicerTranscoder()] });
 * ```
 */
export const slicerTranscoder = defineTranscoder({
  id: 'slicer',
  name: 'SlicerTranscoder',
  version: '0.1.0',
  edges,

  async initialize() {
    return {};
  },

  async transcode(input, runtime) {
    const [file] = input.files;
    if (file === undefined) {
      return failure([issue('No input files provided for slicing.', 'RUNTIME')]);
    }
    const options = resolveSlicerOptions(slicerOptionsSchema.parse(input.options));
    if (options.engine === 'service' && options.service === undefined) {
      return failure([
        issue('The service engine needs `service.url` and `service.token`.', 'TRANSCODER_OPTIONS_INVALID'),
      ]);
    }
    if (options.engine === 'reference' && options.supports) {
      return failure([
        issue('The reference engine does not generate supports.', 'RUNTIME_CONTENT_UNSUPPORTED', {
          operation: 'transcode',
          engine: 'reference',
          option: 'supports',
        }),
      ]);
    }
    try {
      const mesh = await readTriangleMesh(file.bytes);
      const sliced =
        options.engine === 'service' && options.service !== undefined
          ? await sliceWithService({ mesh, options: { ...options, service: options.service }, signal: runtime.signal })
          : await sliceReference({ mesh, options, signal: runtime.signal });
      const { gcode } = sliced;
      const bytes = writeBambuContainer({ gcode, modelName: modelNameOf(file.name), plate: options.plate });
      return { success: true, data: [createExportFile('gcode.3mf', 'model.gcode.3mf', bytes)], issues: [] };
    } catch (error) {
      runtime.signal.throwIfAborted();
      if (error instanceof ReferenceEngineError) {
        return failure([issue(error.message, error.code === 'GEOMETRY_INVALID' ? 'GEOMETRY_INVALID' : 'RUNTIME')]);
      }
      if (error instanceof ServiceEngineError) {
        return failure([issue(error.message, 'RUNTIME', { engine: 'service', code: error.code })]);
      }
      return failure([issue(error instanceof Error ? error.message : 'Slicing failed.', 'RUNTIME')]);
    }
  },
});
