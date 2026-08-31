import { shareArtifactCodec } from '#artifact.js';
import type { ShareProjectSnapshot } from '#snapshot.js';

type WorkerRequest =
  | { readonly id: number; readonly operation: 'pack'; readonly snapshot: ShareProjectSnapshot }
  | { readonly id: number; readonly operation: 'openArchive'; readonly archive: Uint8Array<ArrayBuffer> }
  | { readonly id: number; readonly operation: 'openPlain'; readonly encodedArchive: string }
  | {
      readonly id: number;
      readonly operation: 'sealWithPassword';
      readonly snapshot: ShareProjectSnapshot;
      readonly password: string;
    }
  | {
      readonly id: number;
      readonly operation: 'openWithPassword';
      readonly compactJwe: string;
      readonly password: string;
    };

const workerScope = globalThis as unknown as {
  readonly addEventListener: (type: 'message', listener: (event: MessageEvent<WorkerRequest>) => Promise<void>) => void;
  readonly postMessage: (message: unknown, transfers?: Transferable[]) => void;
};

workerScope.addEventListener('message', async (event) => {
  const request = event.data;
  try {
    let result;
    switch (request.operation) {
      case 'pack': {
        result = await shareArtifactCodec.pack(request.snapshot);
        break;
      }
      case 'openPlain': {
        result = await shareArtifactCodec.openPlain(request.encodedArchive);
        break;
      }
      case 'openArchive': {
        result = await shareArtifactCodec.openArchive(request.archive);
        break;
      }
      case 'sealWithPassword': {
        result = await shareArtifactCodec.sealWithPassword(request.snapshot, request.password);
        break;
      }
      case 'openWithPassword': {
        result = await shareArtifactCodec.openWithPassword({
          compactJwe: request.compactJwe,
          password: request.password,
        });
        break;
      }
    }
    const transfers =
      'files' in result
        ? [result.archive.buffer, ...result.files.map(({ content }) => content.buffer)]
        : [result.archive.buffer];
    workerScope.postMessage({ id: request.id, success: true, result }, transfers);
  } catch (error) {
    const safe = error instanceof Error ? error : new Error('The share artifact operation failed.');
    workerScope.postMessage({
      id: request.id,
      success: false,
      message: safe.message,
      ...('code' in safe && typeof safe.code === 'string' ? { code: safe.code } : {}),
    });
  }
});
