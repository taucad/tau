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
import { isClosedMesh, readTriangleMesh, writeBinaryStl } from '#glb-mesh.js';
import type { TriangleModel } from '#glb-mesh.js';
import { ReferenceEngineError, sliceReference } from '#reference-engine.js';
import { ServiceEngineError, sliceWithService } from '#service-engine.js';
import { resolveSlicerOptions, slicerOptionsSchema } from '#slicer-options.js';
import type { ResolvedSlicerOptions } from '#slicer-options.js';

const edges = [{ from: 'glb', to: 'gcode.3mf', fidelity: 'mesh', optionsSchema: slicerOptionsSchema }] as const;

// ponytail: an X1C with one AMS prints at most four filaments. Its external spool cannot join an AMS
// print, and Tau's AMS mapping addresses trays only. Ceiling: more AMS units (up to 16 trays); pass the
// bound printer's tray count through `bambuStudio.hints` when such a printer is qualified.
const maximumFilaments = 4;

// Bambu Studio's `printer_model` for each machine profile the reference engine slices for.
const printerModels = { 'bambu-x1c': 'Bambu Lab X1 Carbon' } as const satisfies Record<
  ResolvedSlicerOptions['machineProfile'],
  string
>;

const issue = (message: string, code: KernelIssue['code'], details?: KernelIssue['details']): KernelIssue => ({
  message,
  code,
  type: 'runtime',
  severity: 'error',
  ...(details === undefined ? {} : { details }),
});

// A model whose colours print as one: the whole mesh is sliced and records its first colour.
const mergedColors = (model: TriangleModel, reason: string, engine: ResolvedSlicerOptions['engine']): KernelIssue => {
  const colors = model.parts.map(({ color }) => color ?? 'uncoloured').join(', ');
  return {
    ...issue(
      `${reason}, so the model's ${model.parts.length} colours (${colors}) print as one${model.color === undefined ? '' : `, in ${model.color}`}.`,
      'REPRESENTATION_UNSUPPORTED',
      {
        operation: 'transcode',
        engine,
        colors: model.parts.flatMap(({ color }) => (color === undefined ? [] : [color])),
      },
    ),
    severity: 'warning',
  };
};

// Why Bambu Studio cannot print each of the model's colours with its own filament; undefined when it can.
const mergeReason = (model: TriangleModel): string | undefined => {
  if (model.parts.length > maximumFilaments) {
    return `The printer loads at most ${maximumFilaments} filaments`;
  }
  // A colour on some faces of a solid makes an open part, which Bambu Studio cannot slice on its own.
  if (model.parts.length > 1 && !model.parts.every(isClosedMesh)) {
    return 'Colours on faces of a solid cannot print as separate filaments';
  }
  return undefined;
};

const failure = (issues: KernelIssue[]): { success: false; issues: KernelIssue[] } => ({ success: false, issues });

const modelNameOf = (fileName: string): string => {
  const base = fileName.slice(fileName.lastIndexOf('/') + 1);
  const dot = base.indexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base) || 'model';
};

// Slice through the person's Bambu Studio and return its archive untouched.
// Presets not named in `bambuStudio` default from its `hints`, else from an
// X1 Carbon with the generic options' quality preset and plate. A model with
// several colours slices as one assembly with a filament per colour, unless
// the printer cannot print them apart.
const sliceThroughBambuStudio = async (
  glb: Uint8Array<ArrayBuffer>,
  options: ResolvedSlicerOptions,
  signal: AbortSignal,
): Promise<{ archive: Uint8Array<ArrayBuffer>; issues: KernelIssue[] }> => {
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
  const model = await readTriangleMesh(glb);
  const reason = mergeReason(model);
  const parts = reason === undefined ? model.parts : [model];
  const { archive } = await sliceWithBambuStudio({
    install,
    selection,
    parts: parts.map((part) => ({
      stl: writeBinaryStl(part),
      ...(part.color === undefined ? {} : { color: part.color }),
    })),
    signal,
  });
  return { archive, issues: reason === undefined ? [] : [mergedColors(model, reason, 'bambu-studio')] };
};

/**
 * `glb → gcode.3mf` transcoder: FFF slicing into a print-ready Bambu container.
 *
 * The reference engine slices in-process on `manifold-3d`; the service engine
 * delegates to a configured `tau-slicer-service/1` companion; both wrap their
 * G-code in Tau's Bambu container, recording the model's first colour. The
 * `bambu-studio` engine (Node hosts only) runs the person's installed Bambu
 * Studio and returns its archive byte for byte; a model with up to four
 * colours prints with a filament per colour. Otherwise the colours print as
 * one, with a warning issue naming them. Every engine outputs one
 * `model.gcode.3mf`.
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

  async transcode(input, services) {
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
        const { archive, issues } = await sliceThroughBambuStudio(file.bytes, options, services.signal);
        return { success: true, data: [createExportFile('gcode.3mf', 'model.gcode.3mf', archive)], issues };
      }
      const model = await readTriangleMesh(file.bytes);
      const sliced =
        options.engine === 'service' && options.service !== undefined
          ? await sliceWithService({
              mesh: model,
              options: { ...options, service: options.service },
              signal: services.signal,
            })
          : await sliceReference({ mesh: model, options, signal: services.signal });
      // Both engines print one material: the whole model, recorded in its first colour.
      const bytes = writeBambuContainer({
        gcode: sliced.gcode,
        modelName: modelNameOf(file.name),
        plate: options.plate,
        ...(model.color === undefined ? {} : { filamentColors: [model.color] }),
        // What the reference engine sliced for, where Bambu Studio records it, so a printer's job checks can read it.
        // ponytail: the service is sent only placement, so its slice states none of these.
        ...(options.engine === 'reference'
          ? {
              printerModel: printerModels[options.machineProfile],
              nozzleDiameter: options.nozzleDiameter,
              filamentDiameters: [options.filamentDiameter],
              ...(options.filamentType === undefined ? {} : { filamentTypes: [options.filamentType] }),
            }
          : {}),
      });
      const reason =
        options.engine === 'service'
          ? 'The slicing service prints one material'
          : 'The reference engine prints one material';
      return {
        success: true,
        data: [createExportFile('gcode.3mf', 'model.gcode.3mf', bytes)],
        issues: model.parts.length > 1 ? [mergedColors(model, reason, options.engine)] : [],
      };
    } catch (error) {
      services.signal.throwIfAborted();
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
