import type { KernelServices } from '@taucad/runtime/kernel';
import { PicogkBrowserSession } from '#picogk-browser-session.js';
import type { PicogkBrowserSessionOptions, PicogkBrowserSnapshot } from '#picogk-browser-session.js';
import { createPicogkBrowserSnapshot } from '#picogk-browser-snapshot.js';
import type { PicogkKernelContext } from '#picogk-kernel-definition.js';

const superseded = (): DOMException => new DOMException('The PicoGK browser operation was superseded.', 'AbortError');

/**
 * Bind the shared kernel to authorized browser snapshots and a generation-owned worker.
 * @internal
 * @param options - Prepared asset identity and worker lifecycle bounds.
 * @returns Resources consumed by the shared kernel definition.
 */
export const createPicogkBrowserContext = (options: PicogkBrowserSessionOptions): PicogkKernelContext => {
  let session = new PicogkBrowserSession(options);
  let currentOperation: KernelServices['operationId'] | undefined;
  let current: Promise<PicogkBrowserSnapshot> | undefined;
  let disposed = false;
  const isDisposed = (): boolean => disposed;
  const receipts = new WeakMap<
    // oxlint-disable-next-line typescript/no-restricted-types -- WeakMap accepts any object identity, including schema-validated generic results without an index signature.
    object,
    {
      owner: PicogkBrowserSession;
      snapshot: PicogkBrowserSnapshot;
      signal: AbortSignal;
      operationId: KernelServices['operationId'];
    }
  >();
  return {
    artifactPath: '/artifacts',
    mirror: {
      async sync(services) {
        services.signal.throwIfAborted();
        if (isDisposed()) {
          throw superseded();
        }
        if (currentOperation !== services.operationId || !current) {
          currentOperation = services.operationId;
          current = createPicogkBrowserSnapshot({
            filesystem: services.filesystem,
            contents: services.fileContentCache,
            signal: services.signal,
          });
        }
        const pending = current;
        const snapshot = await pending;
        services.signal.throwIfAborted();
        if (isDisposed() || current !== pending) {
          throw superseded();
        }
        return snapshot.files.map((file) => file.path);
      },
      async cleanup() {
        disposed = true;
        current = undefined;
      },
    },
    session: {
      async request(request) {
        request.signal.throwIfAborted();
        if (isDisposed() || currentOperation !== request.operationId || !current) {
          throw superseded();
        }
        const pending = current;
        const snapshot = await pending;
        if (isDisposed() || current !== pending) {
          throw superseded();
        }
        const owner = session;
        const result = await owner.request({ ...request, snapshot });
        if (isDisposed() || current !== pending || owner !== session) {
          throw superseded();
        }
        if (request.method === 'build' && typeof result === 'object' && result !== null) {
          const receipt = { owner, snapshot, signal: request.signal, operationId: request.operationId };
          receipts.set(result, receipt);
          if ('authoredOutputs' in result && Array.isArray(result.authoredOutputs)) {
            const outputs: readonly unknown[] = result.authoredOutputs;
            for (const output of outputs) {
              if (typeof output === 'object' && output !== null) {
                receipts.set(output, receipt);
              }
            }
          }
        }
        return result;
      },
      async readArtifact(artifact) {
        const receipt = receipts.get(artifact);
        if (!receipt || receipt.owner !== session || receipt.operationId !== currentOperation || isDisposed()) {
          throw superseded();
        }
        receipts.delete(artifact);
        const bytes = await session.readArtifact({ ...receipt, artifact });
        if (receipt.owner !== session || receipt.operationId !== currentOperation || isDisposed()) {
          throw superseded();
        }
        return bytes;
      },
      async recycle() {
        session.cleanup();
        session = new PicogkBrowserSession(options);
      },
      async sampleResident() {
        return undefined;
      },
      async cleanup() {
        disposed = true;
        current = undefined;
        session.cleanup();
      },
    },
  };
};
