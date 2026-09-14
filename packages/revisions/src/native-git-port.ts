/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves `#*.js` to this package's own source files. */
/**
 * `RevisionPort` over a native Git repository (S12).
 *
 * The engine is the `git` binary — its object store, its `update-ref`
 * transaction, its linked worktrees — and the commit object is Tau's, exactly
 * as on the browser leg: `encodeCommit` produces the bytes and
 * `git hash-object -t commit -w` stores them, because neither `git commit-tree`
 * nor `isomorphic-git`'s `CommitObject` can carry `change-id`, `jj:trees` or
 * `jj:conflict-labels`. One encoder, two object stores, one identity — which is
 * what the conformance suite's cross-adapter test measures (I4).
 *
 * Trees go in through one `fast-import` rather than a process per blob: it is
 * binary-safe, quotes paths itself, and is the path {@link createNativeGitAdapter}
 * already proved against real repositories.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { ImmutableRevisionTree, ResourceQueue, revisionId } from '@taucad/filesystem/revisions';
import type { RevisionFileMode, RevisionId, RevisionTreeInput } from '@taucad/filesystem/revisions';
import type { RevisionProvenance } from '#revision-authority.js';
import { decodeCommit, decodeTag, encodeCommit, encodeTag } from '#git-objects.js';
import type { DecodedCommit } from '#git-objects.js';
import { runGitCommand } from '#git-command.js';
import type { GitCommandResult } from '#git-command.js';
import { parseTransportValue, quoteFastImportPath } from '#native-git-adapter.js';
import { NativeGitError } from '#native-git.types.js';
import { digestHex } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';
import {
  deriveChangeId,
  parseRevisionCommitMessage,
  parseRevisionTagMessage,
  revisionAuthorSignature,
  revisionCommitMessage,
  revisionCommitterSignature,
  revisionTagMessage,
  taggerSignature,
} from '#revision-headers.js';
import type { RevisionTrailer } from '#revision-headers.js';
import { walkRevisionLog } from '#revision-log-order.js';
import { RevisionPortError } from '#revision-port.js';
import { assertMaterializableRevisionTree } from '#portable-tree.js';
import type {
  AddCheckoutInput,
  Checkout,
  CreateRevisionTagInput,
  InitRevisionStoreInput,
  RevisionConflict,
  RevisionDiffEntry,
  RevisionDiffInput,
  RevisionEngineDescriptor,
  RevisionHead,
  RevisionLogEntry,
  RevisionLogInput,
  RevisionPort,
  RevisionReceipt,
  RevisionRecord,
  RevisionFetchInput,
  RevisionFetchResult,
  RevisionPushInput,
  RevisionPushRef,
  RevisionPushRefResult,
  RevisionPushResult,
  SetRevisionRemoteInput,
  RevisionRef,
  RevisionTag,
  RemoteRef,
  UpdateRevisionRefInput,
  UpdateRevisionRefResult,
  WriteRevisionInput,
} from '#revision-port.js';
import { cleanLargeObjects, lfsObjectPath, readLfsPointer } from '#lfs.js';
import {
  isHostLocalRef,
  isTauApiUrl,
  lfsRemoteUnsupportedMessage,
  remoteCarriesLargeObjects,
  remoteOf,
  remoteTrackingRef,
} from '#remotes.js';
import type { Remote } from '#remotes.js';
import {
  generatedGitattributesContent,
  generatedGitattributesPath,
  generatedIgnoreContent,
  generatedIgnorePath,
} from '#workspace-config.js';

/** Where linked checkouts live, and which project they belong to. @public */
export type NativeGitCheckoutOptions = Readonly<{
  projectId: string;
  /**
   * Host data directory every linked worktree is created under. Never inside
   * the repository's own worktree: native Git refuses a worktree in a worktree,
   * and `tau serve` treats its cwd as the project (S6).
   */
  directory: string;
}>;

/**
 * What authorizes this leg's requests to Tau's own git remotes (P40).
 *
 * The browser sends its session cookie; a terminal or a daemon has none, so the
 * same session travels as a header this port passes to git per spawn. It is
 * never written to disk, the remote URL, or process arguments: Git reads the
 * one-shot `http.extraHeader` from its child environment.
 *
 * @public
 */
export type TauApiCredential = Readonly<{
  /** Origin the Tau API is reachable at, which decides which remotes get it. */
  apiBaseUrl: string;
  /** The whole header value, e.g. `Bearer <session token>`. */
  authorization: string;
}>;

/** In-memory credential for one exact non-Tau Git repository. @public */
export type NativeGitRemoteCredential = Readonly<{
  repositoryUrl: string;
  authorization: string;
}>;

/** Native-Git revision port configuration. @public */
export type NativeGitRevisionPortOptions = Readonly<{
  /** The project directory. `init` creates the repository in it when absent. */
  repositoryPath: string;
  gitExecutable?: string;
  /** Supplied, the port advertises and implements the `checkouts` capability. */
  checkouts?: NativeGitCheckoutOptions;
  /**
   * Read before every request to a remote, so a session that is refreshed or
   * signed out takes effect on the next command rather than at the next open.
   */
  tauCredential?: () => TauApiCredential | undefined;
  /** Read per network command and injected through the child environment, never argv or git config. */
  remoteCredential?: () => NativeGitRemoteCredential | undefined;
}>;

/**
 * A lost lease, in the one word both legs answer with.
 *
 * `--force-with-lease` is refused by *git itself* — the summary is
 * `[rejected] (stale info)` — while the browser leg refuses the same case in
 * its own code and says `leaseLost`. A caller must not have to know which leg
 * it is holding: `revision-effects` reads this word to tell somebody that the
 * project moved in the cloud, and every other refusal keeps the server's own
 * words (P38, D14).
 *
 * @param summary - git's `--porcelain` summary for a refused ref.
 * @returns `leaseLost`, or the summary unchanged.
 */
const refusalReason = (summary: string): string => (/stale info/iu.test(summary) ? 'leaseLost' : summary);

const branchRefPrefix = 'refs/heads';
const tagRefPrefix = 'refs/tags';
const symbolicRefPrefix = 'ref: ';
const stagingRefPrefix = 'refs/tau/transactions/port';
const initialBranch = 'main';
/** The store this port owns, relative to the project directory. */
const gitDirectoryName = '.git';
const liveCheckoutId = 'live';
/**
 * Configuration this port pins on every command, ahead of the subcommand.
 *
 * The environment scrub takes care of `GIT_*`; these three reach git from the
 * user's own `~/.gitconfig` instead, and each of them changes the bytes a
 * checkout or a new repository ends up holding (W3a review R43):
 *
 * - `core.autocrlf` rewrites line endings on checkout, so a tree recorded on one
 *   machine would materialize differently on another — and `treeId` is the
 *   identity every host compares (I4).
 * - `core.hooksPath` runs somebody else's scripts inside Tau's own plumbing. A
 *   path that is not a directory disables hooks on every platform.
 * - `init.templateDir` installs hooks and config into a repository this port
 *   creates. Empty is git's own "no template", and it is silent.
 */
const pinnedConfiguration: readonly string[] = Object.freeze([
  '-c',
  'core.autocrlf=false',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'init.templateDir=',
]);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

const frozenChange = (path: string, kind: RevisionDiffEntry['kind']): RevisionDiffEntry =>
  Object.freeze({ path, kind });

/**
 * `diff-tree --name-status`' letter, as a port change kind.
 *
 * @param status - The status field Git emitted.
 * @returns The kind, or `undefined` for a status this port does not record.
 */
const diffKind = (status: string): RevisionDiffEntry['kind'] | undefined => {
  switch (status.charAt(0)) {
    case 'A': {
      return 'added';
    }
    case 'D': {
      return 'deleted';
    }
    // A type change is a content change as far as a path diff is concerned.
    case 'M':
    case 'T': {
      return 'modified';
    }
    default: {
      return undefined;
    }
  }
};

/**
 * Create a `RevisionPort` over a native Git repository.
 *
 * @param options - Project directory, Git executable and checkout directory.
 * @returns A port whose revision ids are Git commit ids.
 * @public
 * @example <caption>Attach a disk host's project</caption>
 * ```typescript
 * import { createNativeGitRevisionPort } from '@taucad/revisions/node';
 *
 * const port = createNativeGitRevisionPort({ repositoryPath: '/srv/tau/project' });
 * await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
 * ```
 */
export const createNativeGitRevisionPort = (options: NativeGitRevisionPortOptions): RevisionPort => {
  if (options.repositoryPath.length === 0) {
    throw new TypeError('repositoryPath is required.');
  }
  const { repositoryPath, checkouts } = options;
  const gitExecutable = options.gitExecutable ?? 'git';
  const refQueue = new ResourceQueue();
  let objectFormat: ObjectFormat | undefined;

  /**
   * Every `GIT_*` variable the caller exported, unset.
   *
   * `runCommand` spreads `process.env` into the child, so one exported
   * `GIT_DIR` re-points every command — `git init` included — at somebody
   * else's repository, which is the R2 defect through another door (review 4
   * R25). The two variables the port needs, it sets itself.
   *
   * @returns One `undefined` per inherited `GIT_*` name.
   */
  const clearedGitEnvironment = (): Record<string, string | undefined> =>
    Object.fromEntries(
      Object.keys(process.env)
        .filter((name) => name.startsWith('GIT_'))
        .map((name) => [name, undefined]),
    );

  /**
   * The cleared environment, pinned to this project's own store and work tree.
   *
   * @returns The environment every command of this port runs under.
   */
  const gitEnvironment = (): Record<string, string | undefined> => {
    const pinned = clearedGitEnvironment();
    // Environment names, not identifiers: assigned rather than spelled as keys.
    pinned['GIT_DIR'] = join(repositoryPath, gitDirectoryName);
    pinned['GIT_WORK_TREE'] = repositoryPath;
    pinned['GIT_TERMINAL_PROMPT'] = '0';
    return pinned;
  };

  type GitRunOptions = Readonly<{
    input?: ReadonlyArray<Uint8Array<ArrayBuffer>>;
    env?: Record<string, string | undefined>;
    signal?: AbortSignal;
  }>;

  const run = async (args: readonly string[], options: GitRunOptions = {}): Promise<GitCommandResult> => {
    try {
      return await runGitCommand({
        gitExecutable,
        cwd: repositoryPath,
        args: [...pinnedConfiguration, ...args],
        env: options.env ?? gitEnvironment(),
        ...(options.input === undefined ? {} : { input: options.input }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      throw new RevisionPortError('ENGINE_UNAVAILABLE', `Native Git could not start ${args[0] ?? 'a command'}.`, {
        cause: error,
      });
    }
  };

  const output = async (args: readonly string[], options: GitRunOptions = {}): Promise<Uint8Array<ArrayBuffer>> => {
    const result = await run(args, options);
    if (result.exitCode !== 0) {
      throw new RevisionPortError('ENGINE_FAILED', `Native Git failed ${args[0] ?? 'a command'}.`);
    }
    return result.stdout;
  };

  const text = async (args: readonly string[], env?: Record<string, string | undefined>): Promise<string> =>
    textDecoder.decode(await output(args, { env })).trim();

  const optionalConfig = async (name: string): Promise<string> => {
    const result = await run(['config', '--get', name]);
    return result.exitCode === 0 ? textDecoder.decode(result.stdout).trim() : '';
  };

  /**
   * The one-shot child environment carrying URL-scoped credentials and LFS endpoint for this remote.
   *
   * Only for a remote on the API's origin: a header minted for Tau must never
   * reach a third-party remote, which is the same rule the browser leg's
   * transport applies to the cookie (W11b review Q2).
   *
   * @param remote - The remote a command is about to talk to.
   * @returns The configuration arguments, or none.
   */
  const remoteEnvironment = async (remote: string): Promise<Record<string, string | undefined>> => {
    const env = gitEnvironment();
    const held = options.tauCredential?.();
    const remotes = await port.listRemotes();
    const url = remotes.find((entry) => entry.name === remote)?.url;
    const remoteHeld = options.remoteCredential?.();
    const normalized = (value: string): string | undefined => {
      try {
        const parsed = new URL(value);
        parsed.username = '';
        parsed.password = '';
        return parsed.toString().replace(/\/+$/u, '');
      } catch {
        return undefined;
      }
    };
    const authorization =
      held !== undefined && url !== undefined && isTauApiUrl(held.apiBaseUrl, url)
        ? held.authorization
        : remoteHeld !== undefined && url !== undefined && normalized(remoteHeld.repositoryUrl) === normalized(url)
          ? remoteHeld.authorization
          : undefined;
    const normalizedUrl = url === undefined ? undefined : normalized(url);
    if (authorization !== undefined && normalizedUrl !== undefined) {
      env['GIT_CONFIG_COUNT'] = '2';
      env['GIT_CONFIG_KEY_0'] = `http.${normalizedUrl}.extraHeader`;
      env['GIT_CONFIG_VALUE_0'] = `Authorization: ${authorization}`;
      env['GIT_CONFIG_KEY_1'] = 'lfs.url';
      env['GIT_CONFIG_VALUE_1'] = `${normalizedUrl}/info/lfs`;
    }
    return env;
  };

  const format = async (): Promise<ObjectFormat> => {
    if (objectFormat === undefined) {
      const recorded = await text(['rev-parse', '--show-object-format']);
      if (recorded !== 'sha1' && recorded !== 'sha256') {
        throw new RevisionPortError('INVALID_REPOSITORY', 'The repository uses an unsupported Git object format.');
      }
      objectFormat = recorded;
    }
    return objectFormat;
  };

  const zeroObjectId = async (): Promise<string> => '0'.repeat((await format()) === 'sha1' ? 40 : 64);

  const readCommitObject = async (id: string): Promise<DecodedCommit | undefined> => {
    const result = await run(['cat-file', 'commit', id]);
    return result.exitCode === 0 ? decodeCommit(result.stdout) : undefined;
  };

  const requireCommit = async (id: RevisionId): Promise<DecodedCommit> => {
    const commit = await readCommitObject(id);
    if (commit === undefined) {
      throw new RevisionPortError('UNKNOWN_REVISION', 'The revision is not in the store.');
    }
    return commit;
  };

  const entryOf = (id: RevisionId, commit: DecodedCommit): RevisionLogEntry => {
    const trailer = parseRevisionCommitMessage(commit.message);
    /* A project Tau did not write carries no trailer, and its date is still the
     * one git shows: the commit's own author time. */
    const unattributed: RevisionProvenance = {
      source: 'import',
      actorId: 'unknown',
      createdAt: commit.author.seconds * 1000,
    };
    return Object.freeze({
      id,
      changeId: commit.changeId ?? '',
      parents: Object.freeze(commit.parents.map((parent) => revisionId(parent))),
      summary: trailer?.summary ?? { generated: commit.message.split('\n')[0] ?? '' },
      provenance: trailer?.provenance ?? unattributed,
      conflicted: commit.conflictedTrees !== undefined,
    });
  };

  const receiptOf = async (id: RevisionId, commit: DecodedCommit): Promise<RevisionReceipt> =>
    Object.freeze({
      engine: 'native-git',
      commitId: id,
      changeId: commit.changeId ?? '',
      objectFormat: await format(),
      conflicted: commit.conflictedTrees !== undefined,
    });

  /**
   * Where one large object lives in this repository's own LFS store.
   *
   * @param oid - The pointer's object id.
   * @returns The absolute path git-lfs reads and writes that object at.
   */
  const lfsObjectFile = (oid: string): string => join(repositoryPath, gitDirectoryName, lfsObjectPath(oid));

  /**
   * Put one large object in this repository's own LFS store.
   *
   * Content-addressed, so an object that is already stored is the same object:
   * a second revision over the same bytes writes nothing.
   *
   * @param oid - The pointer's object id.
   * @param content - The object's real bytes.
   */
  /**
   * The large files a push would carry, by project-relative path (P20).
   *
   * `git lfs ls-files` is the disk leg's own answer to the question the browser
   * leg answers by reading pointer blobs out of the offered trees: both name the
   * LFS files reachable from the refs being offered, so the two legs refuse the
   * same push with the same list. git-lfs is on the toolchain by the time a
   * store exists (`resolveGitLfs`), so this asks the tool rather than
   * re-implementing pointer detection here.
   *
   * @param references - The refs this push offers.
   * @returns Their large files, deduplicated.
   */
  const largeObjectPaths = async (references: readonly RevisionPushRef[]): Promise<readonly string[]> => {
    const paths = new Set<string>();
    for (const reference of references) {
      // oxlint-disable-next-line no-await-in-loop -- one tip per offered ref, on the pre-push check only.
      const listed = await run(['lfs', 'ls-files', '--name-only', reference.name]).catch(() => undefined);
      if (listed?.exitCode !== 0) {
        continue;
      }
      for (const line of textDecoder.decode(listed.stdout).split('\n')) {
        const path = line.trim();
        if (path !== '') {
          paths.add(path);
        }
      }
    }
    return [...paths];
  };

  const storeLfsObject = async (oid: string, content: Uint8Array<ArrayBuffer>): Promise<void> => {
    const file = lfsObjectFile(oid);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, { flag: 'wx' }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        // oxlint-disable-next-line @typescript-eslint/only-throw-error -- re-raising exactly what the write threw.
        throw error;
      }
    });
  };

  /**
   * One blob as a caller reads it: the pointer resolved back to its content.
   *
   * @param content - Bytes as the object store holds them.
   * @returns The real bytes.
   */
  const smudged = async (content: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
    const pointer = readLfsPointer(content);
    if (pointer === undefined) {
      return content;
    }
    try {
      const stored = await readFile(lfsObjectFile(pointer.oid));
      return new Uint8Array(stored.buffer as ArrayBuffer, stored.byteOffset, stored.byteLength);
    } catch (error) {
      throw new RevisionPortError(
        'UNKNOWN_REVISION',
        'A large object this revision references is not on this machine yet.',
        { cause: error },
      );
    }
  };

  /**
   * Write one tree through a single `fast-import`, then drop the staging ref.
   *
   * The commit `fast-import` writes is a throwaway: this port needs the *tree*
   * it produced, and writes Tau's own commit over it.
   *
   * @param tree - The exact tree to store.
   * @returns The root tree's object id.
   */
  const writeTreeObject = async (tree: ImmutableRevisionTree): Promise<string> => {
    /* `fast-import` stores `inline` data verbatim, so git's own clean filter
     * never runs on this path and the pointer decision is Tau's. It is made by
     * the host-neutral cut (`lfs.ts`) that the cut's `treeId` is computed from,
     * so the id this engine records is the id the host predicted. */
    const recorded = cleanLargeObjects(tree);
    await Promise.all([...recorded.objects].map(async ([oid, content]) => storeLfsObject(oid, content)));
    const stagingRef = `${stagingRefPrefix}-${randomUUID()}`;
    const chunks: Array<Uint8Array<ArrayBuffer>> = [
      textEncoder.encode(`commit ${stagingRef}\n`),
      textEncoder.encode('author Tau Revision <tau@local.invalid> 0 +0000\n'),
      textEncoder.encode('committer Tau Revision <tau@local.invalid> 0 +0000\n'),
      textEncoder.encode('data 0\n'),
      textEncoder.encode('deleteall\n'),
    ];
    for (const entry of recorded.tree.entries()) {
      chunks.push(
        textEncoder.encode(`M ${entry.mode} inline ${quoteFastImportPath(entry.path)}\n`),
        textEncoder.encode(`data ${entry.content.byteLength}\n`),
        entry.content,
        textEncoder.encode('\n'),
      );
    }
    chunks.push(textEncoder.encode('done\n'));
    await output(['fast-import', '--quiet', '--date-format=raw'], { input: chunks });
    const treeId = await text(['rev-parse', `${stagingRef}^{tree}`]);
    await run(['update-ref', '-d', stagingRef]);
    return treeId;
  };

  /* A branch name is spelled short and everything else is spelled in full: the
   * record set the design pushes lives outside `refs/heads` (`refs/tau/chats/*`,
   * W17), so a port that could only name branches could not address half of what
   * its own `push` moves. */
  const refOf = (name: string): string => (name.startsWith('refs/') ? name : `${branchRefPrefix}/${name}`);

  /**
   * One named version, or `undefined` when the ref is gone.
   *
   * A lightweight tag — a valid git tag this store did not write — is still a
   * name for a revision, so it is reported with no note and no actor rather
   * than hidden.
   *
   * @param name - The tag name, without `refs/tags/`.
   * @returns The named version.
   */
  const readTagRef = async (name: string): Promise<RevisionTag | undefined> => {
    const ref = `${tagRefPrefix}/${name}`;
    /* `resolve` peels (`^{commit}`), which is right everywhere else and wrong
     * here: the tag object itself is what carries the note and the actor. */
    const oid = await text(['for-each-ref', '--format=%(objectname)', ref]);
    if (oid === '') {
      return undefined;
    }
    const kind = await text(['cat-file', '-t', oid]);
    if (kind !== 'tag') {
      return Object.freeze({ name, revisionId: revisionId(oid), note: undefined, actor: undefined, createdAt: 0 });
    }
    const decoded = decodeTag(await output(['cat-file', 'tag', oid]));
    const trailer = parseRevisionTagMessage(decoded.message);
    return Object.freeze({
      name,
      revisionId: revisionId(decoded.object),
      note: trailer.note,
      actor: trailer.actor,
      createdAt: decoded.tagger.seconds * 1000,
    });
  };

  const resolve = async (ref: string): Promise<string | undefined> => {
    const result = await run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    if (result.exitCode !== 0) {
      return undefined;
    }
    return textDecoder.decode(result.stdout).trim();
  };

  const listTree = async (
    commit: string,
  ): Promise<ReadonlyMap<string, Readonly<{ oid: string; mode: RevisionFileMode }>>> => {
    const stdout = await output(['ls-tree', '-rz', '--full-tree', commit]);
    const paths = new Map<string, Readonly<{ oid: string; mode: RevisionFileMode }>>();
    for (const record of textDecoder.decode(stdout).split('\0')) {
      if (record === '') {
        continue;
      }
      const tab = record.indexOf('\t');
      const header = record.slice(0, tab).split(' ');
      if (
        tab === -1 ||
        header[1] !== 'blob' ||
        header[2] === undefined ||
        (header[0] !== '100644' && header[0] !== '100755')
      ) {
        throw new RevisionPortError('ENGINE_FAILED', 'A revision tree holds a non-file entry.');
      }
      paths.set(record.slice(tab + 1), { oid: header[2], mode: header[0] });
    }
    return paths;
  };

  const checkoutIdOf = async (branch: string): Promise<string> =>
    digestHex(await format(), textEncoder.encode(`tau-checkout\0${branch}`)).slice(0, 16);

  const requireCheckouts = (): NativeGitCheckoutOptions => {
    if (checkouts === undefined) {
      throw new RevisionPortError(
        'UNSUPPORTED_OPERATION',
        'This port has no checkouts directory; construct it with `checkouts` to use them.',
      );
    }
    return checkouts;
  };

  /**
   * Every worktree this repository has, as Git itself reports them.
   *
   * @returns The live checkout first, then every linked one.
   */
  const listWorktrees = async (): Promise<readonly Checkout[]> => {
    const { projectId } = requireCheckouts();
    const zero = await zeroObjectId();
    const listing = await text(['worktree', 'list', '--porcelain']);
    const blocks = listing.split('\n\n');
    const collected: Checkout[] = [];
    for (const block of blocks) {
      const lines = block.split('\n').filter((line) => line !== '');
      const root = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length);
      if (root === undefined) {
        continue;
      }
      const head = lines.find((line) => line.startsWith('HEAD '))?.slice('HEAD '.length);
      const branch = lines.find((line) => line.startsWith('branch '))?.slice('branch '.length);
      const linked = collected.length > 0;
      collected.push(
        Object.freeze({
          /* The id is the directory name this port created, not a slice of the
           * configured prefix: Git reports a resolved path, and on macOS that is
           * `/private/var/…` where the caller said `/var/…`. */
          id: linked ? basename(root) : liveCheckoutId,
          projectId,
          root,
          kind: linked ? 'linked' : 'live',
          branch: branch?.startsWith(`${branchRefPrefix}/`) ? branch.slice(branchRefPrefix.length + 1) : undefined,
          baseRevisionId: head === undefined || head === zero ? undefined : revisionId(head),
        }),
      );
    }
    return Object.freeze(collected);
  };

  /**
   * Refuse a remote or ref that Git could read as an option, and any ref this
   * host keeps to itself.
   *
   * @param value - The remote name or fully-qualified ref.
   * @param label - What it names, for the diagnostic.
   * @param ref - Whether the value is a ref and therefore subject to the host-local list.
   */
  const guardTransportValue = (value: string, label: string, ref = false): void => {
    try {
      parseTransportValue(value, label);
    } catch (error) {
      throw new RevisionPortError(
        'INVALID_TRANSPORT',
        error instanceof NativeGitError ? error.message : 'Unsafe Git transport value.',
        { cause: error },
      );
    }
    if (ref && isHostLocalRef(value)) {
      throw new RevisionPortError('INVALID_TRANSPORT', `${label} names a ref that never leaves this host.`);
    }
  };

  const listRemoteReferences = async (remote: string): Promise<readonly RemoteRef[]> => {
    guardTransportValue(remote, 'remote');
    const listing = await text(['ls-remote', '--refs', '--', remote], await remoteEnvironment(remote));
    return Object.freeze(
      listing
        .split('\n')
        .map((line) => line.split('\t'))
        .filter((parts): parts is [string, string] => parts.length === 2 && parts[0] !== '' && parts[1] !== undefined)
        .map(([oid, name]) => Object.freeze({ name, head: revisionId(oid) })),
    );
  };

  /**
   * One push's per-ref outcome, from `--porcelain`'s own table.
   *
   * `git push` writes one line per offered ref whether it succeeded or not, so
   * a refused record ref is *data* here rather than a failed command — which is
   * the whole point of the two push sets (A39).
   *
   * @param stdout - The command's `--porcelain` output.
   * @param offered - The local refs, in the order they were offered.
   * @returns One result per offered ref.
   */
  const parsePushPorcelain = async (
    stdout: string,
    offered: readonly string[],
  ): Promise<readonly RevisionPushRefResult[]> => {
    const rows = new Map<string, Readonly<{ flag: string; summary: string }>>();
    for (const line of stdout.split('\n')) {
      const parts = line.split('\t');
      if (parts.length < 3 || parts[0] === undefined || parts[1] === undefined) {
        continue;
      }
      const from = parts[1].split(':')[0] ?? '';
      rows.set(from, Object.freeze({ flag: parts[0], summary: parts[2] ?? '' }));
    }
    return Object.freeze(
      await Promise.all(
        offered.map(async (name): Promise<RevisionPushRefResult> => {
          const row = rows.get(name);
          if (row === undefined || row.flag === '!') {
            return Object.freeze({
              name,
              status: 'rejected',
              head: undefined,
              reason: row === undefined ? 'The remote did not report this ref.' : refusalReason(row.summary),
            });
          }
          const local = await resolve(name);
          return Object.freeze({
            name,
            status: row.flag === '=' ? 'upToDate' : 'updated',
            head: local === undefined ? undefined : revisionId(local),
          });
        }),
      ),
    );
  };

  /**
   * Whether this project directory *is* the top level of a repository.
   *
   * `rev-parse --git-dir` answers for the nearest enclosing repository, so a
   * project nested inside one would adopt it and write its revisions there
   * (review 4 R2). The question the port actually has is whether the store at
   * this path is its own, which only `--show-toplevel` answers.
   *
   * @returns Whether a repository exists here and its top level is this path.
   */
  const ownsStore = async (): Promise<boolean> => {
    /* Discovery, not the pinned store: the question is what is *already* at
     * this path, so `GIT_DIR` must be absent here rather than pointed at the
     * answer. Every `GIT_*` the caller exported is still stripped. */
    const discovery = clearedGitEnvironment();
    const bare = await run(['rev-parse', '--is-bare-repository'], { env: discovery });
    if (bare.exitCode === 0 && textDecoder.decode(bare.stdout).trim() === 'true') {
      // Review 4 R26: a bare repository has no work tree to snapshot, and
      // `--show-toplevel` below would call it "not a repository" and re-init it.
      throw new RevisionPortError(
        'INVALID_REPOSITORY',
        'The project path is a bare repository; a revision store needs a work tree.',
      );
    }
    const result = await run(['rev-parse', '--show-toplevel'], { env: discovery });
    if (result.exitCode !== 0) {
      return false;
    }
    const reported = textDecoder.decode(result.stdout).trim();
    if (reported.length === 0) {
      return false;
    }
    try {
      return (await realpath(reported)) === (await realpath(repositoryPath));
    } catch {
      return false;
    }
  };

  const port: RevisionPort = Object.freeze({
    describe: async (): Promise<RevisionEngineDescriptor> => {
      const reported = await text(['--version']);
      return Object.freeze({
        engine: 'native-git',
        version: reported.replace('git version ', ''),
        objectFormat: await format(),
        changeIds: true,
        conflictsAsValues: true,
        transports: true,
        nWayMerge: false,
        checkouts: checkouts !== undefined,
        largeObjects: true,
      });
    },

    init: async (input: InitRevisionStoreInput): Promise<void> => {
      /* Asked first, and it throws for a bare repository: a path this port
       * refuses is left exactly as it was, ignore file included (review 4 R40).
       * The ordering that matters is the ignore file before `git init`, not
       * before the question of what is already here. */
      const owned = await ownsStore();
      if (input.createSetupFiles !== false) {
        const ignorePath = join(repositoryPath, generatedIgnorePath);
        const existing = await readFile(ignorePath, 'utf8').catch(() => undefined);
        await writeFile(ignorePath, generatedIgnoreContent(existing, input.additionalIgnores ?? []));
        /* Beside the ignore file and versioned like it (D24): the two together are
         * what a stock clone needs to read this project the way Tau wrote it. */
        const attributesPath = join(repositoryPath, generatedGitattributesPath);
        const attributes = await readFile(attributesPath, 'utf8').catch(() => undefined);
        await writeFile(attributesPath, generatedGitattributesContent(attributes));
      }
      // Only now: the repository is created after the file that decides what a
      // snapshot may ever contain already exists.
      if (!owned) {
        await output(['init', '--quiet', `--initial-branch=${initialBranch}`]);
      }
      /* Pointers are Tau's (they must be identical on every host), but a *stock*
       * checkout of this repository — `git worktree add` for a linked checkout,
       * or somebody's own `git clone` — needs git-lfs's filters configured to
       * resolve them. Best effort: a machine without the binary still records
       * and reads revisions through this port, and `resolveGitLfs` is what tells
       * an operator the transport half is missing. */
      await run(['lfs', 'install', '--local']);
    },

    readRevision: async (id: RevisionId): Promise<RevisionRecord | undefined> => {
      const commit = await readCommitObject(id);
      if (commit === undefined) {
        return undefined;
      }
      const entry = entryOf(id, commit);
      return Object.freeze({
        id,
        parents: entry.parents,
        treeId: commit.tree,
        provenance: entry.provenance,
        summary: entry.summary,
        receipt: await receiptOf(id, commit),
      });
    },

    /* One `cat-file` per blob — ponytail: `cat-file --batch` is the upgrade when
     * a tree is big enough for the process count to show up in a profile. */
    readTree: async (id: RevisionId): Promise<ImmutableRevisionTree | undefined> => {
      const commit = await readCommitObject(id);
      if (commit === undefined) {
        return undefined;
      }
      const paths = await listTree(commit.tree);
      const entries = await Promise.all(
        [...paths].map(
          async ([path, { oid, mode }]): Promise<RevisionTreeInput> => [
            path,
            await smudged(await output(['cat-file', 'blob', oid])),
            mode,
          ],
        ),
      );
      return new ImmutableRevisionTree(entries);
    },

    writeRevision: async (input: WriteRevisionInput): Promise<RevisionReceipt> => {
      const treeId = await writeTreeObject(input.tree);
      const trailer: RevisionTrailer = {
        parents: [...input.parents],
        provenance: input.provenance,
        summary: input.summary,
      };
      const commit = encodeCommit({
        objectFormat: await format(),
        tree: treeId,
        parents: [...input.parents],
        /* A26: the person wrote it, Tau recorded it — git's own split. */
        author: revisionAuthorSignature(input.provenance),
        committer: revisionCommitterSignature(input.provenance),
        message: revisionCommitMessage(trailer),
        changeId: deriveChangeId(await format(), { treeId, parents: input.parents, trailer }),
        ...(input.conflict === undefined
          ? {}
          : { conflictedTrees: [...input.conflict.trees], conflictLabels: [...input.conflict.labels] }),
      });
      const written = await run(['hash-object', '-t', 'commit', '-w', '--stdin'], { input: [commit.body] });
      if (written.exitCode !== 0) {
        throw new RevisionPortError('ENGINE_FAILED', 'Native Git refused the revision commit object.');
      }
      return receiptOf(revisionId(textDecoder.decode(written.stdout).trim()), decodeCommit(commit.body));
    },

    /* S31: the same annotated tag bytes the browser leg writes, stored by
     * `hash-object` for the same reason the commit is — `git tag -a` would take
     * its tagger from the repository's config identity, not from the actor. */
    tag: async (input: CreateRevisionTagInput): Promise<RevisionTag> => {
      const named = await resolve(input.revisionId);
      if (named === undefined) {
        throw new RevisionPortError('UNKNOWN_REVISION', 'The revision this name would point at is not in the store.');
      }
      const createdAt = input.createdAt ?? Date.now();
      const object = encodeTag({
        objectFormat: await format(),
        object: input.revisionId,
        tag: input.name,
        tagger: taggerSignature(input.actor, createdAt),
        message: revisionTagMessage({ name: input.name, note: input.note, actor: input.actor }),
      });
      const written = await run(['hash-object', '-t', 'tag', '-w', '--stdin'], { input: [object.body] });
      if (written.exitCode !== 0) {
        throw new RevisionPortError('ENGINE_FAILED', 'Native Git refused the named version tag object.');
      }
      const oid = textDecoder.decode(written.stdout).trim();
      const updated = await run(['update-ref', `${tagRefPrefix}/${input.name}`, oid]);
      if (updated.exitCode !== 0) {
        throw new RevisionPortError('ENGINE_FAILED', `Native Git refused the tag ref ${input.name}.`);
      }
      return Object.freeze({
        name: input.name,
        revisionId: input.revisionId,
        note: input.note,
        actor: input.actor,
        createdAt,
      });
    },

    listTags: async (): Promise<readonly RevisionTag[]> => {
      const records = await text(['for-each-ref', '--format=%(refname)%00%(objectname)', `${tagRefPrefix}/`]);
      const names = records
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => line.split('\0')[0] ?? '')
        .map((ref) => ref.slice(tagRefPrefix.length + 1))
        .filter((name) => name !== '')
        .toSorted();
      const tags = await Promise.all(names.map(async (name) => readTagRef(name)));
      return Object.freeze(tags.filter((entry) => entry !== undefined));
    },

    deleteTag: async (name: string): Promise<void> => {
      const removed = await run(['update-ref', '-d', `${tagRefPrefix}/${name}`]);
      /* Exit 1 is "no such ref": removing a name that is already gone is the
       * outcome the caller asked for. */
      if (removed.exitCode !== 0 && removed.exitCode !== 1) {
        throw new RevisionPortError('ENGINE_FAILED', `Native Git refused to remove the tag ${name}.`);
      }
    },

    readRef: async (name: string): Promise<RevisionId | undefined> => {
      const head = await resolve(refOf(name));
      return head === undefined ? undefined : revisionId(head);
    },

    /**
     * Git's own `update-ref` transaction is the linearization point: the
     * expected-old value is passed to it, so the compare and the write are one
     * operation under the repository's ref lock (I7). The queue below only keeps
     * this process's own concurrent writers off the same name.
     *
     * @param input - The ref, the value it must currently hold, and the new one.
     * @returns The publication, or the conflict that refused it.
     */
    updateRef: async (input: UpdateRevisionRefInput): Promise<UpdateRevisionRefResult> =>
      refQueue.queueFor(`${repositoryPath}:${input.name}`, async () => {
        const ref = refOf(input.name);
        const expected = input.expectedHead ?? (await zeroObjectId());
        const conflicted = async (): Promise<UpdateRevisionRefResult> => {
          const actual = await resolve(ref);
          return Object.freeze({
            status: 'conflicted',
            name: input.name,
            expectedHead: input.expectedHead,
            actualHead: actual === undefined ? undefined : revisionId(actual),
            proposedHead: input.head,
          });
        };
        if (input.head === undefined) {
          const actual = await resolve(ref);
          if (actual !== input.expectedHead) {
            return conflicted();
          }
          if (actual !== undefined) {
            await output(['update-ref', '-d', ref, actual]);
          }
          return Object.freeze({
            status: 'updated',
            name: input.name,
            previousHead: input.expectedHead,
            head: undefined,
          });
        }
        if ((await readCommitObject(input.head)) === undefined) {
          throw new RevisionPortError('UNKNOWN_REVISION', 'Cannot publish a revision the store does not hold.');
        }
        const update = await run(['update-ref', ref, input.head, expected]);
        if (update.exitCode !== 0) {
          return conflicted();
        }
        return Object.freeze({
          status: 'updated',
          name: input.name,
          previousHead: input.expectedHead,
          head: input.head,
        });
      }),

    /* Symbolic, like Git's own HEAD: the file names a *branch*, so a turn
     * recorded onto that branch moves the head with it and nothing is written
     * twice (operator decisions 2026-09-09, question 11). */
    readHead: async (): Promise<RevisionHead | undefined> => {
      const result = await run(['symbolic-ref', '--quiet', 'HEAD']);
      if (result.exitCode !== 0) {
        return undefined;
      }
      const target = textDecoder.decode(result.stdout).trim();
      const symbolic = target.startsWith(symbolicRefPrefix) ? target.slice(symbolicRefPrefix.length).trim() : target;
      const branch = symbolic.startsWith(`${branchRefPrefix}/`) ? symbolic.slice(branchRefPrefix.length + 1) : '';
      return branch === '' ? undefined : Object.freeze({ branch, head: await port.readRef(branch) });
    },

    setHead: async (branch: string): Promise<void> => {
      await refQueue.queueFor(`${repositoryPath}:HEAD`, async () => output(['symbolic-ref', 'HEAD', refOf(branch)]));
    },

    listRefs: async (prefix?: string): Promise<readonly RevisionRef[]> => {
      /* Answered in the vocabulary it was asked in: a `refs/`-qualified prefix
       * names a namespace and gets full names back, a bare one filters branch
       * names as it always has. */
      const qualified = prefix?.startsWith('refs/') === true;
      const namespace = qualified ? prefix.replace(/\/+$/u, '') : branchRefPrefix;
      const records = await text(['for-each-ref', '--format=%(refname)%00%(objectname)', `${namespace}/`]);
      return Object.freeze(
        records
          .split('\n')
          .filter((record) => record !== '')
          .map((record) => {
            const [ref, head] = record.split('\0');
            return { name: qualified ? (ref ?? '') : (ref ?? '').slice(branchRefPrefix.length + 1), head: head ?? '' };
          })
          .filter((reference) => reference.name !== '' && (prefix === undefined || reference.name.startsWith(prefix)))
          .toSorted((left, right) => left.name.localeCompare(right.name))
          .map((reference) => Object.freeze({ name: reference.name, head: revisionId(reference.head) })),
      );
    },

    /* One `cat-file` per commit, which is what keeps the walk tree-free —
     * ponytail: `cat-file --batch` if a long history ever shows up hot. */
    log: async (input?: RevisionLogInput): Promise<readonly RevisionLogEntry[]> => {
      const references = input?.heads === undefined ? await port.listRefs() : undefined;
      const heads = [...(input?.heads ?? (references ?? []).map((reference) => reference.head))];
      /* One `cat-file` per revision the order actually needs — ponytail:
       * `cat-file --batch` is the upgrade when an unbounded log over a long
       * history shows up in a profile. `rev-list` is gone: it answered a set,
       * and the walk needs the set the promised order reaches, not git's. */
      return Object.freeze(
        await walkRevisionLog(
          heads,
          async (id) => {
            const commit = await readCommitObject(id);
            return commit === undefined
              ? undefined
              : {
                  parents: commit.parents.map((parent) => revisionId(parent)),
                  seconds: commit.committer.seconds,
                  entry: entryOf(id, commit),
                };
          },
          input?.limit,
        ),
      );
    },

    diff: async (input: RevisionDiffInput): Promise<readonly RevisionDiffEntry[]> => {
      await requireCommit(input.to);
      if (input.from === undefined) {
        const added = await listTree(input.to);
        return Object.freeze([...added.keys()].sort().map((path) => frozenChange(path, 'added')));
      }
      await requireCommit(input.from);
      const records = textDecoder
        .decode(await output(['diff-tree', '-r', '-z', '--no-renames', '--name-status', input.from, input.to]))
        .split('\0')
        .filter((record) => record !== '');
      const changes: RevisionDiffEntry[] = [];
      for (let index = 0; index + 1 < records.length; index += 2) {
        const kind = diffKind(records[index]!);
        if (kind === undefined) {
          throw new RevisionPortError('ENGINE_FAILED', 'Native Git reported an unsupported change kind.');
        }
        changes.push(frozenChange(records[index + 1]!, kind));
      }
      return Object.freeze(changes.toSorted((left, right) => left.path.localeCompare(right.path)));
    },

    listRemoteRefs: listRemoteReferences,

    /**
     * Bring the remote's refs into this store's remote-tracking half.
     *
     * A fetch never moves a branch: every ref lands under
     * `refs/remotes/<remote>/…`, and the merge that follows is the ordinary one
     * (A22). Clean named versions are also materialized under `refs/tags/*`,
     * while a locally moved tag is preserved for its leased push. Unnamed, it
     * takes everything the remote advertises that is not host-local — a remote
     * may advertise whatever it likes, and the ones this host keeps to itself
     * are simply not tracked.
     *
     * @param input - The remote, and optionally the refs to take.
     * @returns The remote-tracking refs this store now holds.
     */
    fetch: async (input: RevisionFetchInput): Promise<RevisionFetchResult> => {
      guardTransportValue(input.remote, 'remote');
      const advertised = input.refs === undefined ? await listRemoteReferences(input.remote) : undefined;
      const wanted =
        advertised === undefined
          ? (input.refs ?? [])
          : advertised.map((reference) => reference.name).filter((ref) => !isHostLocalRef(ref));
      for (const ref of wanted) {
        guardTransportValue(ref, 'ref', true);
      }
      if (wanted.length === 0) {
        return Object.freeze({ refs: Object.freeze([]) });
      }
      const rawRef = async (name: string): Promise<string | undefined> => {
        const oid = await text(['for-each-ref', '--format=%(objectname)', name]);
        return oid === '' ? undefined : oid;
      };
      const previousTags = await Promise.all(
        wanted
          .filter((ref) => ref.startsWith(`${tagRefPrefix}/`))
          .map(async (ref) => {
            const tracked = remoteTrackingRef(input.remote, ref);
            return { local: ref, tracked, localHead: await rawRef(ref), remoteHead: await rawRef(tracked) };
          }),
      );
      await output(
        [
          'fetch',
          '--no-tags',
          '--',
          input.remote,
          ...wanted.map((ref) => `+${ref}:${remoteTrackingRef(input.remote, ref)}`),
        ],
        { env: await remoteEnvironment(input.remote), signal: input.signal },
      );
      const configuredRemotes = await port.listRemotes();
      const configuredRemote = configuredRemotes.find((remote) => remote.name === input.remote);
      const fetchedReferences = wanted.map((ref) => remoteTrackingRef(input.remote, ref));
      const fetchedLargeObjects = await largeObjectPaths(fetchedReferences.map((name) => ({ name })));
      if (fetchedLargeObjects.length > 0 && remoteCarriesLargeObjects(configuredRemote ?? input.remote)) {
        await output(['lfs', 'fetch', '--', input.remote, ...fetchedReferences], {
          env: await remoteEnvironment(input.remote),
          signal: input.signal,
        });
      }
      await Promise.all(
        previousTags.map(async ({ local, tracked, localHead, remoteHead }) => {
          const fetchedHead = await rawRef(tracked);
          if (fetchedHead === undefined || (localHead !== undefined && localHead !== remoteHead)) {
            return;
          }
          const updated = await run(['update-ref', local, fetchedHead, localHead ?? (await zeroObjectId())]);
          if (updated.exitCode !== 0 && (await rawRef(local)) === localHead) {
            throw new RevisionPortError('ENGINE_FAILED', `Native Git could not materialize the fetched tag ${local}.`);
          }
        }),
      );
      const tracked = await Promise.all(
        wanted.map(async (ref) => {
          const name = remoteTrackingRef(input.remote, ref);
          const head = await resolve(name);
          return head === undefined ? undefined : Object.freeze({ name, head: revisionId(head) });
        }),
      );
      return Object.freeze({ refs: Object.freeze(tracked.filter((reference) => reference !== undefined)) });
    },

    /**
     * Offer refs to the remote and report every one's outcome.
     *
     * `--atomic` is the caller's choice because the two push sets differ in
     * exactly that (A39): the history set lands together or not at all, and the
     * record set does not, so a chat ref the server refuses leaves `main`
     * pushed. The command's own non-zero exit on a partial refusal is therefore
     * not an error here — the porcelain table is the answer.
     *
     * @param input - The remote, the refs, and whether they are atomic.
     * @returns One result per offered ref, in the order offered.
     */
    push: async (input: RevisionPushInput): Promise<RevisionPushResult> => {
      guardTransportValue(input.remote, 'remote');
      if (input.refs.length === 0) {
        throw new RevisionPortError('INVALID_TRANSPORT', 'push requires at least one ref.');
      }
      for (const ref of input.refs) {
        guardTransportValue(ref.name, 'ref', true);
        if (ref.remoteName !== undefined) {
          guardTransportValue(ref.remoteName, 'remote ref', true);
        }
        if (ref.expected !== undefined) {
          guardTransportValue(ref.expected, 'lease');
        }
      }
      /*
       * P20, before `git push` is spawned — which is also before git-lfs's own
       * `pre-push` hook can run, since that hook is `git push`'s. So *this* is
       * what decides, on both legs, and no `GIT_LFS_SKIP_PUSH` is needed: a
       * remote that cannot hold large objects is refused by name with the
       * files, rather than the disk leg quietly succeeding through git-lfs's
       * own transfer while the browser leg fails (A15, W12 review R3).
       */
      const configuredRemotes = await port.listRemotes();
      const configuredRemote = configuredRemotes.find((remote) => remote.name === input.remote);
      const large = await largeObjectPaths(input.refs);
      if (!remoteCarriesLargeObjects(configuredRemote ?? input.remote) && large.length > 0) {
        throw new RevisionPortError('LFS_REMOTE_UNSUPPORTED', lfsRemoteUnsupportedMessage(large));
      } else if (large.length > 0) {
        await output(['lfs', 'push', '--', input.remote, ...input.refs.map((ref) => ref.name)], {
          env: await remoteEnvironment(input.remote),
        });
      }
      /* The lease, per ref (A32, S24, D14). `--force-with-lease=<dst>:<expect>`
       * allows the non-fast-forward a rewritten history needs *only* while the
       * remote ref is exactly where this host last saw it; an empty `<expect>`
       * leases "must not exist". A ref whose lease is stale comes back as one
       * `!` row and the remote ref is not touched — never a plain `--force`,
       * which would overwrite whatever moved. */
      const leases = input.refs
        .filter((ref) => 'expected' in ref)
        .map((ref) => `--force-with-lease=${ref.remoteName ?? ref.name}:${ref.expected ?? ''}`);
      const result = await run(
        [
          'push',
          '--porcelain',
          ...(input.atomic === true ? ['--atomic'] : []),
          ...leases,
          '--',
          input.remote,
          ...input.refs.map((ref) => `${ref.name}:${ref.remoteName ?? ref.name}`),
        ],
        { env: await remoteEnvironment(input.remote) },
      );
      const stdout = textDecoder.decode(result.stdout);
      /* A push that never reached the remote reports no table at all; one the
       * remote refused in part reports every row and exits non-zero. */
      if (result.exitCode !== 0 && !stdout.includes('\t')) {
        throw new RevisionPortError('ENGINE_FAILED', 'Native Git could not reach the remote.');
      }
      return Object.freeze({
        refs: await parsePushPorcelain(
          stdout,
          input.refs.map((ref) => ref.name),
        ),
      });
    },

    listRemotes: async (): Promise<readonly Remote[]> => {
      const result = await run(['config', '--get-regexp', String.raw`^remote\..*\.url$`]);
      /* Exit code 1 is "no match", which is a project with no remote. */
      if (result.exitCode !== 0) {
        return Object.freeze([]);
      }
      const remotes = textDecoder
        .decode(result.stdout)
        .split('\n')
        .map((line) => /^remote\.(?<name>.+)\.url (?<url>.+)$/u.exec(line.trim())?.groups)
        .filter((groups) => groups?.['name'] !== undefined && groups['url'] !== undefined)
        .map((groups) => ({ name: groups!['name']!, url: groups!['url']! }));
      const records = await Promise.all(
        remotes.map(async (remote) => {
          const provider = await optionalConfig(`remote.${remote.name}.tauProvider`);
          const repositoryId = await optionalConfig(`remote.${remote.name}.tauRepositoryId`);
          const fetchOnly = await optionalConfig(`remote.${remote.name}.tauFetchOnly`);
          return remoteOf(remote.name, remote.url, {
            ...(provider === 'github' ? { provider } : {}),
            ...(/^\d+$/u.test(repositoryId) ? { repositoryId } : {}),
            ...(fetchOnly === 'true' ? { fetchOnly: true } : {}),
          });
        }),
      );
      return Object.freeze(records.toSorted((left, right) => left.name.localeCompare(right.name)));
    },

    setRemote: async (input: SetRevisionRemoteInput): Promise<void> => {
      guardTransportValue(input.name, 'remote');
      guardTransportValue(input.url, 'url');
      let githubRepositoryId: string | undefined;
      if (input.provider === 'github') {
        if (input.repositoryId !== undefined && /^\d+$/u.test(input.repositoryId)) {
          githubRepositoryId = input.repositoryId;
        } else {
          throw new TypeError('A GitHub remote requires a decimal repository id.');
        }
      }
      const existing = await port.listRemotes();
      await output([
        'remote',
        ...(existing.some((remote) => remote.name === input.name) ? ['set-url'] : ['add']),
        input.name,
        input.url,
      ]);
      if (githubRepositoryId === undefined) {
        await run(['config', '--unset-all', `remote.${input.name}.tauProvider`]);
        await run(['config', '--unset-all', `remote.${input.name}.tauRepositoryId`]);
      } else {
        await output(['config', `remote.${input.name}.tauProvider`, 'github']);
        await output(['config', `remote.${input.name}.tauRepositoryId`, githubRepositoryId]);
      }
      await (input.fetchOnly === true
        ? output(['config', `remote.${input.name}.tauFetchOnly`, 'true'])
        : run(['config', '--unset-all', `remote.${input.name}.tauFetchOnly`]));
    },

    removeRemote: async (name: string): Promise<void> => {
      guardTransportValue(name, 'remote');
      /* Idempotent: removing a remote a project never had is not a failure. */
      await run(['remote', 'remove', name]);
    },

    changeId: async (id: RevisionId): Promise<string | undefined> => {
      const commit = await readCommitObject(id);
      return commit?.changeId;
    },

    conflicts: async (id: RevisionId): Promise<RevisionConflict | undefined> => {
      const commit = await readCommitObject(id);
      return commit?.conflictedTrees === undefined
        ? undefined
        : Object.freeze({
            trees: commit.conflictedTrees,
            labels: commit.conflictLabels ?? Object.freeze([]),
          });
    },

    listCheckouts: async (): Promise<readonly Checkout[]> => listWorktrees(),

    /**
     * One checkout per branch — the rule Git already enforces, refused here with
     * the port's own code so both legs answer the same way.
     *
     * @param input - The branch, and where an unborn one starts.
     * @returns The checkout that now holds that branch.
     */
    addCheckout: async (input: AddCheckoutInput): Promise<Checkout> => {
      const { projectId, directory } = requireCheckouts();
      const existing = await listWorktrees();
      if (existing.some((checkout) => checkout.branch === input.branch)) {
        throw new RevisionPortError('CHECKOUT_CONFLICT', `Branch ${input.branch} already has a checkout.`);
      }
      const head = await port.readRef(input.branch);
      const base = head ?? input.from;
      if (base === undefined) {
        throw new RevisionPortError(
          'UNKNOWN_REVISION',
          `Branch ${input.branch} is unborn; a checkout of it needs an explicit base revision.`,
        );
      }
      const tree = await port.readTree(base);
      if (tree === undefined) {
        throw new RevisionPortError('UNKNOWN_REVISION', `The store holds no tree for revision ${base}.`);
      }
      assertMaterializableRevisionTree(tree);
      const id = await checkoutIdOf(input.branch);
      const root = join(directory, id);
      await output([
        'worktree',
        'add',
        ...(head === undefined ? ['-b', input.branch] : []),
        root,
        head === undefined ? base : input.branch,
      ]);
      return Object.freeze({ id, projectId, root, kind: 'linked', branch: input.branch, baseRevisionId: base });
    },

    removeCheckout: async (id: string): Promise<void> => {
      requireCheckouts();
      if (id === liveCheckoutId) {
        throw new RevisionPortError('CHECKOUT_CONFLICT', 'The live checkout is the project; it cannot be removed.');
      }
      const worktrees = await listWorktrees();
      const existing = worktrees.find((checkout) => checkout.id === id);
      if (existing === undefined) {
        throw new RevisionPortError('CHECKOUT_CONFLICT', `No checkout is registered as ${id}.`);
      }
      /* `--force` because git's own dirty check is meaningless here: Tau applies
       * trees through the filesystem provider, never `git checkout`, so the
       * index is always stale and an unforced remove would always refuse. The
       * real gate is one layer up — `removeCheckout` in `revision-effects.ts`
       * compares the checkout's head tree against a live capture and refuses
       * work that is not in a revision yet (a1 review R7). */
      await output(['worktree', 'remove', '--force', existing.root]);
    },
  });

  return port;
};
