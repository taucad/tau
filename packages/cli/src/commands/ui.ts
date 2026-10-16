// `tau ui verify` (charter D26): re-hash a deployed copy of the Tau UI against the asset receipt its build wrote, so an
// operator who copied the static build to their own web server or CDN can prove every file it serves is the byte Tau
// built. The browser enforces the same digests for WASM through `fetch(url, { integrity })`; this is the check for the
// whole document root, run where the files are.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { defineCommand } from 'citty';

import { cliError, emit, exitCodes, writeStdout } from '#output.js';

/** File name of the UI asset receipt at the root of the client build. */
export const uiReceiptName = 'tau-asset-receipt.json';

/** One emitted file of the UI build. */
type ReceiptAsset = {
  /** Path relative to the client output root, as the static host serves it. */
  readonly path: string;
  readonly bytes: number;
  /** Subresource Integrity value of the built bytes. */
  readonly integrity: string;
};

/** What the UI build writes at its client root (`tau-ui-asset-receipt-v1`). */
type UiReceipt = {
  readonly schema: 'tau-ui-asset-receipt-v1';
  readonly algorithm: 'sha256' | 'sha384' | 'sha512';
  readonly assets: readonly ReceiptAsset[];
};

/** One file that does not match the receipt. */
export type UiVerificationProblem = {
  readonly path: string;
  readonly problem: 'missing' | 'altered' | 'outside-root';
  /** For `altered`: the integrity and size of the bytes found. */
  readonly found?: { readonly integrity: string; readonly bytes: number };
};

/** What `tau ui verify` found. */
export type UiVerification = {
  readonly directory: string;
  readonly assets: number;
  readonly problems: readonly UiVerificationProblem[];
  /** Files under the root the receipt does not list (source maps and the receipt itself aside); reported, not refused. */
  readonly unlisted: readonly string[];
};

const isReceipt = (value: unknown): value is UiReceipt => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<UiReceipt>;
  return (
    candidate.schema === 'tau-ui-asset-receipt-v1' &&
    (candidate.algorithm === 'sha256' || candidate.algorithm === 'sha384' || candidate.algorithm === 'sha512') &&
    Array.isArray(candidate.assets) &&
    candidate.assets.every(
      (asset: Partial<ReceiptAsset>) =>
        typeof asset.path === 'string' && typeof asset.bytes === 'number' && typeof asset.integrity === 'string',
    )
  );
};

const integrityOf = async (
  path: string,
  algorithm: UiReceipt['algorithm'],
): Promise<{ readonly integrity: string; readonly bytes: number }> => {
  const hash = createHash(algorithm);
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    const buffer = chunk as Uint8Array<ArrayBuffer>;
    bytes += buffer.byteLength;
    hash.update(buffer);
  }
  return { integrity: `${algorithm}-${hash.digest('base64')}`, bytes };
};

const filesUnder = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .toSorted();
};

/**
 * Re-hash a client build against its asset receipt.
 * @param directory - The document root a static host serves: the build's client directory or a copy of it.
 * @returns Every listed file that is missing or altered, and the files the receipt does not list.
 * @throws When the root holds no readable receipt.
 */
export const verifyUi = async (directory: string): Promise<UiVerification> => {
  const root = resolve(directory);
  let receipt: unknown;
  try {
    receipt = JSON.parse(await readFile(join(root, uiReceiptName), 'utf8')) as unknown;
  } catch (error) {
    throw cliError(
      'UI_RECEIPT_MISSING',
      `${join(root, uiReceiptName)} cannot be read (${error instanceof Error ? error.message : String(error)}). Point tau ui verify at the client directory of a Tau UI build, which ships the receipt at its root.`,
      exitCodes.refused,
    );
  }
  if (!isReceipt(receipt)) {
    throw cliError(
      'UI_RECEIPT_INVALID',
      `${join(root, uiReceiptName)} is not a tau-ui-asset-receipt-v1 receipt.`,
      exitCodes.refused,
    );
  }
  const problems: UiVerificationProblem[] = [];
  for (const asset of receipt.assets) {
    const path = resolve(root, asset.path);
    if (path !== root && !path.startsWith(root + sep)) {
      problems.push({ path: asset.path, problem: 'outside-root' });
      continue;
    }
    let found: { readonly integrity: string; readonly bytes: number };
    try {
      // oxlint-disable-next-line no-await-in-loop -- one file at a time on one disk
      found = await integrityOf(path, receipt.algorithm);
    } catch {
      problems.push({ path: asset.path, problem: 'missing' });
      continue;
    }
    if (found.integrity !== asset.integrity || found.bytes !== asset.bytes) {
      problems.push({ path: asset.path, problem: 'altered', found });
    }
  }
  const listed = new Set(receipt.assets.map((asset) => asset.path));
  const served = await filesUnder(root);
  const unlisted = served.filter((path) => path !== uiReceiptName && !path.endsWith('.map') && !listed.has(path));
  return { directory: root, assets: receipt.assets.length, problems, unlisted };
};

const verifyCommand = defineCommand({
  meta: {
    name: 'verify',
    description: 'Re-hash a deployed Tau UI against the asset receipt its build wrote; exit 3 when any file differs',
  },
  args: {
    directory: {
      type: 'positional',
      description: 'The document root your web server serves: the build’s client directory or a copy of it',
      required: true,
    },
    json: {
      type: 'boolean',
      description: 'Print one machine-readable record on stdout',
      default: false,
    },
  },
  async run({ args }) {
    const report = await verifyUi(args.directory);
    await (args.json
      ? emit({ kind: 'ui-verify', ok: report.problems.length === 0, ...report })
      : writeStdout(
          `${[
            `${report.directory}: ${String(report.assets - report.problems.length)} of ${String(report.assets)} files match the receipt`,
            ...report.problems.map(({ path, problem }) => `${problem} ${path}`),
            ...(report.unlisted.length === 0
              ? []
              : [`${String(report.unlisted.length)} files the receipt does not list: ${report.unlisted.join(', ')}`]),
          ].join('\n')}\n`,
        ));
    if (report.problems.length > 0) {
      throw cliError(
        'UI_ASSETS_ALTERED',
        `${String(report.problems.length)} files of ${report.directory} are missing or differ from the build: ${report.problems.map(({ path }) => path).join(', ')}. Copy the build again; a browser refuses an altered WASM module under its integrity.`,
        { exit: exitCodes.refused, details: report.problems },
      );
    }
  },
});

/**
 * `tau ui` command family.
 *
 * `tau ui verify <dir>` re-hashes a deployed copy of the Tau UI's static build against `tau-asset-receipt.json`, the
 * receipt the build writes at its client root: every file the build emitted, with its Subresource Integrity value.
 * Run it after copying the build to a web server or CDN. Exit 0 when every listed file matches, 3 when one is missing
 * or altered.
 *
 * @example <caption>Verify a deployed document root</caption>
 * ```bash
 * tau ui verify /var/www/tau
 * tau ui verify apps/ui/build/client --json
 * ```
 */
export const uiCommand = defineCommand({
  meta: {
    name: 'ui',
    description: 'Check a deployed Tau UI against its build',
  },
  subCommands: {
    verify: verifyCommand,
  },
});
