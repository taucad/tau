import type { Readable } from 'node:stream';

/**
 * How a receipt rides back on a git RPC's response (DC1).
 *
 * A receipt names every LFS object the committed refs reach, which can be far
 * larger than any proxy lets a header be, so it travels in the body instead:
 * `<decimal length>\n<receipt>` and then git's own bytes, untouched. A length
 * of `0` means no receipt. The API strips the prefix before a byte reaches the
 * client, so stock git never sees it.
 */

/** Response header that says the body opens with a receipt prefix. */
export const framingHeader = 'tau-storage-framing';

/** {@link framingHeader}'s one value. */
export const receiptPrefixed = 'receipt-prefixed';

/**
 * Response header that marks a refusal tau-storage decided (its JSON body is
 * the refusal), as against an error between the two apps.
 */
export const outcomeHeader = 'tau-storage-outcome';

/** {@link outcomeHeader}'s value on a refusal. */
export const refusedOutcome = 'refused';

/** The longest receipt a prefix may announce: a million LFS ids is about 66 MB. */
export const maximumReceiptPrefixBytes = 72 * 1024 * 1024;

/** Digits a length may have before the newline. */
const maximumLengthDigits = 9;

/**
 * The next buffered chunk of a byte stream, or `undefined` when none is buffered.
 *
 * @param source - A stream in paused mode, read on `readable`.
 * @returns The chunk.
 */
const readChunk = (source: Readable): Uint8Array<ArrayBuffer> | undefined => {
  const chunk: unknown = source.read();
  return chunk instanceof Uint8Array ? (chunk as Uint8Array<ArrayBuffer>) : undefined;
};

/**
 * Encodes the prefix.
 *
 * @param receipt - The signed receipt, if there is one.
 * @returns The bytes to write before git's.
 */
export const encodeReceiptPrefix = (receipt: string | undefined): Uint8Array<ArrayBuffer> => {
  const bytes = Buffer.from(receipt ?? '', 'utf8');
  return Buffer.concat([Buffer.from(`${String(bytes.byteLength)}\n`, 'ascii'), bytes]);
};

/**
 * Reads the prefix off a response stream and leaves the stream at git's first
 * byte, so the caller can pipe it straight on.
 *
 * @param source - The response body.
 * @returns The receipt, or `undefined` when the prefix announced none.
 * @throws Error When the prefix is malformed, too long, or the stream ends inside it.
 */
export const readReceiptPrefix = async (source: Readable): Promise<string | undefined> =>
  new Promise((resolve, reject) => {
    /* Chunks are kept and joined once, when the prefix is whole (review S8). */
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    let total = 0;
    /* Where the length line ends, once a chunk carried its newline. */
    let newline = -1;
    let settled = false;
    const finish = (error: Error | undefined, receipt?: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      source.off('readable', onReadable);
      source.off('end', onEnd);
      source.off('error', onError);
      if (error === undefined) {
        resolve(receipt);
      } else {
        reject(error);
      }
    };
    const malformed = (): void => {
      finish(new Error('The storage response opened with a malformed receipt prefix'));
    };
    let length = 0;
    const onReadable = (): void => {
      for (let chunk = readChunk(source); chunk !== undefined; chunk = readChunk(source)) {
        if (newline === -1) {
          const found = chunk.indexOf(0x0a);
          if (found === -1) {
            chunks.push(chunk);
            total += chunk.byteLength;
            if (total > maximumLengthDigits) {
              malformed();
              return;
            }
            continue;
          }
          newline = total + found;
          const digits = Buffer.concat([...chunks, chunk.subarray(0, found)]).toString('ascii');
          if (!/^\d{1,9}$/u.test(digits) || Number(digits) > maximumReceiptPrefixBytes) {
            malformed();
            return;
          }
          length = Number(digits);
        }
        chunks.push(chunk);
        total += chunk.byteLength;
        const end = newline + 1 + length;
        if (total < end) {
          continue;
        }
        const buffered = Buffer.concat(chunks, total);
        const rest = buffered.subarray(end);
        finish(undefined, length === 0 ? undefined : buffered.subarray(newline + 1, end).toString('utf8'));
        if (rest.byteLength > 0) {
          source.unshift(rest);
        }
        return;
      }
    };
    const onEnd = (): void => {
      finish(new Error('The storage response ended inside its receipt prefix'));
    };
    const onError = (error: Error): void => {
      finish(error);
    };
    source.on('readable', onReadable);
    source.once('end', onEnd);
    source.once('error', onError);
  });
