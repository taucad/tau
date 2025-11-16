import { FileArchive, FileIcon } from 'lucide-react';
import type { OutputFormat } from '@taucad/converter';
import { getFileExtension } from '#components/geometry/converter/converter-utils.js';

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
          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 text-xs break-all">{outputFileName}</span>
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <FileArchive className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 text-xs font-medium break-all">{zipFileName}</div>
            </div>
            <div className="mt-1 ml-2">
              {files.map((file, index) => {
                const isLastItem = index === files.length - 1;
                return (
                  <div key={file} className="relative flex items-start gap-1.5 py-0.5 text-xs">
                    {/* Vertical line - extends to horizontal line for last item, full height for others */}
                    <div
                      className="absolute top-0 left-0 w-px bg-border"
                      style={{
                        height: isLastItem ? 'calc(0.125rem + 0.125rem + 0.375rem)' : '100%',
                      }}
                    />
                    {/* Horizontal line - aligns with icon center (padding + margin + half icon height) */}
                    <div
                      className="absolute left-0 h-px w-3 bg-border"
                      style={{ top: 'calc(0.125rem + 0.125rem + 0.375rem)' }}
                    />
                    <div className="w-3 shrink-0" />
                    <FileIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 break-all">{file}</span>
                  </div>
                );
              })}
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
            <FileIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 text-xs break-all">{file}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
