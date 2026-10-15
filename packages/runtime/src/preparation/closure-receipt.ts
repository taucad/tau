import type { DependencyPayload, Integrity, ReceiptFile } from '#preparation/preparation.types.js';

const encoder = new TextEncoder();

const sha256Integrity = async (text: string): Promise<Integrity> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  // oxlint-disable-next-line no-restricted-globals -- the runtime has no base64 dependency; btoa exists in every host it targets
  return `sha256-${btoa(String.fromCodePoint(...digest))}`;
};

/**
 * Identity of *which pins* a closure is made of: sha256 over the newline-joined `name<TAB>integrity` rows in
 * manifest order. Two hosts that select the same variant compute the same value before downloading anything.
 * @param payloads - The selected variant's payloads, in manifest order.
 * @returns An SRI sha256 string.
 * @public
 */
export const computeClosureIntegrity = async (
  payloads: ReadonlyArray<Pick<DependencyPayload, 'name' | 'integrity'>>,
): Promise<Integrity> => sha256Integrity(payloads.map(({ name, integrity }) => `${name}\t${integrity}`).join('\n'));

/**
 * The canonical row of one receipt file: `path NUL byteLength NUL sha256 NUL mode NUL symlinkTarget`, with
 * `byteLength` in decimal, `mode` in octal and an empty `symlinkTarget` for a regular file.
 * @internal
 * @param file - One receipt file.
 * @returns The row, without a line terminator.
 */
export const receiptRow = (file: ReceiptFile): string =>
  [file.path, String(file.byteLength), file.sha256, file.mode.toString(8), file.symlinkTarget ?? ''].join('\0');

/**
 * Identity of *what the installer produced*: sha256 over the canonical file rows sorted by path in code-unit order
 * and joined by newlines. The same closure yields the same value on every host, so it is compared against the golden
 * receipt committed beside the manifest.
 * @param files - Every file of the closure, in any order.
 * @returns An SRI sha256 string.
 * @public
 */
export const computeTreeIntegrity = async (files: readonly ReceiptFile[]): Promise<Integrity> =>
  sha256Integrity(
    files
      .toSorted((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
      .map((file) => receiptRow(file))
      .join('\n'),
  );

/**
 * Closure-relative path of the launch index: the seal step writes it beside `receipt.json`, and it is itself a receipt
 * row, so `treeIntegrity` covers it and a full re-verification catches a changed index like any other file.
 * @internal
 */
export const launchIndexPath = 'launch.json';

/**
 * The compact launch index (D8, ruling X29): the receipt rows of the files a kernel's process loads first, which the
 * launch check hashes, and nothing else. A launch reads this instead of the full receipt, so its cost does not grow
 * with the closure.
 * @internal
 */
export type LaunchIndex = {
  readonly schemaVersion: 1;
  readonly package: string;
  readonly dependency: string;
  readonly closureIntegrity: Integrity;
  /** The launch set's receipt rows, sorted by path. */
  readonly files: readonly ReceiptFile[];
};

/**
 * The bytes of a closure's launch index. They depend only on the rows, so the same closure writes the same index on
 * every host (I9).
 * @internal
 * @param index - The index.
 * @returns The file's text.
 */
export const renderLaunchIndex = (index: LaunchIndex): string =>
  `${JSON.stringify(
    {
      schemaVersion: index.schemaVersion,
      package: index.package,
      dependency: index.dependency,
      closureIntegrity: index.closureIntegrity,
      files: index.files
        .toSorted((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
        .map((file) => ({
          path: file.path,
          byteLength: file.byteLength,
          sha256: file.sha256,
          mode: file.mode,
          ...(file.symlinkTarget === undefined ? {} : { symlinkTarget: file.symlinkTarget }),
          ...(file.payload === undefined ? {} : { payload: file.payload }),
        })),
    },
    undefined,
    2,
  )}\n`;

const isReceiptFile = (value: unknown): value is ReceiptFile => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const file = value as Partial<Record<keyof ReceiptFile, unknown>>;
  return (
    typeof file.path === 'string' &&
    typeof file.byteLength === 'number' &&
    typeof file.sha256 === 'string' &&
    typeof file.mode === 'number' &&
    (file.symlinkTarget === undefined || typeof file.symlinkTarget === 'string')
  );
};

/**
 * Parse a launch index's text.
 * @internal
 * @param text - The file's text.
 * @returns The index, or `undefined` when it is not one.
 */
export const parseLaunchIndex = (text: string): LaunchIndex | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const index = value as Partial<Record<keyof LaunchIndex, unknown>>;
  return index.schemaVersion === 1 &&
    typeof index.package === 'string' &&
    typeof index.dependency === 'string' &&
    typeof index.closureIntegrity === 'string' &&
    Array.isArray(index.files) &&
    index.files.every((file) => isReceiptFile(file))
    ? (index as LaunchIndex)
    : undefined;
};
