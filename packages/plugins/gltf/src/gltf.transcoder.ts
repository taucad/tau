import type { Document, GLTF, JSONDocument, PlatformIO } from '@gltf-transform/core';
import { DRACO_DEFAULTS, draco } from '@gltf-transform/functions';
import { defineTranscoder } from '@taucad/runtime/transcoder';
import {
  createExportFile,
  kittyCadBoundaryRepresentationExtension,
  lookupMimeType,
  tauCadTopologyExtension,
} from '@taucad/runtime/types';
import { z } from 'zod';

import { dracoExtensionName, loadDracoDecoder, loadDracoEncoder, usesDracoCompression } from '#draco-backend.js';
import { createFileResolverIo } from '#file-resolver-io.utils.js';

export const gltfTranscodeOptionsSchema = z
  .object({
    compression: z.enum(['none', 'draco']).default('none'),
    method: z.enum(['edgebreaker', 'sequential']).default(DRACO_DEFAULTS.method),
    encodeSpeed: z.number().int().min(0).max(10).default(DRACO_DEFAULTS.encodeSpeed),
    decodeSpeed: z.number().int().min(0).max(10).default(DRACO_DEFAULTS.decodeSpeed),
    quantizePosition: z.number().int().min(1).max(16).default(DRACO_DEFAULTS.quantizePosition),
    quantizeNormal: z.number().int().min(1).max(16).default(DRACO_DEFAULTS.quantizeNormal),
    quantizeColor: z.number().int().min(1).max(16).default(DRACO_DEFAULTS.quantizeColor),
    quantizeTexcoord: z.number().int().min(1).max(16).default(DRACO_DEFAULTS.quantizeTexcoord),
    quantizeGeneric: z.number().int().min(1).max(16).default(DRACO_DEFAULTS.quantizeGeneric),
    quantizationVolume: z.enum(['mesh', 'scene']).default(DRACO_DEFAULTS.quantizationVolume),
  })
  .strict();

const edges = [
  { from: 'glb', to: 'glb', fidelity: 'mesh', optionsSchema: gltfTranscodeOptionsSchema },
  { from: 'glb', to: 'gltf', fidelity: 'mesh', optionsSchema: gltfTranscodeOptionsSchema },
  { from: 'gltf', to: 'glb', fidelity: 'mesh', optionsSchema: gltfTranscodeOptionsSchema },
  { from: 'gltf', to: 'gltf', fidelity: 'mesh', optionsSchema: gltfTranscodeOptionsSchema },
] as const;

const hasTopologyMetadata = (document: Document): boolean => {
  if (
    document.hasExtension(tauCadTopologyExtension) ||
    document.hasExtension(kittyCadBoundaryRepresentationExtension)
  ) {
    return true;
  }
  return document
    .getRoot()
    .listMeshes()
    .some((mesh) =>
      mesh
        .listPrimitives()
        .some(
          (primitive) =>
            Object.hasOwn(primitive.getExtras(), 'faceGroups') || Object.hasOwn(primitive.getExtras(), 'edgeGroups'),
        ),
    );
};

const parseInput = async (input: {
  readonly from: 'glb' | 'gltf';
  readonly files: ReadonlyArray<{ readonly name: string; readonly bytes: Uint8Array<ArrayBuffer> }>;
}): Promise<{ readonly io: PlatformIO; readonly jsonDocument: JSONDocument }> => {
  const resources = Object.fromEntries(input.files.map(({ name, bytes }) => [name, bytes]));
  const io = createFileResolverIo({
    exists: (name) => Object.hasOwn(resources, name),
    readFile: (name) => {
      const bytes = resources[name];
      if (bytes === undefined) {
        throw new Error(`Missing glTF resource: ${name}`);
      }
      return bytes;
    },
  });
  if (input.from === 'glb') {
    return { io, jsonDocument: await io.binaryToJSON(input.files[0]!.bytes) };
  }

  const jsonFile = input.files.find((file) => file.name.toLowerCase().endsWith('.gltf')) ?? input.files[0]!;
  const jsonResources = Object.fromEntries(
    input.files.filter((file) => file !== jsonFile).map((file) => [file.name, file.bytes]),
  );
  const json = JSON.parse(new TextDecoder().decode(jsonFile.bytes)) as GLTF.IGLTF;
  return { io, jsonDocument: { json, resources: jsonResources } };
};

const writeGltf = async (io: PlatformIO, document: Document) => {
  const output = await io.writeJSON(document);
  return [
    createExportFile('gltf', 'model.gltf', new TextEncoder().encode(JSON.stringify(output.json, undefined, 2))),
    ...Object.entries(output.resources).map(([name, bytes]) => ({
      name,
      bytes: new Uint8Array(bytes),
      mimeType: lookupMimeType(name.slice(name.lastIndexOf('.') + 1)),
    })),
  ];
};

/** Bidirectional GLB/glTF transcoder with opt-in Draco compression. @public */
export const gltfTranscoder = defineTranscoder({
  id: 'gltf',
  name: 'GltfTranscoder',
  version: '0.1.0',
  edges,

  async initialize() {
    return {};
  },

  async transcode(input) {
    if (input.files.length === 0) {
      return {
        success: false,
        issues: [
          { message: 'No input files provided for transcoding', code: 'RUNTIME', type: 'runtime', severity: 'error' },
        ],
      };
    }

    try {
      const { io, jsonDocument } = await parseInput(input);
      if (usesDracoCompression(jsonDocument.json)) {
        io.registerDependencies({ 'draco3d.decoder': await loadDracoDecoder() });
      }
      const document = await io.readJSON(jsonDocument);
      document.disposeExtension(dracoExtensionName);

      const { compression, ...dracoOptions } = input.options;
      if (compression === 'draco') {
        if (hasTopologyMetadata(document)) {
          return {
            success: false,
            issues: [
              {
                message: 'Draco compression cannot preserve Tau CAD topology metadata. Export without topology.',
                code: 'RUNTIME_CONTENT_UNSUPPORTED',
                type: 'runtime',
                severity: 'error',
                details: { operation: 'transcode', content: 'includeTopology', codec: 'draco' },
              },
            ],
          };
        }
        await document.transform(draco(dracoOptions));
        io.registerDependencies({ 'draco3d.encoder': await loadDracoEncoder() });
      }

      return input.to === 'glb'
        ? { success: true, data: [createExportFile('glb', 'model.glb', await io.writeBinary(document))], issues: [] }
        : { success: true, data: await writeGltf(io, document), issues: [] };
    } catch (error) {
      return {
        success: false,
        issues: [
          {
            message: error instanceof Error ? error.message : 'glTF transcoding failed',
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
          },
        ],
      };
    }
  },
});
