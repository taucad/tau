import { spawn } from 'node:child_process';
import { and, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from '#database/owner-lock.js';
import { withOwnerLock } from '#database/owner-lock.js';
import { projectGitLfsObject } from '#database/schema.js';
import { gitChildEnvironment, gitCommandTimeoutMilliseconds, gitMaxBufferBytes } from '#api/git/store/lease.js';

/**
 * The ceiling git-lfs itself puts on a pointer blob (`lfs/pointer.go`,
 * `blobSizeCutoff`). A blob larger than this is content, never a pointer, so
 * the walk never reads it — which is what keeps the second pass proportional
 * to the pointers in the repository rather than to its bytes.
 */
const pointerSizeCeilingBytes = 1024;

/** Every object git names, in either hash algorithm. */
const objectNamePattern = /^[\da-f]{40}(?:[\da-f]{24})?$/u;

const pointerOidPattern = /^oid sha256:(?<oid>[\da-f]{64})$/mu;

const pointerVersionLine = 'version https://git-lfs.github.com/spec/v1';

const decode = (bytes: Uint8Array<ArrayBuffer>, start?: number, end?: number): string =>
  new TextDecoder().decode(bytes.subarray(start, end));

/**
 * `git` with an object list on stdin, which `execFile` cannot give it.
 *
 * The isolation, the timeout and the output ceiling are W2's: a walk runs over
 * repository content the pusher chose, inside a maintenance pass that has no
 * other bound, so a child that hangs or floods must die the way a lease's own
 * children do.
 *
 * ponytail: the whole answer is buffered under that ceiling. At D20's 1 GiB
 * repository ceiling the largest of these is the object listing, tens of MiB of
 * hex; if it ever reaches 64 MiB the upgrade is to stream the three children
 * into each other rather than to add a second walker.
 */
const runGitWithInput = async (cwd: string, args: readonly string[], input: string): Promise<Uint8Array<ArrayBuffer>> =>
  new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    const child = spawn('git', [...args], {
      cwd,
      env: gitChildEnvironment(cwd),
      timeout: gitCommandTimeoutMilliseconds,
      killSignal: 'SIGKILL',
    });
    const output: Array<Uint8Array<ArrayBuffer>> = [];
    const errors: Array<Uint8Array<ArrayBuffer>> = [];
    let bytes = 0;
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      bytes += chunk.byteLength;
      if (bytes > gitMaxBufferBytes) {
        child.kill('SIGKILL');
        reject(new Error(`git ${args.join(' ')} wrote more than ${String(gitMaxBufferBytes)} bytes`));
        return;
      }
      output.push(chunk);
    });
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => errors.push(chunk));
    // A child that exits before reading its input closes the pipe; that is its
    // exit code's business, not an error of its own.
    child.stdin.on('error', () => undefined);
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(output));
        return;
      }
      reject(new Error(`git ${args.join(' ')} exited ${String(code)}: ${decode(Buffer.concat(errors)).trim()}`));
    });
    child.stdin.end(input);
  });

/**
 * Splits `git cat-file --batch` output into the object bodies it carries.
 *
 * Each record is a header line (`<name> <type> <size>`), exactly `size` bytes,
 * and a newline. A name git could not resolve answers `<name> missing` and
 * carries no body.
 */
const batchBodies = (raw: Uint8Array<ArrayBuffer>): ReadonlyArray<Uint8Array<ArrayBuffer>> => {
  const bodies: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = 0;
  while (offset < raw.length) {
    const newline = raw.indexOf(0x0a, offset);
    if (newline === -1) {
      break;
    }
    const size = Number(decode(raw, offset, newline).split(' ')[2]);
    offset = newline + 1;
    if (!Number.isInteger(size)) {
      continue;
    }
    bodies.push(raw.subarray(offset, offset + size));
    offset += size + 1;
  }
  return bodies;
};

const pointerOid = (body: Uint8Array<ArrayBuffer>): string | undefined => {
  const text = decode(body);
  return text.startsWith(pointerVersionLine) ? pointerOidPattern.exec(text)?.groups?.['oid'] : undefined;
};

/**
 * Every LFS object the repository in `directory` still reaches, from any ref.
 *
 * Three stock git children, no `git-lfs` binary — the server has none, so the
 * pointers are parsed rather than asked for. `rev-list --objects --all` is the
 * reachable set including tags (I9: nothing reachable is collected),
 * `cat-file --batch-check` narrows it to blobs small enough to be a pointer,
 * and `cat-file --batch` reads only those.
 *
 * @param directory - A lease, or any repository directory git accepts.
 * @returns The `oid` of every pointer reachable from a ref.
 */
export const referencedLfsOids = async (directory: string): Promise<ReadonlySet<string>> => {
  const listed = await runGitWithInput(directory, ['rev-list', '--objects', '--all'], '');
  const names = decode(listed)
    .split('\n')
    .map((line) => line.split(' ')[0] ?? '')
    .filter((name) => objectNamePattern.test(name));
  if (names.length === 0) {
    return new Set();
  }

  const checked = await runGitWithInput(directory, ['cat-file', '--batch-check'], `${names.join('\n')}\n`);
  const candidates = decode(checked)
    .split('\n')
    .flatMap((line) => {
      const [name, type, size] = line.split(' ');
      return name !== undefined && type === 'blob' && Number(size) <= pointerSizeCeilingBytes ? [name] : [];
    });
  if (candidates.length === 0) {
    return new Set();
  }

  const bodies = batchBodies(
    await runGitWithInput(directory, ['cat-file', '--batch', '--buffer'], `${candidates.join('\n')}\n`),
  );
  return new Set(bodies.map((body) => pointerOid(body)).filter((oid) => oid !== undefined));
};

/**
 * Membership in the referenced set as **one** bind, not one per pointer.
 *
 * `in (…)` would bind every reachable pointer separately and PostgreSQL refuses
 * past 65 535 parameters, so a repository with that many distinct pointers
 * would fail the mark outright instead of costing more.
 */
const referencedOids = (referenced: readonly string[], side: 'in' | 'out'): SQL => {
  /* `sql.param` is what binds the whole list as ONE parameter; interpolating
     the array directly makes drizzle spell a tuple, which PostgreSQL then
     refuses to cast to `text[]`. */
  const oids = sql`${sql.param([...referenced])}::text[]`;
  return side === 'in'
    ? sql`${projectGitLfsObject.oid} = any(${oids})`
    : sql`${projectGitLfsObject.oid} <> all(${oids})`;
};

/** What the reachability pass needs: the database the marks live in. */
export type LfsReachabilityDependencies = { readonly database: Database };

export type LfsReachabilityArguments = {
  readonly projectId: string;
  readonly ownerId: string;
  /** The lease this project's state is hydrated into, before it is disposed. */
  readonly directory: string;
  /** The moment an object first seen unreachable is marked with. */
  readonly at: Date;
};

/**
 * Records which of a project's LFS objects the repository still reaches (D6).
 *
 * Run in the derivation step after a push commits, over the same lease, and
 * again whenever a request finds `derived_generation` behind the manifest
 * (D19) — there is no nightly walk of every repository. Two statements, one
 * per direction, so the cost is the walk rather than the row count.
 *
 * Idempotent in both directions: a referenced object's mark is cleared however
 * often the pass runs, and an unreferenced object keeps the *first* moment it
 * was seen unreachable, which is the instant the retirement window is measured
 * from. Under the owner lock, the same one a "present" batch answer takes, so
 * a mark and a destructive recheck cannot interleave (D18).
 *
 * @param dependencies - The database handle.
 * @param args - The project, its owner, the lease and the observation moment.
 * @returns How many rows ended reachable and how many ended unreachable.
 */
export const markLfsReachability = async (
  dependencies: LfsReachabilityDependencies,
  args: LfsReachabilityArguments,
): Promise<{ reachable: number; unreachable: number }> => {
  const referenced = [...(await referencedLfsOids(args.directory))];

  return withOwnerLock(dependencies.database, args.ownerId, async (transaction) => {
    const reachable =
      referenced.length === 0
        ? []
        : await transaction
            .update(projectGitLfsObject)
            .set({ unreachableAt: null })
            .where(and(eq(projectGitLfsObject.projectId, args.projectId), referencedOids(referenced, 'in')))
            .returning({ oid: projectGitLfsObject.oid });

    const unreachable = await transaction
      .update(projectGitLfsObject)
      /* `postgres` binds a raw template value as a string, so the moment is
         spelled as one and given its type back. */
      .set({
        unreachableAt: sql`coalesce(${projectGitLfsObject.unreachableAt}, ${args.at.toISOString()}::timestamptz)`,
      })
      .where(
        and(
          eq(projectGitLfsObject.projectId, args.projectId),
          referenced.length === 0 ? undefined : referencedOids(referenced, 'out'),
        ),
      )
      .returning({ oid: projectGitLfsObject.oid });

    return { reachable: reachable.length, unreachable: unreachable.length };
  });
};
