import type { Model as ApiModel } from '@taucad/chat/model-catalog';
import { recordApiRequestId } from '#lib/api-request-id.js';

/** One row of the public model catalog, `/v1/models`. */
export type Model = ApiModel;

/**
 * How long a fetched catalog counts as fresh. Milliseconds. The catalog is the same for every visitor and changes
 * only with an API deploy, so remounts and window focus reuse it instead of refetching, and the server caches it for
 * the same span.
 */
export const catalogFreshness = 30 * 60 * 1000;

/** The catalog's React Query key: the root loader hydrates the server's copy under it. */
export const modelsQueryKey = ['models'] as const;

/**
 * Read a `/v1/models` answer. An error status and a body that is not a list both reject, so a failed catalog is never
 * mistaken for an empty one. Shared by the browser query and the server prefetch.
 *
 * @param response - The `/v1/models` response.
 * @returns The catalog rows.
 */
export const readModelCatalog = async (response: Response): Promise<Model[]> => {
  if (!response.ok) {
    throw recordApiRequestId(new Error(`The model catalog answered ${response.status}.`), response);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new TypeError('The model catalog answered with something other than a list.');
  }
  // ponytail: the API's own Zod schema shapes the rows; the UI checks only the envelope.
  return data as Model[];
};
