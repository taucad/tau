import { describe, expect, it } from 'vitest';
import { isWireMessage } from '#wire.js';
import { msgpackCodec } from '#codec/msgpack.js';

const bytes = (...values: number[]): Uint8Array<ArrayBuffer> => new Uint8Array(values);

/** Every `Uint8Array` reachable from `value`, in a stable walk order. */
const collectBytes = (value: unknown): Array<Uint8Array<ArrayBuffer>> => {
  if (value instanceof Uint8Array) {
    // `instanceof` narrows to the ArrayBufferLike form; every array here is ArrayBuffer-backed.
    return [value as Uint8Array<ArrayBuffer>];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectBytes(entry));
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap((entry) => collectBytes(entry));
  }
  return [];
};

const indexOfSequence = (haystack: Uint8Array<ArrayBuffer>, needle: readonly number[]): number => {
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((byte, offset) => haystack[start + offset] === byte)) {
      return start;
    }
  }
  return -1;
};

/* One row per payload shape that actually crosses a runtime or filesystem
 * bridge socket. `bytes.length > 0` is not evidence (testing-policy §13), so
 * every row asserts deep equality plus byte-identical, unaliased typed arrays. */
const rows: ReadonlyArray<readonly [string, unknown]> = [
  [
    'geometry bytes',
    { format: 'gltf', content: { delivery: 'inline', bytes: bytes(0x67, 0x6c, 0x54, 0x46, 0, 255) }, hash: 'g1' },
  ],
  ['staged-file record', { path: '/main.ts', content: bytes(1, 2, 3), encoding: 'utf8', stagedAt: 1_755_000_000_000 }],
  ['export bytes', { format: 'step', content: bytes(83, 84, 69, 80), byteLength: 4 }],
  ['fs readFile binary result', { v: 1, k: 'rs', i: 'c1', o: 1, d: bytes(9, 8, 7, 0, 0, 6) }],
  ['fs readFile utf8 result', { v: 1, k: 'rs', i: 'c2', o: 1, d: 'cube(1);' }],
  [
    'writeFile args',
    { v: 1, k: 'rq', i: 'c3', n: 'call', a: { method: 'writeFile', args: ['/main.ts', bytes(4, 5, 6)] } },
  ],
  [
    'hello',
    { v: 1, k: 'lh', o: 1, d: { server: 'kernel-runtime-worker', protocolVersion: 2, transportId: 'web-socket' } },
  ],
  [
    'fs bridge hello',
    { v: 1, state: 'ready', capabilities: { persistent: true, writable: true, quotaBased: false }, watchable: true },
  ],
  ['watch request', { paths: ['/main.ts', '/dep.ts'], recursive: false, excludes: ['/.tau/cache/**'] }],
  ['watch event', { v: 1, k: 'sn', i: 'w0', d: { type: 'change', path: '/main.ts' } }],
  ['plain record', { a: 1 }],
];

describe('msgpackCodec', () => {
  it.each(rows)('round-trips %s byte-identically and unaliased', (_name, value) => {
    const frame = msgpackCodec.encode(value);
    const decoded = msgpackCodec.decode(frame);

    expect(decoded).toStrictEqual(value);

    const decodedBytes = collectBytes(decoded);
    const sourceBytes = collectBytes(value);
    expect(decodedBytes).toHaveLength(sourceBytes.length);
    for (const [index, decodedArray] of decodedBytes.entries()) {
      expect([...decodedArray]).toEqual([...sourceBytes[index]!]);
      expect(decodedArray.buffer).not.toBe(frame.buffer);
    }
  });

  /* The pincer: `ignoreUndefined: true` would drop `d` from the encoded map,
   * the wire schema requires the key, and the call would hang forever. */
  it('keeps the d key of a void response frame and decodes it as null', () => {
    const voidResponse = { v: 1, k: 'rs', i: 'c4', o: 1, d: undefined };

    const frame = msgpackCodec.encode(voidResponse);
    const decoded = msgpackCodec.decode(frame);

    expect(decoded).toStrictEqual({ v: 1, k: 'rs', i: 'c4', o: 1, d: null });
    expect(isWireMessage(decoded)).toBe(true);
    // The fixstr "d" (0xa1 0x64) followed by nil (0xc0) — proof the key was encoded.
    expect(indexOfSequence(frame, [0xa1, 0x64, 0xc0])).toBeGreaterThanOrEqual(0);
  });
});
