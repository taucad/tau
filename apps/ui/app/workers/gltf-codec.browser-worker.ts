import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { TranscoderRuntime } from '@taucad/runtime/transcoder';
import type { ExportFile } from '@taucad/runtime/types';
import { gltfTranscoder } from '@taucad/gltf';

const noop = () => undefined;
const runtime: TranscoderRuntime = {
  logger: { log: noop, debug: noop, trace: noop, warn: noop, error: noop, custom: noop },
  tracer: { startSpan: () => ({ end: noop, setAttribute: noop, addEvent: noop }) },
  signal: new AbortController().signal,
};

const extensionDeclarations = (bytes: Uint8Array<ArrayBuffer>): readonly string[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
    extensionsRequired?: string[];
    extensionsUsed?: string[];
  };
  return [...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])];
};

const run = async () => {
  const definition = await resolveRuntimePluginDefinition('transcoder', gltfTranscoder());
  const context = await definition.initialize({}, runtime);
  const optionsSchema = definition.edges[0]?.optionsSchema;
  if (optionsSchema === undefined) {
    throw new Error('glTF transcoder options schema is missing');
  }
  const options = (compression: 'none' | 'draco'): Record<string, unknown> =>
    optionsSchema.parse({ compression }) as Record<string, unknown>;
  const response = await fetch(new URL('../../../../packages/plugins/gltf/src/fixtures/cube.glb', import.meta.url));
  if (!response.ok) {
    throw new Error(`Failed to load the plain GLB fixture: ${response.status}`);
  }
  const input = {
    name: 'cube.glb',
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType: 'model/gltf-binary',
  } satisfies ExportFile;
  const compressed = await definition.transcode(
    {
      from: 'glb',
      to: 'glb',
      files: [input],
      options: options('draco'),
    },
    runtime,
    context,
  );
  if (!compressed.success) {
    throw new Error(compressed.issues.map(({ message }) => message).join('\n'));
  }
  const plain = await definition.transcode(
    {
      from: 'glb',
      to: 'glb',
      files: compressed.data,
      options: options('none'),
    },
    runtime,
    context,
  );
  if (!plain.success) {
    throw new Error(plain.issues.map(({ message }) => message).join('\n'));
  }

  const extension = 'KHR_draco_mesh_compression';
  self.postMessage({
    compressedDeclaresDraco: extensionDeclarations(compressed.data[0]!.bytes).filter((name) => name === extension)
      .length,
    plainDeclaresDraco: extensionDeclarations(plain.data[0]!.bytes).includes(extension),
    plainBytes: plain.data[0]!.bytes.byteLength,
  });
};

try {
  await run();
} catch (error) {
  self.postMessage({ error: error instanceof Error ? error.message : String(error) });
}
