// oxlint-disable-next-line import/no-cycle -- browser.ts exports project tasks but these functions are called after initialization.
import { createOpfsEventLog, createProviderAttachmentReader, createProviderEventLog } from '#browser.js';
import type { BrowserChatStoreOptions } from '#browser.js';
import { createChatStore, requireChatPathSegment } from '#launchers/chat-store.js';
import type { ChatStore, LeadershipHost, LeadershipPort } from '#launchers/chat-store.js';
import { chatLeadershipNames } from '#launchers/leadership/names.js';
import { createNodeLeadership } from '#launchers/node/node-leadership.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import { chatAttachmentPath } from '#harness/session-record.js';

const logPath = (chatId: string): string => `.tau/chats/${requireChatPathSegment(chatId)}/events.jsonl`;

const opfsFile = async (
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<FileSystemFileHandle | undefined> => {
  const segments = path.split('/');
  const name = segments.pop()!;
  try {
    let directory = root;
    for (const segment of segments) {
      // oxlint-disable-next-line no-await-in-loop -- each directory opens inside its parent.
      directory = await directory.getDirectoryHandle(segment, { create });
    }
    return await directory.getFileHandle(name, { create });
  } catch (error) {
    if (!create && error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError') {
      return undefined;
    }
    throw error;
  }
};

/** Acquire the same per-chat lock legacy M2 builds use; never steal it. */
const acquireChatLock = async (projectId: string, chatId: string): Promise<() => Promise<void>> => {
  const granted = Promise.withResolvers<(() => Promise<void>) | undefined>();
  const held = Promise.withResolvers<void>();
  const settled = Promise.withResolvers<void>();
  const name = chatLeadershipNames(projectId, chatId).lock;
  // async-iife: bootstrap -- the Web Lock callback remains pending until the writer closes.
  void (async (): Promise<void> => {
    try {
      await navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
        if (lock === null) {
          granted.resolve(undefined);
          return;
        }
        granted.resolve(async () => {
          held.resolve();
          await settled.promise;
        });
        await held.promise;
      });
    } catch (error) {
      granted.reject(error);
    } finally {
      settled.resolve();
    }
  })();
  const release = await granted.promise;
  if (release === undefined) {
    throw Object.assign(new Error(`Chat ${chatId} has an active writer in another tab.`), { code: 'WRITER_LOCKED' });
  }
  return release;
};

/** A chat store whose writes are subordinate to one project term. @internal */
export const createProjectOwnedBrowserChatStore = (
  projectId: string,
  options: BrowserChatStoreOptions,
  active: () => boolean,
  ownership?: AbortSignal,
): ChatStore => {
  const requireActive = (): void => {
    if (!active()) {
      throw Object.assign(new Error('The project owner lost its term.'), { code: 'LEADERSHIP_LOST' });
    }
  };
  const openWriter = async (chatId: string): Promise<EventLogAppender> => {
    requireActive();
    const release = await acquireChatLock(projectId, chatId);
    try {
      requireActive();
      let log: EventLogAppender;
      if (options.log.kind === 'opfs') {
        log = await createOpfsEventLog({
          fileHandle: (await opfsFile(options.log.directory, logPath(chatId), true))!,
          access: 'write',
        });
      } else {
        const { fileSystem } = options.log;
        const path = logPath(chatId);
        const marker = `${path}.lock`;
        if (await fileSystem.exists(marker)) {
          const bytes = await fileSystem.readFile(marker);
          const text = new TextDecoder().decode(bytes);
          // The Web Lock excludes old browser writers. Node's pid/path marker does not participate in that lock.
          if (!/^\d{13}\n$/.test(text)) {
            throw Object.assign(new Error(`Chat ${chatId} has an external writer marker.`), { code: 'WRITER_LOCKED' });
          }
          await fileSystem.unlink(marker);
        }
        log = await createProviderEventLog({
          fileSystem,
          filePath: path,
          access: 'write',
          lockName: `tau-log-append:${projectId}/${requireChatPathSegment(chatId)}`,
        });
      }
      let closed = false;
      return {
        ...log,
        append: async (event) => {
          requireActive();
          return log.append(event);
        },
        close: async () => {
          if (!closed) {
            await log.close();
            await release();
            closed = true;
          }
        },
      };
    } catch (error) {
      await release();
      throw error;
    }
  };
  const observeBytes =
    options.observeLog === undefined
      ? undefined
      : async (
          chatId: string,
          input: Readonly<{
            signal: AbortSignal;
            onChange: () => void;
            onError: (error: unknown) => void;
          }>,
        ) => options.observeLog!({ ...input, path: logPath(chatId) });

  /** A reconcile waits behind a legacy chat writer without occupying a second project or execution term. */
  const leadership = (host: LeadershipHost): LeadershipPort => {
    const local = createNodeLeadership(host);
    const wanted = new Set<string>();
    const queued = new Map<string, AbortController>();
    let closed = false;
    const visible = (): boolean => options.visibility?.visible() !== false;
    const cancelQueues = (): void => {
      for (const controller of queued.values()) {
        controller.abort();
      }
    };
    const drive = (chatId: string): void => {
      if (closed || !active() || !visible() || !wanted.has(chatId) || queued.has(chatId)) {
        return;
      }
      const controller = new AbortController();
      queued.set(chatId, controller);
      // async-iife: bootstrap -- this is the existing launcher's pending reconcile, not a new chat execution owner.
      void (async (): Promise<void> => {
        try {
          while (!controller.signal.aborted && active() && visible()) {
            // oxlint-disable-next-line no-await-in-loop -- each refusal waits for the legacy writer's lock release.
            const refusal = await host.claim(chatId);
            if (refusal !== 'WRITER_LOCKED') {
              wanted.delete(chatId);
              return;
            }
            // The queued request is only a release notification; openWriter takes the actual exclusive lock.
            // oxlint-disable-next-line no-await-in-loop -- one canonical chat lock wait per pending reconciliation.
            await navigator.locks.request(
              chatLeadershipNames(projectId, chatId).lock,
              { signal: controller.signal },
              () => undefined,
            );
            // A native writer marker may still block after the Web Lock frees. Avoid a lock-free busy loop.
            // oxlint-disable-next-line no-await-in-loop -- a bounded backoff follows each unsuccessful claim.
            await new Promise<void>((resolve) => {
              const done = (): void => {
                clearTimeout(timer);
                controller.signal.removeEventListener('abort', done);
                resolve();
              };
              const timer = setTimeout(done, 250);
              controller.signal.addEventListener('abort', done, { once: true });
              if (controller.signal.aborted) {
                done();
              }
            });
          }
        } catch (error) {
          if (!controller.signal.aborted && active()) {
            console.error('[agent-host] a queued legacy chat reconciliation failed', chatId, error);
          }
        } finally {
          queued.delete(chatId);
          // A hide/show pair may have happened before the aborted wait unwound.
          if (controller.signal.aborted) {
            drive(chatId);
          }
        }
      })();
    };
    const stopVisibility = options.visibility?.subscribe((shown) => {
      if (shown) {
        for (const chatId of wanted) {
          drive(chatId);
        }
      } else {
        cancelQueues();
      }
    });
    ownership?.addEventListener('abort', cancelQueues, { once: true });
    return {
      ...local,
      reconcile: (chatId, request) => {
        if (!request.wait) {
          local.reconcile(chatId, request);
          return;
        }
        wanted.add(chatId);
        drive(chatId);
      },
      close: async () => {
        closed = true;
        wanted.clear();
        cancelQueues();
        stopVisibility?.();
        ownership?.removeEventListener('abort', cancelQueues);
        await local.close();
      },
    };
  };

  if (options.log.kind === 'opfs') {
    const { directory } = options.log;
    const bytesOf = async (path: string): Promise<Uint8Array<ArrayBuffer> | undefined> => {
      const file = await opfsFile(directory, path, false);
      if (file === undefined) {
        return undefined;
      }
      const blob = await file.getFile();
      return new Uint8Array(await blob.arrayBuffer());
    };
    return createChatStore({
      platform: 'browser',
      observeBytes,
      durability: 'exclusive-append',
      attachments: { read: async (chatId, path) => bytesOf(chatAttachmentPath(chatId, path)) },
      readBytes: async (chatId) => (await bytesOf(logPath(chatId))) ?? new Uint8Array(),
      openWriter,
      leadership,
    });
  }
  const { fileSystem } = options.log;
  return createChatStore({
    platform: 'browser',
    observeBytes,
    durability: options.log.durability ?? 'stream-append',
    attachments: createProviderAttachmentReader(fileSystem),
    readBytes: async (chatId) => {
      const path = logPath(chatId);
      return (await fileSystem.exists(path)) ? fileSystem.readFile(path) : new Uint8Array();
    },
    openWriter,
    leadership,
  });
};
