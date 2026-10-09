import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { HarnessBlock, runDirectory, runId } from '#support/results.js';

/**
 * Successful payments each row may make under one run id: one per row that needs one, two for TU-04's two legs.
 * Every other row pays nothing. US$5 top-ups and the US$20 plan are the only amounts the rows charge.
 */
export const paymentAllowance: Readonly<Record<string, number>> = {
  'TU-01': 1,
  'TU-03': 1,
  'TU-04': 2,
  'TU-06': 1,
  'PR-01': 1,
  'AC-02': 1,
};

/** One successful payment: the row, the Checkout session or action it paid, and when. */
const paymentSchema = z.object({ row: z.string(), reference: z.string(), at: z.string() }).strict();
export type PaymentEntry = z.infer<typeof paymentSchema>;

/** The run's payment ledger beside results.json, so a re-run under the same run id sees what was already paid. */
const ledgerPath = join(runDirectory, 'payments.json');

const readLedger = async (): Promise<PaymentEntry[]> => {
  try {
    return paymentSchema.array().parse(JSON.parse(await readFile(ledgerPath, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

/**
 * How many payments the row may still make, given the payments already booked under this run id.
 *
 * @param entries - The run's ledger.
 * @param row - The program row about to pay.
 * @returns The row's allowance less its booked payments, never below zero; zero for a row that pays nothing.
 */
export const paymentsLeft = (entries: readonly PaymentEntry[], row: string): number =>
  Math.max(0, (paymentAllowance[row] ?? 0) - entries.filter((entry) => entry.row === row).length);

/** Stops the row as blocked (H-06) before a payment its allowance no longer covers. */
export const assertPaymentAllowed = async (row: string): Promise<void> => {
  const entries = await readLedger();
  if (paymentsLeft(entries, row) === 0) {
    throw new HarnessBlock(
      'H-06',
      `${row} has spent its ${paymentAllowance[row] ?? 0} payment(s) under run id ${runId}; re-run it under a new run id`,
    );
  }
};

/**
 * Records one successful payment against the row's allowance. The ledger is replaced through a rename, so a reader
 * never meets a half-written file; the staging rows run one after another (`fileParallelism: false`), so no two
 * writers race for it.
 */
export const recordPayment = async (row: string, reference: string): Promise<void> => {
  const entries = await readLedger();
  await mkdir(runDirectory, { recursive: true });
  const replacement = `${ledgerPath}.${process.pid}.tmp`;
  await writeFile(
    replacement,
    `${JSON.stringify([...entries, { row, reference, at: new Date().toISOString() }], undefined, 2)}\n`,
  );
  await rename(replacement, ledgerPath);
};
