/**
 * Quarantine release and expiry: the pure half (FQ-9 of the CI flake quarantine blueprint, Brain
 * `research/ci-flake-quarantine-blueprint.md`, D5 "Release", D8 and T6; testing policy § 16.3 and § 16.5).
 * `ci-flake-ledger-ingest-cli.ts` counts each quarantined test's executions with {@link countQuarantineRun};
 * `ci-flake-quarantine-release-cli.ts` reads the count, looks up the linked fix and proposes the removals.
 *
 * **What is counted.** Every gating execution of a test an entry on `main` names, narrowed to the entry's variant,
 * from the run attempt that executed it (a cache replay is counted once, as the ledger counts it). A non-gating shadow
 * row's execution never counts (FQ-13 runs the same bar on its own rows). An execution passes when the test passed on
 * its first attempt; a failure, or a pass on the recorded retry, resets the count, and a run attempt with any such
 * execution counts none of its passes. This is the shadow row's mechanism, one test at a time: probation and
 * quarantine leave by the same rule (D5).
 *
 * **The bar** (§ 16.5). 100 consecutive passing executions after a linked fix lands, or 300 without one, spread over
 * at least two days. A linked fix is a merged pull request from the `flake/<issue>` branch of the entry's owner issue,
 * or one labelled `flake` that references the issue (the two ways `validate-flake-fix` recognises a fix), merged on
 * or after the entry's `created` day; only executions of runs created after it merged count toward the 100.
 *
 * **Expiry** (§ 16.3). On its `expires` day (day 14, or day 28 after the one operator renewal) an entry is removed
 * and the test gates again; `nightly-watchdog.ts` pages the operator for every entry at or past its expiry. The
 * automation never renews: a renewal is the operator's edit of `quarantine.json` (`renewal: { by, on }`, `expires` at
 * most 28 days after `created`), which `validate-quarantine` holds to once.
 *
 * **Return within 30 days of release** (D5). The release closes the owner issue with a record of the entry; a test
 * that meets the entry rule again within 30 days re-enters as the same entry (its issue, `created`, `expires` and
 * renewal) and goes to the operator, not the agent (`ci-flake-quarantine-entry.ts`).
 */
import { entryKey, entryProblems, parseQuarantine, readQuarantine, variantCovers } from '@taucad/vitest-ci/quarantine';
import type { QuarantineEntry, QuarantineRenewal } from '@taucad/vitest-ci/quarantine';

import { maximumStreakRuns } from '#ci-flake-ledger-state.js';
import type { IngestRun, LedgerState, OutcomeRow, ReleaseTrack, StreakRun } from '#ci-flake-ledger-state.js';
import { addDays, quarantinePath } from '#ci-flake-quarantine-entry.js';
import type { QuarantineText, WorkspaceProject } from '#ci-flake-quarantine-entry.js';

/** The release bar of testing policy § 16.5 (the operator's Q1 bar, the same as a shadow row's). */
export const releaseBar = {
  /** Consecutive passing executions after a linked fix lands. */
  withFix: 100,
  /** Consecutive passing executions without a fix. */
  withoutFix: 300,
  /** Days the counted executions must span, first to last. */
  minimumDays: 2,
} as const;
/** A test that meets the entry rule this many days after its release re-enters as the same entry (D5). */
export const returnWindowDays = 30;
/** Branches of release removals; never `flake/*`, which `validate-flake-fix` treats as a fix. */
export const releaseBranchPrefix = 'flake-release/';
/** Branches of expiry removals. */
export const expiryBranchPrefix = 'flake-expiry/';
/** Marks an owner issue whose release removal is proposed; the issue closes once the entry leaves `main`. */
export const releasingLabel = 'flake:releasing';
/** Marks an owner issue closed by a release: a return within 30 days reopens it. */
export const releasedLabel = 'flake:released';
/** Marks an owner issue the operator owns (FQ-12 and `validate-flake-fix` use it too). */
export const operatorLabel = 'flake:needs-operator';

const dayMilliseconds = 24 * 60 * 60 * 1000;
const projectSeparator = ' › ';

/** An entry on `main`, valid but for its expiry, with where it lives. */
export type QuarantinedTest = {
  /** The key of its track: the file and the entry's test and variant. */
  readonly key: string;
  readonly path: string;
  readonly project: WorkspaceProject;
  /** `<project> › <test>`: the ledger identity. */
  readonly id: string;
  readonly entry: QuarantineEntry;
};

/** A track's key: an entry is one test and variant in one file. */
export const trackKey = (path: string, entry: QuarantineEntry): string => `${path} ${entryKey(entry)}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The entries on `main` that hold, or that broke no rule but their expiry: an expired entry still has to be removed.
 * A malformed entry is the validator's to report and is left alone.
 */
export const quarantinedTests = (
  workspace: {
    readonly projects: ReadonlyMap<string, WorkspaceProject>;
    readonly quarantines: readonly QuarantineText[];
  },
  today: string,
): QuarantinedTest[] => {
  const roots = new Map([...workspace.projects.values()].map((project) => [quarantinePath(project.root), project]));
  const tests: QuarantinedTest[] = [];
  for (const file of workspace.quarantines) {
    const project = roots.get(file.path);
    if (!project) {
      continue;
    }
    const context = { projectRoot: project.root, tags: project.tags };
    const valid = new Set(readQuarantine(file.text, context, today).entries.map((entry) => entryKey(entry)));
    const seen = new Set<string>();
    for (const raw of parseQuarantine(file.text).entries) {
      if (!isRecord(raw) || typeof raw['expires'] !== 'string') {
        continue;
      }
      const entry = raw as QuarantineEntry;
      const key = entryKey(entry);
      const holds =
        valid.has(key) || (entry.expires < today && entryProblems(raw, context, entry.expires).length === 0);
      if (!holds || seen.has(key)) {
        continue;
      }
      seen.add(key);
      tests.push({
        key: trackKey(file.path, entry),
        path: file.path,
        project,
        id: `${project.name}${projectSeparator}${entry.test}`,
        entry,
      });
    }
  }
  return tests;
};

/** Whether an outcome row is an execution the entry covers: its variant (browser, OS, target) or any. */
const covers = (test: QuarantinedTest, row: OutcomeRow): boolean =>
  variantCovers(test.entry.variant, { browser: row.variant.browser, os: row.variant.os, target: row.targetKey });

/**
 * Count one run attempt's outcome rows into the quarantined tests' tracks (in place). Call it before `ingestRun`
 * records the attempt as ingested: like the ledger, it counts the rows this run executed at this attempt or an
 * earlier one not yet ingested, and leaves rows a cache replay restored alone. Rows of a non-gating shadow row (marked
 * by the ingestion, or of a registered shadow target) never count.
 */
export const countQuarantineRun = (
  state: LedgerState,
  input: {
    readonly run: IngestRun;
    readonly rows: readonly OutcomeRow[];
    readonly tests: readonly QuarantinedTest[];
    readonly shadowTargets?: ReadonlySet<string> | undefined;
  },
): string[] => {
  const { run, tests } = input;
  if (tests.length === 0) {
    return [];
  }
  const attempt = run.run_attempt ?? 1;
  const done = new Set(state.ingested.filter((entry) => entry.run === run.id).map((entry) => entry.attempt));
  const byId = new Map<string, QuarantinedTest[]>();
  for (const test of tests) {
    byId.set(test.id, [...(byId.get(test.id) ?? []), test]);
  }
  /* Passes and failures by track, then by attempt. */
  const counts = new Map<string, Map<number, { passes: number; failures: number }>>();
  const seen = new Set<string>();
  for (const row of input.rows) {
    if (
      row.kind !== 'test' ||
      row.shadow === true ||
      input.shadowTargets?.has(`${row.project}:${row.targetKey}`) === true ||
      row.run !== run.id ||
      row.attempt === undefined ||
      row.attempt > attempt ||
      done.has(row.attempt)
    ) {
      continue;
    }
    const rowKey = JSON.stringify([row.id, row.variant, row.hash, row.attempt, row.job, row.target]);
    if (seen.has(rowKey)) {
      continue;
    }
    seen.add(rowKey);
    for (const test of byId.get(row.id) ?? []) {
      if (!covers(test, row)) {
        continue;
      }
      const attempts = counts.get(test.key) ?? new Map<number, { passes: number; failures: number }>();
      counts.set(test.key, attempts);
      const count = attempts.get(row.attempt) ?? { passes: 0, failures: 0 };
      attempts.set(row.attempt, count);
      if (row.state === 'passed' && !row.flaky) {
        count.passes += 1;
      } else {
        count.failures += 1;
      }
    }
  }
  state.quarantineTracks ??= {};
  const counted: string[] = [];
  for (const test of tests) {
    const attempts = counts.get(test.key);
    if (!attempts) {
      continue;
    }
    const track: ReleaseTrack = state.quarantineTracks[test.key] ?? {
      path: test.path,
      id: test.id,
      since: run.created_at,
      executions: 0,
      failures: 0,
      streak: 0,
      streakRuns: [],
    };
    state.quarantineTracks[test.key] = track;
    for (const [rowAttempt, count] of [...attempts.entries()].sort(([a], [b]) => a - b)) {
      track.executions += count.passes + count.failures;
      if (count.failures > 0) {
        track.failures += count.failures;
        track.streak = 0;
        track.streakRuns = [];
        track.lastFailure = { run: run.id, attempt: rowAttempt, at: run.created_at };
      } else {
        track.streak += count.passes;
        track.streakRuns = [
          ...track.streakRuns,
          { run: run.id, attempt: rowAttempt, at: run.created_at, passes: count.passes },
        ].slice(-maximumStreakRuns);
      }
    }
    counted.push(test.key);
  }
  return counted;
};

/** Drop the track of every entry no longer on `main` (released, expired or removed by hand). */
export const retainQuarantineTracks = (state: LedgerState, tests: readonly QuarantinedTest[]): string[] => {
  if (!state.quarantineTracks) {
    return [];
  }
  const keep = new Set(tests.map((test) => test.key));
  const dropped = Object.keys(state.quarantineTracks).filter((key) => !keep.has(key));
  for (const key of dropped) {
    // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- the state is a record keyed by entry
    delete state.quarantineTracks[key];
  }
  return dropped;
};

/** A merged pull request that fixes the entry's flake. */
export type LinkedFix = { readonly pull: number; readonly mergedAt: string };

/** How far a quarantined test is toward the bar. */
export type ReleaseVerdict = {
  readonly met: boolean;
  /** The bar that applies: after the linked fix, or without one. */
  readonly kind: 'fix' | 'no-fix';
  /** Consecutive passing executions counted toward it. */
  readonly passes: number;
  readonly bar: number;
  /** Days between the first and the last counted run. */
  readonly days: number;
};

const spanDays = (runs: readonly StreakRun[]): number => {
  const first = runs[0];
  const last = runs.at(-1);
  return first && last ? (Date.parse(last.at) - Date.parse(first.at)) / dayMilliseconds : 0;
};

/** Whether a track meets the release bar, with the linked fix when there is one. */
export const releaseVerdict = (track: ReleaseTrack | undefined, fix?: LinkedFix): ReleaseVerdict => {
  const runs = track?.streakRuns ?? [];
  const withoutFix: ReleaseVerdict = {
    met: (track?.streak ?? 0) >= releaseBar.withoutFix && spanDays(runs) >= releaseBar.minimumDays,
    kind: 'no-fix',
    passes: track?.streak ?? 0,
    bar: releaseBar.withoutFix,
    days: spanDays(runs),
  };
  if (!fix || withoutFix.met) {
    return withoutFix;
  }
  const after = runs.filter((run) => run.at >= fix.mergedAt);
  const passes = after.reduce((sum, run) => sum + run.passes, 0);
  return {
    met: passes >= releaseBar.withFix && spanDays(after) >= releaseBar.minimumDays,
    kind: 'fix',
    passes,
    bar: releaseBar.withFix,
    days: spanDays(after),
  };
};

/** The newest linked fix merged on or after the entry's `created` day: an older one did not fix this flake. */
export const linkedFix = (fixes: readonly LinkedFix[], entry: QuarantineEntry): LinkedFix | undefined => {
  let newest: LinkedFix | undefined;
  for (const fix of fixes) {
    if (fix.mergedAt >= `${entry.created}T00:00:00Z` && (newest === undefined || fix.mergedAt > newest.mergedAt)) {
      newest = fix;
    }
  }
  return newest;
};

export type RemovalKind = 'release' | 'expiry';

/** A removal branch the ledger pushed whose pull request is not closed: the entries it removes, as `main` had them. */
export type PendingRemoval = {
  readonly branch: string;
  readonly kind: RemovalKind;
  /** Its open pull request, if it has one. */
  readonly pull?: number | undefined;
  /** Its commit message: the title and the tests, for a pull request a later run opens. */
  readonly message?: string | undefined;
  readonly removed: ReadonlyArray<{ readonly path: string; readonly entry: unknown }>;
};

/** A removal's identity: the file and the entry exactly as it was, so a renewed entry is a different one. */
const exactKey = (path: string, entry: unknown): string => `${path}\n${JSON.stringify(entry)}`;

export type PlannedRemoval = QuarantinedTest & {
  readonly verdict: ReleaseVerdict;
  readonly fix?: LinkedFix | undefined;
};

export type RemovalPlan = {
  /** Entries that meet the bar: removed, and their issues closed once the removal lands. */
  readonly releases: readonly PlannedRemoval[];
  /** Entries at or past their expiry: removed, and the test gates again. */
  readonly expiries: readonly PlannedRemoval[];
  /** Entries a pending removal already covers. */
  readonly held: ReadonlyArray<PlannedRemoval & { readonly branch: string }>;
  /** Entries still in quarantine. */
  readonly waiting: readonly PlannedRemoval[];
  /** Pending removals that no longer apply: an entry changed or left `main`, or a release no longer meets the bar. */
  readonly stale: ReadonlyArray<PendingRemoval & { readonly reason: string }>;
  /** Pending removals that still apply. */
  readonly current: readonly PendingRemoval[];
};

export type RemovalInput = {
  readonly tests: readonly QuarantinedTest[];
  readonly tracks: Readonly<Record<string, ReleaseTrack>>;
  /** Linked fixes by track key, as the CLI found them. */
  readonly fixes: ReadonlyMap<string, LinkedFix | undefined>;
  readonly pending: readonly PendingRemoval[];
  /** `YYYY-MM-DD` (UTC). */
  readonly today: string;
};

/**
 * Decide which entries leave quarantine. Pure: the CLI does the reading and the writing. An entry that meets the bar
 * is released, even on its expiry day; otherwise an entry at or past its `expires` day is removed. A pending removal
 * holds its entries while each is still on `main` unchanged and, for a release, still meets the bar.
 */
export const planRemovals = (input: RemovalInput): RemovalPlan => {
  const planned = input.tests.map((test): PlannedRemoval => {
    const fix = input.fixes.get(test.key);
    return { ...test, verdict: releaseVerdict(input.tracks[test.key], fix), fix };
  });
  const onMain = new Map(planned.map((test) => [exactKey(test.path, test.entry), test]));
  const stale: Array<PendingRemoval & { reason: string }> = [];
  const current: PendingRemoval[] = [];
  const heldBy = new Map<string, string>();
  for (const pending of input.pending) {
    const tests = pending.removed.map((removed) => onMain.get(exactKey(removed.path, removed.entry)));
    const reason =
      pending.removed.length === 0
        ? 'it removes no entry'
        : tests.some((test) => test === undefined)
          ? 'an entry it removes is no longer on main as it was'
          : pending.kind === 'release' && tests.some((test) => !test?.verdict.met)
            ? 'a test it releases no longer meets the bar'
            : undefined;
    if (reason !== undefined) {
      stale.push({ ...pending, reason });
      continue;
    }
    current.push(pending);
    for (const test of tests) {
      if (test) {
        heldBy.set(test.key, pending.branch);
      }
    }
  }
  const releases: PlannedRemoval[] = [];
  const expiries: PlannedRemoval[] = [];
  const held: Array<PlannedRemoval & { branch: string }> = [];
  const waiting: PlannedRemoval[] = [];
  for (const test of planned) {
    const branch = heldBy.get(test.key);
    if (branch !== undefined) {
      held.push({ ...test, branch });
    } else if (test.verdict.met) {
      releases.push(test);
    } else if (test.entry.expires <= input.today) {
      expiries.push(test);
    } else {
      waiting.push(test);
    }
  }
  return { releases, expiries, held, waiting, stale, current };
};

/** The entries a removal branch removes: those of the file it was built on that its head no longer holds. */
export const removedEntries = (before: string, after: string): unknown[] => {
  const kept = new Set(parseQuarantine(after).entries.map((entry) => JSON.stringify(entry)));
  return parseQuarantine(before).entries.filter((entry) => !kept.has(JSON.stringify(entry)));
};

/** A `quarantine.json` with entries removed, every other key and entry kept as it is. */
export const removeFromQuarantine = (text: string, remove: readonly QuarantineEntry[]): string => {
  const file = JSON.parse(text) as Record<string, unknown>;
  const keys = new Set(remove.map((entry) => entryKey(entry)));
  const entries = Array.isArray(file['entries']) ? (file['entries'] as unknown[]) : [];
  const kept = entries.filter((entry) => !isRecord(entry) || !keys.has(entryKey(entry as QuarantineEntry)));
  return `${JSON.stringify({ ...file, entries: kept }, undefined, 2)}\n`;
};

/** The quarantine files after the removals: each changed path with its new text. */
export const removalFiles = (
  quarantines: readonly QuarantineText[],
  removals: readonly QuarantinedTest[],
): QuarantineText[] => {
  const byPath = new Map<string, QuarantineEntry[]>();
  for (const removal of removals) {
    byPath.set(removal.path, [...(byPath.get(removal.path) ?? []), removal.entry]);
  }
  return [...byPath].flatMap(([path, entries]) => {
    const text = quarantines.find((file) => file.path === path)?.text;
    return text === undefined ? [] : [{ path, text: removeFromQuarantine(text, entries) }];
  });
};

/** Text from a test title, made inert in Markdown: one line, no backticks. */
const inert = (content: string, limit = 300): string => {
  const line = content.replaceAll(/\s+/gu, ' ').replaceAll('`', "'").trim();
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
};

const code = (content: string, limit?: number): string => `\`${inert(content, limit)}\``;

/** A table cell: GitHub splits a row at every unescaped pipe, even inside a code span. */
const cell = (content: string): string => content.replaceAll('|', String.raw`\|`);

/** The removal pull request's title: `test(<project>): Release …` or `Expire …`, `test(root)` across projects. */
export const removalTitle = (kind: RemovalKind, removals: readonly QuarantinedTest[]): string => {
  const projects = [...new Set(removals.map((removal) => removal.project.name))];
  const scope = projects.length === 1 ? (projects[0] ?? 'root') : 'root';
  const tests = `${removals.length} quarantined test${removals.length === 1 ? '' : 's'}`;
  return `test(${scope}): ${kind === 'release' ? 'Release' : 'Expire'} ${tests}${projects.length > 1 ? ` in ${projects.length} projects` : ''}`;
};

/** How a verdict reads: `100 of 100 consecutive passes after #12 (2.4 days)`. */
export const verdictLine = (removal: PlannedRemoval): string =>
  `${removal.verdict.passes} of ${removal.verdict.bar} consecutive gating passes` +
  `${removal.verdict.kind === 'fix' && removal.fix ? ` after fix #${removal.fix.pull}` : ' without a linked fix'}` +
  ` over ${removal.verdict.days.toFixed(1)} days`;

/** The removal pull request's body. */
export const removalBody = (
  kind: RemovalKind,
  removals: readonly PlannedRemoval[],
  context: { readonly autoMerge: boolean; readonly problems: readonly string[] },
): string =>
  [
    kind === 'release'
      ? 'The flake ledger releases the tests below: each met the release bar (100 consecutive gating passes after a linked fix lands, or 300 without one, over at least two days; testing policy § 16.5). Each gates again once this lands, and its owner issue closes.'
      : 'The flake ledger removes the entries below: each reached its expiry (day 14, or day 28 after the one operator renewal; testing policy § 16.3) without meeting the release bar. Each test gates again once this lands; the nightly watchdog pages the operator, and the owner issue stays open for the operator.',
    '',
    '| Test | Project | Variant | Created | Expires | Owner issue | Count |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...removals.map(
      (removal) =>
        `| ${cell(code(removal.entry.test, 200))} | ${removal.project.name} | ${removal.entry.variant ? cell(code(JSON.stringify(removal.entry.variant))) : 'all'} | ${removal.entry.created} | ${removal.entry.expires}${removal.entry.renewal ? ' (renewed)' : ''} | #${removal.entry.issue} | ${verdictLine(removal)} |`,
    ),
    '',
    context.autoMerge
      ? 'Touches only `quarantine.json` files and passes `validate-quarantine` on the tree it proposes, so it is eligible to land through the merge queue without a person (blueprint O2).'
      : `Auto-merge is off: ${context.problems.length > 0 ? `\`validate-quarantine\` reports problems on the proposed tree:\n\n${context.problems.map((problem) => `- ${inert(problem)}`).join('\n')}` : 'the change touches more than `quarantine.json` files'}.`,
    '',
    `_Opened by the flake ledger (\`.github/workflows/flake-ledger.yml\`, FQ-9)._`,
    '',
  ].join('\n');

/** What a release records on the owner issue: the entry, so a return within 30 days re-enters as the same one. */
export type ReleaseRecord = {
  /** The identity's hash, as in its `flake-identity` marker. */
  readonly identity: string;
  readonly path: string;
  readonly created: string;
  // oxlint-disable-next-line tau-lint/no-bare-time-identifier -- The `quarantine.json` field it records.
  readonly expires: string;
  readonly renewal?: QuarantineRenewal | undefined;
  /** The day the release landed and the issue closed: on a `released` marker only. */
  readonly released?: string | undefined;
};

/** The markers the ledger leaves on an owner issue: a removal proposed, and a release that landed. */
export type MarkerKind = RemovalKind | 'released';

const recordPattern = /<!-- flake-(release|expiry|released): (\{[^<>]*\}) -->/gu;

/** A character as a JSON unicode escape, so no `<` or `>` can close the comment the marker is. */
const unicodeEscape = (character: string): string =>
  String.raw`\u${(character.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`;

/** The marker a removal comment, or the closing comment of a release, carries. */
export const removalMarker = (kind: MarkerKind, record: ReleaseRecord): string =>
  `<!-- flake-${kind}: ${JSON.stringify(record).replaceAll(/[<>]/gu, unicodeEscape)} -->`;

/** Every marker in some comments' text, oldest first; a marker that is not a record is left out. */
export const markersIn = (
  texts: readonly string[],
): Array<{ readonly kind: MarkerKind; readonly record: ReleaseRecord }> => {
  const found: Array<{ kind: MarkerKind; record: ReleaseRecord }> = [];
  for (const text of texts) {
    for (const match of text.matchAll(recordPattern)) {
      try {
        const value: unknown = JSON.parse(match[2] ?? '');
        if (
          isRecord(value) &&
          typeof value['identity'] === 'string' &&
          typeof value['path'] === 'string' &&
          typeof value['created'] === 'string' &&
          typeof value['expires'] === 'string'
        ) {
          const renewal = isRecord(value['renewal']) ? (value['renewal'] as QuarantineRenewal) : undefined;
          const released = typeof value['released'] === 'string' ? value['released'] : undefined;
          found.push({
            kind: match[1] as MarkerKind,
            record: {
              identity: value['identity'],
              path: value['path'],
              created: value['created'],
              expires: value['expires'],
              ...(renewal ? { renewal } : {}),
              ...(released ? { released } : {}),
            },
          });
        }
      } catch {
        // A marker that is not JSON records nothing.
      }
    }
  }
  return found;
};

/** The newest removal proposed on an issue: what last happened to its entry. */
export const lastRemoval = (
  texts: readonly string[],
): { readonly kind: RemovalKind; readonly record: ReleaseRecord } | undefined =>
  markersIn(texts).findLast(
    (marker): marker is { kind: RemovalKind; record: ReleaseRecord } => marker.kind !== 'released',
  );

/** The newest release that landed on an issue, with its day. */
export const lastLanded = (texts: readonly string[]): (ReleaseRecord & { readonly released: string }) | undefined => {
  const found = markersIn(texts).findLast((marker) => marker.kind === 'released')?.record;
  return found?.released === undefined ? undefined : { ...found, released: found.released };
};

/** A released entry that may return: its owner issue, the day the release landed, and whether the issue is open. */
export type ReturnRecord = ReleaseRecord & {
  readonly issue: number;
  readonly released: string;
  /** Already reopened for the operator by an earlier run. */
  readonly open?: boolean | undefined;
};

/** Whether a release is recent enough that the test's return is the same entry (D5). */
export const isRecentRelease = (released: string, today: string): boolean =>
  released >= addDays(today, -returnWindowDays) && released <= today;

/** The comment a release puts on the owner issue. */
export const releaseComment = (
  removal: PlannedRemoval,
  context: { readonly identity: string; readonly where: string },
): string =>
  [
    removalMarker('release', {
      identity: context.identity,
      path: removal.path,
      created: removal.entry.created,
      expires: removal.entry.expires,
      ...(removal.entry.renewal ? { renewal: removal.entry.renewal } : {}),
    }),
    `**Released**: ${verdictLine(removal)} (testing policy § 16.5). ${context.where} Once it lands the test gates again and this issue closes. A return within ${returnWindowDays} days re-enters as the same entry and goes to the operator.`,
  ].join('\n');

/** The comment an expiry puts on the owner issue. */
export const expiryComment = (
  removal: PlannedRemoval,
  context: { readonly identity: string; readonly where: string },
): string =>
  [
    removalMarker('expiry', {
      identity: context.identity,
      path: removal.path,
      created: removal.entry.created,
      expires: removal.entry.expires,
      ...(removal.entry.renewal ? { renewal: removal.entry.renewal } : {}),
    }),
    `**Expired** on ${removal.entry.expires} (${removal.entry.renewal ? 'day 28, after the one operator renewal' : 'day 14'}) at ${verdictLine(removal)}: the entry is removed and the test gates again (testing policy § 16.3). ${context.where} The nightly watchdog pages the operator while the entry is on main at or past its expiry.` +
      (removal.entry.renewal
        ? ' It was renewed once already; a second renewal fails validation.'
        : ` The operator may renew it once, by editing the entry on main before the removal lands: \`renewal: { by, on }\` and \`expires\` at most ${addDays(removal.entry.created, 28)}.`),
  ].join('\n');

/** The plan as a job-summary section. */
export const renderRemovalMarkdown = (plan: RemovalPlan, outcome: readonly string[]): string => {
  const lines = ['## Quarantine release and expiry (FQ-9)', ''];
  const rows = [
    ...plan.releases.map((removal) => ({ removal, status: 'release' })),
    ...plan.expiries.map((removal) => ({ removal, status: 'expiry' })),
    ...plan.held.map((removal) => ({ removal, status: `pending on \`${removal.branch}\`` })),
    ...plan.waiting.map((removal) => ({ removal, status: 'quarantined' })),
  ];
  if (rows.length === 0) {
    lines.push('No entry on main.', '');
  } else {
    lines.push(
      `${plan.releases.length} released, ${plan.expiries.length} expired, ${plan.held.length} pending, ${plan.waiting.length} still quarantined.`,
      '',
      '| Test | Expires | Count | Status |',
      '| --- | --- | --- | --- |',
      ...rows.map(
        ({ removal, status }) =>
          `| ${cell(code(removal.id, 200))} | ${removal.entry.expires} | ${cell(verdictLine(removal))} | ${status} |`,
      ),
      '',
    );
  }
  for (const pending of plan.stale) {
    lines.push(`- Stale: \`${pending.branch}\`: ${pending.reason}.`);
  }
  lines.push(...outcome.map((line) => `- ${line}`), '');
  return lines.join('\n');
};
