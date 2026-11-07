import { useEffect, useState } from 'react';
import { Box } from 'lucide-react';
import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import { CadPreviewViewer } from '#components/cad-preview.js';

/**
 * The bytes a preview renders, read on request: a disk import decodes them in
 * the file-manager worker up to a budget, so the page holds only what it shows.
 */
export type ImportPreviewLoader = (
  paths: readonly string[],
) => Promise<Record<string, { content: Uint8Array<ArrayBuffer> }>>;

type ImportViewerProperties = {
  readonly paths: readonly string[];
  readonly loadPreview: ImportPreviewLoader;
  readonly mainFile: string | undefined;
  readonly owner: string;
  readonly repo: string;
};

const emptyState = (message: string): React.JSX.Element => (
  <div className='flex size-full items-center justify-center'>
    <div className='flex flex-col items-center gap-2 text-muted-foreground'>
      <Box className='size-12 opacity-30' strokeWidth={1} />
      <span className='text-sm'>{message}</span>
    </div>
  </div>
);

export function ImportViewer({ paths, loadPreview, mainFile, owner, repo }: ImportViewerProperties): React.JSX.Element {
  const projectId = `import-preview-${owner}-${repo}`;
  const [loaded, setLoaded] = useState<
    { mainFile: string; files: Record<string, { content: Uint8Array<ArrayBuffer> }> } | undefined
  >(undefined);

  useEffect(() => {
    if (!mainFile) {
      return;
    }
    const current = new AbortController();
    /* The main file first, so the budget always reaches it. */
    const ordered = [mainFile, ...paths.filter((path) => path !== mainFile)];
    // async-iife: bootstrap -- the preview's bytes are read for the file chosen, and dropped when it changes.
    void (async (): Promise<void> => {
      try {
        const files = await loadPreview(ordered);
        if (!current.signal.aborted) {
          setLoaded({ mainFile, files });
        }
      } catch {
        if (!current.signal.aborted) {
          setLoaded({ mainFile, files: {} });
        }
      }
    })();
    return () => {
      current.abort();
    };
  }, [loadPreview, mainFile, paths]);

  if (!mainFile) {
    return emptyState('Select a file to preview');
  }
  if (loaded?.mainFile !== mainFile) {
    return emptyState('Loading preview');
  }
  if (!Object.hasOwn(loaded.files, mainFile)) {
    return emptyState('This file is too large to preview');
  }

  return (
    <CadPreviewProvider key={`${projectId}-${mainFile}`} projectId={projectId} mainFile={mainFile} files={loaded.files}>
      <CadPreviewViewer className='size-full' graphicsOptions={{ enableLines: false, viewerClassName: 'bg-muted' }} />
    </CadPreviewProvider>
  );
}
