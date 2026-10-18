import { iterateStream } from '#launchers/agent-launcher.js';
import type { AgentChannelSource } from '#launchers/agent-channel.js';
import { createProjectTaskPlatform } from '#launchers/project-task-platform.js';
import type { ProjectTaskOwner, ProjectTaskPlatform, ProjectTaskStorage } from '#launchers/project-task-platform.js';
// oxlint-disable-next-line import/no-cycle -- browser.ts only exports this module after defining its log functions.
import type { BrowserChatStoreOptions } from '#browser.js';
// oxlint-disable-next-line import/no-cycle -- browser log constructors are initialized before the public project binding is called.
import { createProjectOwnedBrowserChatStore } from '#browser/project-chat-store.js';
import { openBrowserProjectTaskStorage } from '#browser/project-task-storage.js';
import { commandAnswerSchema } from '#wire/commands.schema.js';
import { readAnswerSchema } from '#wire/frames.schema.js';
import { projectTaskChannelAnswerSchema } from '#wire/project-task-channel.schema.js';

/** One project's browser task authority options. @public */
export type BrowserProjectTasksOptions = Pick<
  BrowserChatStoreOptions,
  'tabId' | 'build' | 'log' | 'observeLog' | 'visibility'
>;

type CallName = 'execute' | 'read' | 'ledger' | 'snapshot' | 'waitForAdmission' | 'projectTasks' | 'drain';
type StreamName = 'catchUp' | 'liveEvents';
type RequestFrame = Readonly<{
  kind: 'call' | 'listen';
  id: string;
  operation: CallName | StreamName;
  input: unknown;
  to: string;
}>;
type ReplyFrame = Readonly<{
  kind: 'reply' | 'chunk' | 'end';
  id: string;
  to: string;
  value?: unknown;
  error?: Readonly<{ code: string; message: string }>;
}>;
type Frame = Readonly<{
  projectId: string;
  sender: string;
  build: string;
  term: number;
}> &
  (
    | RequestFrame
    | ReplyFrame
    | Readonly<{ kind: 'heartbeat'; state: 'leading' | 'released' }>
    | Readonly<{ kind: 'cancel'; id: string; to: string }>
  );
type FrameBody =
  | RequestFrame
  | ReplyFrame
  | Readonly<{ kind: 'heartbeat'; state: 'leading' | 'released' }>
  | Readonly<{ kind: 'cancel'; id: string; to: string }>;

type PendingCall = Readonly<{
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  liveness: ReturnType<typeof setInterval>;
  signal?: AbortSignal;
  abort?: () => void;
}>;
type PendingStream = Readonly<{
  controller: ReadableStreamDefaultController<unknown>;
  liveness: ReturnType<typeof setInterval>;
  signal: AbortSignal;
  abort: () => void;
  target: Readonly<{ sender: string; term: number }>;
}>;

const heartbeatInterval = 1000;
const heartbeatTimeout = 3500;
const responseTimeout = 10_000;
/** Match the agent channel's bounded keyed-command redial budget across project terms. */
const executeTermRetries = 5;

const projectError = (code: string, message: string): Error => Object.assign(new Error(message), { code });
class AddressedTermLost extends Error {
  public get code(): string {
    return 'PEER_UNRESPONSIVE';
  }
}
const describeError = (error: unknown): Readonly<{ code: string; message: string }> => ({
  code:
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'HOST_FAULT',
  message: error instanceof Error ? error.message : String(error),
});

const isFrame = (value: unknown, projectId: string, self: string): value is Frame => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const fields = value as Record<string, unknown>;
  const envelope =
    fields['projectId'] === projectId &&
    typeof fields['sender'] === 'string' &&
    fields['sender'] !== self &&
    typeof fields['build'] === 'string' &&
    typeof fields['term'] === 'number' &&
    Number.isSafeInteger(fields['term']) &&
    fields['term'] >= 0 &&
    typeof fields['kind'] === 'string';
  if (!envelope) {
    return false;
  }
  switch (fields['kind']) {
    case 'heartbeat': {
      return fields['state'] === 'leading' || fields['state'] === 'released';
    }
    case 'call':
    case 'listen': {
      return (
        typeof fields['id'] === 'string' && typeof fields['to'] === 'string' && typeof fields['operation'] === 'string'
      );
    }
    case 'cancel': {
      return typeof fields['id'] === 'string' && typeof fields['to'] === 'string';
    }
    case 'reply':
    case 'chunk':
    case 'end': {
      return typeof fields['id'] === 'string' && typeof fields['to'] === 'string';
    }
    default: {
      return false;
    }
  }
};

/**
 * Bind the approved project task host to one browser project owner. Its journal and all chat writers live under one
 * project Web Lock; the canonical per-chat locks still exclude older per-chat M2 builds. No task request is converted
 * into a chat command. A follower forwards the typed operations and their original idempotency keys to that owner.
 *
 * @param options - Browser tab identity, build, project storage and visibility.
 * @returns An opaque platform for `createProjectTaskHost`.
 * @public
 */
export const browserProjectTasks = (options: BrowserProjectTasksOptions): ProjectTaskPlatform =>
  createProjectTaskPlatform(async ({ projectId, createOwner }) => {
    const sender = options.tabId;
    const channel = new BroadcastChannel(`agent-host-project:${encodeURIComponent(projectId)}`);
    const lockName = `agent-host-project-log:${encodeURIComponent(projectId)}`;
    const pendingCalls = new Map<string, PendingCall>();
    const pendingStreams = new Map<string, PendingStream>();
    const serving = new Map<string, AbortController>();
    const localTerm = { current: 0 };
    const ownership = new AbortController();
    let owner: ProjectTaskOwner | undefined;
    let holder: Readonly<{ sender: string; term: number; build: string; seen: number }> | undefined;
    let sequence = 0;
    let closed = false;
    let closing = false;
    let retry: ReturnType<typeof setInterval> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const release = Promise.withResolvers<void>();
    const waiters = new Set<() => void>();
    const takeCall = (id: string): PendingCall | undefined => {
      const pending = pendingCalls.get(id);
      if (pending) {
        pendingCalls.delete(id);
        clearInterval(pending.liveness);
        if (pending.abort) {
          pending.signal?.removeEventListener('abort', pending.abort);
        }
      }
      return pending;
    };
    const takeStream = (id: string): PendingStream | undefined => {
      const pending = pendingStreams.get(id);
      if (pending) {
        pendingStreams.delete(id);
        clearInterval(pending.liveness);
        pending.signal.removeEventListener('abort', pending.abort);
      }
      return pending;
    };
    const wake = (): void => {
      for (const waiter of waiters) {
        waiter();
      }
      waiters.clear();
    };
    const post = (body: FrameBody, term = localTerm.current): void => {
      channel.postMessage({
        projectId,
        sender,
        build: options.build,
        term,
        ...body,
      } satisfies Frame);
    };
    const currentHolder = (): typeof holder => {
      if (holder && performance.now() - holder.seen < heartbeatTimeout) {
        return holder;
      }
      return undefined;
    };
    const waitForHolder = async (signal?: AbortSignal): Promise<NonNullable<typeof holder>> => {
      const deadline = performance.now() + responseTimeout;
      for (;;) {
        signal?.throwIfAborted();
        if (closed || closing) {
          throw projectError('HOST_CLOSED', 'The project task host is closed.');
        }
        if (owner) {
          return { sender, term: localTerm.current, build: options.build, seen: performance.now() };
        }
        const active = currentHolder();
        if (active) {
          if (active.build !== options.build) {
            throw projectError(
              'LEADER_VERSION_MISMATCH',
              'Another tab is writing this project with a different Tau build.',
            );
          }
          return active;
        }
        const remaining = deadline - performance.now();
        if (remaining <= 0) {
          throw projectError('PEER_UNRESPONSIVE', 'No project task owner answered within the ownership bound.');
        }
        // oxlint-disable-next-line no-await-in-loop -- each wake rechecks the current holder and remaining bound.
        await new Promise<void>((resolve) => {
          const done = (): void => {
            clearTimeout(timer);
            waiters.delete(done);
            signal?.removeEventListener('abort', done);
            resolve();
          };
          const timer = setTimeout(done, remaining);
          waiters.add(done);
          signal?.addEventListener('abort', done, { once: true });
          if (signal?.aborted) {
            done();
          }
        });
      }
    };

    const invokeLocal = async (operation: CallName, input: unknown, signal: AbortSignal): Promise<unknown> => {
      const current = owner;
      if (!current || ownership.signal.aborted || closing) {
        throw projectError('LEADERSHIP_LOST', 'The project owner is unavailable.');
      }
      switch (operation) {
        case 'execute': {
          return current.source.execute(input as Parameters<AgentChannelSource['execute']>[0]);
        }
        case 'read': {
          return current.source.read({ ...(input as Parameters<AgentChannelSource['read']>[0]), signal });
        }
        case 'ledger': {
          return current.source.host.ledger(input as string);
        }
        case 'snapshot': {
          return current.source.host.snapshot(input as string);
        }
        case 'waitForAdmission': {
          const args = input as Readonly<{ chatId: string; runId?: string }>;
          return current.source.host.waitForAdmission(args.chatId, args.runId);
        }
        case 'projectTasks': {
          return current.projectTasks.request(
            input as Parameters<ProjectTaskOwner['projectTasks']['request']>[0],
            signal,
          );
        }
        case 'drain': {
          return current.drain({ signal });
        }
      }
    };
    const listenLocal = (operation: StreamName, input: unknown, signal: AbortSignal): AsyncIterable<unknown> => {
      const current = owner;
      if (!current || ownership.signal.aborted || closing) {
        throw projectError('LEADERSHIP_LOST', 'The project owner is unavailable.');
      }
      return operation === 'catchUp'
        ? current.source.catchUp({ ...(input as Parameters<AgentChannelSource['catchUp']>[0]), signal })
        : current.source.liveEvents({
            ...(input as Omit<Parameters<AgentChannelSource['liveEvents']>[0], 'signal'>),
            signal,
          });
    };

    const remoteCallOnce = async <Result>(
      operation: CallName,
      input: unknown,
      signal?: AbortSignal,
    ): Promise<Result> => {
      signal?.throwIfAborted();
      const target = await waitForHolder(signal);
      signal?.throwIfAborted();
      if (owner) {
        return (await invokeLocal(operation, input, signal ?? new AbortController().signal)) as Result;
      }
      const id = `${sender}:${String(++sequence)}`;
      return new Promise<Result>((resolve, reject) => {
        const liveness = setInterval(() => {
          const active = currentHolder();
          if (active?.sender === target.sender && active.term === target.term) {
            return;
          }
          takeCall(id)?.reject(new AddressedTermLost('The project owner stopped heartbeating before answering.'));
        }, heartbeatInterval);
        const abort = (): void => {
          if (!takeCall(id)) {
            return;
          }
          post({ kind: 'cancel', id, to: target.sender }, target.term);
          reject(new DOMException('The request was aborted.', 'AbortError'));
        };
        pendingCalls.set(id, {
          resolve: (value) => {
            resolve(value as Result);
          },
          reject,
          liveness,
          signal,
          abort,
        });
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) {
          abort();
          return;
        }
        post({ kind: 'call', id, operation, input, to: target.sender }, target.term);
      });
    };

    const remoteCall = async <Result>(operation: CallName, input: unknown, signal?: AbortSignal): Promise<Result> => {
      for (let retry = 0; ; retry += 1) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- only an unanswered keyed execute can cross a new project term.
          return await remoteCallOnce<Result>(operation, input, signal);
        } catch (error) {
          if (operation !== 'execute' || !(error instanceof AddressedTermLost) || retry >= executeTermRetries) {
            throw error;
          }
          // The addressed term disappeared without answering. The next owner decides whether this same key was
          // durably applied; a replied refusal or an unrelated task/projection mutation is never re-sent here.
        }
      }
    };

    const remoteStream = (operation: StreamName, input: unknown, signal: AbortSignal): AsyncIterable<unknown> => {
      let activeId: string | undefined;
      const detached = new AbortController();
      const activeSignal = AbortSignal.any([signal, detached.signal]);
      const stream = new ReadableStream<unknown>({
        start: async (controller) => {
          try {
            activeSignal.throwIfAborted();
            const target = await waitForHolder(activeSignal);
            activeSignal.throwIfAborted();
            if (owner) {
              for await (const value of listenLocal(operation, input, activeSignal)) {
                controller.enqueue(value);
              }
              controller.close();
              return;
            }
            const id = `${sender}:${String(++sequence)}`;
            activeId = id;
            const abort = (): void => {
              if (!takeStream(id)) {
                return;
              }
              post({ kind: 'cancel', id, to: target.sender }, target.term);
              controller.close();
            };
            const liveness = setInterval(() => {
              const active = currentHolder();
              if (active?.sender === target.sender && active.term === target.term) {
                return;
              }
              takeStream(id)?.controller.error(
                projectError('PEER_UNRESPONSIVE', 'The project owner stopped heartbeating during the stream.'),
              );
            }, heartbeatInterval);
            pendingStreams.set(id, { controller, liveness, signal: activeSignal, abort, target });
            activeSignal.addEventListener('abort', abort, { once: true });
            if (activeSignal.aborted) {
              abort();
              return;
            }
            post({ kind: 'listen', id, operation, input, to: target.sender }, target.term);
          } catch (error) {
            if (!detached.signal.aborted) {
              controller.error(error);
            }
          }
        },
        cancel: () => {
          detached.abort();
          if (activeId) {
            const pending = takeStream(activeId);
            if (pending) {
              post({ kind: 'cancel', id: activeId, to: pending.target.sender }, pending.target.term);
            }
          }
        },
      });
      return iterateStream(stream);
    };

    const facade: ProjectTaskOwner = {
      source: {
        execute: async (command) => commandAnswerSchema.parse(await remoteCall('execute', command)),
        read: async (input) =>
          readAnswerSchema.parse(await remoteCall('read', { ...input, signal: undefined }, input.signal)),
        catchUp: (input) =>
          remoteStream(
            'catchUp',
            { ...input, signal: undefined },
            input.signal ?? new AbortController().signal,
          ) as ReturnType<AgentChannelSource['catchUp']>,
        liveEvents: (input) =>
          remoteStream('liveEvents', { chatId: input.chatId }, input.signal) as ReturnType<
            AgentChannelSource['liveEvents']
          >,
        host: {
          ledger: async (chatId) => remoteCall('ledger', chatId),
          snapshot: async (chatId) => remoteCall('snapshot', chatId),
          waitForAdmission: async (chatId, runId) => remoteCall('waitForAdmission', { chatId, runId }),
        },
      },
      projectTasks: {
        request: async (input, signal) =>
          projectTaskChannelAnswerSchema.parse(await remoteCall('projectTasks', input, signal)),
      },
      stoppability: (chatId) =>
        owner?.stoppability(chatId) ??
        (currentHolder()?.build === options.build
          ? 'stoppable'
          : currentHolder()
            ? 'other-build'
            : 'background-window'),
      drain: async (input) => {
        await (owner ? owner.drain(input) : remoteCall('drain', undefined, input.signal));
      },
      close: async () => {
        if (closed) {
          return;
        }
        if (closing) {
          throw projectError('TASK_BUSY', 'The project owner is already closing.');
        }
        closing = true;
        wake();
        try {
          await owner?.close();
          ownership.abort();
          closed = true;
          owner = undefined;
          if (heartbeat) {
            clearInterval(heartbeat);
          }
          if (retry) {
            clearInterval(retry);
          }
          stopVisibility?.();
          for (const id of pendingCalls.keys()) {
            takeCall(id)?.reject(projectError('HOST_CLOSED', 'The project task host closed.'));
          }
          for (const id of pendingStreams.keys()) {
            takeStream(id)?.controller.close();
          }
          for (const controller of serving.values()) {
            controller.abort();
          }
          serving.clear();
          post({ kind: 'heartbeat', state: 'released' });
          release.resolve();
          channel.close();
          wake();
        } finally {
          closing = false;
        }
      },
    };

    channel.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (!isFrame(event.data, projectId, sender)) {
        return;
      }
      const incoming = event.data;
      if (incoming.kind === 'heartbeat') {
        if (incoming.state === 'leading' && (!holder || incoming.term >= holder.term)) {
          holder = { sender: incoming.sender, term: incoming.term, build: incoming.build, seen: performance.now() };
          wake();
        } else if (
          incoming.state === 'released' &&
          holder?.sender === incoming.sender &&
          holder.term <= incoming.term
        ) {
          holder = undefined;
          wake();
        }
        return;
      }
      if ('to' in incoming && incoming.to !== sender) {
        return;
      }
      if (incoming.kind === 'cancel') {
        serving.get(incoming.id)?.abort();
        serving.delete(incoming.id);
        return;
      }
      if (incoming.kind === 'reply') {
        const pending = pendingCalls.get(incoming.id);
        if (pending && incoming.sender === holder?.sender && incoming.term === holder.term) {
          takeCall(incoming.id);
          if (incoming.error) {
            pending.reject(projectError(incoming.error.code, incoming.error.message));
          } else {
            pending.resolve(incoming.value);
          }
        }
        return;
      }
      if (incoming.kind === 'chunk' || incoming.kind === 'end') {
        const pending = pendingStreams.get(incoming.id);
        if (pending && incoming.sender === holder?.sender && incoming.term === holder.term) {
          if (incoming.kind === 'chunk') {
            pending.controller.enqueue(incoming.value);
          } else {
            takeStream(incoming.id);
            if (incoming.error) {
              pending.controller.error(projectError(incoming.error.code, incoming.error.message));
            } else {
              pending.controller.close();
            }
          }
        }
        return;
      }
      if (
        !owner ||
        ownership.signal.aborted ||
        closing ||
        incoming.build !== options.build ||
        incoming.term !== localTerm.current
      ) {
        return;
      }
      if (!('operation' in incoming)) {
        return;
      }
      const controller = new AbortController();
      serving.set(incoming.id, controller);
      if (incoming.kind === 'call') {
        // async-iife: bootstrap
        void (async (): Promise<void> => {
          try {
            const value = await invokeLocal(incoming.operation as CallName, incoming.input, controller.signal);
            post({ kind: 'reply', id: incoming.id, to: incoming.sender, value });
          } catch (error) {
            post({ kind: 'reply', id: incoming.id, to: incoming.sender, error: describeError(error) });
          } finally {
            serving.delete(incoming.id);
          }
        })();
      } else {
        // async-iife: bootstrap
        void (async (): Promise<void> => {
          try {
            for await (const value of listenLocal(
              incoming.operation as StreamName,
              incoming.input,
              controller.signal,
            )) {
              post({ kind: 'chunk', id: incoming.id, to: incoming.sender, value });
            }
            post({ kind: 'end', id: incoming.id, to: incoming.sender });
          } catch (error) {
            post({ kind: 'end', id: incoming.id, to: incoming.sender, error: describeError(error) });
          } finally {
            serving.delete(incoming.id);
          }
        })();
      }
    });

    const own = async (): Promise<boolean> => {
      const settled = Promise.withResolvers<boolean>();
      // async-iife: bootstrap
      void (async (): Promise<void> => {
        try {
          await navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
            if (lock === null || options.visibility?.visible() === false) {
              settled.resolve(false);
              return;
            }
            let storage: Awaited<ReturnType<typeof openBrowserProjectTaskStorage>> | undefined;
            try {
              const openedStorage = await openBrowserProjectTaskStorage(projectId, options.log);
              storage = openedStorage;
              const chats = createProjectOwnedBrowserChatStore(
                projectId,
                { ...options, projectId },
                () => !ownership.signal.aborted,
                ownership.signal,
              );
              const requireOwnership = (): void => {
                if (ownership.signal.aborted) {
                  throw projectError('SESSION_FENCED', 'The project term no longer owns its task journal.');
                }
              };
              const fencedStorage: ProjectTaskStorage = {
                read: async () => {
                  requireOwnership();
                  return openedStorage.read();
                },
                append: async (bytes) => {
                  requireOwnership();
                  return openedStorage.append(bytes);
                },
                truncate: async (size) => {
                  requireOwnership();
                  return openedStorage.truncate(size);
                },
                size: async () => {
                  requireOwnership();
                  return openedStorage.size();
                },
                exclusive: async (section) =>
                  openedStorage.exclusive(async () => {
                    requireOwnership();
                    return section();
                  }),
                close: async () => openedStorage.close(),
              };
              owner = await createOwner({ chats, storage: fencedStorage, signal: ownership.signal });
              const bytes = await storage.read();
              const complete = new TextDecoder().decode(bytes.subarray(0, bytes.lastIndexOf(10) + 1));
              const last = complete.split('\n').findLast(Boolean);
              const parsed = last === undefined ? undefined : (JSON.parse(last) as { sequence?: unknown });
              if (typeof parsed?.sequence !== 'number' || parsed.sequence <= 0) {
                throw projectError('TASK_STORAGE_INVALID', 'The project owner did not durably claim the task journal.');
              }
              localTerm.current = parsed.sequence;
              holder = { sender, term: localTerm.current, build: options.build, seen: performance.now() };
              post({ kind: 'heartbeat', state: 'leading' });
              heartbeat = setInterval(() => {
                post({ kind: 'heartbeat', state: 'leading' });
              }, heartbeatInterval);
              settled.resolve(true);
              wake();
              await release.promise;
            } catch (error) {
              settled.reject(error);
              try {
                await owner?.close();
                await storage?.close();
                ownership.abort();
              } catch {
                // A failed cleanup may still own a chat writer or OPFS handle. Keep the project lock until this
                // worker exits; a successor must never report a new term beside those unresolved resources.
                ownership.abort();
                await release.promise;
              }
            }
          });
        } catch (error) {
          if (owner && !closed) {
            // A stolen/revoked Web Lock ends this term even if its callback had already reported ready. In particular,
            // a late tool call cannot outlive the project lock and start writing beside its successor.
            ownership.abort();
            if (heartbeat) {
              clearInterval(heartbeat);
            }
            for (const id of pendingCalls.keys()) {
              takeCall(id)?.reject(projectError('LEADERSHIP_LOST', 'The project owner lost its lock.'));
            }
            for (const id of pendingStreams.keys()) {
              takeStream(id)?.controller.error(projectError('LEADERSHIP_LOST', 'The project owner lost its lock.'));
            }
            for (const controller of serving.values()) {
              controller.abort();
            }
            serving.clear();
            post({ kind: 'heartbeat', state: 'released' });
            wake();
          }
          settled.reject(error);
        }
      })();
      return settled.promise;
    };

    let claiming: Promise<boolean> | undefined;
    const tryClaim = async (): Promise<boolean> => {
      if (claiming) {
        return claiming;
      }
      if (closed || closing || owner !== undefined || options.visibility?.visible() === false) {
        return false;
      }
      claiming = (async (): Promise<boolean> => {
        try {
          return await own();
        } finally {
          claiming = undefined;
        }
      })();
      return claiming;
    };
    const retryClaim = (): void => {
      // async-iife: bootstrap -- ownership retries are background work while this follower remains open.
      void (async (): Promise<void> => {
        try {
          await tryClaim();
        } catch {
          /* A later visibility event or timer retries ownership. */
        }
      })();
    };
    const stopVisibility = options.visibility?.subscribe((visible) => {
      if (visible) {
        retryClaim();
      }
    });
    try {
      const acquired = await tryClaim();
      if (!acquired) {
        // A hidden follower holds no project lock. Visibility resumes immediately, with a timer for released owners.
        retry = setInterval(retryClaim, heartbeatTimeout);
      }
      return facade;
    } catch (error) {
      stopVisibility?.();
      throw error;
    }
  });
