/**
 * Decide whether a pull request runs `desktop-packaging.yml` (Wave 0M, AF-5).
 *
 * The workflow's `paths` include `pnpm-lock.yaml`, so every dependency change anywhere in the
 * workspace started the macOS, Windows and Linux assembly legs. A lockfile change matters to
 * packaging only when it touches an importer whose project the desktop app depends on. This reads
 * the lockfile at the merge base and at the head, finds the importers whose blocks changed, and asks
 * Nx whether a change to those importers' `package.json` affects `desktop`.
 *
 * It fails open: any other matching path, a change outside the `importers` section (`packages`,
 * `snapshots`, `overrides`, `catalogs`, settings), a root importer change, or any error runs the
 * workflow. Only a lockfile change confined to importers outside the desktop closure skips it.
 *
 * Usage: node scripts/src/desktop-packaging-select.ts <base-sha> <head-sha>
 * Writes `run=true|false` to `$GITHUB_OUTPUT` when set, and the reason to stdout.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { matchesGlob, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { load } from 'js-yaml';

export const lockfile = 'pnpm-lock.yaml';
export const workflow = '.github/workflows/desktop-packaging.yml';

export type LockfileSections = {
  /** Each importer's block text, by importer path (`.` is the workspace root). */
  readonly importers: ReadonlyMap<string, string>;
  /** Everything outside the `importers` section. */
  readonly rest: string;
};

/** Split a pnpm v9 lockfile into its importer blocks and the rest, line by line (no YAML parse). */
export const lockfileSections = (text: string): LockfileSections => {
  const importers = new Map<string, string[]>();
  const rest: string[] = [];
  let inImporters = false;
  let current: string[] | undefined;
  for (const line of text.split('\n')) {
    if (/^\S/u.test(line)) {
      inImporters = line === 'importers:';
      current = undefined;
      if (inImporters) {
        continue;
      }
    }
    if (!inImporters) {
      rest.push(line);
      continue;
    }
    const header = /^ {2}(?<name>\S.*):$/u.exec(line);
    if (header?.groups?.['name'] !== undefined) {
      current = [];
      importers.set(header.groups['name'].replaceAll(/^['"]|['"]$/gu, ''), current);
      continue;
    }
    current?.push(line);
  }
  return {
    importers: new Map([...importers].map(([name, lines]) => [name, lines.join('\n').trim()])),
    rest: rest.join('\n'),
  };
};

/** The importers whose block differs between two lockfiles, and whether anything else differs. */
export const lockfileChange = (
  base: string,
  head: string,
): { readonly importers: readonly string[]; readonly rest: boolean } => {
  const before = lockfileSections(base);
  const after = lockfileSections(head);
  const names = new Set([...before.importers.keys(), ...after.importers.keys()]);
  return {
    importers: [...names].filter((name) => before.importers.get(name) !== after.importers.get(name)).toSorted(),
    rest: before.rest !== after.rest,
  };
};

export type Decision = { readonly run: boolean; readonly reason: string };

export type SelectInput = {
  /** Files the pull request changes, from the merge base to the head. */
  readonly changed: readonly string[];
  /** The workflow's `pull_request.paths`. */
  readonly triggers: readonly string[];
  /** The lockfile at the merge base and at the head; read only when the lockfile changed. */
  readonly lockfiles: () => { readonly base: string; readonly head: string };
  /** The projects Nx reports affected by a change to these files. */
  readonly affected: (files: readonly string[]) => readonly string[];
};

export const decide = ({ changed, triggers, lockfiles, affected }: SelectInput): Decision => {
  const matched = changed.filter((file) => file !== lockfile && triggers.some((glob) => matchesGlob(file, glob)));
  if (matched.length > 0) {
    return { run: true, reason: `the pull request changes ${matched.join(', ')}` };
  }
  if (!changed.includes(lockfile)) {
    return { run: true, reason: 'no trigger path matched; running to be safe' };
  }
  const { base, head } = lockfiles();
  const change = lockfileChange(base, head);
  if (change.rest) {
    return { run: true, reason: `${lockfile} changes outside its importers section` };
  }
  if (change.importers.length === 0 || change.importers.includes('.')) {
    return { run: true, reason: `${lockfile} changes the root importer or no importer` };
  }
  const projects = affected(change.importers.map((importer) => `${importer}/package.json`));
  if (projects.includes('desktop')) {
    return { run: true, reason: `${lockfile} changes ${change.importers.join(', ')}, which affect desktop` };
  }
  return { run: false, reason: `${lockfile} changes only ${change.importers.join(', ')}, outside the desktop closure` };
};

const git = (...args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const nxAffected = (files: readonly string[]): readonly string[] => {
  const output = execFileSync(
    'pnpm',
    ['nx', 'show', 'projects', '--affected', `--files=${files.join(',')}`, '--json'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  // Nx may log before its final JSON line; anything but a string array is an error, and the caller runs.
  const projects = JSON.parse(output.trim().split('\n').at(-1) ?? '') as unknown;
  if (!Array.isArray(projects) || !projects.every((project): project is string => typeof project === 'string')) {
    throw new TypeError(`nx show projects printed ${JSON.stringify(projects)}`);
  }
  return projects;
};

export const select = (base: string, head: string): Decision => {
  try {
    const mergeBase = git('merge-base', base, head).trim();
    const parsed = load(readFileSync(resolve(import.meta.dirname, '../..', workflow), 'utf8')) as {
      on: { pull_request: { paths: string[] } };
    };
    return decide({
      changed: git('diff', '--name-only', `${mergeBase}...${head}`).split('\n').filter(Boolean),
      triggers: parsed.on.pull_request.paths,
      lockfiles: () => ({ base: git('show', `${mergeBase}:${lockfile}`), head: git('show', `${head}:${lockfile}`) }),
      affected: nxAffected,
    });
  } catch (error) {
    return {
      run: true,
      reason: `the selection failed (${(error as Error).message.split('\n')[0]}); running to be safe`,
    };
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base = '', head = ''] = process.argv.slice(2);
  const { run, reason } = select(base, head);
  console.log(`Desktop packaging ${run ? 'runs' : 'is skipped'}: ${reason}.`);
  if (process.env['GITHUB_OUTPUT']) {
    appendFileSync(process.env['GITHUB_OUTPUT'], `run=${run}\n`);
  }
}
