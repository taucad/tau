/**
 * Resolved viewer identity for publication view deduplication and rate limiting.
 */
export type ResolvedViewerIdentity = {
  viewerHash: string;
  /** Present when the request is authenticated (Better Auth session). */
  sessionUserId?: string;
};
