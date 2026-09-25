import { defineTranscoder } from '@taucad/runtime/transcoder';
import { createExportFile } from '@taucad/runtime/types';
import type { KernelIssue } from '@taucad/runtime/types';

import {
  BambuStudioError,
  bambuPlates,
  findBambuStudio,
  loadBambuStudioCatalog,
  resolveBambuStudioSelection,
  sliceWithBambuStudio,
} from '#bambu-studio/engine.js';
import type { BambuMachineHints } from '#bambu-studio/engine.js';
import { writeBambuContainer } from '#container.js';
import { readTriangleMesh, writeBinaryStl } from '#glb-mesh.js';
import { ReferenceEngineError, sliceReference } from '#reference-engine.js';
import { ServiceEngineError, sliceWithService } from '#service-engine.js';
import { resolveSlicerOptions, slicerOptionsSchema } from '#slicer-options.js';
import type { ResolvedSlicerOptions } from '#slicer-options.js';

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

// Slice through the person's Bambu Studio and return its archive untouched.
// Presets not named in `bambuStudio` default from its `hints`, else from an
// X1 Carbon with the generic options' quality preset and plate.
const sliceThroughBambuStudio = async (
  glb: Uint8Array<ArrayBuffer>,
  options: ResolvedSlicerOptions,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> => {
  const install = await findBambuStudio();
  if (install === undefined) {
    throw new BambuStudioError(
      'BAMBU_STUDIO_UNAVAILABLE',
      'Slicing with Bambu Studio needs the Tau desktop app with Bambu Studio installed.',
    );
  }
  const { hints: givenHints, ...partial } = options.bambuStudio ?? {};
  const plate = bambuPlates.find(({ id }) => id === options.plate)?.id;
  const hints: BambuMachineHints = givenHints ?? {
    model: 'X1C',
    preset: options.preset,
    ...(plate === undefined ? {} : { plate }),
    materials: [],
  };
  // Only the chosen printer's (or the hinted model's) presets are summarized, not the whole catalog.
  const catalog = await loadBambuStudioCatalog(
    install,
    partial.printer === undefined
      ? { model: hints.model, ...(hints.nozzleDiameter === undefined ? {} : { nozzleDiameter: hints.nozzleDiameter }) }
      : { printer: partial.printer },
  );
  const selection = resolveBambuStudioSelection(catalog, hints, partial);
  const stl = writeBinaryStl(await readTriangleMesh(glb));
  const { archive } = await sliceWithBambuStudio({ install, selection, stl, signal });
  return archive;
};

/**
 * `glb → gcode.3mf` transcoder: FFF slicing into a print-ready Bambu container.
 *
 * The reference engine slices in-process on `manifold-3d`; the service engine
 * delegates to a configured `tau-slicer-service/1` companion; both wrap their
 * G-code in Tau's Bambu container. The `bambu-studio` engine (Node hosts
 * only) runs the person's installed Bambu Studio and returns its archive
 * byte for byte. Every engine outputs one `model.gcode.3mf`.
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
      if (options.engine === 'bambu-studio') {
        const archive = await sliceThroughBambuStudio(file.bytes, options, runtime.signal);
        return { success: true, data: [createExportFile('gcode.3mf', 'model.gcode.3mf', archive)], issues: [] };
      }
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
      if (error instanceof BambuStudioError) {
        return failure([issue(error.message, 'RUNTIME', { engine: 'bambu-studio', code: error.code })]);
      }
      if (error instanceof ServiceEngineError) {
        return failure([issue(error.message, 'RUNTIME', { engine: 'service', code: error.code })]);
      }
      return failure([issue(error instanceof Error ? error.message : 'Slicing failed.', 'RUNTIME')]);
    }
  },
});
