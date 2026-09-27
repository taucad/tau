/**
 * One browser-safe launcher for every process (W6 RH-S2, guide option one-launcher): the portable host core over a
 * platform's {@link ChatStore}. The daemon, the desktop utility and the resident browser worker build it the same
 * way; only the store differs.
 *
 * Always-on is the defining property: `start` and `resume` return once the admission is durable, and the run then
 * continues with zero attached clients. Nothing here is tied to a connection's lifetime (D17).
 *
 * Reads never create a chat, take a lock or assume leadership (RH-R1): `read` and `attach` read the log's bytes as
 * they are, unless this process already writes the chat, whose host then answers the long poll from its writer.
 */

import { isOrphaned } from '#host/chat-run.machine.js';
import { createTauAgentHost } from '#host/tau-agent-host.js';
import type { CreateTauAgentHostOptions, ExternalAgentPort, TauAgentHost } from '#host/tau-agent-host.js';
import { externalTurnOf, latestTurnId } from '#host/run-history.js';
import { createPortableId, transportFailureOfRun } from '#harness/session-record.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import { emptyChatLedger, foldChatLedger } from '#log/chat-ledger.js';
import type { ChatLedger } from '#log/chat-ledger.js';
import type { AgentLogEvent, JsonValue } from '#log/event-types.js';
import type {
  AgentLiveEvent,
  DurableEventLog,
  HostRunSnapshot,
  InterruptRequest,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import type { ReadAnswer, ReadInput } from '#wire/frames.schema.js';
import type { RefusalCode } from '#wire/refusals.js';
import { chatStoreBinding, requireChatPathSegment } from '#launchers/chat-store.js';
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
  /** Ephemeral model deltas for one chat, bounded per subscriber (SC-R15). */
  liveEvents(input: Readonly<{ chatId: string; signal: AbortSignal }>): AsyncIterable<AgentLiveEvent>;
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
      const stream = new ReadableStream<Event>({
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
              /* A `drop` or the fan-out's close already ended this controller. */
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
      return iterateStream(stream);
    },
    close: (): void => {
      for (const controller of controllers.keys()) {
        controllers.delete(controller);
        controller.close();
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

/** One read-only view of a chat: its rows as they are, folded once (RH-R21: one pass over its bytes). */
type ChatView = Readonly<{ log: EventLogAppender; ledger: ChatLedger }>;

/**
 * A read-only appender over bytes already read: the tolerant open, `readBatch` and `messages` without a writer.
 *
 * @param bytes - The chat's bytes.
 * @returns An appender whose writes are refused.
 */
const viewOf = async (bytes: Uint8Array<ArrayBuffer>): Promise<ChatView> => {
  const refuse = async (): Promise<never> => {
    throw Object.assign(new Error('A read-only chat view never writes.'), { code: 'STORAGE_NOT_WRITABLE' });
  };
  const log = await createEventLogAppender({
    read: async () => bytes,
    append: refuse,
    truncate: refuse,
    close: async () => undefined,
    size: async () => bytes.byteLength,
    exclusive: async (section) => section(),
  });
  const rows = await log.read();
  const folded = foldChatLedger(emptyChatLedger, rows);
  const ledger = (await log.historyIntact()) ? folded : { ...folded, historyIntact: false };
  return { log, ledger };
};

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
  const live = createFanOut<AgentLiveEvent>();
  /** Chats whose writer this process holds open: their reads are the host's long poll. */
  const writers = new Set<string>();
  /** A writer M2's `readView` opened, handed to the chat's next incarnation (one open, one read: RH-R9). */
  const views = new Map<string, Promise<EventLogAppender>>();
  /**
   * Reads parked on a chat this process does not write. A `writer` wake continues the long poll on this process's
   * writer; a `reroute` wake (the chat's holder changed) answers at once, so the reader's next read is routed anew.
   */
  const parked = new Map<string, Set<(reason: 'writer' | 'reroute') => void>>();
  /**
   * The read passes over a chat's bytes in flight, and the wakes during them: a pass a wake overtook answers instead of
   * parking past it. An entry lives only while a pass does.
   */
  const passes = new Map<string, { count: number; wakes: number }>();
  /** Chats some verb has named: the first one checks for a run with no driver (RH-R1, RH-R15). */
  const named = new Set<string>();
  let closed = false;
  let closing: Promise<void> | undefined;
  /* Set once the leadership binding exists; the host's callbacks before then have no chat to report. */
  const leading: { port?: LeadershipPort } = {};

  const wakeReads = (chatId: string, reason: 'writer' | 'reroute' = 'writer'): void => {
    const pass = passes.get(chatId);
    if (pass !== undefined) {
      pass.wakes += 1;
    }
    const waiting = parked.get(chatId);
    parked.delete(chatId);
    for (const wake of waiting ?? []) {
      wake(reason);
    }
  };

  const openEventLog = async (chatId: string): Promise<DurableEventLog> => {
    requireChatPathSegment(chatId);
    const handed = views.get(chatId);
    views.delete(chatId);
    const log = await (handed ?? binding.openWriter(chatId));
    writers.add(chatId);
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
      live.publish(event);
      leading.port?.liveEvent(event);
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

  const view = async (chatId: string): Promise<ChatView> => viewOf(await binding.readBytes(chatId));

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
  const park = async (chatId: string, signal: AbortSignal | undefined): Promise<'writer' | 'reroute'> =>
    new Promise<'writer' | 'reroute'>((resolve) => {
      const waiting = parked.get(chatId) ?? new Set<(reason: 'writer' | 'reroute') => void>();
      parked.set(chatId, waiting);
      const aborted = (): void => {
        wake('reroute');
      };
      const wake = (reason: 'writer' | 'reroute'): void => {
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
  const readLocal = async (input: ReadInput): Promise<ReadAnswer> => {
    const { signal, ...request } = input;
    const { chatId } = request;
    for (;;) {
      if (writers.has(chatId)) {
        return host.read(input);
      }
      const pass = passes.get(chatId) ?? { count: 0, wakes: 0 };
      passes.set(chatId, pass);
      pass.count += 1;
      const woken = pass.wakes;
      let answer: Awaited<ReturnType<ChatView['log']['readBatch']>>;
      try {
        // oxlint-disable-next-line no-await-in-loop -- one pass over the bytes per wake.
        const chat = await view(chatId);
        checkDriver(chatId, chat.ledger, false);
        // oxlint-disable-next-line no-await-in-loop -- the view answers at once.
        answer = await chat.log.readBatch(request);
      } finally {
        pass.count -= 1;
        if (pass.count === 0) {
          passes.delete(chatId);
        }
      }
      if (answer.status === 'refused') {
        return { status: 'refused', chatId, reason: answer.reason, expected: answer.expected };
      }
      const batch: ReadAnswer = {
        status: 'batch',
        chatId,
        cursor: answer.cursor,
        nextCursor: answer.nextCursor,
        endCursor: answer.endCursor,
        events: [...answer.events],
      };
      /* A wake while this pass read the bytes (a writer opened, or the holder changed) has no waiter to reach: answer
       * now, and the reader's next read is routed anew. */
      if (answer.events.length > 0 || closed || signal?.aborted === true || pass.wakes !== woken) {
        return batch;
      }
      // oxlint-disable-next-line no-await-in-loop -- the park is the long poll.
      if ((await park(chatId, signal)) === 'reroute') {
        return batch;
      }
    }
  };

  return {
    host,
    execute,
    read: async (input) => {
      if (closed) {
        throw Object.assign(new Error('The Tau agent launcher is closed.'), {
          code: 'HOST_CLOSED' satisfies RefusalCode,
        });
      }
      requireChatPathSegment(input.chatId);
      return port.read(input, async () => readLocal(input));
    },
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
