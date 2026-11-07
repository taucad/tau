/**
 * The import channel between the page and the file-manager worker (charter D12).
 *
 * The page hands the worker its source by reference — a dropped zip `File`, a
 * folder's `File`s with their paths, a picked directory handle — and never
 * reads a byte of it. The worker plans the import (the zip's central
 * directory by range, the folder's listing, the path policy and the limits),
 * answers the review screen with paths and sizes, and on confirm stages the
 * entries into `<root>/.tau-staging/import-<operation>/`: each one decoded and
 * digested on the compute worker, written once, recorded in the staging
 * ledger. The project is then committed from that staging by the ordinary
 * pending-create journal, which carries the staging locator, not the bytes.
 *
 * @module
 */

import {
  directoryHandleImportSource,
  discardStagedImport,
  fileListImportSource,
  isImportRefusal,
  planImport,
  stageImport,
  zipImportSource,
} from '@taucad/filesystem/importer';
import type {
  ImportDecoder,
  ImportPlan,
  ImportRefusalReason,
  ImportSource,
  ImportStagingPort,
  ImportStagingProgress,
} from '@taucad/filesystem/importer';
import type { PathPolicy, StorageRootConfig } from '@taucad/filesystem';

/** The message type the file-manager worker answers with an import channel. */
export const importConnectMessageType = 'importConnect';

/**
 * A source as the page hands it over: references only.
 *
 * @public
 */
export type ImportSourceDescriptor =
  | Readonly<{ kind: 'zip'; file: File }>
  | Readonly<{ kind: 'files'; files: ReadonlyArray<Readonly<{ file: File; path: string }>>; name?: string }>
  | Readonly<{ kind: 'directory'; handle: FileSystemDirectoryHandle }>;

/**
 * What the review screen shows: a name, every kept path with its size, and
 * what was left behind. No bytes.
 *
 * @public
 */
export type ImportListing = Readonly<{
  name: string;
  files: ReadonlyArray<Readonly<{ path: string; size: number }>>;
  bytes: number;
  skipped: ImportPlan['skipped'];
}>;

/**
 * The page's half of one import.
 *
 * @public
 */
export type ImportSession = Readonly<{
  /** Plan a source. Replaces any earlier plan of this session. */
  plan: (source: ImportSourceDescriptor) => Promise<ImportListing>;
  /** Stage the planned source on a durable storage root, resuming a staging of the same source. */
  stage: (
    operationId: string,
    scope: StorageRootConfig,
    onProgress?: (progress: ImportStagingProgress) => void,
  ) => Promise<Readonly<{ files: number; bytes: number }>>;
  /** The bytes of some planned files, for the review's preview, up to a byte budget. */
  preview: (
    paths: readonly string[],
    maximumBytes: number,
  ) => Promise<Record<string, { content: Uint8Array<ArrayBuffer> }>>;
  /** Remove a staging that will not be committed. */
  discard: (operationId: string, scope: StorageRootConfig) => Promise<void>;
  /** Stop whatever runs and close the channel. */
  close: () => void;
}>;

type Request =
  | Readonly<{ id: number; type: 'plan'; source: ImportSourceDescriptor }>
  | Readonly<{ id: number; type: 'stage'; operationId: string; scope: StorageRootConfig }>
  | Readonly<{ id: number; type: 'preview'; paths: readonly string[]; maximumBytes: number }>
  | Readonly<{ id: number; type: 'discard'; operationId: string; scope: StorageRootConfig }>
  | Readonly<{ id: number; type: 'cancel' }>;

type Answer = Readonly<{
  id: number;
  progress?: ImportStagingProgress;
  result?: unknown;
  error?: Readonly<{ message: string; reason?: ImportRefusalReason }>;
}>;

/**
 * An import the worker refused, with the policy's reason when it had one.
 *
 * @public
 */
export class ImportChannelError extends Error {
  public override readonly name = 'ImportChannelError';

  /** The policy's reason, when the limits or path policy refused. */
  public readonly reason: ImportRefusalReason | undefined;

  /**
   * Carry a worker's refusal to the page.
   *
   * @param message - The worker's sentence.
   * @param reason - The policy's reason, when there is one.
   */
  public constructor(message: string, reason?: ImportRefusalReason) {
    super(message);
    this.reason = reason;
  }
}

const sourceOf = (descriptor: ImportSourceDescriptor): ImportSource => {
  switch (descriptor.kind) {
    case 'zip': {
      return zipImportSource(descriptor.file);
    }
    case 'files': {
      return fileListImportSource(descriptor.files, descriptor.name === undefined ? {} : { name: descriptor.name });
    }
    case 'directory': {
      return directoryHandleImportSource(descriptor.handle);
    }
  }
};

/**
 * Serve one import channel in the file-manager worker.
 *
 * @param port - The page's channel.
 * @param dependencies - The staging port of a storage root, the compute
 *   worker's decode, and the path policy the project classifies with.
 * @public
 */
export const serveImportChannel = (
  port: MessagePort,
  dependencies: Readonly<{
    importStaging: (scope: StorageRootConfig) => Promise<ImportStagingPort>;
    decode: ImportDecoder;
    policy: PathPolicy;
  }>,
): void => {
  let plan: ImportPlan | undefined;
  let abort = new AbortController();
  const answer = (message: Answer, transfer: Transferable[] = []): void => {
    port.postMessage(message, transfer);
  };
  const run = async (request: Request): Promise<void> => {
    switch (request.type) {
      case 'plan': {
        plan = await planImport(sourceOf(request.source), { policy: dependencies.policy, signal: abort.signal });
        answer({
          id: request.id,
          result: {
            name: plan.name,
            files: plan.entries.map(({ path, size }) => ({ path, size })),
            bytes: plan.bytes,
            skipped: plan.skipped,
          } satisfies ImportListing,
        });
        return;
      }
      case 'stage': {
        if (plan === undefined) {
          throw new Error('Nothing is planned to stage.');
        }
        const staged = await stageImport({
          port: await dependencies.importStaging(request.scope),
          operationId: request.operationId,
          plan,
          decode: dependencies.decode,
          signal: abort.signal,
          onProgress: (progress) => {
            answer({ id: request.id, progress });
          },
        });
        answer({ id: request.id, result: { files: staged.entries.length, bytes: staged.bytes } });
        return;
      }
      case 'preview': {
        const wanted = new Set(request.paths);
        const files: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
        let budget = request.maximumBytes;
        for (const entry of plan?.entries ?? []) {
          if (wanted.has(entry.path) && entry.size <= budget) {
            budget -= entry.size;
            // oxlint-disable-next-line no-await-in-loop -- a preview decodes its few files one after another.
            const decoded = await dependencies.decode(entry.request);
            files[entry.path] = { content: decoded.data };
          }
        }
        answer(
          { id: request.id, result: files },
          Object.values(files).map(({ content }) => content.buffer),
        );
        return;
      }
      case 'discard': {
        await discardStagedImport(await dependencies.importStaging(request.scope), request.operationId);
        answer({ id: request.id, result: undefined });
        return;
      }
      case 'cancel': {
        abort.abort(new Error('The import was cancelled.'));
        abort = new AbortController();
        answer({ id: request.id, result: undefined });
      }
    }
  };
  port.addEventListener('message', (event: MessageEvent<Request>) => {
    const request = event.data;
    // async-iife: bootstrap -- every outcome is answered on the port, so nothing rejects unobserved.
    void (async (): Promise<void> => {
      try {
        await run(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const reason = isImportRefusal(error) ? (error as { reason?: ImportRefusalReason }).reason : undefined;
        answer({ id: request.id, error: { message, ...(reason === undefined ? {} : { reason }) } });
      }
    })();
  });
  port.start();
};

/**
 * Open an import channel to the file-manager worker.
 *
 * @param worker - The file-manager worker.
 * @returns The page's half of the session.
 * @public
 */
export const openImportSession = (worker: Pick<Worker, 'postMessage'>): ImportSession => {
  const channel = new MessageChannel();
  worker.postMessage({ type: importConnectMessageType, port: channel.port1 }, [channel.port1]);
  const { port2: port } = channel;
  let next = 0;
  const waiting = new Map<
    number,
    Readonly<{ call: PromiseWithResolvers<unknown>; onProgress?: (progress: ImportStagingProgress) => void }>
  >();
  port.addEventListener('message', (event: MessageEvent<Answer>) => {
    const { id, progress, result, error } = event.data;
    const held = waiting.get(id);
    if (held === undefined) {
      return;
    }
    if (progress !== undefined) {
      held.onProgress?.(progress);
      return;
    }
    waiting.delete(id);
    if (error === undefined) {
      held.call.resolve(result);
    } else {
      held.call.reject(new ImportChannelError(error.message, error.reason));
    }
  });
  port.start();
  const ask = async <Result>(
    request: Request extends infer Each ? (Each extends { id: number } ? Omit<Each, 'id'> : never) : never,
    onProgress?: (progress: ImportStagingProgress) => void,
  ): Promise<Result> => {
    const id = next;
    next += 1;
    const call = Promise.withResolvers<unknown>();
    waiting.set(id, { call, ...(onProgress === undefined ? {} : { onProgress }) });
    port.postMessage({ ...request, id });
    return call.promise as Promise<Result>;
  };
  return Object.freeze({
    plan: async (source) => ask<ImportListing>({ type: 'plan', source }),
    stage: async (operationId, scope, onProgress) =>
      ask<{ files: number; bytes: number }>({ type: 'stage', operationId, scope }, onProgress),
    preview: async (paths, maximumBytes) =>
      ask<Record<string, { content: Uint8Array<ArrayBuffer> }>>({ type: 'preview', paths, maximumBytes }),
    discard: async (operationId, scope) => ask<undefined>({ type: 'discard', operationId, scope }),
    close: () => {
      port.postMessage({ type: 'cancel', id: -1 });
      for (const [id, held] of waiting) {
        waiting.delete(id);
        held.call.reject(new ImportChannelError('The import was closed.'));
      }
      port.close();
    },
  });
};
