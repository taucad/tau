import { mimeTypes } from '@taucad/types/constants';

/** A USDZ conversion that failed or returned something other than one USDZ file. */
export class UsdzTranscodeError extends Error {}

/**
 * Convert the viewer's GLB to USDZ for AR Quick Look, the way captures convert it to images: in a dedicated Assimp
 * runtime, never through a document export. An export would rebuild the model at full resolution beside the one on
 * screen, which a phone cannot afford. The runtime is terminated after every conversion, so Assimp's WebAssembly
 * heap goes with it.
 *
 * @param glb - The GLB the viewer shows: canonical glTF, Y up and metres, which is Assimp's source convention.
 * @returns The USDZ bytes.
 */
export async function transcodeGlbToUsdz(glb: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const [{ createUsdzClient }, { observeRuntimeClient }] = await Promise.all([
    import('#runtime/usdz-client-options.js'),
    import('#telemetry/runtime-telemetry.js'),
  ]);
  const client = await createUsdzClient();
  /* Runtime observability (FR-14): attached before `connect()`. */
  const stopObserving = observeRuntimeClient(client, 'quicklook');
  try {
    await client.connect();
    const result = await client.transcode({
      from: 'glb',
      to: 'usdz',
      files: [{ name: 'model.glb', bytes: glb, mimeType: 'model/gltf-binary' }],
      options: {},
    });
    if (!result.success) {
      throw new UsdzTranscodeError(result.issues[0]?.message ?? 'USDZ conversion failed');
    }

    const [file] = result.data;
    if (result.data.length !== 1 || !file?.name.endsWith('.usdz') || file.mimeType !== mimeTypes.usdz) {
      throw new UsdzTranscodeError(
        `USDZ conversion expected exactly one .usdz file (${mimeTypes.usdz}), received ${result.data.length}: ${result.data.map((each) => `${each.name} (${each.mimeType})`).join(', ')}`,
      );
    }

    return file.bytes;
  } finally {
    client.terminate();
    stopObserving();
  }
}
