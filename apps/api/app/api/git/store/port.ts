import type { Readable } from 'node:stream';

/**
 * The durable state of one project's repository, addressed without naming a
 * provider. Charter I5/NI14: no code above the adapter names a provider, so
 * every type here is bytes, a key relative to the repository, an opaque token
 * or an opaque id. In particular nothing in this file mentions a bucket, an
 * endpoint, a region, path style or a credential — that vocabulary belongs to
 * `S3RepositoryStore` and the storage driver.
 *
 * The manifest is opaque at this layer. Its codec — format, incarnation,
 * generation, ref map, live and retired packs — belongs to the repository
 * store core (W2); the port only guarantees that the bytes it returns are the
 * bytes that were committed, and that the token identifies that commit.
 *
 * Two things this port deliberately does not offer:
 *
 * - **No `headObject`.** To learn whether a pack exists and how large it is,
 *   list its prefix. One primitive, one round trip, and the answer a committer
 *   needs is "which keys are there", not "is this one key there".
 * - **No whole-object integrity check on the multipart path.** `putObject`
 *   passes `sha256` straight through for a single-part write, where the
 *   backend verifies it, but an object above the single-part ceiling is
 *   uploaded as parts, each verified by its own part checksum. Nothing
 *   re-checks the assembled object against the whole-object digest. For packs
 *   this is acceptable because git's own `index-pack`/`fsck` verify pack bytes
 *   on the way out.
 */

/**
 * Names one repository. `ownerId` is in every authoritative key (charter
 * D24/I5), so purging a tenant is one prefix and moving a tenant to other
 * storage is one locator change.
 *
 * `accountId` is opaque here and absent for every repository at launch,
 * meaning the Tau default account (charter D26). The adapter resolves it to a
 * provider, endpoint, bucket and credentials; nothing above the adapter knows
 * what those are. `project.storage_account_id` supplies it in W3.
 */
export type RepositoryLocator = {
  readonly ownerId: string;
  readonly projectId: string;
  readonly accountId?: string;
};

/**
 * Opaque handle on the manifest version a reader saw. The S3 adapter carries
 * the ETag inside it; another backend may carry a version, a generation or a
 * transaction id. Nothing outside the adapter inspects or compares tokens.
 */
export type CommitToken = { readonly token: string };

/** Manifest bytes as the codec above this port serialized them. */
export type ManifestBytes = Uint8Array<ArrayBuffer>;

/** What the commit protocol consults instead of assuming a backend's abilities. */
export type StoreCapabilities = {
  /** `If-Match` / `If-None-Match` on a single-part PUT. */
  readonly conditionalWrite: boolean;
  /** False on an immutable backend, whose deletion path would be key destruction instead. */
  readonly delete: boolean;
  /** Prefix listing with size and modification time. */
  readonly list: boolean;
  /** Single-part ceiling; an object above it is uploaded multipart or refused. */
  readonly maxObjectBytes: number;
};

/** One object under a repository prefix. `key` is relative to that prefix. */
export type StoredObject = { readonly key: string; readonly bytes: number; readonly modifiedAt: Date | undefined };

/**
 * Integrity and length a writer already knows. `contentLength` is not a hint:
 * the adapter refuses a call whose declared length disagrees with the body, so
 * a caller that computed its digest over different bytes than it is uploading
 * fails here rather than storing a mislabelled object.
 */
export type PutObjectOptions = {
  readonly contentLength: number;
  /** Base64 SHA-256 of the body, matching the driver's multipart checksum encoding. */
  readonly sha256: string;
};

/*
 * Spelled as a `type` rather than the north star's `interface`: the lint policy's
 * `consistent-type-definitions` rule owns that choice. The members are the
 * north star's, unchanged.
 */
export type RepositoryStore = {
  readonly capabilities: StoreCapabilities;

  /** Reads the current manifest and the token that commits against it. `undefined` means generation 0. */
  readManifest(locator: RepositoryLocator): Promise<{ manifest: ManifestBytes; token: CommitToken } | undefined>;

  /**
   * Replaces the manifest conditionally. `expected` is the token read at
   * hydration, or `'absent'` to create the first generation. Returns the new
   * token, or `'lost'` when another writer committed first — including the
   * `404` an `If-Match` against a deleted manifest produces (AR-A E7), which
   * is a lost race and never a create.
   */
  commitManifest(
    locator: RepositoryLocator,
    next: ManifestBytes,
    expected: CommitToken | 'absent',
  ): Promise<CommitToken | 'lost'>;

  /** Writes an immutable object. `key` is unique per upload, so this never overwrites (charter I3). */
  putObject(
    locator: RepositoryLocator,
    key: string,
    body: Uint8Array<ArrayBuffer>,
    options: PutObjectOptions,
  ): Promise<void>;

  /** Reads an object, optionally a byte range with inclusive bounds. */
  getObject(locator: RepositoryLocator, key: string, range?: { start: number; end: number }): Promise<Readable>;

  /** Yields every object under a repository-relative prefix, paginating internally. */
  listObjects(locator: RepositoryLocator, prefix: string): AsyncIterable<StoredObject>;

  /** Deletes repository-relative keys. A key that was never written is not an error. */
  deleteObjects(locator: RepositoryLocator, keys: readonly string[]): Promise<void>;

  /*
   * There is deliberately no prefix delete on this port. Charter D31 gives
   * prefix deletion exactly one caller — the tombstoned purge job — so it stays
   * on the driver under a name that makes misuse obvious, out of reach of
   * everything written against `RepositoryStore`.
   */
};
