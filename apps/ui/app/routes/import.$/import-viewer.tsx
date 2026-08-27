import { useMemo } from 'react';
import { Box } from 'lucide-react';
import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import { CadPreviewViewer } from '#components/cad-preview.js';

type Files = Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>;

type ImportViewerProperties = {
  readonly files: Files;
  readonly mainFile: string | undefined;
  readonly owner: string;
  readonly repo: string;
};

export function ImportViewer({ files, mainFile, owner, repo }: ImportViewerProperties): React.JSX.Element {
  const projectId = `import-preview-${owner}-${repo}`;

  const projectFiles = useMemo(() => {
    if (!mainFile || files.size === 0) {
      return undefined;
    }

    const result: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
    for (const [path, file] of files) {
      result[path] = { content: file.content };
    }

    return result;
  }, [files, mainFile]);

  if (!mainFile || !projectFiles) {
    return (
      <div className='flex size-full items-center justify-center'>
        <div className='flex flex-col items-center gap-2 text-muted-foreground'>
          <Box className='size-12 opacity-30' strokeWidth={1} />
          <span className='text-sm'>Select a file to preview</span>
        </div>
      </div>
    );
  }

  return (
    <CadPreviewProvider key={`${projectId}-${mainFile}`} projectId={projectId} mainFile={mainFile} files={projectFiles}>
      <CadPreviewViewer className='size-full' graphicsOptions={{ enableLines: false, viewerClassName: 'bg-muted' }} />
    </CadPreviewProvider>
  );
}
