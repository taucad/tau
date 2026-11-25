/**
 * The per-project `quarantine.json`: its schema, its bounds, the never-quarantine set and the entry rules that both
 * the reporter's verdict and `validate-quarantine` apply (testing policy § 16.3 and § 16.4).
 *
 * A project's `quarantine.json` sits at its root, beside its `project.json` or `package.json`. Each entry names one
 * test, optionally narrowed to a browser, an OS or a target, and never a file, a suite or a project. A quarantined test
 * still runs and reports; only the task's verdict ignores its failure (`QuarantineVerdict`).
 *
 * Every Vitest config imports this module through `testReporters`, so it imports nothing but `node:` modules.
 */

/** File name of a project's quarantine, at the project root. @public */
export const quarantineFileName = 'quarantine.json';

/**
 * The operator's bounds (blueprint O3, testing policy § 16.3).
 *
 * @public
 */
export const quarantineBounds = {
  /** Entries across the workspace; a twenty-first fails validation. */
  workspaceEntries: 20,
  /** Entries in one project's `quarantine.json`. */
  projectEntries: 8,
  /** Days from `created` to `expires` without a renewal. */
  maximumAgeDays: 14,
  /** Days from `created` to `expires` after the one operator renewal. */
  maximumRenewedAgeDays: 28,
} as const;

/**
 * Flake classes an entry may carry (blueprint D4); the classes that never quarantine (infrastructure, deterministic
 * regression, merged-tree contract failure) are not among them.
 *
 * @public
 */
export const quarantineClasses = [
  'race',
  'timing-budget',
  'order-dependence',
  'resource',
  'product-race',
  'flaky-regression',
  'unreproduced',
] as const;

/** A flake class an entry may carry. @public */
export type QuarantineClass = (typeof quarantineClasses)[number];

/** Operating systems a variant may name, as Node's `process.platform` reports them. @public */
export const quarantineOperatingSystems = ['linux', 'darwin', 'win32'] as const;

/**
 * The variant an entry may be narrowed to. Every key is optional; an absent key matches any value. A file, a suite or
 * a project is never a variant.
 *
 * @public
 */
export type QuarantineVariant = {
  /** The Vitest Browser instance (`chromium`, `firefox`, `webkit`). */
  browser?: string;
  /** The runner OS. */
  os?: (typeof quarantineOperatingSystems)[number];
  /** The Nx target, without a `:shard-<n>` suffix (`test`, `test:e2e:deploy-skew`). */
  target?: string;
};

/**
 * The operator renewal: once, by a human, to 28 days in all.
 *
 * @public
 */
export type QuarantineRenewal = {
  /** GitHub login of the operator who renewed it. */
  by: string;
  /** Day of the renewal, `YYYY-MM-DD`. */
  on: string;
};

/**
 * One quarantined test.
 *
 * @public
 */
export type QuarantineEntry = {
  /** `<file relative to the project root> > <suite> > … > <title>`: the outcome row's `file > name`. */
  test: string;
  /** Narrows the entry to one browser, OS or target. */
  variant?: QuarantineVariant;
  /** GitHub login of the human owner, without `@`. */
  owner: string;
  /** The owner issue on taucad/tau. */
  issue: number;
  /** The flake class (blueprint D4). */
  class: QuarantineClass;
  /** Day the entry was made, `YYYY-MM-DD` (UTC). */
  created: string;
  /** Last day the entry holds, `YYYY-MM-DD` (UTC); the test gates again the day after. */
  // oxlint-disable-next-line tau-lint/no-bare-time-identifier -- The operator-approved quarantine.json field name.
  expires: string;
  /** The one operator renewal, when there was one. */
  renewal?: QuarantineRenewal;
  /** The flake events that put it here: counts and run ids. */
  evidence: string;
};

/** The shape of a `quarantine.json`. @public */
export type QuarantineFile = {
  $schema?: string;
  entries: QuarantineEntry[];
};

/** Where an entry's test lives: the project's root relative to the workspace and its Nx tags. @public */
export type QuarantineContext = {
  /** Project root relative to the workspace root, POSIX separators, `''` for the root. */
  projectRoot: string;
  /** The project's Nx tags, when known. */
  tags?: readonly string[];
};

/**
 * The never-quarantine set (testing policy § 16.4, blueprint O5 = B): tests for money, data integrity, security
 * boundaries and the formal models. Each pattern matches the test file's workspace-relative path; the blueprint's
 * history pass (`a5_history.py`) used the same words. A word matches only as a whole path word, so `auth` does not
 * match `author`.
 *
 * @public
 */
export const neverQuarantinePatterns: ReadonlyArray<{ readonly area: string; readonly pattern: RegExp }> = [
  {
    area: 'money (billing)',
    pattern: /(?<![a-z])(?:billing|stripe|payments?|credits?|invoices?|tariffs?|ledgers?)(?![a-z])/i,
  },
  { area: 'data integrity', pattern: /(?<![a-z])(?:integrity|checksums?|object-store|migrations?|lfs)(?![a-z])/i },
  {
    area: 'security boundary',
    pattern:
      /(?<![a-z])(?:auth|security|sandbox|seccomp|privacy|permissions?|csrf|secrets?|crypto|signatures?)(?![a-z])/i,
  },
  {
    area: 'formal model',
    pattern:
      /(?:^|\/)specs\/|(?:^|\/)tools\/formal\/|[.-](?:conformance|differential)\.test\.|(?<![a-z])(?:formal|oracle|tla|lean)(?![a-z])/i,
  },
];

/**
 * Project tags whose every test is in the never-quarantine set.
 *
 * @public
 */
export const neverQuarantineTags: Readonly<Record<string, string>> = {
  'api:billing': 'money (billing)',
  'ui:billing-ui': 'money (billing)',
  'api:auth': 'security boundary',
};

/**
 * The never-quarantine area of a test file, if any.
 *
 * @param path - The test file relative to the workspace root.
 * @param tags - The owning project's Nx tags.
 * @returns The area's name, or `undefined` when the test may be quarantined.
 * @public
 */
export const neverQuarantineArea = (path: string, tags: readonly string[] = []): string | undefined => {
  for (const tag of tags) {
    const area = neverQuarantineTags[tag];
    if (area !== undefined) {
      return area;
    }
  }
  return neverQuarantinePatterns.find(({ pattern }) => pattern.test(path))?.area;
};

/** Separator between the file, the suites and the title of a test identity. @public */
export const testSeparator = ' > ';

/**
 * Splits an entry's `test` into its file and its full name.
 *
 * @param test - `<file> > <suite> > … > <title>`.
 * @returns The file and the full name, or `undefined` when either is missing.
 * @public
 */
export const splitTest = (test: string): { file: string; name: string } | undefined => {
  const index = test.indexOf(testSeparator);
  if (index <= 0) {
    return undefined;
  }
  const file = test.slice(0, index);
  const name = test.slice(index + testSeparator.length);
  return name.trim() === '' ? undefined : { file, name };
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const loginPattern = /^[\dA-Za-z](?:[\dA-Za-z]|-(?=[\dA-Za-z])){0,38}$/;
const entryKeys = new Set(['test', 'variant', 'owner', 'issue', 'class', 'created', 'expires', 'renewal', 'evidence']);
const variantKeys = new Set(['browser', 'os', 'target']);
const renewalKeys = new Set(['by', 'on']);
/** Milliseconds in a day. */
const dayDuration = 86_400_000;

/**
 * Days since the epoch of a `YYYY-MM-DD` day, or `undefined` when it is not a real calendar day.
 *
 * @param day - `YYYY-MM-DD`.
 * @returns Whole days since 1970-01-01 (UTC).
 * @public
 */
export const dayNumber = (day: unknown): number | undefined => {
  if (typeof day !== 'string' || !datePattern.test(day)) {
    return undefined;
  }
  const time = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== day) {
    return undefined;
  }
  return time / dayDuration;
};

/**
 * Today as `YYYY-MM-DD` (UTC).
 *
 * @param now - The clock. Defaults to the current time.
 * @returns The UTC day.
 * @public
 */
export const utcDay = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

const unknownKeys = (value: Record<string, unknown>, allowed: ReadonlySet<string>): string[] =>
  Object.keys(value).filter((key) => !allowed.has(key));

/**
 * Parses a `quarantine.json`. The file is all-or-nothing in shape: a malformed top level honours no entry.
 *
 * @param text - The file's text.
 * @returns The raw entries and the problems with the top level.
 * @public
 */
export const parseQuarantine = (text: string): { entries: unknown[]; problems: string[] } => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { entries: [], problems: [`not JSON: ${(error as SyntaxError).message}`] };
  }
  if (!isRecord(value) || !Array.isArray(value['entries'])) {
    return { entries: [], problems: ['the top level must be an object with an "entries" array'] };
  }
  const extra = unknownKeys(value, new Set(['$schema', 'entries']));
  if (extra.length > 0) {
    return { entries: [], problems: [`unknown top-level keys: ${extra.join(', ')}`] };
  }
  return { entries: value['entries'], problems: [] };
};

const variantProblems = (variant: unknown): string[] => {
  if (variant === undefined) {
    return [];
  }
  if (!isRecord(variant)) {
    return ['"variant" must be an object of browser, os and target'];
  }
  const problems: string[] = [];
  const extra = unknownKeys(variant, variantKeys);
  if (extra.length > 0) {
    problems.push(
      `"variant" may narrow only by browser, os or target, never ${extra.join(', ')} (a file, a suite or a project is never a variant)`,
    );
  }
  if (Object.keys(variant).length === 0) {
    problems.push('"variant" is empty; leave it out to quarantine every variant');
  }
  for (const key of ['browser', 'target'] as const) {
    if (key in variant && !nonEmptyString(variant[key])) {
      problems.push(`"variant.${key}" must be a non-empty string`);
    }
  }
  if (typeof variant['target'] === 'string' && /:shard-\d+$/.test(variant['target'])) {
    problems.push('"variant.target" names the target without its :shard-<n> suffix');
  }
  if ('os' in variant && !(quarantineOperatingSystems as readonly unknown[]).includes(variant['os'])) {
    problems.push(`"variant.os" must be one of ${quarantineOperatingSystems.join(', ')}`);
  }
  return problems;
};

/** Problems with the one operator renewal; `renewed` is `true` when the entry carries one. */
const renewalProblems = (
  renewal: unknown,
  createdDay: number | undefined,
  todayNumber: number,
): { renewed: boolean; problems: string[] } => {
  if (renewal === undefined) {
    return { renewed: false, problems: [] };
  }
  if (!isRecord(renewal)) {
    return { renewed: false, problems: ['"renewal" must be an object { by, on }'] };
  }
  const problems: string[] = [];
  const extra = unknownKeys(renewal, renewalKeys);
  if (extra.length > 0) {
    problems.push(`unknown "renewal" keys: ${extra.join(', ')}`);
  }
  if (typeof renewal['by'] !== 'string' || !loginPattern.test(renewal['by'])) {
    problems.push('"renewal.by" must be the renewing operator\'s GitHub login, without "@"');
  }
  const renewedDay = dayNumber(renewal['on']);
  if (renewedDay === undefined) {
    problems.push('"renewal.on" must be a calendar day, YYYY-MM-DD');
  } else if ((createdDay !== undefined && renewedDay < createdDay) || renewedDay > todayNumber) {
    problems.push('"renewal.on" must fall between "created" and today');
  }
  return { renewed: true, problems };
};

/** Problems with an entry's age (its `expires` against its `created`) and with its expiry against today. */
const ageProblems = (days: {
  expiryText: unknown;
  createdDay: number;
  expiryDay: number;
  todayNumber: number;
  renewed: boolean;
}): string[] => {
  const { createdDay, expiryDay, todayNumber, renewed } = days;
  const problems: string[] = [];
  const age = expiryDay - createdDay;
  const limit = renewed ? quarantineBounds.maximumRenewedAgeDays : quarantineBounds.maximumAgeDays;
  if (age < 1) {
    problems.push('"expires" must be after "created"');
  } else if (age > limit) {
    problems.push(
      renewed
        ? `"expires" is ${age} days after "created"; one renewal allows ${limit} in all, and a second renewal is not allowed`
        : `"expires" is ${age} days after "created"; an entry holds at most ${limit} days without the one operator renewal`,
    );
  }
  if (todayNumber > expiryDay) {
    problems.push(`expired on ${String(days.expiryText)}: the test gates again; remove the entry`);
  }
  return problems;
};

const datesProblems = (entry: Record<string, unknown>, today: string): string[] => {
  const problems: string[] = [];
  const createdDay = dayNumber(entry['created']);
  const expiryDay = dayNumber(entry['expires']);
  const todayNumber = dayNumber(today) ?? Math.floor(Date.now() / dayDuration);
  if (createdDay === undefined) {
    problems.push('"created" must be a calendar day, YYYY-MM-DD');
  } else if (createdDay > todayNumber) {
    problems.push(`"created" (${String(entry['created'])}) is in the future`);
  }
  if (expiryDay === undefined) {
    problems.push('"expires" must be a calendar day, YYYY-MM-DD');
  }
  const renewal = renewalProblems(entry['renewal'], createdDay, todayNumber);
  problems.push(...renewal.problems);
  if (createdDay !== undefined && expiryDay !== undefined) {
    problems.push(
      ...ageProblems({ expiryText: entry['expires'], createdDay, expiryDay, todayNumber, renewed: renewal.renewed }),
    );
  }
  return problems;
};

/**
 * Every rule an entry must meet on its own: the schema, the dates, the bounds of § 16.3 and the never-quarantine
 * set. A rule that needs the repository (the test exists, the caps) belongs to `validate-quarantine`.
 *
 * @param entry - One raw entry from `parseQuarantine`.
 * @param context - The owning project's root and tags.
 * @param today - `YYYY-MM-DD` (UTC).
 * @returns The entry's problems; empty when the entry is valid today.
 * @public
 */
export const entryProblems = (entry: unknown, context: QuarantineContext, today: string): string[] => {
  if (!isRecord(entry)) {
    return ['an entry must be an object'];
  }
  const problems: string[] = [];
  const extra = unknownKeys(entry, entryKeys);
  if (extra.length > 0) {
    problems.push(`unknown keys: ${extra.join(', ')}`);
  }
  const test = typeof entry['test'] === 'string' ? splitTest(entry['test']) : undefined;
  if (test === undefined) {
    problems.push('"test" must be "<file> > <suite> > … > <title>": one test, never a file');
  } else {
    if (test.file.startsWith('/') || test.file.startsWith('./') || test.file.split('/').includes('..')) {
      problems.push('the file in "test" is relative to the project root, without "./" or ".."');
    }
    const path = context.projectRoot === '' ? test.file : `${context.projectRoot}/${test.file}`;
    const area = neverQuarantineArea(path, context.tags);
    if (area !== undefined) {
      problems.push(`${path} is in the never-quarantine set (${area}): it always gates (testing policy § 16.4)`);
    }
  }
  problems.push(...variantProblems(entry['variant']));
  if (typeof entry['owner'] !== 'string' || !loginPattern.test(entry['owner'])) {
    problems.push('"owner" must be a GitHub login, without "@"');
  }
  if (typeof entry['issue'] !== 'number' || !Number.isInteger(entry['issue']) || entry['issue'] < 1) {
    problems.push('"issue" must be the owner issue number');
  }
  if (!(quarantineClasses as readonly unknown[]).includes(entry['class'])) {
    problems.push(`"class" must be one of ${quarantineClasses.join(', ')}`);
  }
  if (!nonEmptyString(entry['evidence'])) {
    problems.push('"evidence" must state the flake events and their runs');
  }
  problems.push(...datesProblems(entry, today));
  return problems;
};

/** The variant a test execution ran under. @public */
export type ExecutionVariant = {
  browser: string | undefined;
  os: string;
  target: string;
};

/**
 * Whether an entry's variant covers an execution: every key the entry names must equal the execution's.
 *
 * @param variant - The entry's variant.
 * @param execution - The execution's browser, OS and target.
 * @returns `true` when the entry applies.
 * @public
 */
export const variantCovers = (variant: QuarantineVariant | undefined, execution: ExecutionVariant): boolean =>
  variant === undefined ||
  ((variant.browser === undefined || variant.browser === execution.browser) &&
    (variant.os === undefined || variant.os === execution.os) &&
    (variant.target === undefined || variant.target === execution.target));

/**
 * The key two entries collide on: the same test with the same variant.
 *
 * @param entry - A valid entry.
 * @returns A stable key.
 * @public
 */
export const entryKey = (entry: QuarantineEntry): string =>
  JSON.stringify([
    entry.test,
    entry.variant?.browser ?? null,
    entry.variant?.os ?? null,
    entry.variant?.target ?? null,
  ]);

/**
 * Reads the entries that hold today from a parsed file: each one that breaks a rule is dropped with its problems, so a
 * broken entry excuses nothing.
 *
 * @param text - The file's text.
 * @param context - The owning project's root and tags.
 * @param today - `YYYY-MM-DD` (UTC).
 * @returns The valid entries and every problem, each prefixed with its entry's index and test.
 * @public
 */
export const readQuarantine = (
  text: string,
  context: QuarantineContext,
  today: string,
): { entries: QuarantineEntry[]; problems: string[] } => {
  const parsed = parseQuarantine(text);
  const entries: QuarantineEntry[] = [];
  const problems = [...parsed.problems];
  const seen = new Set<string>();
  for (const [index, raw] of parsed.entries.entries()) {
    const found = entryProblems(raw, context, today);
    const label =
      isRecord(raw) && typeof raw['test'] === 'string' ? `entries[${index}] (${raw['test']})` : `entries[${index}]`;
    if (found.length > 0) {
      problems.push(...found.map((problem) => `${label}: ${problem}`));
      continue;
    }
    const entry = raw as QuarantineEntry;
    const identity = entryKey(entry);
    if (seen.has(identity)) {
      problems.push(`${label}: duplicates an earlier entry for the same test and variant`);
      continue;
    }
    seen.add(identity);
    entries.push(entry);
  }
  return { entries, problems };
};
