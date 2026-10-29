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
