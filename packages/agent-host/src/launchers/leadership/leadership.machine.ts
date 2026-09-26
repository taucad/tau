/**
 * `leadership` (M2, W6 T4): one actor per project and chat in a resident browser worker, deciding who writes the
 * chat's log among the tabs of one origin.
 *
 * Web Locks elect and W3's lazy claim decides who may write: the grantee opens the chat's writer, which reads the log,
 * and takes the log's highest epoch plus one; its first append claims the term, conditional on that read (D5,
 * RH-R9). Steal is a notice (`lockLost`). A chat's lock is held only while the chat needs a writer: from the grant that
 * serves a write or a reconciliation until M1 reports quiescent (EQ4, RH-R8). Every wait is bounded by the heartbeat
 * of the epoch it addressed, and M2 never addresses an epoch below its floor (RH-R10, SC-R10).
 *
 * Effects are custom actions the browser binding provides (`createBrowserLeadership`); they report back as correlated
 * public events, checked before anything else (MC-R18). Frames are parsed at the adapter only (EQ5): M2 receives
 * `frame` events carrying a parsed {@link LeadershipMessage}.
 *
 * Durable sources (MC-R5): `epoch` is the log's highest epoch plus one, from `viewRead`. `floor`, `heard`, `writes`,
 * `reads` and `running` are memory-only by declaration; after a restart the page re-sends under the same command ids
 * (D15). There is no replication cursor: a follower forwards each read with the reader's own cursor, so serving a
 * window never moves anyone else's (RH-R11, HD-1 by construction).
 *
 * Every transition carries the `LogLeadership.tla` action it refines as static `meta.tla` (MC-R27, via `refines`);
 * `Unmodelled` marks the fault root, visibility, reads, close, the backoff, the claim bound and the frozen-time rule.
 * Where one event holds branches that refine different actions, `branches` splits them into labelled transitions
 * (W7.r1). A branch that drops a stale report stays under its transition's label.
 *
 * The page lifecycle (RH-R16, `Freeze`): hiding drops only a queued lock request not yet granted; a grant is kept.
 * A heartbeat bound that fired late, because this tab was frozen, is re-armed once for a full window (W4 T9, as
 * `@taucad/rpc`'s liveness bound): the binding measures how late (`watchHolder`, `checkHolder`), since a transition
 * reads no clock (MC-R6).
 */

import { setup, types } from 'xstate';

import type { LeadershipMessage } from '#launchers/leadership/frames.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import type { ReadAnswer, ReadRequest } from '#wire/frames.schema.js';

/** The spec actions M2's transitions refine (`LogLeadership.tla`; the bridge table in its header). */
export type LogLeadershipAction =
  | 'Acquire'
  | 'StealLock'
  | 'Notice'
  | 'Read'
  | 'Claim'
  | 'Refused'
  | 'Release'
  | 'Send'
  | 'Answer'
  | 'Heartbeat'
  | 'QueueReconcile'
  | 'TimeOut';

/** A transition's label: the spec action it refines, or `Unmodelled`. */
export type LeadershipTransitionLabel = LogLeadershipAction | 'Unmodelled';

/** How a Web Lock is requested: now or not at all, by stealing, or waiting its turn. */
export type LockMode = 'ifAvailable' | 'steal' | 'queued';

/** One chat's M2 identity. */
export type LeadershipInput = Readonly<{
  chatId: string;
  /** The worker's `tabId` (RH-R5). */
  sender: string;
  /** The composition root's build and W4's wire version (RH-R7). */
  build: string;
  wire: number;
  /** The binding's fence lock is per append (the provider leg): a steal from a silent holder can serve (RH-R12). */
  canSteal: boolean;
  /** Whether the page is visible now (RH-R16). */
  visible: boolean;
  /**
   * How long a forwarded `start` or `resume` that a draining holder refused `HOST_CLOSED` waits for that holder's
   * release or a successor before it is answered (C11); 10 s when absent.
   */
  closedHostBound?: number | undefined;
}>;

/** A Web Lock request in flight, or held once `granted` (finding 1: hiding drops only one not yet granted). */
type Lock = Readonly<{ corr: string; mode: LockMode; granted: boolean }>;

/** A holder this worker has heard on the chat's channel. */
type Holder = Readonly<{ sender: string; epoch: number; foreign: boolean }>;

/** A command this worker owes an answer: from its launcher, or forwarded by another tab (`from`). */
type Write = Readonly<{
  corr: string;
  command: HostCommand;
  /** The epoch this command was last sent to, when forwarded (RH-R10). */
  sent?: number;
  resends: number;
  /**
   * A `start` or `resume` the holder at `sent` refused `HOST_CLOSED` because it is draining (T3): `waiting` for its
   * release or a successor, then `resent` once, and answered with whatever that holder answers.
   */
  closed?: 'waiting' | 'resent';
}>;

/** A command running in this process, and where its answer goes. */
type Running = Readonly<{ corr: string; to?: Readonly<{ sender: string; corr: string }> }>;

/** A read forwarded to the holder (`es`). */
type Read = Readonly<{ corr: string; request: ReadRequest; sent: number }>;

type LeadershipContext = Readonly<{
  chatId: string;
  sender: string;
  build: string;
  wire: number;
  canSteal: boolean;
  visible: boolean;
  /** Mints correlation ids: `${label}:${seq}`. */
  seq: number;
  /** The lowest epoch M2 may address (SC-R10). */
  floor: number;
  /** The Web Lock request in flight or held. */
  lock: Lock | undefined;
  heard: Holder | undefined;
  writes: readonly Write[];
  reads: readonly Read[];
  running: readonly Running[];
  /** A reconciliation wants the chat claimed (RH-R16). */
  reconcile: boolean;
  /** M1 last reported quiescent: no run executing, no command in flight, no settlement awaiting `acknowledge`. */
  quiet: boolean;
  /** C11: how long a write refused by a draining holder waits for its release or a successor. */
  closedHostBound: number;
}>;

/** `claiming` and `leading` hold a granted lock: no read or claim runs without its correlation (finding 1). */
type ClaimingContext = LeadershipContext & Readonly<{ lock: Lock }>;
type LeadingContext = ClaimingContext & Readonly<{ epoch: number }>;
/** `following.alive`: whether its bound was already re-armed once for frozen time. */
type AliveContext = LeadershipContext & Readonly<{ forgave: boolean }>;

const withLock = types<ClaimingContext>();
const withEpoch = types<LeadingContext>();
const withForgiveness = types<AliveContext>();

/** The effects the binding provides (the custom actions' arguments). */
export type LeadershipEffectArgs = Readonly<{
  requestLock: Readonly<{ corr: string; mode: LockMode }>;
  releaseLock: Readonly<{ corr: string }>;
  broadcast: Readonly<{ kind: 'hb' | 'cmd' | 'ans' | 'es'; epoch: number; body: Readonly<Record<string, unknown>> }>;
  readView: Readonly<{ corr: string }>;
  claim: Readonly<{ epoch: number }>;
  runLocal: Readonly<{ corr: string; command: HostCommand; epoch: number }>;
  answer: Readonly<{ corr: string; answer: CommandAnswer }>;
  readLocal: Readonly<{ corr: string; request: ReadRequest }>;
  serveRead: Readonly<{ corr: string; request: ReadRequest; to: string; epoch: number }>;
  answerRead: Readonly<{ corr: string; answer: ReadAnswer }>;
  relinquish: Readonly<Record<string, never>>;
  wakeReads: Readonly<Record<string, never>>;
  /** The heartbeat bound of the addressed epoch was armed now: the binding notes the time. */
  watchHolder: Readonly<Record<string, never>>;
  /** That bound fired: the binding answers `holderSilent`, and whether it fired late (a frozen tab). */
  checkHolder: Readonly<Record<string, never>>;
}>;

/** Events a state ignores (MC-R17): every such event there is stale or already answered. */
export const leadershipIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['closed', 'command'],
  ['closed', 'read'],
  /* Reports of a lock request or a view this worker already let go: the binding drops a released request's grant,
   * and the relinquish that follows a lost claim drops its view (the effects run in order per chat). */
  ['*', 'lockGranted'],
  ['*', 'lockUnavailable'],
  ['*', 'lockLost'],
  ['*', 'viewRead'],
  ['*', 'viewRefused'],
  ['*', 'viewFailed'],
  /* A fenced append outside a term this worker leads: its relinquish already closed that writer. */
  ['*', 'fenced'],
  /* A bound's report, or a page that resumed, after this worker stopped waiting on a heartbeat. */
  ['*', 'holderSilent'],
  ['*', 'resume'],
  /* Before its first heartbeat no tab addresses this worker; a sender re-addresses once it hears it. */
  ['claiming', 'frame'],
];

// ── pure helpers ──────────────────────────────────────────────────────────────────────────────────

const minted = (context: LeadershipContext, label: string): Readonly<{ corr: string; seq: number }> => ({
  corr: `${label}:${String(context.seq)}`,
  seq: context.seq + 1,
});

/** How many times one command is sent again to a newer holder before it is answered `PEER_UNRESPONSIVE` (RH-R10). */
const maxResends = 2;

/* oxlint-disable eslint/max-params -- the transition helpers below take the machine's own (context, enq, actions) plumbing
 * plus the one fact each acts on; bundling those into an object would only rename them. */
const refused = (
  command: Pick<HostCommand, 'commandId'>,
  code: string,
  message: string,
  generation = 0,
  effect: 'not-applied' | 'unknown' = 'not-applied',
): CommandAnswer => ({ commandId: command.commandId, generation, status: 'refused', effect, code, message });

/** Every answer a stale or silent holder can give, after which only a newer epoch is addressed (SC-R10). */
const raisesFloor = (answer: CommandAnswer): boolean =>
  answer.status === 'refused' && (answer.code === 'LEADER_GENERATION_STALE' || answer.code === 'LEADERSHIP_LOST');

/**
 * `{ to, meta }` (MC-R27), typed as its transition function.
 * ponytail: alpha.59's `setup` types omit the `{ to, meta }` form the runtime takes (k9); drop the cast when xstate
 * types it.
 *
 * @param tla - The `LogLeadership.tla` action the transition refines.
 * @param to - The transition function.
 * @returns The transition, carrying its static meta.
 */
const refines = <F>(tla: LeadershipTransitionLabel, to: F): F =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  ({ meta: { tla }, to }) as unknown as F;

/**
 * One event's branches that refine different actions, as labelled transitions (W7's `branches`, MC-R27): each guarded
 * branch returns `undefined` (disabled) where it does not apply, and xstate takes the first enabled transition, so the
 * last branch takes the rest. Setup types admit no transition arrays, hence the one cast; the guarded branches take
 * their parameter types from the last, which the setup types.
 *
 * @param transitions - The guarded branches, then the one that takes the rest.
 * @returns The transitions.
 */
const branches = <F>(
  ...transitions: [
    ...guarded: Array<F extends (...args: infer Args) => unknown ? (...args: Args) => unknown : never>,
    rest: F,
  ]
): F =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  transitions as unknown as F;

type Enq = (effect: (args: never) => void, args: unknown) => void;
type Effects = Readonly<{ [Name in keyof LeadershipEffectArgs]: (args: LeadershipEffectArgs[Name]) => void }>;

/** Enqueue one named effect with its typed arguments. */
const run = <Name extends keyof LeadershipEffectArgs>(
  enq: unknown,
  actions: Effects,
  name: Name,
  args: LeadershipEffectArgs[Name],
): void => {
  (enq as Enq)(actions[name] as (args: never) => void, args);
};

/** The delayed `closedHostBound` event of one write refused by a draining holder. */
const closedBoundId = (corr: string): string => `closedHost:${corr}`;

/** A forwarded admission the holder refused only because it is draining: held once for its successor (T3). */
const refusedByDrain = (write: Write, answer: CommandAnswer): boolean =>
  answer.status === 'refused' &&
  answer.code === 'HOST_CLOSED' &&
  (write.command.type === 'start' || write.command.type === 'resume') &&
  write.closed === undefined;

/** Stop waiting on a draining holder for `writes`: they go to a successor or run here, and are not answered early. */
const stopWaiting = (writes: readonly Write[], enq: unknown): readonly Write[] =>
  writes.map((write) => {
    if (write.closed !== 'waiting') {
      return write;
    }
    (enq as { cancel: (id: string) => void }).cancel(closedBoundId(write.corr));
    return { ...write, closed: 'resent' };
  });

/**
 * Ask for the lock, replacing a queued request with a steal (RH-R12). A write waiting on a draining holder keeps its
 * bound: asking is not leading, and a holder that keeps the chat answers it once the bound passes.
 */
const acquire = (context: LeadershipContext, enq: unknown, actions: Effects, mode: LockMode): LeadershipContext => {
  if (context.lock !== undefined && (context.lock.mode === mode || context.lock.mode === 'steal')) {
    return context;
  }
  if (context.lock !== undefined) {
    run(enq, actions, 'releaseLock', { corr: context.lock.corr });
  }
  const { corr, seq } = minted(context, 'lock');
  run(enq, actions, 'requestLock', { corr, mode });
  return { ...context, seq, lock: { corr, mode, granted: false } };
};

/** The grant this request became, for `claiming` (MC-R26). */
const granted = (context: LeadershipContext, lock: Lock): ClaimingContext => ({
  ...context,
  lock: { ...lock, granted: true },
});

/**
 * The page's visibility (RH-R16, `LogLeadership.tla` `Freeze`): hiding drops a queued request not yet granted, since
 * the lock manager can grant it to a frozen tab no one may steal from (RV7-F2); a grant is kept. Showing queues again
 * for what still wants the lock: a reconciliation, or writes waiting (`wants`, finding 11).
 */
const onVisibility = (
  context: LeadershipContext,
  enq: unknown,
  actions: Effects,
  visible: boolean,
  wants: LockMode | undefined,
): LeadershipContext => {
  if (!visible) {
    const drop = context.lock?.mode === 'queued' && !context.lock.granted;
    return { ...(drop ? release(context, enq, actions) : context), visible: false };
  }
  const shown = { ...context, visible: true };
  if (context.lock !== undefined) {
    return shown;
  }
  if (wants !== undefined) {
    return acquire(shown, enq, actions, wants);
  }
  return context.reconcile ? acquire(shown, enq, actions, 'queued') : shown;
};

/** Drop the lock request or grant, if any. */
const release = (context: LeadershipContext, enq: unknown, actions: Effects): LeadershipContext => {
  if (context.lock !== undefined) {
    run(enq, actions, 'releaseLock', { corr: context.lock.corr });
  }
  return { ...context, lock: undefined };
};

/** Forward every unsent or stale-addressed write and read to the holder heard at `epoch` (RH-R10, RH-R11). */
const forward = (context: LeadershipContext, enq: unknown, actions: Effects, holder: Holder): LeadershipContext => {
  if (holder.foreign) {
    /* I32: a holder of another build never executes this build's command: refuse writes while it heartbeats. */
    for (const write of context.writes) {
      run(enq, actions, 'answer', {
        corr: write.corr,
        answer: refused(
          write.command,
          'LEADER_VERSION_MISMATCH',
          'Another tab is running a different version of Tau and is writing this chat. Your message is kept and is sent once that tab finishes its run; reload that tab to update it.',
          holder.epoch,
        ),
      });
    }
    return { ...context, writes: [] };
  }
  const writes = context.writes.map((write) => {
    if (write.sent === holder.epoch) {
      return write;
    }
    run(enq, actions, 'broadcast', {
      kind: 'cmd',
      epoch: holder.epoch,
      body: {
        corr: write.corr,
        commandId: write.command.commandId,
        type: write.command.type,
        payload: write.command.payload,
      },
    });
    const [resent = write] = stopWaiting([write], enq);
    return { ...resent, sent: holder.epoch, resends: write.sent === undefined ? write.resends : write.resends + 1 };
  });
  const reads = context.reads.map((read) => {
    if (read.sent === holder.epoch) {
      return read;
    }
    run(enq, actions, 'broadcast', {
      kind: 'es',
      epoch: holder.epoch,
      body: { corr: read.corr, request: read.request },
    });
    return { ...read, sent: holder.epoch };
  });
  return { ...context, writes, reads };
};

/** Run every held write here, now that this worker leads at `epoch`; one waiting on a draining holder waits no more. */
const runHeld = (context: LeadingContext, enq: unknown, actions: Effects): LeadingContext => {
  stopWaiting(context.writes, enq);
  for (const write of context.writes) {
    run(enq, actions, 'runLocal', { corr: write.corr, command: write.command, epoch: context.epoch });
  }
  /* Forwarded reads go back to this worker's own long poll. */
  for (const read of context.reads) {
    run(enq, actions, 'readLocal', { corr: read.corr, request: read.request });
  }
  return {
    ...context,
    running: [...context.running, ...context.writes.map((write) => ({ corr: write.corr }))],
    writes: [],
    reads: [],
  };
};

/**
 * W4 T9's frozen-time rule, as `@taucad/rpc`'s liveness bound: a heartbeat bound armed at `armedAt` that fires at `now`
 * more than a heartbeat after it was due fired late because this tab was frozen. The binding measures it on the actor
 * clock (`checkHolder`); a transition reads no clock (MC-R6).
 *
 * @param armedAt - When `watchHolder` ran, on the actor clock.
 * @param now - When `checkHolder` ran.
 * @param delays - The bounds the binding provided.
 * @returns Whether the bound fired late.
 * @internal
 */
export const firedLate = (
  armedAt: number,
  now: number,
  delays: Readonly<{ heartbeatInterval: number; heartbeatTimeout: number }>,
): boolean => now - (armedAt + delays.heartbeatTimeout) > delays.heartbeatInterval;

/** Answer everything owed with one refusal, as a relinquished or closing leader does (RH-R18). */
const answerAll = (
  context: LeadershipContext,
  enq: unknown,
  actions: Effects,
  code: string,
  message: string,
): LeadershipContext => {
  for (const write of context.writes) {
    run(enq, actions, 'answer', { corr: write.corr, answer: refused(write.command, code, message, 0, 'unknown') });
  }
  for (const read of context.reads) {
    run(enq, actions, 'answerRead', {
      corr: read.corr,
      answer: { status: 'refused', chatId: context.chatId, reason: 'owner-fenced' },
    });
  }
  return { ...context, writes: [], reads: [] };
};

/** An `hb` this worker may follow: from an epoch at or above its floor. */
const followable = (context: LeadershipContext, message: LeadershipMessage): boolean =>
  message.kind === 'hb' && message.state === 'leading' && message.epoch >= context.floor;

const holderOf = (message: Extract<LeadershipMessage, { kind: 'hb' }>): Holder => ({
  sender: message.sender,
  epoch: message.epoch,
  foreign: message.foreign,
});

/** The leader's answer to another tab's frame (RH-R7, RH-R10, W4 SC-R4). */
const serveFrame = (
  context: LeadingContext,
  enq: unknown,
  actions: Effects,
  message: LeadershipMessage,
): LeadingContext => {
  const reply = (to: string, corr: string, answer: CommandAnswer): void => {
    run(enq, actions, 'broadcast', { kind: 'ans', epoch: context.epoch, body: { to, corr, answer } });
  };
  if (message.kind === 'unreadable') {
    if (message.corr !== undefined) {
      reply(
        message.sender,
        message.corr,
        refused(
          { commandId: message.commandId ?? message.corr },
          'COMMAND_UNREADABLE',
          `The leader of chat ${context.chatId} could not read that command.`,
          context.epoch,
        ),
      );
    }
    return context;
  }
  if (message.kind === 'cmd') {
    if (message.foreign) {
      reply(
        message.sender,
        message.corr,
        refused(
          message.command,
          'LEADER_VERSION_MISMATCH',
          `Chat ${context.chatId} is led by a tab running another version of Tau. Your message is kept and is sent once that tab finishes its run; reload that tab to update it.`,
          context.epoch,
        ),
      );
      return context;
    }
    if (message.epoch !== context.epoch) {
      reply(
        message.sender,
        message.corr,
        refused(
          message.command,
          'LEADER_GENERATION_STALE',
          `Chat ${context.chatId} has a newer writer; re-address this command.`,
          context.epoch,
        ),
      );
      return context;
    }
    const corr = `remote:${message.sender}:${message.corr}`;
    run(enq, actions, 'runLocal', { corr, command: message.command, epoch: context.epoch });
    return { ...context, running: [...context.running, { corr, to: { sender: message.sender, corr: message.corr } }] };
  }
  if (message.kind === 'es' && !message.foreign && message.epoch === context.epoch) {
    run(enq, actions, 'serveRead', {
      corr: message.corr,
      request: message.request,
      to: message.sender,
      epoch: context.epoch,
    });
  }
  return context;
};

/** Answer one finished command: to the launcher, or back to the tab that forwarded it. */
const answerRunning = <Context extends LeadershipContext>(
  context: Context,
  event: Readonly<{ corr: string; answer: CommandAnswer }>,
  enq: unknown,
  actions: Effects,
): Context | undefined => {
  const running = context.running.find((entry) => entry.corr === event.corr);
  if (running === undefined) {
    return undefined;
  }
  if (running.to === undefined) {
    run(enq, actions, 'answer', { corr: event.corr, answer: event.answer });
  } else {
    run(enq, actions, 'broadcast', {
      kind: 'ans',
      epoch: event.answer.generation,
      body: { to: running.to.sender, corr: running.to.corr, answer: event.answer },
    });
  }
  return { ...context, running: context.running.filter((entry) => entry !== running) };
};

/** EQ4 (RH-R8): M1 is quiescent and nothing is in flight here, so the lock and the writer go (`Release`). */
const releasable = (context: LeadershipContext): boolean =>
  context.quiet && context.running.length === 0 && context.writes.length === 0;

/** EQ4 (RH-R8): once M1 is quiescent and nothing is in flight here, release the lock and the writer. */
const releaseIfQuiet = (
  context: LeadingContext,
  enq: unknown,
  actions: Effects,
): Readonly<{ context: LeadingContext }> | Readonly<{ target: '#ready'; context: LeadershipContext }> => {
  if (!releasable(context)) {
    return { context };
  }
  run(enq, actions, 'relinquish', {});
  const next = release(context, enq, actions);
  /* Last: a follower that hears it finds the writer relinquished and the lock released (the binding orders it so). */
  run(enq, actions, 'broadcast', { kind: 'hb', epoch: context.epoch, body: { state: 'released' } });
  return { target: '#ready', context: next };
};

/* oxlint-enable eslint/max-params */

const notProvided = (name: string): never => {
  throw new Error(`leadership: the ${name} effect was not provided.`);
};

const machineDefinition = setup({
  schemas: {
    context: types<LeadershipContext>(),
    input: types<LeadershipInput>(),
    events: {
      command: types<Readonly<{ corr: string; command: HostCommand }>>(),
      read: types<Readonly<{ corr: string; request: ReadRequest }>>(),
      reconcile: types<Readonly<{ wait: boolean }>>(),
      visibility: types<Readonly<{ visible: boolean }>>(),
      lockGranted: types<Readonly<{ corr: string }>>(),
      lockUnavailable: types<Readonly<{ corr: string }>>(),
      lockLost: types<Readonly<{ corr: string }>>(),
      viewRead: types<Readonly<{ corr: string; epoch: number }>>(),
      viewRefused: types<Readonly<{ corr: string; code: string }>>(),
      viewFailed: types<Readonly<{ corr: string; message: string }>>(),
      executed: types<Readonly<{ corr: string; answer: CommandAnswer }>>(),
      appended: types<Readonly<{ endCursor: number }>>(),
      fenced: types<Readonly<Record<string, never>>>(),
      quiescent: types<Readonly<{ quiescent: boolean }>>(),
      frame: types<Readonly<{ message: LeadershipMessage }>>(),
      /* The binding's answer to `checkHolder`: the bound fired more than a heartbeat late (W4 T9). */
      holderSilent: types<Readonly<{ late: boolean }>>(),
      /* The page's `resume` or `pageshow`: the tab may have been frozen. */
      resume: types<Readonly<Record<string, never>>>(),
      /* C11 fired for a write a draining holder refused (T3). */
      closedHostBound: types<Readonly<{ corr: string }>>(),
      close: types<Readonly<Record<string, never>>>(),
    },
    tags: types<'holdsLock' | 'leading' | 'following'>(),
    transitionMeta: types<{ tla: LeadershipTransitionLabel }>(),
  },
  states: {
    idle: { id: 'idle', states: { ready: { id: 'ready' }, backoff: { id: 'backoff' } } },
    claiming: { id: 'claiming', schemas: { context: withLock } },
    leading: { id: 'leading', schemas: { context: withEpoch } },
    following: {
      id: 'following',
      states: {
        unheard: { id: 'unheard' },
        alive: { id: 'alive', schemas: { context: withForgiveness } },
        silent: { id: 'silent' },
      },
    },
    closed: { id: 'closed' },
  },
  actions: {
    requestLock: (_args: LeadershipEffectArgs['requestLock']): void => notProvided('requestLock'),
    releaseLock: (_args: LeadershipEffectArgs['releaseLock']): void => notProvided('releaseLock'),
    broadcast: (_args: LeadershipEffectArgs['broadcast']): void => notProvided('broadcast'),
    readView: (_args: LeadershipEffectArgs['readView']): void => notProvided('readView'),
    claim: (_args: LeadershipEffectArgs['claim']): void => notProvided('claim'),
    runLocal: (_args: LeadershipEffectArgs['runLocal']): void => notProvided('runLocal'),
    answer: (_args: LeadershipEffectArgs['answer']): void => notProvided('answer'),
    readLocal: (_args: LeadershipEffectArgs['readLocal']): void => notProvided('readLocal'),
    serveRead: (_args: LeadershipEffectArgs['serveRead']): void => notProvided('serveRead'),
    answerRead: (_args: LeadershipEffectArgs['answerRead']): void => notProvided('answerRead'),
    relinquish: (_args: LeadershipEffectArgs['relinquish']): void => notProvided('relinquish'),
    wakeReads: (_args: LeadershipEffectArgs['wakeReads']): void => notProvided('wakeReads'),
    watchHolder: (_args: LeadershipEffectArgs['watchHolder']): void => notProvided('watchHolder'),
    checkHolder: (_args: LeadershipEffectArgs['checkHolder']): void => notProvided('checkHolder'),
  },
  delays: {
    /* Placeholders at W4's values (C1, C2, C5) and W6.r1's (C9, C10); the binding provides the actor clock. */
    heartbeatInterval: 1000,
    heartbeatTimeout: 3500,
    recoveryDelay: 3500,
    claimBound: 10_000,
    queuedWriteBound: 10_000,
  },
});

/**
 * One chat's leadership among the tabs of an origin (M2).
 *
 * @internal
 */
export const leadershipMachine = machineDefinition.createMachine({
  id: 'leadership',
  version: '2',
  context: ({ input }) => ({
    chatId: input.chatId,
    sender: input.sender,
    build: input.build,
    wire: input.wire,
    canSteal: input.canSteal,
    visible: input.visible,
    seq: 0,
    floor: 0,
    lock: undefined,
    heard: undefined,
    writes: [],
    reads: [],
    running: [],
    reconcile: false,
    quiet: true,
    closedHostBound: input.closedHostBound ?? 10_000,
  }),
  initial: 'idle',
  /* A fault (MC-R12, D-092): everything owed is answered, the lock and the writer are let go, and the project host
   * rebuilds this chat's actors from the log on the next command. */
  onError: refines('Unmodelled', ({ context, actions }, enq) => {
    const answered = answerAll(context, enq, actions, 'HOST_FAULT', `Chat ${context.chatId}'s leadership failed.`);
    run(enq, actions, 'relinquish', {});
    return { target: '#closed', context: release(answered, enq, actions) };
  }),
  on: {
    close: refines('Unmodelled', ({ context, actions }, enq) => {
      const answered = answerAll(context, enq, actions, 'HOST_CLOSED', 'This project host is closing.');
      for (const running of context.running) {
        if (running.to !== undefined) {
          run(enq, actions, 'broadcast', {
            kind: 'ans',
            epoch: 0,
            body: {
              ...running.to,
              corr: running.to.corr,
              answer: refused({ commandId: running.corr }, 'LEADERSHIP_LOST', 'The leader closed.', 0, 'unknown'),
            },
          });
        }
      }
      run(enq, actions, 'relinquish', {});
      return { target: '#closed', context: { ...release(answered, enq, actions), running: [] } };
    }),
    visibility: refines('Unmodelled', ({ context, event, actions }, enq) => ({
      context: onVisibility(context, enq, actions, event.visible, undefined),
    })),
    /* C11: the draining holder neither let go nor was succeeded in time, so its refusal is the answer. */
    closedHostBound: refines('Unmodelled', ({ context, event, actions }, enq) => {
      const write = context.writes.find((entry) => entry.corr === event.corr && entry.closed === 'waiting');
      if (write === undefined) {
        return {};
      }
      run(enq, actions, 'answer', {
        corr: write.corr,
        answer: refused(
          write.command,
          'HOST_CLOSED',
          'The tab that was writing this chat is closing its project and no other tab took the chat over in time. Send the message again.',
        ),
      });
      return { context: { ...context, writes: context.writes.filter((entry) => entry !== write) } };
    }),
    executed: refines('Answer', ({ context, event, actions }, enq) => {
      const answered = answerRunning(context, event, enq, actions);
      return answered === undefined ? {} : { context: answered };
    }),
    quiescent: refines('Unmodelled', ({ context, event }) => ({ context: { ...context, quiet: event.quiescent } })),
    read: refines('Unmodelled', ({ event, actions }, enq) => {
      /* Idle and silent reads are served here, from the log as it is (RH-R1). */
      run(enq, actions, 'readLocal', { corr: event.corr, request: event.request });
      return {};
    }),
    appended: refines('Claim', () => ({})),
  },
  states: {
    idle: {
      initial: 'ready',
      on: {
        command: refines('Acquire', ({ context, event, actions }, enq) => {
          const writes = [...context.writes, { corr: event.corr, command: event.command, resends: 0 }];
          return { context: acquire({ ...context, writes }, enq, actions, 'ifAvailable') };
        }),
        reconcile: branches(
          /* Hidden: the reconciliation waits for the page to be shown (RH-R16). */
          refines('Unmodelled', ({ context, event }) =>
            event.wait && !context.visible ? { context: { ...context, reconcile: true } } : undefined,
          ),
          refines('QueueReconcile', ({ context, event, actions }, enq) =>
            event.wait ? { context: acquire({ ...context, reconcile: true }, enq, actions, 'queued') } : undefined,
          ),
          refines('Acquire', ({ context, actions }, enq) => ({
            context: acquire(context, enq, actions, 'ifAvailable'),
          })),
        ),
        lockGranted: refines('Acquire', ({ context, event }) =>
          context.lock?.corr === event.corr ? { target: '#claiming', context: granted(context, context.lock) } : {},
        ),
        /* `ifAvailable` found the lock held: no spec step (`Acquire` is not enabled). */
        lockUnavailable: refines('Unmodelled', ({ context, event }) =>
          context.lock?.corr === event.corr ? { target: '#unheard', context: { ...context, lock: undefined } } : {},
        ),
        /* The heartbeat heard (its `heard`), which forwards any write already waiting (`Send`). */
        frame: refines('Heartbeat', ({ context, event, actions }, enq) => {
          const { message } = event;
          if (!followable(context, message) || message.kind !== 'hb') {
            return {};
          }
          const holder = holderOf(message);
          /* A read parked on the log as it was re-routes to the holder now heard (W6.r1 round 3). */
          run(enq, actions, 'wakeReads', {});
          return {
            target: '#alive',
            context: { ...forward({ ...context, heard: holder }, enq, actions, holder), forgave: false },
          };
        }),
      },
      states: {
        ready: {},
        backoff: {
          on: {
            /* RH-R17: while a frozen OPFS holder keeps its handle, writes wait; the page re-sends by key. */
            command: refines('Unmodelled', ({ event, actions }, enq) => {
              run(enq, actions, 'answer', {
                corr: event.corr,
                answer: refused(
                  event.command,
                  'WRITER_LOCKED',
                  'This chat is still open for writing in a tab that is paused. Your message is sent when that tab resumes or closes.',
                ),
              });
              return {};
            }),
          },
          after: {
            recoveryDelay: refines('Unmodelled', ({ context, actions }, enq) =>
              context.reconcile && context.visible
                ? { target: '#ready', context: acquire(context, enq, actions, 'queued') }
                : { target: '#ready' },
            ),
          },
        },
      },
    },
    claiming: {
      tags: ['holdsLock'],
      entry: ({ context, actions }, enq) => {
        run(enq, actions, 'readView', { corr: context.lock.corr });
      },
      after: {
        /* Finding 1: a reread that never answers (a hung bridge) cannot wedge the writes waiting on it. The grant goes
         * after the relinquish, which waits on that read; the writes are answered now, and the page re-sends by key. */
        claimBound: refines('Unmodelled', ({ context, actions }, enq) => {
          const answered = answerAll(
            context,
            enq,
            actions,
            'PEER_UNRESPONSIVE',
            "This chat's storage did not answer. Your message is kept and is sent again automatically.",
          );
          run(enq, actions, 'relinquish', {});
          return { target: '#ready', context: release(answered, enq, actions) };
        }),
      },
      on: {
        viewRead: refines('Read', ({ context, event, actions }, enq) => {
          if (event.corr !== context.lock.corr) {
            return {};
          }
          /* RH-R16: post the grantee's heartbeat so followers hear it, then assume and claim (RH-R9). */
          run(enq, actions, 'broadcast', { kind: 'hb', epoch: event.epoch, body: { state: 'leading' } });
          run(enq, actions, 'claim', { epoch: event.epoch });
          const leading = runHeld(
            { ...context, epoch: event.epoch, floor: Math.max(context.floor, event.epoch), reconcile: false },
            enq,
            actions,
          );
          run(enq, actions, 'wakeReads', {});
          return { target: '#leading', context: leading };
        }),
        /* The OPFS handle is held elsewhere: `Read` is not enabled, so this is no spec step (not `Refused`, which is an
         * append the fence refused). */
        viewRefused: refines('Unmodelled', ({ context, event, actions }, enq) => {
          if (event.corr !== context.lock.corr) {
            return {};
          }
          /* RH-R17: WRITER_LOCKED is a wait. Answer what is pending, let the lock go, back off, then queue again. */
          const answered = answerAll(
            context,
            enq,
            actions,
            event.code,
            'This chat is still open for writing in a tab that is paused. Your message is sent when that tab resumes or closes.',
          );
          return { target: '#backoff', context: release(answered, enq, actions) };
        }),
        viewFailed: refines('Unmodelled', ({ context, event, actions }, enq) => {
          if (event.corr !== context.lock.corr) {
            return {};
          }
          const answered = answerAll(context, enq, actions, 'HOST_FAULT', event.message);
          return { target: '#ready', context: release(answered, enq, actions) };
        }),
        /* RV7-F4: the steal notice cancels the read; this worker follows the stealer. */
        lockLost: refines('Notice', ({ context, event, actions }, enq) => {
          if (event.corr !== context.lock.corr) {
            return {};
          }
          run(enq, actions, 'relinquish', {});
          return { target: '#unheard', context: { ...context, lock: undefined } };
        }),
        command: refines('Unmodelled', ({ context, event }) => ({
          context: {
            ...context,
            writes: [...context.writes, { corr: event.corr, command: event.command, resends: 0 }],
          },
        })),
        read: refines('Unmodelled', ({ event, actions }, enq) => {
          run(enq, actions, 'readLocal', { corr: event.corr, request: event.request });
          return {};
        }),
        reconcile: refines('Unmodelled', ({ context }) => ({ context: { ...context, reconcile: true } })),
      },
    },
    leading: {
      tags: ['holdsLock', 'leading'],
      after: {
        heartbeatInterval: refines('Heartbeat', ({ context, actions }, enq) => {
          run(enq, actions, 'broadcast', { kind: 'hb', epoch: context.epoch, body: { state: 'leading' } });
          return { target: '#leading', reenter: true };
        }),
      },
      on: {
        command: refines('Send', ({ context, event, actions }, enq) => {
          run(enq, actions, 'runLocal', { corr: event.corr, command: event.command, epoch: context.epoch });
          return { context: { ...context, running: [...context.running, { corr: event.corr }] } };
        }),
        read: refines('Unmodelled', ({ event, actions }, enq) => {
          run(enq, actions, 'readLocal', { corr: event.corr, request: event.request });
          return {};
        }),
        frame: refines('Answer', ({ context, event, actions }, enq) => ({
          context: serveFrame(context, enq, actions, event.message),
        })),
        /* Leading reconciles at once: the claim opens M1, which reconciles when it is next quiescent (W7). `QueueReconcile`
         * is enabled only without a term, so this is no spec step. */
        reconcile: refines('Unmodelled', ({ context, actions }, enq) => {
          run(enq, actions, 'claim', { epoch: context.epoch });
          return {};
        }),
        /* EQ4: quiescent with nothing in flight releases the lock and closes the writer (RH-R8). */
        quiescent: branches(
          refines('Unmodelled', ({ context, event }) =>
            event.quiescent && releasable({ ...context, quiet: true })
              ? undefined
              : { context: { ...context, quiet: event.quiescent } },
          ),
          refines('Release', ({ context, actions }, enq) => releaseIfQuiet({ ...context, quiet: true }, enq, actions)),
        ),
        /* The answer (`Answer`), and when it was the last thing in flight while M1 is quiescent, the release after it
         * (`Release`, which the spec enables once nothing is pending). A stale report stays under `Answer`. */
        executed: branches(
          refines('Answer', ({ context, event, actions }, enq) => {
            const running = context.running.filter((entry) => entry.corr !== event.corr);
            if (running.length < context.running.length && releasable({ ...context, running })) {
              return undefined;
            }
            const answered = answerRunning(context, event, enq, actions);
            return answered === undefined ? {} : { context: answered };
          }),
          refines('Release', ({ context, event, actions }, enq) =>
            releaseIfQuiet(answerRunning(context, event, enq, actions) ?? context, enq, actions),
          ),
        ),
        /* RH-R9: a fenced append rereads while the lock is held. */
        fenced: refines('Refused', ({ context, actions }, enq) => {
          run(enq, actions, 'relinquish', {});
          return { target: '#claiming', context: { ...context, floor: context.epoch + 1 } };
        }),
        lockLost: refines('Notice', ({ context, event, actions }, enq) => {
          if (event.corr !== context.lock.corr) {
            return {};
          }
          run(enq, actions, 'relinquish', {});
          return { target: '#unheard', context: { ...context, lock: undefined, floor: context.epoch + 1 } };
        }),
      },
    },
    following: {
      tags: ['following'],
      initial: 'unheard',
      on: {
        command: refines('Send', ({ context, event, actions }, enq) => {
          const writes = [...context.writes, { corr: event.corr, command: event.command, resends: 0 }];
          const next = { ...context, writes };
          return { context: context.heard === undefined ? next : forward(next, enq, actions, context.heard) };
        }),
        read: refines('Send', ({ context, event, actions }, enq) => {
          if (context.heard === undefined || context.heard.foreign) {
            run(enq, actions, 'readLocal', { corr: event.corr, request: event.request });
            return {};
          }
          const reads = [...context.reads, { corr: event.corr, request: event.request, sent: -1 }];
          return { context: forward({ ...context, reads }, enq, actions, context.heard) };
        }),
        reconcile: branches(
          /* Hidden, or a reconciliation that does not wait: the flag alone (RH-R16). */
          refines('Unmodelled', ({ context, event }) =>
            event.wait && context.visible
              ? undefined
              : { context: { ...context, reconcile: context.reconcile || event.wait } },
          ),
          refines('QueueReconcile', ({ context, actions }, enq) => ({
            context: acquire({ ...context, reconcile: true }, enq, actions, 'queued'),
          })),
        ),
        lockGranted: refines('StealLock', ({ context, event }) =>
          context.lock?.corr === event.corr ? { target: '#claiming', context: granted(context, context.lock) } : {},
        ),
        /* `ifAvailable` found the lock held: no spec step. */
        lockUnavailable: refines('Unmodelled', ({ context, event }) =>
          context.lock?.corr === event.corr ? { context: { ...context, lock: undefined } } : {},
        ),
        frame: branches(
          /* The holder's answer to a forwarded command or read. */
          refines('Answer', ({ context, event, actions }, enq) => {
            const { message } = event;
            if (message.kind === 'ans') {
              const write = context.writes.find((entry) => entry.corr === message.corr);
              if (write === undefined) {
                return {};
              }
              if (refusedByDrain(write, message.answer)) {
                /* T3: the holder is draining and admits nothing new. Kept for its release or a successor at another
                 * epoch (`sent` stays, so its own heartbeats never re-send it), and answered at C11 otherwise. */
                enq.raise(
                  { type: 'closedHostBound', corr: write.corr },
                  { id: closedBoundId(write.corr), delay: context.closedHostBound },
                );
                return {
                  context: {
                    ...context,
                    writes: context.writes.map((entry) => (entry === write ? { ...entry, closed: 'waiting' } : entry)),
                  },
                };
              }
              if (raisesFloor(message.answer) && write.resends < maxResends) {
                /* SC-R10: nothing ran there; keep the command for a newer holder, above this epoch. */
                return {
                  context: {
                    ...context,
                    floor: Math.max(context.floor, (write.sent ?? message.epoch) + 1),
                    writes: context.writes.map((entry) => (entry === write ? { ...entry, sent: undefined } : entry)),
                  },
                };
              }
              run(enq, actions, 'answer', { corr: write.corr, answer: message.answer });
              return { context: { ...context, writes: context.writes.filter((entry) => entry !== write) } };
            }
            if (message.kind === 'en') {
              const read = context.reads.find((entry) => entry.corr === message.corr);
              if (read === undefined) {
                return {};
              }
              run(enq, actions, 'answerRead', { corr: read.corr, answer: message.answer });
              return { context: { ...context, reads: context.reads.filter((entry) => entry !== read) } };
            }
            return undefined;
          }),
          /* The heard holder let go (its `Release`): read locally, and ask for the lock for any write still owed. */
          refines('Release', ({ context, event, actions }, enq) => {
            const { message } = event;
            if (
              message.kind !== 'hb' ||
              message.state !== 'released' ||
              message.epoch < context.floor ||
              message.sender !== context.heard?.sender
            ) {
              return undefined;
            }
            run(enq, actions, 'wakeReads', {});
            const { reads } = context;
            for (const read of reads) {
              run(enq, actions, 'readLocal', { corr: read.corr, request: read.request });
            }
            const next = { ...context, heard: undefined, reads: [] };
            return {
              target: '#ready',
              context:
                next.writes.length > 0 || next.reconcile
                  ? acquire(next, enq, actions, next.reconcile && next.writes.length === 0 ? 'queued' : 'ifAvailable')
                  : next,
            };
          }),
          /* A heartbeat of the addressed epoch re-arms its bound; another epoch re-addresses and never extends it
           * (RH-R10, I15, W0.14). Anything else here is stale or not addressed to this worker. */
          refines('Heartbeat', ({ context, event, actions }, enq) => {
            const { message } = event;
            if (message.kind !== 'hb' || message.state !== 'leading' || message.epoch < context.floor) {
              return {};
            }
            const holder = holderOf(message);
            if (holder.sender !== context.heard?.sender || holder.epoch !== context.heard.epoch) {
              /* A new holder: reads parked here re-route to it (W6.r1 round 3). */
              run(enq, actions, 'wakeReads', {});
            }
            const next = forward({ ...context, heard: holder }, enq, actions, holder);
            return { target: '#alive', reenter: true, context: { ...next, forgave: false } };
          }),
        ),
      },
      states: {
        /* The lock is held by a worker this one has not heard: it never steals from it (RH-R12). */
        unheard: {
          after: {
            heartbeatTimeout: refines('TimeOut', ({ context, actions }, enq) => {
              const answered = answerAll(
                context,
                enq,
                actions,
                'PEER_UNRESPONSIVE',
                'The tab that was writing this chat stopped answering. Your message is kept and is sent again automatically.',
              );
              return { target: '#silent', context: answered };
            }),
          },
        },
        alive: {
          entry: ({ actions }, enq) => {
            run(enq, actions, 'watchHolder', {});
          },
          after: {
            /* The bound fired; whether it fired late is the binding's to measure (MC-R6), answered as `holderSilent`. */
            heartbeatTimeout: refines('Unmodelled', ({ actions }, enq) => {
              run(enq, actions, 'checkHolder', {});
              return {};
            }),
          },
          on: {
            holderSilent: branches(
              /* W4 T9's frozen-time rule, as rpc's liveness bound: a bound that fired late fired for this tab's own
               * freeze, not the holder's silence, so it is re-armed once for a full window. */
              refines('Unmodelled', ({ context, event }) =>
                event.late && !context.forgave
                  ? { target: '#alive', reenter: true, context: { ...context, forgave: true } }
                  : undefined,
              ),
              /* RH-R12: steal only with a pending write, from a holder heard, on the provider leg; else queue. */
              refines('StealLock', ({ context, actions }, enq) => {
                const silentEpoch = context.heard?.epoch ?? 0;
                const next = { ...context, floor: Math.max(context.floor, silentEpoch + 1) };
                if (next.writes.length === 0 || context.heard === undefined || context.heard.foreign) {
                  return undefined;
                }
                return {
                  target: '#silent',
                  context: acquire(next, enq, actions, context.canSteal ? 'steal' : 'queued'),
                };
              }),
              /* Nothing to write: reads the silent holder owed are served here, from the log as it is. */
              refines('TimeOut', ({ context, actions }, enq) => {
                for (const read of context.reads) {
                  run(enq, actions, 'readLocal', { corr: read.corr, request: read.request });
                }
                const floor = Math.max(context.floor, (context.heard?.epoch ?? 0) + 1);
                return { target: '#silent', context: { ...context, floor, reads: [] } };
              }),
            ),
            /* The page's `resume` or `pageshow`: the tab may have been frozen, so the bound starts again. */
            resume: refines('Unmodelled', ({ context }) => ({
              target: '#alive',
              reenter: true,
              context: { ...context, forgave: false },
            })),
          },
        },
        silent: {
          after: {
            /* Finding 11 (I30): a write queued behind a silent or frozen holder is answered within a bound; the page
             * re-sends by key. On OPFS the holder's handle is the wait (RH-R17). */
            queuedWriteBound: refines('TimeOut', ({ context, actions }, enq) => {
              if (context.writes.length === 0) {
                return {};
              }
              const answered = context.canSteal
                ? answerAll(
                    context,
                    enq,
                    actions,
                    'PEER_UNRESPONSIVE',
                    'The tab that was writing this chat stopped answering. Your message is kept and is sent again automatically.',
                  )
                : answerAll(
                    context,
                    enq,
                    actions,
                    'WRITER_LOCKED',
                    'This chat is still open for writing in a tab that is paused. Your message is sent when that tab resumes or closes.',
                  );
              return { context: answered.reconcile ? answered : release(answered, enq, actions) };
            }),
          },
          on: {
            /* Writes wait for the steal or the queue; the first one re-arms the bound. */
            command: refines('Acquire', ({ context, event, actions }, enq) => {
              const writes = [...context.writes, { corr: event.corr, command: event.command, resends: 0 }];
              const heardHere = context.heard !== undefined && !context.heard.foreign;
              const next = acquire(
                { ...context, writes },
                enq,
                actions,
                heardHere && context.canSteal ? 'steal' : 'queued',
              );
              return context.writes.length === 0
                ? { target: '#silent', reenter: true, context: next }
                : { context: next };
            }),
            read: refines('Unmodelled', ({ event, actions }, enq) => {
              run(enq, actions, 'readLocal', { corr: event.corr, request: event.request });
              return {};
            }),
            /* Finding 11: showing the page queues again for the writes still waiting. */
            visibility: refines('Unmodelled', ({ context, event, actions }, enq) => {
              const heardHere = context.heard !== undefined && !context.heard.foreign;
              const wants =
                context.writes.length > 0 ? (heardHere && context.canSteal ? 'steal' : 'queued') : undefined;
              return { context: onVisibility(context, enq, actions, event.visible, wants) };
            }),
          },
        },
      },
    },
    closed: { type: 'final' },
  },
});
