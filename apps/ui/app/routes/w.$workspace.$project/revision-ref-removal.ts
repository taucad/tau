/**
 * The Hosted Remote's audited ref removal (D24), for the two things a person
 * removes from Tau Cloud: a version name, and another device's conflict line
 * (D14).
 */
import { requireClientEnvironmentUrl } from '#environment.config.js';

/** A publication the Hosted Remote says a name backs (D24). */
export type AffectedPublication = Readonly<{ id: string; title: string }>;

/** What the remote answered a removal. */
export type RemovalAnswer =
  | Readonly<{ kind: 'removed' }>
  | Readonly<{ kind: 'published'; publication: AffectedPublication }>
  | Readonly<{ kind: 'refused'; code: string | undefined }>;

/**
 * Ask the Hosted Remote to remove a ref through its audited verb (D24).
 *
 * A name a live publication points at answers `409 GIT_REF_PUBLISHED` with that
 * publication; the caller shows it and asks again with its id. A ref the remote
 * never held is not a refusal: there is nothing there to remove.
 *
 * @param projectId - The project, which names its Tau Cloud repository.
 * @param ref - The full ref: `refs/tags/<name>` or `refs/heads/conflicts/<line>`.
 * @param publicationId - The publication the person was shown, when the name backs one.
 * @returns What the remote answered.
 */
export const requestRefRemoval = async (
  projectId: string,
  ref: string,
  publicationId?: string,
): Promise<RemovalAnswer> => {
  const base = requireClientEnvironmentUrl('TAU_API_URL');
  const query = new URLSearchParams({ name: ref });
  if (publicationId !== undefined) {
    query.set('publication', publicationId);
  }
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
    const body = (await response.json().catch(() => ({}))) as {
      code?: unknown;
      publication?: { id?: unknown; title?: unknown };
    };
    const code = typeof body.code === 'string' ? body.code : undefined;
    if (response.status === 404 && code === 'GIT_REF_NOT_FOUND') {
      return { kind: 'removed' };
    }
    const { publication } = body;
    if (code === 'GIT_REF_PUBLISHED' && typeof publication?.id === 'string') {
      return {
        kind: 'published',
        publication: {
          id: publication.id,
          title: typeof publication.title === 'string' ? publication.title : 'A publication',
        },
      };
    }
    return { kind: 'refused', code };
  } catch {
    return { kind: 'refused', code: undefined };
  }
};
