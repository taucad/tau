import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ENV } from '#environment.config.js';
import { useRevisionSessionUser } from '#lib/revision-actor.js';

const previewMaximumBytes = 256 * 1024;
const previewRequests: Array<() => void> = [];
let activePreviewRequests = 0;

/** One small image request per visible project, at most four in flight across the library. */
export const fetchCloudProjectPreview = async (projectId: string, signal: AbortSignal): Promise<Blob | undefined> => {
  if (activePreviewRequests >= 4) {
    await new Promise<void>((resolve) => {
      previewRequests.push(resolve);
    });
  } else {
    activePreviewRequests += 1;
  }
  try {
    signal.throwIfAborted();
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
    const response = await fetch(
      `${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/projects/${encodeURIComponent(projectId)}/preview`,
      { credentials: 'include', cache: 'no-store', signal: requestSignal },
    );
    if (!response.ok) {
      throw new Error(`Saved preview unavailable (${String(response.status)})`);
    }
    if (response.status === 204) {
      return undefined;
    }
    if (!response.headers.get('content-type')?.startsWith('image/webp')) {
      throw new Error('Unexpected saved preview response');
    }
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Missing saved preview body');
    }
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    let size = 0;
    try {
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- bounded streaming reads must be consumed in order.
        const part = await reader.read();
        if (part.done) {
          break;
        }
        size += part.value.length;
        if (size > previewMaximumBytes) {
          // oxlint-disable-next-line no-await-in-loop -- stop reading as soon as the byte bound is exceeded.
          await reader.cancel();
          throw new Error('Saved preview is too large');
        }
        chunks.push(new Uint8Array(part.value));
      }
    } finally {
      reader.releaseLock();
    }
    return new Blob(chunks, { type: 'image/webp' });
  } finally {
    const next = previewRequests.shift();
    if (next) {
      next();
    } else {
      activePreviewRequests -= 1;
    }
  }
};

export const useCloudProjectPreview = (
  projectId: string,
  isVisible: boolean,
): {
  url: string | undefined;
  isLoading: boolean;
  isFailed: boolean;
  retry: () => Promise<unknown>;
} => {
  const userId = useRevisionSessionUser()?.id;
  const query = useQuery({
    queryKey: ['cloud-project-preview', userId ?? null, projectId],
    queryFn: async ({ signal }) => (await fetchCloudProjectPreview(projectId, signal)) ?? null,
    enabled: isVisible && userId !== undefined,
    // Recheck access whenever a card remounts/focus returns; no cross-account placeholder data.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const [source, setSource] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!query.data) {
      return;
    }
    const url = URL.createObjectURL(query.data);
    // oxlint-disable-next-line react/set-state-in-effect -- Blob URLs are external leases allocated after commit and revoked by this same effect.
    setSource({ blob: query.data, url });
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [query.data]);
  return {
    url: !query.isError && query.data && source?.blob === query.data ? source.url : undefined,
    isLoading: query.isFetching && !query.data,
    isFailed: query.isError,
    retry: query.refetch,
  };
};
