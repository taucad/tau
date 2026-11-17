/**
 * Pane intents: a request to show a pane or a file in one of the workbench layout's two Dockview adapters, from a
 * person, the route, an agent or the editor (app state orchestration charter D13, I11; `LayoutApply.tla` rules 6 and
 * 7). `workbench-layout.machine` keeps them in its `intents` region.
 *
 * Every intent id is applied at most once or dropped with a reason (I11):
 *
 * - `routeChanged`: the route key changed while it was queued (rule 6, as `project-workspace-context.tsx` clears its
 *   pending refs today).
 * - `workbenchClosed`: the workbench lane closed while a file intent was queued for it (rule 7). A pane intent survives
 *   a lane close and applies on the next attach (A0.3 row 1c, ruled a passing guard under D14).
 * - `unavailable`: the target cannot open (its file failed to open), or the device has no adapter for it.
 *
 * A settled entry is retired to its outcome once no late answer can reach it ({@link retired}): the outcome is all a
 * re-sent id needs to be answered from its first outcome and never applied again, so the open entries do not grow with
 * every intent a live project's runtime has seen.
 *
 * @module
 */

/** Who asked for the pane. */
export type PaneIntentSource = 'person' | 'route' | 'agent' | 'editor';

/** The two Dockview adapters of the workbench layout. */
export type LayoutAdapterId = 'workbench' | 'viewer';

/**
 * What an intent shows. A `pane` is a workbench or viewer panel by id; a `file` is a source file in the workbench lane's
 * editor.
 */
export type PaneIntentTarget =
  | Readonly<{ kind: 'pane'; adapter: LayoutAdapterId; pane: string }>
  | Readonly<{ kind: 'file'; path: string }>;

/** One pane request. */
export type PaneIntent = Readonly<{ intentId: string; source: PaneIntentSource; target: PaneIntentTarget }>;

/** Why an intent was dropped instead of applied (I11). */
export type PaneIntentDropReason = 'routeChanged' | 'workbenchClosed' | 'unavailable';

/** Every drop reason, in the union's order. */
export const paneIntentDropReasons = [
  'routeChanged',
  'workbenchClosed',
  'unavailable',
] as const satisfies readonly PaneIntentDropReason[];

/**
 * An intent's state. `queued` waits for its adapter; `delivered` was handed to an attached adapter as delivery
 * `deliveryId` and waits for its answer. A delivered intent whose adapter detaches is queued again, so it is never lost,
 * and an answer to an older delivery is stale.
 */
export type PaneIntentState =
  | Readonly<{ state: 'queued' }>
  | Readonly<{ state: 'delivered'; deliveryId: number }>
  | Readonly<{ state: 'applied' }>
  | Readonly<{
      state: 'dropped';
      reason: PaneIntentDropReason;
      /** The delivery outstanding when it was dropped: its adapter may still answer it, once. */
      late?: number;
    }>;

/** An intent with its state and its place in the order the intents were sent (an object's integer-like keys sort first). */
export type PaneIntentEntry = PaneIntent & Readonly<{ sent: number }> & PaneIntentState;

/** How an intent settled. */
export type PaneIntentOutcome = Readonly<{ outcome: 'applied' } | { outcome: 'dropped'; reason: PaneIntentDropReason }>;

/** The intents a layout holds, by id, in the order they were sent. */
export type PaneIntents = Readonly<Record<string, PaneIntentEntry>>;

/** The outcomes of the retired intents, by id. */
export type PaneIntentOutcomes = Readonly<Record<string, PaneIntentOutcome>>;

/** The adapter an intent applies through: a file opens in the workbench lane's editor. */
export const intentAdapter = (target: PaneIntentTarget): LayoutAdapterId =>
  target.kind === 'file' ? 'workbench' : target.adapter;

/** A record's own value by key: an id such as `constructor` names no inherited property. */
export const ownValue = <Value>(record: Readonly<Record<string, Value>>, key: string): Value | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** The intent sent with `intentId`, if any. */
export const intentOf = (intents: PaneIntents, intentId: string): PaneIntentEntry | undefined =>
  ownValue(intents, intentId);

/** Whether an intent still waits: queued, or delivered and not yet answered. */
export const isOpen = (entry: PaneIntentEntry): boolean => entry.state === 'queued' || entry.state === 'delivered';

/** An intent's outcome, once it has settled. */
export const outcomeOf = (entry: PaneIntentEntry): PaneIntentOutcome | undefined =>
  entry.state === 'applied'
    ? { outcome: 'applied' }
    : entry.state === 'dropped'
      ? { outcome: 'dropped', reason: entry.reason }
      : undefined;

/** The open intents, in the order they were sent. */
export const openIntents = (intents: PaneIntents): readonly PaneIntentEntry[] =>
  Object.values(intents)
    .filter((entry) => isOpen(entry))
    .toSorted((left, right) => left.sent - right.sent);

/** A newly sent intent, queued after every intent already held (retired ones no longer need an order). */
export const queued = (intents: PaneIntents, intent: PaneIntent): PaneIntents => {
  let sent = 0;
  for (const entry of Object.values(intents)) {
    sent = Math.max(sent, entry.sent + 1);
  }
  return { ...intents, [intent.intentId]: { ...intent, sent, state: 'queued' } };
};

/**
 * Replace one entry's state; an entry that is not open is never changed (a settled intent stays settled). An intent
 * dropped while delivered keeps that delivery as `late`: its adapter may still answer it once.
 */
export const withState = (intents: PaneIntents, intentId: string, state: PaneIntentState): PaneIntents => {
  const entry = intentOf(intents, intentId);
  if (entry === undefined || !isOpen(entry)) {
    return intents;
  }
  const late = state.state === 'dropped' && entry.state === 'delivered' ? { late: entry.deliveryId } : {};
  return {
    ...intents,
    [intentId]: { intentId, source: entry.source, target: entry.target, sent: entry.sent, ...state, ...late },
  };
};

/** A dropped intent's late answer is taken: no later answer to it is. */
export const lateAnswered = (intents: PaneIntents, intentId: string): PaneIntents => {
  const entry = intentOf(intents, intentId);
  if (entry?.state !== 'dropped' || entry.late === undefined) {
    return intents;
  }
  const { intentId: id, source, target, sent, reason } = entry;
  return { ...intents, [intentId]: { intentId: id, source, target, sent, state: 'dropped', reason } };
};

/** Settle every open entry `matching` with `state`; returns the entries settled, for the machine to report. */
export const settleWhere = (
  intents: PaneIntents,
  matching: (entry: PaneIntentEntry) => boolean,
  state: PaneIntentState,
): Readonly<{ intents: PaneIntents; settled: readonly PaneIntentEntry[] }> => {
  const settled = openIntents(intents).filter((entry) => matching(entry));
  let next = intents;
  for (const entry of settled) {
    next = withState(next, entry.intentId, state);
  }
  return { intents: next, settled: settled.map((entry) => intentOf(next, entry.intentId)!) };
};

/**
 * Retire each settled entry that no late answer can reach to its outcome: an applied intent, and a dropped one whose
 * outstanding delivery was answered or can no longer be (I11 keeps the outcome, not the entry).
 */
export const retired = (
  intents: PaneIntents,
  outcomes: PaneIntentOutcomes,
): Readonly<{ intents: PaneIntents; outcomes: PaneIntentOutcomes }> => {
  const entries = Object.values(intents);
  const done = (entry: PaneIntentEntry): boolean =>
    !isOpen(entry) && !(entry.state === 'dropped' && entry.late !== undefined);
  if (!entries.some((entry) => done(entry))) {
    return { intents, outcomes };
  }
  return {
    intents: Object.fromEntries(entries.filter((entry) => !done(entry)).map((entry) => [entry.intentId, entry])),
    outcomes: {
      ...outcomes,
      ...Object.fromEntries(entries.filter((entry) => done(entry)).map((entry) => [entry.intentId, outcomeOf(entry)!])),
    },
  };
};
