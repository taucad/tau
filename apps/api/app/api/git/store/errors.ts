/**
 * Every refusal the repository store raises above the codec, carrying the code
 * the caller switches on. One class rather than one per case: W4 turns `lost`
 * into HTTP 503 and `ceiling-exceeded` into the existing quota refusal, and a
 * `catch` that has to name eight classes is how a ninth gets missed.
 */
export type RepositoryStoreErrorCode =
  /** Another writer committed first, or the manifest vanished under the lease. W4 answers 503 (D4). */
  | 'lost'
  /** The commit deadline passed before the manifest write was attempted (NI5). */
  | 'deadline'
  /** The repository is tombstoned: it refuses hydration and every commit (NI12). */
  | 'tombstoned'
  /** The push landed as loose objects, so committing it would record refs whose objects are nowhere (AR-A E1). */
  | 'loose-objects'
  /** The manifest names a pack the store does not hold. */
  | 'missing-pack'
  /** `fsck --connectivity-only` refused the refs and packs about to be named. */
  | 'connectivity'
  /** The committed repository would pass the per-repository byte ceiling (D20). */
  | 'ceiling-exceeded'
  /**
   * The repository was purged and re-registered while this lease was open
   * (AR-A E7). Not a retryable race: the lease's repository no longer exists.
   * `ManifestError` raises it inside the codec; the commit protocol translates
   * it here so a caller catches one class.
   */
  | 'incarnation-changed';

export class RepositoryStoreError extends Error {
  public constructor(
    public readonly code: RepositoryStoreErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'RepositoryStoreError';
  }
}
