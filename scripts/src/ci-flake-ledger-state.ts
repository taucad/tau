/**
 * Flake ledger v2: per-test history from the outcome rows of `@taucad/vitest-ci` (FQ-2 of the CI flake quarantine
 * blueprint, Brain `research/ci-flake-quarantine-blueprint.md`, D2 and D3). The pure half; the IO is
 * `ci-flake-ledger-ingest-cli.ts`, and the weekly report (`ci-queue-health-cli.ts`) reads the state it keeps.
 *
 * **Where the state lives.** One JSON document ({@link LedgerState}, `ledger.json`) on the `flake-ledger` branch of
 * this repository, written only by `flake-ledger.yml` through the Git data API: every update is a commit whose
 * parent is the state it read, so the history is the audit trail and a concurrent writer fails instead of
 * overwriting. It is evidence, not a verdict: nothing gates on it, and the quarantine itself (FQ-5) stays a reviewed
 * file on `main`. It is kept off `main` because it changes after every CI run, which as pull requests would load the
 * merge queue with its own bookkeeping.
 *
 * **What is counted.** An execution is one outcome row of a test whose `run` and `attempt` are the run being
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

/** Where a row ran, as the reporter writes it. */
export type OutcomeVariant = {
  readonly vitestProject: string | null;
  readonly browser: string | null;
  readonly os: string;
  readonly arch: string;
  readonly flagState: string | null;
};

/** One line of an outcome file (`@taucad/vitest-ci` `OutcomeRow`, schema 1), as this reader validates it. */
export type OutcomeRow = {
  readonly schema: 1;
  readonly kind: 'test' | 'module' | 'unhandled';
  readonly id: string;
  readonly project: string;
  readonly target: string;
  readonly targetKey: string;
  readonly file: string | null;
  readonly name: string;
  readonly variant: OutcomeVariant;
  readonly state: 'passed' | 'failed';
  readonly retryCount: number;
  readonly flaky: boolean;
  readonly durationMs: number;
  readonly errors: readonly string[];
  readonly hash: string | null;
  readonly run: number | null;
  readonly attempt: number | null;
  readonly job: string | null;
  readonly sha: string | null;
};

export type ParsedOutcomes = {
  readonly rows: OutcomeRow[];
  /** Lines that were not a valid row: each is a reason with its line number. */
  readonly problems: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown, limit = maximumIdLength): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= limit;
const isOptionalText = (value: unknown): value is string | null => value === null || isText(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isOptionalCount = (value: unknown): value is number | null => value === null || isCount(value);

const rowProblem = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return 'not an object';
  }
  if (value['schema'] !== outcomeRowSchema) {
    return `unknown schema ${JSON.stringify(value['schema'])}`;
  }
  const variant = value['variant'];
  const checks: ReadonlyArray<readonly [boolean, string]> = [
    [value['kind'] === 'test' || value['kind'] === 'module' || value['kind'] === 'unhandled', 'kind'],
    [isText(value['id']), 'id'],
    [isText(value['project']), 'project'],
    [isText(value['target']), 'target'],
    [isText(value['targetKey']), 'targetKey'],
    [isOptionalText(value['file']), 'file'],
    [typeof value['name'] === 'string', 'name'],
    [
      isRecord(variant) &&
        isText(variant['os']) &&
        isText(variant['arch']) &&
        isOptionalText(variant['vitestProject']) &&
        isOptionalText(variant['browser']) &&
        isOptionalText(variant['flagState']),
      'variant',
    ],
    [value['state'] === 'passed' || value['state'] === 'failed', 'state'],
    [isCount(value['retryCount']), 'retryCount'],
    [typeof value['flaky'] === 'boolean', 'flaky'],
    [typeof value['durationMs'] === 'number', 'durationMs'],
    [Array.isArray(value['errors']) && value['errors'].every((error) => typeof error === 'string'), 'errors'],
    [isOptionalText(value['hash']), 'hash'],
    [isOptionalCount(value['run']), 'run'],
    [isOptionalCount(value['attempt']), 'attempt'],
    [isOptionalText(value['job']), 'job'],
    [isOptionalText(value['sha']), 'sha'],
  ];
  const bad = checks.filter(([ok]) => !ok).map(([, field]) => field);
  return bad.length > 0 ? `invalid ${bad.join(', ')}` : undefined;
};

/**
 * Parse an outcome file (or several concatenated): one JSON row a line. A line that is not a schema-1 row is
 * reported, not counted; outcome files are written by pull-request code in the merge queue, so they are data and
 * every field is checked.
 */
export const parseOutcomes = (text: string, source = 'outcomes'): ParsedOutcomes => {
  const rows: OutcomeRow[] = [];
  const problems: string[] = [];
  for (const [index, line] of text.split('\n').entries()) {
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
    const problem = rowProblem(value);
    if (problem) {
      problems.push(`${source}:${index + 1}: ${problem}`);
    } else {
      rows.push(value as OutcomeRow);
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
  readonly hash: string | null;
  /** The identity's execution count at the failure: the entry rule's window is counted on it. */
  readonly execution: number;
  /** The first line of the first error. */
  readonly error: string | null;
};

/** A failed execution still waiting for a pass on its hash or in its lineage. */
export type OpenFailure = {
  readonly run: number;
  readonly attempt: number;
  readonly at: string;
  readonly hash: string | null;
  readonly variant: string;
  /** The commit the failing run tested. */
  readonly sha: string | null;
  /** `pr-<n>` or `push:<branch>` (`ci-flake-ledger.ts` `Lineage`). */
  readonly lineage: string | null;
  /** The merge group's base, for a queue lineage. */
  readonly base: string | null;
  readonly execution: number;
  readonly error: string | null;
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
  file: string | null;
  /** The first execution the ledger counted: the identity's first failed or retried execution. */
  firstSeen: string;
  lastSeen: string;
  /** The last failed or retried execution. */
  lastFailure: string;
  /** First-attempt executions counted since {@link firstSeen}. */
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
  /** Recent hashes it passed on, with the variant (`<variant>\u0000<hash>`). */
  passHashes: string[];
  /** Commits of its recent failures, for the queue inheritance check. */
  failureShas: string[];
  /** Earlier identities folded into this one through `flake-ledger.json` `aliases`. */
  aliases: string[];
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
};

/** A run attempt the ledger has ingested. */
export type IngestedRun = {
  readonly run: number;
  readonly attempt: number;
  readonly event: string;
  readonly lineage: string | null;
  readonly sha: string | null;
  readonly at: string;
  readonly conclusion: string | null;
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
export const parseState = (text: string): LedgerState => {
  const value: unknown = JSON.parse(text);
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

/** The state as stable, reviewable JSON: identities and tasks in key order, two-space indent, a final newline. */
export const serializeState = (state: LedgerState): string => {
  const sorted = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return `${JSON.stringify(
    {
      schema: state.schema,
      updatedAt: state.updatedAt,
      ingested: [...state.ingested].sort((a, b) => a.run - b.run || a.attempt - b.attempt),
      tasks: sorted(state.tasks),
      identities: sorted(state.identities),
    },
    null,
    2,
  )}\n`;
};

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

/** Fold `older` into `newer`: one history, the older one's executions first. */
const mergeIdentities = (older: IdentityState, newer: IdentityState, olderId: string): IdentityState => {
  const offset = older.executions;
  const variants: Record<string, VariantState> = { ...older.variants };
  for (const [key, entry] of Object.entries(newer.variants)) {
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
    variants,
    events: [...older.events, ...newer.events.map((event) => ({ ...event, execution: event.execution + offset }))]
      .sort((a, b) => a.execution - b.execution || a.at.localeCompare(b.at))
      .slice(-maximumEvents),
    openFailures: [
      ...older.openFailures,
      ...newer.openFailures.map((failure) => ({ ...failure, execution: failure.execution + offset })),
    ],
    passHashes: [...new Set([...older.passHashes, ...newer.passHashes])].slice(-maximumPassHashes),
    failureShas: [...new Set([...older.failureShas, ...newer.failureShas])].slice(-maximumFailureShas),
    aliases: [...new Set([...older.aliases, olderId, ...newer.aliases])].sort(),
  };
};

/**
 * Fold every identity the aliases rename into its current identity, so a renamed test keeps its history. Returns
 * the ids that were folded.
 */
export const applyAliases = (state: LedgerState, aliases: readonly Alias[]): string[] => {
  const resolve = aliasResolver(aliases);
  const folded: string[] = [];
  for (const id of Object.keys(state.identities).sort()) {
    const target = resolve(id);
    const source = state.identities[id];
    if (target === id || !source) {
      continue;
    }
    const existing = state.identities[target];
    state.identities[target] = existing
      ? existing.firstSeen <= source.firstSeen
        ? mergeIdentities(existing, source, id)
        : mergeIdentities(source, existing, id)
      : { ...source, aliases: [...new Set([...source.aliases, id])].sort() };
    delete state.identities[id];
    folded.push(id);
  }
  return folded;
};

/** A run to ingest, as the Actions API lists it, with the attempt it is at. */
export type IngestRun = WorkflowRun & { readonly run_attempt?: number };

/** A pass that would close a failure in its lineage, if the diff checks out. The CLI confirms it. */
export type LineageCandidate = {
  readonly id: string;
  readonly file: string | null;
  readonly failure: OpenFailure;
  readonly pass: {
    readonly run: number;
    readonly attempt: number;
    readonly at: string;
    readonly sha: string | null;
    readonly base: string | null;
    readonly lineage: string;
    readonly kind: 'queue' | 'push';
  };
};

export type IngestResult = {
  readonly record: IngestedRun;
  /** Events recorded by this run. */
  readonly events: ReadonlyArray<{ readonly id: string; readonly event: FlakeEvent }>;
  readonly candidates: readonly LineageCandidate[];
};

const firstError = (row: OutcomeRow): string | null => {
  const error = row.errors[0];
  if (error === undefined) {
    return null;
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

/** The attempts of a run already ingested. */
const ingestedAttempts = (state: LedgerState, run: number): Set<number> =>
  new Set(state.ingested.filter((entry) => entry.run === run).map((entry) => entry.attempt));

/** Whether the state already holds this run at this attempt (or a later one). */
export const isIngested = (state: LedgerState, run: number, attempt: number): boolean =>
  state.ingested.some((entry) => entry.run === run && entry.attempt >= attempt);

const recordEvent = (
  identity: IdentityState,
  variant: string,
  event: FlakeEvent,
  events: Array<{ id: string; event: FlakeEvent }>,
  id: string,
): void => {
  identity.events = [...identity.events, event].slice(-maximumEvents);
  const entry = identity.variants[variant];
  if (entry) {
    entry.events += 1;
  }
  events.push({ id, event });
};

/**
 * Count one run attempt's outcome rows into the state (in place): executions, failures, retried passes, and the
 * `retry` and `same-hash` events. Passes that may close a failure in their lineage are returned as candidates for
 * the CLI to confirm with {@link confirmLineage}.
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
  const { run, rows } = input;
  const resolve = aliasResolver(input.aliases ?? []);
  const attempt = run.run_attempt ?? 1;
  const at = run.updated_at;
  const lineage = lineageOf(run);
  const done = ingestedAttempts(state, run.id);
  const seen = new Set<string>();
  const own: OutcomeRow[] = [];
  let replayed = 0;
  for (const row of rows) {
    const key = rowKey(row);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (row.run !== run.id || row.attempt === null || row.attempt > attempt || done.has(row.attempt)) {
      replayed += 1;
      continue;
    }
    own.push(row);
  }
  /* Earlier attempts first, and inside one attempt failures before passes, so a re-run's pass finds its failure. */
  own.sort(
    (a, b) =>
      (a.attempt ?? 0) - (b.attempt ?? 0) ||
      (a.state === b.state ? 0 : a.state === 'failed' ? -1 : 1) ||
      a.id.localeCompare(b.id),
  );
  const events: Array<{ id: string; event: FlakeEvent }> = [];
  const candidates: LineageCandidate[] = [];
  const taskExecutions = new Set<string>();
  let counted = 0;
  for (const row of own) {
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
    if (!taskExecutions.has(execution)) {
      taskExecutions.add(execution);
      task.executions += 1;
    }
    if (row.kind !== 'test') {
      task.otherFailures += row.state === 'failed' ? 1 : 0;
      continue;
    }
    counted += 1;
    task.tests += 1;
    task.failures += row.state === 'failed' ? 1 : 0;
    const id = resolve(row.id);
    const variant = variantKey(row.variant);
    const failedNow = row.state === 'failed';
    let identity = state.identities[id];
    if (!identity) {
      if (!failedNow && !row.flaky) {
        continue;
      }
      identity = newIdentity(row, at);
      state.identities[id] = identity;
    }
    identity.targetKey = row.targetKey;
    identity.file = row.file;
    identity.executions += 1;
    identity.lastSeen = later(identity.lastSeen, at);
    const variantState = identity.variants[variant] ?? { executions: 0, failures: 0, events: 0, lastSeen: at };
    identity.variants[variant] = variantState;
    variantState.executions += 1;
    variantState.lastSeen = later(variantState.lastSeen, at);
    const runAttempt = row.attempt ?? attempt;
    const hashKey = `${variant}\u0000${row.hash ?? ''}`;
    if (failedNow) {
      identity.failures += 1;
      variantState.failures += 1;
      identity.passStreak = 0;
      identity.lastFailure = later(identity.lastFailure, at);
      if (run.head_sha) {
        identity.failureShas = [...identity.failureShas.filter((sha) => sha !== run.head_sha), run.head_sha].slice(
          -maximumFailureShas,
        );
      }
      if (row.hash !== null && identity.passHashes.includes(hashKey)) {
        /* It passed on this hash before: the earlier pass and this failure are one event. */
        recordEvent(
          identity,
          variant,
          {
            kind: 'same-hash',
            at,
            run: run.id,
            attempt: runAttempt,
            failedRun: run.id,
            failedAttempt: runAttempt,
            variant,
            hash: row.hash,
            execution: identity.executions,
            error: firstError(row),
          },
          events,
          id,
        );
        continue;
      }
      identity.openFailures.push({
        run: run.id,
        attempt: runAttempt,
        at,
        hash: row.hash,
        variant,
        sha: run.head_sha ?? null,
        lineage: lineage?.key ?? null,
        base: lineage?.kind === 'queue' ? lineage.base : null,
        execution: identity.executions,
        error: firstError(row),
      });
      continue;
    }
    if (row.flaky) {
      identity.retriedPasses += 1;
      identity.passStreak = 0;
      identity.lastFailure = later(identity.lastFailure, at);
      recordEvent(
        identity,
        variant,
        {
          kind: 'retry',
          at,
          run: run.id,
          attempt: runAttempt,
          failedRun: run.id,
          failedAttempt: runAttempt,
          variant,
          hash: row.hash,
          execution: identity.executions,
          error: firstError(row),
        },
        events,
        id,
      );
    } else {
      identity.passStreak += 1;
    }
    if (row.hash !== null) {
      identity.passHashes = [...identity.passHashes.filter((entry) => entry !== hashKey), hashKey].slice(
        -maximumPassHashes,
      );
    }
    const sameHash = identity.openFailures.filter(
      (failure) => row.hash !== null && failure.hash === row.hash && failure.variant === variant,
    );
    for (const failure of sameHash) {
      recordEvent(
        identity,
        variant,
        {
          kind: 'same-hash',
          at,
          run: run.id,
          attempt: runAttempt,
          failedRun: failure.run,
          failedAttempt: failure.attempt,
          variant,
          hash: failure.hash,
          execution: failure.execution,
          error: failure.error,
        },
        events,
        id,
      );
    }
    let open = identity.openFailures.filter((failure) => !sameHash.includes(failure));
    if (lineage && sameHash.length === 0) {
      const inLineage = open.filter(
        (failure) => failure.lineage === lineage.key && failure.variant === variant && failure.run !== run.id,
      );
      const newest = inLineage.at(-1);
      if (newest) {
        candidates.push({
          id,
          file: identity.file,
          failure: newest,
          pass: {
            run: run.id,
            attempt: runAttempt,
            at,
            sha: run.head_sha ?? null,
            base: lineage.kind === 'queue' ? lineage.base : null,
            lineage: lineage.key,
            kind: lineage.kind,
          },
        });
      }
      /* The lineage has moved on: its next run of this test passed, so its older failures pair with nothing. */
      open = open.filter((failure) => !inLineage.includes(failure));
    }
    identity.openFailures = open;
  }
  const record: IngestedRun = {
    run: run.id,
    attempt,
    event: run.event ?? '',
    lineage: lineage?.key ?? null,
    sha: run.head_sha ?? null,
    at,
    conclusion: run.conclusion ?? null,
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
 * (that group carries the failure, `ci-flake-ledger.ts` `pairFailures`).
 */
export const isInherited = (state: LedgerState, candidate: LineageCandidate): boolean =>
  candidate.failure.base !== null &&
  (state.identities[candidate.id]?.failureShas.includes(candidate.failure.base) ?? false);

/**
 * Whether the two runs of a candidate tested the same change, from the compares the CLI fetched: for a queue
 * lineage, the pull request's diff against each group's base must be identical; for a push lineage, the commits
 * between must not touch the test's file.
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
    if (!compares.failed || !compares.passed) {
      return undefined;
    }
    const key = (files: readonly ComparedFile[]): string =>
      files
        .map((file) => `${file.filename}\u0000${file.sha ?? ''}`)
        .sort()
        .join('\n');
    return key(compares.failed) === key(compares.passed);
  }
  if (!compares.between || !candidate.file) {
    return undefined;
  }
  return !touchesFailingTest(compares.between, [candidate.file]);
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
  recordEvent(identity, candidate.failure.variant, event, [], candidate.id);
  return event;
};

/** Drop what has aged out: old ingested runs, stale open failures, old events, and identities quiet for 90 days. */
export const pruneState = (state: LedgerState, now: Date): void => {
  const cutoff = (days: number): string => new Date(now.getTime() - days * dayMilliseconds).toISOString();
  const ingestedCutoff = cutoff(ingestedRetentionDays);
  const openCutoff = cutoff(openFailureDays);
  const retentionCutoff = cutoff(retentionDays);
  state.ingested = state.ingested.filter((entry) => entry.at >= ingestedCutoff);
  for (const [id, identity] of Object.entries(state.identities)) {
    identity.openFailures = identity.openFailures.filter((failure) => failure.at >= openCutoff);
    identity.events = identity.events.filter((event) => event.at >= retentionCutoff);
    if (identity.lastFailure < retentionCutoff && identity.events.length === 0) {
      delete state.identities[id];
    }
  }
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
  const total = (row: LedgerRow): number => row.inWindow.retry + row.inWindow['same-hash'] + row.inWindow.lineage;
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

const cell = (text: string): string => text.replaceAll('|', String.raw`\|`).replaceAll(/\s+/gu, ' ');

/** The ledger section of the weekly report (and of each ingestion's job summary). */
export const renderLedgerMarkdown = (summary: LedgerSummary, options: { readonly limit?: number } = {}): string => {
  const limit = options.limit ?? 50;
  const lines = [
    '## Test flake ledger (FQ-2)',
    '',
    `${summary.window.from.slice(0, 16)}Z to ${summary.window.to.slice(0, 16)}Z: ${summary.runs} run attempts ingested, ` +
      `${summary.counted} test executions counted (${summary.replayed} replayed rows not counted again` +
      `${summary.rejected > 0 ? `, ${summary.rejected} rejected lines` : ''}). ${summary.events} flake events on ${summary.rows.length} tests; ` +
      `${summary.tracked} tests tracked. State updated ${summary.updatedAt.slice(0, 16)}Z.`,
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
