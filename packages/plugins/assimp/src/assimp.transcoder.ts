import { defineTranscoder } from '@taucad/runtime/transcoder';
import { lookupMimeType } from '@taucad/runtime/types';
import { conversionEdges, createAssimp } from 'libassimp';
import type { Assimp, ConversionEdge, ExportFormat, ExportOptionsFor } from 'libassimp';
import { z } from 'zod';
import { assimpEdgeSchemas } from '#assimp-export-options.js';

type TauAssimpRoute = Extract<ConversionEdge, { from: 'glb' | 'gltf'; to: Exclude<ExportFormat, 'assjson'> }>;

type AssimpTranscoderContext = { assimp: Assimp };

type TauAssimpEdge<Edge extends TauAssimpRoute = TauAssimpRoute> = Edge extends TauAssimpRoute
  ? Readonly<{
      from: Edge['from'];
      to: Edge['to'];
      fidelity: 'mesh';
      optionsSchema: (typeof assimpEdgeSchemas)[Edge['to']];
      sourceOptions: typeof specNativeGltfSource;
    }>
  : never;

const isTauAssimpRoute = (edge: ConversionEdge): edge is TauAssimpRoute =>
  (edge.from === 'glb' || edge.from === 'gltf') && edge.to !== 'assjson';

const specNativeGltfSource = {
  coordinateSystem: 'y-up',
  unit: { length: 'meter' },
} as const;

const toTauEdge = <Edge extends TauAssimpRoute>(edge: Edge): TauAssimpEdge<Edge> =>
  ({
    ...edge,
    fidelity: 'mesh',
    optionsSchema: assimpEdgeSchemas[edge.to],
    sourceOptions: specNativeGltfSource,
  }) as unknown as TauAssimpEdge<Edge>;

const edges: readonly TauAssimpEdge[] = conversionEdges
  .filter((edge) => isTauAssimpRoute(edge))
  .map((edge) => toTauEdge(edge));

const assimpTranscoderOptionsSchema = z
  .object({ backend: z.enum(['auto', 'native', 'wasm']).default('auto') })
  .strict();

const outputName = (name: string, format: TauAssimpRoute['to']): string =>
  format === 'step' ? name.replace(/\.stp$/u, '.step') : name;

/** Assimp-backed glTF/GLB mesh export transcoder. @public */
export const assimpTranscoder = defineTranscoder({
  id: 'assimp',
  name: 'AssimpTranscoder',
  version: '0.1.0',
  edges,
  optionsSchema: assimpTranscoderOptionsSchema,

  async initialize({ backend }, services) {
    const assimp = await createAssimp({
      backend,
      onLog: ({ cause, level, message }) => {
        services.logger.custom(level === 'warning' ? 'warn' : level, message, { data: cause });
      },
    });
    services.logger.log(`libassimp backend=${assimp.backend} addon=${assimp.buildIdentity ?? 'none'}`);
    return { assimp };
  },

  async transcode(input, services, context: AssimpTranscoderContext) {
    if (input.files.length === 0) {
      return {
        success: false,
        issues: [
          { message: 'No input files provided for transcoding', code: 'RUNTIME', type: 'runtime', severity: 'error' },
        ],
      };
    }

    try {
      services.logger.log(`Transcoding ${input.from} -> ${input.to}`);
      const options = {
        to: input.to,
        exportOptions: input.options as ExportOptionsFor<typeof input.to>,
        signal: services.signal,
      };
      const { files } = await context.assimp.convert(
        input.files.map(({ name, bytes }) => ({ name, bytes })),
        options,
      );
      const output = files.map((file) => {
        const name = outputName(file.name, input.to);
        return {
          name,
          bytes: new Uint8Array(file.bytes),
          mimeType: lookupMimeType(name.split('.').pop() ?? ''),
        };
      });
      services.logger.log(`Successfully transcoded to ${input.to}`);
      return { success: true, data: output, issues: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcoding failed';
      return {
        success: false,
        issues: [{ message, code: 'RUNTIME', type: 'runtime', severity: 'error' }],
      };
    }
  },

  async onDispose(context) {
    context.assimp.dispose();
  },
});
