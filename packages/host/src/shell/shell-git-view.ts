/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their platform names. */
/**
 * Read-only git for the agent's shell (blueprint E1, A7): a git directory the host writes per launch into the launch's
 * private root, holding only `HEAD`, `refs/heads`, `refs/tags`, `shallow` when present and a fresh `config` with no
 * remote, helper or hook, whose `objects/info/alternates` names the checkout's real object store. The grant compiler
 * makes the view and the object store readable and never writable, and the real `.git` stays otherwise denied.
 *
 * Accepted residual (operator ruling, 2026-11-10T12:34Z): the view shares the real object store, so objects only
 * `refs/tau/*` reaches — past chat states, members' operation logs, host records — stay readable by object id, through
 * `git cat-file --batch-all-objects` or `git fsck --unreachable`. The agent already reads the current chats, and the
 * person can read all of it with git. Ref names outside `refs/heads` and `refs/tags`, the real config (remote addresses,
 * credential helpers, LFS settings), hooks, the index and every other file of the real `.git` stay unreadable.
 *
 * Every value the view carries is copied only after it parses as what it should be: an object id, a symbolic ref to a
 * branch or tag, or a recognised format setting. A store this cannot read exactly (reftable, a `HEAD` outside the
 * branches, more refs than the bound) gets no view, and git in the shell then finds no repository, as before.
 */
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

/** @public */
export type ShellGitView = Readonly<{
  /** The view's git directory, inside the launch's private root. */
  directory: string;
  /** The real object store its alternates name: readable, never writable. */
  objects: string;
  /** The checkout the view describes, git's work tree. */
  workTree: string;
}>;

/** Refs and files the view copies at most, so a pathological store cannot stall a launch. */
const viewLimits = { refs: 20_000, depth: 32, fileBytes: 64 * 1024 * 1024 } as const;

const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const refName = /^refs\/(?:heads|tags)\/[^\0\n\r]+$/u;
const settingValue = /^[\w.-]{1,64}$/u;

/** A regular file's bytes, or `undefined` when it is absent, not a regular file or larger than the bound. */
const regularFile = async (path: string): Promise<string | undefined> => {
  try {
    const status = await lstat(path);
    if (!status.isFile() || status.size > viewLimits.fileBytes) {
      return undefined;
    }
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
};

/** The git directory and common directory of a checkout: `.git` itself, or the linked checkout's `gitdir:` target. */
const gitDirectories = async (
  checkout: string,
): Promise<Readonly<{ gitDirectory: string; commonDirectory: string }> | undefined> => {
  const dotGit = join(checkout, '.git');
  let status;
  try {
    status = await lstat(dotGit);
  } catch {
    return undefined;
  }
  let gitDirectory: string;
  if (status.isDirectory()) {
    gitDirectory = dotGit;
  } else if (status.isFile()) {
    const pointer = /^gitdir: (.+?)\r?\n?$/u.exec((await regularFile(dotGit)) ?? '')?.[1];
    if (pointer === undefined) {
      return undefined;
    }
    gitDirectory = resolve(checkout, pointer);
  } else {
    return undefined;
  }
  const pointed = await regularFile(join(gitDirectory, 'commondir'));
  const common = pointed?.trim();
  const commonDirectory = common === undefined || common === '' ? gitDirectory : resolve(gitDirectory, common);
  try {
    return { gitDirectory: await realpath(gitDirectory), commonDirectory: await realpath(commonDirectory) };
  } catch {
    return undefined;
  }
};

type FormatSettings = Readonly<{
  repositoryFormatVersion: string;
  objectFormat: string | undefined;
  refStorage: string | undefined;
  ignoreCase: string | undefined;
  precomposeUnicode: string | undefined;
}>;

/**
 * The format settings of a store's config, and nothing else of it: the file can hold remote addresses with embedded
 * tokens, credential helpers and LFS settings, none of which may reach the view.
 *
 * @param text - The real config.
 * @returns The settings git needs to read the objects and the work tree as the person's git does.
 */
const formatSettings = (text: string): FormatSettings => {
  const found = new Map<string, string>();
  let section = '';
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.replace(/^\s+/u, '');
    const header = /^\[\s*([A-Za-z0-9.-]+)\s*(?:"[^"]*")?\s*\]/u.exec(line);
    if (header !== null) {
      section = line.includes('"') ? '' : header[1]!.toLowerCase();
      continue;
    }
    const entry = /^([A-Za-z][\w-]*)\s*=\s*([^\s#;]*)/u.exec(line);
    if (entry !== null && (section === 'core' || section === 'extensions')) {
      found.set(`${section}.${entry[1]!.toLowerCase()}`, entry[2]!.toLowerCase());
    }
  }
  const setting = (name: string): string | undefined => {
    const value = found.get(name);
    return value !== undefined && settingValue.test(value) ? value : undefined;
  };
  return {
    repositoryFormatVersion: setting('core.repositoryformatversion') ?? '0',
    objectFormat: setting('extensions.objectformat'),
    refStorage: found.get('extensions.refstorage'),
    ignoreCase: setting('core.ignorecase'),
    precomposeUnicode: setting('core.precomposeunicode'),
  };
};

/** The view's fresh config: format and filename folding only. No remote, helper, hook, filter or include. */
const viewConfig = (settings: FormatSettings): string => {
  const objectFormat = settings.objectFormat === undefined || settings.objectFormat === 'sha1' ? undefined : 'sha256';
  return [
    '[core]',
    `\trepositoryformatversion = ${objectFormat === undefined ? settings.repositoryFormatVersion : '1'}`,
    '\tbare = false',
    ...(settings.ignoreCase === undefined ? [] : [`\tignorecase = ${settings.ignoreCase}`]),
    ...(settings.precomposeUnicode === undefined ? [] : [`\tprecomposeunicode = ${settings.precomposeUnicode}`]),
    ...(objectFormat === undefined ? [] : ['[extensions]', `\tobjectformat = ${objectFormat}`]),
    '',
  ].join('\n');
};

/** A loose ref's value when it is an object id or a symbolic ref to a branch or tag. */
const refValue = (text: string | undefined): string | undefined => {
  const value = text?.replace(/\r?\n$/u, '');
  if (value === undefined) {
    return undefined;
  }
  if (objectId.test(value)) {
    return value;
  }
  const target = /^ref: (.+)$/u.exec(value)?.[1];
  return target !== undefined && refName.test(target) ? value : undefined;
};

/**
 * Every loose ref under one namespace, as `[name, value]`. Links, unreadable entries and values that are not refs are
 * left out; more than the bound refuses the view.
 */
const looseReferences = async (common: string, namespace: string): Promise<Array<[string, string]> | undefined> => {
  const found: Array<[string, string]> = [];
  const walk = async (relative: string, depth: number): Promise<boolean> => {
    if (depth > viewLimits.depth) {
      return true;
    }
    let entries;
    try {
      entries = await readdir(join(common, relative), { withFileTypes: true });
    } catch {
      return true;
    }
    for (const entry of entries) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        // oxlint-disable-next-line no-await-in-loop -- a bounded depth-first walk.
        if (!(await walk(name, depth + 1))) {
          return false;
        }
      } else if (entry.isFile() && refName.test(name)) {
        // oxlint-disable-next-line no-await-in-loop -- see above.
        const value = refValue(await regularFile(join(common, name)));
        if (value !== undefined) {
          found.push([name, value]);
          if (found.length > viewLimits.refs) {
            return false;
          }
        }
      }
    }
    return true;
  };
  return (await walk(namespace, 0)) ? found : undefined;
};

/**
 * The `packed-refs` lines for branches and tags: the header, each kept ref, and the peeled line that follows a kept tag.
 *
 * @param text - The real `packed-refs`.
 * @returns The filtered file, empty when it keeps no ref, or `undefined` when it holds more refs than the bound.
 */
const packedBranchesAndTags = (text: string): string | undefined => {
  const kept: string[] = [];
  let keeping = false;
  let count = 0;
  for (const line of text.split(/\r?\n/u)) {
    if (line.startsWith('# pack-refs with:')) {
      kept.push(line);
    } else if (line.startsWith('^')) {
      if (keeping && objectId.test(line.slice(1))) {
        kept.push(line);
      }
    } else {
      const [id = '', name = ''] = line.split(' ', 2);
      keeping = objectId.test(id) && refName.test(name) && line === `${id} ${name}`;
      if (keeping) {
        kept.push(line);
        count += 1;
        if (count > viewLimits.refs) {
          return undefined;
        }
      }
    }
  }
  return count === 0 ? '' : `${kept.join('\n')}\n`;
};

/**
 * Write one launch's read-only git view of a checkout (blueprint E1).
 *
 * @public
 * @param checkout - The checkout's real root.
 * @param privateRoot - The launch's private root, which the shell can neither write nor outlive.
 * @returns The view, or `undefined` when the checkout has no store this can describe exactly.
 */
export const createShellGitView = async (checkout: string, privateRoot: string): Promise<ShellGitView | undefined> => {
  const directories = await gitDirectories(checkout);
  if (directories === undefined) {
    return undefined;
  }
  const { gitDirectory, commonDirectory } = directories;
  const settings = formatSettings((await regularFile(join(commonDirectory, 'config'))) ?? '');
  if (settings.refStorage !== undefined && settings.refStorage !== 'files') {
    return undefined;
  }
  const head = refValue(await regularFile(join(gitDirectory, 'HEAD')));
  let objects: string;
  try {
    objects = await realpath(join(commonDirectory, 'objects'));
    const status = await lstat(objects);
    if (!status.isDirectory()) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  /* Git reads an alternates line that starts with a quote as C-quoted; a path that needs quoting is not one Tau made. */
  if (head === undefined || !isAbsolute(objects) || /["\n\r]/u.test(objects)) {
    return undefined;
  }
  const branches = await looseReferences(commonDirectory, 'refs/heads');
  const tags = await looseReferences(commonDirectory, 'refs/tags');
  if (branches === undefined || tags === undefined || branches.length + tags.length > viewLimits.refs) {
    return undefined;
  }
  const packed = packedBranchesAndTags((await regularFile(join(commonDirectory, 'packed-refs'))) ?? '');
  if (packed === undefined) {
    return undefined;
  }
  const shallow = await regularFile(join(commonDirectory, 'shallow'));
  const shallowIds = shallow?.split(/\r?\n/u).filter((line) => line !== '');

  const directory = join(privateRoot, 'git');
  await mkdir(join(directory, 'objects', 'info'), { recursive: true });
  await mkdir(join(directory, 'refs', 'heads'), { recursive: true });
  await mkdir(join(directory, 'refs', 'tags'), { recursive: true });
  await writeFile(join(directory, 'HEAD'), `${head}\n`);
  await writeFile(join(directory, 'config'), viewConfig(settings));
  await writeFile(join(directory, 'objects', 'info', 'alternates'), `${objects}\n`);
  for (const [name, value] of [...branches, ...tags]) {
    const path = join(directory, ...name.split('/'));
    // oxlint-disable-next-line no-await-in-loop -- bounded by the ref limit; each ref's folder before its file.
    await mkdir(join(path, '..'), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await writeFile(path, `${value}\n`);
  }
  if (packed !== '') {
    await writeFile(join(directory, 'packed-refs'), packed);
  }
  if (shallowIds !== undefined && shallowIds.length > 0 && shallowIds.every((line) => objectId.test(line))) {
    await writeFile(join(directory, 'shallow'), `${shallowIds.join('\n')}\n`);
  }
  return { directory, objects, workTree: checkout };
};

/**
 * The environment that points git in the shell at a view: its directory and work tree, and no optional lock (the
 * view has no index to refresh, and every write fails).
 *
 * @public
 * @param view - The launch's view.
 * @returns The variables to add to the launch environment.
 */
export const shellGitEnvironment = (view: ShellGitView): Readonly<Record<string, string>> => ({
  GIT_DIR: view.directory,
  GIT_WORK_TREE: view.workTree,
  GIT_OPTIONAL_LOCKS: '0',
});
