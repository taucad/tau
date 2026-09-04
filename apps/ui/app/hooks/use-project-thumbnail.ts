import { useEffect, useState } from 'react';
import { useFileManager } from '#hooks/use-file-manager.js';

/** Resolve the canonical local project thumbnail through the File Manager. */
export function useProjectThumbnail(projectId: string | undefined): string | undefined {
  const { client, workerChangeChannel } = useFileManager();
  const [thumbnail, setThumbnail] = useState<{ projectId: string; url: string }>();

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const path = `/projects/${projectId}/thumbnail.webp`;
    let currentUrl: string | undefined;
    let cancelled = false;

    const resolve = async (): Promise<void> => {
      try {
        const bytes = await client.readFile(path);
        if (cancelled) {
          return;
        }
        const next = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }
        currentUrl = next;
        setThumbnail({ projectId, url: next });
      } catch {
        if (!cancelled) {
          setThumbnail(undefined);
        }
      }
    };

    void resolve();
    const interestedIn = (changedPath: string): boolean => changedPath === path || changedPath === 'thumbnail.webp';
    const unsubscribeWritten = workerChangeChannel?.onFileWritten({ interestedIn, handler: resolve });
    const unsubscribeDeleted = workerChangeChannel?.onFileDeleted({
      interestedIn,
      handler: () => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
          currentUrl = undefined;
        }
        setThumbnail(undefined);
      },
    });

    return () => {
      cancelled = true;
      unsubscribeWritten?.();
      unsubscribeDeleted?.();
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [client, projectId, workerChangeChannel]);

  return thumbnail !== undefined && thumbnail.projectId === projectId ? thumbnail.url : undefined;
}
