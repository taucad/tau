/**
 * Quarantine entry: the ledger's offenders that meet D3's entry rule, turned into `quarantine.json` entries (FQ-6 of
 * the CI flake quarantine blueprint, Brain `research/ci-flake-quarantine-blueprint.md`, D3, D5 and D8; testing policy
 * § 16.3 and § 16.4). The pure half; `ci-flake-quarantine-entry-cli.ts` opens the owner issues and the pull request.
 *
 * An identity of the ledger state (`ci-flake-ledger-state.ts`) is an offender when its flake events from gating tasks
 * meet the entry rule (two inside its last 80 executions, or three inside 230); events seen only in a non-gating
 * shadow row (DC-25) never count. Each offender is then, in this order:
 *
 * - **refused as a failure** when its newest execution failed every attempt and has not passed since: a test that
 *   fails every attempt is a failure whatever its history (D1, invariant 2), and the queue is right to catch it;
 * - **refused as a flaky regression** when it ran 300 executions without an event before this burst
 *   (`flake-regression.ts`): FQ-12 takes it to the operator with its culprit, never to quarantine;
 * - **refused** when its project is unknown, or its file is in the never-quarantine set (§ 16.4: it keeps gating, and
 *   its owner issue is still opened so the agent starts at once);
 * - **held** when an entry for the same test is already on `main` or on an open entry branch;
 * - **returned** when its owner issue closed on a release in the last 30 days (FQ-9, D5): it re-enters as the same
 *   entry (that issue, its `created`, `expires` and renewal) and goes to the operator, not the agent; it is refused
 *   when that entry's expiry has passed, and keeps gating;
 * - **refused for the cap** when its project holds 8 entries or the workspace 20, counting open entry branches;
 * - otherwise **admitted**: one entry for the test, narrowed to a browser or an OS when every event in the rule's
 *   window came from one and the test also ran elsewhere, owned by the `flake-ledger.json` owner or the default
 *   owner, for 14 days.
 *
 * The validator (`validate-quarantine.ts`) has the last word: the CLI drops an admitted entry that it rejects.
 */
import { posix } from 'node:path';

import {
  neverQuarantineArea,
  parseQuarantine,
  quarantineBounds,
  quarantineFileName,
  quarantineOperatingSystems,
  splitTest,
} from '@taucad/vitest-ci/quarantine';
import type { QuarantineClass, QuarantineEntry, QuarantineVariant } from '@taucad/vitest-ci/quarantine';

import { entryRule, meetsEntryRule } from '#ci-flake-ledger-state.js';
import type { FlakeEvent, IdentityState, LedgerState } from '#ci-flake-ledger-state.js';
import type { Ledger } from '#ci-flake-ledger.js';
import type { ReturnRecord } from '#ci-flake-quarantine-release.js';
import { identityMarker, isFlakyRegression } from '#flake-regression.js';

/** Who owns an entry when `flake-ledger.json` names nobody (testing policy § 16.3; the operator today). */
export const defaultOwner = 'rifont';
/** Branches the entry job pushes, one per batch; never `flake/*`, which `validate-flake-fix` treats as a fix. */
export const entryBranchPrefix = 'flake-quarantine/';
/** The label of an owner issue; the agent loop (D7) reads open issues that carry it. */
export const flakeLabel = 'flake';
/** The schema every new `quarantine.json` names, relative to the workspace root. */
export const quarantineSchemaPath = 'tools/vitest-ci/quarantine.schema.json';
/** Separator between the project and the test in a ledger identity (`<project> › <file> > … > <title>`). */
const projectSeparator = ' › ';
const dayMilliseconds = 24 * 60 * 60 * 1000;
const timeoutPattern = /\btimed? ?out/i;

/** An Nx project of the workspace: its name, its root relative to the workspace root and its tags. */
export type WorkspaceProject = { readonly name: string; readonly root: string; readonly tags: readonly string[] };

/** A `quarantine.json` as some ref holds it: its workspace-relative path and its text. */
export type QuarantineText = { readonly path: string; readonly text: string };

/** An identity that meets the entry rule, with the events of the rule's widest window. */
export type Offender = {
  readonly id: string;
  readonly identity: IdentityState;
  /** `<file> > <suite> > … > <title>`: the entry's `test`. */
  readonly test: string;
  readonly events: readonly FlakeEvent[];
};

/** An offender that becomes an entry. */
export type PlannedEntry = Offender & {
  readonly project: WorkspaceProject;
  /** The `quarantine.json` it goes into. */
  readonly path: string;
  /** Its entry; `issue` is 0 until the CLI opens or links the owner issue. */
  readonly entry: QuarantineEntry;
  /** The owner issue `flake-ledger.json` already names for it. */
  readonly linkedIssue?: number | undefined;
  /** The release it returned after, within 30 days: the entry is that one, and the operator takes it. */
  readonly returned?: ReturnRecord | undefined;
};

export type RefusalKind =
  | 'shadow'
  | 'failing'
  | 'flaky-regression'
  | 'no-project'
  | 'never-quarantine'
  | 'cap'
  | 'returned'
  | 'invalid';

/** An offender that does not become an entry, and why. */
export type Refusal = Offender & {
  readonly kind: RefusalKind;
  readonly reason: string;
  readonly project?: WorkspaceProject | undefined;
  readonly linkedIssue?: number | undefined;
  readonly returned?: ReturnRecord | undefined;
};

export type EntryPlan = {
  readonly admitted: readonly PlannedEntry[];
  readonly refused: readonly Refusal[];
  /** Offenders already quarantined on `main` or on an open entry branch. */
  readonly held: readonly string[];
};

export type PlanInput = {
  readonly state: LedgerState;
  /** The workspace's projects by name. */
  readonly projects: ReadonlyMap<string, WorkspaceProject>;
  /** Every `quarantine.json` on `main`. */
  readonly quarantines: readonly QuarantineText[];
  /** Every `quarantine.json` an open entry branch changes, at the branch's head. */
  readonly pending: readonly QuarantineText[];
  /** `flake-ledger.json`: owners, and owner issues named in a note (`taucad/tau#<n>`). */
  readonly owners?: Ledger | undefined;
  /** `YYYY-MM-DD` (UTC). */
  readonly today: string;
  readonly owner?: string | undefined;
  /** Registered shadow-row targets (`<project>:<target>`): their tests' events never count. */
  readonly shadowTargets?: ShadowTargets | undefined;
  /** Releases of the last 30 days by {@link returnKey} (identity hash and variant): a return is the same entry (FQ-9). */
  readonly returns?: ReadonlyMap<string, ReturnRecord> | undefined;
};

/** The widest window of the entry rule: its events are the evidence. */
const evidenceWindow = Math.max(...entryRule.map((rule) => rule.executions));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Shadow-row targets as `<project>:<target>` (FQ-13's registry, `readShadowRegistry`). */
export type ShadowTargets = ReadonlySet<string>;

const noShadowTargets: ShadowTargets = new Set();

/**
 * The events that count toward the entry rule: those of gating tasks, never of a non-gating shadow row (DC-25). An
 * event the ingestion marked `shadow` never counts; neither does any event of a test whose target is a registered
 * shadow row (shadow families hold spec files no gating suite runs), which covers events recorded before the marker.
 */
const gatingEvents = (identity: IdentityState, shadowTargets: ShadowTargets): FlakeEvent[] =>
  shadowTargets.has(`${identity.project}:${identity.targetKey}`)
    ? []
    : identity.events.filter((event) => event.shadow !== true);

/** Whether an identity's gating events meet the entry rule. */
export const meetsGatingEntryRule = (identity: IdentityState, shadowTargets = noShadowTargets): boolean => {
  const events = gatingEvents(identity, shadowTargets);
  return entryRule.some(
    (rule) => events.filter((event) => event.execution > identity.executions - rule.executions).length >= rule.events,
  );
};

const offender = (id: string, identity: IdentityState, shadowTargets: ShadowTargets): Offender => {
  const separator = id.indexOf(projectSeparator);
  return {
    id,
    identity,
    test: separator === -1 ? id : id.slice(separator + projectSeparator.length),
    events: gatingEvents(identity, shadowTargets).filter(
      (event) => event.execution > identity.executions - evidenceWindow,
    ),
  };
};

const byEvents = (a: Offender, b: Offender): number =>
  b.events.length - a.events.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Every identity whose gating events meet the entry rule, most events in the window first. Events seen only in a
 * shadow row do not count: the test is already non-gating there, and an entry would only spend the caps.
 */
export const offenders = (state: LedgerState, shadowTargets = noShadowTargets): Offender[] =>
  Object.entries(state.identities)
    .filter(([, identity]) => meetsGatingEntryRule(identity, shadowTargets))
    .map(([id, identity]) => offender(id, identity, shadowTargets))
    .sort(byEvents);

/** Identities that meet the entry rule only by counting their shadow-row events. */
export const shadowOnlyOffenders = (state: LedgerState, shadowTargets = noShadowTargets): Offender[] =>
  Object.entries(state.identities)
    .filter(([, identity]) => meetsEntryRule(identity) && !meetsGatingEntryRule(identity, shadowTargets))
    .map(([id, identity]) => ({ ...offender(id, identity, noShadowTargets), events: identity.events }))
    .sort(byEvents);

/**
 * Whether the identity's newest execution failed every attempt, paired or not: a failure on a hash that passed before
 * is a flake event, but the test is still failing now, not flaking. A state written before `lastOutcome` falls back to
 * an unpaired newest failure.
 */
export const failsEveryAttempt = (identity: IdentityState): boolean =>
  identity.lastOutcome === undefined
    ? identity.openFailures.some((failure) => failure.execution === identity.executions)
    : identity.lastOutcome === 'failed';

/** A ledger variant key (`linux-x64 browser=firefox`) as the parts an entry may narrow by. */
const variantParts = (key: string): { os: string; browser: string | undefined } => {
  const [platform = '', ...rest] = key.split(' ');
  const browser = rest.find((part) => part.startsWith('browser='))?.slice('browser='.length);
  return { os: platform.split('-')[0] ?? '', browser };
};

/**
 * The variant an entry narrows to: a browser or an OS when every event came from one and the test also ran on
 * another (D2: a test that flakes on Firefox keeps gating on Chromium); otherwise none.
 */
export const narrowVariant = (
  identity: IdentityState,
  events: readonly FlakeEvent[],
): QuarantineVariant | undefined => {
  const flaked = events.map((event) => variantParts(event.variant));
  const ran = Object.entries(identity.variants)
    .filter(([, state]) => state.executions > 0)
    .map(([key]) => variantParts(key));
  const variant: QuarantineVariant = {};
  const browsers = new Set(flaked.map((part) => part.browser));
  const [browser] = browsers;
  if (browsers.size === 1 && browser !== undefined && ran.some((part) => part.browser !== browser)) {
    variant.browser = browser;
  }
  const systems = new Set(flaked.map((part) => part.os));
  const [os] = systems;
  if (
    systems.size === 1 &&
    (quarantineOperatingSystems as readonly string[]).includes(os ?? '') &&
    ran.some((part) => part.os !== os)
  ) {
    variant.os = os as QuarantineVariant['os'];
  }
  return Object.keys(variant).length > 0 ? variant : undefined;
};

/** The class an entry starts with, before the agent classifies it (D4): a timeout is a timing budget. */
export const initialClass = (events: readonly FlakeEvent[]): QuarantineClass =>
  events.some((event) => timeoutPattern.test(event.error ?? '')) ? 'timing-budget' : 'unreproduced';

/** The evidence line: counts by kind and the runs that flaked. */
export const evidenceLine = (offender: Offender): string => {
  const kinds = new Map<string, number>();
  for (const event of offender.events) {
    kinds.set(event.kind, (kinds.get(event.kind) ?? 0) + 1);
  }
  const runs = [...new Set(offender.events.map((event) => event.run))];
  const executions = Math.min(offender.identity.executions, evidenceWindow);
  return (
    `${offender.events.length} flake events (${[...kinds].map(([kind, count]) => `${kind} ${count}`).join(', ')}) ` +
    `in its last ${executions} executions; runs ${runs.slice(0, 10).join(', ')}${runs.length > 10 ? ', …' : ''}`
  );
};

/** `YYYY-MM-DD` plus `days`. */
export const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * dayMilliseconds).toISOString().slice(0, 10);

/** The owner and owner issue `flake-ledger.json` gives a test, by its identity or its test. */
const ownership = (owners: Ledger | undefined, offender: Offender): { owner?: string; issue?: number } => {
  const entry = owners?.entries.find((candidate) => candidate.key === offender.id || candidate.key === offender.test);
  if (!entry) {
    return {};
  }
  const issue = /\btaucad\/tau#(\d+)\b/u.exec(entry.note)?.[1];
  return { owner: entry.owner, ...(issue ? { issue: Number(issue) } : {}) };
};

/** The `quarantine.json` of a project root. */
export const quarantinePath = (root: string): string =>
  root === '' ? quarantineFileName : `${root}/${quarantineFileName}`;

/**
 * The entries a file holds, as `[test, browser, os, target]` keys; a malformed file holds none. With `today`, an
 * entry that has expired holds nothing: an unmerged proposal past its expiry reserves no capacity.
 */
const rawKeys = (text: string, today?: string): Array<{ key: string; test: string }> =>
  parseQuarantine(text).entries.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry['test'] !== 'string') {
      return [];
    }
    if (today !== undefined && typeof entry['expires'] === 'string' && entry['expires'] < today) {
      return [];
    }
    const variant = isRecord(entry['variant']) ? entry['variant'] : {};
    return [
      {
        key: JSON.stringify([
          entry['test'],
          variant['browser'] ?? null,
          variant['os'] ?? null,
          variant['target'] ?? null,
        ]),
        test: entry['test'],
      },
    ];
  });

/** The key of a return: the identity's hash and the entry's variant, so two variant entries of a test stay apart. */
export const returnKey = (identity: string, variant: QuarantineVariant | undefined): string =>
  `${identity} ${JSON.stringify([variant?.browser ?? null, variant?.os ?? null, variant?.target ?? null])}`;

/** The hash of an identity's `flake-identity` marker: the key of {@link PlanInput.returns}. */
export const identityHashOf = (id: string): string => /flake-identity: ([\da-f]+)/u.exec(identityMarker(id))?.[1] ?? '';

/** Decide which offenders become entries. Pure: the CLI does the reading and the writing. */
export const planEntries = (input: PlanInput): EntryPlan => {
  const occupied = new Map<string, Set<string>>();
  const heldTests = new Map<string, Set<string>>();
  const files = [
    ...input.quarantines.map((file) => ({ file, today: undefined })),
    ...input.pending.map((file) => ({ file, today: input.today })),
  ];
  for (const { file, today } of files) {
    for (const { key, test } of rawKeys(file.text, today)) {
      occupied.set(file.path, (occupied.get(file.path) ?? new Set()).add(key));
      heldTests.set(file.path, (heldTests.get(file.path) ?? new Set()).add(test));
    }
  }
  let total = [...occupied.values()].reduce((sum, keys) => sum + keys.size, 0);
  const admitted: PlannedEntry[] = [];
  const refused: Refusal[] = [];
  const held: string[] = [];
  for (const shadow of shadowOnlyOffenders(input.state, input.shadowTargets)) {
    refused.push({
      ...shadow,
      kind: 'shadow',
      reason: 'its flake events that meet the entry rule come from non-gating shadow rows: it gates nothing there',
      project: input.projects.get(shadow.identity.project),
    });
  }
  for (const offender of offenders(input.state, input.shadowTargets)) {
    const project = input.projects.get(offender.identity.project);
    const { owner, issue: namedIssue } = ownership(input.owners, offender);
    // A return is the same entry in the same variant: the variant this offender would be narrowed to.
    const variant = narrowVariant(offender.identity, offender.events);
    const returned = input.returns?.get(returnKey(identityHashOf(offender.id), variant));
    const issue = returned?.issue ?? namedIssue;
    const refuse = (kind: RefusalKind, reason: string): void => {
      refused.push({ ...offender, kind, reason, project, linkedIssue: issue, ...(returned ? { returned } : {}) });
    };
    if (failsEveryAttempt(offender.identity)) {
      refuse(
        'failing',
        'its newest execution failed every attempt and nothing has passed since: a failure, not a flake (D1, invariant 2)',
      );
      continue;
    }
    if (isFlakyRegression(offender.identity)) {
      refuse(
        'flaky-regression',
        'stable for 300 executions before this burst: a flaky regression goes to the operator with its culprit (FQ-12), never to quarantine',
      );
      continue;
    }
    const split = splitTest(offender.test);
    if (project === undefined || split === undefined || split.file !== offender.identity.file) {
      refuse('no-project', `no Nx project named ${offender.identity.project} owns ${offender.test}`);
      continue;
    }
    const area = neverQuarantineArea(posix.join(project.root, split.file), project.tags);
    if (area !== undefined) {
      refuse('never-quarantine', `in the never-quarantine set (${area}): it keeps gating (testing policy § 16.4)`);
      continue;
    }
    const path = quarantinePath(project.root);
    if (heldTests.get(path)?.has(offender.test)) {
      held.push(offender.id);
      continue;
    }
    if (returned && returned.expires < input.today) {
      refuse(
        'returned',
        `returned within 30 days of its release on ${returned.released}, so it is the same entry, which expired on ${returned.expires}: it keeps gating and goes to the operator`,
      );
      continue;
    }
    const inProject = occupied.get(path)?.size ?? 0;
    if (inProject >= quarantineBounds.projectEntries) {
      refuse('cap', `${path} holds ${inProject} entries, the most a project may (no new quarantine: fix one first)`);
      continue;
    }
    if (total >= quarantineBounds.workspaceEntries) {
      refuse('cap', `the workspace holds ${total} entries, the most it may: the quarantine debt is full`);
      continue;
    }
    const entry: QuarantineEntry = {
      test: offender.test,
      ...(variant ? { variant } : {}),
      owner: owner ?? input.owner ?? defaultOwner,
      issue: issue ?? 0,
      class: initialClass(offender.events),
      created: returned?.created ?? input.today,
      expires: returned?.expires ?? addDays(input.today, quarantineBounds.maximumAgeDays),
      ...(returned?.renewal ? { renewal: returned.renewal } : {}),
      evidence: `${returned ? `returned within 30 days of its release on ${returned.released}; ` : ''}${evidenceLine(offender)}`,
    };
    const key = JSON.stringify([entry.test, variant?.browser ?? null, variant?.os ?? null, variant?.target ?? null]);
    occupied.set(path, (occupied.get(path) ?? new Set()).add(key));
    heldTests.set(path, (heldTests.get(path) ?? new Set()).add(entry.test));
    total += 1;
    admitted.push({ ...offender, project, path, entry, linkedIssue: issue, ...(returned ? { returned } : {}) });
  }
  return { admitted, refused, held };
};

/** A `quarantine.json` with entries added: the existing file kept as it is, or a new one naming the schema. */
export const renderQuarantine = (path: string, text: string | undefined, add: readonly QuarantineEntry[]): string => {
  const directory = posix.dirname(path);
  const file: Record<string, unknown> =
    text === undefined
      ? { $schema: posix.relative(directory === '.' ? '' : directory, quarantineSchemaPath), entries: [] }
      : (JSON.parse(text) as Record<string, unknown>);
  const entries = Array.isArray(file['entries']) ? (file['entries'] as unknown[]) : [];
  return `${JSON.stringify({ ...file, entries: [...entries, ...add] }, undefined, 2)}\n`;
};

/** Text from test output or test titles, made inert in Markdown: one line, no backticks, no mention. */
const inert = (content: string, limit = 300): string => {
  const line = content.replaceAll(/\s+/gu, ' ').replaceAll('`', "'").trim();
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
};

const code = (content: string, limit?: number): string => `\`${inert(content, limit)}\``;

/** A table cell: GitHub splits a row at every unescaped pipe, even inside a code span. */
const cell = (content: string): string => content.replaceAll('|', String.raw`\|`);

const runLink = (repository: string, run: number): string =>
  `[${run}](https://github.com/${repository}/actions/runs/${run})`;

/** The owner issue's title. */
export const issueTitle = (offender: Offender): string => inert(`Flaky test: ${offender.id}`, 240);

/** The owner issue's body: the identity, the events and what happens next. */
export const issueBody = (
  offender: Offender,
  context: { readonly repository: string; readonly entry?: QuarantineEntry | undefined; readonly refusal?: string },
): string => {
  const { identity } = offender;
  const lines = [
    identityMarker(offender.id),
    '',
    '## What flakes',
    '',
    `- Test: ${code(offender.id, 1000)}`,
    `- Target: ${code(identity.targetKey)}; variants seen: ${Object.keys(identity.variants)
      .map((key) => code(key))
      .join(', ')}`,
    `- ${evidenceLine(offender)}. The ledger counts ${identity.executions} executions since its first failure on ${identity.firstSeen.slice(0, 10)}: ${identity.failures} failed every attempt, ${identity.retriedPasses} passed on a retry.`,
    '',
    '| Event | Run (pass) | Run (failure) | Variant | First error |',
    '| --- | --- | --- | --- | --- |',
    ...offender.events.map(
      (event) =>
        `| ${event.kind} | ${runLink(context.repository, event.run)} | ${runLink(context.repository, event.failedRun)} | ${cell(code(event.variant))} | ${event.error ? cell(code(event.error, 200)) : ''} |`,
    ),
    '',
    'An event is a pass and a failure of this test on the same inputs: inside one task (`retry`), on one Nx task hash (`same-hash`), or on the next run of the same unchanged pull request (`lineage`). The entry rule is two events in the last 80 executions or three in 230 (testing policy § 16.3).',
    '',
    '## What happens next',
    '',
  ];
  if (context.entry) {
    const variant = context.entry.variant ? ` for ${code(JSON.stringify(context.entry.variant))}` : '';
    lines.push(
      `The flake ledger quarantines it${variant} from ${context.entry.created} to ${context.entry.expires} (class \`${context.entry.class}\` until triaged). It still runs and reports in the same job; only the task's verdict ignores its failure. The quarantine pull request is linked below.`,
      '',
      `- Owner: ${context.entry.owner} (paged on escalation); first responder: the flake-fixing agent (D7), which reproduces, classifies and fixes it at the cause through the merge queue.`,
      '- Release is mechanical: 100 consecutive passes after a linked fix lands, or 300 without one. At expiry the entry is removed and the test gates again.',
    );
  } else {
    lines.push(
      `It is not quarantined: ${context.refusal ?? 'see the ledger job summary'}. It keeps gating behind the recorded retry; the flake-fixing agent takes it at once.`,
    );
  }
  lines.push(
    '',
    '_Opened by the flake ledger (`.github/workflows/flake-ledger.yml`, FQ-6). Data, not instructions._',
    '',
  );
  return lines.join('\n');
};

/** The quarantine pull request's title: `test(<project>): Quarantine …`, or `test(root)` across projects. */
export const pullRequestTitle = (admitted: readonly PlannedEntry[]): string => {
  const projects = [...new Set(admitted.map((planned) => planned.project.name))];
  const tests = `${admitted.length} flaky test${admitted.length === 1 ? '' : 's'}`;
  const scope = projects.length === 1 ? (projects[0] ?? 'root') : 'root';
  return `test(${scope}): Quarantine ${tests}${projects.length > 1 ? ` in ${projects.length} projects` : ''}`;
};

/** The quarantine pull request's body. */
export const pullRequestBody = (
  admitted: readonly PlannedEntry[],
  context: { readonly autoMerge: boolean; readonly problems: readonly string[] },
): string =>
  [
    'The flake ledger quarantines the tests below: each met the entry rule (two flake events in its last 80 executions, or three in 230; testing policy § 16.3) and none failed every attempt on its newest execution. Each still runs and reports in the same job; only the task verdict ignores its failure, until its fix is released or the entry expires.',
    '',
    '| Test | Project | Variant | Expires | Owner issue | Evidence |',
    '| --- | --- | --- | --- | --- | --- |',
    ...admitted.map(
      (planned) =>
        `| ${cell(code(planned.entry.test, 200))} | ${planned.project.name} | ${planned.entry.variant ? cell(code(JSON.stringify(planned.entry.variant))) : 'all'} | ${planned.entry.expires} | #${planned.entry.issue} | ${cell(inert(planned.entry.evidence, 200))} |`,
    ),
    '',
    context.autoMerge
      ? 'Touches only `quarantine.json` files and passes `validate-quarantine` on the tree it proposes, so it is eligible to land through the merge queue without a person (blueprint O2): the job requests squash auto-merge after opening it, and reports whether GitHub accepted on the owner issues and in its summary.'
      : `Auto-merge is off: ${context.problems.length > 0 ? `\`validate-quarantine\` reports problems on the proposed tree:\n\n${context.problems.map((problem) => `- ${inert(problem)}`).join('\n')}` : 'the change touches more than `quarantine.json` files'}.`,
    '',
    '_Opened by the flake ledger (`.github/workflows/flake-ledger.yml`, FQ-6)._',
    '',
  ].join('\n');

/** The plan as a job-summary section. */
export const renderPlanMarkdown = (plan: EntryPlan, outcome: readonly string[]): string => {
  const lines = ['## Quarantine entry (FQ-6)', ''];
  lines.push(
    `${plan.admitted.length} admitted, ${plan.refused.length} refused, ${plan.held.length} already quarantined or pending.`,
    '',
  );
  for (const planned of plan.admitted) {
    lines.push(`- Admitted: ${code(planned.id, 200)} into \`${planned.path}\` (${inert(planned.entry.evidence, 200)})`);
  }
  for (const refusal of plan.refused) {
    lines.push(`- Refused (${refusal.kind}): ${code(refusal.id, 200)}: ${inert(refusal.reason)}`);
  }
  for (const id of plan.held) {
    lines.push(`- Held: ${code(id, 200)}`);
  }
  lines.push(...(outcome.length > 0 ? ['', ...outcome.map((line) => `- ${line}`)] : []), '');
  return lines.join('\n');
};
