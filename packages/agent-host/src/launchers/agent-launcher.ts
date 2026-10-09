/**
 * One browser-safe launcher for every process (W6 RH-S2, guide option one-launcher): the portable host core over a
 * platform's {@link ChatStore}. The daemon, the desktop utility and the resident browser worker build it the same
 * way; only the store differs.
 *
 * Always-on is the defining property: `start` and `resume` return once the admission is durable, and the run then
 * continues with zero attached clients. Run execution is independent of a connection's lifetime (D17).
 *
 * Reads never create a chat, take a lock or assume leadership (RH-R1): `read` and `attach` read the log's bytes as
 * they are, unless this process already writes the chat, whose host then answers the long poll from its writer.
 */

import { sameSourceHealth } from '#log/projection-facts.js';
import type { ProjectionSourceHealth } from '#log/projection-facts.js';
import { isOrphaned } from '#host/chat-run.machine.js';
import { createTauAgentHost } from '#host/tau-agent-host.js';
import type { ExternalAgentPort } from '#host/external-agent.js';
import type { CreateTauAgentHostOptions, TauAgentHost } from '#host/tau-agent-host.js';
import { externalTurnOf, latestTurnId } from '#host/run-history.js';
import { createPortableId, transportFailureOfRun } from '#harness/session-record.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import { emptyChatLedger, foldChatLedger } from '#log/chat-ledger.js';
import type { ChatLedger } from '#log/chat-ledger.js';
import type { AgentLogEvent, JsonValue } from '#log/event-types.js';
import type {
  AgentLiveEvent,
  SourceLiveEvent,
  DurableEventLog,
  HostRunSnapshot,
  InterruptRequest,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import { catchUpRequestSchema } from '#wire/frames.schema.js';
import type { CatchUpFrame, CatchUpInput, ReadAnswer, ReadInput } from '#wire/frames.schema.js';
import type { RefusalCode } from '#wire/refusals.js';
import { chatStoreBinding, requireChatPathSegment } from '#launchers/chat-store.js';
import { createReplayView, isBytePrefix } from '#launchers/replay-view.js';
import type { ReplayView } from '#launchers/replay-view.js';
import type { ChatStore, LeadershipPort } from '#launchers/chat-store.js';

/**
 * Whether this host may admit a Tau run (RH-R13): only `unpaired` refuses, with `HOST_NOT_PAIRED`. `principal` is the
 * account the gateway charges, when the composition root knows it; the funded transport answers `principal()` from it
 * (W11 GI-Q6).
 *
 * @public
 */
export type CredentialState =
  | Readonly<{ mode: 'unpaired' }>
  | Readonly<{ mode: 'paired'; bearer: string; principal?: string | undefined }>
  | Readonly<{ mode: 'session'; principal?: string | undefined }>;

/**
 * The account a credential names, for a funded transport's `principal()`.
 *
 * @param state - The credential now.
 * @returns The account id, or `undefined` when unpaired or unknown.
 * @public
 */
export const credentialPrincipal = (state: CredentialState): string | undefined =>
  state.mode === 'unpaired' ? undefined : state.principal;

/** Options for {@link createAgentLauncher}. @public */
export type AgentLauncherOptions = Readonly<{
  /** The platform half: `createNodeChatStore` or `createBrowserChatStore`. */
  chats: ChatStore;
  modelTransport: ModelTransport;
  /** Read at every Tau admission; never captured (RH-R13). */
  credential: () => CredentialState;
  /** Default system prompt; one admission may override it. */
  systemPrompt: string;
  systemPromptBlocks?: CreateTauAgentHostOptions['systemPromptBlocks'];
  /** Default model row for a Tau `start` that names none; omit it and such a start is refused. */
  model?: CreateTauAgentHostOptions['model'];
  /** Tools visible to every run. */
  toolRegistry: ToolRegistry;
  /** External agents; omit and a `start` naming one is refused `EXTERNAL_AGENT_UNAVAILABLE`. */
  externalAgents?: ExternalAgentPort | undefined;
  createId?: (() => string) | undefined;
  clientContext?: CreateTauAgentHostOptions['clientContext'];
  /**
   * W8's placement port for this project (TS-S4, TS-S5): when given, every attempt is placed, settled and acknowledged
   * (RA-R12), each attempt runs on its grant's tools, and the launcher reconciles the chats whose leases it holds when
   * it opens and on each `leaseHeld` fact (RH-R16).
   */
  turnPlacement?: CreateTauAgentHostOptions['placement'];
  /** The host's timers (M1's idle eviction and bounds); the defaults when absent. */
  delays?: CreateTauAgentHostOptions['delays'];
  /** The clock every incarnation runs on; the process's timers when absent. */
  clock?: CreateTauAgentHostOptions['clock'];
  /**
   * Whether this launcher admits the run a `start` or `resume` names, read per command. While it answers `false` (a
   * host draining its live runs before it closes, T3), the command is refused `HOST_CLOSED`, unless it is a re-send of one already
   * applied or its chat has a live run, which the host answers as ever (`replayed`, `CHAT_RUN_LIVE`). Another tab that
   * forwarded it keeps it for this host's release or a successor (M2, C11); a client of this host is answered. Every
   * other verb is served.
   */
  admitting?: ((run: Readonly<{ chatId: string; runId: string }>) => boolean) | undefined;
}>;

/** A running launcher: one per project, in any process. @public */
export type AgentLauncher = {
  /** The assembled host, for callers that need the lifecycle surface directly. */
  readonly host: TauAgentHost;
  /** Answer one keyed command (SC-R4–SC-R9); a refusal is an answer with a code, never a throw. */
  execute(command: HostCommand): Promise<CommandAnswer>;
  /** One long-poll read (SC-R14). It never creates a chat, takes no lock and assumes no leadership (RH-R1). */
  read(input: ReadInput): Promise<ReadAnswer>;
  /** Immutable provisional catch-up pages followed by exact current-byte validation; cancellation releases the lease. */
  catchUp(input: CatchUpInput): AsyncIterable<CatchUpFrame>;
  /** Read the current leadership actor only; never requests a lock or sends a chat command. */
  stoppability(chatId: string): 'stoppable' | 'other-build' | 'background-window';
  /** Ephemeral model deltas for one chat, bounded per subscriber (SC-R15). */
  liveEvents(input: Readonly<{ chatId: string; signal: AbortSignal }>): AsyncIterable<SourceLiveEvent>;
  /** Unresolved approval requests for one run. */
  pendingInterrupts(runId: string): Promise<readonly InterruptRequest[]>;
  /**
   * The runs this launcher admitted, by chat: every `start` and `resume` it ran, whether a client or another tab sent
   * it. It resolves once each one under way has its answer, so a run that was refused, or whose admission threw, is not
   * among them. A drain follows them (T3). A copy.
   */
  admittedRuns(): Promise<ReadonlyMap<string, ReadonlySet<string>>>;
  close(): Promise<void>;
};

/**
 * Events a subscriber may leave unread before it is dropped (RH-A24). A subscriber this far behind has stopped
 * reading; it re-reads from its cursor, which is what the durable log is for.
 */
const fanOutQueueLimit = 1024;

/**
 * Read a stream as an async iterable through its reader: WebKit's `ReadableStream` has no `Symbol.asyncIterator`, and
 * the launcher runs in browser workers. Returning early cancels the stream.
 *
 * @param stream - The stream to read.
 * @returns Its chunks, in order.
 * @internal
 */
export const iterateStream = async function* <Chunk>(stream: ReadableStream<Chunk>): AsyncGenerator<Chunk> {
  const reader = stream.getReader();
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- one chunk at a time, by construction.
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      yield value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
};

/** A multi-subscriber fan-out of live deltas, one chat per subscriber, that never blocks the producer (SC-R15). */
const createFanOut = <Event extends { readonly chatId: string }>(own: (chatId: string) => () => void) => {
  const controllers = new Map<
    ReadableStreamDefaultController<Event>,
    { chatId: string; close: (reason?: Error) => void }
  >();
  let closed = false;
  const drop = (controller: ReadableStreamDefaultController<Event>, reason?: Error): void => {
    controllers.get(controller)?.close(reason);
  };
  return {
    publish: (event: Event): void => {
      for (const [controller, { chatId }] of controllers) {
        if (chatId !== event.chatId) {
          continue;
        }
        /* An unbounded queue would grow this process's heap for every event of a run nobody consumes. */
        if ((controller.desiredSize ?? 0) < -fanOutQueueLimit) {
          drop(controller, new Error('This subscriber fell too far behind; reattach from its cursor.'));
          continue;
        }
        /* A subscriber whose connection died throws on `enqueue`; it must never fail the run it only watched. */
        try {
          controller.enqueue(event);
        } catch {
          drop(controller);
        }
      }
    },
    subscribe: (signal: AbortSignal, chatId: string): AsyncIterable<Event> => {
      let cleanup = (): void => undefined;
      const receive = async function* (): AsyncGenerator<Event> {
        const stream = new ReadableStream<Event>({
          start(controller) {
            if (closed || signal.aborted) {
              controller.close();
              return;
            }
            const release = own(chatId);
            let active = true;
            const close = (reason?: Error): void => {
              if (!active) {
                return;
              }
              active = false;
              controllers.delete(controller);
              try {
                if (reason === undefined) {
                  controller.close();
                } else {
                  controller.error(reason);
                }
              } catch {
                /* A `drop` or the fan-out's close already ended this controller. */
              }
              signal.removeEventListener('abort', abort);
              release();
            };
            const abort = (): void => {
              close();
            };
            cleanup = close;
            controllers.set(controller, { chatId, close });
            signal.addEventListener('abort', abort, { once: true });
          },
          cancel: () => {
            cleanup();
          },
        });
        yield* iterateStream(stream);
      };
      const iterator = receive();
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () => iterator.next(),
          return: async () => {
            // Wake a parked next before the generator queues its return behind that read.
            cleanup();
            return iterator.return(undefined);
          },
        }),
      };
    },
    close: (): void => {
      closed = true;
      for (const { close } of controllers.values()) {
        close();
      }
    },
  };
};

const refused = (commandId: string, code: RefusalCode | string, message: string): CommandAnswer => ({
  commandId,
  generation: 0,
  status: 'refused',
  effect: 'not-applied',
  code,
  message,
});

type SourceObservation = {
  ready: Promise<void>;
  failure: AbortSignal;
  failed: boolean;
  references: number;
  retained: boolean;
  close(): void;
};

type ChatView = ReplayView;

/**
 * The chat's run as a read sees it, the same projection `describeRun` answers.
 *
 * @param chatId - The chat.
 * @param view - Its read-only view.
 * @returns The run, or `undefined` when the chat has none.
 */
const runOf = async (chatId: string, view: ChatView): Promise<HostRunSnapshot | undefined> => {
  const runId = view.ledger.currentRunId;
  if (runId === undefined) {
    return undefined;
  }
  const events = await view.log.read();
  const messages = await view.log.messages();
  const entry = view.ledger.runs[runId];
  const failure = transportFailureOfRun({ events, messages, runId }) ?? entry?.failure;
  return {
    chatId,
    runId,
    turnId: entry?.turnId ?? latestTurnId(messages, runId),
    state: entry?.lifecycle ?? 'admitted',
    messages,
    ...(failure ? { failure } : {}),
  };
};

/**
 * Assemble one always-on agent launcher over a platform's chat store.
 *
 * @param options - The store, transport, credential, prompt, model and tools.
 * @returns A launcher answering the agent wire's verbs and reads.
 * @public
 *
 * @example <caption>A Node launcher over one workspace</caption>
 * ```typescript
 * import { createGatewayModelTransport } from '@taucad/agent-host';
 * import type { ToolRegistry } from '@taucad/agent-host';
 * import { createAgentLauncher } from '@taucad/agent-host/launcher';
 * import { createNodeChatStore } from '@taucad/agent-host/node';
 *
 * declare const toolRegistry: ToolRegistry;
 * const launcher = createAgentLauncher({
 *   chats: createNodeChatStore({ workspaceRoot: process.cwd() }),
 *   modelTransport: createGatewayModelTransport({ baseUrl: 'https://api.tau.new/' }),
 *   credential: () => ({ mode: 'session' }),
 *   systemPrompt: 'You are Tau.',
 *   toolRegistry,
 * });
 * await launcher.close();
 * ```
 */
export const createAgentLauncher = (options: AgentLauncherOptions): AgentLauncher => {
  const binding = chatStoreBinding(options.chats);
  const createId = options.createId ?? createPortableId;
  const liveOwners = new Map<string, number>();
  const live = createFanOut<SourceLiveEvent>((chatId) => {
    liveOwners.set(chatId, (liveOwners.get(chatId) ?? 0) + 1);
    cancelRetirement(chatId);
    return () => {
      const remaining = (liveOwners.get(chatId) ?? 1) - 1;
      if (remaining > 0) {
        liveOwners.set(chatId, remaining);
      } else {
        liveOwners.delete(chatId);
        pruneReplay();
        retireOversized(chatId);
      }
    };
  });
  /** Chats whose writer this process holds open: their reads are the host's long poll. */
  const writers = new Set<string>();
  const writerGenerations = new Map<string, string>();
  const replay = new Map<string, ReplayView>();
  const pinned = new Map<ReplayView, number>();
  const acquiring = new Map<string, Promise<ReplayView>>();
  const observations = new Map<string, SourceObservation>();
  const activeReads = new Map<string, number>();
  const retirements = new Map<string, ReturnType<typeof setTimeout>>();
  const replayChatLimit = 32;
  const replayByteLimit = 32 * 1024 * 1024;
  /** Milliseconds. */
  const oversizedReplayIdle = 2000;
  /** A writer M2's `readView` opened, handed to the chat's next incarnation (one open, one read: RH-R9). */
  const views = new Map<string, Promise<EventLogAppender>>();
  /**
   * Reads parked on a chat this process does not write. A `writer` wake continues the long poll on this process's
   * writer; a `reroute` wake (the chat's holder changed) answers at once, so the reader's next read is routed anew.
   */
  const parked = new Map<string, Set<(reason: 'writer' | 'reroute' | 'source') => void>>();
  /**
   * The read passes over a chat's bytes in flight, and the wakes during them: a pass a wake overtook answers instead of
   * parking past it. An entry lives only while a pass does.
   */
  const passes = new Map<string, { count: number; wakes: number; sourceWakes: number }>();
  /** Chats some verb has named: the first one checks for a run with no driver (RH-R1, RH-R15). */
  const named = new Set<string>();
  const stopped = new AbortController();
  let closed = false;
  let closing: Promise<void> | undefined;
  /* Set once the leadership binding exists; the host's callbacks before then have no chat to report. */
  const leading: { port?: LeadershipPort } = {};

  const wakeReads = (chatId: string, reason: 'writer' | 'reroute' | 'source' = 'writer'): void => {
    const pass = passes.get(chatId);
    if (pass !== undefined) {
      pass.wakes += 1;
      if (reason === 'source') {
        pass.sourceWakes += 1;
      }
    }
    const waiting = parked.get(chatId);
    parked.delete(chatId);
    for (const wake of waiting ?? []) {
      wake(reason);
    }
  };

  const cancelRetirement = (chatId: string): void => {
    const timer = retirements.get(chatId);
    if (timer !== undefined) {
      clearTimeout(timer);
      retirements.delete(chatId);
    }
  };

  const dropObservation = (chatId: string): void => {
    cancelRetirement(chatId);
    const observation = observations.get(chatId);
    if (observation === undefined) {
      return;
    }
    observation.retained = false;
    if (observation.references === 0) {
      observations.delete(chatId);
      acquiring.delete(chatId);
      observation.close();
    }
  };

  const pruneReplay = (): void => {
    // Active readers are additive to the inactive normal budget; one idle oversized view is retained separately.
    // The existing exact-owner idle timer retires that last view; pruning must not bypass it.
    let idleOversized: string | undefined;
    for (const [key, entry] of replay) {
      if (
        entry.bytes.byteLength > replayByteLimit &&
        !pinned.has(entry) &&
        (activeReads.get(key) ?? 0) === 0 &&
        !liveOwners.has(key)
      ) {
        if (idleOversized !== undefined) {
          replay.delete(idleOversized);
          dropObservation(idleOversized);
        }
        idleOversized = key;
      }
    }
    const counted = [...replay].filter(
      ([key, entry]) =>
        entry.bytes.byteLength <= replayByteLimit &&
        !pinned.has(entry) &&
        (activeReads.get(key) ?? 0) === 0 &&
        !liveOwners.has(key),
    );
    let retained = counted.reduce((total, [, entry]) => total + entry.bytes.byteLength, 0);
    let sources = counted.length;
    for (const [key, entry] of counted) {
      if (sources <= replayChatLimit && retained <= replayByteLimit) {
        break;
      }
      replay.delete(key);
      dropObservation(key);
      retained -= entry.bytes.byteLength;
      sources--;
    }
  };

  // Retirement bounds inactive oversized retention; time never proves source equality.
  const retireOversized = (chatId: string): void => {
    cancelRetirement(chatId);
    const current = replay.get(chatId);
    if (
      closed ||
      current === undefined ||
      current.bytes.byteLength <= replayByteLimit ||
      (activeReads.get(chatId) ?? 0) > 0 ||
      liveOwners.has(chatId) ||
      acquiring.has(chatId)
    ) {
      return;
    }
    const owner = observations.get(chatId);
    const timer = setTimeout(() => {
      if (retirements.get(chatId) !== timer) {
        return;
      }
      retirements.delete(chatId);
      if (
        replay.get(chatId) === current &&
        observations.get(chatId) === owner &&
        (activeReads.get(chatId) ?? 0) === 0 &&
        !liveOwners.has(chatId) &&
        !acquiring.has(chatId)
      ) {
        replay.delete(chatId);
        dropObservation(chatId);
      }
    }, oversizedReplayIdle);
    retirements.set(chatId, timer);
  };

  const acquireObservation = (chatId: string): SourceObservation => {
    const prior = observations.get(chatId);
    if (prior !== undefined && !prior.failed) {
      prior.references++;
      return prior;
    }
    const controller = new AbortController();
    const failure = new AbortController();
    let release: (() => void) | undefined;
    const observation: SourceObservation = {
      ready: Promise.resolve(),
      failure: failure.signal,
      failed: false,
      references: 1,
      retained: false,
      close: () => {
        controller.abort();
        release?.();
        release = undefined;
      },
    };
    observations.set(chatId, observation);
    const fail = (): void => {
      if (!controller.signal.aborted) {
        observation.failed = true;
        failure.abort();
        if (observations.get(chatId) === observation) {
          replay.delete(chatId);
          acquiring.delete(chatId);
          wakeReads(chatId, 'source');
          dropObservation(chatId);
        }
      }
    };
    const observe = async (): Promise<void> => {
      try {
        const unsubscribe = await binding.observeBytes!(chatId, {
          signal: controller.signal,
          onChange: () => {
            if (!controller.signal.aborted && observations.get(chatId) === observation) {
              wakeReads(chatId, 'source');
            }
          },
          onError: fail,
        });
        if (controller.signal.aborted) {
          unsubscribe();
        } else {
          release = unsubscribe;
        }
      } catch {
        fail();
      }
    };
    observation.ready = observe();
    return observation;
  };

  const openEventLog = async (chatId: string): Promise<DurableEventLog> => {
    requireChatPathSegment(chatId);
    const handed = views.get(chatId);
    views.delete(chatId);
    const log = await (handed ?? binding.openWriter(chatId));
    writers.add(chatId);
    writerGenerations.set(chatId, createPortableId());
    acquiring.delete(chatId);
    replay.delete(chatId);
    dropObservation(chatId);
    wakeReads(chatId);
    return {
      append: async (candidate: AgentLogEvent) => {
        try {
          const outcome = await log.append(
            /* The binding's durability class, stated on the run's admission (W3 §11). */
            candidate.type === 'run.lifecycle' && candidate.state === 'admitted'
              ? { ...candidate, storageDurability: binding.durability }
              : candidate,
          );
          if (outcome.appended) {
            leading.port?.appended(chatId, outcome.endCursor);
          }
          return outcome;
        } catch (error) {
          if ((error as { readonly code?: unknown }).code === 'LOG_FENCED') {
            leading.port?.fenced(chatId);
          }
          throw error;
        }
      },
      read: async () => log.read(),
      readBatch: async (input) => log.readBatch(input),
      messages: async () => log.messages(),
      historyIntact: async () => log.historyIntact(),
      anomalies: async () => log.anomalies(),
      close: async () => {
        writers.delete(chatId);
        writerGenerations.delete(chatId);
        await log.close();
      },
    };
  };

  const host: TauAgentHost = createTauAgentHost({
    systemPrompt: options.systemPrompt,
    ...(options.systemPromptBlocks ? { systemPromptBlocks: options.systemPromptBlocks } : {}),
    ...(options.model ? { model: options.model } : {}),
    modelTransport: options.modelTransport,
    toolRegistry: options.toolRegistry,
    openEventLog,
    attachments: binding.attachments,
    createId,
    ...(options.clientContext === undefined ? {} : { clientContext: options.clientContext }),
    ...(options.externalAgents ? { externalRunners: { acp: options.externalAgents } } : {}),
    ...(options.turnPlacement === undefined ? {} : { placement: options.turnPlacement }),
    ...(options.delays === undefined ? {} : { delays: options.delays }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    onLiveEvent: (event: AgentLiveEvent) => {
      const sourceGeneration = writerGenerations.get(event.chatId);
      if (sourceGeneration === undefined) {
        return;
      }
      const qualified = { ...event, sourceGeneration };
      live.publish(qualified);
      leading.port?.liveEvent(qualified);
    },
    onChatQuiescent: (chatId, quiescent) => {
      leading.port?.quiescent(chatId, quiescent);
    },
  });

  /** The runs this launcher admitted, by chat (T3). ponytail: kept for the launcher's life; a drain re-reads them. */
  const admitted = new Map<string, Set<string>>();
  /** The counted admissions not yet answered, which `admittedRuns` waits for (W6.r1 round 5). */
  const answering = new Set<Promise<unknown>>();

  /**
   * T3: while draining, whether this admission goes to the host rather than being refused `HOST_CLOSED`: its command
   * was already applied, or the chat's current run is admitted or running. The host answers either as it would
   * otherwise; this reads the ledger only and does not say which answer that is.
   */
  const answeredAsEver = async (chatId: string, commandId: string): Promise<boolean> => {
    const ledger = await host.ledger(chatId);
    const lifecycle = ledger.currentRunId === undefined ? undefined : ledger.runs[ledger.currentRunId]?.lifecycle;
    return ledger.applied[commandId] !== undefined || lifecycle === 'admitted' || lifecycle === 'running';
  };

  /**
   * Run one command in this process. A settlement record travels as a keyed pseudo-command, so the chat's writer
   * appends it wherever that writer is (another tab's, through M2). Deleted with W8's host-appended settlement.
   */
  const runHere = async (command: HostCommand): Promise<CommandAnswer> => {
    if (command.type === 'start' || command.type === 'resume') {
      const { chatId, runId } = command.payload;
      if (options.admitting?.({ chatId, runId }) === false && !(await answeredAsEver(chatId, command.commandId))) {
        return refused(
          command.commandId,
          'HOST_CLOSED' satisfies RefusalCode,
          'This project host is closing and starts no new run. Send the message again once the project is open.',
        );
      }
      /* Counted before it runs, so a drain that begins meanwhile waits for its answer (T3); dropped if it is refused
       * or its admission throws. */
      const runs = admitted.get(chatId) ?? new Set<string>();
      const counted = !runs.has(runId);
      admitted.set(chatId, runs.add(runId));
      const answered = (async () => {
        let admittedHere = false;
        try {
          const answer = await host.command(command);
          admittedHere = answer.status !== 'refused';
          return answer;
        } finally {
          if (counted && !admittedHere) {
            runs.delete(runId);
            if (runs.size === 0 && admitted.get(chatId) === runs) {
              admitted.delete(chatId);
            }
          }
        }
      })();
      answering.add(answered);
      try {
        return await answered;
      } finally {
        answering.delete(answered);
      }
    }
    return host.command(command);
  };

  const port: LeadershipPort = binding.leadership({
    openView: async (chatId) => {
      const opening = views.get(chatId) ?? binding.openWriter(chatId);
      views.set(chatId, opening);
      try {
        const log = await opening;
        const ledger = foldChatLedger(emptyChatLedger, await log.read());
        return { kind: 'read', epoch: ledger.maxEpoch + 1 };
      } catch (error) {
        if (views.get(chatId) === opening) {
          views.delete(chatId);
        }
        const { code } = error as { readonly code?: unknown };
        if (code === 'WRITER_LOCKED') {
          return { kind: 'refused', code };
        }
        throw error;
      }
    },
    dropView: async (chatId) => {
      const opening = views.get(chatId);
      views.delete(chatId);
      const log = await opening?.catch(() => undefined);
      await log?.close();
    },
    assume: (chatId, epoch) => {
      host.assumeLeadership(chatId, epoch);
    },
    claim: async (chatId) => {
      const claim = await host.claim(chatId);
      if ('refused' in claim && claim.refused.status === 'refused' && claim.refused.code !== 'HOST_CLOSED') {
        console.error('[agent-launcher] a claim was refused', chatId, claim.refused.code, claim.refused.message);
      }
    },
    relinquish: async (chatId) => {
      await host.relinquish(chatId);
      wakeReads(chatId, 'reroute');
    },
    execute: async (command) => runHere(command),
    read: async (input) => readLocal(input),
    writing: (chatId) => writers.has(chatId),
    wakeReads: (chatId) => {
      wakeReads(chatId, 'reroute');
    },
    publishLive: (event) => {
      live.publish(event);
    },
  });
  leading.port = port;

  const view = async (chatId: string): Promise<ChatView> => {
    cancelRetirement(chatId);
    const underway = acquiring.get(chatId);
    if (underway !== undefined) {
      return underway;
    }
    const source = observations.get(chatId);
    const acquire = async (): Promise<ReplayView> => {
      const bytes = await binding.readBytes(chatId);
      if (acquiring.get(chatId) !== acquisition || observations.get(chatId) !== source || source?.failed === true) {
        return createReplayView(bytes, createPortableId());
      }
      const prior = replay.get(chatId);
      const prefix = prior !== undefined && isBytePrefix(prior.bytes, bytes);
      const current = prefix
        ? prior.bytes.byteLength === bytes.byteLength
          ? prior
          : prior.extend(bytes)
        : createReplayView(bytes, createPortableId());
      if (!closed && observations.get(chatId) === source) {
        replay.delete(chatId);
        replay.set(chatId, current);
        const observation = observations.get(chatId);
        if (observation !== undefined) {
          observation.retained = true;
        }
        pruneReplay();
      }
      return current;
    };
    const acquisition = acquire();
    acquiring.set(chatId, acquisition);
    try {
      return await acquisition;
    } finally {
      if (acquiring.get(chatId) === acquisition) {
        acquiring.delete(chatId);
        retireOversized(chatId);
      }
    }
  };

  /* RH-R16, TS-R16: a lease the placement names is a chat to reconcile, queuing for its lock (`wait`). At open: every
   * held lease; then each `leaseHeld` fact, for this launcher's life. */
  const placing = new AbortController();
  const reconcileHeld = async (turnPlacement: NonNullable<AgentLauncherOptions['turnPlacement']>): Promise<void> => {
    const answer = await turnPlacement.reconcile({ requestId: `reconcile:${createId()}` });
    if (answer.status !== 'refused') {
      for (const chatId of new Set(answer.held.map((held) => held.key.chatId))) {
        port.reconcile(chatId, { wait: true });
      }
    }
    for await (const fact of turnPlacement.settlements({ signal: placing.signal })) {
      if (fact.kind === 'leaseHeld') {
        port.reconcile(fact.key.chatId, { wait: true });
      }
    }
  };
  if (options.turnPlacement !== undefined) {
    const { turnPlacement } = options;
    // async-iife: bootstrap -- the placement listen lives as long as this launcher; `close` aborts it.
    void (async (): Promise<void> => {
      try {
        await reconcileHeld(turnPlacement);
      } catch (error) {
        /* A dead session ends the listen; the next session's launcher reconciles again. */
        if (!placing.signal.aborted) {
          console.error('[agent-launcher] the placement listen ended', error);
        }
      }
    })();
  }

  /** RH-R1: the first verb naming a chat, and any attach, that finds a run no driver here holds asks for a claim. */
  const checkDriver = (chatId: string, ledger: ChatLedger, always: boolean): boolean => {
    const first = !named.has(chatId);
    named.add(chatId);
    if (!first && !always) {
      return false;
    }
    /* M1's own predicate (RH-R9): a paused external run and its pending interrupts are orphans too. */
    if (!isOrphaned(ledger) || writers.has(chatId)) {
      return false;
    }
    port.reconcile(chatId, { wait: true });
    return true;
  };

  /**
   * RH-R1: `attach` is a read. Its answer is the chat as the log holds it and this process's role. `takeover` says only
   * that the log shows a run no driver here holds, so this attach asked M2 for the chat's claim; that claim, not the
   * attach, writes the run's outcome (`RUN_ABANDONED`) once it wins the chat's lock, and writes nothing while another
   * tab leads. A caller that sees it keeps watching the chat for that outcome.
   */
  const attach = async (commandId: string, chatId: string): Promise<CommandAnswer> => {
    const chat = await view(chatId);
    const driverless = checkDriver(chatId, chat.ledger, true);
    const run = await runOf(chatId, chat);
    return {
      commandId,
      generation: chat.ledger.maxEpoch,
      status: 'applied',
      effect: 'not-applied',
      details: {
        ...(run === undefined ? {} : { snapshot: run as unknown as JsonValue }),
        takeover: driverless,
        endCursor: chat.ledger.position.cursor,
        role: port.role(chatId).role,
      },
    };
  };

  /** RH-R13: a Tau admission needs a credential; reads and external-agent turns do not. */
  const notPaired = async (command: HostCommand): Promise<boolean> => {
    if (options.credential().mode !== 'unpaired') {
      return false;
    }
    if (command.type === 'start') {
      return command.payload.config?.agent === undefined;
    }
    if (command.type === 'resume') {
      const chat = await view(command.payload.chatId);
      const events = await chat.log.read();
      return externalTurnOf(events) === undefined;
    }
    return false;
  };

  const execute = async (command: HostCommand): Promise<CommandAnswer> => {
    if (closed) {
      return refused(command.commandId, 'HOST_CLOSED', 'The Tau agent launcher is closed.');
    }
    const { chatId } = command.payload;
    try {
      requireChatPathSegment(chatId);
    } catch (error) {
      return refused(command.commandId, 'STORAGE_PATH_INVALID', error instanceof Error ? error.message : String(error));
    }
    if (command.type === 'attach') {
      return attach(command.commandId, chatId);
    }
    if (await notPaired(command)) {
      return refused(
        command.commandId,
        'HOST_NOT_PAIRED' satisfies RefusalCode,
        'This Tau host is not paired with your account, so it cannot start a Tau run. Pair it (the `tau serve` terminal shows a code), then send the message again. Reading chats and external agents keep working.',
      );
    }
    named.add(chatId);
    return port.execute(chatId, command, async (epoch) => {
      if (typeof epoch === 'number') {
        host.assumeLeadership(chatId, epoch);
      }
      return runHere(command);
    });
  };

  /** Park until this process writes the chat, its holder changes, the reader lets go, or the launcher closes. */
  const park = async (chatId: string, signal: AbortSignal | undefined): Promise<'writer' | 'reroute' | 'source'> =>
    new Promise<'writer' | 'reroute' | 'source'>((resolve) => {
      if (signal?.aborted) {
        resolve('reroute');
        return;
      }
      const waiting = parked.get(chatId) ?? new Set<(reason: 'writer' | 'reroute' | 'source') => void>();
      parked.set(chatId, waiting);
      const aborted = (): void => {
        wake('reroute');
      };
      const wake = (reason: 'writer' | 'reroute' | 'source'): void => {
        waiting.delete(wake);
        if (waiting.size === 0 && parked.get(chatId) === waiting) {
          parked.delete(chatId);
        }
        signal?.removeEventListener('abort', aborted);
        resolve(reason);
      };
      waiting.add(wake);
      signal?.addEventListener('abort', aborted, { once: true });
    });

  /** A read this process serves: from its writer when it has one, else from the bytes as they are. */
  const readCurrent = async (input: ReadInput, health: { failed: boolean }): Promise<ReadAnswer> => {
    const { signal, ...request } = input;
    const { chatId } = request;
    const sourceFailed = (): boolean => health.failed;
    for (;;) {
      if (sourceFailed()) {
        return { status: 'refused', chatId, reason: 'unreadable' };
      }
      if (writers.has(chatId)) {
        const sourceGeneration = writerGenerations.get(chatId)!;
        if ((input.cursor > 0 || input.sourceGeneration !== undefined) && input.sourceGeneration !== sourceGeneration) {
          return { status: 'refused', chatId, reason: 'identity-mismatch', expected: { sourceGeneration } };
        }
        // oxlint-disable-next-line no-await-in-loop -- the writer owns the long poll for this iteration.
        const answer = await host.read(
          input.sourceGeneration === sourceGeneration ? input : { ...input, sourceHealth: undefined },
        );
        return answer.status === 'batch' ? { ...answer, sourceGeneration } : answer;
      }
      const pass = passes.get(chatId) ?? { count: 0, wakes: 0, sourceWakes: 0 };
      passes.set(chatId, pass);
      pass.count += 1;
      const woken = pass.wakes;
      let answer: Awaited<ReturnType<ChatView['log']['readBatch']>>;
      let sourceGeneration: string;
      let sourceHealth: ProjectionSourceHealth;
      try {
        // oxlint-disable-next-line no-await-in-loop -- one pass over the bytes per wake.
        const chat = await view(chatId);
        // A writer admitted while acquisition was suspended owns the answer, including an initially empty source.
        if (writers.has(chatId)) {
          continue;
        }
        sourceGeneration = chat.generation;
        sourceHealth = chat.sourceHealth;
        if ((input.cursor > 0 || input.sourceGeneration !== undefined) && input.sourceGeneration !== sourceGeneration) {
          return { status: 'refused', chatId, reason: 'identity-mismatch', expected: { sourceGeneration } };
        }
        checkDriver(chatId, chat.ledger, false);
        // oxlint-disable-next-line no-await-in-loop -- the view answers at once.
        answer = await chat.log.readBatch(request);
      } finally {
        pass.count -= 1;
        if (pass.count === 0) {
          passes.delete(chatId);
        }
      }
      if (sourceFailed()) {
        return { status: 'refused', chatId, reason: 'unreadable' };
      }
      if (answer.status === 'refused') {
        return { status: 'refused', chatId, reason: answer.reason, expected: answer.expected };
      }
      const batch: ReadAnswer = {
        status: 'batch',
        chatId,
        sourceGeneration,
        sourceHealth,
        cursor: answer.cursor,
        nextCursor: answer.nextCursor,
        endCursor: answer.endCursor,
        events: [...answer.events],
      };
      /* A wake while this pass read the bytes (a writer opened, or the holder changed) has no waiter to reach: answer
       * now, and the reader's next read is routed anew. */
      if (
        answer.events.length > 0 ||
        input.sourceGeneration !== sourceGeneration ||
        !sameSourceHealth(input.sourceHealth, sourceHealth) ||
        closed ||
        signal?.aborted === true ||
        pass.wakes !== woken
      ) {
        return batch;
      }
      // oxlint-disable-next-line no-await-in-loop -- the park is the long poll.
      if ((await park(chatId, signal)) === 'reroute') {
        return batch;
      }
    }
  };

  const readObserved = async (input: ReadInput): Promise<ReadAnswer> => {
    if (binding.observeBytes === undefined || writers.has(input.chatId) || input.signal?.aborted === true) {
      return readCurrent(input, { failed: false });
    }
    const observation = acquireObservation(input.chatId);
    const controller = new AbortController();
    const ended = Promise.withResolvers<void>();
    const failure = Promise.withResolvers<void>();
    const failed = (): void => {
      failure.resolve();
    };
    observation.failure.addEventListener('abort', failed, { once: true });
    if (observation.failure.aborted) {
      failed();
    }
    const abort = (): void => {
      controller.abort();
      ended.resolve();
    };
    input.signal?.addEventListener('abort', abort, { once: true });
    stopped.signal.addEventListener('abort', abort, { once: true });
    // Cancellation before observation cannot fabricate a generation-qualified health batch.
    const cancelled = (): never => {
      throw new DOMException('The read was aborted before an authoritative observation.', 'AbortError');
    };

    const unavailable = (): ReadAnswer => ({ status: 'refused', chatId: input.chatId, reason: 'unreadable' });
    const finishAborted = async (): Promise<ReadAnswer> => {
      await ended.promise;
      return cancelled();
    };
    const finishFailed = async (): Promise<ReadAnswer> => {
      await failure.promise;
      return unavailable();
    };
    try {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Observer acquisition invokes external callbacks which can abort after the initial guard.
      if (stopped.signal.aborted || input.signal?.aborted) {
        abort();
      }
      await Promise.race([observation.ready, ended.promise, failure.promise]);
      if (observation.failed) {
        return unavailable();
      }
      if (controller.signal.aborted) {
        return cancelled();
      }
      return await Promise.race([
        readCurrent({ ...input, signal: controller.signal }, observation),
        finishAborted(),
        finishFailed(),
      ]);
    } catch (error) {
      if (controller.signal.aborted) {
        throw error;
      }
      if (observations.get(input.chatId) === observation) {
        replay.delete(input.chatId);
        dropObservation(input.chatId);
      }
      return unavailable();
    } finally {
      observation.failure.removeEventListener('abort', failed);
      abort();
      observation.references--;
      if (!observation.retained || observation.failed) {
        if (observations.get(input.chatId) === observation) {
          dropObservation(input.chatId);
        } else if (observation.references === 0) {
          observation.close();
        }
      }
      input.signal?.removeEventListener('abort', abort);
      stopped.signal.removeEventListener('abort', abort);
    }
  };

  const readLocal = async (input: ReadInput): Promise<ReadAnswer> => {
    if (input.signal?.aborted) {
      throw new DOMException('The read was aborted.', 'AbortError');
    }
    const { chatId } = input;
    cancelRetirement(chatId);
    activeReads.set(chatId, (activeReads.get(chatId) ?? 0) + 1);
    try {
      return await readObserved(input);
    } finally {
      const remaining = (activeReads.get(chatId) ?? 1) - 1;
      if (remaining === 0) {
        activeReads.delete(chatId);
        pruneReplay();
        retireOversized(chatId);
      } else {
        activeReads.set(chatId, remaining);
      }
    }
  };

  const catchUp = async function* (input: CatchUpInput): AsyncGenerator<CatchUpFrame> {
    const { signal, ...request } = input;
    const { chatId, limit, maxBytes } = catchUpRequestSchema.parse(request);
    requireChatPathSegment(chatId);
    const refusal = (
      reason: 'writer-owned' | 'capacity-exceeded' | 'identity-mismatch' | 'unreadable',
    ): CatchUpFrame => ({ type: 'refused', answer: { status: 'refused', chatId, reason } });
    if (closed) {
      throw Object.assign(new Error('The Tau agent launcher is closed.'), {
        code: 'HOST_CLOSED' satisfies RefusalCode,
      });
    }
    if (signal?.aborted) {
      return;
    }
    if (writers.has(chatId) || port.role(chatId).role === 'follower') {
      yield refusal('writer-owned');
      return;
    }
    const observation = binding.observeBytes === undefined ? undefined : acquireObservation(chatId);
    const ended = Promise.withResolvers<void>();
    const pass = passes.get(chatId) ?? { count: 0, wakes: 0, sourceWakes: 0 };
    passes.set(chatId, pass);
    pass.count++;
    let captured: ReplayView | undefined;
    let proof: ReplayView | undefined;
    const captureReleased = (): boolean => captured === undefined;
    let pinnedCapture = false;
    let released = false;
    const aborted = (): boolean => signal?.aborted === true || stopped.signal.aborted;
    const unavailable = (): boolean => observation?.failed === true || observations.get(chatId) !== observation;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;
      if (captured !== undefined && pinnedCapture) {
        const references = (pinned.get(captured) ?? 1) - 1;
        if (references === 0) {
          pinned.delete(captured);
        } else {
          pinned.set(captured, references);
        }
      }
      captured = undefined;
      proof = undefined;
      signal?.removeEventListener('abort', stop);
      stopped.signal.removeEventListener('abort', stop);
      observation?.failure.removeEventListener('abort', stop);
      pass.count--;
      if (pass.count === 0) {
        passes.delete(chatId);
      }
      if (observation !== undefined) {
        observation.references--;
        if (!observation.retained || observation.failed) {
          if (observations.get(chatId) === observation) {
            dropObservation(chatId);
          } else if (observation.references === 0) {
            observation.close();
          }
        }
      }
      const remaining = (activeReads.get(chatId) ?? 1) - 1;
      if (remaining === 0) {
        activeReads.delete(chatId);
        pruneReplay();
        retireOversized(chatId);
      } else {
        activeReads.set(chatId, remaining);
      }
    };
    const stop = (): void => {
      ended.resolve();
      release();
    };
    signal?.addEventListener('abort', stop, { once: true });
    stopped.signal.addEventListener('abort', stop, { once: true });
    observation?.failure.addEventListener('abort', stop, { once: true });
    activeReads.set(chatId, (activeReads.get(chatId) ?? 0) + 1);
    cancelRetirement(chatId);
    const acquireCurrent = async (): Promise<ReplayView | undefined> => {
      if (aborted() || unavailable() || writers.has(chatId)) {
        return undefined;
      }
      const current = await Promise.race([view(chatId), ended.promise.then(() => undefined)]);
      if (current === undefined || aborted() || unavailable() || writers.has(chatId)) {
        return undefined;
      }
      checkDriver(chatId, current.ledger, false);
      return current;
    };
    try {
      await Promise.race([observation?.ready ?? Promise.resolve(), ended.promise]);
      const openingWakes = pass.sourceWakes;
      captured = await acquireCurrent();
      // One follow-up includes an acknowledged opening wake; a finite capture never waits for source quiescence.
      if (captured !== undefined && openingWakes !== pass.sourceWakes) {
        captured = await acquireCurrent();
      }
      if (aborted()) {
        return;
      }
      if (captured === undefined) {
        yield refusal(writers.has(chatId) ? 'identity-mismatch' : 'unreadable');
        return;
      }
      if (!pinned.has(captured)) {
        const normal = [...pinned.keys()].filter((current) => current.bytes.byteLength <= replayByteLimit);
        const normalBytes = normal.reduce((sum, current) => sum + current.bytes.byteLength, 0);
        const exceeds =
          captured.bytes.byteLength > replayByteLimit
            ? [...pinned.keys()].some((current) => current.bytes.byteLength > replayByteLimit)
            : normal.length >= replayChatLimit || normalBytes + captured.bytes.byteLength > replayByteLimit;
        if (exceeds) {
          if (replay.get(chatId) === captured && !liveOwners.has(chatId) && (activeReads.get(chatId) ?? 0) <= 1) {
            replay.delete(chatId);
            dropObservation(chatId);
          }
          captured = undefined;
          yield refusal('capacity-exceeded');
          return;
        }
      }
      pinned.set(captured, (pinned.get(captured) ?? 0) + 1);
      pinnedCapture = true;
      const sourceGeneration = captured.generation;
      const position = { ...captured.ledger.position, sourceGeneration };
      let cursor = 0;
      while (cursor < position.cursor) {
        if (aborted()) {
          return;
        }
        if (unavailable() || captureReleased()) {
          yield refusal('unreadable');
          return;
        }
        if (writers.has(chatId)) {
          yield refusal('identity-mismatch');
          return;
        }
        const answer = captured.projectionBatch({ chatId, cursor, limit, maxBytes });
        if (aborted()) {
          return;
        }
        yield { type: 'page', answer };
        cursor = answer.nextCursor;
      }
      // This fresh byte acquisition and exact prefix comparison linearize validation; later wakes belong to the next read.
      proof = await acquireCurrent();
      if (aborted()) {
        return;
      }
      if (unavailable()) {
        yield refusal('unreadable');
        return;
      }
      if (
        writers.has(chatId) ||
        proof === undefined ||
        captureReleased() ||
        proof.generation !== sourceGeneration ||
        proof.ledger.position.cursor < position.cursor ||
        !isBytePrefix(captured.bytes, proof.bytes)
      ) {
        yield refusal('identity-mismatch');
        return;
      }
      yield {
        type: 'validated',
        position,
        observedEndCursor: proof.ledger.position.cursor,
        health: captured.sourceHealth,
      };
    } catch {
      if (!aborted()) {
        yield refusal('unreadable');
      }
    } finally {
      release();
      ended.resolve();
    }
  };

  return {
    host,
    execute,
    catchUp,
    read: async (input) => {
      if (closed) {
        throw Object.assign(new Error('The Tau agent launcher is closed.'), {
          code: 'HOST_CLOSED' satisfies RefusalCode,
        });
      }
      requireChatPathSegment(input.chatId);
      return port.read(input, async () => readLocal(input));
    },
    stoppability: (chatId) => port.stoppability(chatId),
    liveEvents: ({ chatId, signal }) => live.subscribe(signal, chatId),
    admittedRuns: async () => {
      /* A start counted while the last ones were answered is waited for too (W6.r2 L1). */
      while (answering.size > 0) {
        // oxlint-disable-next-line no-await-in-loop -- each pass waits for what the one before it could not see.
        await Promise.allSettled(answering);
      }
      return new Map([...admitted].map(([chatId, runs]) => [chatId, new Set(runs)]));
    },
    pendingInterrupts: async (runId) => host.pendingInterrupts(runId),
    /* One close: a concurrent second call awaits the first rather than resolving early. A close that failed is let
     * go, so the next call tries again (W6.r1 round 4). */
    close: async () => {
      closing ??= (async () => {
        closed = true;
        stopped.abort();
        for (const timer of retirements.values()) {
          clearTimeout(timer);
        }
        retirements.clear();
        for (const observation of observations.values()) {
          observation.close();
        }
        observations.clear();
        replay.clear();
        writerGenerations.clear();
        placing.abort();
        await port.close();
        await host.close();
        const unclaimed = [...views.values()];
        views.clear();
        await Promise.allSettled(
          unclaimed.map(async (opening) => {
            const log = await opening;
            await log.close();
          }),
        );
        for (const chatId of parked.keys()) {
          wakeReads(chatId);
        }
        live.close();
      })();
      const attempt = closing;
      try {
        await attempt;
      } catch (error) {
        if (closing === attempt) {
          closing = undefined;
        }
        throw error;
      }
    },
  };
};
