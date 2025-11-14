import { useCallback, useState } from 'react';
import { useActorRef } from '@xstate/react';
import { exportFromGlb } from '@taucad/converter';
import type { InputFormat, OutputFormat } from '@taucad/converter';
import { Download } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { toast } from '#components/ui/sonner.js';
import { Checkbox } from '#components/ui/checkbox.js';
import { Label } from '#components/ui/label.js';
import { downloadBlob } from '#utils/file.utils.js';
import { FormatSelector } from '#components/geometry/converter/format-selector.js';
import { ConverterFileTree } from '#components/geometry/converter/converter-file-tree.js';
import { formatDisplayName, getFileExtension } from '#components/geometry/converter/converter-utils.js';
import { zipMachine } from '#machines/zip.machine.js';
import { cn } from '#utils/ui.utils.js';

type UploadedFileInfo = {
  readonly name: string;
  readonly format: InputFormat;
  readonly size: number;
};

export type ExportedFile = {
  readonly filename: string;
  readonly content: Uint8Array;
  readonly format: OutputFormat;
};

type ConverterProperties = {
  readonly getGlbData: () => Promise<Uint8Array>;
  readonly selectedFormats: OutputFormat[];
  readonly shouldUseZipForMultiple: boolean;
  readonly uploadedFile?: UploadedFileInfo;
  readonly onFormatToggle: (format: OutputFormat) => void;
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

  // Create zip machine instance
  const zipFilename = uploadedFile ? uploadedFile.name.replace(/\.[^.]+$/, '-converted.zip') : 'converted-models.zip';
  const zipActorRef = useActorRef(zipMachine, {
    input: { zipFilename },
  });

  // Check if File System Access API is supported
  const isFileSystemAccessSupported =
    'showSaveFilePicker' in globalThis.window && typeof globalThis.window.showSaveFilePicker === 'function';

  const saveFileWithPicker = useCallback(async (blob: Blob, filename: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call -- File System Access API is not yet in TypeScript lib
      const handle = (await (globalThis as any).showSaveFilePicker({
        suggestedName: filename,
      })) as FileSystemFileHandle;

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled, rethrow to stop the export
        throw error;
      }

      console.error('Failed to save file:', error);
      throw new Error('Failed to save file');
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (selectedFormats.length === 0) {
      console.warn('Cannot export: no formats selected');
      return;
    }

    let data: Uint8Array;
    setIsExporting(true);

    try {
      // Lazily fetch GLB data when download is triggered
      data = await getGlbData();
    } catch (error) {
      console.error('Failed to get GLB data:', error);
      toast.error('Failed to get GLB data');
      return;
    } finally {
      setIsExporting(false);
    }

    setIsExporting(true);

    try {
      if (selectedFormats.length === 1) {
        // Single file download
        const format = selectedFormats[0];
        if (!format) {
          return;
        }

        toast.promise(
          (async () => {
            console.log('Starting single file export', { format });
            const files = await exportFromGlb(data, format);
            console.log('Export completed', { filesCount: files.length });
            const file = files[0];
            if (!file) {
              throw new Error('No file returned from export');
            }

            const extension = getFileExtension(format);
            const filename = uploadedFile
              ? uploadedFile.name.replace(/\.[^.]+$/, `.${extension}`)
              : `model.${extension}`;
            console.log('Downloading file', { filename, size: file.data.length });

            const blob = new Blob([file.data]);

            if (shouldChooseLocation) {
              await saveFileWithPicker(blob, filename);
            } else {
              downloadBlob(blob, filename);
            }

            // Call onExport callback if provided and enabled
            if (onExport && shouldSaveToProject) {
              onExport([{ filename, content: file.data, format }]);
            }
          })(),
          {
            loading: `Exporting to ${formatDisplayName(format)}...`,
            success: `Downloaded ${formatDisplayName(format)} file`,
            error(error: unknown) {
              // Check if user cancelled the save dialog
              if (error instanceof Error && error.name === 'AbortError') {
                return 'Export cancelled';
              }

              let message = `Failed to export to ${formatDisplayName(format)}`;
              if (error instanceof Error) {
                message = `${message}: ${error.message}`;
              } else if (typeof error === 'string') {
                message = `${message}: ${error}`;
              }

              return message;
            },
          },
        );
      } else if (shouldUseZipForMultiple) {
        // Multiple files - create zip using zip machine
        toast.promise(
          (async () => {
            // Reset zip machine
            zipActorRef.send({ type: 'reset' });

            // Export all formats in parallel
            const results = await Promise.all(
              selectedFormats.map(async (format) => {
                const files = await exportFromGlb(data, format);
                return { format, files };
              }),
            );

            // Add all files to zip machine
            const filesToZip: Array<{ filename: string; content: Uint8Array }> = [];
            const exportedFiles: ExportedFile[] = [];
            for (const { format, files } of results) {
              for (const file of files) {
                const extension = getFileExtension(format);
                const filename = uploadedFile
                  ? uploadedFile.name.replace(/\.[^.]+$/, `.${extension}`)
                  : `model.${extension}`;
                filesToZip.push({
                  filename,
                  content: file.data,
                });
                exportedFiles.push({
                  filename,
                  content: file.data,
                  format,
                });
              }
            }

            zipActorRef.send({ type: 'addFiles', files: filesToZip });
            zipActorRef.send({ type: 'generate' });

            // Wait for the zip to be ready
            const blob = await new Promise<Blob>((resolve, reject) => {
              const subscription = zipActorRef.subscribe((state) => {
                if (state.matches('ready') && state.context.zipBlob) {
                  subscription.unsubscribe();
                  resolve(state.context.zipBlob);
                } else if (state.matches('error')) {
                  subscription.unsubscribe();
                  reject(state.context.error ?? new Error('Failed to generate ZIP'));
                }
              });
            });

            // Call onExport callback if provided and enabled
            if (onExport && shouldSaveToProject) {
              onExport(exportedFiles);
            }

            return blob;
          })(),
          {
            loading: `Exporting ${selectedFormats.length} formats...`,
            async success(blob) {
              if (shouldChooseLocation) {
                await saveFileWithPicker(blob, zipFilename);
              } else {
                downloadBlob(blob, zipFilename);
              }

              return `Downloaded ${selectedFormats.length} files in zip`;
            },
            error(error: unknown) {
              // Check if user cancelled the save dialog
              if (error instanceof Error && error.name === 'AbortError') {
                return 'Export cancelled';
              }

              let message = 'Failed to export files';
              if (error instanceof Error) {
                message = `${message}: ${error.message}`;
              } else if (typeof error === 'string') {
                message = `${message}: ${error}`;
              }

              return message;
            },
          },
        );
      } else {
        // Multiple files - download individually
        toast.promise(
          (async () => {
            // Export all formats in parallel
            const results = await Promise.all(
              selectedFormats.map(async (format) => {
                const files = await exportFromGlb(data, format);
                return { format, files };
              }),
            );

            // Download each file individually
            const exportedFiles: ExportedFile[] = [];
            for (const { format, files } of results) {
              for (const file of files) {
                const extension = getFileExtension(format);
                const filename = uploadedFile
                  ? uploadedFile.name.replace(/\.[^.]+$/, `.${extension}`)
                  : `model.${extension}`;
                const blob = new Blob([file.data]);

                if (shouldChooseLocation) {
                  // eslint-disable-next-line no-await-in-loop -- Sequential file picker dialogs are intentional
                  await saveFileWithPicker(blob, filename);
                } else {
                  downloadBlob(blob, filename);
                }

                exportedFiles.push({
                  filename,
                  content: file.data,
                  format,
                });
              }
            }

            // Call onExport callback if provided and enabled
            if (onExport && shouldSaveToProject) {
              onExport(exportedFiles);
            }
          })(),
          {
            loading: `Exporting ${selectedFormats.length} formats...`,
            success: `Downloaded ${selectedFormats.length} files`,
            error(error: unknown) {
              // Check if user cancelled the save dialog
              if (error instanceof Error && error.name === 'AbortError') {
                return 'Export cancelled';
              }

              let message = 'Failed to export files';
              if (error instanceof Error) {
                message = `${message}: ${error.message}`;
              } else if (typeof error === 'string') {
                message = `${message}: ${error}`;
              }

              return message;
            },
          },
        );
      }
    } finally {
      setIsExporting(false);
    }
  }, [
    getGlbData,
    selectedFormats,
    uploadedFile,
    shouldUseZipForMultiple,
    zipActorRef,
    zipFilename,
    shouldChooseLocation,
    saveFileWithPicker,
    onExport,
    shouldSaveToProject,
  ]);

  return (
    <div data-slot="converter" className={cn('@container/converter flex flex-col gap-6', className)}>
      <FormatSelector
        selectedFormats={selectedFormats}
        onFormatToggle={onFormatToggle}
        onClearSelection={onClearSelection}
        {...formatSelectorProperties}
      />

      <div className="flex flex-col gap-2">
        <Button
          disabled={selectedFormats.length === 0 || isExporting}
          className="h-auto w-full whitespace-normal"
          onClick={handleDownload}
        >
          <Download className="size-4 shrink-0" />
          <span className="min-w-0 break-words">
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
          <div className="flex items-center space-x-2">
            <Checkbox
              id="save-to-project"
              checked={shouldSaveToProject}
              onCheckedChange={(checked) => {
                setShouldSaveToProject(checked === true);
              }}
            />
            <Label
              htmlFor="save-to-project"
              className="cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Save exported files to build
            </Label>
          </div>
        ) : undefined}

        {selectedFormats.length > 1 ? (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="use-zip"
              checked={shouldUseZipForMultiple}
              onCheckedChange={(checked) => {
                onZipToggle(checked === true);
              }}
            />
            <Label
              htmlFor="use-zip"
              className="cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Download as ZIP file
            </Label>
          </div>
        ) : undefined}

        {/* Custom download location toggle */}
        {isFileSystemAccessSupported ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="choose-location"
                checked={shouldChooseLocation}
                onCheckedChange={(checked) => {
                  setShouldChooseLocation(checked === true);
                }}
              />
              <Label
                htmlFor="choose-location"
                className="cursor-pointer text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Choose download location
              </Label>
            </div>
            <p className="pl-6 text-xs text-muted-foreground">
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
