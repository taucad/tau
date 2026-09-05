/**
 * Sample the established TCP peers of a process tree.
 *
 * PH5's "API absent from the data path" claim is only worth something if it is
 * *measured*: the Tau API is normally listening on the same machine, so an
 * absent listener proves nothing. SP-4 sampled `lsof` once a second across a
 * full run (742 samples, zero loopback) and this is that sampler, ported into
 * Node so an integration test can assert the same thing.
 *
 * A `node:` module, and deliberately not exported from the package barrel: it
 * is diagnostic instrumentation, not daemon behaviour.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** One established connection observed on a sampled process. @public */
export type TcpPeerSample = {
  readonly pid: number;
  readonly peer: string;
};

/**
 * Every descendant pid of `pid`, including it.
 *
 * @param pid - Root of the tree.
 * @returns The tree's pids.
 */
const descendants = async (pid: number): Promise<readonly number[]> => {
  let children: readonly number[] = [];
  try {
    const { stdout } = await execFileAsync('pgrep', ['-P', String(pid)]);
    children = stdout
      .split('\n')
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((child) => Number.isSafeInteger(child) && child > 0);
  } catch {
    /* `pgrep` exits non-zero when a process has no children. */
  }
  const nested = await Promise.all(children.map(async (child) => descendants(child)));
  return [pid, ...nested.flat()];
};

/**
 * Sample the established TCP connections of one process tree, once.
 *
 * @param pid - Root of the tree to sample; defaults to this process.
 * @returns One row per established connection, with the peer address.
 * @public
 */
export const sampleTcpPeers = async (pid: number = process.pid): Promise<readonly TcpPeerSample[]> => {
  const tree = await descendants(pid);
  let stdout = '';
  try {
    /* A busy process tree easily exceeds `execFile`'s 1 MB default, and the
     * resulting rejection would silently read as "no connections" — the exact
     * false negative this measurement exists to rule out. */
    ({ stdout } = await execFileAsync('lsof', ['-nP', '-iTCP', '-sTCP:ESTABLISHED', '-a', '-p', tree.join(',')], {
      maxBuffer: 64 * 1024 * 1024,
    }));
  } catch (error) {
    /* `lsof` exits non-zero when *some* pid has no matching descriptor, having
     * already written the rows for the others; keep them. */
    const partial = (error as { readonly stdout?: unknown }).stdout;
    if (typeof partial !== 'string') {
      return [];
    }
    stdout = partial;
  }
  return stdout
    .split('\n')
    .slice(1)
    .flatMap((line) => {
      const columns = line.trim().split(/\s+/u);
      const owner = Number.parseInt(columns[1] ?? '', 10);
      const name = columns.at(-2) ?? '';
      const peer = name.split('->')[1];
      return Number.isSafeInteger(owner) && peer ? [{ pid: owner, peer }] : [];
    });
};
