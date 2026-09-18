/**
 * Charter D32. Two suites in this repository write objects and then delete a
 * whole prefix: the `ObjectStorageService` suite and the repository-store
 * conformance suite. Both take their endpoint from the environment, so nothing
 * in the code itself stops a developer or a CI job pointing them at a bucket
 * holding real tenant bytes.
 *
 * The guard is therefore an allowlist, not a denylist: a bucket is refused
 * unless it is positively known to be disposable. A denylist would have to
 * enumerate every bucket that must not be destroyed, and the one it forgets is
 * the one that gets destroyed.
 */

/**
 * Local MinIO buckets created by `infra/docker-compose.yml`'s bootstrap and
 * named by `apps/api/.env.example`. They hold only development fixtures.
 *
 * `tau-content-restore` is the second local bucket W6's restore suite reads a
 * repository back from (`TAU_S3_RESTORE_*`); it is a development bucket like the
 * other two, so the suite may clean it by prefix rather than key by key.
 */
const localDevelopmentBuckets: ReadonlySet<string> = new Set([
  'tau-content',
  'tau-content-private',
  'tau-content-restore',
]);

/**
 * The dedicated R2 scratch buckets D32 confines the conformance and burst
 * suites to. Provisioned through `repos/tau-cloud`; deliberately distinct from
 * `tau-staging-content` and `tau-staging-content-private`, which hold real
 * staging bytes and must never be prefix-deleted.
 */
const scratchBucketPattern = /^tau-staging-conformance(?:-[\da-z]+(?:-[\da-z]+)*)?$/u;

/**
 * True when `bucket` is a bucket a destructive test may write to and
 * prefix-delete. Comparison is case-insensitive and ignores surrounding
 * whitespace, because an environment variable is typed by a human.
 */
export const isDestructiveTestBucketAllowed = (bucket: string): boolean => {
  const normalized = bucket.trim().toLowerCase();

  return localDevelopmentBuckets.has(normalized) || scratchBucketPattern.test(normalized);
};

/**
 * Refuses a destructive suite aimed at any bucket outside the allowlist.
 * `context` names the caller so a misconfigured run says which suite stopped
 * and why. Call this before the first request, so no credential is used
 * against the wrong endpoint.
 */
export const assertDestructiveTestBucketAllowed = (bucket: string, context: string): void => {
  if (!isDestructiveTestBucketAllowed(bucket)) {
    throw new Error(
      `Refusing to run ${context} against bucket '${bucket}': charter D32 confines destructive suites to a local MinIO bucket or a dedicated scratch bucket, because they write and prefix-delete.`,
    );
  }
};
