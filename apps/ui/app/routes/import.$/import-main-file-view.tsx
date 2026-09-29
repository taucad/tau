import { PageContent } from '#components/layout/page-content.js';
import { PageHeader } from '#components/layout/page-header.js';
import { useId, useMemo } from 'react';
import { Button } from '@taucad/ui/components/button';
import { FileSelector, createStaticDataSource } from '#components/files/file-selector.js';
import { ImportViewer } from '#routes/import.$/import-viewer.js';
import { formatFileSize } from '#components/geometry/converter/converter-utils.js';
import { supportedKernelExtensions } from '#routes/import.$/import.utils.js';
import type { FileMap } from '#utils/file-reader.utils.js';

type ImportMainFileViewProperties = {
  readonly title: string;
  readonly subtitle: string;
  readonly requestedMainFileWarning?: string;
  readonly files: FileMap;
  readonly selectedMainFile: string | undefined;
  readonly owner?: string;
  readonly repo?: string;
  readonly onSelectMainFile: (file: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

/**
 * Shared main file selection view used by both GitHub and disk imports.
 */
export function ImportMainFileView({
  title,
  subtitle,
  requestedMainFileWarning,
  files,
  selectedMainFile,
  owner = '',
  repo = '',
  onSelectMainFile,
  onConfirm,
  onCancel,
}: ImportMainFileViewProperties): React.JSX.Element {
  const mainFileLabelId = useId();
  const fileNames = [...files.keys()];
  const cadSourceCount = fileNames.filter((path) =>
    supportedKernelExtensions.some((extension) => path.toLowerCase().endsWith(extension)),
  ).length;
  let byteLength = 0;
  for (const file of files.values()) {
    byteLength += file.content.byteLength;
  }
  const dataSource = useMemo(() => createStaticDataSource([...files.keys()].map((path) => ({ path }))), [files]);

  return (
    <PageContent className='space-y-6'>
      <PageHeader title='Import' />
      <div className='space-y-4 border-t pt-6'>
        <div className='flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1'>
          <div className='space-y-1'>
            <h2 className='text-base font-medium'>{title}</h2>
            <p className='font-mono text-sm break-all text-muted-foreground'>{subtitle}</p>
          </div>
          <p className='text-xs text-muted-foreground tabular-nums'>
            {files.size} {files.size === 1 ? 'file' : 'files'} · {cadSourceCount}{' '}
            {cadSourceCount === 1 ? 'CAD source' : 'CAD sources'} · {formatFileSize(byteLength)}
          </p>
          {requestedMainFileWarning ? (
            <p role='alert' className='pt-2 text-sm'>
              {requestedMainFileWarning}
            </p>
          ) : undefined}
        </div>
        <div className='grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem]'>
          {/* Left: CAD Preview */}
          <div className='h-[60vh] min-h-0 min-w-0 overflow-hidden rounded-lg border bg-muted'>
            <ImportViewer files={files} mainFile={selectedMainFile} owner={owner} repo={repo} />
          </div>

          {/* Right: Main file Selection */}
          <div className='flex min-w-0 flex-col gap-4'>
            <div role='group' aria-labelledby={mainFileLabelId} className='space-y-2'>
              <span id={mainFileLabelId} className='block text-sm font-medium'>
                Main file
              </span>
              <FileSelector
                dataSource={dataSource}
                selectedFile={selectedMainFile}
                placeholder='Select main file…'
                title='Select main file'
                description='Choose the main entry path for your project'
                emptyMessage='No files found'
                onSelect={onSelectMainFile}
              />
              {selectedMainFile ? (
                <p className='font-mono text-xs break-all text-muted-foreground'>{selectedMainFile}</p>
              ) : undefined}
            </div>

            <Button className='w-full' disabled={!selectedMainFile} onClick={onConfirm}>
              Import project
            </Button>

            <Button variant='outline' className='w-full' onClick={onCancel}>
              Cancel
            </Button>
            <p className='text-xs text-muted-foreground'>A copy is added to your projects.</p>
          </div>
        </div>
      </div>
    </PageContent>
  );
}
