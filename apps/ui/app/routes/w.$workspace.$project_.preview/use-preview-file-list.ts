import { useState, useEffect } from 'react';
import { useFileManager } from '#hooks/use-file-manager.js';

type PreviewFileEntry = {
  path: string;
  name: string;
  size: number;
};

/**
 * Hook to read the file list from the file manager for the preview route.
 * Uses `getCachedFileItems` (centralized cache) with `subscribeTree` for invalidation.
 */
export function usePreviewFileList(): PreviewFileEntry[] {
  const { treeService } = useFileManager();
  const [files, setFiles] = useState<PreviewFileEntry[]>([]);

  useEffect(() => {
    if (!treeService) {
      return;
    }

    const sync = (): void => {
      const items = treeService.getCachedFileItems();
      setFiles(
        items.map((item) => ({
          path: item.path,
          name: item.path.split('/').pop() ?? item.path,
          size: item.size,
        })),
      );
    };

    sync();
    const unsubscribe = treeService.subscribeTree(sync);

    return unsubscribe;
  }, [treeService]);

  return files;
}
