import { UploadIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import type { DropEvent, DropzoneOptions, FileRejection } from 'react-dropzone';
import { useDropzone } from 'react-dropzone';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.js';

type DropzoneContextType = {
  src?: File[];
  accept?: DropzoneOptions['accept'];
  maxSize?: DropzoneOptions['maxSize'];
  minSize?: DropzoneOptions['minSize'];
  maxFiles?: DropzoneOptions['maxFiles'];
};
const renderBytes = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)}${units[unitIndex]}`;
};

const DropzoneContext = createContext<DropzoneContextType | undefined>(undefined);

export type DropzoneProps = Omit<DropzoneOptions, 'onDrop'> & {
  readonly src?: File[];
  readonly className?: string;
  readonly onDrop?: (acceptedFiles: File[], fileRejections: FileRejection[], event: DropEvent) => void;
  readonly children?: ReactNode;
};

export function Dropzone({
  accept,
  maxFiles = 1,
  maxSize,
  minSize,
  onDrop,
  onError,
  disabled,
  src,
  className,
  children,
  ...props
}: DropzoneProps): React.ReactNode {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    maxFiles,
    maxSize,
    minSize,
    onError,
    disabled,
    onDrop(acceptedFiles, fileRejections, event) {
      if (fileRejections.length > 0) {
        const message = fileRejections.at(0)?.errors.at(0)?.message;
        onError?.(new Error(message));
        return;
      }

      onDrop?.(acceptedFiles, fileRejections, event);
    },
    ...props,
  });

  const value = useMemo<DropzoneContextType>(
    () => ({ src, accept, maxSize, minSize, maxFiles }),
    [src, accept, maxSize, minSize, maxFiles],
  );

  return (
    <DropzoneContext.Provider key={JSON.stringify(src)} value={value}>
      <Button
        className={cn(
          'relative h-auto w-full flex-col overflow-hidden p-8',
          'data-[drag-active=true]:ring-1',
          'data-[drag-active=true]:ring-ring',
          'data-[drag-active=true]:outline-none',
          className,
        )}
        data-drag-active={isDragActive}
        disabled={disabled}
        type="button"
        variant="outline"
        {...getRootProps()}
      >
        <input {...getInputProps()} disabled={disabled} />
        {children}
      </Button>
    </DropzoneContext.Provider>
  );
}

const useDropzoneContext = () => {
  const context = useContext(DropzoneContext);
  if (!context) {
    throw new Error('useDropzoneContext must be used within a Dropzone');
  }

  return context;
};

export type DropzoneContentProps = {
  readonly children?: ReactNode;
  readonly className?: string;
};

const maxLabelItems = 3;

export function DropzoneContent({ children, className }: DropzoneContentProps): React.ReactNode {
  const { src } = useDropzoneContext();
  if (!src) {
    return null;
  }

  if (children) {
    return children;
  }

  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <UploadIcon className="size-4" />
      </div>
      <p className="my-2 w-full truncate text-sm font-medium">
        {src.length > maxLabelItems
          ? `${new Intl.ListFormat('en').format(
              src.slice(0, maxLabelItems).map((file) => file.name),
            )} and ${src.length - maxLabelItems} more`
          : new Intl.ListFormat('en').format(src.map((file) => file.name))}
      </p>
      <p className="w-full text-xs text-wrap text-muted-foreground">Drag and drop or click to replace</p>
    </div>
  );
}

export type DropzoneEmptyStateProps = {
  readonly children?: ReactNode;
  readonly className?: string;
};

export function DropzoneEmptyState({ children, className }: DropzoneEmptyStateProps): React.ReactNode {
  const { src, accept, maxSize, minSize, maxFiles } = useDropzoneContext();
  if (src) {
    return null;
  }

  if (children) {
    return children;
  }

  let caption = '';
  if (accept) {
    caption += 'Accepts ';
    caption += new Intl.ListFormat('en').format(Object.keys(accept));
  }

  if (minSize && maxSize) {
    caption += ` between ${renderBytes(minSize)} and ${renderBytes(maxSize)}`;
  } else if (minSize) {
    caption += ` at least ${renderBytes(minSize)}`;
  } else if (maxSize) {
    caption += ` less than ${renderBytes(maxSize)}`;
  }

  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <UploadIcon className="size-4" />
      </div>
      <p className="my-2 w-full truncate text-sm font-medium text-wrap">Upload {maxFiles === 1 ? 'a file' : 'files'}</p>
      <p className="w-full truncate text-xs text-wrap text-muted-foreground">Drag and drop or click to upload</p>
      {caption ? <p className="text-xs text-wrap text-muted-foreground">{caption}.</p> : null}
    </div>
  );
}
