import { readUIMessageStream } from 'ai';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { z } from 'zod';
import { isRecord } from '@taucad/utils/schema';
import { isAttachmentUrl } from '#utils/attachment.utils.js';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { AgentHostWorkerError, resendWhileSettling } from '#services/agent-host-client.js';
import type { AgentHostClient } from '#services/agent-host-client.js';
import {
  agentHostAdmissionConfigSchema,
  agentHostExternalAgentSchema,
  agentHostExternalContextSchema,
} from '#workers/agent-host.contract.js';
import {
  projectAgentHostEvent,
  projectAgentHostLiveEvent,
  projectAgentHostUserMessage,
  projectAgentHostUserTurn,
  projectTurnSettlement,
} from '#services/agent-host-event-projection.js';
import type { TurnConflictedEvent, TurnFailedEvent, TurnFinalizedEvent } from '@taucad/revisions/revision-effects';
import { Topic } from '@taucad/events';
import { emptyChatLedger, foldReadAnswer, isResumableRunFailure } from '@taucad/agent-host';
import type { AgentLiveEvent, AgentLogEvent } from '@taucad/agent-host';
import type { RefusalCode } from '@taucad/agent-host/wire';
import type { MyUIMessage } from '@taucad/chat';

type HostRunSnapshot = Awaited<ReturnType<AgentHostClient['start']>>;
type HostEventBatch = Awaited<ReturnType<AgentHostClient['attach']>>;
type ReadAnswer = Awaited<ReturnType<AgentHostClient['read']>>;

/** ponytail: a bound on refolds and stale pages per replay; a log that keeps moving under a read is reported. */
const maxReadPages = 10_000;
type UserProviderMessage = Exclude<Parameters<AgentHostClient['start']>[0]['message'], string>;
type JsonValue = Extract<AgentLogEvent, { readonly type: 'message.appended' }>['message']['content'];
type BrowserRunState = HostRunSnapshot['state'];
type HostStartInput = Parameters<AgentHostClient['start']>[0];

export type HostTurnSettlement = TurnConflictedEvent | TurnFailedEvent | TurnFinalizedEvent;

export type BrowserAgentHostRun = Readonly<{
  runId: string;
  state: BrowserRunState;
  eventCount: number;
  turnId?: string;
  userMessage?: MyUIMessage;
  /** The typed refusal a failed run ended on, when the host recorded one. */
  failure?: HostRunSnapshot['failure'];
  /** Where the host placed the run's attempt 1, from its `running` row (W8 TS-S5). */
  placement?: Readonly<{ baseRevisionId?: string | undefined }>;
}>;

export type BrowserAgentHostRegistration = Readonly<{
  projectStorage: () => Promise<ProjectFileSystemConfig>;
  createClient: () => Promise<AgentHostClient>;
}>;

const registrations = new Map<string, BrowserAgentHostRegistration>();
const registrationWaiters = new Map<string, (registration: BrowserAgentHostRegistration) => void>();
const runResets = new Map<string, (rebuild: (current: readonly MyUIMessage[]) => readonly MyUIMessage[]) => void>();
const browserRuns = new Map<string, BrowserAgentHostRun>();
const browserRunTopic = new Topic<void>({ name: 'browser-agent-host-runs' });

/** Wake a reader when a chat's run record changes. @public */
export const subscribeBrowserAgentHostRuns = (listener: () => void): (() => void) =>
  browserRunTopic.subscribe(listener);
const boundRunIds = new Map<string, string>();
const activeClients = new Map<string, { readonly client: AgentHostClient; readonly runId: string }>();
const clientSettlements = new Map<string, Promise<void>>();
/** How the stream following a chat continues the native run an approval left paused (PV-S10). */
const continuations = new Map<string, (commandId?: string) => Promise<void>>();
/** Chats whose next reattach may drive the host's own resume. @see requestBrowserAgentHostResume */
const requestedResumes = new Set<string>();

/**
 * How long one stream waits on a settlement before it gives up. Milliseconds.
 *
 * The same bound the rooted-bridge opener takes, and for the same reason: a
 * chat's streams serialise through {@link clientSettlements}, so an unbounded
 * wait on one of them was a wedge nobody could see — the submit behind it never
 * reached the host, wrote nothing to the log, and left the composer on
 * "Planning next moves…" for as long as the page stayed open.
 */
const settlementTimeout = 30_000;

/**
 * Await a promise only a peer can settle, or throw once the bound expires.
 *
 * Also the composer's bound, where the peer is the chat row that names the
 * project a draft is saved in rather than a prior stream.
 * @see deferredRecordStore
 *
 * @param settling - The settlement to wait out.
 * @param reason - What the user is told when it never lands.
 * @param code - The {@link AgentHostWorkerError} code to carry; defaults to this file's.
 * @returns What `settling` resolved with.
 */
export const awaitSettlement = async <Value>(
  settling: Promise<Value>,
  reason: string,
  code = 'BROWSER_HOST_SETTLEMENT_TIMEOUT',
): Promise<Value> => {
  const settlementExpiry = Promise.withResolvers<never>();
  const timer = globalThis.setTimeout(() => {
    settlementExpiry.reject(new AgentHostWorkerError(code, reason));
  }, settlementTimeout);
  try {
    return await Promise.race([settling, settlementExpiry.promise]);
  } finally {
    globalThis.clearTimeout(timer);
  }
};

/**
 * Turns a *host* settled, by turn id (S9, A4).
 *
 * A turn the browser placed settles in the file-manager worker's revision root
 * and its settlement rides that port; a turn a daemon or desktop utility placed
 * settles on the host, which owns the files (VI11), and reaches this tab as one
 * durable `turn.finalized` record in the chat's log. Both are the **same
 * schema**, so this is where every durable one passes through, live and on
 * replay, and `useRevisions` reads one map.
 */
const finalizedTurns = new Map<string, TurnFinalizedEvent>();
/**
 * Host-settled turns one tab keeps.
 *
 * The cards on screen are what a reader needs; a tab left open for days would
 * otherwise retain every settlement it ever saw, including other projects'
 * (they are filtered at read). FIFO by arrival, like the host's own
 * `settledRunHistory`.
 */
const finalizedTurnLimit = 256;

let finalizedTurnSnapshot: readonly TurnFinalizedEvent[] = [];
const finalizedTurnTopic = new Topic<void>({ name: 'host-finalized-turns' });
const hostTurnSettlementTopic = new Topic<HostTurnSettlement>({ name: 'host-turn-settlements' });
const latestSettlementByChat = new Map<string, HostTurnSettlement>();
/* The attempt a durable settlement row stated, so a stream continuing a run tells a late row of an earlier attempt
 * from its own (GM.r2 L-b). */
const settlementAttempts = new WeakMap<HostTurnSettlement, number>();

/** Every host-attested turn settlement this tab has seen. @see finalizedTurns */
export const getHostFinalizedTurns = (): readonly TurnFinalizedEvent[] => finalizedTurnSnapshot;

/** Wake a reader when a host settles another turn. @see finalizedTurns */
export const subscribeHostFinalizedTurns = (listener: () => void): (() => void) =>
  finalizedTurnTopic.subscribe(listener);

/** One read answer a stream folded, for the page's projection of that chat's log (W9 PV-S7). @public */
export type ChatLogAnswer = Readonly<{ chatId: string; answer: Parameters<typeof foldReadAnswer>[1] }>;
const chatLogAnswerTopic = new Topic<ChatLogAnswer>({ name: 'agent-host-chat-log-answers' });

/**
 * Hear every answer a stream reads from a chat's log: its replay's pages, and each followed row as a one-row batch at
 * that row's position. The chat store's projection folds them (W9 PV-S7).
 *
 * ponytail: tapped from today's replay path, so a chat is projected only while a stream reads it; PV-S12's
 * attachment reads every listed chat itself and replaces this.
 *
 * @param listener - Called with each answer, in the order the stream read it.
 * @returns Unsubscribe.
 * @public
 */
export const subscribeChatLogAnswers = (listener: (event: ChatLogAnswer) => void): (() => void) =>
  chatLogAnswerTopic.subscribe(listener);

/**
 * Hand one read answer to the chat's projection.
 *
 * @param chatId - The chat whose log answered.
 * @param answer - The answer, as read.
 * @public
 */
export const publishChatLogAnswer = (chatId: string, answer: ChatLogAnswer['answer']): void => {
  chatLogAnswerTopic.emit({ chatId, answer });
};

/** Observe every host-attested turn outcome, including durable replay. */
export const subscribeHostTurnSettlements = (listener: (event: HostTurnSettlement) => void): (() => void) =>
  hostTurnSettlementTopic.subscribe(listener);

/** The last durable outcome already replayed for one chat. */
export const getHostTurnSettlement = (chatId: string): HostTurnSettlement | undefined =>
  latestSettlementByChat.get(chatId);

/**
 * Record one host-attested settlement, wherever it came from.
 *
 * @param event - The settlement, already in the one schema.
 */
export const recordHostTurnSettlement = (event: HostTurnSettlement): void => {
  latestSettlementByChat.delete(event.chatId);
  latestSettlementByChat.set(event.chatId, event);
  for (const oldest of latestSettlementByChat.keys()) {
    if (latestSettlementByChat.size <= finalizedTurnLimit) {
      break;
    }
    latestSettlementByChat.delete(oldest);
  }
  if (event.type === 'turn.finalized' && finalizedTurns.get(event.turnId)?.revisionId !== event.revisionId) {
    finalizedTurns.set(event.turnId, event);
    for (const oldest of finalizedTurns.keys()) {
      if (finalizedTurns.size <= finalizedTurnLimit) {
        break;
      }
      finalizedTurns.delete(oldest);
    }
    finalizedTurnSnapshot = [...finalizedTurns.values()];
    finalizedTurnTopic.emit();
  }
  hostTurnSettlementTopic.emit(event);
};

/** Record the finalized member used by revision cards. */
export const recordHostFinalizedTurn = (event: TurnFinalizedEvent): void => {
  recordHostTurnSettlement(event);
};

/**
 * Resolve when the run that refused this admission has ended.
 *
 * Asked only after the host has refused an admission with `CHAT_RUN_LIVE`: the
 * snapshot answers a run that ended in the meantime, and the subscription
 * answers **that** run ending — not whatever ends next, which on a chat with
 * two views is a different run and resolved the wait on someone else's turn.
 *
 * The host names the live run in its refusal, but the worker's error wire
 * carries only a code and a message (`toWireError`), so the run id is read back
 * from the authority that raised it instead of parsed out of prose. Bounded by
 * the same settlement bound every other cross-owner wait takes: a run nobody is
 * driving never ends, and an unbounded wait here left the composer on
 * "Planning next moves…" for as long as the page stayed open.
 *
 * @param client - This chat's host client.
 * @param chatId - The chat whose live run must end.
 * @param abortSignal - The stream's own abort, so a stopped turn stops waiting.
 */
const liveRunEnded = async (
  client: AgentHostClient,
  chatId: string,
  abortSignal: AbortSignal | undefined,
): Promise<void> => {
  const ended = Promise.withResolvers<void>();
  const endedRuns = new Set<string>();
  let liveRunId: string | undefined;
  /* From the start of the log: the terminal row may already be behind the attach below, and `endedRuns` holds it.
   * ponytail: a whole-log read on this rare path; W9's projection answers it from the ledger. */
  const unsubscribe = client.subscribe({ chatId, cursor: 0 }, (_chatId, event) => {
    if (event.type !== 'run.lifecycle' || !terminal(event.state)) {
      return;
    }
    endedRuns.add(event.runId);
    if (event.runId === liveRunId) {
      ended.resolve();
    }
  });
  const abort = (): void => {
    ended.resolve();
  };
  abortSignal?.addEventListener('abort', abort, { once: true });
  try {
    const current = await client.attach({ chatId, cursor: 0 });
    const live = current.snapshot;
    if (live === undefined || terminal(live.state)) {
      return;
    }
    liveRunId = live.runId;
    // A terminal row for it may have arrived while the attach was in flight.
    if (endedRuns.has(live.runId) || abortSignal?.aborted === true) {
      return;
    }
    await awaitSettlement(
      ended.promise,
      `Chat ${chatId} is still running an earlier turn (${live.runId}). Reload the page and try again.`,
      'CHAT_RUN_LIVE',
    );
  } finally {
    abortSignal?.removeEventListener('abort', abort);
    unsubscribe();
  }
};

const recordDurableTurnSettlement = (event: AgentLiveEvent | AgentLogEvent): void => {
  if (!('leaderEpoch' in event)) {
    return;
  }
  const settlement = projectTurnSettlement(event);
  if (settlement !== undefined) {
    if (event.attempt !== undefined) {
      settlementAttempts.set(settlement, event.attempt);
    }
    recordHostTurnSettlement(settlement);
  }
};

export const getBrowserAgentHostRun = (chatId: string): BrowserAgentHostRun | undefined => browserRuns.get(chatId);

/**
 * What the host last said about a chat's run, as its two readers need it.
 *
 * The verdict, not the transcript: this map holds one entry per chat opened in
 * the tab and nothing evicts it, so keeping whole `HostRunSnapshot`s here —
 * `messages` and all — grew without bound for the length of the session. Its
 * neighbours (`finalizedTurns`, `latestSettlementByChat`) are capped for the
 * same reason; three fields per chat need no cap.
 */
type AttachedRun = Readonly<{
  runId: string;
  state: BrowserRunState;
  failure?: HostRunSnapshot['failure'];
}>;

const attachedRuns = new Map<string, AttachedRun>();

const recordAttachedRun = (chatId: string, snapshot: HostRunSnapshot): void => {
  attachedRuns.set(chatId, {
    runId: snapshot.runId,
    state: snapshot.state,
    ...(snapshot.failure === undefined ? {} : { failure: snapshot.failure }),
  });
};

/**
 * The host's last word about this chat's run.
 *
 * Two sources, one fact. `browserRuns` is what a stream of *this document*
 * published, so it is the fresher of the two while one is open and empty both
 * before the first stream of a reloaded page and after the settlement that
 * retires the record. The attachment is the host's own answer, recorded on
 * every attach and on every snapshot a `start` or `resume` returned, and
 * nothing retires it.
 */
const hostRunRecord = (chatId: string): AttachedRun | undefined => browserRuns.get(chatId) ?? attachedRuns.get(chatId);

/**
 * Whether this chat's turns are placed on a browser-hosted agent at all.
 *
 * Distinguishes "no run to reattach to" from "this placement never registers
 * one", which the two answers below cannot tell apart on their own.
 */
export const isBrowserAgentHostPlaced = (chatId: string): boolean => registrations.has(chatId);

/**
 * The run a *Try again* on this chat would continue, or `undefined` when there
 * is nothing left to continue and the turn has to be dispatched afresh.
 *
 * A reattach replays the log and stops where the run stopped, so a run the host
 * no longer holds is unrecoverable by resuming. A terminal run is the same,
 * with one exception: a run the gateway *refused* (no credit) never reached the
 * provider, so its history is whole and the host can continue it at the one
 * call it could not fund.
 *
 * The admission needs the run id as well as the verdict: a continuation is the
 * same attempt's successor, so its lease and its host request name the run the
 * host already holds (I1). Read from {@link hostRunRecord} rather than from the
 * page's own record, whose lifetime settlement owns — that is why *Try again*
 * after a credit refusal judged the run non-resumable and rewound the turn,
 * paying a second time for tool work the customer had already paid for.
 *
 * @param chatId - The chat being continued.
 * @returns The run id to continue, or `undefined`.
 * @public
 */
export const resumableBrowserAgentHostRunId = (chatId: string): string | undefined => {
  const run = hostRunRecord(chatId);
  if (run === undefined) {
    return undefined;
  }
  return !terminal(run.state) || (run.state === 'failed' && isResumableRunFailure(run.failure)) ? run.runId : undefined;
};

/** Whether the run this chat ended on stopped on a refusal a resume can continue. */
const refusedResumably = (chatId: string): boolean => {
  const run = hostRunRecord(chatId);
  return run?.state === 'failed' && isResumableRunFailure(run.failure);
};

/**
 * Let the next reattach of this chat drive the host's own resume.
 *
 * Reattaching is otherwise a read: reload discovery and the host-registration
 * effect both call `resumeStream` on their own, and a page refresh must never
 * spend the credit the user has just topped up without being asked. So the
 * *dispatch* says the continuation was asked for, and the transport still only
 * acts on it when the run actually stopped on a refusal it can retry.
 *
 * One-shot, consumed by the stream the caller is about to open.
 */
export const requestBrowserAgentHostResume = (chatId: string): void => {
  requestedResumes.add(chatId);
};

const setBrowserAgentHostRun = (chatId: string, run: BrowserAgentHostRun): void => {
  browserRuns.set(chatId, run);
  boundRunIds.set(chatId, run.runId);
  browserRunTopic.emit();
};

/**
 * Let go of this chat's run record now that its turn has settled.
 *
 * Retired, not erased. The record carries two facts with different lifetimes:
 * the page's live bookkeeping for a turn in flight, which the settlement ends,
 * and whether the host can still continue the run, which it does not. Dropping
 * both made *Try again* on a credit refusal a full re-admission — a new lease,
 * a new run id and a rewind that pays a second time for tool work the customer
 * already paid for (T3-D8) — so a terminal failure the host can continue stays,
 * and the next stream for that run republishes over it.
 *
 * @param chatId - The chat whose turn settled.
 * @param runId - The run that settled; a record naming another run is a newer
 *   turn's and is left alone.
 * @public
 */
export const retireBrowserAgentHostRun = (chatId: string, runId: string | undefined): void => {
  const run = browserRuns.get(chatId);
  if (run !== undefined && runId !== undefined && run.runId !== runId) {
    return;
  }
  if (run !== undefined && refusedResumably(chatId)) {
    return;
  }
  browserRuns.delete(chatId);
  boundRunIds.delete(chatId);
  browserRunTopic.emit();
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
 * the same chunk projection and the same SDK reducer, and only a run still
 * going streams. A settled run is rebuilt with the others and its replay
 * carries only its outcome: the chat's transcript merges every device's log
 * (A39), so its last message can be another device's later turn, and a resume
 * would have written this run's reply into that message.
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
  const streamedBlocks = new Map();
  const chunks = events.flatMap((event) => [...projectAgentHostEvent(event, streamedBlocks)]);
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
 * accompanies is what rebuilds that one. `undefined` streams no run. The map
 * also answers whether that stream may run at all: not when another device's
 * assistant message trails the transcript, because the AI SDK continues the transcript's trailing
 * assistant message — another device's — so the streaming run is then rebuilt
 * in place from the log too, and `streams` is `false`.
 */
const rebuildTranscript = async (
  events: readonly AgentLogEvent[],
  streamingRunId: string | undefined,
): Promise<(current: readonly MyUIMessage[]) => Readonly<{ messages: readonly MyUIMessage[]; streams: boolean }>> => {
  const runIds = [...new Set(events.map((event) => event.runId))];
  const runs = await Promise.all(
    runIds.map(async (id) => {
      const runEvents = events.filter((event) => event.runId === id);
      const user = runEvents.flatMap((event) => projectAgentHostUserTurn(event) ?? []).at(0);
      const assistant = await readRunMessage(runEvents);
      return [...(user === undefined ? [] : [user]), ...(assistant === undefined ? [] : [assistant])];
    }),
  );
  const whole = runs.flat();
  const wholeIds = new Set(whole.map((message) => message.id));
  const streamed = runs.flatMap((messages, index) =>
    runIds[index] === streamingRunId ? messages.filter((message) => message.role === 'user') : messages,
  );
  /*
   * Replaced by id, in place. The chat's files merge every device's log
   * (A39), so another device's turns sit in this transcript too, and one that
   * came after this log's first run is not this log's to drop: replacing
   * everything from that run onward erased the other device's later turns on
   * every reopen (two-client V15). A message this log rebuilds but the
   * transcript lacks — a daemon's chat this browser holds no files for — goes
   * after the rebuilt message before it, or at the end when none is held; the
   * streaming run's own copy is dropped, since its stream rebuilds it.
   */
  const place = (
    current: readonly MyUIMessage[],
    rebuilt: readonly MyUIMessage[],
    dropped: string | undefined,
  ): MyUIMessage[] => {
    const rebuiltById = new Map(rebuilt.map((message) => [message.id, message]));
    const next = current.flatMap((message) => (message.id === dropped ? [] : [rebuiltById.get(message.id) ?? message]));
    const firstHeld = next.findIndex((message) => rebuiltById.has(message.id));
    let at = firstHeld === -1 ? next.length : firstHeld;
    for (const message of rebuilt) {
      const held = next.findIndex((candidate) => candidate.id === message.id);
      if (held === -1) {
        next.splice(at, 0, message);
        at += 1;
      } else {
        at = held + 1;
      }
    }
    return next;
  };
  return (current) => {
    const messages = place(current, streamed, streamingRunId);
    const tail = messages.at(-1);
    /* Only a trailing assistant message is continued. Any other tail — this
     * run's own user turn, which a snapshot-only attach leaves out of the log —
     * gets a fresh message from the stream. */
    if (streamingRunId === undefined || tail?.role !== 'assistant' || wholeIds.has(tail.id)) {
      return { messages, streams: true };
    }
    /* ponytail: the run is rebuilt from what the log holds now, so a run still
     * live here stops updating until the chat is next opened, and its failure
     * reason is not raised meanwhile. The upgrade path is a stream that writes
     * into the run's own message by id instead of the transcript's tail. */
    return { messages: place(current, whole, undefined), streams: false };
  };
};

/**
 * The transcript one chat's log implies, for a chat opened from its files.
 *
 * The same derivation the reattach path runs, with no stream to splice into:
 * `.tau/chats/<id>` is the whole of a chat (D25/A39), so `chat.json` carries no
 * `messages` and the transcript is rebuilt from the merged segments on open
 * (P26). One reducer, one home — this is {@link rebuildTranscript} applied to an
 * empty transcript, not a second projection of the same events.
 *
 * @param events - Every record of the chat, already merged across devices.
 * @returns The messages the log implies, oldest first.
 */
export const deriveChatTranscript = async (events: readonly AgentLogEvent[]): Promise<readonly MyUIMessage[]> => {
  for (const event of events) {
    recordDurableTurnSettlement(event);
  }
  const rebuild = await rebuildTranscript(events, undefined);
  return rebuild([]).messages;
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
    trigger: z.enum(['edit', 'regenerate']),
    retainedMessageIds: z.array(z.string()),
    config: agentHostAdmissionConfigSchema,
  }),
  z.strictObject({
    trigger: z.literal('submit'),
    agent: agentHostExternalAgentSchema,
    context: agentHostExternalContextSchema.optional(),
  }),
  z.strictObject({
    trigger: z.enum(['edit', 'regenerate']),
    retainedMessageIds: z.array(z.string()),
    agent: agentHostExternalAgentSchema,
    context: agentHostExternalContextSchema.optional(),
  }),
]);
/* Loose: the rest of the body (its `execution` placement among it) is the client's own bookkeeping. The revision
 * mode and base no longer ride the admission: placement answers both (drift 4, W8 TS-R12). */
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
    if (part.type === 'file') {
      /* A content-addressed attachment: the bytes are already durable beside
       * the log, so the row references them rather than re-inlining base64 on
       * every retry, edit and reattach. A `FileUIPart` has no size field, so a
       * composer that knows it rides it on `providerMetadata.common`. */
      if (isAttachmentUrl(part.url)) {
        const byteLength = part.providerMetadata?.['common']?.['byteLength'];
        content.push({
          type: 'file-ref',
          path: part.url,
          mimeType: part.mediaType,
          /* Optional (P29): a freshly composed draft has the `Attachment` and
           * its size, a draft hydrated from a record has only the file part.
           * Omitted beats fabricated — nothing reads it, and a row must never
           * lie about its size. */
          ...(typeof byteLength === 'number' && Number.isInteger(byteLength) && byteLength >= 0 ? { byteLength } : {}),
          ...(part.filename === undefined ? {} : { filename: part.filename }),
        });
        continue;
      }
      // The legacy arm (D14): a caller that still hands over inline base64. Only an image is an image block (G8).
      const match = /^data:(image\/[^;,]+);base64,(.*)$/u.exec(part.url);
      if (!match) {
        throw new TypeError(`Browser agent host cannot record file part URL "${part.url}".`);
      }
      content.push({ type: 'image', mimeType: match[1]!, data: match[2]! });
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

/**
 * The refusal a terminal lifecycle row carries, which decides resumability.
 *
 * A `RunFailureDetail` states its message but need not carry a code, while a
 * snapshot's failure names both: `isResumableRunFailure` decides on the code,
 * so an uncoded row is a failure nobody can offer a recovery for. It answers
 * nothing rather than a refusal that cannot be judged.
 */
const lifecycleFailure = (event: AgentLogEvent | AgentLiveEvent): HostRunSnapshot['failure'] => {
  if (!('leaderEpoch' in event) || event.type !== 'run.lifecycle' || event.state !== 'failed') {
    return undefined;
  }
  const { detail } = event;
  return detail?.code === undefined ? undefined : { ...detail, code: detail.code };
};

/** Where the host placed an attempt, as its `running` row states it (W8 TS-S5). */
const lifecyclePlacement = (event: AgentLogEvent | AgentLiveEvent): BrowserAgentHostRun['placement'] =>
  'leaderEpoch' in event && event.type === 'run.lifecycle' && event.state === 'running' && event.placement !== undefined
    ? { baseRevisionId: event.placement.baseRevisionId }
    : undefined;

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
   * `undefined` when it resolved no run. Called exactly once. `idle` is true
   * only when the host answered for a log with no run and this stream was not
   * asked to drive one: nothing will ever be written, and the caller may treat
   * the resume as no request at all. `settled` says the run has ended and
   * nobody asked to continue it; answering `true` takes its message, and the
   * stream then writes only its outcome. See {@link registerAgentHostRunReset}.
   */
  readonly onRunResolved?:
    | ((
        runId: string | undefined,
        events: readonly AgentLogEvent[],
        found: Readonly<{ idle: boolean; settled: boolean }>,
      ) => boolean)
    | undefined;
}): ReadableStream<UIMessageChunk> => {
  let announceRun = input.onRunResolved;
  /** The transcript owner rebuilt this settled run's message; its replay carries only `error` chunks. */
  let messageRebuilt = false;
  const announce = (
    resolved: string | undefined,
    events: readonly AgentLogEvent[] = [],
    found?: Readonly<{ idle: boolean; settled: boolean }>,
  ): void => {
    const once = announceRun;
    if (once === undefined) {
      return;
    }
    announceRun = undefined;
    messageRebuilt = once(resolved, events, found ?? { idle: false, settled: false });
  };
  /* Consumed the moment the stream is created, so a later reattach this caller
   * did not ask for never inherits it. @see requestBrowserAgentHostResume */
  const driveResume = requestedResumes.delete(input.chatId);
  /* Decided here, once, because the replay below republishes the very record
   * `refusedResumably` reads — and because the replay needs the answer before
   * the resume branch that acts on it. */
  const continuesRefusedRun = driveResume && refusedResumably(input.chatId);
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
    let unsubscribeSettlement: (() => void) | undefined;
    let continueRun: ((commandId?: string) => Promise<void>) | undefined;
    let { runId } = input;
    let closed = false;
    let cursor = 0;
    let ledger = emptyChatLedger;
    let eventCount = 0;
    let state: BrowserRunState = 'admitted';
    let turnId: string | undefined;
    let durableUserMessage: MyUIMessage | undefined;
    let failure: HostRunSnapshot['failure'];
    let placement: BrowserAgentHostRun['placement'];
    let externalToolRun = input.admission !== undefined && 'agent' in input.admission;
    let projection = Promise.resolve();
    const seen = new Set<string>();
    const streamedBlocks = new Map();
    let attaching: Array<AgentLogEvent | AgentLiveEvent> | undefined = [];
    /* Both re-armed when a resume reopens the run, at the moment it is issued:
     * a continuation attaches to a log whose last attempt already ended, so
     * both gates are resolved before the host is even asked to continue. Left
     * resolved, the stream closed the instant `resume` answered — the page
     * settled the reopened attempt as failed and the reply the host went on to
     * produce reached nobody (I1) — and the settlement one is keyed on the
     * *attempt*, whose predecessor's `turn.failed` the replay republishes under
     * this same run id. */
    let terminalEvent = Promise.withResolvers<void>();
    let turnSettlement = Promise.withResolvers<void>();
    /* The run's last attempt this stream saw open or end, and the one a re-armed gate waits past: attempt 1's late
     * `turn.*` row must not release the gate re-armed for attempt 2 (GM.r2 L-b). */
    let seenAttempt = 0;
    let settledThrough = 0;
    const armSettlement = (): void => {
      settledThrough = seenAttempt;
      turnSettlement = Promise.withResolvers<void>();
    };
    /* The follow that delivers the settlement row stopped for a reason of its own (the host or its channel died):
     * the row cannot reach this stream, and the host that reconciles the attempt appends it for the next attach. */
    const followEnded = Promise.withResolvers<void>();
    /* Wait out the attempt's `turn.*` row: the host appends one for every attempt it recorded (W8 TS-S6), so the
     * wait ends on a fact, never a clock. A run the host recorded nothing of (refused before its first row) has
     * none coming, and a stream whose follow never started has nothing to deliver it. */
    const observeSettlement = async (): Promise<void> => {
      if (eventCount === 0 || unsubscribe === undefined) {
        return;
      }
      await Promise.race([turnSettlement.promise, followEnded.promise]);
    };
    /* This stream drives the run — it admitted it, or it is continuing it — so
     * the host *will* append the attempt's `turn.*` row after its terminal row
     * (W8 TS-S6), and this stream's follow is what delivers it. Held past the
     * readable stream on every exit, a stop and a refusal included (I1, V10). */
    let holdWriterForSettlement = input.admission !== undefined || continuesRefusedRun;
    /* Set once the completed path has waited for the settlement, so the wait
     * in `finally` is only ever the stop's and the refusal's. */
    let lateSettlementAwaited = false;
    /** Cleared the moment the continuation is issued; see {@link enqueueEvent}. */
    let replayingContinuedFailure = continuesRefusedRun;
    let isRunPublished = false;
    const publishRun = (): void => {
      if (runId === undefined) {
        return;
      }
      /* Project settlement clears this chat's run record the moment it
       * finalizes the turn, while this stream is still subscribed waiting out
       * that very settlement. Its replay used to re-publish the record, and
       * every later reader saw a completed run the page had already retired —
       * which is what made reload discovery compare the *next* turn's claim
       * against a zombie and abandon its lease. A stream never resurrects a
       * record it has already published; a fresh stream for the same run (a
       * refused turn the user funds and continues) starts clean and may. */
      if (isRunPublished && !browserRuns.has(input.chatId)) {
        return;
      }
      isRunPublished = true;
      setBrowserAgentHostRun(input.chatId, {
        runId,
        state,
        eventCount,
        ...(turnId === undefined ? {} : { turnId }),
        ...(durableUserMessage === undefined ? {} : { userMessage: durableUserMessage }),
        ...(failure === undefined ? {} : { failure }),
        ...(placement === undefined ? {} : { placement }),
      });
    };
    const enqueueChunks = async (chunks: readonly UIMessageChunk[]): Promise<void> => {
      for (const chunk of chunks) {
        if (cancelled || closed) {
          return;
        }
        /* An `error` chunk only raises the failure; every other chunk writes
         * into the transcript's last message, which the owner already rebuilt. */
        if (messageRebuilt && chunk.type !== 'error') {
          continue;
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
        /* ACP also publishes tool updates as durable rows carrying ToolKind and
         * Tau MCP presentation. A metadata-poor live copy arriving first would
         * permanently type the AI SDK part as `tool-${title}`. */
        if (externalToolRun && event.type.startsWith('tool-') && event.type !== 'tool-output-update') {
          return;
        }
        await enqueueChunks(projectAgentHostLiveEvent(event, streamedBlocks));
        return;
      }
      if (
        event.type === 'message.appended' &&
        event.message.role === 'user' &&
        isRecord(event.message.metadata?.tauInternal) &&
        event.message.metadata.tauInternal['kind'] === 'external-agent'
      ) {
        externalToolRun = true;
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
      if (event.type === 'run.lifecycle' && event.runId === runId && event.attempt !== undefined) {
        seenAttempt = Math.max(seenAttempt, event.attempt);
      }
      /* The terminal row carries the refusal, and throwing it away left the
       * record saying `failed` with nothing to judge: resumability read
       * `isResumableRunFailure(undefined)` for every run whose failure arrived
       * as an event rather than in a snapshot, so a live credit refusal was
       * judged unrecoverable and *Try again* rewound the turn. */
      failure = lifecycleFailure(event) ?? failure;
      placement = lifecyclePlacement(event) ?? placement;
      eventCount += 1;
      publishRun();
      /* The failure this stream is about to continue is the *previous*
       * attempt's, not this request's outcome. `run.lifecycle: failed`
       * projects to an `error` chunk and the AI SDK rethrows the first one it
       * reads, so replaying it ended the resume's request before `resume` had
       * answered: the page settled the reopened attempt `turn.failed` and the
       * cancelled readable cancelled the run the host was still executing
       * (I1). The person is already looking at that failure — it is the card
       * they pressed Resume on. Only the replay is silenced; the reopened
       * attempt's own failure is this request's outcome and is reported. */
      const continued = replayingContinuedFailure && event.type === 'run.lifecycle' && event.state === 'failed';
      if (!continued) {
        await enqueueChunks(projectAgentHostEvent(event, streamedBlocks));
      }
      if (terminal(state)) {
        terminalEvent.resolve();
      }
    };
    const enqueueAfter = async (previous: Promise<void>, event: AgentLogEvent | AgentLiveEvent): Promise<void> => {
      await previous;
      await enqueueEvent(event);
      /* Reattach replays the whole chat log. Publish every earlier turn's
       * settlement too, but only after its preceding lifecycle projection has
       * crossed the stream backpressure boundary. */
      recordDurableTurnSettlement(event);
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
    const queueSubscribedEvent = (event: AgentLogEvent | AgentLiveEvent): void => {
      if (attaching === undefined) {
        queueEvent(event);
      } else {
        attaching.push(event);
      }
    };
    /**
     * Page the log to its end, writing nothing.
     *
     * Collected rather than streamed page-by-page because the transcript owner
     * has to be handed the *whole* log before the first chunk is written — it
     * rebuilds every run this stream will not, and the AI SDK snapshots the
     * transcript the moment `reconnectToStream` settles. Pages are 16 events
     * (`agentWireLimits.batchRows`), so a four-run chat is ten round trips.
     *
     * ponytail: the whole log is held in memory for the length of the replay.
     * Fine at a chat's natural size (the operator's four-run log is 700 KB);
     * if a chat ever outgrows that, page the *earlier* runs into the rebuild
     * incrementally and keep only the trailing run's events here.
     */
    const collectLog = async (hostClient: AgentHostClient, first: HostEventBatch): Promise<AgentLogEvent[]> => {
      /* Every page goes through the ledger's read fold (CL-R13): a page that does not start at this reader's
       * cursor is stale and read again, and a refusal — the log is not the one this reader was reading — refolds
       * from the start instead of ending the replay on it (SC-R12). Rows already projected are skipped by `seen`. */
      let events: AgentLogEvent[] = [];
      let batch: ReadAnswer = first;
      for (let page = 0; ; page++) {
        publishChatLogAnswer(input.chatId, batch);
        const fold = foldReadAnswer(ledger, batch);
        if (fold.kind === 'folded' && batch.status === 'batch') {
          ledger = fold.ledger;
          // ponytail: rows cross the wire unparsed; W9's projection reads them through the ledger's tolerant reader.
          events.push(...(batch.events as AgentLogEvent[]));
          if (ledger.position.cursor >= batch.endCursor) {
            cursor = ledger.position.cursor;
            return events;
          }
        } else if (fold.kind === 'reset') {
          console.warn(
            `[agentHost] the chat log read came back ${fold.reason}; reading it again from the start`,
            input.chatId,
          );
          ledger = emptyChatLedger;
          events = [];
        } else if (fold.kind === 'refused') {
          throw Object.assign(new Error(`The host refused to read chat ${input.chatId} (${fold.reason}).`), {
            code: fold.reason === 'owner-fenced' ? 'LEADERSHIP_LOST' : 'COMMAND_UNREADABLE',
          });
        }
        if (page > maxReadPages) {
          throw Object.assign(new Error(`The log of chat ${input.chatId} did not settle while it was read.`), {
            code: 'LOG_READ_UNSETTLED',
          });
        }
        cursor = ledger.position.cursor;
        // oxlint-disable-next-line no-await-in-loop -- pages are read in order from the reader's cursor.
        batch = await hostClient.read({ chatId: input.chatId, cursor, last: ledger.position.last });
      }
    };
    const reconcileSnapshot = (snapshot: HostRunSnapshot | undefined, reopens = false): boolean => {
      if (!snapshot || snapshot.runId !== runId) {
        return false;
      }
      /* The host's own answer about this run, wherever it came from: `start`
       * and `resume` return one too, and a reader that only ever saw the
       * *attach* snapshot would answer a same-document *Try again* from the
       * state the chat was in before this run existed. */
      recordAttachedRun(input.chatId, snapshot);
      /* A snapshot answers the *admission*, so a run the gateway refused at its
       * model call has already ended by the time `start` resolves. Adopting the
       * snapshot's state wholesale rewound the record to `running` and erased
       * the refusal the terminal row carried, which is what made the page
       * answer a later *Try again* from a run it thought was still going. Only
       * a resume legitimately reopens a run this stream saw end. */
      if (reopens || !terminal(state)) {
        state = snapshot.state;
      }
      turnId = snapshot.turnId;
      failure = snapshot.failure ?? failure;
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
      attaching ??= [];
      const batch = await hostClient.attach({ chatId: input.chatId, cursor, last: ledger.position.last });
      if (batch.snapshot) {
        recordAttachedRun(input.chatId, batch.snapshot);
      }
      /* This attach found a run with no driver in its host and asked for the
       * chat's claim (RH-R1); the claim's outcome arrives as rows, the host's
       * reconciled `turn.*` row among them (I7). A read-only reattach otherwise
       * closes its follow the moment the replay ends, and that row reaches
       * nobody here. */
      holdWriterForSettlement ||= batch.takeover === true;
      // The log's own snapshot names the run this chat ends on — the only source
      // for a reattach whose in-memory binding a reload dropped. The host answers
      // one for every non-empty log (and takes a non-terminal run over first).
      runId ??= batch.snapshot?.runId;
      if (runId !== undefined) {
        /* Lifecycle observers need the resolved run identity before replay can
         * publish its first host-attested settlement. Stop needs it from the
         * same moment: the SDK is handed this stream right after (W0.3). */
        boundRunIds.set(input.chatId, runId);
        activeClients.set(input.chatId, { client: hostClient, runId });
      }
      const events = await collectLog(hostClient, batch);
      // Handed over before the first chunk is written, and only now that the
      // host has actually answered for this chat's log.
      const found = batch.snapshot;
      announce(runId, events, {
        idle: runId === undefined && !driveResume && input.admission === undefined,
        settled: !driveResume && found !== undefined && found.runId === runId && terminal(found.state),
      });
      for (const event of events) {
        queueEvent(event);
      }
      await projection;
      const reconciled = reconcileSnapshot(batch.snapshot);
      // Snapshot first; coordinate-aware blocks and durable IDs discard overlap.
      const received = attaching;
      attaching = undefined;
      for (const event of received) {
        queueEvent(event);
      }
      await projection;
      return reconciled;
    };
    try {
      if (priorSettlement) {
        await awaitSettlement(
          priorSettlement,
          'The previous message on this chat never finished. Reload the page and try again.',
        );
      }
      const registration = await registrationFor(input.chatId);
      const bindRun = (bound: string): void => {
        boundRunIds.set(input.chatId, bound);
        if (client) {
          activeClients.set(input.chatId, { client, runId: bound });
        }
      };
      if (runId !== undefined) {
        bindRun(runId);
      }
      client = await registration.createClient();
      if (runId !== undefined) {
        activeClients.set(input.chatId, { client, runId });
      }
      /* The paused attempt's `turn.*` row already resolved the settlement gate, so the continued attempt's row is the
       * one to wait for. `terminalEvent` stays: `paused` is not terminal, and this stream is awaiting that very
       * promise, which a replacement would strand. */
      continueRun = async (commandId?: string): Promise<void> => {
        /* Re-armed once every row already delivered is projected, the paused attempt's settlement among them. */
        await projection;
        armSettlement();
        let snapshot: HostRunSnapshot;
        try {
          snapshot = await client!.resume(input.chatId, runId!, commandId);
        } catch (error) {
          /* Refused (another request pending, the run gone, another run live): no attempt opened, so none will
           * settle. Restored, the gate lets the stream end with the run instead of holding its client (GM.r2 M1). */
          turnSettlement.resolve();
          throw error;
        }
        await projection;
        reconcileSnapshot(snapshot, true);
      };
      continuations.set(input.chatId, continueRun);
      unsubscribeLive = client.subscribeLive?.(input.chatId, (_chatId, event) => {
        queueSubscribedEvent(event);
      });
      /* Every host appends its turns' `turn.*` rows to the chat's log (W8
       * TS-S6), and they publish through this one topic. Subscribe before
       * replay/admission so a lifecycle-completed stream cannot close in the
       * gap before the matching settlement reaches the chat machine. */
      unsubscribeSettlement = subscribeHostTurnSettlements((event) => {
        if (
          event.chatId === input.chatId &&
          event.runId === runId &&
          (settlementAttempts.get(event) ?? Number.POSITIVE_INFINITY) > settledThrough
        ) {
          turnSettlement.resolve();
        }
      });
      cancelRun = () => {
        if (client && runId !== undefined) {
          void cancelClientRun(client, runId);
        }
      };
      await replay(client);
      /* Durable rows are pulled from where the replay ended (SC-R14): one outstanding read, so nothing is pushed
       * past this reader and nothing between the replay and the follow is lost. */
      unsubscribe = client.subscribe(
        { chatId: input.chatId, cursor },
        (_chatId, event, position) => {
          if (position !== undefined) {
            publishChatLogAnswer(input.chatId, {
              status: 'batch',
              cursor: position,
              nextCursor: position + 1,
              endCursor: position + 1,
              events: [event],
            });
          }
          queueSubscribedEvent(event);
        },
        () => {
          followEnded.resolve();
        },
      );
      /* A terminal snapshot found on initial attach has no later frame to
       * retain a client for. Every run this stream is actively observing or
       * driving can still publish its P71 settlement after lifecycle
       * completion, so its subscription must outlive the readable stream. */
      const awaitLateSettlement = !terminal(state) || holdWriterForSettlement || driveResume;
      if (input.runId === undefined && runId !== undefined) {
        bindRun(runId);
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
        const startOnce = async (hostClient: AgentHostClient): Promise<HostRunSnapshot> =>
          hostClient.start({
            chatId: input.chatId,
            runId,
            message: admittedMessage,
            ...input.admission,
          } as HostStartInput);
        /**
         * Admit once the chat's previous run has ended.
         *
         * This page can come back to a chat mid-turn: the previous document
         * unloaded with the run still going, its workspace claim went with it,
         * and nothing here ever attached to it — so the page believes the chat
         * is idle and the host, which knows better, refuses the admission. The
         * refusal is the fact; waiting it out and admitting once is what the
         * person asked for, and it is bounded by the run itself ending.
         */
        const recoverFromLiveRun = async (error: unknown): Promise<HostRunSnapshot> => {
          /* The code alone, because the host now raises this one from a single
           * builder for both the in-memory and the durable refusal. The regex
           * that used to stand in for it (`/has a \w+ run/`) matched neither
           * the durable wording nor a duplicate run id, and nothing wrote down
           * which of the five conditions it meant to catch. */
          if (!(error instanceof AgentHostWorkerError) || error.code !== 'CHAT_RUN_LIVE' || cancelled) {
            throw error;
          }
          await liveRunEnded(client!, input.chatId, input.abortSignal);
          if (input.abortSignal?.aborted === true) {
            throw error;
          }
          /* The run ended but its attempt may still be settling: `wait` until it is admitted (W8.r1 item 6). */
          return resendWhileSettling(async () => startOnce(client!), input.abortSignal, settlementTimeout);
        };
        /* The command itself is issued before this frame yields — the recovery
         * is a rejection handler, never a wrapper that defers the start. */
        const operation = startOnce(client);
        if (cancelled) {
          cancelRun();
        }
        let snapshot: HostRunSnapshot;
        try {
          snapshot = await operation;
        } catch (error) {
          snapshot = await recoverFromLiveRun(error);
        }
        await projection;
        if (terminal(snapshot.state) && !terminal(state)) {
          await replay(client);
          if (!terminal(state)) {
            reconcileSnapshot(snapshot);
          }
        } else {
          reconcileSnapshot(snapshot);
        }
      } else if (driveResume && !continuesRefusedRun && terminal(state)) {
        /* Resume was asked for and there is nothing to continue. The flag is
         * one-shot and was consumed at stream creation, so the silent branch
         * this replaces left the person having pressed Resume with the stream
         * opening, replaying and closing — no continuation, no message. A
         * refusal that names its recovery is the outcome. */
        throw new AgentHostWorkerError(
          'RESUME_UNAVAILABLE' satisfies RefusalCode,
          'This turn has nothing left to continue. Send it again to start a new one.',
        );
      } else if (continuesRefusedRun) {
        // The turn the gateway refused, continued at the call it could not
        // fund. The host owns that continuation — it reattaches the session
        // from its own durable log — so the tool results already paid for are
        // replayed rather than run again, and its events arrive on the
        // subscription this stream is already writing.
        /* The replay above just republished the previous attempt's terminal row
         * and its settlement under this run id, resolving both of this stream's
         * gates before the attempt they belong to exists. Re-armed here, where
         * the continuation is issued, rather than from whatever the `resume`
         * snapshot happens to say: the host writes `run.lifecycle: running`
         * before it answers, so a re-arm conditioned on a non-terminal snapshot
         * lost that race and closed the stream over the reply. */
        terminalEvent = Promise.withResolvers<void>();
        armSettlement();
        // Everything the log already held is projected; what follows is this
        // attempt's, failure included.
        replayingContinuedFailure = false;
        const operation = client.resume(input.chatId, runId);
        if (cancelled) {
          cancelRun();
        }
        const snapshot = await operation;
        await projection;
        reconcileSnapshot(snapshot, true);
      }
      if (!terminal(state) && !cancelled) {
        await terminalEvent.promise;
        await projection;
      }
      closed = true;
      /* R7: the consumer cancels the readable side the moment it reads the
       * error chunk this stream already wrote, which errors the writable side,
       * and closing an errored writable throws. That throw used to reach the
       * settled-stream log, which then reported a failure the card already
       * carried ("Cannot close a ERRORED writable stream"). The stream ends
       * here either way; only a writer that really closed has a consumer left
       * to hold open for the settlement below. */
      const writerClosed = await writer.close().then(
        () => true,
        () => false,
      );
      if (writerClosed && awaitLateSettlement && !cancelled) {
        lateSettlementAwaited = true;
        await observeSettlement();
        await projection;
      }
    } catch (error) {
      if (closed) {
        /* Past the writer there is nobody left to refuse to — this stream's
         * chunks are already on screen. Said out loud anyway, because the wait
         * that lands here is the one that used to hold the next turn. */
        console.error('[browserAgentHost] stream failed after it settled', input.chatId, error);
      } else {
        closed = true;
        await (cancelled ? writer.close() : writer.abort(error)).catch(() => undefined);
      }
    } finally {
      // A stream that never reached `attach` — a refused registration, a host
      // that would not open — resolved no run, and rebuilds nothing.
      announce(undefined);
      input.abortSignal?.removeEventListener('abort', cancel);
      if (holdWriterForSettlement && !lateSettlementAwaited && client !== undefined && runId !== undefined) {
        /* The completed path waited above; this is the stopped and refused
         * turn, whose `turn.*` row the host appends after the stream is gone
         * (W8 TS-S6). */
        await observeSettlement();
        await projection;
      }
      unsubscribe?.();
      unsubscribeLive?.();
      unsubscribeSettlement?.();
      if (activeClients.get(input.chatId)?.client === client) {
        activeClients.delete(input.chatId);
      }
      if (continueRun !== undefined && continuations.get(input.chatId) === continueRun) {
        continuations.delete(input.chatId);
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

/**
 * Ask the host to cancel the run this chat's stream is attached to (W0.3, D17).
 *
 * The SDK's abort only detaches a stream it admitted, and a reattached stream
 * has no abort at all; Stop is the host's `cancel`. A chat with no attached run
 * cancels nothing.
 *
 * @param chatId - The chat whose attached run the person stopped.
 */
export const cancelBrowserAgentHostRun = async (chatId: string): Promise<void> => {
  const active = activeClients.get(chatId);
  if (active) {
    await cancelClientRun(active.client, active.runId);
  }
};

/**
 * Answer a projected browser-host approval without opening a new admission.
 *
 * W9 PV-S10: an approval sends `resolve-interrupt`, then `resume` for a native run the answer leaves paused. Asking
 * ended the attempt (D10, TS-R10), so nothing else continues it; an external driver continues on its own, and a denial
 * ends the run. The stream following the chat continues it, so it waits for the continued attempt; a chat no stream
 * follows (a daemon-placed run answered from its card) is answered over a client of its own (GM.r1 H1).
 *
 * @param input - The chat, its run, the interrupt and the person's answer.
 */
export const resolveBrowserAgentHostInterrupt = async (input: {
  readonly chatId: string;
  readonly runId: string;
  readonly interruptId: string;
  readonly approved: boolean;
  readonly reason?: string | undefined;
  /** The exact option the human chose, when the request offered a list. */
  readonly optionId?: string | undefined;
  /** Minted once at the approval click, then reused for every host re-send. */
  readonly commandId: string;
  /** A native approval's follow-up resume has its own sender-minted id. */
  readonly resumeCommandId?: string | undefined;
}): Promise<void> => {
  const active = activeClients.get(input.chatId);
  const attached = active?.runId === input.runId ? active : undefined;
  const registration = attached === undefined ? await registrationFor(input.chatId) : undefined;
  const client = attached?.client ?? (await registration!.createClient());
  try {
    const answered = await client.resolveInterrupt(input.chatId, input.runId, {
      interruptId: input.interruptId,
      outcome: input.approved ? 'approved' : 'denied',
      ...(input.optionId ? { optionId: input.optionId } : {}),
      ...(input.reason ? { payload: { reason: input.reason } } : {}),
      commandId: input.commandId,
    });
    if (!input.approved || answered.runId !== input.runId || answered.state !== 'paused') {
      return;
    }
    const continueRun = attached === undefined ? undefined : continuations.get(input.chatId);
    try {
      await (continueRun === undefined
        ? client.resume(input.chatId, input.runId, input.resumeCommandId)
        : continueRun(input.resumeCommandId));
    } catch (error) {
      /* Another request of the run still waits; its answer continues the run. */
      if (!(error instanceof AgentHostWorkerError) || error.code !== 'INTERRUPT_PENDING') {
        throw error;
      }
    }
  } finally {
    if (attached === undefined) {
      const closeError = await closeClient(client);
      if (closeError !== undefined) {
        console.error('[browserAgentHost] closing the approval client failed', input.chatId, closeError);
      }
    }
  }
};

/**
 * Routes one AI SDK chat pipeline into the browser agent host.
 *
 * There is no longer an "or": every CAD execution kind is host-placed — `tau`
 * on this worker, `acp` on a daemon — so the API transport this class used to
 * wrap has no turn left to carry and was deleted with it. An admission that cannot be parsed is a refusal naming the
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
      readonly idle: boolean;
      readonly streamingRunId: string | undefined;
    }>();
    const stream = createHostStream({
      chatId: options.chatId,
      ...(runId === undefined ? {} : { runId }),
      onRunResolved: (resolvedRunId, events, { idle, settled }) => {
        /* A settled run is rebuilt in place with the others, and only when
         * someone owns the transcript to put it in. */
        const rebuilt = settled && resolvedRunId !== undefined && runResets.has(options.chatId);
        resolved.resolve({ runId: resolvedRunId, events, idle, streamingRunId: rebuilt ? undefined : resolvedRunId });
        return rebuilt;
      },
    });
    // The AI SDK snapshots the transcript *after* this method settles, so the
    // log's own transcript is handed over here — before the replay that rebuilds
    // it could be appended to a stale copy instead. A host that resolved no run
    // hands over nothing, and the transcript stands.
    const replayed = await resolved.promise;
    /* The host answered for a log with no run (W0.2, L3 D1). A stream here
     * made the SDK walk `submitted → ready` and call `onFinish`, which read as
     * a run finishing and marked the chat unread. `null` is no request at all;
     * the stream closes itself. A refused registration never answered, so it
     * still returns its erroring stream. */
    if (replayed.idle) {
      return null;
    }
    const reset = replayed.runId === undefined ? undefined : runResets.get(options.chatId);
    if (reset) {
      const rebuild = await rebuildTranscript(replayed.events, replayed.streamingRunId);
      /* Read back after `reset`, which applies the rebuild synchronously. */
      const handover = { streams: true };
      reset((current) => {
        const next = rebuild(current);
        handover.streams = next.streams;
        return next.messages;
      });
      if (!handover.streams) {
        /* The rebuild above already carries this run; nothing may extend the
         * tail. Drained rather than cancelled, because cancelling the stream
         * asks the host to cancel the run. */
        // async-iife: bootstrap -- nobody reads this stream; it only has to run to its end.
        void (async () => {
          try {
            await stream.pipeTo(new WritableStream());
          } catch {
            /* The stream reports its own failure; a drain has nobody to tell. */
          }
        })();
        return null;
      }
    }
    return stream;
  }
}
