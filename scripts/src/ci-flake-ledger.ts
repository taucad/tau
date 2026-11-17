/**
 * Flake ledger: the pure half of the flake section of the weekly CI health report (`ci-queue-health-cli.ts` does
 * the IO). taucad/tau#1281.
 *
 * A flake is a job that failed on `main`'s path and passed on the next attempt with nothing relevant changed:
 *
 * - **Merge queue.** A group for PR N (`gh-readonly-queue/main/pr-N-<base>`) fails job J, and a later group for the
 *   same PR passes J while the PR's own diff (`<base>...<group commit>`, file names and blob ids) is identical. A
 *   failure the group inherited from the group it was built on (that group failed J too) is not N's: the group
 *   ahead carries it.
 * - **Push to `main`.** A push run fails J and the next push run that ran J passes it, and no file changed between
 *   the two commits is one of the failing test files.
 *
 * Each flake is one ledger entry per failing test (from the job log's Vitest `FAIL` lines, under the Nx task that
 * printed them), or per failed Nx task, or for the job when the log names neither. A key with two entries within
 * 14 days is a repeat offender: it must have an owner and an expiry in `flake-ledger.json`, and that entry must not
 * have expired. Expected-failure markers in test sources carry the same owner and expiry (see
 * {@link scanExpectedFailureMarkers}).
 */
import type { RunEvidence, WorkflowJob, WorkflowRun } from '#ci-queue-health.js';

/** The required gate (`affected` in `ci.yml`): it fails because a lane failed, so it is never the flake itself. */
export const requiredGateJob = 'Run affected tasks';
/** Two flakes of one key inside this many days make it a repeat offender (#1281). */
export const repeatWindowDays = 14;
/** The longest an owner may hold a ledger entry or an expected-failure marker before it must be renewed. */
export const maximumExpiryDays = 28;
/** Later runs of one lineage the CLI looks through for the job's next result. */
export const maximumFollowUps = 5;

const dayMilliseconds = 24 * 60 * 60 * 1000;

/** Where a run sits on `main`'s path: one merge-queue PR, or the push sequence of the branch. */
export type Lineage =
  | { readonly kind: 'queue'; readonly key: string; readonly pr: number; readonly base: string }
  | { readonly kind: 'push'; readonly key: string };

const queueBranch = /^gh-readonly-queue\/[^/]+\/pr-(\d+)-([0-9a-f]{40})$/u;

/** The lineage of a run, from its event and head branch; undefined for any other run. */
export const lineageOf = (run: WorkflowRun): Lineage | undefined => {
  if (run.event === 'push') {
    return { kind: 'push', key: `push:${run.head_branch ?? ''}` };
  }
  const match = queueBranch.exec(run.head_branch ?? '');
  if (run.event !== 'merge_group' || !match?.[1] || !match[2]) {
    return undefined;
  }
  const pr = Number(match[1]);
  return { kind: 'queue', key: `pr-${pr}`, pr, base: match[2] };
};

const failed = (conclusion: string | undefined): boolean => conclusion === 'failure' || conclusion === 'timed_out';

/** The jobs of a run that failed on their own: every failed job except the required gate. */
export const failedLaneJobs = (jobs: readonly WorkflowJob[]): WorkflowJob[] =>
  jobs.filter((job) => failed(job.conclusion) && job.name !== requiredGateJob);

const byCreation = (a: RunEvidence, b: RunEvidence): number =>
  a.run.created_at.localeCompare(b.run.created_at) || a.run.id - b.run.id;

/** The completed runs of each lineage, oldest first. */
export const lineages = (evidence: readonly RunEvidence[]): Map<string, RunEvidence[]> => {
  const result = new Map<string, RunEvidence[]>();
  for (const entry of evidence) {
    const lineage = lineageOf(entry.run);
    if (!lineage || entry.run.status !== 'completed') {
      continue;
    }
    result.set(lineage.key, [...(result.get(lineage.key) ?? []), entry]);
  }
  for (const runs of result.values()) {
    runs.sort(byCreation);
  }
  return result;
};

/**
 * The later runs whose jobs the CLI must fetch to find each failed run's next result: up to
 * {@link maximumFollowUps} completed runs after it in its lineage.
 */
export const followUpsOf = (evidence: readonly RunEvidence[], run: WorkflowRun): WorkflowRun[] => {
  const lineage = lineageOf(run);
  const runs = lineage ? (lineages(evidence).get(lineage.key) ?? []) : [];
  const index = runs.findIndex((entry) => entry.run.id === run.id);
  return index === -1 ? [] : runs.slice(index + 1, index + 1 + maximumFollowUps).map((entry) => entry.run);
};

/** A job that failed in one run of a lineage and passed in the next run of it that ran the job. */
export type FlakePair = {
  readonly lineage: Lineage;
  readonly job: string;
  readonly failed: { readonly run: WorkflowRun; readonly job: WorkflowJob };
  readonly passed: { readonly run: WorkflowRun; readonly job: WorkflowJob };
};

export type Pairing = {
  readonly pairs: readonly FlakePair[];
  /** Failures a merge group inherited from the group it was built on, which failed the same job. */
  readonly inherited: number;
  /** Failures whose next run of the job failed again, or that have no later run of it (yet, or fetched). */
  readonly unresolved: number;
};

/** Pair every failed lane job with the next run of its lineage that ran the same job. */
export const pairFailures = (evidence: readonly RunEvidence[]): Pairing => {
  const failedJobsAt = new Map<string, Set<string>>();
  for (const { run, jobs } of evidence) {
    if (run.head_sha && jobs) {
      const names = failedJobsAt.get(run.head_sha) ?? new Set<string>();
      for (const job of failedLaneJobs(jobs)) {
        names.add(job.name);
      }
      failedJobsAt.set(run.head_sha, names);
    }
  }
  const pairs: FlakePair[] = [];
  let inherited = 0;
  let unresolved = 0;
  for (const runs of lineages(evidence).values()) {
    for (const [index, { run, jobs }] of runs.entries()) {
      const lineage = lineageOf(run);
      if (!lineage || run.conclusion !== 'failure' || !jobs) {
        continue;
      }
      for (const job of failedLaneJobs(jobs)) {
        if (lineage.kind === 'queue' && failedJobsAt.get(lineage.base)?.has(job.name)) {
          inherited += 1;
          continue;
        }
        const next = runs
          .slice(index + 1)
          .map((later) => ({ later, match: later.jobs?.find((entry) => entry.name === job.name) }))
          .find(({ match }) => match?.conclusion === 'success' || failed(match?.conclusion));
        if (next?.match?.conclusion === 'success') {
          pairs.push({
            lineage,
            job: job.name,
            failed: { run, job },
            passed: { run: next.later.run, job: next.match },
          });
        } else {
          unresolved += 1;
        }
      }
    }
  }
  return { pairs, inherited, unresolved };
};

/** A file of a GitHub compare (`GET /repos/{repo}/compare/{base}...{head}`), only the fields the ledger reads. */
export type ComparedFile = { readonly filename: string; readonly sha?: string | undefined };

/** Whether two merge groups carried the same PR diff: the same files with the same blob ids. */
export const sameDiff = (a: readonly ComparedFile[], b: readonly ComparedFile[]): boolean => {
  const key = (files: readonly ComparedFile[]): string =>
    files
      .map((file) => `${file.filename}\u0000${file.sha ?? ''}`)
      .sort()
      .join('\n');
  return key(a) === key(b);
};

/** What a failed job's log names: the Nx tasks that failed and the Vitest tests that failed, under their task. */
export type LogFailures = { readonly tasks: readonly string[]; readonly tests: readonly string[] };

// oxlint-disable-next-line no-control-regex -- ANSI colour escapes in Actions logs
const ansi = /\u001B\[[0-9;]*m/gu;
const timestamp = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/u;
const taskGroup = /^##\[group\]\S*\s*> nx run (\S+)/u;
const vitestFail = /^\s*FAIL\s+(?:\|[^|]+\|\s+)?(\S.*?)\s*$/u;
const failedTask = /^- (\S+:\S+)\s*$/u;

/**
 * The tasks and tests a job log names as failed. Nx prints each task's output in a `##[group] > nx run <task>`
 * group and ends with `Failed tasks:` and one `- <task>` line each; Vitest prints `FAIL  <file> > <title>` for each
 * failed test. A test is keyed `<task> › <file> > <title>` when it sat in a task's group, since Vitest paths are
 * relative to the project.
 */
export const parseJobLog = (log: string): LogFailures => {
  const tasks = new Set<string>();
  const tests = new Set<string>();
  let task: string | undefined;
  let inFailedTasks = false;
  for (const raw of log.split('\n')) {
    const line = raw.replaceAll(ansi, '').replace(timestamp, '');
    const group = taskGroup.exec(line);
    if (group?.[1]) {
      task = group[1];
      continue;
    }
    if (line.startsWith('##[endgroup]')) {
      task = undefined;
      continue;
    }
    if (/^Failed tasks:\s*$/u.test(line)) {
      inFailedTasks = true;
      continue;
    }
    if (inFailedTasks) {
      const entry = failedTask.exec(line);
      if (entry?.[1]) {
        tasks.add(entry[1]);
      } else if (line.trim() !== '') {
        inFailedTasks = false;
      }
      continue;
    }
    const failure = vitestFail.exec(line);
    if (failure?.[1]) {
      tests.add(task ? `${task} › ${failure[1]}` : failure[1]);
    }
  }
  /* Vitest repeats each failure in its summary after Nx closes the task's group; keep the copy under its task. */
  const tasked = new Set(
    [...tests].filter((test) => test.includes(' › ')).map((test) => test.slice(test.indexOf(' › ') + 3)),
  );
  const unique = [...tests].filter((test) => test.includes(' › ') || !tasked.has(test));
  return { tasks: [...tasks].sort(), tests: unique.sort() };
};

/** The test file of a test key, without its task or title: `src/a.test.ts` from `x:test › src/a.test.ts > t`. */
export const testFile = (test: string): string => {
  const withoutTask = test.includes(' › ') ? test.slice(test.indexOf(' › ') + 3) : test;
  return withoutTask.split(' > ')[0]?.split(' [')[0]?.trim() ?? withoutTask;
};

/**
 * Whether a push pair's change touched a failing test: a changed file whose path ends with one of the test files.
 * Vitest paths are project-relative, so a suffix match is the most the log allows.
 */
export const touchesFailingTest = (changed: readonly ComparedFile[], tests: readonly string[]): boolean => {
  const files = tests.map((test) => testFile(test)).filter((file) => file !== '');
  return changed.some((entry) => files.some((file) => entry.filename === file || entry.filename.endsWith(`/${file}`)));
};

/** One recorded flake: what failed, where, and the run that passed it next. */
export type FlakeEntry = {
  /** The failing test, else `task <project:target>`, else `job <name>`. */
  readonly key: string;
  readonly job: string;
  readonly lineage: string;
  readonly at: string;
  readonly failedRun: number;
  readonly failedJobUrl: string;
  readonly passedRun: number;
};

/** The ledger entries of one confirmed flake pair: one per failing test, else per failed task, else the job. */
export const entriesOf = (pair: FlakePair, failures: LogFailures): FlakeEntry[] => {
  const keys =
    failures.tests.length > 0
      ? failures.tests
      : failures.tasks.length > 0
        ? failures.tasks.map((task) => `task ${task}`)
        : [`job ${pair.job}`];
  return keys.map((key) => ({
    key,
    job: pair.job,
    lineage: pair.lineage.key,
    at: pair.failed.job.completed_at ?? pair.failed.run.created_at,
    failedRun: pair.failed.run.id,
    failedJobUrl: pair.failed.job.html_url ?? pair.failed.run.html_url,
    passedRun: pair.passed.run.id,
  }));
};

/** An owned flake, as `flake-ledger.json` holds it. */
export type LedgerEntry = {
  /** A {@link FlakeEntry} key. */
  readonly key: string;
  /** A GitHub login, without `@`. */
  readonly owner: string;
  /** `YYYY-MM-DD`: the day the owner took it. */
  readonly recorded: string;
  /** `YYYY-MM-DD`: the last day it may stand unfixed. At most {@link maximumExpiryDays} after `recorded`. */
  readonly expiryDay: string;
  /** Runs that showed it, and what the owner is doing about it. */
  readonly note: string;
};

export type Ledger = { readonly entries: readonly LedgerEntry[] };

const isoDay = /^\d{4}-\d{2}-\d{2}$/u;
const login = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u;

/** The end of a `YYYY-MM-DD` day in UTC, in milliseconds. */
const endOfDay = (day: string): number => Date.parse(`${day}T23:59:59.999Z`);

/** Problems with the shape of a ledger: a bad date, owner or key, a duplicate, or an expiry too far out. */
export const ledgerProblems = (ledger: Ledger): string[] => {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of ledger.entries) {
    const name = `flake-ledger.json "${entry.key}"`;
    if (entry.key.trim() === '') {
      problems.push('flake-ledger.json: an entry has an empty key');
    }
    if (seen.has(entry.key)) {
      problems.push(`${name}: listed twice`);
    }
    seen.add(entry.key);
    if (!login.test(entry.owner)) {
      problems.push(`${name}: owner must be a GitHub login without @, got "${entry.owner}"`);
    }
    if (!isoDay.test(entry.recorded) || !isoDay.test(entry.expiryDay) || Number.isNaN(endOfDay(entry.expiryDay))) {
      problems.push(`${name}: recorded and expiryDay must be YYYY-MM-DD`);
      continue;
    }
    const days = (endOfDay(entry.expiryDay) - endOfDay(entry.recorded)) / dayMilliseconds;
    if (days < 0 || days > maximumExpiryDays) {
      problems.push(`${name}: expiryDay must be 0 to ${maximumExpiryDays} days after recorded`);
    }
    if (entry.note.trim() === '') {
      problems.push(`${name}: note must say which runs showed it and what the owner is doing`);
    }
  }
  return problems;
};

/** A key with two or more flakes inside {@link repeatWindowDays} days. */
export type RepeatOffender = {
  readonly key: string;
  readonly flakes: readonly FlakeEntry[];
  /** Its ledger entry, when it has one. */
  readonly owner?: string;
  readonly expiryDay?: string;
  /** `owned`: an unexpired ledger entry; `expired`: its entry has passed its expiry; `unowned`: no entry. */
  readonly status: 'owned' | 'expired' | 'unowned';
};

/** Keys flaking twice within 14 days, each matched to its ledger entry. */
export const repeatOffenders = (entries: readonly FlakeEntry[], ledger: Ledger, now: Date): RepeatOffender[] => {
  const byKey = new Map<string, FlakeEntry[]>();
  for (const entry of entries) {
    byKey.set(entry.key, [...(byKey.get(entry.key) ?? []), entry]);
  }
  const owners = new Map(ledger.entries.map((entry) => [entry.key, entry]));
  const result: RepeatOffender[] = [];
  for (const [key, flakes] of byKey) {
    const times = [...new Set(flakes.map((flake) => flake.failedRun))]
      .map((run) => Date.parse(flakes.find((flake) => flake.failedRun === run)?.at ?? ''))
      .sort((a, b) => a - b);
    const repeated = times.some(
      (time, index) => index > 0 && time - (times[index - 1] ?? 0) <= repeatWindowDays * dayMilliseconds,
    );
    if (!repeated) {
      continue;
    }
    const owned = owners.get(key);
    const status = owned ? (endOfDay(owned.expiryDay) < now.getTime() ? 'expired' : 'owned') : 'unowned';
    result.push({
      key,
      flakes: [...flakes].sort((a, b) => b.at.localeCompare(a.at)),
      ...(owned ? { owner: owned.owner, expiryDay: owned.expiryDay } : {}),
      status,
    });
  }
  return result.sort((a, b) => b.flakes.length - a.flakes.length || a.key.localeCompare(b.key));
};

/** Ledger entries past their expiry, whether or not the key flaked again in the window. */
export const expiredLedgerEntries = (ledger: Ledger, now: Date): LedgerEntry[] =>
  ledger.entries.filter((entry) => endOfDay(entry.expiryDay) < now.getTime());

/**
 * An expected-failure marker in a test source: a Vitest `it.fails` / `test.fails`, or a known-defect row's
 * `expectedFailure: true` (ui-e2e `cloudDefectRow`, `knownDefectRows`). Each must carry, on the line directly
 * above it, a comment `// Expected-failure: @<owner> until YYYY-MM-DD` (capitalised for `capitalized-comments`).
 */
export type ExpectedFailureMarker = {
  readonly path: string;
  readonly line: number;
  readonly owner?: string;
  readonly until?: string;
  /**
   * `// Expected-failure: intended, <reason>`: the failure is the behaviour under test (a test of a test helper
   * that must fail the test it guards), not a standing defect, so it has no owner or expiry.
   */
  readonly intended?: true;
};

/** `it.fails(`, `test.fails(`, `it.runIf(x).fails(`, or a known-defect row's `expectedFailure: true`. */
const markerSite = /(?:\.fails\s*\(|\bexpectedFailure:\s*true\b)/u;
const markerLabel = /Expected-failure:\s*@([A-Za-z0-9-]+)\s+until\s+(\d{4}-\d{2}-\d{2})/u;
const intendedLabel = /Expected-failure:\s*intended,\s*\S/u;
/** A comment or JSDoc line, so a mention of `it.fails` in prose is not a marker. */
const commentLine = /^\s*(?:\/\/|\/\*|\*)/u;

const intendedMarker: { readonly intended: true } = { intended: true };

/** Find every expected-failure marker in the given sources, with the owner and expiry its label names. */
export const scanExpectedFailureMarkers = (
  files: ReadonlyArray<{ readonly path: string; readonly text: string }>,
): ExpectedFailureMarker[] => {
  const markers: ExpectedFailureMarker[] = [];
  for (const { path, text } of files) {
    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
      if (commentLine.test(line) || !markerSite.test(line)) {
        continue;
      }
      const above = lines[index - 1] ?? '';
      const label = markerLabel.exec(above);
      markers.push({
        path,
        line: index + 1,
        ...(label?.[1] && label[2] ? { owner: label[1], until: label[2] } : {}),
        ...(intendedLabel.test(above) ? intendedMarker : {}),
      });
    }
  }
  return markers;
};

/** Markers with no label or a malformed one: what the validate target rejects on every PR. */
export const unlabelledMarkers = (markers: readonly ExpectedFailureMarker[]): ExpectedFailureMarker[] =>
  markers.filter(
    (marker) => !marker.intended && (!marker.owner || !marker.until || Number.isNaN(endOfDay(marker.until))),
  );

/** Markers past their `until` day: what the weekly report raises. */
export const expiredMarkers = (markers: readonly ExpectedFailureMarker[], now: Date): ExpectedFailureMarker[] =>
  markers.filter((marker) => marker.until !== undefined && endOfDay(marker.until) < now.getTime());

/** Markers whose `until` is more than {@link maximumExpiryDays} days after `today`. */
export const overlongMarkers = (markers: readonly ExpectedFailureMarker[], now: Date): ExpectedFailureMarker[] =>
  markers.filter(
    (marker) =>
      marker.until !== undefined &&
      endOfDay(marker.until) - endOfDay(now.toISOString().slice(0, 10)) > maximumExpiryDays * dayMilliseconds,
  );

/** The flake section of the weekly report. */
export type FlakeReport = {
  readonly window: { readonly from: string; readonly to: string };
  readonly flakes: readonly FlakeEntry[];
  /** Pairs whose PR diff changed between the runs, or whose change touched a failing test: real fixes, not flakes. */
  readonly fixedBetween: number;
  /** Pairs the CLI could not confirm (budget, or GitHub refused a compare or a log). */
  readonly unconfirmed: number;
  readonly inherited: number;
  readonly unresolved: number;
  readonly offenders: readonly RepeatOffender[];
  readonly expiredLedger: readonly LedgerEntry[];
  readonly expiredMarkers: readonly ExpectedFailureMarker[];
};

/** Whether the report needs someone: an unowned or expired repeat offender, ledger entry or marker. */
export const needsAction = (report: FlakeReport): boolean =>
  report.offenders.some((offender) => offender.status !== 'owned') ||
  report.expiredLedger.length > 0 ||
  report.expiredMarkers.length > 0;

const cell = (text: string): string => text.replaceAll('|', String.raw`\|`).replaceAll(/\s+/gu, ' ');

const addDays = (now: Date, days: number): string =>
  new Date(now.getTime() + days * dayMilliseconds).toISOString().slice(0, 10);

/** The flake section as Markdown, with a ready ledger entry for each unowned repeat offender. */
export const renderFlakeMarkdown = (report: FlakeReport, now: Date): string => {
  const lines = [
    "## Flakes on `main`'s path (#1281)",
    '',
    `${report.window.from.slice(0, 16)}Z to ${report.window.to.slice(0, 16)}Z: ${new Set(report.flakes.map((flake) => flake.failedRun)).size} flaky failures ` +
      `(${report.flakes.length} ledger entries). Not counted: ${report.fixedBetween} fixed between the runs, ${report.inherited} inherited from the group ahead, ` +
      `${report.unresolved} with no passing rerun, ${report.unconfirmed} unconfirmed.`,
    '',
    `### Repeat offenders (two or more in ${repeatWindowDays} days)`,
    '',
  ];
  if (report.offenders.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Key | Flakes | Status | Owner | Expires | Recent |', '| --- | ---: | --- | --- | --- | --- |');
    for (const offender of report.offenders) {
      const recent = offender.flakes
        .slice(0, 5)
        .map((flake, index) => `[${index + 1}](${flake.failedJobUrl})`)
        .join(' ');
      lines.push(
        `| ${cell(offender.key)} | ${offender.flakes.length} | ${offender.status} | ${offender.owner ?? ''} | ${offender.expiryDay ?? ''} | ${recent} |`,
      );
    }
  }
  const unowned = report.offenders.filter((offender) => offender.status !== 'owned');
  if (unowned.length > 0) {
    const recorded = now.toISOString().slice(0, 10);
    const proposal = unowned.map((offender) => ({
      key: offender.key,
      owner: offender.owner ?? 'rifont',
      recorded,
      expiryDay: addDays(now, repeatWindowDays),
      note: `Flaked in runs ${[...new Set(offender.flakes.map((flake) => flake.failedRun))].join(', ')}. Fix at the cause by the expiry.`,
    }));
    lines.push(
      '',
      'Action: fix each at its cause, or give it an owner and an expiry in `scripts/src/flake-ledger.json` (owner from `.github/CODEOWNERS`):',
      '',
      '```json',
      JSON.stringify(proposal, null, 2),
      '```',
    );
  }
  if (report.expiredLedger.length > 0) {
    lines.push('', '### Expired ledger entries', '');
    for (const entry of report.expiredLedger) {
      lines.push(`- \`${entry.key}\`: @${entry.owner}, expired ${entry.expiryDay}`);
    }
  }
  if (report.expiredMarkers.length > 0) {
    lines.push('', '### Expired expected-failure markers', '');
    for (const marker of report.expiredMarkers) {
      lines.push(`- \`${marker.path}:${marker.line}\`: @${marker.owner ?? '?'}, until ${marker.until ?? '?'}`);
    }
  }
  if (report.flakes.length > 0) {
    lines.push(
      '',
      '### All flakes',
      '',
      '| When | Key | Job | Lineage | Failed | Passed |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const flake of [...report.flakes].sort((a, b) => b.at.localeCompare(a.at))) {
      lines.push(
        `| ${flake.at.slice(0, 16)}Z | ${cell(flake.key)} | ${cell(flake.job)} | ${flake.lineage} | [${flake.failedRun}](${flake.failedJobUrl}) | ${flake.passedRun} |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
};
