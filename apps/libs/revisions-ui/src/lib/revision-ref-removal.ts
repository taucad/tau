/**
 * The Hosted Remote's audited ref removal (D24), for the one thing a person
 * removes from Tau Cloud: another device's conflict line (D14). A version is
 * never removed; a rename rewrites its tag at the same ref.
 *
 * The API origin is the app's, so it is injected
 * ({@link RevisionRefRemovalServices}) and read on every request.
 */

/**
 * A conflict line's full ref, the only ref the removal verb takes.
 *
 * @public
 */
export type ConflictLineRef = `refs/heads/conflicts/${string}`;

/**
 * What the remote answered a removal.
 *
 * @public
 */
export type RemovalAnswer = Readonly<{ kind: 'removed' }> | Readonly<{ kind: 'refused'; code: string | undefined }>;

/**
 * What only the app can give the ref removal.
 *
 * @public
 */
export type RevisionRefRemovalServices = Readonly<{
  /** The API origin, read on every request (it may throw when the origin is not configured); a trailing `/` is dropped. */
  apiBaseUrl: () => string;
}>;

/**
 * The ref removal bound to the app's API origin.
 *
 * @public
 */
export type RevisionRefRemoval = Readonly<{
  /**
   * Ask the Hosted Remote to remove a conflict line through its audited verb (D24).
   *
   * A line the remote never held is not a refusal: there is nothing there to remove.
   *
   * @param projectId - The project, which names its Tau Cloud repository.
   * @param ref - The conflict line's full ref, `refs/heads/conflicts/<line>`.
   * @returns What the remote answered.
   */
  requestRefRemoval: (projectId: string, ref: ConflictLineRef) => Promise<RemovalAnswer>;
}>;

/**
 * Bind the audited ref removal to the app's API origin.
 *
 * @param services - The API origin.
 * @returns The ref removal.
 * @public
 */
export const createRevisionRefRemoval = (services: RevisionRefRemovalServices): RevisionRefRemoval => ({
  async requestRefRemoval(projectId, ref) {
    const base = services.apiBaseUrl().replace(/\/$/u, '');
    const query = new URLSearchParams({ name: ref });
    try {
      const response = await fetch(`${base}/v1/git/${encodeURIComponent(projectId)}/refs?${query.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- an HTTP header name
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        return { kind: 'removed' };
      }
      const body = (await response.json().catch(() => ({}))) as { code?: unknown };
      const code = typeof body.code === 'string' ? body.code : undefined;
      if (response.status === 404 && code === 'GIT_REF_NOT_FOUND') {
        return { kind: 'removed' };
      }
      return { kind: 'refused', code };
    } catch {
      return { kind: 'refused', code: undefined };
    }
  },
});
