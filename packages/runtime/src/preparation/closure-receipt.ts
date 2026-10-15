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
