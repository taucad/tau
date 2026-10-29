import { defineTranscoder } from '@taucad/runtime/transcoder';
import { lookupMimeType } from '@taucad/runtime/types';
import { AssimpError, conversionEdges, createAssimp } from 'libassimp';
import type { Assimp, ConversionEdge, ExportFormat, ExportOptionsFor } from 'libassimp';
import { z } from 'zod';
import { assimpEdgeSchemas, pointCloudExportOptions, tauSetExportOptions } from '#assimp-export-options.js';

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

type InputFile = Readonly<{ name: string; bytes: Uint8Array<ArrayBuffer> }>;

const gltfPointsMode = 0;
const glbMagic = 0x46_54_6c_67;
const glbJsonChunk = 0x4e_4f_53_4a;

/** The glTF JSON of a `.gltf` file or a GLB's first chunk, or `undefined` when the bytes are neither. */
const gltfJson = ({ name, bytes }: InputFile): unknown => {
  try {
    if (name.toLowerCase().endsWith('.gltf')) {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.byteLength < 20 || view.getUint32(0, true) !== glbMagic || view.getUint32(16, true) !== glbJsonChunk) {
      return undefined;
    }
    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true)))) as unknown;
  } catch {
    return undefined;
  }
};

/** Whether the model has primitives and every one of them draws points, so no mesh has faces or lines. */
const isPointCloud = (files: readonly InputFile[]): boolean => {
  const document = files.map((file) => gltfJson(file)).find((json) => json !== undefined) as
    | { meshes?: Array<{ primitives?: Array<{ mode?: number }> }> }
    | undefined;
  const primitives = document?.meshes?.flatMap((mesh) => mesh.primitives ?? []) ?? [];
  return primitives.length > 0 && primitives.every((primitive) => primitive.mode === gltfPointsMode);
};

/** The form options plus the hidden ones tau chooses for this model. */
const exportOptionsFor = (
  to: ExportFormat,
  formOptions: unknown,
  files: readonly InputFile[],
): ExportOptionsFor<typeof to> => {
  const options: Record<string, unknown> = {
    ...tauSetExportOptions[to],
    ...(formOptions as Record<string, unknown>),
    ...(isPointCloud(files) ? pointCloudExportOptions : {}),
  };
  return options as ExportOptionsFor<typeof to>;
};

/** The libassimp message, plus what to change when the failure comes from a setting or a size limit. */
const failureMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'Transcoding failed';
  if (error instanceof AssimpError && error.code === 'LIMIT_EXCEEDED') {
    return `${message} The model is too large to export here. Try a coarser tessellation.`;
  }
  if (/is not manifold and oriented/u.test(message)) {
    return `${message} The model has open or inconsistently oriented surfaces. Turn off Require manifold to export it anyway.`;
  }
  return message;
};

/** Assimp-backed glTF/GLB mesh export transcoder. @public */
export const assimpTranscoder = defineTranscoder({
  id: 'assimp',
  name: 'AssimpTranscoder',
  version: '0.1.2',
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
        exportOptions: exportOptionsFor(input.to, input.options, input.files),
        signal: services.signal,
      };
      const { files } = await context.assimp.convert(
        input.files.map(({ name, bytes }) => ({ name, bytes })),
        options,
      );
      const output = files.map(({ name, bytes }) => ({
        name,
        bytes: new Uint8Array(bytes),
        mimeType: lookupMimeType(name.split('.').pop() ?? ''),
      }));
      services.logger.log(`Successfully transcoded to ${input.to}`);
      return { success: true, data: output, issues: [] };
    } catch (error) {
      return {
        success: false,
        issues: [{ message: failureMessage(error), code: 'RUNTIME', type: 'runtime', severity: 'error' }],
      };
    }
  },

  async onDispose(context) {
    await context.assimp.dispose();
  },
});
