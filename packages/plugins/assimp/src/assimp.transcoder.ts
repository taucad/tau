import { defineTranscoder } from '@taucad/runtime/transcoder';
import { lookupMimeType } from '@taucad/runtime/types';
import { conversionEdges, createAssimp } from 'libassimp';
import type { Assimp, ConversionEdge, ExportFormat, ExportOptionsFor } from 'libassimp';
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

const outputName = (name: string, format: TauAssimpRoute['to']): string =>
  format === 'step' ? name.replace(/\.stp$/u, '.step') : name;

/** Assimp-backed glTF/GLB mesh export transcoder. @public */
export const assimpTranscoder = defineTranscoder({
  id: 'assimp',
  name: 'AssimpTranscoder',
  version: '0.1.0',
  edges,

  async initialize() {
    return { assimp: await createAssimp() };
  },

  async transcode(input, runtime, context: AssimpTranscoderContext) {
    if (input.files.length === 0) {
      return {
        success: false,
        issues: [
          { message: 'No input files provided for transcoding', code: 'RUNTIME', type: 'runtime', severity: 'error' },
        ],
      };
    }

    try {
      runtime.logger.log(`Transcoding ${input.from} -> ${input.to}`);
      const { files } = await context.assimp.convert(
        input.files.map(({ name, bytes }) => ({ name, bytes })),
        {
          to: input.to,
          exportOptions: input.options as ExportOptionsFor<typeof input.to>,
        },
      );
      const output = files.map((file) => {
        const name = outputName(file.name, input.to);
        return {
          name,
          bytes: new Uint8Array(file.bytes),
          mimeType: lookupMimeType(name.split('.').pop() ?? ''),
        };
      });
      runtime.logger.log(`Successfully transcoded to ${input.to}`);
      return { success: true, data: output, issues: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcoding failed';
      return {
        success: false,
        issues: [{ message, code: 'RUNTIME', type: 'runtime', severity: 'error' }],
      };
    }
  },

  async cleanup(context) {
    context.assimp.dispose();
  },
});
