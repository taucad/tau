import { useCallback, useState } from 'react';
import { exportFromGlb } from '@taucad/converter';
import type { SupportedImportFormat, SupportedExportFormat } from '@taucad/converter';
import { Download } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { toast } from '#components/ui/sonner.js';
import { Checkbox } from '#components/ui/checkbox.js';
import { Label } from '#components/ui/label.js';
import { downloadBlob } from '@taucad/utils/file';
import { FormatSelector } from '#components/geometry/converter/format-selector.js';
import { ConverterFileTree } from '#components/geometry/converter/converter-file-tree.js';
import { formatDisplayName } from '#components/geometry/converter/converter-utils.js';
import { cn } from '#utils/ui.utils.js';
import { createExportArtifactZip } from '#utils/export-artifact-set.utils.js';

type UploadedFileInfo = {
  readonly name: string;
  readonly format: SupportedImportFormat;
  readonly size: number;
};

export type ExportedFile = {
  readonly filename: string;
  readonly content: Uint8Array<ArrayBuffer>;
  readonly format: SupportedExportFormat;
};

type ConverterProperties = {
  readonly getGlbData: () => Promise<Uint8Array<ArrayBuffer>>;
  readonly selectedFormats: SupportedExportFormat[];
  readonly shouldUseZipForMultiple: boolean;
  readonly uploadedFile?: UploadedFileInfo;
  readonly onFormatToggle: (format: SupportedExportFormat) => void;
  readonly onClearSelection: () => void;
  readonly onZipToggle: (useZip: boolean) => void;
  readonly onExport?: (files: ExportedFile[]) => void;
  readonly formatSelectorProperties?: Omit<
    React.ComponentProps<typeof FormatSelector>,
    'selectedFormats' | 'onFormatToggle' | 'onClearSelection'
  >;
  readonly className?: string;
};

export function Converter({
  getGlbData,
  selectedFormats,
  shouldUseZipForMultiple,
  uploadedFile,
  onFormatToggle,
  onClearSelection,
  onZipToggle,
  onExport,
  formatSelectorProperties,
  className,
}: ConverterProperties): React.JSX.Element {
  const [isExporting, setIsExporting] = useState(false);
  const [shouldChooseLocation, setShouldChooseLocation] = useState(false);
  const [shouldSaveToProject, setShouldSaveToProject] = useState(false);

  const zipFilename = uploadedFile ? uploadedFile.name.replace(/\.[^.]+$/, '-converted.zip') : 'converted-models.zip';

  // Check if File System Access API is supported
  const isFileSystemAccessSupported =
    'showSaveFilePicker' in globalThis.window && typeof globalThis.window.showSaveFilePicker === 'function';

  const saveFileWithPicker = useCallback(async (blob: Blob, filename: string): Promise<void> => {
    try {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call -- File System Access API is not yet in TypeScript lib
      const handle = (await (globalThis as any).showSaveFilePicker({
        suggestedName: filename,
      })) as FileSystemFileHandle;

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled, rethrow to stop the export
        throw error;
      }

      throw new Error('Failed to save file');
    }
  }, []);

  const handleDownload = useCallback(async (): Promise<void> => {
    if (selectedFormats.length === 0) {
      toast.warning('Cannot export: no formats selected');
      return;
    }

    let data: Uint8Array<ArrayBuffer>;

    try {
      // Lazily fetch GLB data when download is triggered
      data = await getGlbData();
    } catch {
      toast.error('Failed to get GLB data');
      return;
    }

    setIsExporting(true);

    try {
      const operation = (async () => {
        const results = await Promise.all(
          selectedFormats.map(async (format) => ({ format, files: await exportFromGlb(data, format) })),
        );
        for (const { format, files } of results) {
          if (files.length === 0) {
            throw new Error(`${formatDisplayName(format)} export returned no artifacts`);
          }
        }

        const exportedFiles = results.flatMap(({ format, files }) =>
          files.map((file) => ({
            filename: selectedFormats.length === 1 ? file.name : `${format}/${file.name}`,
            content: file.bytes,
            format,
          })),
        );
        if (onExport && shouldSaveToProject) {
          onExport(exportedFiles);
        }

        const requiresZip = shouldUseZipForMultiple || results.some(({ files }) => files.length > 1);
        if (requiresZip) {
          const blob = await createExportArtifactZip(
            results.map(({ format, files }) => ({
              ...(results.length > 1 ? { directory: format } : {}),
              files,
            })),
          );
          if (shouldChooseLocation) {
            await saveFileWithPicker(blob, zipFilename);
          } else {
            downloadBlob(blob, zipFilename);
          }
          return;
        }

        for (const { files } of results) {
          const file = files[0]!;
          const blob = new Blob([file.bytes], { type: file.mimeType });
          if (shouldChooseLocation) {
            // oxlint-disable-next-line no-await-in-loop -- Sequential file picker dialogs are intentional.
            await saveFileWithPicker(blob, file.name);
          } else {
            downloadBlob(blob, file.name);
          }
        }
      })();

      toast.promise(operation, {
        loading: `Exporting ${selectedFormats.length} format(s)...`,
        success: `Exported ${selectedFormats.length} format(s)`,
        error(error: unknown) {
          if (error instanceof Error && error.name === 'AbortError') {
            return 'Export cancelled';
          }
          return error instanceof Error ? `Failed to export files: ${error.message}` : 'Failed to export files';
        },
      });
      await operation;
    } finally {
      setIsExporting(false);
    }
  }, [
    getGlbData,
    selectedFormats,
    shouldUseZipForMultiple,
    zipFilename,
    shouldChooseLocation,
    saveFileWithPicker,
    onExport,
    shouldSaveToProject,
  ]);

  return (
    <div data-slot='converter' className={cn('@container/converter flex flex-col gap-6', className)}>
      <FormatSelector
        selectedFormats={selectedFormats}
        onFormatToggle={onFormatToggle}
        onClearSelection={onClearSelection}
        {...formatSelectorProperties}
      />

      <div className='flex flex-col gap-2'>
        <Button
          disabled={selectedFormats.length === 0 || isExporting}
          className='h-auto w-full whitespace-normal'
          onClick={handleDownload}
        >
          <Download className='size-4 shrink-0' />
          <span className='min-w-0 wrap-break-word'>
            {selectedFormats.length === 0
              ? 'Select formats to download'
              : selectedFormats.length === 1
                ? 'Download'
                : shouldUseZipForMultiple
                  ? `Download ${selectedFormats.length} formats as ZIP`
                  : `Download ${selectedFormats.length} formats`}
          </span>
        </Button>

        {/* Save to project toggle */}
        {onExport ? (
          <div className='flex items-center space-x-2'>
            <Checkbox
              id='save-to-project'
              checked={shouldSaveToProject}
              onCheckedChange={(checked) => {
                setShouldSaveToProject(checked === true);
              }}
            />
            <Label
              htmlFor='save-to-project'
              className='cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
            >
              Save exported files to project
            </Label>
          </div>
        ) : undefined}

        {selectedFormats.length > 1 ? (
          <div className='flex items-center space-x-2'>
            <Checkbox
              id='use-zip'
              checked={shouldUseZipForMultiple}
              onCheckedChange={(checked) => {
                onZipToggle(checked === true);
              }}
            />
            <Label
              htmlFor='use-zip'
              className='cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
            >
              Download as ZIP file
            </Label>
          </div>
        ) : undefined}

        {/* Custom download location toggle */}
        {isFileSystemAccessSupported ? (
          <div className='flex flex-col gap-2'>
            <div className='flex items-center space-x-2'>
              <Checkbox
                id='choose-location'
                checked={shouldChooseLocation}
                onCheckedChange={(checked) => {
                  setShouldChooseLocation(checked === true);
                }}
              />
              <Label
                htmlFor='choose-location'
                className='cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
              >
                Choose download location
              </Label>
            </div>
            <p className='pl-6 text-xs text-muted-foreground'>
              {shouldChooseLocation
                ? 'You will be prompted to choose where to save each file'
                : 'Downloads to your default downloads folder'}
            </p>
          </div>
        ) : undefined}

        {/* File tree preview */}
        <ConverterFileTree
          selectedFormats={selectedFormats}
          fileName={uploadedFile?.name}
          asZip={shouldUseZipForMultiple}
        />
      </div>
    </div>
  );
}
