/**
 * Per-worktree PostgreSQL databases for local development.
 *
 * Every linked git worktree resolves the configured local database to its own
 * fork, `<base>_<worktree id>`, so parallel checkouts never share a schema or
 * migrate it from under one another. The main worktree, CI (one checkout) and
 * production (no repository, remote host) keep the configured name untouched.
 * The fork is created on first use by dumping the base database through the
 * local compose Postgres container, so a branch carrying this module reads a
 * copy of the operator's development data without any manual step.
 */

import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import process from 'node:process';

/**
 * The two git directories that tell a linked worktree from the main one.
 *
 * @public
 */
export type WorktreeIdentity = Readonly<{ gitDirectory: string; gitCommonDirectory: string }>;

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const identifier = /^[a-z0-9_]+$/u;
const postgresIdentifierLength = 63;
/** How long a starter waits for a sibling's restore to land, and how often it looks. */
const forkWait = 60_000;
const forkPoll = 500;

/**
 * Read the git directories of the checkout containing `cwd`.
 *
 * @param cwd - A directory inside the checkout.
 * @returns The identity, or undefined outside a git repository (or without git).
 * @public
 */
export const detectWorktree = (cwd = process.cwd()): WorktreeIdentity | undefined => {
  try {
    const [gitDirectory, gitCommonDirectory] = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .trim()
      .split('\n');
    return gitDirectory && gitCommonDirectory ? { gitDirectory, gitCommonDirectory } : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The database name a checkout uses.
 *
 * @param base - The configured database name.
 * @param worktree - The checkout identity from `detectWorktree`, undefined outside a repository.
 * @returns `base` in the main worktree, `<base>_<worktree id>` in a linked one.
 * @public
 */
export const worktreeDatabaseName = (base: string, worktree: WorktreeIdentity | undefined): string => {
  if (!worktree || worktree.gitDirectory === worktree.gitCommonDirectory) {
    return base;
  }
  const id = basename(worktree.gitDirectory)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '_')
    .replaceAll(/^_+|_+$/gu, '');
  // An explicit fork name for this worktree is already resolved; suffixing it again would fork the fork.
  if (base.endsWith(`_${id}`)) {
    return base;
  }
  return `${base}_${id}`.slice(0, postgresIdentifierLength);
};

/**
 * Point a local connection URL at this checkout's database.
 *
 * @param url - A `postgresql://` URL.
 * @param worktree - The checkout identity from `detectWorktree`, undefined outside a repository.
 * @returns The URL with its database renamed, or `url` itself for the main worktree and remote hosts.
 * @public
 */
export const worktreeDatabaseUrl = (url: string, worktree: WorktreeIdentity | undefined): string => {
  const parsed = new URL(url);
  if (!localHosts.has(parsed.hostname)) {
    return url;
  }
  const base = parsed.pathname.slice(1);
  const name = worktreeDatabaseName(base, worktree);
  if (name === base) {
    return url;
  }
  parsed.pathname = `/${name}`;
  return parsed.toString();
};

/**
 * The local development database name a checkout's tooling shares with its API.
 *
 * `DATABASE_URL` wins when the environment supplies one, so an operator can point a
 * whole run (API child and seeding helpers alike) at another database; otherwise the
 * compose default applies. Either way a linked worktree gets its fork.
 *
 * @param fallback - The compose default database name.
 * @returns The database name.
 * @public
 */
export const localDatabaseName = (fallback = 'tau_dev'): string => {
  const url = process.env['DATABASE_URL'];
  const worktree = detectWorktree();
  return url ? new URL(worktreeDatabaseUrl(url, worktree)).pathname.slice(1) : worktreeDatabaseName(fallback, worktree);
};

/**
 * Resolve a local URL to this checkout's database and create it when missing.
 *
 * The fork is a `pg_dump | psql` copy of the base database made inside the
 * compose container, which works while the base is in use (a `TEMPLATE` clone
 * refuses a database with open sessions). The copy lands in a staging name and
 * is renamed in one atomic step, so a second starter in the same worktree can
 * only ever see a complete fork; one that loses the race for the staging name
 * waits for that rename instead of restoring a second copy. A copy that fails
 * midway drops its staging database so the next call retries.
 *
 * @param url - A `postgresql://` URL.
 * @param container - The compose Postgres container name.
 * @returns The resolved URL.
 * @public
 */
export const ensureWorktreeDatabase = (url: string, container = 'tau-postgres'): string => {
  const resolved = worktreeDatabaseUrl(url, detectWorktree());
  if (resolved === url) {
    return url;
  }
  const { username } = new URL(url);
  const base = new URL(url).pathname.slice(1);
  const fork = new URL(resolved).pathname.slice(1);
  if (![username, base, fork].every((value) => identifier.test(value))) {
    throw new Error(`Cannot fork database "${base}" for user "${username}": unsupported identifier`);
  }
  const run = (args: readonly string[]): string => {
    try {
      return execFileSync('docker', ['exec', container, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch (error) {
      throw new Error(`docker exec ${container} ${args[0] ?? ''} failed; is the compose Postgres up?`, {
        cause: error,
      });
    }
  };
  const psql = (statement: string): string =>
    run(['psql', '-qtAX', '-v', 'ON_ERROR_STOP=1', '-U', username, '-d', 'postgres', '-c', statement]);
  const forkExists = (): boolean => psql(`SELECT 1 FROM pg_database WHERE datname = '${fork}'`) === '1';
  if (forkExists()) {
    return resolved;
  }
  // Short enough that the suffix never pushes the name past Postgres's 63-byte identifier limit.
  const staging = `${fork.slice(0, postgresIdentifierLength - 8)}_forking`;
  try {
    run(['createdb', '-U', username, staging]);
  } catch (error) {
    // Ponytail: a staging database left by a killed restore also lands here; the timeout names it.
    const deadline = Date.now() + forkWait;
    while (!forkExists()) {
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for "${fork}" to finish forking; drop a stale "${staging}" if no restore is running`,
          { cause: error },
        );
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, forkPoll);
    }
    return resolved;
  }
  try {
    run(['sh', '-c', `pg_dump -U ${username} ${base} | psql -q -v ON_ERROR_STOP=1 -U ${username} -d ${staging}`]);
    psql(`ALTER DATABASE "${staging}" RENAME TO "${fork}"`);
  } catch (error) {
    run(['dropdb', '-U', username, '--if-exists', staging]);
    throw new Error(`Forking database "${base}" into "${fork}" failed`, { cause: error });
  }
  return resolved;
};
