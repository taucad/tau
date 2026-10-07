import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { apiCalls, apiUrl, baseUrl } from '#support/api.js';
import type { ApiCall } from '#support/api.js';

export type Outcome = 'pass' | 'fail' | 'blocked' | 'skipped';
export type Priority = 'P0' | 'P1' | 'P2';

/**
 * What a row observed. `defect` names the finding (F-nn) or harness issue behind a fail or block. Harness issues:
 * H-01 the Pay click never submits from this host; H-02 the Stripe read key cannot see the staging endpoint;
 * H-03 an earlier row left no state for this one; H-04 the harness does not pay the subscription Checkout.
 */
export type Verdict = { readonly outcome: Outcome; readonly defect?: string; readonly evidence: readonly string[] };

export type Row = Verdict & {
  readonly id: string;
  readonly p: Priority;
  readonly requestIds: readonly string[];
  readonly calls: readonly ApiCall[];
  readonly durationMs: number;
};

const configuredRunId = process.env['BILLING_E2E_RUN_ID'];
if (configuredRunId === undefined) {
  throw new Error('Run the harness through billing-e2e:test:staging, which names the run');
}

/** Names the accounts (`tau-e2e-<runId>-<case>`) and the evidence directory. */
export const runId = configuredRunId;

/** Retained run output (tool-output policy): results.json, results-matrix.md, screenshots and traces. */
export const runDirectory = resolve(import.meta.dirname, '../../../../out/test-results/billing-e2e', runId);

/** A staging account the run could not delete, and why; an operator sweeps it by `userId`. */
export type Orphan = {
  readonly caseId: string;
  readonly email: string;
  readonly userId: string;
  readonly reason: string;
};

type Results = { readonly rows: readonly Row[]; readonly orphans: readonly Orphan[] };

const resultsPath = join(runDirectory, 'results.json');

/** Every results.json mutation queues behind the previous one: teardowns run concurrently (auth closes three). */
let ledger: Promise<void> = Promise.resolve();
const serialized = async <T>(work: () => Promise<T>): Promise<T> => {
  const turn = ledger;
  let release: () => void = () => undefined;
  ledger = new Promise<void>((resolve) => {
    release = resolve;
  });
  await turn;
  try {
    return await work();
  } finally {
    // Released whatever happened, so a failed write leaves the next caller runnable.
    release();
  }
};

const readResults = async (): Promise<Results> => {
  try {
    const parsed = JSON.parse(await readFile(resultsPath, 'utf8')) as Partial<Results>;
    return { rows: parsed.rows ?? [], orphans: parsed.orphans ?? [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { rows: [], orphans: [] };
    }
    throw error;
  }
};

const cell = (text: string): string => {
  const flat = text.replaceAll('|', String.raw`\|`).replaceAll(/\s+/gu, ' ');
  return flat.length > 600 ? `${flat.slice(0, 600)}…` : flat;
};

/** The same table shape as the program's results matrix: ID, P, outcome, evidence; then the accounts left behind. */
const renderMatrix = ({ rows, orphans }: Results): string => {
  const outcomes: readonly Outcome[] = ['pass', 'fail', 'blocked', 'skipped'];
  const counts = outcomes.map((outcome) => `${rows.filter((row) => row.outcome === outcome).length} ${outcome}`);
  const lines = rows.map((row) => {
    const outcome = row.defect === undefined ? row.outcome : `${row.outcome} (${row.defect})`;
    const ids = row.requestIds.slice(0, 4).map((id) => `\`${id}\``);
    const more = row.requestIds.length > 4 ? [`+${row.requestIds.length - 4} more request ids in results.json`] : [];
    const evidence = [...row.evidence, ...(ids.length > 0 ? [`request ids ${ids.join(', ')}`] : []), ...more];
    return `| ${row.id} | ${row.p} | ${outcome} | ${cell(evidence.join('; '))} |`;
  });
  return [
    `# Billing staging matrix: run ${runId}`,
    '',
    `App \`${baseUrl}\`, API \`${apiUrl}\`: ${counts.join(', ')}. Every API call of each row is in \`results.json\`; screenshots and traces sit beside it.`,
    '',
    '| ID | P | Outcome | Evidence |',
    '| --- | --- | --- | --- |',
    ...lines,
    '',
    ...(orphans.length === 0
      ? []
      : [
          `Accounts the run could not delete, for an operator to sweep: ${orphans
            .map(({ email, userId, caseId, reason }) => `\`${email}\` (user ${userId}, row ${caseId}: ${cell(reason)})`)
            .join(', ')}.`,
          '',
        ]),
  ].join('\n');
};

const writeResults = async (results: Results): Promise<void> => {
  await mkdir(runDirectory, { recursive: true });
  await writeFile(resultsPath, `${JSON.stringify({ runId, baseUrl, apiUrl, ...results }, undefined, 2)}\n`);
  await writeFile(join(runDirectory, 'results-matrix.md'), renderMatrix(results));
};

/** Upserts one row into results.json and re-renders results-matrix.md beside it. */
export const recordRow = async (row: Row): Promise<void> => {
  if ((row.outcome === 'fail' || row.outcome === 'blocked') && row.defect === undefined) {
    throw new Error(`${row.id}: a ${row.outcome} row must name its finding (F-nn) or harness issue (H-nn)`);
  }
  // `blocked` is for a row that could not look (H-nn); a product finding (F-nn) always fails the row, so an unattended
  // run never stays green on one.
  const defect = row.defect ?? 'nothing';
  if (row.outcome === 'blocked' && !defect.startsWith('H-')) {
    throw new Error(`${row.id}: a blocked row names a harness issue (H-nn), not ${defect}`);
  }
  if (row.outcome === 'fail' && !(defect.startsWith('F-') || defect === 'unclassified')) {
    throw new Error(`${row.id}: a failed row names a finding (F-nn) or is unclassified, not ${defect}`);
  }
  await serialized(async () => {
    const previous = await readResults();
    const rows = [...previous.rows.filter(({ id }) => id !== row.id), row].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    await writeResults({ rows, orphans: previous.orphans });
  });
};

/** Names an account the run could not delete, in results.json and under the matrix, so it is swept rather than lost. */
export const recordOrphan = async (orphan: Orphan): Promise<void> => {
  await serialized(async () => {
    const previous = await readResults();
    await writeResults({
      rows: previous.rows,
      orphans: [...previous.orphans.filter(({ userId }) => userId !== orphan.userId), orphan],
    });
  });
};

/**
 * Runs one matrix row as a test body and records it with its duration and the API calls it made.
 * A thrown error is recorded as `fail (unclassified)` for review to number, keeping whatever evidence the body had
 * pushed into `gathered` by then; a `fail` verdict fails the test.
 */
export const matrixRow =
  (id: string, p: Priority, body: (gathered: string[]) => Promise<Verdict>): (() => Promise<void>) =>
  async () => {
    const started = Date.now();
    const firstCall = apiCalls.length;
    const record = async (verdict: Verdict): Promise<void> => {
      const calls = apiCalls.slice(firstCall);
      const requestIds = calls.flatMap(({ requestId }) => (requestId === undefined ? [] : [requestId]));
      await recordRow({ id, p, ...verdict, requestIds, calls, durationMs: Date.now() - started });
    };
    const gathered: string[] = [];
    let verdict: Verdict;
    try {
      verdict = await body(gathered);
    } catch (error) {
      await record({
        outcome: 'fail',
        defect: 'unclassified',
        evidence: [...gathered, error instanceof Error ? error.message : String(error)],
      });
      throw error;
    }
    await record(verdict);
    if (verdict.outcome === 'fail') {
      throw new Error(`${id} fails (${verdict.defect ?? 'unclassified'}): ${verdict.evidence.join('; ')}`);
    }
  };
