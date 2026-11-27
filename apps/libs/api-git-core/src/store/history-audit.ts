/**
 * The read-only history audit of one hosted repository (cloud backup admission blueprint WP11).
 *
 * Before WP3 backfills attestations, the operator needs three numbers per repository: its history by record shape,
 * how many commits the backfill can reach only by inference, and (beside it, from Postgres) its orphaned large
 * objects. This module answers the first two from a hydrated lease and the push log; it writes nothing and returns
 * counts only, so no name, address or commit message leaves it.
 *
 * "History" is every commit a branch or tag reaches, the set the `pre-receive` hook judges. A commit is **unlisted**
 * when no push record's listed branch or tag tip reaches it: the backfill's first-brought walk (`historyNew` over
 * listed tips) cannot assign it, and marks it `inferred`. That happens for refs a record counted but did not list
 * (`omitted`, a push of more than 64 refs), for a listed tip compaction has since dropped (`missingTips`), and for
 * history committed before the push log existed. `recordsWithOmitted` says which cause can apply.
 */

import { spawn } from 'node:child_process';
import { readCommit } from '@taucad/revisions/provenance';
import type { PushRecord } from '#store/manifest.js';

/** What one repository's history holds, in counts. */
export type HistoryAudit = Readonly<{
  /** Commits any branch or tag reaches. */
  commits: number;
  /** Those commits by `readCommit` shape. */
  shapes: Readonly<Record<'git' | 'tau/2' | 'tau/other', number>>;
  /** Written by Tau's committer. */
  tauWritten: number;
  /** Recorded or authored under a device pseudonym. */
  pseudonymous: number;
  /** Naming an account in a record line or a no-reply local part. */
  namesAccount: number;
  /** Push records in the log. */
  records: number;
  /** Records that counted refs they did not list. */
  recordsWithOmitted: number;
  /** Refs counted and not listed, over every record. */
  omittedRefs: number;
  /** Listed branch or tag tips the repository no longer holds. */
  missingTips: number;
  /** History commits no listed branch or tag tip reaches. */
  unlisted: number;
}>;

/* Branches and tags only: the backfill's walk and the hook's "first brought" read nothing else. */
const isHistoryRef = (ref: string): boolean => ref.startsWith('refs/heads/') || ref.startsWith('refs/tags/');

const decoder = new TextDecoder();

const git = async (directory: string, args: readonly string[], input?: string): Promise<Uint8Array<ArrayBuffer>> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', directory, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Array<Uint8Array<ArrayBuffer>> = [];
    const errors: Array<Uint8Array<ArrayBuffer>> = [];
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => out.push(chunk));
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(out));
        return;
      }
      reject(new Error(`git ${args[0] ?? ''} exited ${String(code)}: ${decoder.decode(Buffer.concat(errors)).trim()}`));
    });
    child.stdin.end(input ?? '');
  });

const lines = (bytes: Uint8Array<ArrayBuffer>): string[] => decoder.decode(bytes).split('\n').filter(Boolean);

/* `cat-file --batch` output: `<oid> <type> <size>\n<body>\n`, repeated; bodies are cut by size, never by scanning. */
const eachBody = function* (bytes: Uint8Array<ArrayBuffer>): Generator<string> {
  let offset = 0;
  while (offset < bytes.length) {
    const newline = bytes.indexOf(0x0a, offset);
    if (newline === -1) {
      return;
    }
    const [, type, size] = decoder.decode(bytes.subarray(offset, newline)).split(' ');
    const length = Number(size);
    const start = newline + 1;
    if (type === 'commit' && Number.isSafeInteger(length)) {
      yield decoder.decode(bytes.subarray(start, start + length));
    }
    offset = start + (Number.isSafeInteger(length) ? length : 0) + 1;
  }
};

/**
 * Audit one repository's history against its push log. Read-only.
 *
 * @param directory - A hydrated lease's bare repository.
 * @param pushes - Every push record of the repository, oldest first.
 * @returns The counts.
 */
export const auditHistory = async (directory: string, pushes: readonly PushRecord[]): Promise<HistoryAudit> => {
  const history = lines(await git(directory, ['rev-list', '--branches', '--tags']));
  const tips = [
    ...new Set(
      pushes.flatMap((record) =>
        record.refs.flatMap((move) => (move.tip !== undefined && isHistoryRef(move.ref) ? [move.tip] : [])),
      ),
    ),
  ];
  const present = new Set(
    lines(await git(directory, ['cat-file', '--batch-check=%(objectname)'], `${tips.join('\n')}\n`)).filter(
      (line) => !line.endsWith(' missing'),
    ),
  );
  const listedTips = tips.filter((tip) => present.has(tip));
  const listed = new Set(
    listedTips.length === 0
      ? []
      : lines(await git(directory, ['rev-list', '--ignore-missing', '--stdin'], `${listedTips.join('\n')}\n`)),
  );
  const shapes = { git: 0, 'tau/2': 0, 'tau/other': 0 };
  let tauWritten = 0;
  let pseudonymous = 0;
  let namesAccount = 0;
  if (history.length > 0) {
    for (const body of eachBody(await git(directory, ['cat-file', '--batch'], `${history.join('\n')}\n`))) {
      const reading = readCommit(body);
      shapes[reading.shape] += 1;
      tauWritten += reading.tauWritten ? 1 : 0;
      pseudonymous += reading.pseudonymous ? 1 : 0;
      namesAccount += reading.namesAccount ? 1 : 0;
    }
  }
  return {
    commits: history.length,
    shapes,
    tauWritten,
    pseudonymous,
    namesAccount,
    records: pushes.length,
    recordsWithOmitted: pushes.filter((record) => (record.omitted ?? 0) > 0).length,
    omittedRefs: pushes.reduce((total, record) => total + (record.omitted ?? 0), 0),
    missingTips: tips.length - listedTips.length,
    unlisted: history.filter((commit) => !listed.has(commit)).length,
  };
};
