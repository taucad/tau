import { useCallback, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Folder, Files, FolderOpen, Upload, Download } from 'lucide-react';
import { importFileAcceptString } from '#routes/import.$/import.utils.js';
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
        'relative space-y-2 rounded-lg border bg-sidebar p-6 outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring',
        isDropping ? 'border-dashed border-primary bg-primary/5' : 'border-border',
        isDisabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <input {...getInputProps()} />

      {/* Hidden file inputs */}
      <input
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
        ref={fileInputRef}
        multiple
        type='file'
        className='hidden'
        accept={importFileAcceptString}
        disabled={isDisabled}
        onChange={handleFileChange}
      />

      {/* Header - always visible */}
      <div className='mb-4 flex items-center gap-3'>
        <div
          className={cn(
            'flex size-10 items-center justify-center rounded-full transition-colors duration-200',
            isDropping ? 'bg-primary/20' : 'bg-linear-to-br from-primary/20 to-primary/10',
          )}
        >
          {isDropping ? (
            <Download className='size-5 animate-bounce text-primary' />
          ) : (
            <Upload className='size-5 text-primary' />
          )}
        </div>
        <div>
          <h2 className='font-medium'>Upload from Disk</h2>
          <p
            className={cn(
              'text-xs transition-colors duration-200',
              isDropping ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {isDropping ? 'Drop files here' : 'Select or drop files'}
          </p>
        </div>
      </div>

      {/* Buttons - hidden when dropping */}
      <div
        className={cn(
          'flex gap-2 transition-all duration-200',
          isDropping ? 'pointer-events-none h-0 opacity-0' : 'opacity-100',
        )}
      >
        {webAccessDirectoryPicker() ? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='flex-1'
            disabled={isDisabled}
            onClick={handleDirectoryPick}
          >
            <FolderOpen className='mr-1.5 size-4' />
            <span className='hidden sm:inline'>Open Directory</span>
            <span className='sm:hidden'>Directory</span>
          </Button>
        ) : (
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='flex-1'
            disabled={isDisabled}
            onClick={handleFolderClick}
          >
            <Folder className='mr-1.5 size-4' />
            <span className='hidden sm:inline'>Select Folder</span>
            <span className='sm:hidden'>Folder</span>
          </Button>
        )}
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='flex-1'
          disabled={isDisabled}
          onClick={handleFileClick}
        >
          <Files className='mr-1.5 size-4' />
          <span className='hidden sm:inline'>Select Files</span>
          <span className='sm:hidden'>Files</span>
        </Button>
      </div>
    </div>
  );
}
