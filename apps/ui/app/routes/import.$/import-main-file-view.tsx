import { useMemo } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { FileSelector, createStaticDataSource } from '#components/files/file-selector.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { ImportViewer } from '#routes/import.$/import-viewer.js';
import type { FileMap } from '#utils/file-reader.utils.js';

type ImportMainFileViewProperties = {
  readonly title: string;
  readonly subtitle: string;
  readonly requestedMainFileWarning?: string;
  readonly files: FileMap;
  readonly selectedMainFile: string | undefined;
  readonly variant: 'github' | 'disk';
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
  variant,
  owner = '',
  repo = '',
  onSelectMainFile,
  onConfirm,
  onCancel,
}: ImportMainFileViewProperties): React.JSX.Element {
  const fileNames = [...files.keys()];
  const dataSource = useMemo(() => createStaticDataSource(fileNames.map((path) => ({ path }))), [fileNames]);

  return (
    <div className='flex min-h-full flex-col items-center justify-start px-4 pt-6 pb-16 md:justify-center md:pt-8'>
      <div className='w-full max-w-5xl space-y-6'>
        <div className='flex flex-col items-center gap-4'>
          <div className='flex size-16 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10'>
            {variant === 'github' ? (
              <SvgIcon id='github' className='size-8 text-primary' />
            ) : (
              <Upload className='size-8 text-primary' />
            )}
          </div>

          <div className='text-center'>
            <h1 className='text-2xl font-semibold'>{title}</h1>
            <p className='text-sm text-muted-foreground'>{subtitle}</p>
            {requestedMainFileWarning ? (
              <p className='mt-2 text-sm text-warning'>{requestedMainFileWarning}</p>
            ) : undefined}
          </div>
        </div>

        <div className='flex flex-col gap-6 md:flex-row'>
          {/* Left: CAD Preview */}
          <div className='h-[60vh] flex-1 overflow-hidden rounded-lg border bg-sidebar'>
            <ImportViewer files={files} mainFile={selectedMainFile} owner={owner} repo={repo} />
          </div>

          {/* Right: Main File Selection */}
          <div className='flex w-full flex-col justify-start gap-4 md:w-64'>
            <div className='space-y-3'>
              <h2 className='text-sm font-medium'>Main File</h2>
              <FileSelector
                dataSource={dataSource}
                selectedFile={selectedMainFile}
                placeholder='Select main file...'
                title='Select Main File'
                description='Choose the main entry path for your project'
                emptyMessage='No files found'
                onSelect={onSelectMainFile}
              />
            </div>

            {selectedMainFile ? (
              <div className='rounded-md bg-muted/50 p-3 text-xs'>
                <div className='font-medium'>Selected:</div>
                <div className='mt-1 break-all text-muted-foreground'>{selectedMainFile}</div>
              </div>
            ) : undefined}

            <Button className='w-full' disabled={!selectedMainFile} onClick={onConfirm}>
              Import Project
            </Button>

            <Button variant='outline' className='w-full' onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
