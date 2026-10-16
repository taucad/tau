// Golden receipts: the producer records, beside a manifest, the `closureIntegrity`, `treeIntegrity` and file count a
// target's sealed closure must have, and every host that prepares that target compares its receipt with the entry.
// Equal `treeIntegrity` on two hosts is the cross-host proof that one manifest installs one tree (charter R3, I9).
import { appendFile, readFile } from 'node:fs/promises';

import type { ClosureReceipt } from '@taucad/runtime/preparation/node';

/**
 * One target's golden entry, as `tau-plugin.golden.json` records it.
 * @public
 */
export type GoldenReceipt = {
  readonly closureIntegrity: string;
  readonly treeIntegrity: string;
  /** Compared when recorded; `treeIntegrity` already covers every file row. */
  readonly fileCount?: number;
  readonly byteLength?: number;
};

/**
 * A golden file: target key (`darwin-arm64`, `linux-x64-glibc`) to its entry.
 * @public
 */
export type GoldenReceipts = Readonly<Record<string, GoldenReceipt>>;

/**
 * How one sealed receipt compares with its target's golden entry.
 * @public
 */
export type GoldenComparison = {
  readonly target: string;
  readonly status: 'match' | 'mismatch' | 'no-golden';
  readonly observed: Required<Pick<GoldenReceipt, 'closureIntegrity' | 'treeIntegrity' | 'fileCount'>>;
  readonly expected?: GoldenReceipt;
};

const isEntry = (value: unknown): value is GoldenReceipt =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>)['closureIntegrity'] === 'string' &&
  typeof (value as Record<string, unknown>)['treeIntegrity'] === 'string' &&
  ((value as Record<string, unknown>)['fileCount'] === undefined ||
    Number.isSafeInteger((value as Record<string, unknown>)['fileCount']));

/**
 * Read a golden file.
 * @param path - Path of `tau-plugin.golden.json`.
 * @returns Its entries.
 * @throws When an entry lacks `closureIntegrity` or `treeIntegrity`, or records a `fileCount` that is not an integer.
 * @public
 */
export const readGoldenReceipts = async (path: string): Promise<GoldenReceipts> => {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`${path} is not an object of golden receipts.`);
  }
  for (const [target, entry] of Object.entries(parsed)) {
    if (!isEntry(entry)) {
      throw new TypeError(
        `${path} entry ${target} needs closureIntegrity, treeIntegrity and, when recorded, an integer fileCount.`,
      );
    }
  }
  return parsed as GoldenReceipts;
};

/**
 * Compare a sealed receipt with its target's golden entry. `byteLength` is informational and never compared.
 * @param receipt - The receipt a host sealed.
 * @param golden - The golden file's entries.
 * @param target - The receipt's target key.
 * @returns The comparison; `no-golden` when the file has no entry for the target.
 * @public
 */
export const compareWithGolden = (
  receipt: Pick<ClosureReceipt, 'closureIntegrity' | 'treeIntegrity' | 'files'>,
  golden: GoldenReceipts,
  target: string,
): GoldenComparison => {
  const observed: GoldenComparison['observed'] = {
    closureIntegrity: receipt.closureIntegrity,
    treeIntegrity: receipt.treeIntegrity,
    fileCount: receipt.files.length,
  };
  const expected = golden[target];
  if (expected === undefined) {
    return { target, status: 'no-golden', observed };
  }
  const matches =
    expected.closureIntegrity === observed.closureIntegrity &&
    expected.treeIntegrity === observed.treeIntegrity &&
    (expected.fileCount === undefined || expected.fileCount === observed.fileCount);
  return { target, status: matches ? 'match' : 'mismatch', observed, expected };
};

/**
 * One Markdown table row for a CI job summary, so two runs compare by one string.
 * @param label - What was prepared, such as `@taucad/build123d engine`.
 * @param comparison - From {@link compareWithGolden}.
 * @returns The row, without a line terminator.
 * @public
 */
export const goldenSummaryRow = (label: string, comparison: GoldenComparison): string =>
  `| ${label} | ${comparison.target} | \`${comparison.observed.treeIntegrity}\` | \`${
    comparison.expected?.treeIntegrity ?? 'none'
  }\` | ${String(comparison.observed.fileCount)} | ${comparison.status} |`;

/**
 * Append {@link goldenSummaryRow} to the Markdown file `TAU_GOLDEN_SUMMARY_FILE` names, so a CI job publishes every
 * preparing host's comparison in its summary; nothing is written when the variable is unset.
 * @param label - What was prepared.
 * @param comparison - From {@link compareWithGolden}.
 * @param environment - The environment to read; `process.env` when absent.
 * @public
 */
export const appendGoldenSummary = async (
  label: string,
  comparison: GoldenComparison,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> => {
  const file = environment['TAU_GOLDEN_SUMMARY_FILE'];
  if (file !== undefined && file !== '') {
    await appendFile(file, `${goldenSummaryRow(label, comparison)}\n`);
  }
};
