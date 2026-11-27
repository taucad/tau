import { spawn } from 'node:child_process';
import { historyNewArguments, readCommit } from '@taucad/revisions/provenance';
import { coverageOf } from '@taucad/revisions/provenance/server';
import type { CoverageInputs, Refs } from '@taucad/revisions/provenance';
import { commitBits, hasBit } from '#store/attestation.js';
import type { CommitEntry } from '#store/attestation.js';
import { gitChildEnvironment } from '#store/lease.js';
import type { Manifest } from '#store/manifest.js';

/**
 * The commit phase's coverage pass (cloud backup admission blueprint D3, R3-2; contracts § 2): one `rev-list` over
 * {@link historyNewArguments}, the one definition of "first brought", piped through `cat-file --batch`, each commit
 * read by the provenance module against the inputs the grant carries. It replaces the old substring scan for the
 * anonymity mark, which becomes "some first-brought commit is pseudonymous and not covered by the inline claim".
 *
 * **It never refuses.** The hook has already admitted the push; a refusal here would be an HTTP error, not a typed
 * code. `readCommit` and `coverageOf` are total, an object `cat-file` cannot read gets the `tauOther` bit, and a walk
 * that fails or outruns its budget answers `failed`, which marks the record anonymous: it fails towards hiding, as
 * the old walk did.
 */

/** The pass's ceiling: `min(120 s, deadline - 60 s)` (contracts § 2). */
export const coverageBudgetMilliseconds = (deadlineAt: number, now: number = Date.now()): number =>
  Math.min(120_000, deadlineAt - now - 60_000);

/** Why the pass did not finish: the `reason` label of `tau_sync_attestation_degraded_total`. */
export type CoverageFailure = 'walk_failed' | 'budget_exceeded';

export type CoverageResult =
  | Readonly<{
      coverage: 'complete';
      commits: readonly CommitEntry[];
      anonymous: boolean;
      /** Commits `cat-file` could not read (counted `unreadable_commit`; each has the `tauOther` bit). */
      unreadable: number;
    }>
  | Readonly<{ coverage: 'failed'; anonymous: true; reason: CoverageFailure }>;

const tipsOf = (references: Manifest['refs']): Refs =>
  Object.fromEntries(Object.entries(references).map(([name, tip]) => [name, tip.oid]));

/** One commit's bits (contracts § 2), from its reading and the server bits against the grant's inputs. */
const entryOf = (oid: string, body: string, inputs: CoverageInputs): CommitEntry => {
  const reading = readCommit(body);
  const bits = coverageOf(body, inputs);
  const classes = [reading.addressClass.author, reading.addressClass.committer, reading.addressClass.trailers];
  const flags: ReadonlyArray<[boolean, number]> = [
    [bits.claim === true, commitBits.claim],
    [bits.address === true, commitBits.address],
    [bits.forge === true, commitBits.forge],
    [bits.committerAddress === true, commitBits.committerAddress],
    [bits.committerForge === true, commitBits.committerForge],
    [reading.pseudonymous, commitBits.pseudonymous],
    [reading.namesAccount, commitBits.namesAccount],
    [reading.shape === 'tau/other', commitBits.tauOther],
    [classes.includes('foreign'), commitBits.foreignAddress],
    [reading.tauWritten && reading.addressClass.author === 'foreign', commitBits.tauWrittenAddress],
  ];
  /* Distinct powers of two, each added at most once. */
  let value = 0;
  for (const [set, bit] of flags) {
    value += set ? bit : 0;
  }
  return reading.claimable === undefined ? [oid, value] : [oid, value, reading.claimable];
};

const git = async (
  directory: string,
  args: readonly string[],
  stream: Readonly<{ input: string; signal: AbortSignal; onStdout: (chunk: Uint8Array<ArrayBuffer>) => void }>,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const { input, signal, onStdout } = stream;
    const child = spawn('git', [...args], {
      cwd: directory,
      env: gitChildEnvironment(directory),
      stdio: ['pipe', 'pipe', 'ignore'],
      signal,
    });
    child.stdout.on('data', onStdout);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git ${args[0] ?? ''} exited ${String(code)}`));
      }
    });
    child.stdin.on('error', () => {
      /* A child that exits early closes its stdin; the exit code reports it. */
    });
    child.stdin.end(input);
  });

/**
 * Parses `cat-file --batch` output as it streams: `<oid> <type> <size>\n<body>\n`, or `<oid> missing\n`. Bodies are
 * cut by size, never by scanning, and held only until read.
 */
const decoder = new TextDecoder();

const batchReader = (
  onCommit: (oid: string, body: string | undefined) => void,
): ((chunk: Uint8Array<ArrayBuffer>) => void) => {
  let pending = new Uint8Array(0);
  return (chunk) => {
    pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
    for (;;) {
      const newline = pending.indexOf(0x0a);
      if (newline === -1) {
        return;
      }
      const [oid = '', type = '', size = ''] = decoder.decode(pending.subarray(0, newline)).split(' ');
      if (type === 'missing') {
        onCommit(oid, undefined);
        pending = pending.subarray(newline + 1);
        continue;
      }
      const length = Number(size);
      const end = newline + 1 + length;
      if (pending.length < end + 1) {
        return;
      }
      onCommit(oid, type === 'commit' ? decoder.decode(pending.subarray(newline + 1, end)) : undefined);
      pending = pending.subarray(end + 1);
    }
  };
};

/**
 * Runs the coverage pass over what a push first brought.
 *
 * @param args - The lease directory, the ref maps before and after, the grant's inputs and the budget.
 * @returns Every first-brought commit with its bits and the anonymity mark, or `failed` with the reason.
 */
export const coveragePass = async (args: {
  readonly directory: string;
  readonly before: Manifest['refs'];
  readonly after: Manifest['refs'];
  readonly inputs: CoverageInputs;
  readonly budgetMilliseconds: number;
}): Promise<CoverageResult> => {
  const range = historyNewArguments(tipsOf(args.before), tipsOf(args.after));
  if (range.length === 0) {
    return { coverage: 'complete', commits: [], anonymous: false, unreadable: 0 };
  }
  if (args.budgetMilliseconds <= 0) {
    return { coverage: 'failed', anonymous: true, reason: 'budget_exceeded' };
  }
  const budget = AbortSignal.timeout(args.budgetMilliseconds);
  try {
    let listed = '';
    const text = new TextDecoder();
    await git(args.directory, ['rev-list', '--stdin'], {
      input: `${range.join('\n')}\n`,
      signal: budget,
      onStdout: (chunk) => {
        listed += text.decode(chunk, { stream: true });
      },
    });
    const oids = listed.split('\n').filter((line) => line.length > 0);
    const commits: CommitEntry[] = [];
    let unreadable = 0;
    if (oids.length > 0) {
      const read = batchReader((oid, body) => {
        if (body === undefined) {
          unreadable += 1;
          commits.push([oid, commitBits.tauOther]);
          return;
        }
        commits.push(entryOf(oid, body, args.inputs));
      });
      await git(args.directory, ['cat-file', '--batch'], {
        input: `${oids.join('\n')}\n`,
        signal: budget,
        onStdout: read,
      });
    }
    const anonymous = commits.some(
      (entry) => hasBit(entry, commitBits.pseudonymous) && !hasBit(entry, commitBits.claim),
    );
    return { coverage: 'complete', commits, anonymous, unreadable };
  } catch {
    return { coverage: 'failed', anonymous: true, reason: budget.aborted ? 'budget_exceeded' : 'walk_failed' };
  }
};
