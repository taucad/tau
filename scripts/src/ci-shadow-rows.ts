/**
 * Shadow rows in the flake ledger (FQ-13 of the CI flake quarantine blueprint, Brain
 * `research/ci-flake-quarantine-blueprint.md`, D5 "Probation and quarantine are one mechanism"; the CI decomposition
 * blueprint's Q1 ruling). The pure half, and the reading of the registry; the ledger ingestion
 * (`ci-flake-ledger-ingest-cli.ts`) counts, and `ci-shadow-rows-promote-cli.ts` proposes the promotion.
 *
 * **What a shadow row is.** An end-to-end suite on probation: it runs in the merge queue and reports, and none of its
 * tests gate. A project lists its shadow suites in its `test:e2e:shadow` target's `dependsOn`, as it lists its gating
 * ones in `test:e2e:queue`; a suite is in one list or the other, never both.
 *
 * **What is counted.** A shadow row's outcome rows are the rows `@taucad/vitest-ci` writes for its task
 * (`<project>:<target>`, the target with `:shard-<n>` removed), in the same `test-outcomes-*` artifacts every lane
 * uploads. Each run attempt of `ci.yml` the ledger ingests (merge queue, and pushes to `main` the queue did not prove)
 * in which the row executed is one run of the row: rows a cache replay restored carry the ids of the run that
 * executed them and are not counted again. A run of the row fails when any of its rows failed (a test, a module or an
 * unhandled error); a test that passed on its recorded retry passes, as § 16.1 of the testing policy defines green,
 * and is reported beside the count. A run the row did not reach (not affected, or cancelled before its outcome file
 * was written) leaves the count as it was.
 *
 * **The bar (Q1).** 100 consecutive runs with no failure of the row's own. Every failure resets the count, including
 * one the entry under test caused: a shadow row does not gate, so such a failure lands on `main` with the entry. Once
 * the count reaches the bar, the promotion CLI opens a pull request that moves the suite from `test:e2e:shadow` to
 * `test:e2e:queue`; it never merges it, since promotion changes the gate.
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IngestRun, LedgerState, OutcomeRow } from '#ci-flake-ledger-state.js';

/** The target whose `dependsOn` lists a project's shadow rows. */
export const shadowTarget = 'test:e2e:shadow';
/** The target whose `dependsOn` lists a project's gating end-to-end suites (the end-to-end ratchet). */
export const queueTarget = 'test:e2e:queue';
/** Q1's bar: consecutive passing runs before a shadow row may gate. */
export const shadowBar = 100;
/** The newest run records kept per row: more than the bar, so the count can be checked by hand from the state. */
export const maximumHistory = 120;
/** The failing test ids kept in one run record. */
const maximumFailedIds = 5;

/** One shadow row: a suite of a project, and the `project.json` that lists it. */
export type ShadowRow = {
  readonly project: string;
  readonly target: string;
  /** The `project.json` path relative to the repository root. */
  readonly projectFile: string;
};

export type ShadowRegistry = {
  readonly rows: readonly ShadowRow[];
  /** Entries that are not a shadow row: each is a reason. */
  readonly problems: readonly string[];
};

/** The parts of a `project.json` the registry reads. */
export type ProjectConfig = {
  readonly name?: unknown;
  readonly targets?: Record<string, { readonly dependsOn?: readonly unknown[] } | undefined>;
};

/** The `ledger.json` key of a row: `<project>:<target>`. */
export const shadowRowKey = (row: { readonly project: string; readonly target: string }): string =>
  `${row.project}:${row.target}`;

/** The shadow rows the projects list, and every entry that cannot be one. */
export const shadowRowsOf = (
  projects: ReadonlyArray<{ readonly file: string; readonly config: ProjectConfig }>,
): ShadowRegistry => {
  const rows: ShadowRow[] = [];
  const problems: string[] = [];
  for (const { file, config } of projects) {
    const targets = config.targets ?? {};
    const shadow = targets[shadowTarget];
    if (shadow === undefined) {
      continue;
    }
    if (typeof config.name !== 'string' || config.name === '') {
      problems.push(`${file}: ${shadowTarget} in a project without a name`);
      continue;
    }
    const project = config.name;
    const queued = new Set(targets[queueTarget]?.dependsOn ?? []);
    for (const target of shadow.dependsOn ?? []) {
      if (typeof target !== 'string' || targets[target] === undefined) {
        problems.push(
          `${project}:${shadowTarget} depends on ${JSON.stringify(target)}, which is not a target of ${project}`,
        );
      } else if (queued.has(target)) {
        problems.push(`${project}:${target} is in both ${shadowTarget} and ${queueTarget}`);
      } else {
        rows.push({ project, target, projectFile: file });
      }
    }
  }
  rows.sort((a, b) => shadowRowKey(a).localeCompare(shadowRowKey(b)));
  return { rows, problems };
};

/** Every `project.json` Git tracks under `root`, read into the registry. */
export const readShadowRegistry = async (root: string): Promise<ShadowRegistry> => {
  const files = execFileSync('git', ['ls-files', '-z', '--', ':(glob)**/project.json'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((file) => file !== '')
    .sort();
  const projects: Array<{ file: string; config: ProjectConfig }> = [];
  const problems: string[] = [];
  for (const file of files) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one small file at a time
      projects.push({ file, config: JSON.parse(await readFile(join(root, file), 'utf8')) as ProjectConfig });
    } catch (error) {
      problems.push(`${file}: ${error instanceof SyntaxError ? 'not JSON' : 'not readable'}`);
    }
  }
  const registry = shadowRowsOf(projects);
  return { rows: registry.rows, problems: [...problems, ...registry.problems] };
};

/** One run of a shadow row. */
export type ShadowRunRecord = {
  readonly run: number;
  readonly attempt: number;
  /** When the run completed. */
  readonly at: string;
  readonly passed: boolean;
  /** Test rows of the row in this run. */
  readonly tests: number;
  /** Tests that passed on their recorded retry. */
  readonly retried: number;
  /** The first failing ids (a test id, or a module or unhandled-error row's id). */
  readonly failed: readonly string[];
};

/** A shadow row's count, in `ledger.json` under `shadowRows`. */
export type ShadowRowState = {
  readonly project: string;
  readonly target: string;
  firstSeen: string;
  lastSeen: string;
  /** Runs of the row counted. */
  runs: number;
  /** Consecutive passing runs, up to the newest: the count against {@link shadowBar}. */
  streak: number;
  /** Tests that passed on their recorded retry inside the current streak. */
  streakRetried: number;
  /** The newest failing run. */
  lastFailure?: ShadowRunRecord | undefined;
  /** The newest {@link maximumHistory} runs, oldest first. */
  history: ShadowRunRecord[];
};

/** The run records this call added, by row key. */
export type ShadowCount = ReadonlyArray<{ readonly key: string; readonly record: ShadowRunRecord }>;

/**
 * Count one run attempt's outcome rows into the shadow rows' state (in place). Call it before `ingestRun` records the
 * attempt as ingested: like the ledger, it counts the rows this run executed at this attempt or an earlier one not yet
 * ingested, one run record per attempt, and leaves rows a cache replay restored alone.
 */
export const countShadowRun = (
  state: LedgerState,
  input: { readonly run: IngestRun; readonly rows: readonly OutcomeRow[]; readonly registry: readonly ShadowRow[] },
): ShadowCount => {
  const { run, registry } = input;
  if (registry.length === 0) {
    return [];
  }
  const attempt = run.run_attempt ?? 1;
  const done = new Set(state.ingested.filter((entry) => entry.run === run.id).map((entry) => entry.attempt));
  const wanted = new Set(registry.map((row) => shadowRowKey(row)));
  /* Rows by row key, then by attempt. */
  const grouped = new Map<string, Map<number, OutcomeRow[]>>();
  for (const row of input.rows) {
    const key = `${row.project}:${row.targetKey}`;
    if (
      !wanted.has(key) ||
      row.run !== run.id ||
      row.attempt === undefined ||
      row.attempt > attempt ||
      done.has(row.attempt)
    ) {
      continue;
    }
    const attempts = grouped.get(key) ?? new Map<number, OutcomeRow[]>();
    grouped.set(key, attempts);
    attempts.set(row.attempt, [...(attempts.get(row.attempt) ?? []), row]);
  }
  const counted: Array<{ key: string; record: ShadowRunRecord }> = [];
  state.shadowRows ??= {};
  for (const row of registry) {
    const key = shadowRowKey(row);
    const attempts = grouped.get(key);
    if (!attempts) {
      continue;
    }
    for (const [rowAttempt, rows] of [...attempts.entries()].sort(([a], [b]) => a - b)) {
      const failed = [...new Set(rows.filter((entry) => entry.state === 'failed').map((entry) => entry.id))].sort();
      const record: ShadowRunRecord = {
        run: run.id,
        attempt: rowAttempt,
        at: run.updated_at,
        passed: failed.length === 0,
        tests: rows.filter((entry) => entry.kind === 'test').length,
        retried: rows.filter((entry) => entry.kind === 'test' && entry.state === 'passed' && entry.flaky).length,
        failed: failed.slice(0, maximumFailedIds),
      };
      const current: ShadowRowState = state.shadowRows[key] ?? {
        project: row.project,
        target: row.target,
        firstSeen: record.at,
        lastSeen: record.at,
        runs: 0,
        streak: 0,
        streakRetried: 0,
        history: [],
      };
      state.shadowRows[key] = current;
      current.runs += 1;
      current.lastSeen = record.at > current.lastSeen ? record.at : current.lastSeen;
      if (record.passed) {
        current.streak += 1;
        current.streakRetried += record.retried;
      } else {
        current.streak = 0;
        current.streakRetried = 0;
        current.lastFailure = record;
      }
      current.history = [...current.history, record].slice(-maximumHistory);
      counted.push({ key, record });
    }
  }
  return counted;
};

/** Drop the count of every row that is no longer a shadow row (promoted, or taken out of `test:e2e:shadow`). */
export const retainShadowRows = (state: LedgerState, registry: readonly ShadowRow[]): string[] => {
  if (!state.shadowRows) {
    return [];
  }
  const keep = new Set(registry.map((row) => shadowRowKey(row)));
  const dropped = Object.keys(state.shadowRows).filter((key) => !keep.has(key));
  for (const key of dropped) {
    // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- the state is a record keyed by row
    delete state.shadowRows[key];
  }
  return dropped;
};

/** Whether a row has met Q1's bar. */
export const meetsShadowBar = (row: ShadowRowState): boolean => row.streak >= shadowBar;

/** The streak recounted from the kept history alone: what a reader of `ledger.json` would count by hand. */
export const streakFromHistory = (history: readonly ShadowRunRecord[]): number => {
  const lastFailure = history.findLastIndex((record) => !record.passed);
  return history.length - (lastFailure + 1);
};

const cell = (content: string): string => content.replaceAll('|', String.raw`\|`).replaceAll(/\s+/gu, ' ');

/** The shadow-row section of the ledger's summary and of the promotion job's. */
export const renderShadowMarkdown = (state: LedgerState, registry: ShadowRegistry): string => {
  const lines = ['## Shadow rows (FQ-13)', ''];
  if (registry.rows.length === 0) {
    lines.push(`No project lists a suite in \`${shadowTarget}\`.`, '');
  } else {
    lines.push(
      `A shadow row gates once it passes ${shadowBar} consecutive runs (Q1); the ledger then proposes the promotion as a pull request.`,
      '',
      '| Row | Consecutive passing runs | Retried passes in them | Runs counted | Last failure | Bar met |',
      '| --- | ---: | ---: | ---: | --- | --- |',
    );
    for (const row of registry.rows) {
      const entry = state.shadowRows?.[shadowRowKey(row)];
      const failure = entry?.lastFailure
        ? `run ${entry.lastFailure.run} (${entry.lastFailure.at.slice(0, 10)}): ${entry.lastFailure.failed.join(', ')}`
        : '';
      lines.push(
        `| ${cell(shadowRowKey(row))} | ${entry?.streak ?? 0} | ${entry?.streakRetried ?? 0} | ${entry?.runs ?? 0} | ` +
          `${cell(failure)} | ${entry && meetsShadowBar(entry) ? 'yes' : ''} |`,
      );
    }
    lines.push('');
  }
  if (registry.problems.length > 0) {
    lines.push('Not a shadow row:', '', ...registry.problems.map((problem) => `- ${problem}`), '');
  }
  return lines.join('\n');
};

/* ---------------------------------------------------------------------------------------------------------------- */
/* The promotion edit: a textual change to `project.json` that keeps its formatting.                                 */
/* ---------------------------------------------------------------------------------------------------------------- */

/** Where a value sits in the text, and where its key starts. */
type Span = { readonly keyStart: number; readonly start: number; readonly end: number };

const skipSpace = (text: string, index: number): number => {
  let position = index;
  while (position < text.length && /\s/u.test(text[position] ?? '')) {
    position += 1;
  }
  return position;
};

const stringEnd = (text: string, start: number): number => {
  for (let position = start + 1; position < text.length; position += 1) {
    if (text[position] === '\\') {
      position += 1;
    } else if (text[position] === '"') {
      return position + 1;
    }
  }
  throw new Error('unterminated string');
};

/** The end of the JSON value starting at `start`. */
const valueEnd = (text: string, start: number): number => {
  const first = text[start];
  if (first === '"') {
    return stringEnd(text, start);
  }
  if (first !== '{' && first !== '[') {
    let position = start;
    while (position < text.length && !/[\s,}\]]/u.test(text[position] ?? '')) {
      position += 1;
    }
    return position;
  }
  let depth = 0;
  for (let position = start; position < text.length; position += 1) {
    switch (text[position]) {
      case '"': {
        position = stringEnd(text, position) - 1;
        break;
      }
      case '{':
      case '[': {
        depth += 1;
        break;
      }
      case '}':
      case ']': {
        depth -= 1;
        if (depth === 0) {
          return position + 1;
        }
        break;
      }
      default: {
        break;
      }
    }
  }
  throw new Error('unterminated value');
};

/** The span of the member `key` of the object at `objectStart`, if it has one. */
const memberSpan = (text: string, objectStart: number, key: string): Span | undefined => {
  let position = skipSpace(text, objectStart + 1);
  while (position < text.length && text[position] !== '}') {
    const keyEnd = stringEnd(text, position);
    const name = JSON.parse(text.slice(position, keyEnd)) as string;
    const start = skipSpace(text, skipSpace(text, keyEnd) + 1);
    const end = valueEnd(text, start);
    if (name === key) {
      return { keyStart: position, start, end };
    }
    position = skipSpace(text, end);
    if (text[position] === ',') {
      position = skipSpace(text, position + 1);
    }
  }
  return undefined;
};

/** Code-unit order, as `Array.prototype.sort` without a compare function sorts strings. */
const byCodeUnit = (a: unknown, b: unknown): number => {
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
};

const lineStart = (text: string, index: number): number => text.lastIndexOf('\n', index - 1) + 1;
const indentAt = (text: string, index: number): string =>
  /^[ \t]*/u.exec(text.slice(lineStart(text, index)))?.[0] ?? '';

/** Prettier's JSON layout (oxfmt): an array of strings on one line when it fits in 120 columns, else one a line. */
const formatArray = (
  items: readonly string[],
  line: { readonly indent: string; readonly prefix: string; readonly suffix: string },
): string => {
  const { indent, prefix, suffix } = line;
  const inline = `[${items.map((item) => JSON.stringify(item)).join(', ')}]`;
  if (items.length === 0 || `${indent}${prefix}${inline}${suffix}`.length <= 120) {
    return inline;
  }
  return `[\n${items.map((item) => `${indent}  ${JSON.stringify(item)}`).join(',\n')}\n${indent}]`;
};

/** Replace the `dependsOn` array of target `name` (whose object starts at `objectStart`) with `items`. */
const replaceDependsOn = (text: string, objectStart: number, items: readonly string[]): string => {
  const span = memberSpan(text, objectStart, 'dependsOn');
  if (!span) {
    throw new Error('the target has no dependsOn');
  }
  const suffix = text[skipSpace(text, span.end)] === ',' ? ',' : '';
  const array = formatArray(items, {
    indent: indentAt(text, span.keyStart),
    prefix: text.slice(span.keyStart, span.start),
    suffix,
  });
  return `${text.slice(0, span.start)}${array}${text.slice(span.end)}`;
};

/** The description a `test:e2e:queue` target this edit creates carries, as the existing ones do. */
export const queueDescription =
  "The merge-queue e2e ratchet: the suites of this project that gate the merge queue. ci.yml's e2e-queue lane runs each one as its own job in the merge queue whenever this project is affected, and e2e-nightly.yml leaves every suite listed here out of its matrix. A shadow row (test:e2e:shadow) joins once the flake ledger counts 100 consecutive passing runs (CI flake quarantine blueprint FQ-13), and never moves back. Running this target runs them all.";

/**
 * Move `target` from the `test:e2e:shadow` `dependsOn` of a `project.json` to its `test:e2e:queue` `dependsOn`
 * (created when the project has none), changing only those arrays so the file keeps its layout.
 */
export const promoteProjectJson = (text: string, target: string): string => {
  const config = JSON.parse(text) as ProjectConfig;
  const shadow = (config.targets?.[shadowTarget]?.dependsOn ?? []).filter((entry) => typeof entry === 'string');
  if (!shadow.includes(target)) {
    throw new Error(`${target} is not in ${shadowTarget}`);
  }
  const root = skipSpace(text, 0);
  const targets = memberSpan(text, root, 'targets');
  const shadowSpan = targets ? memberSpan(text, targets.start, shadowTarget) : undefined;
  if (!targets || !shadowSpan) {
    throw new Error(`no ${shadowTarget} target`);
  }
  // The queue first: when it is created it goes before the shadow target, so the shadow span is read again after.
  let edited = text;
  const queueSpan = memberSpan(edited, targets.start, queueTarget);
  if (queueSpan) {
    const queued = (config.targets?.[queueTarget]?.dependsOn ?? []).filter((entry) => typeof entry === 'string');
    edited = replaceDependsOn(edited, queueSpan.start, [...new Set([...queued, target])].sort(byCodeUnit));
  } else {
    const indent = indentAt(edited, shadowSpan.keyStart);
    const inner = `${indent}  `;
    const block = [
      `${JSON.stringify(queueTarget)}: {`,
      `${inner}"executor": "nx:noop",`,
      `${inner}"dependsOn": ${formatArray([target], { indent: inner, prefix: '"dependsOn": ', suffix: ',' })},`,
      `${inner}"metadata": {`,
      `${inner}  "description": ${JSON.stringify(queueDescription)}`,
      `${inner}}`,
      `${indent}},\n${indent}`,
    ].join('\n');
    edited = `${edited.slice(0, shadowSpan.keyStart)}${block}${edited.slice(shadowSpan.keyStart)}`;
  }
  const editedTargets = memberSpan(edited, root, 'targets');
  const editedShadow = editedTargets ? memberSpan(edited, editedTargets.start, shadowTarget) : undefined;
  if (!editedShadow) {
    throw new Error(`no ${shadowTarget} target`);
  }
  edited = replaceDependsOn(
    edited,
    editedShadow.start,
    shadow.filter((entry) => entry !== target),
  );
  // The edit is checked as data: the suite moved, and nothing else changed.
  const before = JSON.parse(text) as { targets: Record<string, { dependsOn?: unknown[] }> };
  const after = JSON.parse(edited) as { targets: Record<string, { dependsOn?: unknown[] }> };
  const expected = structuredClone(before);
  const expectedShadow = expected.targets[shadowTarget];
  if (expectedShadow) {
    expectedShadow.dependsOn = shadow.filter((entry) => entry !== target);
  }
  const expectedQueue = expected.targets[queueTarget];
  if (expectedQueue) {
    expectedQueue.dependsOn = [...new Set([...(expectedQueue.dependsOn ?? []), target])].sort(byCodeUnit);
  } else {
    const created = after.targets[queueTarget];
    if (JSON.stringify(created?.dependsOn) !== JSON.stringify([target])) {
      throw new Error(`the created ${queueTarget} does not list ${target}`);
    }
    // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- compared without the target it created
    delete after.targets[queueTarget];
  }
  if (JSON.stringify(after) !== JSON.stringify(expected)) {
    throw new Error('the promotion edit changed more than the two dependsOn lists');
  }
  return edited;
};
