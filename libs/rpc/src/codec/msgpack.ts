/**
 * MessagePack {@link Codec} for byte-oriented transports — `@taucad/rpc/codec/msgpack`.
 *
 * **Default options, deliberately.** `ignoreUndefined: true` drops the
 * envelope's `d` key from a void response, which `isResponseShape` then
 * rejects — the frame is silently dropped and the call hangs. The default
 * encoder writes `undefined` as nil instead, so a void result arrives as
 * `null`; the filesystem bridge's `voidResult` validator accepts both.
 *
 * @public
 */

import { decode, encode } from '@msgpack/msgpack';
import type { Codec } from '#port.js';

/**
 * MessagePack `decode` hands back `Uint8Array` views into its own input buffer, so
 * any `.buffer` reach on the receive path would read a pooled region. Copy
 * every byte array out on the way through.
 *
 * ponytail: walks plain objects and arrays only — neither protocol carries
 * `Map`/`Set`/`Date`, which msgpack's default decoder never produces anyway.
 * Extend here if an extension codec is ever registered.
 */
const cloneDecodedBytes = (value: unknown): unknown => {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneDecodedBytes(entry));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneDecodedBytes(entry)] as const));
  }
  return value;
};

/** MessagePack codec with owned decoded bytes. @public */
export const msgpackCodec: Codec = {
  encode: (value) => encode(value),
  decode: (bytes) => cloneDecodedBytes(decode(bytes)),
};
