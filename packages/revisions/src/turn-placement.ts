/**
 * `@taucad/revisions/turn-placement` — one project's turn-placement port over its revision root (W8 TS-S3, D9).
 *
 * The host's run actor (M1) is the only caller. Each verb addresses one attempt by `TurnAttemptKey`, carries a request
 * id every answer echoes (D14), and is answered `applied`, `replayed` or `refused`: a refusal is data, and a dead
 * session is the transport's error, never an answer (library-API policy §20).
 *
 * - **The root holds the attempts.** Turn actors keep the lease and the settlement that awaits `acknowledge` (D1,
 *   RM-R10), so `settlements` replays from them on subscribe. This adapter's own state is the table of tool ports.
 * - **Tools are revocable** (TS-R15, D13). `admit` hands out the attempt's tools over a view of its checkout;
 *   `abandon`, `complete` and {@link TurnPlacementAdapter.fence} revoke that view after every write it accepted has
 *   landed, and refuse every later call with `TOOL_PORT_REVOKED`.
 * - **One session.** An adapter is one placement session. A binding that opens a newer session fences the older one:
 *   its later requests are refused `SESSION_FENCED` and its tools revoked, while the root keeps its turn actors
 *   (TS-R6).
 *
 * `@taucad/revisions` cannot import `@taucad/agent-host`, so the port's shapes are written here structurally and stay
 * module-private; `packages/host` proves the two agree by assigning this adapter to agent-host's `TurnPlacementPort`
 * (TS-S0 Q2).
 */

import { waitFor } from 'xstate';

import { readChatRecord } from '#chat-ref.js';
import type { Checkout } from '#revision-port.js';
import { describeTurnRelease } from '#revision-effects.js';
import type {
  ProjectRevisions,
  RevisionFileSystem,
  TurnConflictedEvent,
  TurnFailedEvent,
  TurnFinalizedEvent,
} from '#revision-effects.js';
import { selectTurnAnnouncement } from '#turn.machine.js';
import type { TurnAnnouncement, TurnFailureCode } from '#turn.machine.js';
import type { TurnAttemptKey } from '#turn.types.js';

type Attempted<Row> = Row & Readonly<{ attempt: number }>;
type SettlementRow =
  | Attempted<TurnFinalizedEvent>
  | Attempted<TurnConflictedEvent>
  | Attempted<TurnFailedEvent & Readonly<{ code: string; revisionId?: string }>>;

type Request = Readonly<{ requestId: string; key: TurnAttemptKey }>;
type Refused<Code extends string> = Readonly<{
  requestId: string;
  status: 'refused';
  code: Code;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}>;
type Answer<Result extends Readonly<Record<string, unknown>>, Code extends string> =
  | (Readonly<{ requestId: string; status: 'applied' | 'replayed' }> & Result)
  | Refused<Code>;
type Nothing = Readonly<Record<never, never>>;
type Placement<Tools> = Readonly<{
  checkoutId: string;
  branch?: string;
  baseRevisionId?: string;
  mode: 'direct' | 'candidate';
  root: string;
  tools: Tools;
}>;
type Held = Readonly<{ key: TurnAttemptKey; checkoutId: string }>;
type Fact =
  | Readonly<{ kind: 'changed'; key: TurnAttemptKey; checkoutId: string }>
  | Readonly<{ kind: 'settled'; key: TurnAttemptKey; row: SettlementRow }>
  | (Readonly<{ kind: 'leaseHeld' }> & Held);
type Fenced = 'SESSION_FENCED';
type AdmitCode =
  | 'CHECKOUT_UNKNOWN'
  | 'CHECKOUT_CONFLICT'
  | 'BASE_CUT_FAILED'
  | 'TURN_ALREADY_LEASED'
  | 'REVISIONS_UNAVAILABLE'
  | Fenced;

/**
 * One placement session over a project's revision root: the six verbs of agent-host's `TurnPlacementPort`, plus the
 * session fence its binding calls when a newer session opens.
 *
 * @public
 */
export type TurnPlacementAdapter<Tools> = Readonly<{
  admit: (
    input: Request & Readonly<{ checkoutId?: string | undefined }>,
  ) => Promise<Answer<Readonly<{ placement: Placement<Tools> }>, AdmitCode>>;
  complete: (
    input: Request & Readonly<{ cut: boolean }>,
  ) => Promise<Answer<Nothing, 'TURN_UNKNOWN' | 'CUT_FAILED' | 'LEASE_HELD_ELSEWHERE' | Fenced>>;
  abandon: (input: Request) => Promise<Answer<Nothing, 'TURN_UNKNOWN' | Fenced>>;
  reconcile: (
    input: Readonly<{ requestId: string; chatId?: string | undefined }>,
  ) => Promise<Answer<Readonly<{ held: readonly Held[] }>, 'REVISIONS_UNAVAILABLE' | Fenced>>;
  settlements: (input: Readonly<{ signal: AbortSignal }>) => AsyncIterable<Fact>;
  acknowledge: (input: Request) => Promise<Answer<Nothing, 'LEASE_HELD_ELSEWHERE' | 'REVISIONS_BUSY' | Fenced>>;
  /**
   * End this session (TS-R6): its later requests are refused `SESSION_FENCED`, its tools are revoked once their
   * accepted writes land, and its `settlements` listens end. The root keeps every turn actor.
   */
  fence: () => Promise<void>;
}>;

/**
 * Options for {@link createTurnPlacementPort}.
 *
 * @public
 */
export type TurnPlacementPortOptions<Tools> = Readonly<{
  /** The project's revisions from `createProjectRevisionsActor`: its root, and the store reads beside it. */
  revisions: Pick<ProjectRevisions, 'actor' | 'turns'>;
  /**
   * Turn the attempt's view of its checkout into what this binding hands its host: a tool registry on Node, a
   * transferable bridge port in the file-manager worker. The adapter owns the view and revokes it.
   */
  openTools: (
    input: Readonly<{ key: TurnAttemptKey; filesystem: RevisionFileSystem; checkout: Checkout; root: string }>,
  ) => Tools;
  /**
   * Where a checkout's files are in this host's namespace, which the grant names as its `root` (an external agent's
   * cwd). Default: the checkout's own `root`; a disk host maps the live checkout's route to its workspace directory.
   */
  root?: ((checkout: Checkout) => string) | undefined;
  /**
   * Wait until this host's change feed has reported every write so far (E1), so a cut re-reads only the paths it was
   * told of: before an admission (the dirty base holds the person's last writes, not the agent's) and before a
   * completion cut (the agent's last writes). A host whose feed is not complete omits it.
   */
  settle?: (() => Promise<void>) | undefined;
}>;

/** A root answer the adapter waits on, per attempt. */
type Heard =
  | Readonly<{ type: 'placed'; checkoutId: string | undefined; branch?: string; baseRevisionId?: string }>
  | Readonly<{ type: 'refused'; code: string | undefined; reason: string }>
  | Readonly<{ type: 'published' }>
  | Readonly<{ type: 'cutRefused'; code: TurnFailureCode | undefined; reason: string; cutFailures: number }>
  | Readonly<{ type: 'retired' }>
  | Readonly<{ type: 'acknowledgeRefused'; code: string | undefined; reason: string }>
  /* The session was fenced or its root stopped: nothing will answer the wait (P9). */
  | Readonly<{ type: 'fenced' }>;

type FencedHeard = Extract<Heard, { type: 'fenced' }>;

/** A checkout view whose calls are refused once revoked; `revoke` waits for the calls it accepted to settle. */
type Revocable = Readonly<{
  view: RevisionFileSystem;
  revoked: () => boolean;
  changed: () => boolean;
  revoke: () => Promise<void>;
  /** Refuse later calls now, without waiting: the attempt is retired, so nothing waits on its writes. */
  close: () => void;
}>;

type ToolEntry<Tools> = Readonly<{ placement: Omit<Placement<Tools>, 'tools'>; tools: Tools; revocable: Revocable }>;

const attemptIdOf = (key: TurnAttemptKey): string => `${key.runId}/${String(key.attempt)}`;

const toolPortRevoked = (): Error =>
  Object.assign(new Error('This turn has ended, so its files can no longer be changed. Nothing was written.'), {
    name: 'ToolPortRevokedError',
    code: 'TOOL_PORT_REVOKED',
  });

const revocable = (
  filesystem: RevisionFileSystem,
  versioned: (path: string) => boolean,
  changed: () => void,
): Revocable => {
  let revoked = false;
  let confirmed = false;
  const accepted = new Set<Promise<unknown>>();
  const view = new Proxy(filesystem, {
    get: (target, property, receiver): unknown => {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      return async (...args: unknown[]): Promise<unknown> => {
        if (revoked) {
          throw toolPortRevoked();
        }
        const call = async (): Promise<unknown> => {
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- a filesystem member, called as itself.
          const invoke = async (): Promise<unknown> =>
            (value as (...parameters: unknown[]) => unknown).apply(target, args);
          const [input] = args;
          if (confirmed) {
            return invoke();
          }
          if ((property === 'writeFile' || property === 'unlink') && typeof input === 'string' && versioned(input)) {
            const data = args[1];
            if (property === 'unlink' || typeof data === 'string' || data instanceof Uint8Array) {
              /* Plain writes and deletes have no receipt. Use the authority's checked comparison; contention or an unsupported
               * comparison preserves the original mutation semantics but establishes no turn-change proof. */
              const ownedData =
                typeof data === 'string' ? data : data instanceof Uint8Array ? new Uint8Array(data) : undefined;
              const expected = await filesystem.readFile(input).catch(() => undefined);
              if (expected !== undefined || (property === 'writeFile' && !(await filesystem.exists(input)))) {
                try {
                  const preconditions = [{ path: input, expected: expected ?? null }];
                  const result =
                    property === 'unlink'
                      ? await filesystem.deleteFileChecked({ path: input, preconditions })
                      : await filesystem.writeFileChecked({ path: input, data: ownedData!, preconditions });
                  if (result.status !== 'conflict') {
                    if (result.status === 'applied') {
                      confirmed = true;
                      changed();
                    }
                    return undefined;
                  }
                } catch (error) {
                  if (
                    typeof error === 'object' &&
                    error !== null &&
                    'applicationState' in error &&
                    error.applicationState !== 'known-not-applied'
                  ) {
                    throw error;
                  }
                  if (
                    !(error instanceof TypeError) &&
                    !(
                      typeof error === 'object' &&
                      error !== null &&
                      'code' in error &&
                      error.code === 'CHECKED_WRITE_UNSUPPORTED'
                    )
                  ) {
                    throw error;
                  }
                }
              }
            }
            return invoke();
          }
          const isVersionedMutation =
            (property === 'writeFileChecked' || property === 'deleteFileChecked') &&
            typeof input === 'object' &&
            input !== null &&
            'path' in input &&
            typeof input.path === 'string' &&
            versioned(input.path);
          const result = await invoke();
          if (
            isVersionedMutation &&
            typeof result === 'object' &&
            result !== null &&
            'status' in result &&
            result.status === 'applied'
          ) {
            confirmed = true;
            changed();
          }
          return result;
        };
        const result = call();
        accepted.add(result);
        try {
          return await result;
        } finally {
          accepted.delete(result);
        }
      };
    },
  });
  return {
    view,
    revoked: () => revoked,
    changed: () => confirmed,
    revoke: async () => {
      revoked = true;
      await Promise.allSettled(accepted);
    },
    close: () => {
      revoked = true;
    },
  };
};

const admitMessage = (code: AdmitCode, checkoutId: string, reason: string): string => {
  switch (code) {
    case 'CHECKOUT_UNKNOWN': {
      return `Checkout ${checkoutId} no longer exists in this project, so the agent did not start. Choose another checkout for this chat.`;
    }
    case 'CHECKOUT_CONFLICT': {
      return `Checkout ${checkoutId} cannot take this turn: ${reason} Resolve the checkout, then send again.`;
    }
    case 'BASE_CUT_FAILED': {
      return `The files already in checkout ${checkoutId} could not be saved before the agent started, so it did not start: ${reason}`;
    }
    case 'TURN_ALREADY_LEASED': {
      return 'This run still holds another attempt; this attempt can be placed once that one settles.';
    }
    case 'REVISIONS_UNAVAILABLE': {
      return `The project's revision store could not place this turn, so it was not started: ${reason}`;
    }
    case 'SESSION_FENCED': {
      return 'This placement session was replaced by a newer one; send requests to the newer session.';
    }
  }
};

const refused = <Code extends string>(
  answer: Readonly<{ requestId: string; code: Code; message: string; details?: Readonly<Record<string, unknown>> }>,
): Refused<Code> => ({ ...answer, status: 'refused' });

const fencedAnswer = (requestId: string): Refused<Fenced> =>
  refused({ requestId, code: 'SESSION_FENCED', message: admitMessage('SESSION_FENCED', '', '') });

/**
 * Create one placement session over a project's revision root (D9, TS-S3).
 *
 * Node calls it in process beside `createProjectRevisionsActor`; the browser's file-manager worker serves it on the
 * placement session the page brokers. `Tools` is inferred from `openTools`.
 *
 * @param options - The project's revisions and how to hand out an attempt's tools.
 * @returns The session: the six port verbs and its fence.
 * @public
 *
 * @example <caption>A Node host places turns in process</caption>
 * ```typescript
 * import { NodeFsProvider } from '@taucad/filesystem/backend/node';
 * import { createProjectRevisionsActor } from '@taucad/revisions/revision-effects';
 * import { createNativeGitRevisionPort } from '@taucad/revisions/node';
 * import { createTurnPlacementPort } from '@taucad/revisions/turn-placement';
 *
 * const revisions = createProjectRevisionsActor({
 *   port: createNativeGitRevisionPort({ repositoryPath: '/srv/project' }),
 *   projectId: 'project-1',
 *   filesystem: () => new NodeFsProvider('/srv/project'),
 * });
 * revisions.actor.start();
 * const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem }) => filesystem });
 * const key = { chatId: 'chat-1', turnId: 'turn-1', runId: 'run-1', attempt: 1 };
 * const answer = await placement.admit({ requestId: 'admit:run-1:1', key });
 * ```
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one session's closure over its root, tool table and listeners.
export const createTurnPlacementPort = <Tools>(
  options: TurnPlacementPortOptions<Tools>,
): TurnPlacementAdapter<Tools> => {
  const { actor, turns } = options.revisions;
  const tools = new Map<string, ToolEntry<Tools>>();
  const waiters = new Map<string, Set<(heard: Heard) => boolean>>();
  const subscribers = new Set<() => void>();
  const queues = new Set<Fact[]>();
  let fenced = false;
  const isFenced = (): boolean => fenced;
  /* Rows are built in the order their facts arrive, and a verb's answer follows its row onto `settlements` (TS-R4). */
  let publishing: Promise<void> = Promise.resolve();

  const hear = (key: TurnAttemptKey, heard: Heard): void => {
    for (const waiter of waiters.get(attemptIdOf(key)) ?? []) {
      if (waiter(heard)) {
        waiters.get(attemptIdOf(key))?.delete(waiter);
      }
    }
  };

  /* Register before the root is told, so an answer the root gives synchronously is not missed. */
  const listen = <Result>(
    key: TurnAttemptKey,
    pick: (heard: Heard) => Result | undefined,
  ): Readonly<{ answer: Promise<Result | FencedHeard>; cancel: () => void }> => {
    const { promise, resolve } = Promise.withResolvers<Result | FencedHeard>();
    const id = attemptIdOf(key);
    const waiter = (heard: Heard): boolean => {
      if (heard.type === 'fenced') {
        resolve(heard);
        return true;
      }
      const result = pick(heard);
      if (result === undefined) {
        return false;
      }
      resolve(result);
      return true;
    };
    const set = waiters.get(id) ?? new Set();
    set.add(waiter);
    waiters.set(id, set);
    return {
      answer: promise,
      cancel: () => {
        set.delete(waiter);
      },
    };
  };

  /* TS-R6, P9: a fence or the root's stop answers every outstanding wait `fenced`, so no in-process verb hangs. */
  const stop = (): void => {
    fenced = true;
    for (const set of waiters.values()) {
      for (const waiter of set) {
        waiter({ type: 'fenced' });
      }
    }
    waiters.clear();
  };

  const push = (fact: Fact): void => {
    for (const queue of queues) {
      queue.push(fact);
    }
    for (const wake of subscribers) {
      wake();
    }
  };

  const rowOf = async (announcement: TurnAnnouncement): Promise<SettlementRow> => {
    if (announcement.type === 'turnReleased') {
      const failure = describeTurnRelease(announcement) ?? {
        type: 'turn.failed',
        turnId: announcement.turnId,
        runId: announcement.runId,
        chatId: announcement.chatId,
        checkoutId: announcement.checkoutId,
        reason: announcement.reason ?? 'The turn ended before it recorded a revision.',
      };
      return {
        ...failure,
        /* Every `turn.failed` carries a code (TS-S9); a release without one is the attempt let go. */
        code: failure.code ?? 'TURN_RELEASED',
        attempt: announcement.attempt,
        /* A base the attempt minted before it was released (D10). */
        ...(announcement.revisionId === undefined ? {} : { revisionId: announcement.revisionId }),
      };
    }
    if (announcement.type === 'turnConflicted') {
      return {
        type: 'turn.conflicted',
        turnId: announcement.turnId,
        runId: announcement.runId,
        chatId: announcement.chatId,
        checkoutId: announcement.checkoutId,
        attempt: announcement.attempt,
      };
    }
    const { type: _type, ...settlement } = announcement;
    try {
      return { ...(await turns.describe(settlement)), attempt: announcement.attempt };
    } catch {
      /* The graph facts are a view of the revision, which stays the record (D10); the row still names it. */
      return {
        type: 'turn.finalized',
        turnId: settlement.turnId,
        runId: settlement.runId,
        chatId: settlement.chatId,
        projectId: actor.getSnapshot().context.projectId,
        checkoutId: settlement.checkoutId,
        ...(settlement.revisionId === undefined ? {} : { revisionId: settlement.revisionId }),
        ...(settlement.branch === undefined ? {} : { branch: settlement.branch }),
        changedPaths: [],
        trigger: 'turn',
        runIds: settlement.runIds.toSorted(),
        attempt: announcement.attempt,
      };
    }
  };

  const keyOfAnnouncement = (announcement: TurnAnnouncement): TurnAttemptKey => ({
    chatId: announcement.chatId,
    turnId: announcement.turnId,
    runId: announcement.runId,
    attempt: announcement.attempt,
  });

  const publish = (announcement: TurnAnnouncement): void => {
    const key = keyOfAnnouncement(announcement);
    const previous = publishing;
    // async-iife: bootstrap -- the root's emit is synchronous; rows join one ordered chain that `fence` awaits.
    publishing = (async (): Promise<void> => {
      await previous;
      push({ kind: 'settled', key, row: await rowOf(announcement) });
      hear(key, { type: 'published' });
    })();
  };

  /*
   * RM-R8 narrowed: a record another live root holds is refused `LEASE_HELD_ELSEWHERE`, and this session waits once per
   * run for that root's mark. Its release is a `leaseHeld` fact, so the host queues the reconcile that can now settle
   * it (TS-R16); a fenced session stops waiting.
   */
  const watching = new Set<string>();
  const watch = new AbortController();
  const watchHolder = (key: TurnAttemptKey): void => {
    if (watching.has(key.runId)) {
      return;
    }
    watching.add(key.runId);
    const wait = async (): Promise<void> => {
      try {
        await turns.holderReleased(key.runId, watch.signal);
        const leases = await turns.leases();
        const record = leases.find((lease) => lease.runId === key.runId);
        if (record !== undefined && !watch.signal.aborted) {
          push({ kind: 'leaseHeld', key, checkoutId: record.checkoutId });
        }
      } catch {
        /* Aborted by the fence, or the store went away with the session. */
      } finally {
        watching.delete(key.runId);
      }
    };
    void wait();
  };
  const heldElsewhere = (requestId: string, key: TurnAttemptKey): Refused<'LEASE_HELD_ELSEWHERE'> => {
    watchHolder(key);
    return refused({
      requestId,
      code: 'LEASE_HELD_ELSEWHERE',
      message: `Attempt ${String(key.attempt)} of run ${key.runId} is held by another open revisions root; it settles there, or here once that root closes.`,
    });
  };
  /* An attempt with no actor here is taken over only through the record's section (RM-R8 narrowed, RM-R14). */
  const heldByAnotherRoot = async (key: TurnAttemptKey): Promise<boolean> =>
    actor.getSnapshot().context.turnRefs[attemptIdOf(key)] === undefined && (await turns.claim(key.runId)) === 'held';

  const drop = (key: TurnAttemptKey): void => {
    tools.get(attemptIdOf(key))?.revocable.close();
    tools.delete(attemptIdOf(key));
  };

  const subscriptions = [
    actor.on('turnPlaced', (event) => {
      hear(event.key, {
        type: 'placed',
        checkoutId: event.checkoutId,
        ...(event.branch === undefined ? {} : { branch: event.branch }),
        ...(event.baseRevisionId === undefined ? {} : { baseRevisionId: event.baseRevisionId }),
      });
    }),
    actor.on('turnRefused', (event) => {
      drop(event.key);
      hear(event.key, { type: 'refused', code: event.code, reason: event.reason });
    }),
    actor.on('turnFinalized', (event) => {
      publish(event);
    }),
    actor.on('turnConflicted', (event) => {
      publish(event);
    }),
    actor.on('turnReleased', (event) => {
      publish({ ...event, reason: event.reason, code: event.code });
    }),
    actor.on('turnCutRefused', (event) => {
      hear(event.key, { type: 'cutRefused', code: event.code, reason: event.reason, cutFailures: event.cutFailures });
    }),
    actor.on('turnRetired', (event) => {
      drop(event.key);
      hear(event.key, { type: 'retired' });
    }),
    actor.on('acknowledgeRefused', (event) => {
      hear(event.key, { type: 'acknowledgeRefused', code: event.code, reason: event.reason });
    }),
    actor.on('leaseHeld', (event) => {
      push({ kind: 'leaseHeld', key: event.key, checkoutId: event.checkoutId });
    }),
    actor.subscribe({ complete: stop, error: stop }),
  ];

  /* An acknowledged attempt's row is durable in its chat's log: sync records the chats (the host's former relay did). */
  const recordsChanged = (): void => {
    actor.send({ type: 'sync', event: { type: 'recordsChanged' } });
  };

  /* The registry lists the lease records before a verb reads them; it answers even with no checkout (RM-R11). */
  const registryAnswered = async (): Promise<void> => {
    await waitFor(actor, (snapshot) => snapshot.context.registrySettled);
  };

  /* TS-R12: the chat record's checkout, when the person named none; unreadable is none, and the root takes the live one. */
  const recordedCheckout = async (chatId: string): Promise<string | undefined> => {
    try {
      await registryAnswered();
      const live = actor.getSnapshot().context.liveCheckoutId;
      if (live === undefined) {
        return undefined;
      }
      const opened = await turns.open(live);
      if (opened === undefined) {
        return undefined;
      }
      const text = await readChatRecord(opened.filesystem, chatId);
      const record: unknown = text === undefined ? undefined : JSON.parse(text);
      const recorded =
        typeof record === 'object' && record !== null && 'checkoutId' in record ? record.checkoutId : undefined;
      return typeof recorded === 'string' && recorded !== '' ? recorded : undefined;
    } catch {
      return undefined;
    }
  };

  const announcementFor = (key: TurnAttemptKey): TurnAnnouncement | undefined => {
    const ref = actor.getSnapshot().context.turnRefs[attemptIdOf(key)];
    return ref === undefined ? undefined : selectTurnAnnouncement(ref.getSnapshot());
  };

  const admitCodeOf = (code: string | undefined, checkoutId: string | undefined): AdmitCode => {
    if (code === 'TURN_ALREADY_LEASED' || code === 'BASE_CUT_FAILED') {
      return code;
    }
    if (code === 'CHECKOUT_CONFLICT' || code === 'LEASE_UNAVAILABLE') {
      /* Today's `CHECKOUT_CONFLICT` also means "the id names no checkout"; that half has its own code (TS-S0 Q4). */
      const known = actor.getSnapshot().context.checkouts.some((checkout) => checkout.id === checkoutId);
      return checkoutId !== undefined && !known ? 'CHECKOUT_UNKNOWN' : 'CHECKOUT_CONFLICT';
    }
    return 'REVISIONS_UNAVAILABLE';
  };

  /*
   * Release an attempt the root placed but this session cannot hand tools for, so the refusal holds nothing (TS-R1).
   * Resolves with the base the attempt minted before it was released, which the refusal names (W8.r1 L2).
   */
  const unplace = async (key: TurnAttemptKey): Promise<string | undefined> => {
    const settled = listen(key, (heard) => (heard.type === 'published' ? heard : undefined));
    actor.send({ type: 'turnAbandoned', key });
    const published = await settled.answer;
    if (published.type === 'fenced') {
      return undefined;
    }
    const released = announcementFor(key);
    const retired = listen(key, (heard) =>
      heard.type === 'retired' || heard.type === 'acknowledgeRefused' ? heard : undefined,
    );
    actor.send({ type: 'acknowledge', key });
    await retired.answer;
    return released?.type === 'turnReleased' ? released.revisionId : undefined;
  };
  /*
   * Hand out the placed attempt's tools. A replay hands out new tools over the same revocable view (TS-S0 Q6): a
   * transferred port cannot be sent twice. When the checkout cannot be opened the attempt is released first, so that
   * refusal holds nothing (TS-R1), and the answer is the base it minted, if any.
   */
  const grant = async (
    key: TurnAttemptKey,
    event: Extract<Heard, { type: 'placed' }>,
  ): Promise<Placement<Tools> | Readonly<{ unplaced: string | undefined }>> => {
    const known = tools.get(attemptIdOf(key));
    const placedOn = event.checkoutId ?? known?.placement.checkoutId;
    const opened = placedOn === undefined ? undefined : await turns.open(placedOn).catch(() => undefined);
    if (opened === undefined) {
      return { unplaced: await unplace(key) };
    }
    const revocableView =
      known?.revocable ??
      revocable(opened.filesystem, opened.versioned, () => {
        push({ kind: 'changed', key, checkoutId: opened.checkout.id });
      });
    const placement: Omit<Placement<Tools>, 'tools'> = known?.placement ?? {
      checkoutId: opened.checkout.id,
      ...(event.branch === undefined ? {} : { branch: event.branch }),
      ...(event.baseRevisionId === undefined ? {} : { baseRevisionId: event.baseRevisionId }),
      /* From the checkout's kind, never from the client (HD-9). */
      mode: opened.checkout.kind === 'live' ? 'direct' : 'candidate',
      root: options.root?.(opened.checkout) ?? opened.checkout.root,
    };
    const granted = options.openTools({
      key,
      filesystem: revocableView.view,
      checkout: opened.checkout,
      root: placement.root,
    });
    tools.set(attemptIdOf(key), { placement, tools: granted, revocable: revocableView });
    return { ...placement, tools: granted };
  };

  return {
    admit: async ({ requestId, key, checkoutId }) => {
      if (fenced) {
        return fencedAnswer(requestId);
      }
      const id = attemptIdOf(key);
      const before = actor.getSnapshot().context;
      /* TS-R2: an attempt the root already holds is answered by that attempt; no second base is minted. */
      const replay = tools.has(id) || before.turnFacts[id] !== undefined;
      if (!replay && (await heldByAnotherRoot(key))) {
        watchHolder(key);
        return refused({
          requestId,
          code: 'TURN_ALREADY_LEASED',
          message: admitMessage('TURN_ALREADY_LEASED', '', ''),
        });
      }
      /* TS-R12: the person's choice, else the chat record's checkout; the root falls back to the live one. */
      const intent = checkoutId ?? (await recordedCheckout(key.chatId));
      await options.settle?.();
      const heard = listen(key, (event) => (event.type === 'placed' || event.type === 'refused' ? event : undefined));
      actor.send({ type: 'admitTurn', key, ...(intent === undefined ? {} : { checkoutId: intent }) });
      const event = await heard.answer;
      if (event.type === 'fenced') {
        return fencedAnswer(requestId);
      }
      if (event.type === 'refused') {
        const code = admitCodeOf(event.code, intent);
        return refused({
          requestId,
          code,
          message: admitMessage(code, intent ?? 'live', event.reason),
          ...(event.code === undefined ? {} : { details: { cause: event.code } }),
        });
      }
      const placement = await grant(key, event);
      if (isFenced()) {
        return fencedAnswer(requestId);
      }
      if ('unplaced' in placement) {
        return refused({
          requestId,
          code: 'CHECKOUT_UNKNOWN',
          message: admitMessage('CHECKOUT_UNKNOWN', 'live', ''),
          /* The attempt's row names the base it minted before it was released (D10). */
          ...(placement.unplaced === undefined ? {} : { details: { revisionId: placement.unplaced } }),
        });
      }
      return { requestId, status: replay ? 'replayed' : 'applied', placement };
    },

    complete: async ({ requestId, key, cut }) => {
      if (fenced) {
        return fencedAnswer(requestId);
      }
      /* The tools go first, after the writes they accepted: a cut then sees every byte the attempt wrote (TS-R15). */
      await tools.get(attemptIdOf(key))?.revocable.revoke();
      await options.settle?.();
      await registryAnswered();
      if (announcementFor(key) !== undefined) {
        return { requestId, status: 'replayed' };
      }
      if (await heldByAnotherRoot(key)) {
        return heldElsewhere(requestId, key);
      }
      const heard = listen(key, (event) =>
        event.type === 'published' || event.type === 'cutRefused' ? event : undefined,
      );
      actor.send({ type: cut ? 'turnCompleted' : 'turnAbandoned', key });
      const ref = actor.getSnapshot().context.turnRefs[attemptIdOf(key)];
      if (ref === undefined || ref.getSnapshot().matches('refusing')) {
        heard.cancel();
        return refused({
          requestId,
          code: 'TURN_UNKNOWN',
          message: `No lease holds attempt ${String(key.attempt)} of run ${key.runId}, so nothing was saved for it.`,
        });
      }
      const event = await heard.answer;
      if (event.type === 'fenced') {
        return fencedAnswer(requestId);
      }
      if (event.type === 'cutRefused') {
        return refused({
          requestId,
          code: 'CUT_FAILED',
          message: `Saving this turn's checkout failed: ${event.reason}`,
          details: { cutFailures: event.cutFailures, ...(event.code === undefined ? {} : { cause: event.code }) },
        });
      }
      return { requestId, status: 'applied' };
    },

    abandon: async ({ requestId, key }) => {
      if (fenced) {
        return fencedAnswer(requestId);
      }
      const entry = tools.get(attemptIdOf(key));
      if (entry === undefined) {
        return actor.getSnapshot().context.turnFacts[attemptIdOf(key)] === undefined
          ? refused({
              requestId,
              code: 'TURN_UNKNOWN',
              message: `Attempt ${String(key.attempt)} of run ${key.runId} holds no tools.`,
            })
          : { requestId, status: 'replayed' };
      }
      if (entry.revocable.revoked()) {
        return { requestId, status: 'replayed' };
      }
      await entry.revocable.revoke();
      return { requestId, status: 'applied' };
    },

    reconcile: async ({ requestId, chatId }) => {
      if (fenced) {
        return fencedAnswer(requestId);
      }
      try {
        await registryAnswered();
        const records = await turns.leases();
        const held = new Map<string, Held>();
        for (const record of records) {
          /* A legacy record names no chat or turn: it is left and reported by the caller's migration (TS-Q5). */
          if (typeof record.chatId !== 'string' || typeof record.turnId !== 'string') {
            continue;
          }
          const key = { chatId: record.chatId, turnId: record.turnId, runId: record.runId, attempt: record.attempt };
          held.set(attemptIdOf(key), { key, checkoutId: record.checkoutId });
        }
        /* The root's own live attempts, including one placing before its record lands (RV2). */
        for (const fact of Object.values(actor.getSnapshot().context.turnFacts)) {
          if (fact.checkoutId !== undefined && !held.has(attemptIdOf(fact.key))) {
            held.set(attemptIdOf(fact.key), { key: fact.key, checkoutId: fact.checkoutId });
          }
        }
        return {
          requestId,
          status: 'applied',
          held: [...held.values()].filter((entry) => chatId === undefined || entry.key.chatId === chatId),
        };
      } catch (error) {
        return refused({
          requestId,
          code: 'REVISIONS_UNAVAILABLE',
          message: `The project's revision store could not list its turn leases: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },

    settlements: ({ signal }) => ({
      [Symbol.asyncIterator]: async function* settlementFacts(): AsyncGenerator<Fact> {
        const queue: Fact[] = [];
        let wake: (() => void) | undefined;
        const onWake = (): void => {
          wake?.();
        };
        queues.add(queue);
        subscribers.add(onWake);
        signal.addEventListener('abort', onWake);
        try {
          /* TS-R4: every settlement not yet acknowledged, whichever session's attempt published it. */
          const replayed: Fact[] = [];
          for (const [id, entry] of tools) {
            const fact = actor.getSnapshot().context.turnFacts[id];
            if (entry.revocable.changed() && fact !== undefined) {
              replayed.push({ kind: 'changed', key: fact.key, checkoutId: entry.placement.checkoutId });
            }
          }
          for (const ref of Object.values(actor.getSnapshot().context.turnRefs)) {
            const announcement = selectTurnAnnouncement(ref.getSnapshot());
            if (announcement !== undefined) {
              // oxlint-disable-next-line no-await-in-loop -- rows are described one at a time, in actor order.
              replayed.push({ kind: 'settled', key: keyOfAnnouncement(announcement), row: await rowOf(announcement) });
            }
          }
          queue.unshift(...replayed);
          while (!signal.aborted) {
            if (isFenced()) {
              return;
            }
            const fact = queue.shift();
            if (fact === undefined) {
              const next = Promise.withResolvers<void>();
              wake = next.resolve;
              // oxlint-disable-next-line no-await-in-loop -- a listen waits for its next fact.
              await next.promise;
              wake = undefined;
              continue;
            }
            yield fact;
          }
        } finally {
          queues.delete(queue);
          subscribers.delete(onWake);
          signal.removeEventListener('abort', onWake);
        }
      },
    }),

    acknowledge: async ({ requestId, key }) => {
      if (fenced) {
        return fencedAnswer(requestId);
      }
      await registryAnswered();
      const { context } = actor.getSnapshot();
      const id = attemptIdOf(key);
      if (context.turnRefs[id] === undefined) {
        /* No actor: the record naming this attempt is deleted in its section before the answer; none is a replay (TS-R5). */
        const retired = await turns.retire(key);
        if (retired === 'held') {
          return heldElsewhere(requestId, key);
        }
        actor.send({ type: 'acknowledge', key });
        if (retired === 'retired') {
          recordsChanged();
        }
        return { requestId, status: retired === 'retired' ? 'applied' : 'replayed' };
      }
      const heard = listen(key, (event) =>
        event.type === 'retired' || event.type === 'acknowledgeRefused' ? event : undefined,
      );
      actor.send({ type: 'acknowledge', key });
      const event = await heard.answer;
      if (event.type === 'fenced') {
        return fencedAnswer(requestId);
      }
      if (event.type === 'acknowledgeRefused') {
        return refused({
          requestId,
          code: 'REVISIONS_BUSY',
          message: `Attempt ${String(key.attempt)} has not settled yet; acknowledge it after its settlement arrives. ${event.reason}`,
          ...(event.code === undefined ? {} : { details: { cause: event.code } }),
        });
      }
      recordsChanged();
      return { requestId, status: 'applied' };
    },

    fence: async () => {
      stop();
      watch.abort();
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
      for (const wake of subscribers) {
        wake();
      }
      await Promise.allSettled(Array.from(tools.values(), async (entry) => entry.revocable.revoke()));
      await publishing;
    },
  };
};
