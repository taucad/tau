import { mimeTypes } from '@taucad/types/constants';
import type { usdzRuntime } from '#runtime/usdz-runtime.definition.js';
import { loadCode } from '@taucad/ui-core/lib/code-loading';
import { createModuleWorker } from '@taucad/ui-core/lib/worker-factory';

/** A USDZ conversion that failed or returned something other than one USDZ file. */
export class UsdzTranscodeError extends Error {}

/**
 * Convert the viewer's GLB to USDZ for AR Quick Look, the way captures convert it to images: in a dedicated Assimp
 * worker, never through a document export. An export would rebuild the model at full resolution beside the one on
 * screen, which a phone cannot afford. The worker is terminated after every conversion, so Assimp's WebAssembly
 * heap goes with it.
 *
 * @param glb - The GLB the viewer shows: canonical glTF, Y up and metres, which is Assimp's source convention.
 * @returns The USDZ bytes.
 */
export async function transcodeGlbToUsdz(glb: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const [{ createRuntimeClient }, { webWorkerTransport }, { fromMemoryFs }, { observeRuntimeClient }] =
    await Promise.all([
      loadCode(async () => import('@taucad/runtime/client')),
      loadCode(async () => import('@taucad/runtime/transport/web')),
      loadCode(async () => import('@taucad/runtime/filesystem')),
      loadCode(async () => import('#telemetry/runtime-telemetry.js')),
    ]);
  const client = createRuntimeClient<typeof usdzRuntime>({
    transport: webWorkerTransport({
      createWorker: () =>
        createModuleWorker(
          () =>
            new Worker(new URL('../../runtime/usdz-runtime.worker.ts', import.meta.url), {
              name: 'tau-ar-usdz-transcoder-worker',
              type: 'module',
            }),
          { name: 'usdz-runtime' },
        ),
      fileSystem: fromMemoryFs(),
    }),
  });
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
