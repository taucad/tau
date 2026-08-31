import type { ShareArtifactCodec, ShareOpenedArtifact, SharePlainArtifact, ShareProtectedArtifact } from '#artifact.js';
import type { ShareProjectSnapshot } from '#snapshot.js';

type WorkerCommand =
  | { readonly operation: 'pack'; readonly snapshot: ShareProjectSnapshot }
  | { readonly operation: 'openArchive'; readonly archive: Uint8Array<ArrayBuffer> }
  | { readonly operation: 'openPlain'; readonly encodedArchive: string }
  | { readonly operation: 'sealWithPassword'; readonly snapshot: ShareProjectSnapshot; readonly password: string }
  | { readonly operation: 'openWithPassword'; readonly compactJwe: string; readonly password: string };

type WorkerResponse =
  | {
      readonly id: number;
      readonly success: true;
      readonly result: SharePlainArtifact | ShareProtectedArtifact | ShareOpenedArtifact;
    }
  | { readonly id: number; readonly success: false; readonly code?: string; readonly message: string };

/** Worker-backed artifact codec with explicit cleanup. @public */
export type ShareArtifactWorkerCodec = ShareArtifactCodec & {
  readonly dispose: () => void;
};

/** Create a dedicated worker-backed portable artifact codec. @public */
export const createShareArtifactWorkerCodec = (): ShareArtifactWorkerCodec => {
  const worker = new Worker(new URL('artifact.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<
    number,
    {
      readonly resolve: (value: SharePlainArtifact | ShareProtectedArtifact | ShareOpenedArtifact) => void;
      readonly reject: (error: Error) => void;
      readonly cleanup: () => void;
    }
  >();
  let nextId = 0;
  let disposed = false;
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const slot = pending.get(event.data.id);
    if (!slot) {
      return;
    }
    pending.delete(event.data.id);
    slot.cleanup();
    if (event.data.success) {
      slot.resolve(event.data.result);
      return;
    }
    slot.reject(Object.assign(new Error(event.data.message), event.data.code ? { code: event.data.code } : {}));
  });
  const call = async (
    request: WorkerCommand,
    signal?: AbortSignal,
  ): Promise<SharePlainArtifact | ShareProtectedArtifact | ShareOpenedArtifact> => {
    if (disposed) {
      throw new Error('The share artifact worker has been disposed.');
    }
    signal?.throwIfAborted();
    const id = ++nextId;
    const result = Promise.withResolvers<SharePlainArtifact | ShareProtectedArtifact | ShareOpenedArtifact>();
    const abort = (): void => {
      const slot = pending.get(id);
      if (!slot) {
        return;
      }
      pending.delete(id);
      slot.cleanup();
      slot.reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    const cleanup = (): void => signal?.removeEventListener('abort', abort);
    pending.set(id, { ...result, cleanup });
    signal?.addEventListener('abort', abort, { once: true });
    if (request.operation === 'pack' || request.operation === 'sealWithPassword') {
      const snapshot = {
        ...request.snapshot,
        files: request.snapshot.files.map((file) => ({ ...file, content: new Uint8Array(file.content) })),
      };
      worker.postMessage(
        { ...request, snapshot, id },
        snapshot.files.map(({ content }) => content.buffer),
      );
    } else if (request.operation === 'openArchive') {
      const archive = new Uint8Array(request.archive);
      worker.postMessage({ ...request, archive, id }, [archive.buffer]);
    } else {
      worker.postMessage({ ...request, id });
    }
    return result.promise;
  };
  return {
    pack: async (snapshot, signal) => (await call({ operation: 'pack', snapshot }, signal)) as SharePlainArtifact,
    openArchive: async (archive, signal) =>
      (await call({ operation: 'openArchive', archive }, signal)) as ShareOpenedArtifact,
    openPlain: async (encodedArchive, signal) =>
      (await call({ operation: 'openPlain', encodedArchive }, signal)) as ShareOpenedArtifact,
    sealWithPassword: async (snapshot, password, signal) =>
      (await call({ operation: 'sealWithPassword', snapshot, password }, signal)) as ShareProtectedArtifact,
    openWithPassword: async (input, signal) =>
      (await call({ operation: 'openWithPassword', ...input }, signal)) as ShareOpenedArtifact,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      worker.terminate();
      for (const slot of pending.values()) {
        slot.cleanup();
        slot.reject(new Error('The share artifact worker was disposed.'));
      }
      pending.clear();
    },
  };
};
