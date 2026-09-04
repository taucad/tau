import { readUIMessageStream } from 'ai';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { z } from 'zod';
import { isRecord } from '@taucad/utils/schema';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { AgentHostWorkerError } from '#services/agent-host-client.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import {
  agentHostAdmissionConfigSchema,
  agentHostExternalAgentSchema,
  agentHostTailBatchLimit,
} from '#workers/agent-host.contract.js';
import {
  projectAgentHostEvent,
  projectAgentHostLiveEvent,
  projectAgentHostUserMessage,
  projectAgentHostUserTurn,
} from '#services/agent-host-event-projection.js';
import type { MyUIMessage } from '@taucad/chat';

type AgentLogEvent = Parameters<Parameters<AgentHostClient['subscribe']>[0]>[1];
type AgentLiveEvent = Parameters<Parameters<NonNullable<AgentHostClient['subscribeLive']>>[0]>[1];
type HostRunSnapshot = Awaited<ReturnType<AgentHostClient['start']>>;
type HostEventBatch = Awaited<ReturnType<AgentHostClient['attach']>>;
type UserProviderMessage = Exclude<Parameters<AgentHostClient['start']>[0]['message'], string>;
type JsonValue = Extract<AgentLogEvent, { readonly type: 'message.appended' }>['message']['content'];
type BrowserRunState = HostRunSnapshot['state'];
type HostStartInput = Parameters<AgentHostClient['start']>[0];

export type BrowserAgentHostRun = Readonly<{
  runId: string;
  state: BrowserRunState;
  eventCount: number;
  turnId?: string;
  userMessage?: MyUIMessage;
}>;

export type BrowserAgentHostRegistration = Readonly<{
  projectStorage: () => Promise<ProjectFileSystemConfig>;
  createClient: () => Promise<AgentHostClient>;
  markRunId: (runId: string) => Promise<void>;
}>;

const registrations = new Map<string, BrowserAgentHostRegistration>();
const registrationWaiters = new Map<string, (registration: BrowserAgentHostRegistration) => void>();
const runResets = new Map<string, (rebuild: (current: readonly MyUIMessage[]) => readonly MyUIMessage[]) => void>();
const browserRuns = new Map<string, BrowserAgentHostRun>();
const boundRunIds = new Map<string, string>();
const activeClients = new Map<string, { readonly client: AgentHostClient; readonly runId: string }>();
const clientSettlements = new Map<string, Promise<void>>();

export const getBrowserAgentHostRun = (chatId: string): BrowserAgentHostRun | undefined => browserRuns.get(chatId);

const setBrowserAgentHostRun = (chatId: string, run: BrowserAgentHostRun): void => {
  browserRuns.set(chatId, run);
  boundRunIds.set(chatId, run.runId);
};

export const clearBrowserAgentHostRun = (chatId: string): void => {
  browserRuns.delete(chatId);
  boundRunIds.delete(chatId);
};

/**
 * Bind one chat to whichever host runs it.
 *
 * The registration is transport-agnostic by construction: `createClient`
 * returns an {@link AgentHostClient}, and a daemon-backed one is
 * indistinguishable from a worker-backed one here (W4 ruling 6).
 */
export const registerAgentHost = (chatId: string, registration: BrowserAgentHostRegistration): (() => void) => {
  registrations.set(chatId, registration);
  registrationWaiters.get(chatId)?.(registration);
  registrationWaiters.delete(chatId);
  return () => {
    if (registrations.get(chatId) === registration) {
      registrations.delete(chatId);
    }
  };
};

/**
 * Let a chat's transcript owner replace every run its host's log names.
 *
 * A reattach replays the host's whole log from cursor 0 (FIX-DAEMON-PROJ) —
 * the daemon may have finished the turn with no client attached, so the replay
 * has to republish it in full. The AI SDK, though, *continues* a trailing
 * assistant message on a resume rather than starting a new one
 * (`createStreamingUIMessageState` keeps `lastMessage` when it is an
 * assistant), and it keys tool parts by `toolCallId` and data parts by `id`
 * but keys text and reasoning parts by nothing at all. A replay over a
 * transcript local persistence had already restored therefore merged its tool
 * cards in place and *appended* a second copy of every text block — and every
 * later turn froze that doubling into history, so a chat reloaded three times
 * carried a turn rendered four times.
 *
 * The log is the authority (PH19), so the reattach hands back the transcript
 * the whole log implies and the owner splices it in — not a dedupe pass over
 * whatever was there. One AI SDK request can only ever build one message
 * (`processUIMessageStream`'s second `start` renames the message it is already
 * filling), so the runs this stream will not carry are rebuilt here, through
 * the same chunk projection and the same SDK reducer, and only the trailing
 * run streams.
 *
 * The handover happens inside `reconnectToStream`, before the SDK snapshots
 * the transcript, and only once the host has actually answered `attach` — so a
 * chat whose log this host does not hold keeps the transcript it had.
 *
 * @param chatId - Chat whose transcript the caller owns.
 * @param reset - Applies the handed-back rebuild to the current transcript.
 * @returns Unregisters the reset.
 */
export const registerAgentHostRunReset = (
  chatId: string,
  reset: (rebuild: (current: readonly MyUIMessage[]) => readonly MyUIMessage[]) => void,
): (() => void) => {
  runResets.set(chatId, reset);
  return () => {
    if (runResets.get(chatId) === reset) {
      runResets.delete(chatId);
    }
  };
};

/** Replay one run's durable events into the message the live path built. */
const readRunMessage = async (events: readonly AgentLogEvent[]): Promise<MyUIMessage | undefined> => {
  const chunks = events.flatMap((event) => [...projectAgentHostEvent(event)]);
  if (chunks.length === 0) {
    return undefined;
  }
  const stream = new ReadableStream<UIMessageChunk>({
    start: (controller) => {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  let message: MyUIMessage | undefined;
  for await (const next of readUIMessageStream<MyUIMessage>({ stream })) {
    message = next;
  }
  return message;
};

/**
 * Rebuild the transcript a host's log implies, as a map over the current one.
 *
 * Every run contributes its user turn; every run but the streaming one also
 * contributes its rebuilt assistant message, because the stream this
 * accompanies is what rebuilds that last one.
 */
const rebuildTranscript = async (
  events: readonly AgentLogEvent[],
  streamingRunId: string,
): Promise<(current: readonly MyUIMessage[]) => readonly MyUIMessage[]> => {
  const runIds = [...new Set(events.map((event) => event.runId))];
  const runs = await Promise.all(
    runIds.map(async (id) => {
      const runEvents = events.filter((event) => event.runId === id);
      const user = runEvents.flatMap((event) => projectAgentHostUserTurn(event) ?? []).at(0);
      const assistant = id === streamingRunId ? undefined : await readRunMessage(runEvents);
      return [...(user === undefined ? [] : [user]), ...(assistant === undefined ? [] : [assistant])];
    }),
  );
  const rebuilt = runs.flat();
  /*
   * Replace from the first message this log owns, so turns that predate it —
   * another host's, another era's — are left exactly where they are. Every
   * message from there on is one the log can reconstruct, and the stream this
   * accompanies rebuilds the last of them.
   */
  const owned = new Set([...rebuilt.map((message) => message.id), streamingRunId]);
  return (current) => {
    const from = current.findIndex((message) => owned.has(message.id));
    return from === -1 ? [...current, ...rebuilt] : [...current.slice(0, from), ...rebuilt];
  };
};

const registrationFor = async (chatId: string): Promise<BrowserAgentHostRegistration> => {
  const current = registrations.get(chatId);
  if (current) {
    return current;
  }
  return new Promise((resolve, reject) => {
    const done = (registration: BrowserAgentHostRegistration): void => {
      globalThis.clearTimeout(registrationTimeout);
      resolve(registration);
    };
    registrationWaiters.set(chatId, done);
    const registrationTimeout = globalThis.setTimeout(() => {
      if (registrationWaiters.get(chatId) === done) {
        registrationWaiters.delete(chatId);
      }
      reject(new Error(`Browser agent host is not configured for chat ${chatId}.`));
    }, 10_000);
  });
};

/**
 * A host-placed admission, in its two shapes.
 *
 * A Tau turn carries the full browser-host `config` — model wire, prompt
 * blocks, tool grant — and it stays **required** on that shape, because an
 * admission that fails to compose one is a refusal, never a delegation. An
 * external-agent turn carries none of it: the agent brings its own model, its
 * own tools and the user's own CLI login, and the daemon routes on `agent`
 * alone (W4-ACP).
 */
const browserHostAdmissionSchema = z.union([
  z.strictObject({ trigger: z.literal('submit'), config: agentHostAdmissionConfigSchema }),
  z.strictObject({
    trigger: z.enum(['retry', 'edit', 'regenerate']),
    retainedMessageIds: z.array(z.string()),
    config: agentHostAdmissionConfigSchema,
  }),
  z.strictObject({ trigger: z.literal('submit'), agent: agentHostExternalAgentSchema }),
  z.strictObject({
    trigger: z.enum(['retry', 'edit', 'regenerate']),
    retainedMessageIds: z.array(z.string()),
    agent: agentHostExternalAgentSchema,
  }),
]);
const browserAdmissionBodySchema = z.object({
  admission: z.strictObject({ version: z.literal(1), idempotencyKey: z.string().min(1) }),
  browserHost: browserHostAdmissionSchema,
});

const admissionIssue = (error: z.ZodError): string => {
  const [issue] = error.issues;
  return issue ? `${issue.path.map(String).join('.')}: ${issue.message}` : error.message;
};

const hostAdmission = (
  value: z.infer<typeof browserHostAdmissionSchema>,
  sdkTrigger: 'submit-message' | 'regenerate-message',
): Omit<HostStartInput, 'chatId' | 'runId' | 'message'> => {
  if (value.trigger === 'submit') {
    // Deliberately accepts either SDK trigger. The seeded first turn is replayed
    // by hydration as `chat.regenerate` (its pending user message is already in
    // the transcript) but admits as a `submit`, because an empty durable log has
    // no history prefix to retain — see `hydrationTrigger` in the chat client.
    // Only a *rewinding* admission still has to match its SDK verb.
    return value;
  }
  if (sdkTrigger !== 'regenerate-message') {
    throw new TypeError(`Browser host ${value.trigger} admission does not match the SDK trigger.`);
  }
  return value;
};

const userMessage = <Message extends UIMessage>(messages: readonly Message[]): UserProviderMessage => {
  const message = messages.findLast((candidate) => candidate.role === 'user');
  if (!message) {
    throw new TypeError('Browser agent host admission requires a user message.');
  }
  const content: JsonValue[] = [];
  for (const part of message.parts) {
    if (part.type === 'text') {
      content.push({ type: 'text', text: part.text });
      continue;
    }
    if (part.type === 'file' && part.url.startsWith('data:')) {
      const match = /^data:([^;,]+);base64,(.*)$/u.exec(part.url);
      if (match) {
        content.push({ type: 'image', mimeType: match[1]!, data: match[2]! });
      }
    }
  }
  const first = content[0];
  const textOnly = content.length === 1 && isRecord(first) && first['type'] === 'text';
  return {
    id: message.id,
    role: 'user',
    content: textOnly && typeof first['text'] === 'string' ? first['text'] : content,
  };
};

const lifecycleState = (event: AgentLogEvent): BrowserRunState | undefined =>
  event.type === 'run.lifecycle' ? event.state : undefined;

const terminal = (state: BrowserRunState): boolean =>
  state === 'completed' || state === 'failed' || state === 'cancelled';

const cancelClientRun = async (client: AgentHostClient, runId: string): Promise<void> => {
  try {
    await client.cancel(runId);
  } catch {
    // Cancellation is best-effort after the UI stream has already aborted.
  }
};

const closeClient = async (client: AgentHostClient | undefined): Promise<unknown> => {
  try {
    await client?.close();
    return undefined;
  } catch (error) {
    // The client suppresses expected teardown failures (close timeout,
    // known-dead worker); anything surfacing here is a genuine protocol fault.
    return error;
  }
};

const createHostStream = <Message extends UIMessage>(input: {
  readonly chatId: string;
  /**
   * The run to attach to, when this tab still holds its binding. A reload drops
   * it, and the run to reattach to is then whatever the chat's durable log ends
   * with — resolved from the attach snapshot below.
   */
  readonly runId?: string | undefined;
  readonly admission?: Omit<HostStartInput, 'chatId' | 'runId' | 'message'>;
  readonly messages?: readonly Message[];
  readonly abortSignal?: AbortSignal | undefined;
  /**
   * Names the run this stream will rebuild and hands over the log it read,
   * once the host has answered `attach` and before any chunk is written — or
   * `undefined` when it resolved no run. Called exactly once.
   * See {@link registerAgentHostRunReset}.
   */
  readonly onRunResolved?: ((runId: string | undefined, events: readonly AgentLogEvent[]) => void) | undefined;
}): ReadableStream<UIMessageChunk> => {
  let announceRun = input.onRunResolved;
  const announce = (resolved: string | undefined, events: readonly AgentLogEvent[] = []): void => {
    const once = announceRun;
    announceRun = undefined;
    once?.(resolved, events);
  };
  const priorSettlement = clientSettlements.get(input.chatId);
  const settlement = Promise.withResolvers<void>();
  clientSettlements.set(input.chatId, settlement.promise);
  const output = new TransformStream<UIMessageChunk, UIMessageChunk>();
  const writer = output.writable.getWriter();
  const reader = output.readable.getReader();
  let client: AgentHostClient | undefined;
  let cancelled = input.abortSignal?.aborted ?? false;
  let cancelRun: (() => void) | undefined;
  const cancel = (): void => {
    cancelled = true;
    cancelRun?.();
  };
  input.abortSignal?.addEventListener('abort', cancel, { once: true });

  const run = async (): Promise<void> => {
    let unsubscribe: (() => void) | undefined;
    let unsubscribeLive: (() => void) | undefined;
    let { runId } = input;
    let closed = false;
    let cursor = 0;
    let eventCount = 0;
    let state: BrowserRunState = 'admitted';
    let turnId: string | undefined;
    let durableUserMessage: MyUIMessage | undefined;
    let projection = Promise.resolve();
    const seen = new Set<string>();
    const streamedBlocks = new Set<string>();
    const terminalEvent = Promise.withResolvers<void>();
    const publishRun = (): void => {
      if (runId === undefined) {
        return;
      }
      setBrowserAgentHostRun(input.chatId, {
        runId,
        state,
        eventCount,
        ...(turnId === undefined ? {} : { turnId }),
        ...(durableUserMessage === undefined ? {} : { userMessage: durableUserMessage }),
      });
    };
    const enqueueChunks = async (chunks: readonly UIMessageChunk[]): Promise<void> => {
      for (const chunk of chunks) {
        if (cancelled || closed) {
          return;
        }
        // oxlint-disable-next-line no-await-in-loop -- writer readiness is the stream's native backpressure contract.
        await writer.write(chunk);
      }
    };
    const enqueueEvent = async (event: AgentLogEvent | AgentLiveEvent): Promise<void> => {
      if (event.runId !== runId) {
        return;
      }
      if (!('leaderEpoch' in event)) {
        await enqueueChunks(projectAgentHostLiveEvent(event, streamedBlocks));
        return;
      }
      const key = `${event.leaderEpoch}:${String(event.sequence)}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      const projectedUser = projectAgentHostUserTurn(event);
      if (projectedUser !== undefined) {
        turnId = projectedUser.id;
        durableUserMessage = projectedUser;
      }
      state = lifecycleState(event) ?? state;
      eventCount += 1;
      publishRun();
      await enqueueChunks(projectAgentHostEvent(event, streamedBlocks));
      if (terminal(state)) {
        terminalEvent.resolve();
      }
    };
    const enqueueAfter = async (previous: Promise<void>, event: AgentLogEvent | AgentLiveEvent): Promise<void> => {
      await previous;
      await enqueueEvent(event);
    };
    const reportProjectionFailure = async (operation: Promise<void>): Promise<void> => {
      try {
        await operation;
      } catch (error) {
        terminalEvent.reject(error);
        if (!closed) {
          closed = true;
          await writer.abort(error);
        }
      }
    };
    const queueEvent = (event: AgentLogEvent | AgentLiveEvent): void => {
      projection = enqueueAfter(projection, event);
      void reportProjectionFailure(projection);
    };
    /**
     * Page the log to its end, writing nothing.
     *
     * Collected rather than streamed page-by-page because the transcript owner
     * has to be handed the *whole* log before the first chunk is written — it
     * rebuilds every run this stream will not, and the AI SDK snapshots the
     * transcript the moment `reconnectToStream` settles. Pages are 16 events
     * (`agentHostTailBatchLimit`), so a four-run chat is ten round trips.
     *
     * ponytail: the whole log is held in memory for the length of the replay.
     * Fine at a chat's natural size (the operator's four-run log is 700 KB);
     * if a chat ever outgrows that, page the *earlier* runs into the rebuild
     * incrementally and keep only the trailing run's events here.
     */
    const collectLog = async (hostClient: AgentHostClient, batch: HostEventBatch): Promise<AgentLogEvent[]> => {
      cursor = batch.nextCursor;
      if (cursor >= batch.endCursor) {
        return [...batch.events];
      }
      const next = await hostClient.tail({ chatId: input.chatId, cursor, limit: agentHostTailBatchLimit });
      return [...batch.events, ...(await collectLog(hostClient, next))];
    };
    const reconcileSnapshot = (snapshot: HostRunSnapshot | undefined): boolean => {
      if (!snapshot || snapshot.runId !== runId) {
        return false;
      }
      state = snapshot.state;
      turnId = snapshot.turnId;
      const snapshotUser =
        snapshot.messages.find(
          (message): message is UserProviderMessage => message.role === 'user' && message.id === snapshot.turnId,
        ) ?? snapshot.messages.findLast((message): message is UserProviderMessage => message.role === 'user');
      if (snapshotUser !== undefined) {
        durableUserMessage = projectAgentHostUserMessage(snapshotUser);
      }
      publishRun();
      if (terminal(state)) {
        terminalEvent.resolve();
      }
      return true;
    };
    const replay = async (hostClient: AgentHostClient): Promise<boolean> => {
      const batch = await hostClient.attach({ chatId: input.chatId, cursor, limit: agentHostTailBatchLimit });
      // The log's own snapshot names the run this chat ends on — the only source
      // for a reattach whose in-memory binding a reload dropped. The host answers
      // one for every non-empty log (and takes a non-terminal run over first).
      runId ??= batch.snapshot?.runId;
      const events = await collectLog(hostClient, batch);
      // Handed over before the first chunk is written, and only now that the
      // host has actually answered for this chat's log.
      announce(runId, events);
      for (const event of events) {
        queueEvent(event);
      }
      await projection;
      return reconcileSnapshot(batch.snapshot);
    };
    try {
      await priorSettlement;
      const registration = await registrationFor(input.chatId);
      const bindRun = async (bound: string): Promise<void> => {
        await registration.markRunId(bound);
        boundRunIds.set(input.chatId, bound);
        if (client) {
          activeClients.set(input.chatId, { client, runId: bound });
        }
      };
      if (runId !== undefined) {
        await bindRun(runId);
      }
      client = await registration.createClient();
      if (runId !== undefined) {
        activeClients.set(input.chatId, { client, runId });
      }
      unsubscribe = client.subscribe((chatId, event) => {
        if (chatId === input.chatId) {
          queueEvent(event);
        }
      });
      unsubscribeLive = client.subscribeLive?.((chatId, event) => {
        if (chatId === input.chatId) {
          queueEvent(event);
        }
      });
      cancelRun = () => {
        if (client && runId !== undefined) {
          void cancelClientRun(client, runId);
        }
      };
      await replay(client);
      if (input.runId === undefined && runId !== undefined) {
        await bindRun(runId);
      }
      if (runId === undefined) {
        // A registered browser-placed chat whose durable log holds no run at
        // all. There is nothing to reattach to and the API never held this
        // chat's runs, so the resume ends here instead of asking it.
        closed = true;
        await writer.close();
        return;
      }
      if (input.admission) {
        const admittedMessage = userMessage(input.messages ?? []);
        turnId = admittedMessage.id;
        durableUserMessage = projectAgentHostUserMessage(admittedMessage);
        publishRun();
        const operation = client.start({
          chatId: input.chatId,
          runId,
          message: admittedMessage,
          ...input.admission,
        } as HostStartInput);
        if (cancelled) {
          cancelRun();
        }
        const snapshot = await operation;
        await projection;
        if (terminal(snapshot.state) && !terminal(state)) {
          await replay(client);
          if (!terminal(state)) {
            reconcileSnapshot(snapshot);
          }
        } else {
          reconcileSnapshot(snapshot);
        }
      }
      if (!terminal(state) && !cancelled) {
        await terminalEvent.promise;
        await projection;
      }
      closed = true;
      await writer.close();
    } catch (error) {
      if (!closed) {
        closed = true;
        await (cancelled ? writer.close() : writer.abort(error)).catch(() => undefined);
      }
    } finally {
      // A stream that never reached `attach` — a refused registration, a host
      // that would not open — resolved no run, and rebuilds nothing.
      announce(undefined);
      input.abortSignal?.removeEventListener('abort', cancel);
      unsubscribe?.();
      unsubscribeLive?.();
      if (activeClients.get(input.chatId)?.client === client) {
        activeClients.delete(input.chatId);
      }
      const closeError = await closeClient(client);
      if (closeError !== undefined) {
        if (closed) {
          console.error('[browserAgentHost] worker close failed after stream settled', closeError);
        } else {
          closed = true;
          await writer.abort(closeError).catch(() => undefined);
        }
      }
      if (clientSettlements.get(input.chatId) === settlement.promise) {
        clientSettlements.delete(input.chatId);
      }
      settlement.resolve();
    }
  };
  void run();

  return new ReadableStream<UIMessageChunk>({
    pull: async (controller) => {
      const next = await reader.read();
      if (next.done) {
        controller.close();
      } else {
        controller.enqueue(next.value);
      }
    },
    cancel: async (reason) => {
      cancel();
      await reader.cancel(reason);
    },
  });
};

/** Resolve a projected browser-host approval without opening a new admission. */
export const resolveBrowserAgentHostInterrupt = async (input: {
  readonly chatId: string;
  readonly runId: string;
  readonly interruptId: string;
  readonly approved: boolean;
  readonly reason?: string | undefined;
}): Promise<void> => {
  const active = activeClients.get(input.chatId);
  if (!active || active.runId !== input.runId) {
    throw new Error(`Browser agent host run ${input.runId} is not attached.`);
  }
  await active.client.resolveInterrupt(input.chatId, input.runId, {
    interruptId: input.interruptId,
    outcome: input.approved ? 'approved' : 'denied',
    ...(input.reason ? { payload: { reason: input.reason } } : {}),
  });
};

/**
 * Routes one AI SDK chat pipeline into the browser agent host.
 *
 * There is no longer an "or": since W4-PASEO every CAD execution kind is
 * host-placed — `tau` and `paseo` on this worker, `acp` on a daemon — so the
 * API transport this class used to wrap has no turn left to carry and was
 * deleted with it. An admission that cannot be parsed is a refusal naming the
 * real reason, never a delegation that replaces it with someone else's.
 */
export class BrowserPlacementChatTransport<Message extends UIMessage> implements ChatTransport<Message> {
  public bindRun(chatId: string, runId: string): void {
    boundRunIds.set(chatId, runId);
  }

  public getBoundRunId(chatId: string): string | undefined {
    return browserRuns.get(chatId)?.runId ?? boundRunIds.get(chatId);
  }

  public async sendMessages(
    options: Parameters<ChatTransport<Message>['sendMessages']>[0],
  ): Promise<ReadableStream<UIMessageChunk>> {
    const parsed = browserAdmissionBodySchema.safeParse(options.body);
    if (!parsed.success) {
      throw new AgentHostWorkerError(
        'BROWSER_HOST_ADMISSION_INVALID',
        `This turn cannot run on its agent host (${admissionIssue(parsed.error)}).`,
      );
    }
    const admission = parsed.data;
    return createHostStream({
      chatId: options.chatId,
      messages: options.messages,
      runId: admission.admission.idempotencyKey,
      admission: hostAdmission(admission.browserHost, options.trigger),
      abortSignal: options.abortSignal,
    });
  }

  public async reconnectToStream(
    options: Parameters<ChatTransport<Message>['reconnectToStream']>[0],
  ): ReturnType<ChatTransport<Message>['reconnectToStream']> {
    const runId = boundRunIds.get(options.chatId) ?? browserRuns.get(options.chatId)?.runId;
    // A chat's runs live in its durable log, never in the API. A reload drops
    // the in-memory binding, and resuming through the API then asked for a run
    // the API never had (`GET /v1/chat/<chat>/runs/<run>/stream` → 503) while
    // the store kept the chat "reattaching" — after which a retry dispatched
    // nothing and a fresh submit vanished. Returning null instead left the same
    // hole from the other side: the log's terminal run was never republished,
    // so a completed run stayed unpublished and a failed one rendered no
    // reason. The log is the authority — attach to it, and let the host resolve
    // which run this chat ends on.
    const resolved = Promise.withResolvers<{
      readonly runId: string | undefined;
      readonly events: readonly AgentLogEvent[];
    }>();
    const stream = createHostStream({
      chatId: options.chatId,
      ...(runId === undefined ? {} : { runId }),
      onRunResolved: (resolvedRunId, events) => {
        resolved.resolve({ runId: resolvedRunId, events });
      },
    });
    // The AI SDK snapshots the transcript *after* this method settles, so the
    // log's own transcript is handed over here — before the replay that rebuilds
    // it could be appended to a stale copy instead. A host that resolved no run
    // hands over nothing, and the transcript stands.
    const replayed = await resolved.promise;
    const reset = replayed.runId === undefined ? undefined : runResets.get(options.chatId);
    if (reset && replayed.runId !== undefined) {
      reset(await rebuildTranscript(replayed.events, replayed.runId));
    }
    return stream;
  }
}
