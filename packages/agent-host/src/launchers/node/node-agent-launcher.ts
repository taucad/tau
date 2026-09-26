/**
 * The Node launcher: the portable host core (W1-W6) assembled for a process
 * that owns a directory instead of an origin.
 *
 * Three things differ from the browser worker's assembly, and they are exactly
 * the three a daemon needs:
 *
 *   - the durable log is a real file under the workspace root
 *     (`.tau/chats/<chatId>/events.jsonl`) written through the Node appender;
 *   - the model transport carries a **bearer** (a daemon has no cookie jar);
 *   - there is no leader election. One daemon process owns its workspace, so
 *     the Web-Lock/BroadcastChannel machinery the browser needs for N tabs has
 *     no analogue here — the launcher is unconditionally the leader.
 *
 * What does *not* differ is the vocabulary: the shared command owner answers
 * the same keyed commands the browser worker answers, so a client projection
 * cannot tell the two apart.
 *
 * Always-on is the defining property: `start` and `resume` return as soon as
 * the admission is **durable**, and the run then continues with zero attached
 * clients. Nothing here is tied to a socket lifetime.
 */

import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { createGatewayModelTransport } from '#transport/gateway-model-transport.js';
import { createTauAgentHost } from '#host/tau-agent-host.js';
import { createNodeAttachmentReader, createNodeEventLog } from '#node.js';
import { createPortableId } from '#harness/session-record.js';
import type {
  AgentLogEvent,
  TurnConflictedLogEvent,
  TurnFailedLogEvent,
  TurnFinalizedLogEvent,
} from '#log/event-types.js';
import type { AgentLiveEvent, DurableEventLog, InterruptRequest, ModelTransport, ToolRegistry } from '#waist/ports.js';
import type { AgentSessionModel, CreateAgentSessionOptions } from '#harness/session.js';
import type { ExternalAgentPort, TauAgentHost } from '#host/tau-agent-host.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import type { ReadAnswer, ReadInput } from '#wire/frames.schema.js';
import type { RefusalCode } from '#wire/refusals.js';

/** One segment, never a path: a chat id is a directory name under `.tau/chats`. */
const requirePathSegment = (value: string, label: string): string => {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw Object.assign(new Error(`${label} must be one storage path segment.`), { code: 'STORAGE_PATH_INVALID' });
  }
  return value;
};

/**
 * Events a subscriber may leave unread before it is dropped.
 *
 * The stream's own default high-water mark is one, so `desiredSize` falls to
 * `1 - queued`: a subscriber this far behind is not slow, it has stopped
 * reading. Dropping it is the honest end — a client that fell behind re-tails
 * from its cursor, which is exactly what the durable log is for.
 */
const fanOutQueueLimit = 1024;

/** A multi-subscriber fan-out of live deltas, one chat per subscriber, that never blocks the producer (SC-R15). */
const createFanOut = <Event extends { readonly chatId: string }>() => {
  const controllers = new Map<ReadableStreamDefaultController<Event>, string>();
  const drop = (controller: ReadableStreamDefaultController<Event>, reason?: Error): void => {
    controllers.delete(controller);
    if (reason) {
      try {
        controller.error(reason);
      } catch {
        /* Already errored or closed; the removal above is the whole point. */
      }
    }
  };
  return {
    publish: (event: Event): void => {
      for (const [controller, chatId] of controllers) {
        if (chatId !== event.chatId) {
          continue;
        }
        /* An unbounded queue is the producer's problem, not the subscriber's:
         * a client that stops reading would otherwise grow this process's
         * heap for every event of every run it is not consuming. */
        if ((controller.desiredSize ?? 0) < -fanOutQueueLimit) {
          drop(controller, new Error('This subscriber fell too far behind; reattach from its cursor.'));
          continue;
        }
        /* A subscriber whose socket just died leaves a controller that throws
         * on `enqueue`. Publishing runs inside the durable-append path and
         * inside the model's delta callback, so letting that throw would let a
         * disconnecting client fail the run it was only watching — the exact
         * opposite of always-on. Drop the dead subscriber and carry on. */
        try {
          controller.enqueue(event);
        } catch {
          drop(controller);
        }
      }
    },
    subscribe: (signal: AbortSignal, chatId: string): AsyncIterable<Event> => {
      let cleanup = (): void => undefined;
      return new ReadableStream<Event>({
        start(controller) {
          let active = true;
          const close = (): void => {
            if (!active) {
              return;
            }
            active = false;
            controllers.delete(controller);
            try {
              controller.close();
            } catch {
              /* The fan-out's own `close()` or a `drop` already closed or errored
               * this controller; an abort that lands afterwards must not throw
               * from a listener nothing can catch (R-W2b(host) §6.3). */
            }
            signal.removeEventListener('abort', close);
          };
          cleanup = close;
          controllers.set(controller, chatId);
          if (signal.aborted) {
            close();
          } else {
            signal.addEventListener('abort', close, { once: true });
          }
        },
        cancel: () => {
          cleanup();
        },
      });
    },
    close: (): void => {
      for (const controller of controllers.keys()) {
        controllers.delete(controller);
        controller.close();
      }
    },
  };
};

/** Options for {@link createNodeAgentLauncher}. @public */
export type NodeAgentLauncherOptions = {
  /** Absolute workspace root; every chat log lives under its `.tau/chats`. */
  readonly workspaceRoot: string;
  /** `${TAU_API_URL}/` — the base the model gateway hangs off. */
  readonly gatewayBaseUrl: string;
  /**
   * Default model row for turns whose admission names none. Omit it and a Tau
   * `start` that names none is refused with `HOST_MODEL_UNAVAILABLE`; an ACP
   * turn brings its own model and is unaffected either way.
   */
  readonly model?: AgentSessionModel | undefined;
  /** Default system prompt; one admission may override it. */
  readonly systemPrompt: string;
  /** Tools visible to every run. */
  readonly toolRegistry: ToolRegistry;
  /**
   * Bearer resolved per request, never captured: a daemon's paired credential
   * rotates, and a captured string would pin the host to a stale one.
   */
  readonly auth?: (() => string | undefined | Promise<string | undefined>) | undefined;
  readonly systemPromptBlocks?: CreateAgentSessionOptions['systemPromptBlocks'];
  readonly createId?: (() => string) | undefined;
  readonly fetch?: typeof globalThis.fetch | undefined;
  /** Optional host-composed transport; omitted self-host launchers use the ordinary gateway transport. */
  readonly modelTransport?: ModelTransport | undefined;
  /**
   * External agents (W4-ACP). Omit and a `start` naming one is refused; the
   * daemon's own runs are unaffected either way.
   */
  readonly externalAgents?: ExternalAgentPort | undefined;
};

/**
 * One host-authored record, before the launcher stamps its log position. @public
 *
 * Only the revision record: the launcher owns the log's sequencing, and a
 * record written beside a run must apply nothing to provider history — which is
 * true of this variant and of no other. Widen it when a second host-authored
 * fact earns the same treatment.
 */
type WithoutLogPosition<Event> = Event extends unknown
  ? Omit<Event, 'version' | 'leaderEpoch' | 'sequence' | 'recordedAt'>
  : never;

/** One host-attested turn record, before the log stamps its position. @public */
export type HostAuthoredLogEvent = WithoutLogPosition<
  TurnConflictedLogEvent | TurnFailedLogEvent | TurnFinalizedLogEvent
>;

/** A running Node agent launcher. @public */
export type NodeAgentLauncher = {
  /** The assembled host, for callers that need the lifecycle surface directly. */
  readonly host: TauAgentHost;
  /** Answer one keyed command (SC-R4–SC-R9). Never tied to a client's socket lifetime. */
  execute(command: HostCommand): Promise<CommandAnswer>;
  /** One long-poll read of a chat's durable rows (SC-R11–SC-R14). */
  read(input: ReadInput): Promise<ReadAnswer>;
  /**
   * Append one host-authored record to a chat's durable log, and publish it.
   *
   * The turn boundary is outside the run loop — the host records what a turn
   * wrote once the run is terminal (V17/VI11) — but the record belongs in the
   * same log, at the same cursor, as everything else the client replays. This
   * is the launcher's own appender, memoized per chat, so the record takes the
   * next sequence rather than opening a second writer on one `events.jsonl`.
   *
   * Written through the host's own serialized appender rather than a second
   * writer over the same file: two writers each deriving the next sequence
   * number from the tail they read collide on `EVENT_MUTATED`, and a settlement
   * landing while a run streams then kills that run (I2).
   *
   * @param chatId - Chat whose log takes the record.
   * @param event - The record, without its log position.
   */
  append(chatId: string, event: HostAuthoredLogEvent): Promise<void>;
  /** Ephemeral model deltas for one chat, bounded per subscriber (SC-R15). */
  liveEvents(input: Readonly<{ chatId: string; signal: AbortSignal }>): AsyncIterable<AgentLiveEvent>;
  /** Unresolved approval requests for one run. */
  pendingInterrupts(runId: string): Promise<readonly InterruptRequest[]>;
  close(): Promise<void>;
};

/**
 * Assemble one always-on agent host over a workspace directory.
 *
 * @param options - Workspace, gateway, model, tools, and credential source.
 * @returns A launcher answering the T0 command vocabulary.
 * @public
 *
 * @example <caption>Serve one workspace</caption>
 * ```typescript
 * import { createNodeAgentLauncher } from '@taucad/agent-host/node-launcher';
 * import type { ToolRegistry } from '@taucad/agent-host';
 *
 * declare const toolRegistry: ToolRegistry;
 * const launcher = createNodeAgentLauncher({
 *   workspaceRoot: process.cwd(),
 *   gatewayBaseUrl: 'https://api.tau.new/',
 *   model: { id: 'claude-sonnet-4-5', contextWindow: 200_000 },
 *   systemPrompt: 'You are Tau.',
 *   toolRegistry,
 *   auth: () => process.env['TAU_HOST_CREDENTIAL'],
 * });
 * await launcher.close();
 * ```
 */
export const createNodeAgentLauncher = (options: NodeAgentLauncherOptions): NodeAgentLauncher => {
  const createId = options.createId ?? createPortableId;
  const live = createFanOut<AgentLiveEvent>();
  /** Readers parked on a chat nothing has opened yet; woken by its first open. */
  const unwrittenReaders = new Map<string, Set<() => void>>();
  const wakeUnwrittenReaders = (chatId: string): void => {
    const parked = unwrittenReaders.get(chatId);
    unwrittenReaders.delete(chatId);
    for (const wake of parked ?? []) {
      wake();
    }
  };
  let closed = false;

  /**
   * One appender per chat, shared by the pi host and any external run.
   *
   * Memoized deliberately: two handles on one `events.jsonl` would each hold
   * their own sequence cursor, and the second writer's first append would be
   * rejected `EVENT_OUT_OF_ORDER` — or worse, accepted out of order.
   */
  const logs = new Map<string, Promise<DurableEventLog>>();
  const eventLogPath = (chatId: string): string =>
    join(options.workspaceRoot, '.tau', 'chats', requirePathSegment(chatId, 'chatId'), 'events.jsonl');
  /* A chat nothing ever wrote: no open handle and no file on disk. */
  const isUnwritten = async (chatId: string): Promise<boolean> =>
    !logs.has(chatId) &&
    (await access(eventLogPath(chatId)).then(
      () => false,
      () => true,
    ));
  const openEventLog = async (chatId: string): Promise<DurableEventLog> => {
    const cached = logs.get(chatId);
    if (cached) {
      return cached;
    }
    const opened = (async (): Promise<DurableEventLog> => {
      const log = await createNodeEventLog({ filePath: eventLogPath(chatId), access: 'write' });
      wakeUnwrittenReaders(chatId);
      return {
        append: async (candidate: AgentLogEvent) =>
          /* The binding's durability class, stated on the run's admission as the page's bindings state theirs:
           * `appendFile` then `sync()` per append, and the directory synced once at creation (W3 §11). */
          log.append(
            candidate.type === 'run.lifecycle' && candidate.state === 'admitted'
              ? { ...candidate, storageDurability: 'exclusive-append' }
              : candidate,
          ),
        read: async () => log.read(),
        readBatch: async (input) => log.readBatch(input),
        messages: async () => log.messages(),
        historyIntact: async () => log.historyIntact(),
        anomalies: async () => log.anomalies(),
        close: async () => {
          /* M1 closes an idle chat's log (idle eviction, relinquish): the next open must be a fresh handle. */
          if (logs.get(chatId) === opened) {
            logs.delete(chatId);
          }
          await log.close();
        },
      };
    })();
    logs.set(chatId, opened);
    try {
      return await opened;
    } catch (error) {
      /* A failed open must not poison the cache: the next attempt should retry
       * rather than replay a rejection nobody can act on. */
      if (logs.get(chatId) === opened) {
        logs.delete(chatId);
      }
      throw error;
    }
  };

  const host: TauAgentHost = createTauAgentHost({
    systemPrompt: options.systemPrompt,
    ...(options.systemPromptBlocks ? { systemPromptBlocks: options.systemPromptBlocks } : {}),
    ...(options.model ? { model: options.model } : {}),
    modelTransport:
      options.modelTransport ??
      createGatewayModelTransport({
        baseUrl: options.gatewayBaseUrl,
        ...(options.model ? { model: options.model } : {}),
        ...(options.auth ? { auth: options.auth } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
      }),
    toolRegistry: options.toolRegistry,
    openEventLog,
    attachments: createNodeAttachmentReader(options.workspaceRoot),
    createId,
    /* W4-ACP's port, registered on the shared run-kind seam. The daemon's own
     * runs are unaffected either way; omit it and a `start` naming an external
     * agent is refused by the host with `EXTERNAL_AGENT_UNAVAILABLE`. */
    ...(options.externalAgents ? { externalRunners: { acp: options.externalAgents } } : {}),
    onLiveEvent: (event: AgentLiveEvent) => {
      live.publish(event);
    },
  });

  const closedAnswer = (commandId: string): CommandAnswer => ({
    commandId,
    generation: 0,
    status: 'refused',
    effect: 'not-applied',
    code: 'HOST_CLOSED' satisfies RefusalCode,
    message: 'The Tau agent launcher is closed.',
  });

  const assertOpen = (): void => {
    if (closed) {
      throw Object.assign(new Error('The Tau agent launcher is closed.'), {
        code: 'HOST_CLOSED' satisfies RefusalCode,
      });
    }
  };

  /* The daemon never contends for leadership: every command goes straight to the chat's M1 incarnation (W7). */
  const execute = async (command: HostCommand): Promise<CommandAnswer> => {
    if (closed) {
      return closedAnswer(command.commandId);
    }
    try {
      requirePathSegment(command.payload.chatId, 'chatId');
    } catch (error) {
      return {
        commandId: command.commandId,
        generation: 0,
        status: 'refused',
        effect: 'not-applied',
        code: 'STORAGE_PATH_INVALID',
        message: error instanceof Error ? error.message : String(error),
      };
    }
    /* A chat nothing wrote opens nothing on attach: opening the log creates its directory, file and writer lock, and
     * every desktop project open probes a sentinel chat this way (W0.12, L2b HD-8). */
    if (command.type === 'attach' && (await isUnwritten(command.payload.chatId))) {
      return {
        commandId: command.commandId,
        generation: 0,
        status: 'applied',
        effect: 'not-applied',
        details: { takeover: false, endCursor: 0 },
      };
    }
    return host.command(command);
  };

  const read = async (input: ReadInput): Promise<ReadAnswer> => {
    assertOpen();
    const { chatId } = input;
    // oxlint-disable-next-line no-await-in-loop -- a long poll re-checks after each wake.
    while (await isUnwritten(chatId)) {
      if (input.cursor > 0) {
        return { status: 'refused', chatId, reason: 'cursor-ahead', expected: { endCursor: 0 } };
      }
      if (closed || input.signal?.aborted) {
        return { status: 'batch', chatId, cursor: 0, nextCursor: 0, endCursor: 0, events: [] };
      }
      // Parked without opening the log (W0.12): the chat's first open wakes it, and the host parks it from there.
      // oxlint-disable-next-line no-await-in-loop -- one park per check.
      await new Promise<void>((resolve) => {
        const parked = unwrittenReaders.get(chatId) ?? new Set();
        unwrittenReaders.set(chatId, parked);
        const wake = (): void => {
          parked.delete(wake);
          // An aborted reader leaves no empty Set behind, as `host.read` does.
          if (parked.size === 0 && unwrittenReaders.get(chatId) === parked) {
            unwrittenReaders.delete(chatId);
          }
          input.signal?.removeEventListener('abort', wake);
          resolve();
        };
        parked.add(wake);
        input.signal?.addEventListener('abort', wake, { once: true });
      });
    }
    return host.read(input);
  };

  return {
    host,
    execute,
    read,
    append: async (chatId, event) => {
      assertOpen();
      const { runId, ...body } = event;
      await host.recordSettlement({ chatId, runId, event: body });
    },
    liveEvents: ({ chatId, signal }) => live.subscribe(signal, chatId),
    pendingInterrupts: async (runId) => host.pendingInterrupts(runId),
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await host.close();
      await Promise.allSettled(
        [...logs.values()].map(async (opened) => {
          const log = await opened;
          await log.close();
        }),
      );
      logs.clear();
      for (const chatId of unwrittenReaders.keys()) {
        wakeUnwrittenReaders(chatId);
      }
      live.close();
    },
  };
};
