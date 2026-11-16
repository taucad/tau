/**
 * The Hosted Remote's audited ref removal (D24), for the one thing a person
 * removes from Tau Cloud: another device's conflict line (D14). A version is
 * never removed; a rename rewrites its tag at the same ref.
 */
import { requireClientEnvironmentUrl } from '#environment.config.js';

/** A conflict line's full ref, the only ref the removal verb takes. */
export type ConflictLineRef = `refs/heads/conflicts/${string}`;

/** What the remote answered a removal. */
export type RemovalAnswer = Readonly<{ kind: 'removed' }> | Readonly<{ kind: 'refused'; code: string | undefined }>;

/**
 * Ask the Hosted Remote to remove a conflict line through its audited verb (D24).
 *
 * A line the remote never held is not a refusal: there is nothing there to remove.
 *
 * @param projectId - The project, which names its Tau Cloud repository.
 * @param ref - The conflict line's full ref, `refs/heads/conflicts/<line>`.
 * @returns What the remote answered.
 */
export const requestRefRemoval = async (projectId: string, ref: ConflictLineRef): Promise<RemovalAnswer> => {
  const base = requireClientEnvironmentUrl('TAU_API_URL');
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
};
