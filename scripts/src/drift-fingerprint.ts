/**
 * The daily drift check's fingerprint (`drift-check.yml`, CI throughput review Q-7).
 *
 * Some conformance inputs change without a commit: the GitHub-hosted runner images the shell and native rows run on,
 * and the distribution archives the stock Linux guests install their packages from. The drift check records them once
 * a day, compares them with the fingerprint of its last green run and dispatches only the workflows whose inputs moved:
 * `shell-conformance.yml` (full tier) for the shell runners and the guests' packages, `native-hosts.yml` (every row)
 * for the native host runners. The first run, with no earlier fingerprint, dispatches both and sets the baseline.
 *
 * The guests' package set is read from the guest script itself (`libs/sandbox/scripts/shell-conformance-guest.sh`),
 * so a package added there is fingerprinted without a second list to keep.
 *
 * Usage:
 *   node scripts/src/drift-fingerprint.ts packages
 *     Prints the guest packages, space-separated.
 *   node scripts/src/drift-fingerprint.ts compare --current <file> [--previous <file>]
 *     Prints `{"dispatch": [...], "changes": [...]}`; a missing or empty `--previous` dispatches every workflow.
 * Exit codes: 0 success; 1 invalid fingerprint; 2 usage.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The drift check's record of the inputs that change without a commit. */
export type Fingerprint = {
  /** Runner label to `$ImageOS $ImageVersion` of the job that ran on it. */
  readonly runners: Readonly<Record<string, string>>;
  /** Guest distribution to the sha256 of its sorted `package=candidate` lines. */
  readonly guests: Readonly<Record<string, string>>;
};

/** The workflows a drift dispatches. */
export const driftWorkflows = ['shell-conformance.yml', 'native-hosts.yml'] as const;
export type DriftWorkflow = (typeof driftWorkflows)[number];

/** Which workflows each runner's image feeds: the shell rows' hosts and the native host rows. */
export const runnerWorkflows: Readonly<Record<string, readonly DriftWorkflow[]>> = {
  'ubuntu-24.04': ['shell-conformance.yml', 'native-hosts.yml'],
  'ubuntu-24.04-arm': ['native-hosts.yml'],
  'macos-26': ['shell-conformance.yml'],
  'macos-26-intel': ['shell-conformance.yml', 'native-hosts.yml'],
};

/** The stock Linux guests of the shell rows; their packages feed `shell-conformance.yml` only. */
export const guestDistros = ['ubuntu', 'ubuntu2604', 'debian'] as const;

const packageName = /^[a-z0-9][a-z0-9+.-]*[a-z0-9]$/u;

/**
 * Every package name the guest script installs from its distribution: the words of each `apt-get install` command
 * (its continuation lines included) and, for an `"${name[@]}"` word, every value of each `name=(…)` assignment.
 * Local `.deb` paths, options and variables other than those arrays are not distribution packages and are left out.
 */
export const guestPackages = (script: string): readonly string[] => {
  const arrays = new Map<string, string[]>();
  for (const [, name, values] of script.matchAll(/\b([a-z_][a-z0-9_]*)=\(([^)]*)\)/gu)) {
    arrays.set(name!, [...(arrays.get(name!) ?? []), ...values!.split(/\s+/u).filter(Boolean)]);
  }
  const words: string[] = [];
  const lines = script.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index]!.indexOf('apt-get install');
    if (start === -1 || lines[index]!.trimStart().startsWith('#')) {
      continue;
    }
    let command = lines[index]!.slice(start + 'apt-get install'.length);
    while (command.trimEnd().endsWith('\\') && index + 1 < lines.length) {
      index += 1;
      command = `${command.trimEnd().slice(0, -1)} ${lines[index]}`;
    }
    for (const word of command.split(/\s+/u).filter(Boolean)) {
      const array = /^"\$\{([a-z_][a-z0-9_]*)\[@\]\}"$/u.exec(word);
      words.push(...(array ? (arrays.get(array[1]!) ?? []) : [word]));
    }
  }
  return [...new Set(words.filter((word) => packageName.test(word)))].sort();
};

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === 'string' && entry !== '');

/** Validate a parsed fingerprint; throws on a missing section or an empty value. */
export const parseFingerprint = (raw: unknown): Fingerprint => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('fingerprint is not an object');
  }
  const { runners, guests } = raw as Record<string, unknown>;
  if (!isStringRecord(runners) || !isStringRecord(guests)) {
    throw new Error('fingerprint needs non-empty string maps `runners` and `guests`');
  }
  return { runners, guests };
};

export type Drift = {
  readonly dispatch: readonly DriftWorkflow[];
  readonly changes: readonly string[];
};

/** The workflows whose inputs moved between the two fingerprints; every one when there is no earlier fingerprint. */
export const compare = (previous: Fingerprint | undefined, current: Fingerprint): Drift => {
  if (previous === undefined) {
    return { dispatch: [...driftWorkflows], changes: ['no earlier green fingerprint: setting the baseline'] };
  }
  const dispatch = new Set<DriftWorkflow>();
  const changes: string[] = [];
  for (const [runner, image] of Object.entries(current.runners)) {
    const workflows = runnerWorkflows[runner];
    if (workflows === undefined) {
      throw new Error(`runner ${runner} feeds no drift workflow`);
    }
    if (previous.runners[runner] !== image) {
      changes.push(`runner ${runner}: ${previous.runners[runner] ?? 'none'} -> ${image}`);
      for (const workflow of workflows) {
        dispatch.add(workflow);
      }
    }
  }
  for (const [guest, digest] of Object.entries(current.guests)) {
    if (previous.guests[guest] !== digest) {
      changes.push(
        `guest ${guest} packages: ${previous.guests[guest]?.slice(0, 12) ?? 'none'} -> ${digest.slice(0, 12)}`,
      );
      dispatch.add('shell-conformance.yml');
    }
  }
  return { dispatch: driftWorkflows.filter((workflow) => dispatch.has(workflow)), changes };
};

const root = resolve(import.meta.dirname, '../..');
export const guestScript = 'libs/sandbox/scripts/shell-conformance-guest.sh';

const readFingerprint = (path: string): Fingerprint => parseFingerprint(JSON.parse(readFileSync(path, 'utf8')));

export const run = (argv: readonly string[]): { readonly code: number; readonly output: string } => {
  const [command, ...rest] = argv;
  if (command === 'packages' && rest.length === 0) {
    return { code: 0, output: guestPackages(readFileSync(resolve(root, guestScript), 'utf8')).join(' ') };
  }
  if (command !== 'compare') {
    return { code: 2, output: 'usage: drift-fingerprint.ts packages | compare --current <file> [--previous <file>]' };
  }
  const options = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    if ((flag !== '--current' && flag !== '--previous') || rest[index + 1] === undefined) {
      return { code: 2, output: `unknown or incomplete option ${flag ?? ''}` };
    }
    options.set(flag, rest[index + 1]!);
  }
  const current = options.get('--current');
  if (current === undefined) {
    return { code: 2, output: '--current is required' };
  }
  try {
    const previousPath = options.get('--previous') ?? '';
    const previous = previousPath !== '' && existsSync(previousPath) ? readFingerprint(previousPath) : undefined;
    return { code: 0, output: JSON.stringify(compare(previous, readFingerprint(current))) };
  } catch (error) {
    return { code: 1, output: error instanceof Error ? error.message : String(error) };
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { code, output } = run(process.argv.slice(2));
  (code === 0 ? process.stdout : process.stderr).write(`${output}\n`);
  process.exitCode = code;
}
