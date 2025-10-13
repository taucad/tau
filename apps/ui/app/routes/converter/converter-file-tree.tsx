import { FileArchive, FileIcon } from 'lucide-react';
import type { OutputFormat } from '@taucad/converter';
import { getFileExtension } from '#routes/converter/converter-utils.js';

type ConverterFileTreeProps = {
  readonly selectedFormats: OutputFormat[];
  readonly fileName?: string;
  readonly asZip?: boolean;
};

export function ConverterFileTree({
  selectedFormats,
  fileName,
  asZip = true,
}: ConverterFileTreeProps): React.ReactNode {
  if (selectedFormats.length === 0) {
    return null;
  }

  const baseFileName = fileName ? fileName.replace(/\.[^.]+$/, '') : 'model';

  // Single file
  if (selectedFormats.length === 1) {
    const format = selectedFormats[0];
    if (!format) {
      return null;
    }

    const extension = getFileExtension(format);
    const outputFileName = `${baseFileName}.${extension}`;

    return (
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm">
          <FileIcon className="size-4 text-muted-foreground" />
          <span className="text-xs">{outputFileName}</span>
        </div>
      </div>
    );
  }

  // Multiple files
  const files = selectedFormats.map((format) => {
    const extension = getFileExtension(format);
    return `${baseFileName}.${extension}`;
  });

  if (asZip) {
    // Show as zip with tree
    const zipFileName = `${baseFileName}-converted.zip`;

    return (
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <FileArchive className="size-4 shrink-0 text-muted-foreground" />
              <div className="text-xs font-medium">{zipFileName}</div>
            </div>
            <div className="mt-1 ml-2 space-y-1 border-l border-border pl-2">
              {files.map((file, index) => (
                <div key={file} className="flex items-center gap-1.5 text-xs">
                  <div className={`-ml-2 h-px w-2 bg-border ${index === files.length - 1 ? 'rounded-r' : ''}`} />
                  <FileIcon className="size-3 shrink-0 text-muted-foreground" />
                  <span>{file}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show as flat list of files
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="space-y-1.5">
        {files.map((file) => (
          <div key={file} className="flex items-center gap-2 text-sm">
            <FileIcon className="size-4 text-muted-foreground" />
            <span className="text-xs">{file}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
