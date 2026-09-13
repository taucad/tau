/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { ChildProcessByStdio } from 'node:child_process';
import { createReadStream } from 'node:fs';
import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import type { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, sql } from 'drizzle-orm';
import type { Environment } from '#config/environment.config.js';
import { DatabaseService } from '#database/database.service.js';
import { project, projectGit } from '#database/schema.js';
import { BillingService } from '#api/billing/billing.service.js';
import {
  isDumbHttpPath,
  isProjectRepositoryId,
  postReceiveHookScript,
  preReceiveHookScript,
  publishedTagSpoolFile,
  storageLimitBytesByTier,
} from '#api/git/git.constants.js';
import { materializePublishedTags } from '#api/publications/publication-materializer.js';
import type { MaterializerDependencies } from '#api/publications/publication-materializer.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import type { GitService as GitSmartService } from '#api/git/git.constants.js';

/**
 * What the git binaries are allowed to see. Never the API's own environment:
 * the hooks are child processes and have no business reading database or
 * object-store credentials. The cast is the workspace's own idiom for a
 * curated child environment (`app/testing/billing-load/cluster.ts`), since
 * `NodeJS.ProcessEnv` is augmented with the validated API schema.
 */
/* eslint-disable @typescript-eslint/naming-convention -- these are process environment variable names, not identifiers */
const childEnvironment = (
  repositoryPath: string,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> => ({
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: path.dirname(repositoryPath),
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  ...extra,
});
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

export type GitAccess = {
  readonly projectId: string;
  readonly ownerId: string;
  readonly repositoryPath: string;
  /** Bytes this project may still add before the plan allowance is spent. */
  readonly remainingBytes: number;
};

const gitExecutable = 'git';

/** A clone of a large repository is slow; an abandoned child is forever. */
const rpcTimeoutMilliseconds = 10 * 60 * 1000;
/** `init`, `update-server-info`, `--advertise-refs`, `bundle create`. */
const commandTimeoutMilliseconds = 60 * 1000;
/**
 * Ponytail: one flat ceiling on concurrent git children, not a per-project or
 * per-user queue. The deployment is deliberately single-Machine (one volume),
 * so the resource being protected is one machine's memory and CPU; if fairness
 * between projects ever matters, this becomes a per-project semaphore.
 */
const maximumConcurrentChildren = 32;

@Injectable()
export class GitRepositoryService implements OnApplicationBootstrap {
  readonly #logger = new Logger(GitRepositoryService.name);
  readonly #background = new Set<Promise<void>>();
  readonly #root: string;
  #activeChildren = 0;

  public constructor(
    private readonly configService: ConfigService<Environment, true>,
    private readonly databaseService: DatabaseService,
    private readonly billingService: BillingService,
    private readonly storage: ObjectStorageService,
  ) {
    this.#root = path.resolve(this.configService.get('TAU_GIT_ROOT', { infer: true }));
  }

  public get root(): string {
    return this.#root;
  }

  /**
   * Retry the published-tag spools a previous process left behind.
   *
   * Tracked rather than awaited: boot must not wait on the volume, and a
   * failure here is a retry, not a reason not to serve.
   */
  public onApplicationBootstrap(): void {
    this.track(
      this.sweepPublishedTagSpools().catch((error: unknown) => {
        this.#logger.warn({ err: error }, 'Published-tag spool sweep failed at boot');
      }),
    );
  }

  /**
   * `<TAU_GIT_ROOT>/<projectId>.git`, for an id that can only name a directory.
   *
   * The shape check lives here rather than at one caller because that is what
   * makes `git.constants.ts`'s invariant — "anything else never reaches the
   * filesystem" — true for every caller, present and future: `POST
   * /v1/publications` reaches `ensureRepository` with no controller of its own
   * to check it (review R1).
   *
   * @param projectId - The project id a client or a service named.
   * @returns The absolute repository path.
   * @throws NotFoundException When the id is not a project id.
   */
  public repositoryPath(projectId: string): string {
    if (!isProjectRepositoryId(projectId)) {
      throw new NotFoundException({ code: 'INVALID_REPOSITORY', message: 'Repository not found' });
    }
    return path.join(this.#root, `${projectId}.git`);
  }

  /**
   * Read (fetch, dumb HTTP) needs the project; write (push, LFS upload) also
   * needs the sync entitlement and headroom under the plan allowance. One auth
   * path: the caller is already resolved by `AuthGuard`.
   */
  public async authorize(args: { projectId: string; userId: string; mode: 'read' | 'write' }): Promise<GitAccess> {
    const { database } = this.databaseService;
    const rows = await database
      .select({ ownerId: project.ownerId })
      .from(project)
      .where(eq(project.id, args.projectId))
      .limit(1);
    const [row] = rows;
    if (row === undefined || row.ownerId !== args.userId) {
      // The same answer for "no such project" and "not yours": a git client
      // must not learn which project ids exist.
      throw new NotFoundException({
        code: 'GIT_REPOSITORY_NOT_FOUND',
        message: 'Repository not found',
      });
    }

    const entitlements = await this.billingService.getEntitlements(row.ownerId);
    if (args.mode === 'write' && !entitlements.canSyncFiles) {
      throw new ForbiddenException({
        code: 'GIT_SYNC_NOT_ENTITLED',
        message: 'Syncing files to Tau Cloud is a paid plan feature.',
      });
    }

    const usage = await this.readUsage(args.projectId);
    const limit = storageLimitBytesByTier[entitlements.tier];
    const remainingBytes = Math.max(0, limit - usage.storageBytes - usage.lfsBytes);
    if (args.mode === 'write' && remainingBytes === 0) {
      throw new PayloadTooLargeException({
        code: 'GIT_QUOTA_EXCEEDED',
        message: `Storage quota reached: ${String(usage.storageBytes + usage.lfsBytes)} of ${String(limit)} bytes used.`,
      });
    }

    return {
      projectId: args.projectId,
      ownerId: row.ownerId,
      repositoryPath: await this.ensureRepository(args.projectId),
      remainingBytes,
    };
  }

  public async readUsage(projectId: string): Promise<{ storageBytes: number; lfsBytes: number }> {
    const { database } = this.databaseService;
    const rows = await database
      .select({
        storageBytes: projectGit.storageBytes,
        lfsBytes: projectGit.lfsBytes,
      })
      .from(projectGit)
      .where(eq(projectGit.projectId, projectId))
      .limit(1);
    const [row] = rows;
    return row ?? { storageBytes: 0, lfsBytes: 0 };
  }

  public async recordUsage(args: { projectId: string; storageBytes?: number; lfsBytesDelta?: number }): Promise<void> {
    const { database } = this.databaseService;
    await database
      .insert(projectGit)
      .values({
        projectId: args.projectId,
        storageBytes: args.storageBytes ?? 0,
        lfsBytes: Math.max(0, args.lfsBytesDelta ?? 0),
      })
      .onConflictDoUpdate({
        target: projectGit.projectId,
        set: {
          ...(args.storageBytes === undefined ? {} : { storageBytes: args.storageBytes }),
          ...(args.lfsBytesDelta === undefined
            ? {}
            : {
                lfsBytes: sql`greatest(0, ${projectGit.lfsBytes} + ${args.lfsBytesDelta})`,
              }),
          updatedAt: new Date(),
        },
      });
  }

  /**
   * One bare repository per project (D21), created on first contact. The hooks
   * are reconciled on every contact so a deployment that changes the allow-list
   * takes effect without a migration (I15).
   */
  public async ensureRepository(projectId: string): Promise<string> {
    const repositoryPath = this.repositoryPath(projectId);
    let created = false;
    try {
      await stat(path.join(repositoryPath, 'HEAD'));
    } catch {
      created = true;
    }
    if (created) {
      await mkdir(this.#root, { recursive: true });
      await this.run(['init', '--bare', '--initial-branch=main', repositoryPath], this.#root);
      // The dumb-HTTP layout is only current after `update-server-info`; run it
      // once at creation so an empty repository answers a dumb read too.
      await this.run(['update-server-info'], repositoryPath);
    }
    await this.installHooks(repositoryPath);
    return repositoryPath;
  }

  /** `info/refs?service=…`: the ref advertisement, without serving a request. */
  public async advertiseRefs(repositoryPath: string, service: GitSmartService): Promise<Uint8Array<ArrayBuffer>> {
    return this.run([service.replace('git-', ''), '--stateless-rpc', '--advertise-refs', repositoryPath], this.#root);
  }

  /**
   * One smart-HTTP RPC. The request body streams into the child and the child's
   * stdout streams back, so a pack never lands in memory.
   */
  public serve(args: {
    repositoryPath: string;
    service: GitSmartService;
    body: Readable;
    gzipped: boolean;
    environment?: Readonly<Record<string, string>>;
    /** Set for a push: the project whose storage row is re-measured after it. */
    accountFor?: string;
    /**
     * Set for a push: git's own `receive.maxInputSize`, so an oversized pack is
     * refused while it arrives instead of filling the volume before any hook
     * runs.
     */
    maximumInputBytes?: number;
    /** Aborted when the client goes away, which kills the child. */
    abort?: AbortSignal;
  }): Readable {
    if (this.#activeChildren >= maximumConcurrentChildren) {
      throw new ServiceUnavailableException({
        code: 'GIT_BUSY',
        message: 'Too many git operations in flight; retry shortly.',
      });
    }

    const child = spawn(
      gitExecutable,
      [
        ...(args.maximumInputBytes === undefined
          ? []
          : ['-c', `receive.maxInputSize=${String(args.maximumInputBytes)}`]),
        args.service.replace('git-', ''),
        '--stateless-rpc',
        args.repositoryPath,
      ],
      {
        env: childEnvironment(args.repositoryPath, args.environment) as NodeJS.ProcessEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: rpcTimeoutMilliseconds,
        killSignal: 'SIGKILL',
        ...(args.abort === undefined ? {} : { signal: args.abort }),
      },
    );
    this.#activeChildren += 1;

    const stderr: Array<Uint8Array<ArrayBuffer>> = [];
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
    // An aborted or timed-out child emits `error`; without a listener that is
    // an unhandled exception on the process.
    child.on('error', (error) => {
      this.#logger.warn({ err: error, service: args.service }, 'git smart-HTTP child ended early');
    });
    child.on('close', (code) => {
      this.#activeChildren -= 1;
      if (code !== 0) {
        this.#logger.warn(
          {
            service: args.service,
            code,
            stderr: Buffer.concat(stderr).toString('utf8').slice(0, 2000),
          },
          'git smart-HTTP service exited non-zero',
        );
        return;
      }
      if (args.accountFor !== undefined) {
        this.track(this.accountAfterPush(args.accountFor, args.repositoryPath));
        /* The push moved refs; `post-receive` left the tag names it saw in the
         * repository. Materialization runs here, in this service's background
         * set, rather than in the hook: the hook is a git child under the
         * concurrency ceiling and the RPC lifetime bound, and a publication's
         * bytes must not be killed with the request that carried them (S32). */
        this.track(this.materializeAfterPush(args.accountFor, args.repositoryPath));
      }
    });

    this.track(this.pipeRequestBody({ body: args.body, child, gzipped: args.gzipped, service: args.service }));

    return child.stdout;
  }

  /**
   * Work a request started that outlives its response: the storage re-measure
   * after a push, and the request body pumped into the child. Held so nothing
   * is a fire-and-forget promise chain, and so a caller can wait for it.
   */
  public async settled(): Promise<void> {
    await Promise.all(this.#background);
  }

  /** A file of the read-only dumb-HTTP layout, or `undefined`. */
  public openDumbHttpFile(repositoryPath: string, relativePath: string): Readable | undefined {
    if (!isDumbHttpPath(relativePath)) {
      return undefined;
    }
    const resolved = path.resolve(repositoryPath, relativePath);
    if (resolved !== path.normalize(resolved) || !resolved.startsWith(`${repositoryPath}${path.sep}`)) {
      return undefined;
    }
    return createReadStream(resolved);
  }

  /** The repository's size on the volume, as `pre-receive`'s budget counts it. */
  public async measureRepository(repositoryPath: string): Promise<number> {
    const walk = async (directory: string): Promise<number> => {
      const entries = await readdir(directory, { withFileTypes: true });
      const sizes = await Promise.all(
        entries.map(async (entry) => {
          const child = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            return walk(child);
          }
          if (!entry.isFile()) {
            return 0;
          }
          try {
            const info = await stat(child);
            return info.size;
          } catch {
            return 0;
          }
        }),
      );
      return sizes.reduce((total, size) => total + size, 0);
    };
    try {
      return await walk(repositoryPath);
    } catch {
      return 0;
    }
  }

  /** Every repository on the volume, for the nightly bundle snapshot. */
  public async listRepositories(): Promise<readonly string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(this.#root, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.endsWith('.git'))
      .map((entry) => entry.name.slice(0, -4));
  }

  /**
   * One bounded git invocation whose whole output is wanted.
   *
   * Counted against the same 32-child ceiling `serve` uses, because the ceiling
   * protects the machine's memory and CPU and every git child on it is one of
   * those children — the publication materializer's `ls-tree`/`cat-file` pairs
   * included (review R8).
   *
   * @param args - Arguments after `git`.
   * @param cwd - Where the child runs; also its `HOME`.
   * @param stdin - Written to the child and closed, when given.
   * @returns The child's whole stdout.
   * @throws ServiceUnavailableException When the child ceiling is reached.
   * @throws Error When git exits non-zero.
   */
  public async run(args: readonly string[], cwd: string, stdin?: string): Promise<Uint8Array<ArrayBuffer>> {
    if (this.#activeChildren >= maximumConcurrentChildren) {
      throw new ServiceUnavailableException({
        code: 'GIT_BUSY',
        message: 'Too many git operations in flight; retry shortly.',
      });
    }
    this.#activeChildren += 1;
    try {
      return await this.spawnRun(args, cwd, stdin);
    } finally {
      this.#activeChildren -= 1;
    }
  }

  private async spawnRun(args: readonly string[], cwd: string, stdin?: string): Promise<Uint8Array<ArrayBuffer>> {
    return new Promise((resolve, reject) => {
      const child = spawn(gitExecutable, [...args], {
        cwd,
        env: childEnvironment(cwd) as NodeJS.ProcessEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: commandTimeoutMilliseconds,
        killSignal: 'SIGKILL',
      });
      const stdout: Array<Uint8Array<ArrayBuffer>> = [];
      const stderr: Array<Uint8Array<ArrayBuffer>> = [];
      child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(stdout));
          return;
        }
        reject(new Error(`git ${args.join(' ')} exited ${String(code)}: ${Buffer.concat(stderr).toString('utf8')}`));
      });
      if (stdin !== undefined) {
        child.stdin.end(stdin);
      }
    });
  }

  /**
   * Hooks are written to a temporary name with their mode and `rename`d into
   * place, which is atomic within the repository's own filesystem: a push that
   * arrives mid-reconcile sees either the old hook or the new one, never an
   * empty or non-executable file (both of which git treats as "no hook" and
   * would fail open). A hook whose bytes already match is left alone.
   */
  private async installHooks(repositoryPath: string): Promise<void> {
    const hooks = path.join(repositoryPath, 'hooks');
    await mkdir(hooks, { recursive: true });
    await Promise.all(
      (
        [
          ['pre-receive', preReceiveHookScript],
          ['post-receive', postReceiveHookScript],
        ] as const
      ).map(async ([name, body]) => {
        const file = path.join(hooks, name);
        try {
          const existing = await readFile(file, 'utf8');
          if (existing === body) {
            return;
          }
        } catch {
          // Absent or unreadable: write it.
        }
        const staged = path.join(hooks, `.${name}.${String(process.pid)}.tmp`);
        await writeFile(staged, body, { encoding: 'utf8', mode: 0o755 });
        await rename(staged, file);
      }),
    );
  }

  private track(work: Promise<void>): void {
    const settle = async (): Promise<void> => {
      try {
        await work;
      } finally {
        this.#background.delete(tracked);
      }
    };
    const tracked = settle();
    this.#background.add(tracked);
  }

  private async pipeRequestBody(args: {
    body: Readable;
    child: ChildProcessByStdio<Writable, Readable, Readable>;
    gzipped: boolean;
    service: GitSmartService;
  }): Promise<void> {
    try {
      await pipeline(args.gzipped ? args.body.pipe(createGunzip()) : args.body, args.child.stdin);
    } catch (error) {
      this.#logger.warn({ err: error, service: args.service }, 'git smart-HTTP request body failed');
      args.child.kill('SIGKILL');
    }
  }

  /**
   * Re-materialize every publication whose named version this push moved.
   *
   * The spool is read and removed before the work starts, so a second push
   * arriving mid-materialization records its own names rather than having them
   * dropped, and a spool that names nothing published costs one query.
   *
   * @param projectId - The project that was pushed to.
   * @param repositoryPath - Its bare repository.
   */
  /**
   * What the publication materializer needs from this service.
   *
   * The runner is this service's own, so the children a materialization starts
   * are counted by the same ceiling as every other git child (review R8).
   */
  private get materializerDependencies(): MaterializerDependencies {
    return {
      databaseService: this.databaseService,
      storage: this.storage,
      git: async (repositoryPath, args, stdin) => this.run(args, repositoryPath, stdin),
    };
  }

  /**
   * Re-materialize every publication whose named version this push moved.
   *
   * The spool is *renamed* before the work starts, so a push arriving
   * mid-materialization records its own names into a fresh file, and the claimed
   * file is removed only once the work succeeded — a crash or a restart leaves
   * it for `sweepPublishedTagSpools` to pick up rather than losing the names
   * (review R8).
   *
   * @param projectId - The project that was pushed to.
   * @param repositoryPath - Its bare repository.
   */
  private async materializeAfterPush(projectId: string, repositoryPath: string): Promise<void> {
    const spool = path.join(repositoryPath, publishedTagSpoolFile);
    const claimed = `${spool}.${randomUUID()}.claimed`;
    try {
      await rename(spool, claimed);
    } catch {
      /* No tag moved: the hook writes the file only when one did. */
      return;
    }
    await this.drainClaimedSpool(projectId, repositoryPath, claimed);
  }

  /**
   * Materialize the names one claimed spool file holds, and remove it on success.
   *
   * @param projectId - The project the repository belongs to.
   * @param repositoryPath - Its bare repository.
   * @param claimed - The renamed spool file.
   */
  private async drainClaimedSpool(projectId: string, repositoryPath: string, claimed: string): Promise<void> {
    let tags: readonly string[] = [];
    try {
      const recorded = await readFile(claimed, 'utf8');
      tags = recorded
        .split('\n')
        .filter((line) => line.startsWith('refs/tags/'))
        .map((line) => line.slice('refs/tags/'.length));
    } catch (error) {
      this.#logger.warn({ err: error, projectId }, 'Published-tag spool could not be read');
      return;
    }
    if (tags.length === 0) {
      await rm(claimed, { force: true });
      return;
    }
    try {
      const materialized = await materializePublishedTags(this.materializerDependencies, {
        projectId,
        repositoryPath,
        tags,
      });
      await rm(claimed, { force: true });
      if (materialized.length > 0) {
        this.#logger.log({ projectId, tags, materialized }, 'Re-materialized publications after a push');
      }
    } catch (error) {
      /* Kept on disk deliberately: the publication is still serving the previous
         tree and the next push or boot retries these names. */
      this.#logger.warn({ err: error, projectId, tags, claimed }, 'Publication materialization failed after a push');
    }
  }

  /**
   * Retry every published-tag spool a previous process did not finish.
   *
   * Called once at boot: a crash between claiming a spool and writing the row
   * would otherwise leave a publication serving a superseded tree forever
   * (review R8).
   */
  public async sweepPublishedTagSpools(): Promise<void> {
    for (const projectId of await this.listRepositories()) {
      const repositoryPath = this.repositoryPath(projectId);
      let names: readonly string[];
      try {
        // oxlint-disable-next-line no-await-in-loop -- one repository at a time, once at boot.
        names = await readdir(repositoryPath);
      } catch {
        continue;
      }
      for (const name of names) {
        if (name === publishedTagSpoolFile) {
          // oxlint-disable-next-line no-await-in-loop -- sequential by design, see above.
          await this.materializeAfterPush(projectId, repositoryPath);
          continue;
        }
        if (name.startsWith(`${publishedTagSpoolFile}.`) && name.endsWith('.claimed')) {
          // oxlint-disable-next-line no-await-in-loop -- ditto.
          await this.drainClaimedSpool(projectId, repositoryPath, path.join(repositoryPath, name));
        }
      }
    }
  }

  private async accountAfterPush(projectId: string, repositoryPath: string): Promise<void> {
    try {
      await this.recordUsage({
        projectId,
        storageBytes: await this.measureRepository(repositoryPath),
      });
    } catch (error) {
      this.#logger.warn({ err: error, projectId }, 'Repository storage accounting failed after a push');
    }
  }
}
