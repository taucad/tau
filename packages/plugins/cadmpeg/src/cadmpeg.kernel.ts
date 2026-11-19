import {
  coordinateSystemSchema,
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  unitSchema,
} from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';
import { loadOcctBackend, meshOcctFile } from '@taucad/brep/occt';
import type { OcctBackend } from '@taucad/brep/occt';
import { createImportFileInventory, normalizeGltfGeometryNames, transformGltfExportBytes } from '@taucad/geometry-core';
import type { Cadmpeg } from 'cadmpeg-ts/core';

import { openCadmpeg } from '#cadmpeg-converter.js';
import { cadmpegOptionsSchema, CadmpegEngineError, engineIssue } from '#cadmpeg-engines.js';
import { failureMessage, lossIssue } from '#cadmpeg-issues.js';

/**
 * The native formats this kernel claims: cadmpeg's headline level L2 and above
 * (charter D10, Q6). NX and Creo `.prt` (L1) wait for upstream; STEP, IGES and
 * USD stay with their existing kernels (D5).
 */
const extensions = [
  'sldprt',
  'catpart',
  'ipt',
  'iam',
  'f3d',
  'f3z',
  'fcstd',
  '3dm',
  'sat',
  'sab',
  'smt',
  'smb',
  'pvz',
] as const;

const glbOptionsSchema = coordinateSystemSchema
  .extend(unitSchema.shape)
  .extend({
    coordinateSystem: coordinateSystemSchema.shape.coordinateSystem.default('y-up'),
  })
  .strict();

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

type CadmpegKernelContext = { cadmpeg: Cadmpeg; occt: OcctBackend };

/**
 * Native CAD import kernel: cadmpeg converts the file to STEP, and OCCT meshes
 * the STEP in the same worker (charter D6). Every loss cadmpeg reports becomes
 * a warning issue (D7).
 *
 * @public
 */
export const cadmpegKernel = defineKernel({
  id: 'cadmpeg',
  extensions: [...extensions],
  name: 'CadmpegKernel',
  // Bumps with every cadmpeg-ts release that can change output bytes (D8).
  version: '0.1.0',
  optionsSchema: cadmpegOptionsSchema,
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
  exports: {
    glb: { title: 'glTF binary', mimeType: 'model/gltf-binary', extension: 'glb', optionsSchema: glbOptionsSchema },
  },

  async initialize(options): Promise<CadmpegKernelContext> {
    // A browser realm without `engines` refuses before OCCT loads.
    const cadmpeg = await openCadmpeg(options.engines);
    const occt = await loadOcctBackend();
    return { cadmpeg, occt };
  },

  async resolve({ entryPath }, { filesystem }) {
    const inventory = await createImportFileInventory(filesystem, entryPath);
    return { resolved: [...inventory.resolved], unresolved: [...inventory.unresolved] };
  },

  async describe() {
    return createKernelSuccess({
      parameters: createKernelParameterDeclaration(
        {},
        { type: 'object', properties: {}, additionalProperties: false },
        { id: 'urn:taucad:cadmpeg:parameters', name: 'CadmpegParameters' },
      ),
    });
  },

  async evaluate({ entryPath }, { filesystem, signal }, context: CadmpegKernelContext) {
    const inventory = await createImportFileInventory(filesystem, entryPath);
    const name = basename(entryPath);
    let step;
    try {
      step = await context.cadmpeg.convert({ name, bytes: inventory.entryBytes }, { to: 'step', signal });
    } catch (error) {
      const issue = engineIssue(error, 'KERNEL_BINDING_FAILED');
      if (issue !== undefined) {
        throw new CadmpegEngineError(issue, { cause: error });
      }
      throw new Error(failureMessage(error), { cause: error });
    }
    const [file] = step.files;
    if (file === undefined) {
      throw new Error(`cadmpeg wrote no STEP for ${name}`);
    }
    const glb = await meshOcctFile(context.occt, {
      name: `${name}.step`,
      bytes: new Uint8Array(file.bytes),
      format: 'step',
    });
    const normalized = await normalizeGltfGeometryNames(glb, {
      format: 'glb',
      rewriteLegacyGeneratedShapeNames: true,
      materialNamePolicy: 'clear-generated',
      materialNameSource: 'external-generated',
      sceneNamePolicy: 'clear-generated',
      sceneNameSource: 'external-generated',
    });
    return { handle: normalized, issues: step.losses.map((loss) => lossIssue(loss)) };
  },

  async render({ handle }) {
    return { content: handle };
  },

  async export(input) {
    if (input.handle.length === 0) {
      throw new Error('No geometry available for export.');
    }
    const bytes = await transformGltfExportBytes(input.handle, {
      format: 'glb',
      coordinateSystem: input.options.coordinateSystem,
      unit: input.options.unit,
    });
    return { files: [createExportFile('glb', 'model.glb', bytes)] };
  },

  serializeHandle: ({ handle }) => new Uint8Array(handle),
  deserializeHandle: ({ serialized }) => new Uint8Array(serialized),

  observedHeapBytes: (context: CadmpegKernelContext) => context.occt.HEAPU8.byteLength,
});
