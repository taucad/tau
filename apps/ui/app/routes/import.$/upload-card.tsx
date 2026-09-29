import { useCallback, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Folder, Files, FolderOpen } from 'lucide-react';
import { importFileAcceptString, supportedKernelExtensions } from '#routes/import.$/import.utils.js';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { isZipFile } from '#utils/file-reader.utils.js';
import { webAccessDirectoryPicker } from '#constants/browser.constants.js';

type UploadCardProperties = {
  readonly onFilesSelected: (files: FileList | File[]) => void;
  readonly onFolderSelected: (files: FileList) => void;
  readonly onZipSelected: (file: File) => void;
  readonly onDataTransfer: (items: DataTransferItemList) => void;
  /** Called when the user selects a directory via File System Access API. */
  readonly onDirectoryHandleSelected?: (handle: FileSystemDirectoryHandle) => void;
  readonly isDisabled?: boolean;
  readonly className?: string;
};

export function UploadCard({
  onFilesSelected,
  onFolderSelected,
  onZipSelected,
  onDataTransfer,
  onDirectoryHandleSelected,
  isDisabled = false,
  className,
}: UploadCardProperties): React.JSX.Element {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleDrop = useCallback(
    (acceptedFiles: File[], _fileRejections: unknown, event: unknown) => {
      setIsDraggingOver(false);

      // Check if it's a drag event with data transfer items (for folder support)
      const dropEvent = event as React.DragEvent;
      if (dropEvent.dataTransfer.items.length > 0) {
        // Check if any item is a directory
        const hasDirectory = [...dropEvent.dataTransfer.items].some((item) => {
          const entry = item.webkitGetAsEntry();

          return entry?.isDirectory;
        });

        if (hasDirectory) {
          // Use DataTransfer API for folder handling
          onDataTransfer(dropEvent.dataTransfer.items);

          return;
        }
      }

      // Handle regular file drops
      if (acceptedFiles.length === 1 && isZipFile(acceptedFiles[0]!)) {
        onZipSelected(acceptedFiles[0]!);
      } else {
        onFilesSelected(acceptedFiles);
      }
    },
    [onFilesSelected, onZipSelected, onDataTransfer],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    disabled: isDisabled,
    noClick: true, // We handle clicks separately for folder/file buttons
    noKeyboard: true,
    onDragEnter() {
      setIsDraggingOver(true);
    },
    onDragLeave() {
      setIsDraggingOver(false);
    },
  });

  const handleFolderClick = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDirectoryPick = useCallback(async () => {
    if (!onDirectoryHandleSelected) {
      return;
    }

    try {
      const handle = await webAccessDirectoryPicker()?.pick({ mode: 'read' });
      if (handle !== undefined) {
        onDirectoryHandleSelected(handle);
      }
    } catch (error) {
      // User cancelled the directory picker
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      throw error;
    }
  }, [onDirectoryHandleSelected]);

  const handleFolderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        onFolderSelected(event.target.files);
      }

      // Reset input so the same folder can be selected again
      event.target.value = '';
    },
    [onFolderSelected],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const { files } = event.target;

      // Check if single ZIP file
      if (files.length === 1 && isZipFile(files[0]!)) {
        onZipSelected(files[0]!);
      } else {
        onFilesSelected(files);
      }

      // Reset input so the same files can be selected again
      event.target.value = '';
    },
    [onFilesSelected, onZipSelected],
  );

  const isDropping = isDragActive || isDraggingOver;

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex min-w-0 flex-col gap-5 md:border-l md:pl-8',
        isDisabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <input {...getInputProps()} hidden aria-label='Drop project files' />

      {/* Hidden file inputs */}
      <input
        aria-label='Select project folder'
        ref={folderInputRef}
        multiple
        type='file'
        disabled={isDisabled}
        className='hidden'
        // @ts-expect-error -- webkitdirectory is not in the standard types
        webkitdirectory='true'
        onChange={handleFolderChange}
      />
      <input
        aria-label='Select project files'
        ref={fileInputRef}
        multiple
        type='file'
        className='hidden'
        accept={importFileAcceptString}
        disabled={isDisabled}
        onChange={handleFileChange}
      />

      <div className='space-y-1'>
        <h2 className='text-base font-medium'>Local files</h2>
        <p className='text-sm text-muted-foreground'>Open a folder, source files or a ZIP archive.</p>
      </div>
      <div
        className={cn(
          'flex min-h-40 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-5 py-6 text-center',
          isDropping && 'border-foreground bg-muted',
        )}
      >
        <span className='mb-2 rounded-xl border bg-card p-2'>
          <FolderOpen aria-hidden className='size-5 text-muted-foreground' />
        </span>
        <span className='text-sm font-medium'>
          {isDropping ? 'Release to import' : 'Drop a folder, files or a ZIP here'}
        </span>
        <span className='text-xs text-muted-foreground'>
          Sources: <span className='font-mono'>{supportedKernelExtensions.join(' ')}</span> · archives:{' '}
          <span className='font-mono'>.zip</span>
        </span>
      </div>
      <div className='flex flex-wrap gap-2'>
        {webAccessDirectoryPicker() ? (
          <Button type='button' variant='outline' disabled={isDisabled} onClick={handleDirectoryPick}>
            <FolderOpen />
            Open folder
          </Button>
        ) : (
          <Button type='button' variant='outline' disabled={isDisabled} onClick={handleFolderClick}>
            <Folder />
            Select folder
          </Button>
        )}
        <Button type='button' variant='outline' disabled={isDisabled} onClick={handleFileClick}>
          <Files />
          Select files
        </Button>
      </div>
    </div>
  );
}
