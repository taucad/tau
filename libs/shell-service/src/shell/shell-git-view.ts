/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their platform names. */
/**
 * Read-only git for the agent's shell (blueprint E1, A7): a git directory the host writes per launch into the launch's
 * private root, holding only `HEAD`, `refs/heads`, `refs/tags`, `shallow` when present, a copy of the checkout's own
 * index (so `git status` compares against it rather than an empty one), the store's `info/exclude` (Tau's derived
 * ignores) and a fresh `config` with no remote, helper or hook (only git-lfs's own filter when the store uses it, see
 * `viewConfig`), whose `objects/info/alternates` names the checkout's
 * real object store. The grant compiler makes the view and the object store readable and never writable, and the real
 * `.git` stays otherwise denied. The index holds paths, stat data and object ids; a split or sparse index, one that
 * does not parse, or one over 32 MiB gives no view.
 *
 * Accepted residual (operator ruling, 2026-11-10T12:34Z): the view shares the real object store, so objects only
 * `refs/tau/*` reaches — past chat states, members' operation logs, host records — stay readable by object id, through
 * `git cat-file --batch-all-objects` or `git fsck --unreachable`. The agent already reads the current chats, and the
 * person can read all of it with git. Ref names outside `refs/heads` and `refs/tags`, the real config (remote addresses,
 * credential helpers, LFS settings), hooks and every other file of the real `.git` stay unreadable.
 *
 * Every value the view carries is copied only after it parses as what it should be: an object id, a symbolic ref to a
 * branch or tag, or a recognised format setting. A store this cannot read exactly (reftable, a `HEAD` outside the
 * branches, more refs than the bound, a file that exists but cannot be read or parsed) gets no view, and git in the
 * shell then finds no repository, as before.
 */
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * One launch's read-only git view of a checkout: where the view's git directory is, the real object store it reads
 * through its alternates, and the work tree it describes. The grant compiler makes the first two readable only.
 *
 * @public
 */
export type ShellGitView = Readonly<{
  /** The view's git directory, inside the launch's private root. */
  directory: string;
  /** The real object store its alternates name: readable, never writable. */
  objects: string;
  /** The checkout the view describes, git's work tree. */
  workTree: string;
}>;

/** Refs and files the view copies at most, so a pathological store cannot stall a launch. */
const viewLimits = { refs: 20_000, depth: 32, fileBytes: 64 * 1024 * 1024, indexBytes: 32 * 1024 * 1024 } as const;

const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const refName = /^refs\/(?:heads|tags)\/[^\0\n\r]+$/u;
const settingValue = /^[\w.-]{1,64}$/u;

/** A store file that exists but cannot be copied exactly: the view then fails closed. */
const unusable = Symbol('unusable');

/**
 * What reading one store file found: `undefined` when it is truly absent, {@link unusable} when it exists but is not a
 * regular file, is over its bound, cannot be read or does not parse, and its contents otherwise.
 */
type StoreFile<T> = T | typeof unusable | undefined;

/** Whether a filesystem error says the path does not exist, as opposed to existing and refusing to be read. */
const isAbsent = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');

/** One store file's bytes, read without following a link. */
const storeBytes = async (
  path: string,
  bound: number = viewLimits.fileBytes,
): Promise<StoreFile<Uint8Array<ArrayBuffer>>> => {
  let status;
  try {
    status = await lstat(path);
  } catch (error) {
    return isAbsent(error) ? undefined : unusable;
  }
  if (!status.isFile() || status.size > bound) {
    return unusable;
  }
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    return unusable;
  }
};

/** One store file's text. A NUL means it is not one of git's text files, so it is unusable. */
const storeText = async (path: string): Promise<StoreFile<string>> => {
  const bytes = await storeBytes(path);
  if (bytes === undefined || bytes === unusable) {
    return bytes;
  }
  const text = new TextDecoder().decode(bytes);
  return text.includes('\0') ? unusable : text;
};

/**
 * Index extensions git cannot use from the view: a split index (`link`) names a `sharedindex.*` file in the real git
 * directory, and a sparse index (`sdir`) needs sparse-checkout settings the fresh config does not carry. Every other
 * extension holds paths, stat data and object ids (`TREE`, `REUC`, `UNTR`, `EOIE`, `IEOT`) or the fsmonitor's last
 * update token (`FSMN`), which git ignores in memory when no fsmonitor is configured.
 */
const unusableIndexExtensions: ReadonlySet<string> = new Set(['link', 'sdir']);

/**
 * Where a git index's entries end, read with one object-id width, or `undefined` when they do not fit before `end`.
 *
 * @param bytes - The index file.
 * @param layout - Its version (2 to 4), entry count, object-id width (20 for SHA-1, 32 for SHA-256) and where the
 * trailing checksum starts.
 * @returns The offset of the first extension, or of the checksum when there is none.
 */
const indexEntriesEnd = (
  bytes: Uint8Array<ArrayBuffer>,
  layout: Readonly<{ version: number; entries: number; idBytes: number; end: number }>,
): number | undefined => {
  const { version, entries, idBytes, end } = layout;
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  for (let index = 0; index < entries; index += 1) {
    const fixed = 40 + idBytes;
    if (offset + fixed + 2 > end) {
      return undefined;
    }
    /* Bit 14 of the flags marks the extended flags word of versions 3 and 4. */
    const extended = version >= 3 && Math.floor(data.getUint16(offset + fixed) / 0x40_00) % 2 === 1;
    let cursor = offset + fixed + 2 + (extended ? 2 : 0);
    if (version === 4) {
      /* The prefix-strip count is a varint before the name. */
      while (cursor < end && bytes[cursor]! >= 0x80) {
        cursor += 1;
      }
      cursor += 1;
    }
    const nul = bytes.indexOf(0, cursor);
    if (nul === -1 || nul >= end) {
      return undefined;
    }
    /* Versions 2 and 3 pad each entry with NULs to a multiple of eight bytes; version 4 does not pad. */
    offset = version === 4 ? nul + 1 : offset + Math.ceil((nul - offset + 1) / 8) * 8;
  }
  return offset;
};

/**
 * The extension signatures of a git index (versions 2 to 4), or `undefined` when it does not parse exactly.
 *
 * @param bytes - The index file.
 * @returns The four-byte signatures, in order.
 * @public
 */
export const indexExtensions = (bytes: Uint8Array<ArrayBuffer>): readonly string[] | undefined => {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start: number, stop: number): string => String.fromCodePoint(...bytes.subarray(start, stop));
  if (bytes.length < 12 || text(0, 4) !== 'DIRC') {
    return undefined;
  }
  const version = data.getUint32(4);
  if (version < 2 || version > 4) {
    return undefined;
  }
  /* The trailing checksum is 20 bytes for SHA-1 and 32 for SHA-256; the entries' id width matches it. */
  for (const idBytes of [20, 32]) {
    const end = bytes.length - idBytes;
    let offset = indexEntriesEnd(bytes, { version, entries: data.getUint32(8), idBytes, end });
    if (offset === undefined) {
      continue;
    }
    const signatures: string[] = [];
    while (offset + 8 <= end) {
      signatures.push(text(offset, offset + 4));
      offset += 8 + data.getUint32(offset + 4);
    }
    if (offset === end) {
      return signatures;
    }
  }
  return undefined;
};

/** The checkout's index; unusable when it is over the bound, does not parse or carries an extension the view cannot use. */
const viewIndex = async (gitDirectory: string): Promise<StoreFile<Uint8Array<ArrayBuffer>>> => {
  const bytes = await storeBytes(join(gitDirectory, 'index'), viewLimits.indexBytes);
  if (bytes === undefined || bytes === unusable) {
    return bytes;
  }
  const extensions = indexExtensions(bytes);
  return extensions === undefined || extensions.some((signature) => unusableIndexExtensions.has(signature))
    ? unusable
    : bytes;
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
    const link = await storeText(dotGit);
    const pointer = typeof link === 'string' ? /^gitdir: (.+?)\r?\n?$/u.exec(link)?.[1] : undefined;
    if (pointer === undefined) {
      return undefined;
    }
    gitDirectory = resolve(checkout, pointer);
  } else {
    return undefined;
  }
  const pointed = await storeText(join(gitDirectory, 'commondir'));
  if (pointed === unusable) {
    return undefined;
  }
  const common = pointed?.trim();
  const commonDirectory = common === undefined || common === '' ? gitDirectory : resolve(gitDirectory, common);
  try {
    const real = { gitDirectory: await realpath(gitDirectory), commonDirectory: await realpath(commonDirectory) };
    /*
     * `commondir` is a file in the checkout's git directory, so it alone cannot say whose store this is. A linked
     * checkout git made lives at `<common>/worktrees/<name>`; any other pointer could name another project's store.
     */
    const linked = real.gitDirectory !== real.commonDirectory;
    if (
      linked &&
      (basename(dirname(real.gitDirectory)) !== 'worktrees' ||
        dirname(dirname(real.gitDirectory)) !== real.commonDirectory)
    ) {
      return undefined;
    }
    return real;
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
  /** Whether the store's LFS filter is exactly the one `git lfs install` writes. */
  lfsFilter: boolean;
}>;

/**
 * The LFS filter commands `git lfs install` writes, byte for byte. The view recognises only these: any other value,
 * quoted, extended or pointing at another program, is not copied.
 */
const lfsInstalled = {
  clean: 'git-lfs clean -- %f',
  smudge: 'git-lfs smudge -- %f',
  process: 'git-lfs filter-process',
  required: 'true',
} as const;

/**
 * The format settings of a store's config, and nothing else of it: the file can hold remote addresses with embedded
 * tokens, credential helpers and LFS settings, none of which may reach the view. The one other thing read is whether
 * its LFS filter is the standard one ({@link lfsInstalled}), which the view then writes itself.
 *
 * @param text - The real config.
 * @returns The settings git needs to read the objects and the work tree as the person's git does.
 */
const formatSettings = (text: string): FormatSettings => {
  const found = new Map<string, string>();
  const filter = new Map<string, string>();
  let section = '';
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.replace(/^\s+/u, '');
    const header = /^\[\s*([A-Za-z0-9.-]+)\s*(?:"([^"]*)")?\s*\]/u.exec(line);
    if (header !== null) {
      const name = header[1]!.toLowerCase();
      /* A subsection name is case-sensitive; `[filter.lfs]` is git's older spelling of `[filter "lfs"]`. */
      section = header[2] === undefined ? name : name === 'filter' && header[2] === 'lfs' ? 'filter.lfs' : '';
      continue;
    }
    if (section === 'filter.lfs') {
      const setting = /^([A-Za-z][\w-]*)\s*=\s*(.*?)\s*$/u.exec(line);
      if (setting !== null) {
        filter.set(setting[1]!.toLowerCase(), setting[2]!);
      }
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
    /* Every filter setting present is the installed one, and the filter that does the work is there. */
    lfsFilter:
      filter.size > 0 &&
      (filter.get('process') === lfsInstalled.process || filter.get('clean') === lfsInstalled.clean) &&
      [...filter].every(
        ([name, value]) =>
          Object.hasOwn(lfsInstalled, name) && lfsInstalled[name as keyof typeof lfsInstalled] === value,
      ),
  };
};

/** A path as a quoted git config value, or `undefined` when it holds a character a config line cannot carry. */
const configPath = (path: string): string | undefined =>
  /[\0\n\r]/u.test(path) ? undefined : `"${path.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`)}"`;

/**
 * The git config section that keeps git-lfs's working copies in a launch's own writable scratch folder. Git-lfs's clean
 * filter copies each file it hashes into `<lfs.storage>/tmp` before it moves the result into its object folder, and
 * both shells read a store they cannot write: without this, `git status` exits 128 on any project with a large file
 * whose index stat data Tau's index refresh zeroed (which it does after every save). The scratch folder goes with the
 * launch's private roots.
 *
 * @param scratch - A folder the launch may write, removed with it.
 * @returns The `[lfs]` section, or `undefined` when the path cannot be written as a config value.
 * @public
 */
export const shellLfsStorageConfig = (scratch: string): string | undefined => {
  const value = configPath(join(scratch, 'git-lfs'));
  return value === undefined ? undefined : `[lfs]\n\tstorage = ${value}\n`;
};

/**
 * The view's fresh config: format and filename folding, and, when the store uses Git LFS, the LFS filter and where
 * git-lfs keeps its copies. No remote, credential helper, hook, smudge command or include.
 *
 * The filter is the only command the view names, and only as git-lfs's own fixed `filter-process`, written by Tau rather
 * than copied, and only when the store's config holds exactly what `git lfs install` writes. Without it git hashes a
 * large file whole and compares that with the pointer the tree records, so every unchanged large file reads as
 * modified. It runs inside the same sandbox as anything the agent could run, reads only the work-tree file it is given,
 * and writes only to the launch's scratch folder (`lfs.storage`), never the real store; it opens no connection to clean
 * a file. With no scratch folder the view carries neither, as before.
 */
const viewConfig = (settings: FormatSettings, lfsStorage: string | undefined): string => {
  const objectFormat = settings.objectFormat === undefined || settings.objectFormat === 'sha1' ? undefined : 'sha256';
  const lfs = settings.lfsFilter ? lfsStorage : undefined;
  return [
    '[core]',
    `\trepositoryformatversion = ${objectFormat === undefined ? settings.repositoryFormatVersion : '1'}`,
    '\tbare = false',
    ...(settings.ignoreCase === undefined ? [] : [`\tignorecase = ${settings.ignoreCase}`]),
    ...(settings.precomposeUnicode === undefined ? [] : [`\tprecomposeunicode = ${settings.precomposeUnicode}`]),
    ...(objectFormat === undefined ? [] : ['[extensions]', `\tobjectformat = ${objectFormat}`]),
    ...(lfs === undefined
      ? []
      : [
          '[filter "lfs"]',
          `\tprocess = ${lfsInstalled.process}`,
          `\trequired = ${lfsInstalled.required}`,
          lfs.replace(/\n$/u, ''),
        ]),
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
 * Every loose ref under one namespace, as `[name, value]`, or `undefined` (no view) when an entry is a link, cannot be
 * read or holds no ref value, the folders nest past the bound, or there are more refs than the bound: a view missing a
 * branch could leave `HEAD` dangling. A missing namespace holds no ref, and git's own `.lock` files are not refs.
 */
const looseReferences = async (common: string, namespace: string): Promise<Array<[string, string]> | undefined> => {
  const found: Array<[string, string]> = [];
  const walk = async (relative: string, depth: number): Promise<boolean> => {
    if (depth > viewLimits.depth) {
      return false;
    }
    let entries;
    try {
      entries = await readdir(join(common, relative), { withFileTypes: true });
    } catch (error) {
      return isAbsent(error);
    }
    for (const entry of entries) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        // oxlint-disable-next-line no-await-in-loop -- a bounded depth-first walk.
        if (!(await walk(name, depth + 1))) {
          return false;
        }
      } else if (!entry.name.endsWith('.lock')) {
        // oxlint-disable-next-line no-await-in-loop -- see above.
        const text = await storeText(join(common, name));
        const value = typeof text === 'string' && refName.test(name) ? refValue(text) : undefined;
        if (value === undefined) {
          return false;
        }
        found.push([name, value]);
        if (found.length > viewLimits.refs) {
          return false;
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
 * @returns The filtered file, empty when it keeps no ref, or `undefined` when a line is not a header, a ref or a peeled
 * id, or the file holds more refs than the bound.
 */
const packedBranchesAndTags = (text: string): string | undefined => {
  const kept: string[] = [];
  let keeping = false;
  let count = 0;
  for (const line of text.split(/\r?\n/u)) {
    if (line === '') {
      continue;
    }
    if (line.startsWith('# pack-refs with:')) {
      kept.push(line);
    } else if (line.startsWith('^')) {
      if (!objectId.test(line.slice(1))) {
        return undefined;
      }
      if (keeping) {
        kept.push(line);
      }
    } else {
      const [id = '', name = ''] = line.split(' ', 2);
      if (!objectId.test(id) || !name.startsWith('refs/') || line !== `${id} ${name}`) {
        return undefined;
      }
      keeping = refName.test(name);
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
 * Write one launch's read-only git view of a checkout (blueprint E1). A store file the view copies (`config`,
 * `packed-refs`, `shallow`, the index, `info/exclude`, a loose ref) that is truly absent is left out, as git would; one
 * that exists but is not a regular file, is over its bound, cannot be read or does not parse gives no view, so the view
 * never shows a dangling `HEAD`, a history it claims is complete, or an index git would misread.
 *
 * @param checkout - The checkout's real root.
 * @param privateRoot - The launch's private root, which the shell can neither write nor outlive.
 * @param scratch - A folder in it the launch may write, for git-lfs's copies; without one the view has no LFS filter.
 * @returns The view, or `undefined` when the checkout has no store this can describe exactly.
 * @public
 */
export const createShellGitView = async (
  checkout: string,
  privateRoot: string,
  scratch?: string,
): Promise<ShellGitView | undefined> => {
  const directories = await gitDirectories(checkout);
  if (directories === undefined) {
    return undefined;
  }
  const { gitDirectory, commonDirectory } = directories;
  const config = await storeText(join(commonDirectory, 'config'));
  if (config === unusable) {
    return undefined;
  }
  const settings = formatSettings(config ?? '');
  if (settings.refStorage !== undefined && settings.refStorage !== 'files') {
    return undefined;
  }
  const headText = await storeText(join(gitDirectory, 'HEAD'));
  const head = typeof headText === 'string' ? refValue(headText) : undefined;
  let objects: string;
  try {
    objects = await realpath(join(commonDirectory, 'objects'));
    const status = await lstat(objects);
    /* The common directory is already real, so a store elsewhere means `objects` is a link: never follow one. */
    if (!status.isDirectory() || objects !== join(commonDirectory, 'objects')) {
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
  const packedText = await storeText(join(commonDirectory, 'packed-refs'));
  const packed = packedText === unusable ? undefined : packedBranchesAndTags(packedText ?? '');
  const shallow = await storeText(join(commonDirectory, 'shallow'));
  /* One id per line and the trailing newline git writes; git refuses any other line, an empty one included. */
  /* Only an empty file means no boundary; a newline alone is a bad shallow line. */
  const shallowIds =
    typeof shallow === 'string' && shallow !== '' ? shallow.replace(/\r?\n$/u, '').split(/\r?\n/u) : [];
  /* A linked checkout's index is its own, in its own git directory. */
  const index = await viewIndex(gitDirectory);
  /* Ignore patterns only, no secret. */
  const exclude = await storeText(join(commonDirectory, 'info', 'exclude'));
  if (
    packed === undefined ||
    shallow === unusable ||
    !shallowIds.every((line) => objectId.test(line)) ||
    index === unusable ||
    exclude === unusable
  ) {
    return undefined;
  }

  const directory = join(privateRoot, 'git');
  await mkdir(join(directory, 'objects', 'info'), { recursive: true });
  await mkdir(join(directory, 'refs', 'heads'), { recursive: true });
  await mkdir(join(directory, 'refs', 'tags'), { recursive: true });
  await writeFile(join(directory, 'HEAD'), `${head}\n`);
  await writeFile(
    join(directory, 'config'),
    viewConfig(settings, scratch === undefined ? undefined : shellLfsStorageConfig(scratch)),
  );
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
  if (index !== undefined) {
    await writeFile(join(directory, 'index'), index);
  }
  /* Tau's derived ignores (its records, thumbnails, `.tau` members) live here; without them status lists them all. */
  if (exclude !== undefined) {
    await mkdir(join(directory, 'info'), { recursive: true });
    await writeFile(join(directory, 'info', 'exclude'), exclude);
  }
  if (shallowIds.length > 0) {
    await writeFile(join(directory, 'shallow'), `${shallowIds.join('\n')}\n`);
  }
  return { directory, objects, workTree: checkout };
};

/**
 * What every launch that reads git carries, the agent's view and the person's Terminal alike: no optional lock, since
 * neither can write the index `git status` would refresh, and no system-wide config (see {@link shellGitEnvironment}).
 *
 * @public
 */
export const shellGitReadEnvironment: Readonly<Record<string, string>> = Object.freeze({
  GIT_OPTIONAL_LOCKS: '0',
  GIT_CONFIG_NOSYSTEM: '1',
});

/**
 * What a Terminal whose store is writable carries: still no system-wide config, and optional locks allowed again, so
 * `git status` refreshes the index it may now write, as it does in any other terminal.
 *
 * @public
 */
export const shellGitWriteEnvironment: Readonly<Record<string, string>> = Object.freeze({
  GIT_CONFIG_NOSYSTEM: '1',
});

/** The signed-in Tau account a Terminal commits as. @public */
export type ShellGitAccount = Readonly<{
  /** The account's user id, which its no-reply address names. */
  id: string;
  /** The account's display name; the id stands in when it is absent or empty. */
  name?: string | undefined;
}>;

/** The email domain of a Tau no-reply address, `<accountId>@users.noreply.tau.new`, the only address backup accepts. */
const tauNoreplyDomain = 'users.noreply.tau.new';

/** An account id the server reads back out of a no-reply address: no `@`, space or angle bracket, and no quote. */
const noreplyLocalPart = /^[^@\s<>"\\]+$/u;

/** A value as a quoted git config value, or `undefined` when it holds a character a config line cannot carry. */
const configValue = (value: string): string | undefined =>
  [...value].some((character) => character.codePointAt(0)! < 0x20 || character === '\u007F')
    ? undefined
    : `"${value.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`)}"`;

/**
 * The git identity a Terminal session commits as: the person's Tau name and their Tau no-reply address, the address
 * backup records a commit under. Without an account, or with one whose id or name a config line cannot carry, it
 * is `undefined`, and git's own "Please tell me who you are" answers a commit.
 *
 * @param account - The signed-in account, or `undefined` when signed out.
 * @returns The `[user]` section, or `undefined`.
 * @public
 */
export const shellGitIdentityConfig = (account: ShellGitAccount | undefined): string | undefined => {
  if (account === undefined || !noreplyLocalPart.test(account.id)) {
    return undefined;
  }
  const given = account.name?.trim() ?? '';
  const name = configValue(given === '' ? account.id : given);
  const email = configValue(`${account.id}@${tauNoreplyDomain}`);
  return name === undefined || email === undefined ? undefined : `[user]\n\tname = ${name}\n\temail = ${email}\n`;
};

/**
 * The environment that points git in the shell at a view: its directory and work tree, no optional lock (status must
 * not try to refresh the read-only index copy, and every write fails) and no system-wide config. The machine's system
 * config is not the view's: Xcode's git carries `credential.helper=osxkeychain` in its bundled one, and a distribution's
 * `/etc/gitconfig` may name helpers, hooks, an fsmonitor or includes, so git in the shell reads only the view's fresh
 * config, the private HOME's and its own command line.
 *
 * @param view - The launch's view.
 * @returns The variables to add to the launch environment.
 * @public
 */
export const shellGitEnvironment = (view: ShellGitView): Readonly<Record<string, string>> => ({
  GIT_DIR: view.directory,
  GIT_WORK_TREE: view.workTree,
  ...shellGitReadEnvironment,
});
