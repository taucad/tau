import { uint8ArrayToBase64 } from 'uint8array-extras';
import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ENV } from '#environment.config.js';
import { useRevisionSessionUser } from '#lib/revision-actor.js';
import { useProjectThumbnail } from '#hooks/use-project-thumbnail.js';

/** Reuse the existing saved capture; browsing cloud cards never starts a kernel. */
export const publishCloudProjectPreview = async (input: {
  projectId: string;
  source: string | Uint8Array<ArrayBuffer>;
  signal: AbortSignal;
  createOnly?: boolean;
}): Promise<void> => {
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(10_000)]);
  let blob: Blob;
  if (typeof input.source === 'string') {
    const local = await fetch(input.source, { signal });
    blob = await local.blob();
  } else {
    blob = new Blob([input.source], { type: 'image/webp' });
  }
  const bitmap = await createImageBitmap(blob);
  let image: Blob;
  try {
    const scale = Math.min(1, 768 / bitmap.width, 576 / bitmap.height);
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Preview image conversion is unavailable');
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    image = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
    if (image.type !== 'image/webp' || image.size > 256 * 1024) {
      throw new Error('Preview image exceeds its transfer limit');
    }
  } finally {
    bitmap.close();
  }
  signal.throwIfAborted();
  const bytes = new Uint8Array(await image.arrayBuffer());
  const response = await fetch(
    `${ENV.TAU_API_URL.replace(/\/$/u, '')}/v1/projects/${encodeURIComponent(input.projectId)}/preview`,
    {
      method: 'PUT',
      credentials: 'include',
      signal,
      headers: { 'Content-Type': 'application/json', ...(input.createOnly ? { 'If-None-Match': '*' } : {}) },
      body: JSON.stringify({ image: uint8ArrayToBase64(bytes) }),
    },
  );
  if (input.createOnly && response.status === 412) {
    return;
  }
  if (!response.ok) {
    throw new Error(`Saved preview upload failed (${String(response.status)})`);
  }
};

/** Mount inside the project file-manager scope; connection and write access are supplied by the existing session owner. */
export const usePublishCloudProjectPreview = ({
  projectId,
  enabled,
  captureEnabled = enabled,
  backfill = true,
}: {
  projectId: string;
  /** Connected writable authored sync has settled, so publication may begin. */
  enabled: boolean;
  /** Authored data was applied; remember fresh local captures while a subsequent push settles. */
  captureEnabled?: boolean;
  /** The resident session backfills; a focused capture-only consumer disables duplicate backfill. */
  backfill?: boolean;
}): ((bytes: Uint8Array<ArrayBuffer>) => void) => {
  const thumbnail = useProjectThumbnail(projectId);
  const userId = useRevisionSessionUser()?.id;
  const queryClient = useQueryClient();
  const capture = useRef<AbortController | undefined>(undefined);
  const pendingCapture = useRef<Uint8Array<ArrayBuffer> | undefined>(undefined);
  const previousScope = useRef({ projectId, userId, captureEnabled, enabled });
  useEffect(() => {
    const previous = previousScope.current;
    const identityChanged = previous.projectId !== projectId || previous.userId !== userId;
    if (identityChanged || previous.captureEnabled !== captureEnabled) {
      pendingCapture.current = undefined;
    }
    if (identityChanged || previous.captureEnabled !== captureEnabled || previous.enabled !== enabled) {
      capture.current?.abort();
    }
    previousScope.current = { projectId, userId, captureEnabled, enabled };
  }, [captureEnabled, enabled, projectId, userId]);
  useEffect(
    () => () => {
      pendingCapture.current = undefined;
      capture.current?.abort();
    },
    [],
  );
  const { mutate } = useMutation({
    mutationFn: publishCloudProjectPreview,
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ['cloud-project-preview', userId ?? null, projectId] }),
    onError: (error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Could not save project preview:', error);
      }
    },
  });
  useEffect(() => {
    if (!backfill || !enabled || !userId || thumbnail.status !== 'ready' || !thumbnail.url) {
      return;
    }
    const controller = new AbortController();
    mutate({ projectId, source: thumbnail.url, signal: controller.signal, createOnly: true });
    return () => {
      controller.abort();
    };
  }, [backfill, enabled, mutate, projectId, thumbnail.status, thumbnail.url, userId]);
  const uploadCapture = useCallback(
    (bytes: Uint8Array<ArrayBuffer>) => {
      capture.current?.abort();
      const controller = new AbortController();
      capture.current = controller;
      mutate({ projectId, source: bytes, signal: controller.signal });
    },
    [mutate, projectId],
  );
  useEffect(() => {
    if (enabled && captureEnabled && userId && pendingCapture.current) {
      const bytes = pendingCapture.current;
      pendingCapture.current = undefined;
      uploadCapture(bytes);
    }
  }, [captureEnabled, enabled, uploadCapture, userId]);
  return useCallback(
    (bytes: Uint8Array<ArrayBuffer>) => {
      if (!captureEnabled || !userId) {
        return;
      }
      if (enabled) {
        uploadCapture(bytes);
      } else {
        pendingCapture.current = bytes;
      }
    },
    [captureEnabled, enabled, uploadCapture, userId],
  );
};
