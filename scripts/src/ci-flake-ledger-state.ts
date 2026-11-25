/**
 * Flake ledger v2: per-test history from the outcome rows of `@taucad/vitest-ci` (FQ-2 of the CI flake quarantine
 * blueprint, Brain `research/ci-flake-quarantine-blueprint.md`, D2 and D3). The pure half; the IO is
 * `ci-flake-ledger-ingest-cli.ts` and `ci-flake-ledger-store.ts`, and the weekly report (`ci-queue-health-cli.ts`)
 * reads the state it keeps.
 *
 * **Where the state lives.** One JSON document ({@link LedgerState}, `ledger.json`) on the `flake-ledger` branch of
 * this repository, written only by `flake-ledger.yml` through the Git data API: every update is a commit whose
 * parent is the state it read, so the history is the audit trail and a concurrent writer fails instead of
 * overwriting. It is evidence, not a verdict: nothing gates on it, and the quarantine itself (FQ-5) stays a reviewed
 * file on `main`. It is kept off `main` because it changes after every CI run, which as pull requests would load the
 * merge queue with its own bookkeeping.
 *
 * **What is counted.** An execution is one outcome row of a test whose `run` and `attempt` are the run attempt being
 * ingested: a row a cache replay restored carries the ids of the run that executed it, so it is counted once, when
 * that run is ingested, and never again (D2). Only merge-queue runs and pushes to `main` are ingested.
 *
 * **What is a flake event** (D3: a pass and a failure of one test on the same inputs):
 *
 * - `retry`: the test failed and passed inside one task execution (`flaky: true`);
 * - `same-hash`: it failed in one execution and passed in another with the same Nx task hash and variant, inside
 *   one run (a re-run attempt) or across runs;
 * - `lineage`: it failed in a run and passed in the next run of the same merge-queue pull request whose diff is
 *   identical, or in the next push to `main` that did not touch its file (the job-pair rule of `ci-flake-ledger.ts`,
 *   taken down to the test, for a pass whose hash differs). The CLI confirms the diff before the event is recorded.
 *
 * **Which tests are tracked.** A test enters the state at its first failed or retried execution, and from then on
 * every execution of it is counted. A test that has only ever passed is counted per task ({@link TaskState}), not per
 * test: there are about 52,000 test identities, and their passes alone would make the state too large to keep in Git.
 * So an identity's executions, and the window of the entry rule, start at its first failure; a test that passed on a
 * hash before its first failure on that hash is not paired (with the Nx remote cache, a passed hash is replayed, not
 * run again, so this is rare). An identity with no failure and no event for {@link retentionDays} days is dropped.
 *
 * **Renames.** `flake-ledger.json` `aliases` maps an old identity to its new one; the renaming pull request adds the
 * alias, and the ledger folds the old history into the new identity on its next run (D2, Renames).
 *
 * The outcome rows write an absent value as JSON `null`; this reader turns it into a missing field, and the state
 * leaves an absent field out.
 */
import { lineageOf, touchesFailingTest } from '#ci-flake-ledger.js';
import type { Alias, ComparedFile } from '#ci-flake-ledger.js';
import type { WorkflowRun } from '#ci-queue-health.js';

/** The version of {@link LedgerState}; a reader refuses one it does not know. */
export const ledgerStateSchema = 1;
/** The outcome row version (`outcomeSchemaVersion` of `@taucad/vitest-ci`) this reader knows. */
export const outcomeRowSchema = 1;
/** An identity with no failure or event for this many days leaves the state; events older than this are dropped. */
export const retentionDays = 90;
/** An ingested run is remembered this long, so a later attempt of it is counted once and a catch-up skips it. */
export const ingestedRetentionDays = 14;
/** A failure waits this long for a pass on its hash or in its lineage. */
export const openFailureDays = 14;
/** The newest events kept per identity. */
export const maximumEvents = 100;
/** The newest passing hashes kept per identity, for a failure that comes after a pass on the same hash. */
const maximumPassHashes = 8;
/** Commit shas of recent failures kept per identity, for the merge-queue inheritance check. */
const maximumFailureShas = 20;
/** D3's entry rule: two events inside the last 80 executions, or three inside 230. */
export const entryRule = [
  { events: 2, executions: 80 },
  { events: 3, executions: 230 },
] as const;

const dayMilliseconds = 24 * 60 * 60 * 1000;
const maximumIdLength = 2000;
const maximumErrorLength = 300;

/** Where a row ran: the Vitest project, the browser, the OS and architecture, and the flag state. */
export type OutcomeVariant = {
  readonly vitestProject?: string | undefined;
  readonly browser?: string | undefined;
  readonly os: string;
  readonly arch: string;
  readonly flagState?: string | undefined;
};

/** One line of an outcome file (`@taucad/vitest-ci` `OutcomeRow`, schema 1), validated, with `null` as missing. */
export type OutcomeRow = {
  readonly kind: 'test' | 'module' | 'unhandled';
  readonly id: string;
  readonly project: string;
  readonly target: string;
  readonly targetKey: string;
  readonly file?: string | undefined;
  readonly variant: OutcomeVariant;
  readonly state: 'passed' | 'failed';
  readonly retryCount: number;
  readonly flaky: boolean;
  readonly durationMs: number;
  readonly errors: readonly string[];
  readonly hash?: string | undefined;
  readonly run?: number | undefined;
  readonly attempt?: number | undefined;
  readonly job?: string | undefined;
};

export type ParsedOutcomes = {
  readonly rows: OutcomeRow[];
  /** Lines that were not a valid row: each is a reason with its line number. */
  readonly problems: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximumIdLength;
const isOptionalText = (value: unknown): boolean => value === null || isText(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isOptionalCount = (value: unknown): boolean => value === null || isCount(value);
const text = (value: unknown): string | undefined => (isText(value) ? value : undefined);
const count = (value: unknown): number | undefined => (isCount(value) ? value : undefined);

const isVariant = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  isText(value['os']) &&
  isText(value['arch']) &&
  isOptionalText(value['vitestProject']) &&
  isOptionalText(value['browser']) &&
  isOptionalText(value['flagState']);

const rowProblem = (value: Record<string, unknown>): string | undefined => {
  if (value['schema'] !== outcomeRowSchema) {
    return `unknown schema ${JSON.stringify(value['schema'])}`;
  }
  const checks: ReadonlyArray<readonly [boolean, string]> = [
    [value['kind'] === 'test' || value['kind'] === 'module' || value['kind'] === 'unhandled', 'kind'],
    [isText(value['id']), 'id'],
    [isText(value['project']), 'project'],
    [isText(value['target']), 'target'],
    [isText(value['targetKey']), 'targetKey'],
    [isOptionalText(value['file']), 'file'],
    [isVariant(value['variant']), 'variant'],
    [value['state'] === 'passed' || value['state'] === 'failed', 'state'],
    [isCount(value['retryCount']), 'retryCount'],
    [typeof value['flaky'] === 'boolean', 'flaky'],
    [typeof value['durationMs'] === 'number', 'durationMs'],
    [Array.isArray(value['errors']) && value['errors'].every((error) => typeof error === 'string'), 'errors'],
    [isOptionalText(value['hash']), 'hash'],
    [isOptionalCount(value['run']), 'run'],
    [isOptionalCount(value['attempt']), 'attempt'],
    [isOptionalText(value['job']), 'job'],
  ];
  const bad = checks.filter(([ok]) => !ok).map(([, field]) => field);
  return bad.length > 0 ? `invalid ${bad.join(', ')}` : undefined;
};

const toRow = (value: Record<string, unknown>): OutcomeRow => {
  const variant = value['variant'] as Record<string, unknown>;
  return {
    kind: value['kind'] as OutcomeRow['kind'],
    id: value['id'] as string,
    project: value['project'] as string,
    target: value['target'] as string,
    targetKey: value['targetKey'] as string,
    file: text(value['file']),
    variant: {
      vitestProject: text(variant['vitestProject']),
      browser: text(variant['browser']),
      os: variant['os'] as string,
      arch: variant['arch'] as string,
      flagState: text(variant['flagState']),
    },
    state: value['state'] as OutcomeRow['state'],
    retryCount: value['retryCount'] as number,
    flaky: value['flaky'] as boolean,
    durationMs: value['durationMs'] as number,
    errors: value['errors'] as string[],
    hash: text(value['hash']),
    run: count(value['run']),
    attempt: count(value['attempt']),
    job: text(value['job']),
  };
};

/**
 * Parse an outcome file (or several concatenated): one JSON row a line. A line that is not a schema-1 row is
 * reported, not counted; outcome files are written by pull-request code in the merge queue, so they are data and
 * every field is checked.
 */
export const parseOutcomes = (content: string, source = 'outcomes'): ParsedOutcomes => {
  const rows: OutcomeRow[] = [];
  const problems: string[] = [];
  for (const [index, line] of content.split('\n').entries()) {
    if (line.trim() === '') {
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      problems.push(`${source}:${index + 1}: not JSON`);
      continue;
    }
    if (!isRecord(value)) {
      problems.push(`${source}:${index + 1}: not an object`);
      continue;
    }
    const problem = rowProblem(value);
    if (problem === undefined) {
      rows.push(toRow(value));
    } else {
      problems.push(`${source}:${index + 1}: ${problem}`);
    }
  }
  return { rows, problems };
};

/** A short, stable name for a variant: `linux-x64`, `linux-x64 browser=firefox`, `darwin-arm64 project=chat`. */
export const variantKey = (variant: OutcomeVariant): string =>
  [
    `${variant.os}-${variant.arch}`,
    variant.vitestProject && variant.vitestProject !== variant.browser ? `project=${variant.vitestProject}` : '',
    variant.browser ? `browser=${variant.browser}` : '',
    variant.flagState ? `flags=${variant.flagState}` : '',
  ]
    .filter((part) => part !== '')
    .join(' ');

export type FlakeEventKind = 'retry' | 'same-hash' | 'lineage';

/** One flake event of one identity. */
export type FlakeEvent = {
  readonly kind: FlakeEventKind;
  /** When the passing execution's run completed. */
  readonly at: string;
  /** The run and attempt of the pass (for `retry`, of the execution that retried). */
  readonly run: number;
  readonly attempt: number;
  /** The run and attempt of the failure it pairs with. */
  readonly failedRun: number;
  readonly failedAttempt: number;
  readonly variant: string;
  /** The task hash of the failure. */
  readonly hash?: string | undefined;
  /** The identity's execution count at the failure: the entry rule's window is counted on it. */
  readonly execution: number;
  /** The first line of the first error. */
  readonly error?: string | undefined;
};

/** A failed execution still waiting for a pass on its hash or in its lineage. */
export type OpenFailure = {
  readonly run: number;
  readonly attempt: number;
  readonly at: string;
  readonly hash?: string | undefined;
  readonly variant: string;
  /** The commit the failing run tested. */
  readonly sha?: string | undefined;
  /** `pr-<n>` or `push:<branch>` (`ci-flake-ledger.ts` `Lineage`). */
  readonly lineage?: string | undefined;
  /** The merge group's base, for a queue lineage. */
  readonly base?: string | undefined;
  readonly execution: number;
  readonly error?: string | undefined;
};

export type VariantState = {
  executions: number;
  failures: number;
  events: number;
  lastSeen: string;
};

/** The history of one test identity (`<project> › <file> > <suite> > <title>`). */
export type IdentityState = {
  readonly project: string;
  /** The target with `:shard-<n>` removed. */
  targetKey: string;
  file?: string | undefined;
  /** The first execution the ledger counted: the identity's first failed or retried execution. */
  firstSeen: string;
  lastSeen: string;
  /** The last failed or retried execution. */
  lastFailure: string;
  /** First-attempt executions counted since {@link IdentityState.firstSeen}. */
  executions: number;
  /** Executions whose final state was failed. */
  failures: number;
  /** Executions that failed and then passed inside the task (`flaky: true`). */
  retriedPasses: number;
  /** Passing executions since the last failure or retried pass. */
  passStreak: number;
  variants: Record<string, VariantState>;
  events: FlakeEvent[];
  openFailures: OpenFailure[];
  /** Recent hashes it passed on, with the variant (`<variant> <hash>`). */
  passHashes: string[];
  /** Commits of its recent failures, for the queue inheritance check. */
  failureShas: string[];
  /** Earlier identities folded into this one through `flake-ledger.json` `aliases`. */
  aliases: string[];
  /**
   * Executions of its target and variant the ledger counted before it was first tracked: each passed the test on its
   * first attempt or did not run it (a test added since). The stable baseline of the flaky-regression class (FQ-12,
   * `flake-regression.ts`); absent for an identity first tracked before the count existed.
   */
  stableBefore?: number;
};

/** Executions per Nx task: the denominators for the tests that are not tracked. */
export type TaskState = {
  /** Distinct task executions (task hash, run, attempt, job, variant). */
  executions: number;
  /** Test rows counted. */
  tests: number;
  /** Failed test rows. */
  failures: number;
  /** Module and unhandled-error rows: failures outside a test. */
  otherFailures: number;
  firstSeen: string;
  lastSeen: string;
  /**
   * Executions per target and variant (`<target> <variant>`, the shard kept): what a test not tracked yet has run,
   * for {@link IdentityState.stableBefore}. Absent in a state written before it was added.
   */
  targets?: Record<string, number>;
};

/** A run attempt the ledger has ingested. */
export type IngestedRun = {
  readonly run: number;
  readonly attempt: number;
  readonly event: string;
  readonly lineage?: string | undefined;
  readonly sha?: string | undefined;
  readonly at: string;
  readonly conclusion?: string | undefined;
  /** Outcome artifacts read. */
  readonly artifacts: number;
  /** Test rows counted as executions of this attempt. */
  readonly counted: number;
  /** Rows of other runs or earlier attempts (cache replays). */
  readonly replayed: number;
  /** Lines that were not a valid row. */
  readonly rejected: number;
};

export type LedgerState = {
  readonly schema: typeof ledgerStateSchema;
  updatedAt: string;
  ingested: IngestedRun[];
  identities: Record<string, IdentityState>;
  tasks: Record<string, TaskState>;
};

export const emptyState = (now: Date): LedgerState => ({
  schema: ledgerStateSchema,
  updatedAt: now.toISOString(),
  ingested: [],
  identities: {},
  tasks: {},
});

/** Read a state document, refusing a version or a shape this code does not know. */
export const parseState = (content: string): LedgerState => {
  const value: unknown = JSON.parse(content);
  if (!isRecord(value) || value['schema'] !== ledgerStateSchema) {
    throw new Error(`flake ledger state: unknown schema ${JSON.stringify(isRecord(value) ? value['schema'] : value)}`);
  }
  if (
    !Array.isArray(value['ingested']) ||
    !isRecord(value['identities']) ||
    !isRecord(value['tasks']) ||
    typeof value['updatedAt'] !== 'string'
  ) {
    throw new Error('flake ledger state: missing ingested, identities, tasks or updatedAt');
  }
  return value as unknown as LedgerState;
};

const byKey = <T>(record: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** The state as stable, reviewable JSON: identities and tasks in key order, two-space indent, a final newline. */
export const serializeState = (state: LedgerState): string =>
  `${JSON.stringify(
    {
      schema: state.schema,
      updatedAt: state.updatedAt,
      ingested: [...state.ingested].sort((a, b) => a.run - b.run || a.attempt - b.attempt),
      tasks: byKey(state.tasks),
      identities: byKey(state.identities),
    },
    undefined,
    2,
  )}\n`;

/** The current identity of an id: aliases followed to the end (a renamed test renamed again). */
export const aliasResolver = (aliases: readonly Alias[]): ((id: string) => string) => {
  const targets = new Map(aliases.map((alias) => [alias.from, alias.to]));
  return (id: string): string => {
    let current = id;
    for (let step = 0; step <= targets.size; step += 1) {
      const next = targets.get(current);
      if (next === undefined) {
        return current;
      }
      current = next;
    }
    return current;
  };
};

const later = (a: string, b: string): string => (a > b ? a : b);
const earlier = (a: string, b: string): string => (a < b ? a : b);

const mergeVariants = (
  older: Record<string, VariantState>,
  newer: Record<string, VariantState>,
): Record<string, VariantState> => {
  const variants: Record<string, VariantState> = structuredClone(older);
  for (const [key, entry] of Object.entries(newer)) {
    const existing = variants[key];
    variants[key] = existing
      ? {
          executions: existing.executions + entry.executions,
          failures: existing.failures + entry.failures,
          events: existing.events + entry.events,
          lastSeen: later(existing.lastSeen, entry.lastSeen),
        }
      : { ...entry };
  }
  return variants;
};

/** Fold `older` into `newer`: one history, the older one's executions first and the newer one's re-numbered after. */
const mergeIdentities = (older: IdentityState, newer: IdentityState, renamed: string): IdentityState => {
  const offset = older.executions;
  return {
    project: newer.project,
    targetKey: newer.targetKey,
    file: newer.file,
    firstSeen: earlier(older.firstSeen, newer.firstSeen),
    lastSeen: later(older.lastSeen, newer.lastSeen),
    lastFailure: later(older.lastFailure, newer.lastFailure),
    executions: older.executions + newer.executions,
    failures: older.failures + newer.failures,
    retriedPasses: older.retriedPasses + newer.retriedPasses,
    passStreak: newer.executions > 0 ? newer.passStreak : older.passStreak,
    variants: mergeVariants(older.variants, newer.variants),
    events: [...older.events, ...newer.events.map((event) => ({ ...event, execution: event.execution + offset }))]
      .sort((a, b) => a.execution - b.execution || a.at.localeCompare(b.at))
      .slice(-maximumEvents),
    openFailures: [
      ...older.openFailures,
      ...newer.openFailures.map((failure) => ({ ...failure, execution: failure.execution + offset })),
    ],
    passHashes: [...new Set([...older.passHashes, ...newer.passHashes])].slice(-maximumPassHashes),
    failureShas: [...new Set([...older.failureShas, ...newer.failureShas])].slice(-maximumFailureShas),
    aliases: [...new Set([...older.aliases, ...newer.aliases, renamed])].sort(),
    ...(older.stableBefore === undefined ? {} : { stableBefore: older.stableBefore }),
  };
};

/**
 * Fold every identity the aliases rename into its current identity, so a renamed test keeps its history. Returns
 * the ids that were folded.
 */
export const applyAliases = (state: LedgerState, aliases: readonly Alias[]): string[] => {
  const resolve = aliasResolver(aliases);
  const folded: string[] = [];
  const identities = new Map(Object.entries(state.identities));
  for (const id of [...identities.keys()].sort()) {
    const target = resolve(id);
    const source = identities.get(id);
    if (target === id || !source) {
      continue;
    }
    const existing = identities.get(target);
    let merged: IdentityState;
    if (!existing) {
      merged = { ...source, aliases: [...new Set([...source.aliases, id])].sort() };
    } else if (existing.firstSeen <= source.firstSeen) {
      merged = mergeIdentities(existing, source, id);
    } else {
      merged = mergeIdentities(source, existing, id);
    }
    identities.set(target, merged);
    identities.delete(id);
    folded.push(id);
  }
  state.identities = Object.fromEntries(identities);
  return folded;
};

/** A run to ingest, as the Actions API lists it, with the attempt it is at. */
export type IngestRun = WorkflowRun & { readonly run_attempt?: number };

/** A pass that would close a failure in its lineage, if the diff checks out. The CLI confirms it. */
export type LineageCandidate = {
  readonly id: string;
  readonly file?: string | undefined;
  readonly failure: OpenFailure;
  readonly pass: {
    readonly run: number;
    readonly attempt: number;
    readonly at: string;
    readonly sha?: string | undefined;
    readonly base?: string | undefined;
    readonly lineage: string;
    readonly kind: 'queue' | 'push';
  };
};

/** An event and the identity it belongs to. */
export type RecordedEvent = { readonly id: string; readonly event: FlakeEvent };

export type IngestResult = {
  readonly record: IngestedRun;
  /** Events recorded by this run. */
  readonly events: readonly RecordedEvent[];
  readonly candidates: readonly LineageCandidate[];
};

const firstError = (row: OutcomeRow): string | undefined => {
  const error = row.errors[0];
  if (error === undefined) {
    return undefined;
  }
  return error.length > maximumErrorLength ? `${error.slice(0, maximumErrorLength - 1)}…` : error;
};

const newIdentity = (row: OutcomeRow, at: string): IdentityState => ({
  project: row.project,
  targetKey: row.targetKey,
  file: row.file,
  firstSeen: at,
  lastSeen: at,
  lastFailure: at,
  executions: 0,
  failures: 0,
  retriedPasses: 0,
  passStreak: 0,
  variants: {},
  events: [],
  openFailures: [],
  passHashes: [],
  failureShas: [],
  aliases: [],
});

const rowKey = (row: OutcomeRow): string =>
  JSON.stringify([
    row.id,
    row.variant,
    row.hash,
    row.attempt,
    row.job,
    row.target,
    row.state,
    row.retryCount,
    row.durationMs,
  ]);

/** Whether the state already holds this run at this attempt (or a later one). */
export const isIngested = (state: LedgerState, run: number, attempt: number): boolean =>
  state.ingested.some((entry) => entry.run === run && entry.attempt >= attempt);

/** One identity's execution being counted, and where its events go. */
type Counting = {
  readonly id: string;
  readonly identity: IdentityState;
  readonly row: OutcomeRow;
  readonly variant: string;
  readonly at: string;
  readonly run: IngestRun;
  readonly attempt: number;
  readonly events: RecordedEvent[];
};

const recordEvent = (counting: Counting, event: FlakeEvent): void => {
  const { identity, id, events } = counting;
  identity.events = [...identity.events, event].slice(-maximumEvents);
  const entry = identity.variants[event.variant];
  if (entry) {
    entry.events += 1;
  }
  events.push({ id, event });
};

const passKey = (variant: string, hash: string): string => `${variant} ${hash}`;

/** A failed execution: an event with an earlier pass on its hash, else an open failure. */
const countFailure = (counting: Counting): void => {
  const { identity, row, variant, at, run, attempt } = counting;
  const variantState = identity.variants[variant];
  identity.failures += 1;
  if (variantState) {
    variantState.failures += 1;
  }
  identity.passStreak = 0;
  identity.lastFailure = later(identity.lastFailure, at);
  if (run.head_sha) {
    identity.failureShas = [...identity.failureShas.filter((sha) => sha !== run.head_sha), run.head_sha].slice(
      -maximumFailureShas,
    );
  }
  if (row.hash !== undefined && identity.passHashes.includes(passKey(variant, row.hash))) {
    recordEvent(counting, {
      kind: 'same-hash',
      at,
      run: run.id,
      attempt,
      failedRun: run.id,
      failedAttempt: attempt,
      variant,
      hash: row.hash,
      execution: identity.executions,
      error: firstError(row),
    });
    return;
  }
  const lineage = lineageOf(run);
  identity.openFailures.push({
    run: run.id,
    attempt,
    at,
    hash: row.hash,
    variant,
    sha: run.head_sha,
    lineage: lineage?.key,
    base: lineage?.kind === 'queue' ? lineage.base : undefined,
    execution: identity.executions,
    error: firstError(row),
  });
};

/**
 * A passing execution: a `retry` event when it took a retry, a `same-hash` event for each open failure on its hash,
 * else a lineage candidate for the newest open failure of its lineage.
 */
const countPass = (counting: Counting): LineageCandidate | undefined => {
  const { identity, row, variant, at, run, attempt, id } = counting;
  if (row.flaky) {
    identity.retriedPasses += 1;
    identity.passStreak = 0;
    identity.lastFailure = later(identity.lastFailure, at);
    recordEvent(counting, {
      kind: 'retry',
      at,
      run: run.id,
      attempt,
      failedRun: run.id,
      failedAttempt: attempt,
      variant,
      hash: row.hash,
      execution: identity.executions,
      error: firstError(row),
    });
  } else {
    identity.passStreak += 1;
  }
  if (row.hash === undefined) {
    return undefined;
  }
  const key = passKey(variant, row.hash);
  identity.passHashes = [...identity.passHashes.filter((entry) => entry !== key), key].slice(-maximumPassHashes);
  const sameHash = identity.openFailures.filter((failure) => failure.hash === row.hash && failure.variant === variant);
  for (const failure of sameHash) {
    recordEvent(counting, {
      kind: 'same-hash',
      at,
      run: run.id,
      attempt,
      failedRun: failure.run,
      failedAttempt: failure.attempt,
      variant,
      hash: failure.hash,
      execution: failure.execution,
      error: failure.error,
    });
  }
  identity.openFailures = identity.openFailures.filter((failure) => !sameHash.includes(failure));
  const lineage = lineageOf(run);
  if (!lineage || sameHash.length > 0) {
    return undefined;
  }
  const inLineage = identity.openFailures.filter(
    (failure) => failure.lineage === lineage.key && failure.variant === variant && failure.run !== run.id,
  );
  /* The lineage has moved on: its next run of this test passed, so its older failures pair with nothing. */
  identity.openFailures = identity.openFailures.filter((failure) => !inLineage.includes(failure));
  const newest = inLineage.at(-1);
  return newest
    ? {
        id,
        file: identity.file,
        failure: newest,
        pass: {
          run: run.id,
          attempt,
          at,
          sha: run.head_sha,
          base: lineage.kind === 'queue' ? lineage.base : undefined,
          lineage: lineage.key,
          kind: lineage.kind,
        },
      }
    : undefined;
};

/** The rows of this run attempt not counted yet, de-duplicated, and how many were replays or earlier attempts. */
const ownRows = (
  state: LedgerState,
  run: IngestRun,
  rows: readonly OutcomeRow[],
): { readonly own: OutcomeRow[]; readonly replayed: number } => {
  const attempt = run.run_attempt ?? 1;
  const done = new Set(state.ingested.filter((entry) => entry.run === run.id).map((entry) => entry.attempt));
  const seen = new Set<string>();
  const own: OutcomeRow[] = [];
  let replayed = 0;
  for (const row of rows) {
    const key = rowKey(row);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (row.run !== run.id || row.attempt === undefined || row.attempt > attempt || done.has(row.attempt)) {
      replayed += 1;
    } else {
      own.push(row);
    }
  }
  /* Earlier attempts first, and inside one attempt failures before passes, so a re-run's pass finds its failure. */
  own.sort(
    (a, b) =>
      (a.attempt ?? 0) - (b.attempt ?? 0) ||
      (a.state === b.state ? 0 : a.state === 'failed' ? -1 : 1) ||
      a.id.localeCompare(b.id),
  );
  return { own, replayed };
};

/** The key of {@link TaskState.targets}: the row's target (its shard kept) and variant. */
const targetExecutionKey = (row: OutcomeRow): string => `${row.target} ${variantKey(row.variant)}`;

/** Count a row into its task's totals; true when it is a test row. */
const countTask = (
  state: LedgerState,
  row: OutcomeRow,
  context: { readonly at: string; readonly executions: Set<string> },
): boolean => {
  const { at, executions } = context;
  const taskKey = `${row.project}:${row.targetKey}`;
  const task = state.tasks[taskKey] ?? {
    executions: 0,
    tests: 0,
    failures: 0,
    otherFailures: 0,
    firstSeen: at,
    lastSeen: at,
  };
  state.tasks[taskKey] = task;
  task.lastSeen = later(task.lastSeen, at);
  const execution = JSON.stringify([taskKey, row.target, row.hash, row.attempt, row.job, row.variant]);
  if (!executions.has(execution)) {
    executions.add(execution);
    task.executions += 1;
    const target = targetExecutionKey(row);
    task.targets = { ...task.targets, [target]: (task.targets?.[target] ?? 0) + 1 };
  }
  const failed = row.state === 'failed' ? 1 : 0;
  if (row.kind !== 'test') {
    task.otherFailures += failed;
    return false;
  }
  task.tests += 1;
  task.failures += failed;
  return true;
};

/**
 * Count one run attempt's outcome rows into the state (in place): executions, failures, retried passes, and the
 * `retry` and `same-hash` events. Passes that may close a failure in their lineage are returned as candidates for
 * the CLI to confirm with {@link lineageConfirmed} and record with {@link confirmLineage}.
 */
export const ingestRun = (
  state: LedgerState,
  input: {
    readonly run: IngestRun;
    readonly rows: readonly OutcomeRow[];
    readonly artifacts: number;
    readonly rejected: number;
    readonly aliases?: readonly Alias[];
  },
): IngestResult => {
  const { run } = input;
  const resolve = aliasResolver(input.aliases ?? []);
  const at = run.updated_at;
  const { own, replayed } = ownRows(state, run, input.rows);
  const events: RecordedEvent[] = [];
  const candidates: LineageCandidate[] = [];
  const taskExecutions = new Set<string>();
  let counted = 0;
  for (const row of own) {
    if (!countTask(state, row, { at, executions: taskExecutions })) {
      continue;
    }
    counted += 1;
    const id = resolve(row.id);
    let identity = state.identities[id];
    if (!identity) {
      if (row.state === 'passed' && !row.flaky) {
        continue;
      }
      identity = newIdentity(row, at);
      /* An earlier execution of its target and variant that failed it or retried it would have tracked it. */
      const before = (state.tasks[`${row.project}:${row.targetKey}`]?.targets?.[targetExecutionKey(row)] ?? 1) - 1;
      identity.stableBefore = Math.max(0, before);
      state.identities[id] = identity;
    }
    const variant = variantKey(row.variant);
    identity.targetKey = row.targetKey;
    identity.file = row.file;
    identity.executions += 1;
    identity.lastSeen = later(identity.lastSeen, at);
    const variantState = identity.variants[variant] ?? { executions: 0, failures: 0, events: 0, lastSeen: at };
    identity.variants[variant] = variantState;
    variantState.executions += 1;
    variantState.lastSeen = later(variantState.lastSeen, at);
    const counting: Counting = { id, identity, row, variant, at, run, attempt: row.attempt ?? 1, events };
    if (row.state === 'failed') {
      countFailure(counting);
    } else {
      const candidate = countPass(counting);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }
  const lineage = lineageOf(run);
  const record: IngestedRun = {
    run: run.id,
    attempt: run.run_attempt ?? 1,
    event: run.event ?? '',
    lineage: lineage?.key,
    sha: run.head_sha,
    at,
    conclusion: run.conclusion,
    artifacts: input.artifacts,
    counted,
    replayed,
    rejected: input.rejected,
  };
  state.ingested.push(record);
  state.updatedAt = later(state.updatedAt, at);
  return { record, events, candidates };
};

/**
 * Whether a merge-queue lineage candidate is inherited: the group its failing run was built on failed the same test
 * (that group carries the failure, as in `ci-flake-ledger.ts` `pairFailures`).
 */
export const isInherited = (state: LedgerState, candidate: LineageCandidate): boolean =>
  candidate.failure.base !== undefined &&
  (state.identities[candidate.id]?.failureShas.includes(candidate.failure.base) ?? false);

const diffKey = (files: readonly ComparedFile[]): string =>
  files
    .map((file) => `${file.filename}\u0000${file.sha ?? ''}`)
    .sort()
    .join('\n');

/**
 * Whether the two runs of a candidate tested the same change, from the compares the CLI fetched: for a queue
 * lineage, the pull request's diff against each group's base must be identical; for a push lineage, the commits
 * between must not touch the test's file. Undefined when a compare is missing.
 */
export const lineageConfirmed = (
  candidate: LineageCandidate,
  compares: {
    readonly failed?: readonly ComparedFile[] | undefined;
    readonly passed?: readonly ComparedFile[] | undefined;
    readonly between?: readonly ComparedFile[] | undefined;
  },
): boolean | undefined => {
  if (candidate.pass.kind === 'queue') {
    return compares.failed && compares.passed ? diffKey(compares.failed) === diffKey(compares.passed) : undefined;
  }
  return compares.between && candidate.file ? !touchesFailingTest(compares.between, [candidate.file]) : undefined;
};

/** Record a confirmed lineage pair as an event of its identity. */
export const confirmLineage = (state: LedgerState, candidate: LineageCandidate): FlakeEvent | undefined => {
  const identity = state.identities[candidate.id];
  if (!identity) {
    return undefined;
  }
  const event: FlakeEvent = {
    kind: 'lineage',
    at: candidate.pass.at,
    run: candidate.pass.run,
    attempt: candidate.pass.attempt,
    failedRun: candidate.failure.run,
    failedAttempt: candidate.failure.attempt,
    variant: candidate.failure.variant,
    hash: candidate.failure.hash,
    execution: candidate.failure.execution,
    error: candidate.failure.error,
  };
  identity.events = [...identity.events, event].slice(-maximumEvents);
  const entry = identity.variants[event.variant];
  if (entry) {
    entry.events += 1;
  }
  return event;
};

/** Drop what has aged out: old ingested runs, stale open failures, old events, and identities quiet for 90 days. */
export const pruneState = (state: LedgerState, now: Date): void => {
  const cutoff = (days: number): string => new Date(now.getTime() - days * dayMilliseconds).toISOString();
  const ingestedCutoff = cutoff(ingestedRetentionDays);
  const openCutoff = cutoff(openFailureDays);
  const retentionCutoff = cutoff(retentionDays);
  state.ingested = state.ingested.filter((entry) => entry.at >= ingestedCutoff);
  const kept: Array<[string, IdentityState]> = [];
  for (const [id, identity] of Object.entries(state.identities)) {
    identity.openFailures = identity.openFailures.filter((failure) => failure.at >= openCutoff);
    identity.events = identity.events.filter((event) => event.at >= retentionCutoff);
    if (identity.lastFailure >= retentionCutoff || identity.events.length > 0) {
      kept.push([id, identity]);
    }
  }
  state.identities = Object.fromEntries(kept);
};

/** Events inside the identity's last `executions` executions. */
export const eventsInLast = (identity: IdentityState, executions: number): number =>
  identity.events.filter((event) => event.execution > identity.executions - executions).length;

/** Whether an identity meets D3's entry rule today (reported only; acting on it is FQ-6). */
export const meetsEntryRule = (identity: IdentityState): boolean =>
  entryRule.some((rule) => eventsInLast(identity, rule.executions) >= rule.events);

/** One row of the report: an identity with an event in the window. */
export type LedgerRow = {
  readonly id: string;
  readonly identity: IdentityState;
  readonly inWindow: Readonly<Record<FlakeEventKind, number>>;
  readonly variants: readonly string[];
  readonly entryRule: boolean;
};

export type LedgerSummary = {
  readonly window: { readonly from: string; readonly to: string };
  readonly updatedAt: string;
  /** Run attempts ingested whose run completed in the window. */
  readonly runs: number;
  readonly counted: number;
  readonly replayed: number;
  readonly rejected: number;
  /** Identities in the state. */
  readonly tracked: number;
  readonly events: number;
  readonly rows: readonly LedgerRow[];
};

const total = (row: LedgerRow): number => row.inWindow.retry + row.inWindow['same-hash'] + row.inWindow.lineage;

/** The identities with a flake event in the window, most events first. */
export const summarizeLedger = (state: LedgerState, window: { from: string; to: string }): LedgerSummary => {
  const inWindow = (at: string): boolean => at >= window.from && at <= window.to;
  const runs = state.ingested.filter((entry) => inWindow(entry.at));
  const rows: LedgerRow[] = [];
  for (const [id, identity] of Object.entries(state.identities)) {
    const events = identity.events.filter((event) => inWindow(event.at));
    if (events.length === 0) {
      continue;
    }
    const counts: Record<FlakeEventKind, number> = { retry: 0, 'same-hash': 0, lineage: 0 };
    for (const event of events) {
      counts[event.kind] += 1;
    }
    rows.push({
      id,
      identity,
      inWindow: counts,
      variants: [...new Set(events.map((event) => event.variant))].sort(),
      entryRule: meetsEntryRule(identity),
    });
  }
  rows.sort((a, b) => total(b) - total(a) || a.id.localeCompare(b.id));
  return {
    window,
    updatedAt: state.updatedAt,
    runs: runs.length,
    counted: runs.reduce((sum, entry) => sum + entry.counted, 0),
    replayed: runs.reduce((sum, entry) => sum + entry.replayed, 0),
    rejected: runs.reduce((sum, entry) => sum + entry.rejected, 0),
    tracked: Object.keys(state.identities).length,
    events: rows.reduce((sum, row) => sum + total(row), 0),
    rows,
  };
};

const cell = (content: string): string => content.replaceAll('|', String.raw`\|`).replaceAll(/\s+/gu, ' ');

/** The ledger section of the weekly report (and of each ingestion's job summary). */
export const renderLedgerMarkdown = (summary: LedgerSummary, limit = 50): string => {
  const rejected = summary.rejected > 0 ? `, ${summary.rejected} rejected lines` : '';
  const lines = [
    '## Test flake ledger (FQ-2)',
    '',
    `${summary.window.from.slice(0, 16)}Z to ${summary.window.to.slice(0, 16)}Z: ${summary.runs} run attempts ingested, ` +
      `${summary.counted} test executions counted (${summary.replayed} replayed rows not counted again${rejected}). ` +
      `${summary.events} flake events on ${summary.rows.length} tests; ${summary.tracked} tests tracked. ` +
      `State updated ${summary.updatedAt.slice(0, 16)}Z.`,
    '',
  ];
  if (summary.rows.length === 0) {
    lines.push('No flake events in the window.', '');
    return lines.join('\n');
  }
  lines.push(
    'Events: `retry` failed and passed inside one task; `same-hash` failed and passed on one Nx task hash; `lineage` passed on the next run of the same unchanged pull request or push. Executions count from the first failure. "2 in 80 / 3 in 230" is the entry rule of D3, reported only.',
    '',
    '| Test | Events (retry / same-hash / lineage) | All events | Executions | Failures | Retried passes | Variants | First seen | Last seen | 2 in 80 / 3 in 230 |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |',
  );
  for (const row of summary.rows.slice(0, limit)) {
    const { identity } = row;
    lines.push(
      `| ${cell(row.id)} | ${row.inWindow.retry} / ${row.inWindow['same-hash']} / ${row.inWindow.lineage} | ${identity.events.length} | ` +
        `${identity.executions} | ${identity.failures} | ${identity.retriedPasses} | ${cell(row.variants.join(', '))} | ` +
        `${identity.firstSeen.slice(0, 10)} | ${identity.lastSeen.slice(0, 10)} | ${row.entryRule ? 'yes' : ''} |`,
    );
  }
  if (summary.rows.length > limit) {
    lines.push('', `${summary.rows.length - limit} more in the state.`);
  }
  lines.push('');
  return lines.join('\n');
};
