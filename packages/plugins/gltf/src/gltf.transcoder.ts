import { NodeIO } from '@gltf-transform/core';
import type { GLTF } from '@gltf-transform/core';

import { defineTranscoder } from '@taucad/runtime/transcoder';
import { createExportFile, lookupMimeType } from '@taucad/runtime/types';
import { allExtensions } from '@taucad/geometry-core';

import { dracoDependencies, loadDracoBackend } from '#draco-backend.js';
import type { DracoBackend } from '#draco-backend.js';

const edges = [
  { from: 'glb', to: 'gltf', fidelity: 'mesh' },
  { from: 'gltf', to: 'glb', fidelity: 'mesh' },
] as const;

/** Bidirectional GLB/glTF transcoder. @public */
export const gltfTranscoder = defineTranscoder({
  id: 'gltf',
  name: 'GltfTranscoder',
  version: '0.1.0',
  edges,

  async initialize() {
    return { draco: await loadDracoBackend() };
  },

  async transcode(input, _runtime, context: { draco: DracoBackend }) {
    try {
      const io = new NodeIO().registerExtensions(allExtensions).registerDependencies(dracoDependencies(context.draco));
      if (input.from === 'glb') {
        const document = await io.readBinary(input.files[0]!.bytes);
        const output = await io.writeJSON(document);
        const files = [
          createExportFile('gltf', 'model.gltf', new TextEncoder().encode(JSON.stringify(output.json, undefined, 2))),
          ...Object.entries(output.resources).map(([name, bytes]) => ({
            name,
            bytes: new Uint8Array(bytes),
            mimeType: lookupMimeType(name.slice(name.lastIndexOf('.') + 1)),
          })),
        ];
        return { success: true, data: files, issues: [] };
      }

      const jsonFile = input.files.find((file) => file.name.toLowerCase().endsWith('.gltf')) ?? input.files[0]!;
      const resources = Object.fromEntries(
        input.files.filter((file) => file !== jsonFile).map((file) => [file.name, file.bytes]),
      );
      const json = JSON.parse(new TextDecoder().decode(jsonFile.bytes)) as GLTF.IGLTF;
      const document = await io.readJSON({ json, resources });
      return {
        success: true,
        data: [createExportFile('glb', 'model.glb', await io.writeBinary(document))],
        issues: [],
      };
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
