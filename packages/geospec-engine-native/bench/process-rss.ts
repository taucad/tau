import { spawn } from 'node:child_process';

/** One OS process-table row; RSS is resident bytes, birth is the OS start identity. @internal */
export type ProcessRow = { pid: number; parent: number; rssBytes: number; birth: string };
/** Parse the POSIX ps columns used on the selected Darwin/Linux host.
 * @internal
 * @param text - Raw ps stdout.
 * @returns Process rows with KiB converted exactly once.
 */
export const parseProcessTable = (text: string): ProcessRow[] =>
  text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
      if (!match) {
        throw new Error(`Unexpected ps row: ${line}`);
      }
      return { pid: Number(match[1]), parent: Number(match[2]), rssBytes: Number(match[3]) * 1024, birth: match[4]! };
    });

/** Track previously seen descendants even after their parent exits/reparents them. @internal */
export class OwnedProcessTree {
  private readonly identities = new Map<number, string>();
  // oxlint-disable-next-line typescript/parameter-properties -- Native Node type stripping requires erasable syntax.
  private readonly rootPid: number;
  public constructor(rootPid: number) {
    this.rootPid = rootPid;
  }
  /** Observe a full process snapshot.
   * @param rows - Current process rows.
   * @returns Owned current rows, including the sampling parent.
   */
  public observe(rows: ProcessRow[]): ProcessRow[] {
    const current = new Map(rows.map((row) => [row.pid, row]));
    for (const [pid, birth] of this.identities) {
      if (current.get(pid)?.birth !== birth) {
        this.identities.delete(pid);
      }
    }
    const root = current.get(this.rootPid);
    if (root) {
      this.identities.set(root.pid, root.birth);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if (!this.identities.has(row.pid) && this.identities.has(row.parent)) {
          this.identities.set(row.pid, row.birth);
          changed = true;
        }
      }
    }
    return rows.filter((row) => this.identities.get(row.pid) === row.birth);
  }
}

const readProcessTable = async (readDeadline: number): Promise<ProcessRow[]> =>
  new Promise((resolve, reject) => {
    const child = spawn('ps', ['-axo', 'pid=,ppid=,rss=,lstart='], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: readDeadline,
      killSignal: 'SIGKILL',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ps failed (${code}): ${stderr}`));
        return;
      }
      try {
        // The sampling subprocess is instrumentation, not a product descendant.
        resolve(parseProcessTable(stdout).filter(({ pid }) => pid !== child.pid));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });

/** Raw sampled attribution, including observation gaps. @internal */
export type RssReceipt = {
  complete: boolean;
  // oxlint-disable-next-line typescript/no-restricted-types -- Persisted JSON explicitly distinguishes unavailable measurements.
  peakBytes: number | null;
  samplePeriod: number;
  reapDeadline: number;
  samples: Array<{ elapsedNs: number; rssBytes: number; processes: ProcessRow[] }>;
  errors: string[];
  remainingDescendants: ProcessRow[];
  attribution: string;
};
/** Sampled parent plus descendant RSS, including post-report cleanup/reap.
 * @internal
 * @returns A sampler whose final receipt retains all raw process snapshots.
 */
export const startProcessRss = async ({
  samplePeriod,
  reapDeadline,
  read = async () => readProcessTable(reapDeadline),
  rootPid = process.pid,
}: {
  /** Milliseconds between completed samples. */ samplePeriod: number;
  /** Milliseconds to observe final descendant disappearance after direct children close. */ reapDeadline: number;
  read?: () => Promise<ProcessRow[]>;
  rootPid?: number;
}): Promise<{ finish: () => Promise<RssReceipt> }> => {
  const tree = new OwnedProcessTree(rootPid);
  const started = process.hrtime.bigint();
  const samples: Array<{ elapsedNs: number; rssBytes: number; processes: ProcessRow[] }> = [];
  const errors: string[] = [];
  let stopped = false;
  let pending = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sample = async (): Promise<void> => {
    try {
      const processes = tree.observe(await read());
      if (!processes.some(({ pid }) => pid === rootPid)) {
        throw new Error('Sampling parent absent from process table.');
      }
      samples.push({
        elapsedNs: Number(process.hrtime.bigint() - started),
        rssBytes: processes.reduce((sum, row) => sum + row.rssBytes, 0),
        processes,
      });
    } catch (error) {
      errors.push(String(error));
    }
  };
  const sampleAndContinue = async (): Promise<void> => {
    await sample();
    if (!stopped) {
      poll();
    }
  };
  const poll = (): void => {
    timer = setTimeout(() => {
      pending = sampleAndContinue();
    }, samplePeriod);
  };
  await sample(); // First sample precedes worker creation.
  poll();
  return {
    finish: async (): Promise<RssReceipt> => {
      stopped = true;
      clearTimeout(timer);
      await pending;
      const deadline = Date.now() + reapDeadline;
      let descendants: ProcessRow[];
      do {
        // oxlint-disable-next-line no-await-in-loop -- Final reap observation is serial and read-only.
        await sample();
        descendants = samples.at(-1)?.processes.filter(({ pid }) => pid !== rootPid) ?? [];
        if (descendants.length === 0 || errors.length > 0) {
          break;
        }
        // oxlint-disable-next-line no-await-in-loop -- Poll only until owned descendants disappear or the declared observation deadline expires.
        await new Promise((resolve) => {
          setTimeout(resolve, samplePeriod);
        });
      } while (Date.now() < deadline);
      const complete =
        errors.length === 0 && descendants.length === 0 && samples.some((row) => row.processes.length > 1);
      return {
        complete,
        peakBytes: complete ? Math.max(...samples.map(({ rssBytes }) => rssBytes)) : null,
        samplePeriod,
        reapDeadline,
        samples,
        errors,
        remainingDescendants: descendants,
        attribution:
          'parent-and-sampled-owned-descendants-through-final-reap; ps instrumentation excluded; birth identity from ps lstart; sub-period processes may be missed',
      };
    },
  };
};
