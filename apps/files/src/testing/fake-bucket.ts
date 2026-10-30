/**
 * A minimal in-memory stand-in for the `BUCKET` R2 binding: the two reads the
 * Worker makes, with R2's semantics for `size` (the whole object's size, also
 * on a ranged read) and a body that is a web stream.
 */

/* oxlint-disable typescript/no-restricted-types -- `null` is the R2 binding's own absence value. */

import type { FilesBucket, FilesBucketRange, FilesObjectBody, FilesStoredObject } from '#environment.js';

/** The fake, with the objects it holds and every call it received. */
export type FakeBucket = FilesBucket &
  Readonly<{
    objects: Map<string, Uint8Array<ArrayBuffer>>;
    calls: Array<Readonly<{ method: 'get' | 'head'; key: string; range?: FilesBucketRange }>>;
    /** Make every call reject, as a binding outage does. */
    fail: (failing: boolean) => void;
  }>;

/**
 * Create an empty fake bucket.
 *
 * @returns The fake.
 */
export const createFakeBucket = (): FakeBucket => {
  const objects = new Map<string, Uint8Array<ArrayBuffer>>();
  const calls: Array<Readonly<{ method: 'get' | 'head'; key: string; range?: FilesBucketRange }>> = [];
  let failing = false;
  const head = async (key: string): Promise<FilesStoredObject | null> => {
    calls.push({ method: 'head', key });
    if (failing) {
      throw new Error('R2 unavailable');
    }
    const bytes = objects.get(key);
    return bytes === undefined ? null : { size: bytes.byteLength };
  };
  const get = async (
    key: string,
    options?: Readonly<{ range?: FilesBucketRange }>,
  ): Promise<FilesObjectBody | null> => {
    calls.push({ method: 'get', key, ...(options?.range === undefined ? {} : { range: options.range }) });
    if (failing) {
      throw new Error('R2 unavailable');
    }
    const bytes = objects.get(key);
    if (bytes === undefined) {
      return null;
    }
    const range = options?.range;
    const slice = range === undefined ? bytes : bytes.slice(range.offset, range.offset + range.length);
    return {
      size: bytes.byteLength,
      body: new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          controller.enqueue(slice);
          controller.close();
        },
      }),
    };
  };
  return {
    objects,
    calls,
    head,
    get,
    fail: (value) => {
      failing = value;
    },
  };
};
