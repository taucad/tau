import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { stripVTControlCharacters } from 'node:util';
import { apiCalls, apiUrl, baseUrl } from '#support/api.js';
import type { ApiCall } from '#support/api.js';

export type Outcome = 'pass' | 'fail' | 'blocked' | 'skipped';
export type Priority = 'P0' | 'P1' | 'P2';

/**
 * What a row observed. `defect` names the finding (F-nn) or harness issue (H-nn) behind a fail or block. A `fail` is
 * the row's own observation of a product finding; a `blocked` row could not reach what it checks, because of a
 * harness issue or a product finding another row or an earlier step already observed (its evidence says which).
 * Harness issues: H-01 the Pay click never submits from this host; H-02 the Stripe read key cannot see the staging
 * endpoint; H-03 an earlier row left no state for this one; H-04 (retired) the harness did not pay the subscription
 * Checkout; H-05 no Stripe read key, so a Stripe-side assertion cannot be made; H-06 the row has spent its payment
 * allowance recorded in the run's output directory, so a re-run needs a new run id and output directory; H-07
 * (driver fixed after Run 1) Stripe's cancellation survey covered the portal's confirm button; H-08 (rows fixed after
 * Run 1) MK-01 and MK-03 read the served HTML, whose links name tau.new on every host until the site's own script
 * points them at this one; H-09 Tau's own supplier account refuses the route (out of credit), so a priced turn on it
 * cannot be observed until the operator tops it up.
 */
export type Verdict = { readonly outcome: Outcome; readonly defect?: string; readonly evidence: readonly string[] };

export type Row = Verdict & {
  readonly id: string;
  readonly p: Priority;
  readonly requestIds: readonly string[];
  readonly calls: readonly ApiCall[];
  readonly durationMs: number;
};

/** Thrown where the harness, not the product, stops a row; the row is recorded `blocked` by the harness issue. */
export class HarnessBlock extends Error {
  public readonly issue: string;

  public constructor(issue: string, message: string) {
    super(message);
    this.name = 'HarnessBlock';
    this.issue = issue;
  }
}

const configuredRunId = process.env['BILLING_E2E_RUN_ID'];
if (configuredRunId === undefined) {
  throw new Error('Run the harness through billing-e2e:test:staging, which names the run');
}

/** Names the accounts (`tau-e2e-<runId>-<case>`) and the evidence directory. */
export const runId = configuredRunId;

/**
 * Retained run output (tool-output policy): results.json, results-matrix.md, screenshots and traces. BILLING_E2E_OUT_DIR
 * moves one run elsewhere, for an operator who files the evidence beside the program's matrix.
 */
export const runDirectory = resolve(
  process.env['BILLING_E2E_OUT_DIR'] ?? resolve(import.meta.dirname, '../../../../out/test-results/billing-e2e', runId),
);

/** A staging account the run could not delete, and why; an operator sweeps it by `userId`. */
export type Orphan = {
  readonly caseId: string;
  readonly email: string;
  readonly userId: string;
  readonly reason: string;
};

/** The run's whole record: one entry per row and the accounts it could not delete. */
export type Results = { readonly rows: readonly Row[]; readonly orphans: readonly Orphan[] };

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

/** Where a rendered matrix says it ran. */
export type MatrixHeader = { readonly runId: string; readonly baseUrl: string; readonly apiUrl: string };

/** The same table shape as the program's results matrix: ID, P, outcome, evidence; then the accounts left behind. */
export const renderMatrix = ({ rows, orphans }: Results, header: MatrixHeader): string => {
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
    `# Billing staging matrix: run ${header.runId}`,
    '',
    `App \`${header.baseUrl}\`, API \`${header.apiUrl}\`: ${counts.join(', ')}. Every API call of each row is in \`results.json\`; screenshots and traces sit beside it.`,
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
  await writeFile(join(runDirectory, 'results-matrix.md'), renderMatrix(results, { runId, baseUrl, apiUrl }));
};

/**
 * Refuses a verdict the matrix cannot file: a fail or block must name what caused it. A product finding a row observes
 * itself always fails it (F-nn, or `unclassified` for review to number), so an unattended run never stays green on one;
 * `blocked` names a harness issue (H-nn) or a finding already observed elsewhere that keeps this row from looking.
 *
 * @param verdict - The row's verdict, with its id for the message.
 * @throws When the verdict does not name a filable cause.
 */
export const assertFilable = (verdict: Verdict & { readonly id: string }): void => {
  if ((verdict.outcome === 'fail' || verdict.outcome === 'blocked') && verdict.defect === undefined) {
    throw new Error(`${verdict.id}: a ${verdict.outcome} row must name its finding (F-nn) or harness issue (H-nn)`);
  }
  const defect = verdict.defect ?? 'nothing';
  if (verdict.outcome === 'blocked' && !/^[FH]-\d{2}$/u.test(defect)) {
    throw new Error(`${verdict.id}: a blocked row names a harness issue (H-nn) or a finding (F-nn), not ${defect}`);
  }
  if (verdict.outcome === 'fail' && !(/^F-\d{2}$/u.test(defect) || defect === 'unclassified')) {
    throw new Error(`${verdict.id}: a failed row names a finding (F-nn) or is unclassified, not ${defect}`);
  }
};

/** Upserts one row into results.json and re-renders results-matrix.md beside it. */
export const recordRow = async (row: Row): Promise<void> => {
  assertFilable(row);
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

/** What a row that throws adds to its evidence before it is recorded, such as a screenshot of each open page. */
const failureCollectors: Array<(id: string) => Promise<string>> = [];

/** Adds a collector of failure evidence; the returned function removes it again. */
export const collectOnFailure = (collect: (id: string) => Promise<string>): (() => void) => {
  failureCollectors.push(collect);
  return () => {
    const index = failureCollectors.indexOf(collect);
    if (index !== -1) {
      failureCollectors.splice(index, 1);
    }
  };
};

/** Every collector's evidence for a row that threw; a collector that cannot answer (a closed page) adds nothing. */
const failureEvidence = async (id: string): Promise<string[]> => {
  const collected: string[] = [];
  for (const collect of failureCollectors) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one page at a time, in the order the pages opened
      collected.push(await collect(id));
    } catch {
      // Nothing to add from this one.
    }
  }
  return collected;
};

/**
 * Runs one matrix row as a test body and records it with its duration and the API calls it made.
 * A thrown error is recorded as `fail (unclassified)` for review to number, keeping whatever evidence the body had
 * pushed into `gathered` by then, and a {@link HarnessBlock} as `blocked` by its issue; a `fail` verdict fails the
 * test.
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
      if (error instanceof HarnessBlock) {
        await record({ outcome: 'blocked', defect: error.issue, evidence: [...gathered, error.message] });
        return;
      }
      // Playwright colours its call logs; the record keeps the text.
      const message = stripVTControlCharacters(error instanceof Error ? error.message : String(error));
      await record({
        outcome: 'fail',
        defect: 'unclassified',
        evidence: [...gathered, message, ...(await failureEvidence(id))],
      });
      throw error;
    }
    await record(verdict);
    if (verdict.outcome === 'fail') {
      throw new Error(`${id} fails (${verdict.defect ?? 'unclassified'}): ${verdict.evidence.join('; ')}`);
    }
  };
