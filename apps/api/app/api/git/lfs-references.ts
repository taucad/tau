import { spawn } from 'node:child_process';
import { gitChildEnvironment, gitCommandTimeoutMilliseconds, gitMaxBufferBytes } from '#api/git/store/lease.js';

/*
 * The LFS reachability walk over a lease (D6), with no database in its module
 * graph: tau-storage runs it after a commit and reports the result in its
 * receipt (DC1), and the API applies the marks (`lfs-reachability.ts`).
 */

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
 * The pointer oids among `names`: `cat-file --batch-check` narrows them to
 * blobs small enough to be a pointer, and `cat-file --batch` reads only those.
 */
const pointerOidsAmong = async (directory: string, names: readonly string[]): Promise<Set<string>> => {
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

/** The object names `rev-list --objects` printed, without their paths. */
const listedNames = (listed: Uint8Array<ArrayBuffer>): string[] =>
  decode(listed)
    .split('\n')
    .map((line) => line.split(' ')[0] ?? '')
    .filter((name) => objectNamePattern.test(name));

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
export const referencedLfsOids = async (directory: string): Promise<ReadonlySet<string>> =>
  pointerOidsAmong(directory, listedNames(await runGitWithInput(directory, ['rev-list', '--objects', '--all'], '')));

/** Ref tips by name: what a ref map says each ref holds (a tag's own object for an annotated tag). */
export type RefTips = Readonly<Record<string, { readonly oid: string }>>;

/** A walk's answer for one set of tips, which a later walk of the same repository can start from. */
export type LfsReferenceBase = { readonly tips: RefTips; readonly oids: ReadonlySet<string> };

/** How a walk found its answer: the base as it was, the base plus what is new since, or the whole repository. */
export type LfsWalk = 'unchanged' | 'incremental' | 'full';

/** A walk's set, and how it was found. */
export type LfsWalkResult = { readonly oids: ReadonlySet<string>; readonly walk: LfsWalk };

/**
 * The same set as {@link referencedLfsOids} for a repository whose refs are
 * `tips`, computed from `base` — an earlier walk's exact answer for other
 * tips of the same repository — and only the objects that are new since.
 *
 * A pointer is content-addressed, so the set is a function of the tips alone,
 * and when every object the base's tips reach is still reached by `tips` the
 * new set is the base's set plus the pointers among the objects reachable
 * from the new or moved tips and not from the base's
 * (`rev-list --objects <tips> --not <base tips>`). That rev-list may list more
 * than the difference — git marks only the trees of uninteresting commits —
 * but everything it lists is reachable from `tips`, and nothing it leaves out
 * is new, so the union is exact.
 *
 * The precondition is what a push guarantees, since every ref family refuses
 * deletes and non-fast-forwards, and it is checked rather than assumed: a ref
 * the base had and `tips` lacks, a moved ref whose old tip `tips` no longer
 * reaches (`rev-list --objects <old tips> --not <tips>` printing anything), a
 * base tip this repository does not hold, or any git failure falls back to the
 * whole walk. So the answer is always the one the whole walk gives.
 *
 * @param directory - A lease, or any repository directory git accepts, holding every object `tips` names.
 * @param args - The repository's tips, and the base to start from when there is one.
 * @returns The set, and which walk produced it.
 */
export const referencedLfsOidsSince = async (
  directory: string,
  args: { readonly tips: RefTips; readonly base?: LfsReferenceBase },
): Promise<LfsWalkResult> => {
  const full = async (): Promise<LfsWalkResult> => ({ oids: await referencedLfsOids(directory), walk: 'full' });
  const { base, tips } = args;
  if (base === undefined) {
    return full();
  }
  const baseNames = Object.keys(base.tips);
  if (baseNames.some((ref) => tips[ref] === undefined)) {
    return full();
  }
  const changed = Object.keys(tips).filter((ref) => tips[ref]?.oid !== base.tips[ref]?.oid);
  if (changed.length === 0) {
    return { oids: base.oids, walk: 'unchanged' };
  }
  const unique = (oids: ReadonlyArray<string | undefined>): string[] => [
    ...new Set(oids.filter((oid) => oid !== undefined)),
  ];
  const newTips = unique(Object.values(tips).map((tip) => tip.oid));
  const baseTips = unique(Object.values(base.tips).map((tip) => tip.oid));
  const movedFrom = unique(changed.map((ref) => base.tips[ref]?.oid));
  const negated = (oids: readonly string[]): string => oids.map((oid) => `^${oid}\n`).join('');

  try {
    if (movedFrom.length > 0) {
      const lost = await runGitWithInput(
        directory,
        ['rev-list', '--objects', '--stdin'],
        `${movedFrom.join('\n')}\n${negated(newTips)}`,
      );
      if (listedNames(lost).length > 0) {
        return await full();
      }
    }
    const arrived = unique(changed.map((ref) => tips[ref]?.oid));
    const listed = await runGitWithInput(
      directory,
      ['rev-list', '--objects', '--stdin'],
      `${arrived.join('\n')}\n${negated(baseTips)}`,
    );
    const added = await pointerOidsAmong(directory, listedNames(listed));
    return { oids: new Set([...base.oids, ...added]), walk: 'incremental' };
  } catch {
    return full();
  }
};

/**
 * Each repository's last walk, so the next walk of it is {@link referencedLfsOidsSince}
 * rather than the whole repository (push latency F4, step 6).
 *
 * Process-local, like the pack cache: an entry is an exact answer for its
 * tips whichever lease produced it, so a miss — another Machine, a restart, an
 * evicted repository — costs one whole walk and nothing else. Bounded by
 * repositories (least recently walked out first), by the set it will hold for
 * any one of them, and by the oids it holds across all of them: each is a
 * 64-character string in a set, about 120 bytes of heap, so the default
 * 200 000 is about 24 MiB however many repositories share it (review of
 * push latency F4).
 */
export class LfsReferenceCache {
  readonly #entries = new Map<string, LfsReferenceBase>();
  readonly #maximumRepositories: number;
  readonly #maximumOids: number;
  readonly #maximumTotalOids: number;
  #totalOids = 0;

  /**
   * @param bounds - The most repositories kept, the largest set kept for one, and the most oids kept across all.
   */
  public constructor(
    bounds: {
      readonly maximumRepositories?: number;
      readonly maximumOids?: number;
      readonly maximumTotalOids?: number;
    } = {},
  ) {
    this.#maximumRepositories = bounds.maximumRepositories ?? 1024;
    this.#maximumTotalOids = bounds.maximumTotalOids ?? 200_000;
    this.#maximumOids = Math.min(bounds.maximumOids ?? 50_000, this.#maximumTotalOids);
  }

  /** Repositories held now. */
  public get size(): number {
    return this.#entries.size;
  }

  /** Oids held now, across every repository. */
  public get oids(): number {
    return this.#totalOids;
  }

  /**
   * Every LFS object `tips` reach in `directory`, from this repository's last walk when there is one.
   *
   * @param repository - The repository's identity (owner and project).
   * @param directory - A lease of it holding every object `tips` names.
   * @param tips - Its refs.
   * @returns The set, and which walk produced it.
   */
  public async walk(repository: string, directory: string, tips: RefTips): Promise<LfsWalkResult> {
    const base = this.#entries.get(repository);
    const result = await referencedLfsOidsSince(directory, { tips, ...(base === undefined ? {} : { base }) });
    this.#forget(repository);
    if (result.oids.size <= this.#maximumOids) {
      this.#entries.set(repository, { tips, oids: result.oids });
      this.#totalOids += result.oids.size;
      for (const oldest of this.#entries.keys()) {
        if (this.#entries.size <= this.#maximumRepositories && this.#totalOids <= this.#maximumTotalOids) {
          break;
        }
        this.#forget(oldest);
      }
    }
    return result;
  }

  #forget(repository: string): void {
    const held = this.#entries.get(repository);
    if (held !== undefined) {
      this.#totalOids -= held.oids.size;
      this.#entries.delete(repository);
    }
  }
}
