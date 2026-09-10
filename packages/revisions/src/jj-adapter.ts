/**
 * `RevisionPort` over the pinned Jujutsu CLI (S-ENGINE).
 *
 * Every command is spawned with an explicit deadline, output limit and abort
 * signal, with the generated per-project configuration bound through
 * `JJ_CONFIG` and the operation log attributed per agent through
 * `JJ_OP_USERNAME`. Service reads pass `--ignore-working-copy` so observing the
 * graph never mutates the working copy.
 *
 * The executable is never assumed to be on `PATH`: a host either passes the
 * verified binary or resolves one through `resolveJjExecutable`.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { hostname, userInfo } from 'node:os';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import type { RevisionId } from '@taucad/filesystem/revisions';
import type { RevisionProvenance } from '#revision-authority.js';
import { CommandAbortedError, runCommand, runGitCommand } from '#git-command.js';
import type { CommandBounds, GitCommandResult } from '#git-command.js';
import type { ObjectFormat } from '#object-hash.js';
import { decodeCommit } from '#git-objects.js';
import { parseRevisionCommitMessage, revisionCommitMessage } from '#revision-headers.js';
import { RevisionPortError } from '#revision-port.js';
import type {
  ImportRevisionBundleInput,
  InitRevisionStoreInput,
  RevisionBundleInput,
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
  RevisionRef,
  RevisionTransportInput,
  UpdateRevisionRefInput,
  UpdateRevisionRefResult,
  WriteRevisionInput,
} from '#revision-port.js';
import {
  excludedRevisionPaths,
  generatedIgnoreContent,
  generatedIgnorePath,
  generatedJjConfigContent,
  generatedJjConfigPath,
} from '#workspace-config.js';

/** Environment variable naming the verified Jujutsu binary. @public */
export const jjExecutableEnvironmentVariable = 'TAU_JJ_EXECUTABLE';

/** Configuration for one Jujutsu-backed revision port. @public */
export type JjRevisionPortOptions = CommandBounds &
  Readonly<{
    /** Workspace root. The repository, the generated ignore file and the config live here. */
    workspaceRoot: string;
    /** Verified Jujutsu binary. Defaults to `TAU_JJ_EXECUTABLE`. */
    jjExecutable?: string;
    /** Git binary used only to read the two commit headers Jujutsu exposes in no template. */
    gitExecutable?: string;
    /** Operation-log attribution for this agent. Defaults to the OS user. */
    operationUser?: string;
    /** Root entries never materialized or removed by `writeRevision`. */
    protectedEntries?: readonly string[];
  }>;

const recordSeparator = '';
const unitSeparator = '';
const rootCommitPattern = /^0+$/u;
const branchRefPrefix = 'refs/heads/';
/** The live tree's head, outside `refs/heads` so no engine mistakes it for a branch. */
const tauHeadRef = 'refs/tau/head';
/**
 * Never removed or replaced by `writeRevision`: exactly the non-authored rows
 * of {@link revisionPathPolicy} — the engines' own state, the derived
 * directories the generated ignore excludes, and the two generated files
 * themselves, which `init` owns and no revision carries.
 *
 * A blanket `.tau` used to stand here, which kept an authored `.tau/parameters`
 * file the next revision deleted (RC6 collision 4): the clear skipped the whole
 * directory, so the stale file was still on disk when the snapshot ran.
 */
const defaultProtectedEntries: readonly string[] = excludedRevisionPaths;

const logTemplate =
  ['commit_id', 'change_id', 'parents.map(|c| c.commit_id()).join(",")', 'if(conflict, "1", "0")', 'description'].join(
    ` ++ "${unitSeparator}" ++ `,
  ) + ` ++ "${recordSeparator}"`;

/**
 * Resolve the Jujutsu binary for this host.
 *
 * @param explicit - A caller-supplied path, taking precedence.
 * @returns The absolute executable path, or `undefined` when none is configured.
 * @public
 */
export const resolveJjExecutable = (explicit?: string): string | undefined => {
  const candidate = explicit ?? process.env[jjExecutableEnvironmentVariable];
  return candidate === undefined || candidate === '' ? undefined : resolve(candidate);
};

/**
 * Create a `RevisionPort` backed by the pinned Jujutsu CLI.
 *
 * @param options - Workspace root, binary, attribution and command bounds.
 * @returns A lazy port; the binary is resolved on the first operation.
 * @public
 * @example <caption>Attach a Jujutsu workspace</caption>
 * ```typescript
 * import { createJjRevisionPort } from '@taucad/revisions/node';
 *
 * const port = createJjRevisionPort({ workspaceRoot: '/srv/tau/project' });
 * await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
 * ```
 */
export const createJjRevisionPort = (options: JjRevisionPortOptions): RevisionPort => {
  const workspaceRoot = resolve(options.workspaceRoot);
  const configPath = join(workspaceRoot, generatedJjConfigPath);
  const protectedEntries = new Set(options.protectedEntries ?? defaultProtectedEntries);
  /* A protected entry can sit *inside* an authored directory (`.tau/cache` under
   * `.tau`), so the clear has to descend into that directory rather than skip
   * it whole — which is what the retired blanket `.tau` did. */
  const protectedAncestors = new Set(
    [...protectedEntries].flatMap((entry) =>
      entry
        .split('/')
        .slice(0, -1)
        .map((_, index, segments) => segments.slice(0, index + 1).join('/')),
    ),
  );
  const operationUser = options.operationUser ?? userInfo().username;
  let objectFormat: Promise<ObjectFormat> | undefined;

  const executable = (): string => {
    const found = resolveJjExecutable(options.jjExecutable);
    if (found === undefined) {
      throw new RevisionPortError(
        'ENGINE_UNAVAILABLE',
        `No Jujutsu binary is configured. Set ${jjExecutableEnvironmentVariable} to a verified executable.`,
      );
    }
    return found;
  };

  const runResult = async (
    args: readonly string[],
    environment: Readonly<Record<string, string>> = {},
  ): Promise<Readonly<{ stdout: Uint8Array<ArrayBuffer>; stderr: string }>> => {
    let result;
    try {
      result = await runCommand({
        executable: executable(),
        cwd: workspaceRoot,
        args: ['--color=never', '--no-pager', ...args],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment variable names.
        env: { JJ_CONFIG: configPath, JJ_OP_USERNAME: operationUser, JJ_OP_HOSTNAME: hostname(), ...environment },
        ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
        ...(options.maxBuffer === undefined ? {} : { maxBuffer: options.maxBuffer }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      if (error instanceof CommandAbortedError || error instanceof RevisionPortError) {
        throw error;
      }
      throw new RevisionPortError('ENGINE_UNAVAILABLE', 'The Jujutsu binary could not be started.', { cause: error });
    }
    const stderr = new TextDecoder().decode(result.stderr).trim();
    if (result.exitCode !== 0) {
      /* The message names the operation only: jj echoes caller strings —
       * credentialed remote URLs, absolute paths — into stderr, and a message a
       * UI renders must never carry them (frozen S3 gate 9, 8-review M2). The
       * raw text stays reachable as the cause for a debugger. */
      throw new RevisionPortError(
        'ENGINE_FAILED',
        `Jujutsu failed the ${args.find((argument) => !argument.startsWith('-')) ?? 'requested'} operation.`,
        { cause: new Error(stderr) },
      );
    }
    return { stdout: result.stdout, stderr };
  };

  const runBytes = async (
    args: readonly string[],
    environment: Readonly<Record<string, string>> = {},
  ): Promise<Uint8Array<ArrayBuffer>> => {
    const result = await runResult(args, environment);
    return result.stdout;
  };

  const run = async (args: readonly string[], environment: Readonly<Record<string, string>> = {}): Promise<string> =>
    new TextDecoder().decode(await runBytes(args, environment));

  /**
   * Read through the engine without touching the working copy, so observing the
   * graph can never mutate it.
   *
   * @param args - Arguments after the global read flags.
   * @returns Decoded standard output.
   */
  const read = async (args: readonly string[]): Promise<string> => run(['--ignore-working-copy', ...args]);

  /**
   * The byte-preserving form of `read`, for file content.
   *
   * @param args - Arguments after the global read flags.
   * @returns Raw standard output.
   */
  const readBytes = async (args: readonly string[]): Promise<Uint8Array<ArrayBuffer>> =>
    runBytes(['--ignore-working-copy', ...args]);

  /**
   * Read one raw commit body from the Git object store Jujutsu colocates, for
   * the two headers Jujutsu exposes in no template.
   *
   * @param id - Revision to read.
   * @returns The commit object body.
   */
  const readCommitObject = async (id: RevisionId): Promise<Uint8Array<ArrayBuffer>> => {
    const result = await runGitCommand({
      gitExecutable: options.gitExecutable ?? 'git',
      cwd: workspaceRoot,
      args: ['cat-file', 'commit', id],
      ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (result.exitCode !== 0) {
      throw new RevisionPortError('ENGINE_FAILED', 'The colocated Git store could not read the commit object.');
    }
    return result.stdout;
  };

  const parseLog = (output: string): readonly RevisionLogEntry[] =>
    output
      .split(recordSeparator)
      .filter((record) => record.trim() !== '')
      .map((record) => record.split(unitSeparator))
      .filter(([commitId]) => commitId !== undefined && !rootCommitPattern.test(commitId))
      .map(([commitId, changeId, parents, conflicted, description]): RevisionLogEntry => {
        const trailer = parseRevisionCommitMessage(description ?? '');
        const unattributed: RevisionProvenance = { source: 'import', actorId: 'unknown', createdAt: 0 };
        return Object.freeze({
          id: revisionId(commitId!),
          changeId: changeId!,
          parents: Object.freeze(
            (parents ?? '')
              .split(',')
              .filter((parent) => parent !== '' && !rootCommitPattern.test(parent))
              .map((parent) => revisionId(parent)),
          ),
          summary: trailer?.summary ?? { generated: (description ?? '').split('\n')[0] ?? '' },
          provenance: trailer?.provenance ?? unattributed,
          conflicted: conflicted === '1',
        });
      });

  const entryFor = async (id: RevisionId): Promise<RevisionLogEntry | undefined> => {
    try {
      const output = await read(['log', '--no-graph', '-r', id, '-T', logTemplate]);
      return parseLog(output)[0];
    } catch (error) {
      if (error instanceof RevisionPortError && error.code === 'ENGINE_FAILED') {
        return undefined;
      }
      throw error;
    }
  };

  /**
   * The hash is a recorded repository property, never an assumption (I-HASH).
   *
   * @returns The format this repository actually uses.
   */
  const resolveObjectFormat = async (): Promise<ObjectFormat> => {
    objectFormat ??= (async () => {
      const result = await runGitCommand({
        gitExecutable: options.gitExecutable ?? 'git',
        cwd: workspaceRoot,
        args: ['rev-parse', '--show-object-format'],
        ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      const reported = new TextDecoder().decode(result.stdout).trim();
      if (result.exitCode !== 0 || (reported !== 'sha1' && reported !== 'sha256')) {
        throw new RevisionPortError('INVALID_REPOSITORY', 'The repository object format could not be recorded.');
      }
      return reported;
    })();
    return objectFormat;
  };

  /** One colocated-Git command under this port's own bounds. */
  const git = async (args: readonly string[]): Promise<GitCommandResult> =>
    runGitCommand({
      gitExecutable: options.gitExecutable ?? 'git',
      cwd: workspaceRoot,
      args: [...args],
      ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

  const receiptFor = async (entry: RevisionLogEntry): Promise<RevisionReceipt> =>
    Object.freeze({
      engine: 'jj',
      commitId: entry.id,
      changeId: entry.changeId,
      objectFormat: await resolveObjectFormat(),
      conflicted: entry.conflicted,
    });

  /**
   * Remove every authored file so the next snapshot sees exactly the requested
   * tree, keeping the protected families and nothing else.
   *
   * @param directory - Directory to clear.
   * @param prefix - That directory's root-relative path; `''` at the root.
   */
  const clearWorkingCopy = async (directory: string, prefix = ''): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (protectedEntries.has(relativePath)) {
        continue;
      }
      if (protectedAncestors.has(relativePath) && entry.isDirectory()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- removal order is deterministic and bounded by the tree.
        await clearWorkingCopy(join(directory, entry.name), relativePath);
        continue;
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- removal order is deterministic and bounded by the tree.
      await rm(join(directory, entry.name), { recursive: true, force: true });
    }
  };

  const port: RevisionPort = Object.freeze({
    describe: async (): Promise<RevisionEngineDescriptor> => {
      const reported = await run(['--version']);
      const version = reported.trim();
      return Object.freeze({
        engine: 'jj',
        version,
        objectFormat: await resolveObjectFormat(),
        changeIds: true,
        conflictsAsValues: true,
        transports: true,
        // Jujutsu has no bundle command; a bundle is produced by the native Git
        // adapter over the same colocated store.
        bundles: false,
        nWayMerge: true,
      });
    },

    init: async (input: InitRevisionStoreInput): Promise<void> => {
      const ignorePath = join(workspaceRoot, generatedIgnorePath);
      await mkdir(dirname(configPath), { recursive: true });
      const existing = await readFile(ignorePath, 'utf8').catch(() => undefined);
      await writeFile(ignorePath, generatedIgnoreContent(existing, input.additionalIgnores ?? []));
      await writeFile(configPath, generatedJjConfigContent(input.author));
      // Only now, with the ignore file and the size limit already in place —
      // and only when there is no repository yet. `jj git init` refuses an
      // initialized workspace ("The target repo already exists"), and a host
      // that reopens a project must not have to remember whether it is the
      // first (RC3 hard gate 1). The rewrite above stays: it is idempotent, and
      // it is what keeps the generated policy current across upgrades.
      if (!existsSync(join(workspaceRoot, '.jj'))) {
        await run(['git', 'init']);
      }
    },

    readRevision: async (id: RevisionId): Promise<RevisionRecord | undefined> => {
      const entry = await entryFor(id);
      if (entry === undefined) {
        return undefined;
      }
      // Jujutsu exposes no tree id in any template, so it comes from the commit
      // object in the colocated Git store — the same route `conflicts` takes.
      const commit = decodeCommit(await readCommitObject(entry.id));
      return Object.freeze({
        id: entry.id,
        parents: entry.parents,
        treeId: commit.tree,
        provenance: entry.provenance,
        summary: entry.summary,
        receipt: await receiptFor(entry),
      });
    },

    readTree: async (id: RevisionId): Promise<ImmutableRevisionTree | undefined> => {
      if ((await entryFor(id)) === undefined) {
        return undefined;
      }
      const listed = await read(['file', 'list', '-r', id]);
      const paths = listed
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
      const entries: Array<readonly [string, Uint8Array<ArrayBuffer>]> = [];
      for (const path of paths) {
        // Ponytail: one spawn per file. Fine for a workspace, slow for a
        // monorepo — swap in one `git cat-file --batch` over the colocated store
        // when a tree read shows up in a profile.
        // oxlint-disable-next-line eslint/no-await-in-loop -- bounded sequential reads keep peak memory at one file.
        entries.push([path, await readBytes(['file', 'show', '-r', id, '--', path])]);
      }
      return new ImmutableRevisionTree(entries);
    },

    writeRevision: async (input: WriteRevisionInput): Promise<RevisionReceipt> => {
      if (input.conflict !== undefined) {
        throw new RevisionPortError(
          'UNSUPPORTED_OPERATION',
          'Jujutsu computes conflicted revisions itself; omit the tree instead of supplying conflict terms.',
        );
      }
      const parents = input.parents.length === 0 ? ['root()'] : [...input.parents];
      await run(['new', ...parents]);
      if (input.tree !== undefined) {
        await clearWorkingCopy(workspaceRoot);
        for (const entry of input.tree.entries()) {
          const target = join(workspaceRoot, entry.path);
          if (!`${target}${sep}`.startsWith(`${workspaceRoot}${sep}`)) {
            throw new RevisionPortError('INVALID_REPOSITORY', 'A revision tree entry escaped the workspace root.');
          }
          // oxlint-disable-next-line eslint/no-await-in-loop -- deterministic sequential writes bound peak memory.
          await mkdir(dirname(target), { recursive: true });
          // oxlint-disable-next-line eslint/no-await-in-loop -- the snapshot must observe a complete tree.
          await writeFile(target, entry.content);
        }
      }
      const message = revisionCommitMessage({
        parents: [...input.parents],
        provenance: input.provenance,
        summary: input.summary,
      });
      const createdAt = new Date(input.provenance.createdAt).toISOString();
      // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment variable names.
      await run(['describe', '-m', message], { JJ_TIMESTAMP: createdAt, JJ_TZ_OFFSET_MINS: '0' });
      const recorded = await read(['log', '--no-graph', '-r', '@', '-T', logTemplate]);
      const entry = parseLog(recorded)[0];
      if (entry === undefined) {
        throw new RevisionPortError('ENGINE_FAILED', 'Jujutsu did not report the revision it just recorded.');
      }
      return receiptFor(entry);
    },

    readRef: async (name: string): Promise<RevisionId | undefined> => {
      /* The colocated Git ref is the single source for both halves of a ref:
       * `updateRef` compare-and-sets it, so reading it back here sees every
       * writer at once — a `jj log --ignore-working-copy` read skips jj's own
       * git import and answers from the last imported view (7-review S2) —
       * and a bookmark jj holds as conflicted still reads as one value here
       * rather than throwing (7-review S3). */
      const result = await runGitCommand({
        gitExecutable: options.gitExecutable ?? 'git',
        cwd: workspaceRoot,
        args: ['rev-parse', '--verify', '--quiet', `refs/heads/${name}^{commit}`],
        ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      if (result.exitCode !== 0) {
        return undefined;
      }
      const output = new TextDecoder().decode(result.stdout).trim();
      return output === '' || rootCommitPattern.test(output) ? undefined : revisionId(output);
    },

    /**
     * One compare-and-set on the colocated Git store, not a read then a write.
     *
     * `readRef` followed by `jj bookmark set` is a TOCTOU with no linearization
     * point: six concurrent publications from an unborn ref all observed
     * "unborn" and all reported `updated`, and the race could leave a
     * *conflicted* bookmark that made `readRef` throw (RC3 hard gate 3).
     * `git update-ref <ref> <new> <old>` takes the ref's own lockfile, so the
     * winner is decided by the filesystem — across processes, which an
     * in-process mutex could never give. An omitted `head` deletes under the
     * same check.
     *
     * @param input - The ref, its expected old head, and the new head (absent to delete).
     * @returns The published head, or the conflict that refused it.
     */
    updateRef: async (input: UpdateRevisionRefInput): Promise<UpdateRevisionRefResult> => {
      const conflicted = async (): Promise<UpdateRevisionRefResult> =>
        Object.freeze({
          status: 'conflicted',
          name: input.name,
          expectedHead: input.expectedHead,
          actualHead: await port.readRef(input.name),
          proposedHead: input.head,
        });
      if (input.head === undefined && input.expectedHead === undefined) {
        // Delete a ref that must be unborn: nothing to lock, and nothing to do.
        return (await port.readRef(input.name)) === undefined
          ? Object.freeze({ status: 'updated', name: input.name, previousHead: undefined, head: undefined })
          : conflicted();
      }
      const unborn = '0'.repeat((await resolveObjectFormat()) === 'sha256' ? 64 : 40);
      const reference = `refs/heads/${input.name}`;
      const expected = input.expectedHead ?? unborn;
      const result = await runGitCommand({
        gitExecutable: options.gitExecutable ?? 'git',
        cwd: workspaceRoot,
        args:
          input.head === undefined
            ? ['update-ref', '-d', reference, expected]
            : ['update-ref', reference, input.head, expected],
        ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      if (result.exitCode !== 0) {
        return conflicted();
      }
      /* The ref is durable in the colocated store at this point, and `readRef`
       * answers from it; the import only refreshes jj's own view, so its
       * failure must not turn a landed publication into an error (8-review S6). */
      await run(['git', 'import']).catch(() => undefined);
      return Object.freeze({
        status: 'updated',
        name: input.name,
        previousHead: input.expectedHead,
        head: input.head,
      });
    },

    listRefs: async (prefix?: string): Promise<readonly RevisionRef[]> => {
      const output = await read([
        'bookmark',
        'list',
        '-T',
        `name ++ "${unitSeparator}" ++ normal_target.commit_id() ++ "${recordSeparator}"`,
      ]);
      return Object.freeze(
        output
          .split(recordSeparator)
          .filter((record) => record.trim() !== '')
          .map((record) => record.split(unitSeparator))
          .filter(([name, head]) => name !== undefined && head !== undefined && head !== '')
          .filter(([name]) => prefix === undefined || name!.startsWith(prefix))
          .map(([name, head]) => Object.freeze({ name: name!, head: revisionId(head!) })),
      );
    },

    log: async (input?: RevisionLogInput): Promise<readonly RevisionLogEntry[]> => {
      /* An explicit empty `heads` walks nothing — `ancestors()` is not a revset,
       * and a fresh store's first `load()` asks exactly that (8-review M1). */
      const revset =
        input?.heads === undefined
          ? 'all()'
          : input.heads.length === 0
            ? 'none()'
            : `ancestors(${input.heads.join('|')})`;
      const limit = input?.limit === undefined ? [] : ['-n', String(input.limit)];
      const output = await read(['log', '--no-graph', '-r', revset, ...limit, '-T', logTemplate]);
      return parseLog(output);
    },

    diff: async (input: RevisionDiffInput): Promise<readonly RevisionDiffEntry[]> => {
      const from = input.from ?? 'root()';
      const output = await read(['diff', '--summary', '--from', from, '--to', input.to]);
      return Object.freeze(
        output
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line): RevisionDiffEntry => {
            const marker = line.slice(0, 1);
            return Object.freeze({
              path: line.slice(2),
              kind: marker === 'A' ? 'added' : marker === 'D' ? 'deleted' : 'modified',
            });
          }),
      );
    },

    fetch: async (input: RevisionTransportInput): Promise<void> => {
      await run(['git', 'fetch', '--remote', input.remote]);
    },

    /**
     * A refspec that matched no bookmark is a failed push, not a silent one.
     *
     * Jujutsu exits 0 and warns on standard error, so a caller could not tell
     * "pushed" from "nothing matched" (RC3 C4). The wording matched below is
     * the pinned binary's own, read from its stream.
     *
     * @param input - The remote and refspecs to push.
     */
    push: async (input: RevisionTransportInput): Promise<void> => {
      const { stderr } = await runResult([
        'git',
        'push',
        '--remote',
        input.remote,
        ...input.refspecs.flatMap((ref) => ['--bookmark', ref]),
      ]);
      if (stderr.includes('No matching bookmarks for names:')) {
        throw new RevisionPortError('UNKNOWN_REVISION', 'No bookmark matched the requested refspecs; nothing pushed.');
      }
    },

    bundle: async (_input: RevisionBundleInput): Promise<void> => {
      await Promise.resolve();
      throw new RevisionPortError('UNSUPPORTED_OPERATION', 'Jujutsu does not produce bundles; use the Git adapter.');
    },

    importBundle: async (_input: ImportRevisionBundleInput): Promise<void> => {
      await Promise.resolve();
      throw new RevisionPortError('UNSUPPORTED_OPERATION', 'Jujutsu does not import bundles; use the Git adapter.');
    },

    /* A real symbolic ref in the colocated store, not a second record of the
     * branch head: a turn recorded onto the branch moves the head with it, and
     * `jj` leaves a ref outside `refs/heads` alone. */
    readHead: async (): Promise<RevisionHead | undefined> => {
      const result = await git(['symbolic-ref', '--quiet', tauHeadRef]);
      const target = new TextDecoder().decode(result.stdout).trim();
      if (result.exitCode !== 0 || !target.startsWith(branchRefPrefix)) {
        return undefined;
      }
      const branch = target.slice(branchRefPrefix.length);
      return branch === '' ? undefined : Object.freeze({ branch, head: await port.readRef(branch) });
    },

    setHead: async (branch: string): Promise<void> => {
      const result = await git(['symbolic-ref', tauHeadRef, `${branchRefPrefix}${branch}`]);
      if (result.exitCode !== 0) {
        throw new RevisionPortError('ENGINE_FAILED', 'The head reference could not be moved.');
      }
    },

    changeId: async (id: RevisionId): Promise<string | undefined> => {
      const entry = await entryFor(id);
      return entry?.changeId;
    },

    conflicts: async (id: RevisionId): Promise<RevisionConflict | undefined> => {
      const entry = await entryFor(id);
      if (entry?.conflicted !== true) {
        return undefined;
      }
      // `jj:trees` and `jj:conflict-labels` are commit headers, not template
      // values, so they are read from the object itself in the colocated store.
      const commit = decodeCommit(await readCommitObject(id));
      return Object.freeze({
        trees: commit.conflictedTrees ?? Object.freeze([]),
        labels: commit.conflictLabels ?? Object.freeze([]),
      });
    },
  });

  return port;
};

/**
 * Recorded provenance for the Jujutsu build this program qualified. The
 * qualified source is commit `c09b0c33` (`v0.44.0-115-gc09b0c337`): 115 commits
 * past the v0.44.0 tag, whose version string it still reports. Release assets
 * downloaded from `downloadUrl` are unqualified until an upgrade rehearsal covers
 * a tagged release (operator decisions 2026-09-09, question 2). @public
 */
export const pinnedJjRelease = Object.freeze({
  /** Version string the qualified binary reports (`jj --version`), not the qualified source. */
  version: '0.44.0',
  /** Exact qualified source commit; `git describe` gives `v0.44.0-115-gc09b0c337`. */
  sourceRevision: 'c09b0c337f0dbff496ad3d696684aa1128482c38',
  describe: 'v0.44.0-115-gc09b0c337',
  /**
   * GitHub release asset naming pattern; a host substitutes its own target triple.
   * The v0.44.0 asset is 115 commits older than `sourceRevision` and is not
   * covered by any qualification claim below.
   */
  downloadUrl: 'https://github.com/jj-vcs/jj/releases/download/v0.44.0/jj-v0.44.0-<target>.tar.gz',
  /**
   * SHA-256 of the binary this program qualified, built from `sourceRevision`
   * for `aarch64-apple-darwin`. A host that downloads a release asset instead
   * verifies that asset's own published digest before use and gets no
   * qualification claim from this constant.
   */
  qualifiedDarwinArm64Sha256: 'b031f371457473d7842e860ecbbe6a37bb3a0b5d9ff2bc2183147c79aaafce75',
});
