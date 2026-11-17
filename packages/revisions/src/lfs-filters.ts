/**
 * Git-lfs's filter configuration in a store's own `config`, read and written without a process.
 *
 * `git lfs install --local --skip-repo` sets five keys and nothing else. It is
 * also one `git-lfs` process and the eight to thirteen `git` processes it starts
 * (`version`, two `rev-parse`, then a `config` read and, when the value differs,
 * a write per key). On a host where a process takes seconds to start that is
 * the whole of a store's open (L4 run 44058328613: "Native Git stopped lfs:
 * deadline").
 *
 * @internal
 */

import { open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** The keys and values git-lfs 3 writes, by `section.key` as this reader names them. */
const largeObjectFilterKeys: ReadonlyMap<string, string> = new Map([
  ['lfs.repositoryformatversion', '0'],
  ['filter."lfs".process', 'git-lfs filter-process'],
  ['filter."lfs".required', 'true'],
  ['filter."lfs".clean', 'git-lfs clean -- %f'],
  ['filter."lfs".smudge', 'git-lfs smudge -- %f'],
]);

/** The same keys in the layout git-lfs leaves on a store that had none of them. */
const largeObjectFilterSections =
  '[lfs]\n\trepositoryformatversion = 0\n[filter "lfs"]\n\tprocess = git-lfs filter-process\n\trequired = true\n\tclean = git-lfs clean -- %f\n\tsmudge = git-lfs smudge -- %f\n';

/**
 * What a store's `config` holds of git-lfs's filter configuration.
 *
 * - `configured`: each of the keys once, with git-lfs's value.
 * - `absent`: none of them, and no `filter "lfs"` section.
 * - `other`: anything else, or a file this reader does not follow (an include,
 *   a quoted, escaped or continued value, or a section in an older spelling).
 *   Only Git and git-lfs answer for those.
 *
 * @internal
 */
export type LargeObjectFilterState = 'configured' | 'absent' | 'other';

const sectionHeader = /^\[(?<name>[\w.-]+)(?:\s+"(?<subsection>[^"\\]*)")?\]$/u;
const keyLine = /^(?<key>[a-z][\w-]*)\s*=\s*(?<value>.*)$/iu;

/* The section a header line opens, `section."subsection"` as this reader names it; `undefined` for one it does not follow. */
const sectionOf = (header: Readonly<Record<string, string | undefined>>): string | undefined => {
  const name = header['name']?.toLowerCase() ?? '';
  if (name.startsWith('include') || (name !== 'lfs' && name.includes('lfs'))) {
    return undefined;
  }
  const { subsection } = header;
  return subsection === undefined ? name : `${name}."${subsection}"`;
};

/* Every value of the `lfs` and `filter "lfs"` sections by key, or `undefined` for a file this reader does not follow. */
const readLargeObjectKeys = (
  config: string,
): Readonly<{ found: ReadonlyMap<string, readonly string[]>; filterSection: boolean }> | undefined => {
  const found = new Map<string, string[]>();
  let section: string | undefined = '';
  let filterSection = false;
  for (const raw of config.split(/\r?\n/u)) {
    const line = raw.trim();
    const header = sectionHeader.exec(line)?.groups;
    section = header === undefined ? section : sectionOf(header);
    filterSection ||= section === 'filter."lfs"';
    if (section === undefined || (header === undefined && line.startsWith('['))) {
      return undefined;
    }
    if (header === undefined && (section === 'lfs' || section === 'filter."lfs"') && !/^(?:$|[#;])/u.test(line)) {
      const entry = keyLine.exec(line)?.groups;
      const value = entry?.['value'];
      if (value === undefined || /["\\#;]/u.test(value)) {
        return undefined;
      }
      const name = `${section}.${entry?.['key']?.toLowerCase() ?? ''}`;
      found.set(name, [...(found.get(name) ?? []), value.trimEnd()]);
    }
  }
  return { found, filterSection };
};

/**
 * Read a store's `config` for git-lfs's filter keys.
 *
 * @internal
 * @param config - The file's text.
 * @returns What it holds of them.
 */
export const largeObjectFiltersIn = (config: string): LargeObjectFilterState => {
  const read = readLargeObjectKeys(config);
  if (read === undefined) {
    return 'other';
  }
  const { found, filterSection } = read;
  if (!filterSection && !found.has('lfs.repositoryformatversion')) {
    return 'absent';
  }
  for (const [name, value] of largeObjectFilterKeys) {
    const values = found.get(name);
    if (values?.length !== 1 || values[0] !== value) {
      return 'other';
    }
  }
  return 'configured';
};

/**
 * Write git-lfs's filter keys into a store whose `config` has none of them, the
 * way Git writes its own: the whole new file into `config.lock`, created only
 * if no other writer holds it, then renamed over `config`.
 *
 * @internal
 * @param storePath - The store (`.git`).
 * @returns Whether the store now holds the keys; `false` leaves `config` as it was.
 */
export const writeLargeObjectFilters = async (storePath: string): Promise<boolean> => {
  const configPath = join(storePath, 'config');
  const lockPath = `${configPath}.lock`;
  const lock = await open(lockPath, 'wx').catch(() => undefined);
  if (lock === undefined) {
    return false;
  }
  let closed = false;
  let renamed = false;
  try {
    const config = await readFile(configPath, 'utf8');
    const state = largeObjectFiltersIn(config);
    if (state !== 'absent') {
      return state === 'configured';
    }
    await lock.writeFile(`${config}${config === '' || config.endsWith('\n') ? '' : '\n'}${largeObjectFilterSections}`);
    await lock.close();
    closed = true;
    await rename(lockPath, configPath);
    renamed = true;
    return true;
  } catch {
    return false;
  } finally {
    if (!closed) {
      await lock.close().catch(() => undefined);
    }
    if (!renamed) {
      await rm(lockPath, { force: true });
    }
  }
};
