/**
 * Letters and digits a person can read back without mistaking one for another: no `0 O 1 l I`.
 * Every one is one UTF-8 byte, so a generated password's length is its byte count.
 */
const passwordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** The longest unbiased run of random bytes: a byte at or above it would favour the alphabet's first letters. */
const unbiasedByteLimit = 256 - (256 % passwordAlphabet.length);

/** The length a generated password aims for before the method's bounds narrow it. */
const preferredLength = 24;

/**
 * A password the share pane offers when the person turns the password on: random letters and digits from
 * `crypto.getRandomValues`, at least 24 long and within the method's byte bounds.
 *
 * @param bounds - The shortest and longest password the method accepts, counted in UTF-8 bytes.
 * @returns Random letters and digits, 24 of them unless the bounds ask for more or allow fewer.
 */
export const generateSharePassword = (bounds: Readonly<{ minBytes: number; maxBytes: number }>): string => {
  const length = Math.min(Math.max(preferredLength, bounds.minBytes), bounds.maxBytes);
  let password = '';
  while (password.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (password.length === length) {
        break;
      }
      if (byte < unbiasedByteLimit) {
        password += passwordAlphabet[byte % passwordAlphabet.length];
      }
    }
  }
  return password;
};
