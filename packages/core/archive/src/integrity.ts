/**
 * Digest algorithms a pinned payload may use in its SRI string.
 * @public
 */
export type IntegrityAlgorithm = 'sha256' | 'sha384' | 'sha512';

const digestAlgorithms = { sha512: 'SHA-512', sha384: 'SHA-384', sha256: 'SHA-256', sha1: 'SHA-1' } as const;
const digestBytes: Readonly<Record<IntegrityAlgorithm, number>> = { sha256: 32, sha384: 48, sha512: 64 };

// oxlint-disable-next-line no-restricted-globals -- archive-core has no base64 dependency; btoa exists in every host it targets
const toBase64 = (bytes: Uint8Array<ArrayBuffer>): string => btoa(String.fromCodePoint(...bytes));

/**
 * Whether bytes match an SRI string (`package-lock.json` `integrity`). The strongest listed algorithm among
 * sha512, sha384, sha256 and npm's legacy sha1 decides; a string with none of them never matches.
 * @param bytes - Bytes to check.
 * @param integrity - One or more whitespace-separated `<algorithm>-<base64>` tokens.
 * @returns `true` when the strongest algorithm's digest matches one of its tokens.
 * @public
 */
export const integrityMatches = async (bytes: Uint8Array<ArrayBuffer>, integrity: string): Promise<boolean> => {
  const hashes = integrity
    .split(/\s+/u)
    .map((token) => /^(sha512|sha384|sha256|sha1)-([A-Za-z\d+/]+={0,2})$/u.exec(token))
    .filter((match) => match !== null);
  const strongest = Object.entries(digestAlgorithms).find(([name]) => hashes.some(([, hash]) => hash === name));
  if (strongest === undefined) {
    return false;
  }
  const [algorithm, webCryptoName] = strongest;
  const actual = toBase64(new Uint8Array(await crypto.subtle.digest(webCryptoName, bytes)));
  return hashes.some(([, hash, value]) => hash === algorithm && value === actual);
};

/**
 * Transcode a publisher's hex digest (PyPI, python-build-standalone `SHA256SUMS`, Microsoft `releases.json`) into
 * an SRI string. Upper- and lower-case hex are accepted; the length must match the algorithm.
 * @param algorithm - The digest's algorithm.
 * @param hex - The digest in hexadecimal.
 * @returns `<algorithm>-<padded base64>`.
 * @throws {TypeError} When `hex` is not a digest of that algorithm's length.
 * @public
 */
export const integrityFromHex = (algorithm: IntegrityAlgorithm, hex: string): string => {
  const length = digestBytes[algorithm];
  if (!new RegExp(`^[\\da-fA-F]{${length * 2}}$`, 'u').test(hex)) {
    throw new TypeError(`'${hex}' is not a ${length * 8}-bit hex digest for ${algorithm}.`);
  }
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return `${algorithm}-${toBase64(bytes)}`;
};

/**
 * Decode one SRI token back to the publisher's form: the algorithm and the lowercase hex digest, which is also
 * how digest-keyed store paths spell it.
 * @param integrity - A single `sha256-`, `sha384-` or `sha512-` token with padded base64 of the exact length.
 * @returns The algorithm and lowercase hex digest.
 * @throws {TypeError} When `integrity` is not one such token.
 * @public
 */
export const integrityToHex = (integrity: string): { readonly algorithm: IntegrityAlgorithm; readonly hex: string } => {
  const match = /^(sha256|sha384|sha512)-([A-Za-z\d+/]+={0,2})$/u.exec(integrity);
  const algorithm = match?.[1] as IntegrityAlgorithm | undefined;
  const value = match?.[2] ?? '';
  // oxlint-disable-next-line no-restricted-globals -- archive-core has no base64 dependency; atob exists in every host it targets
  const decoded = algorithm === undefined || value.length % 4 !== 0 ? '' : atob(value);
  if (
    algorithm === undefined ||
    decoded.length !== digestBytes[algorithm] ||
    toBase64(Uint8Array.from(decoded, (character) => character.codePointAt(0) ?? 0)) !== value
  ) {
    throw new TypeError(`'${integrity}' is not a sha256, sha384 or sha512 SRI string.`);
  }
  return {
    algorithm,
    hex: Array.from(decoded, (character) => (character.codePointAt(0) ?? 0).toString(16).padStart(2, '0')).join(''),
  };
};
