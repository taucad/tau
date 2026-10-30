/**
 * The Worker's bindings, as tau-cloud's `cloudflare_workers_script` declares them (blueprint §6.1).
 *
 * The bucket is typed as the two reads the Worker makes and nothing else. An
 * R2 binding grants write too; holding it to `get` and `head` here means a
 * `put` or `delete` does not compile, and `no-bucket-writes.test.ts` refuses
 * one in the source and the bundle besides.
 */

/** A byte range an R2 read takes. */
export type FilesBucketRange = Readonly<{ offset: number; length: number }>;

/** What R2 reports about a stored object. `size` is the whole object's size, even for a ranged read. */
export type FilesStoredObject = Readonly<{ size: number }>;

/** An object with its body stream. */
export type FilesObjectBody = FilesStoredObject & Readonly<{ body: ReadableStream<Uint8Array<ArrayBuffer>> }>;

/** The read-only face of the `BUCKET` R2 binding. R2 answers a missing key with `null`, so these do too. */
/* oxlint-disable typescript/no-restricted-types -- `null` is the R2 binding's own absence value. */
export type FilesBucket = Readonly<{
  get: (key: string, options?: Readonly<{ range?: FilesBucketRange }>) => Promise<FilesObjectBody | null>;
  head: (key: string) => Promise<FilesStoredObject | null>;
}>;
/* oxlint-enable typescript/no-restricted-types -- end of the R2 binding's shape */

/** The Worker's bindings. Key generations are `FILES_LINK_KEY_G<n>` `secret_key` bindings, named by `FILES_LINK_KIDS`. */
export type FilesEnvironment = Readonly<{
  /** The private content bucket (`tau-<env>-content-private`). */
  BUCKET: FilesBucket;
  /** This Worker's host, e.g. `files.taucad.dev`; part of every signed message. */
  FILES_AUDIENCE: string;
  /** JSON array of exact origins CORS echoes. */
  FILES_ALLOWED_ORIGINS?: unknown;
  /** JSON object mapping each live key id to its `FILES_LINK_KEY_G<n>` binding name. */
  FILES_LINK_KIDS?: unknown;
}> &
  Readonly<Record<string, unknown>>;

const keyBindingPattern = /^FILES_LINK_KEY_G[1-9]\d{0,5}$/u;

const isCryptoKey = (value: unknown): value is CryptoKey =>
  typeof CryptoKey === 'function' && value instanceof CryptoKey;

/**
 * The live verify keys by key id.
 *
 * A kid maps only to a `FILES_LINK_KEY_G<n>` binding that holds a key, so a
 * mistyped map can neither name another binding nor make a missing key read
 * as present: either case leaves that kid unknown (`403 key`).
 *
 * @param environment - The bindings.
 * @returns The key for each live kid.
 */
export const verifyKeys = (environment: FilesEnvironment): ReadonlyMap<string, CryptoKey> => {
  let kids = environment.FILES_LINK_KIDS;
  if (typeof kids === 'string') {
    try {
      kids = JSON.parse(kids) as unknown;
    } catch {
      return new Map();
    }
  }
  if (typeof kids !== 'object' || kids === null || Array.isArray(kids)) {
    return new Map();
  }
  const keys = new Map<string, CryptoKey>();
  for (const [kid, binding] of Object.entries(kids)) {
    const key = typeof binding === 'string' && keyBindingPattern.test(binding) ? environment[binding] : undefined;
    if (isCryptoKey(key)) {
      keys.set(kid, key);
    }
  }
  return keys;
};
