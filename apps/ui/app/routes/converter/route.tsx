import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import JSZip from 'jszip';
import { importToGlb, exportFromGlb } from '@taucad/converter';
import type { InputFormat, OutputFormat } from '@taucad/converter';
import { Download, Upload as UploadIcon, Upload } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { toast } from '#components/ui/sonner.js';
import type { Handle } from '#types/matches.types.js';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import type { Geometry } from '#types/cad.types.js';
import { downloadBlob } from '#utils/file.js';
import {
  FloatingPanel,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
} from '#components/ui/floating-panel.js';
import { DropArea } from '#routes/converter/drop-area.js';
import { FormatSelector } from '#routes/converter/format-selector.js';
import {
  getFormatFromFilename,
  formatDisplayName,
  formatFileSize,
  getFileExtension,
} from '#routes/converter/converter-utils.js';
import { SettingsControl } from '#components/geometry/cad/settings-control.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
import { useSelector } from '@xstate/react';

const yUpFormats = ['gltf', 'glb'];

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant="ghost">
        <Link to="/converter">Converter</Link>
      </Button>
    );
  },
  enableFloatingSidebar: true,
};

type UploadedFileInfo = {
  name: string;
  format: InputFormat;
  size: number;
};

export default function ConverterRoute(): React.JSX.Element {
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | undefined>(undefined);
  const [glbData, setGlbData] = useState<Uint8Array | undefined>(undefined);
  const [selectedFormats, setSelectedFormats] = useState<Set<OutputFormat>>(new Set());
  const [isConverting, setIsConverting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const graphicsState = useSelector(
    graphicsActor,
    (state) => ({
      enableSurfaces: state.context.enableSurfaces,
      enableLines: state.context.enableLines,
      enableGizmo: state.context.enableGizmo,
      enableGrid: state.context.enableGrid,
      enableAxes: state.context.enableAxes,
      enableMatcap: state.context.enableMatcap,
    }),
    (a, b) =>
      a.enableSurfaces === b.enableSurfaces &&
      a.enableLines === b.enableLines &&
      a.enableGizmo === b.enableGizmo &&
      a.enableGrid === b.enableGrid &&
      a.enableAxes === b.enableAxes &&
      a.enableMatcap === b.enableMatcap,
  );

  const handleFileSelect = useCallback(async (file: File) => {
    setIsConverting(true);

    try {
      // Get format from filename
      const format = getFormatFromFilename(file.name);

      // Read file data
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      // Convert to GLB
      toast.promise(
        (async () => {
          const glb = await importToGlb([{ name: file.name, data }], format);

          // Update state
          setUploadedFile({
            name: file.name,
            format,
            size: file.size,
          });
          setGlbData(glb);
          setSelectedFormats(new Set());
        })(),
        {
          loading: `Converting ${file.name}...`,
          success: `Converted ${file.name} successfully`,
          error(error: unknown) {
            let message = 'Failed to convert file';
            if (error instanceof Error) {
              message = `${message}: ${error.message}`;
            }

            return message;
          },
        },
      );
    } catch (error) {
      let message = 'Failed to process file';
      if (error instanceof Error) {
        message = `${message}: ${error.message}`;
      }

      toast.error(message);
    } finally {
      setIsConverting(false);
    }
  }, []);

  const handleFormatToggle = useCallback((format: OutputFormat) => {
    setSelectedFormats((previous) => {
      const next = new Set(previous);
      if (next.has(format)) {
        next.delete(format);
      } else {
        next.add(format);
      }

      return next;
    });
  }, []);

  const handleDownload = useCallback(async () => {
    if (!glbData || selectedFormats.size === 0) {
      return;
    }

    setIsExporting(true);

    try {
      if (selectedFormats.size === 1) {
        // Single file download
        const format = [...selectedFormats][0];
        if (!format) {
          return;
        }

        toast.promise(
          (async () => {
            const files = await exportFromGlb(glbData, format);
            const file = files[0];
            if (!file) {
              throw new Error('No file returned from export');
            }

            const extension = getFileExtension(format);
            const filename = uploadedFile
              ? uploadedFile.name.replace(/\.[^.]+$/, `.${extension}`)
              : `model.${extension}`;
            downloadBlob(new Blob([file.data]), filename);
          })(),
          {
            loading: `Exporting to ${formatDisplayName(format)}...`,
            success: `Downloaded ${formatDisplayName(format)} file`,
            error(error: unknown) {
              let message = `Failed to export to ${formatDisplayName(format)}`;
              if (error instanceof Error) {
                message = `${message}: ${error.message}`;
              }

              return message;
            },
          },
        );
      } else {
        // Multiple files - create zip
        toast.promise(
          (async () => {
            const zip = new JSZip();

            for (const format of selectedFormats) {
              const files = await exportFromGlb(glbData, format);
              for (const file of files) {
                const extension = getFileExtension(format);
                const filename = uploadedFile
                  ? uploadedFile.name.replace(/\.[^.]+$/, `.${extension}`)
                  : `model.${extension}`;
                zip.file(filename, file.data);
              }
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const zipFilename = uploadedFile
              ? uploadedFile.name.replace(/\.[^.]+$/, '-converted.zip')
              : 'converted-models.zip';
            downloadBlob(zipBlob, zipFilename);
          })(),
          {
            loading: `Exporting ${selectedFormats.size} formats...`,
            success: `Downloaded ${selectedFormats.size} files in zip`,
            error(error: unknown) {
              let message = 'Failed to export files';
              if (error instanceof Error) {
                message = `${message}: ${error.message}`;
              }

              return message;
            },
          },
        );
      }
    } finally {
      setIsExporting(false);
    }
  }, [glbData, selectedFormats, uploadedFile]);

  const handleReset = useCallback(() => {
    setUploadedFile(undefined);
    setGlbData(undefined);
    setSelectedFormats(new Set());
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    // Only hide if leaving the viewer area completely
    if (event.currentTarget === event.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);

      if (event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0];
        if (file) {
          void handleFileSelect(file);
        }
      }
    },
    [handleFileSelect],
  );

  // Construct geometries array for CadViewer
  const geometries: Geometry[] = glbData
    ? [{ type: 'gltf', gltfBlob: new Blob([glbData], { type: 'model/gltf-binary' }) }]
    : [];

  const hasModel = glbData !== undefined;

  return (
    <div className="relative flex h-full flex-col">
      {hasModel ? (
        // Loaded state - model rendered with floating panel
        <>
          {/* Main viewer area */}
          <div
            className="relative flex-1"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <CadViewer
              enableYupRotation={yUpFormats.includes(uploadedFile?.format ?? '')}
              enableZoom
              enablePan
              enableMatcap={graphicsState.enableMatcap}
              enableLines={graphicsState.enableLines}
              enableAxes={graphicsState.enableAxes}
              enableGrid={graphicsState.enableGrid}
              enableGizmo={graphicsState.enableGizmo}
              enableSurfaces={graphicsState.enableSurfaces}
              geometries={geometries}
            />

            {/* Drag overlay - only show when dragging */}
            {isDragging ? (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                <div className="flex h-1/2 w-1/2 flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-primary bg-background/50">
                  <Upload className="size-12 text-primary" />
                  <p className="text-lg font-medium">Drop files here</p>
                </div>
              </div>
            ) : undefined}

            {/* File info overlay */}
            {uploadedFile ? (
              <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
                <Button variant="overlay" size="sm" className="w-fit justify-start" onClick={handleReset}>
                  <UploadIcon className="size-4" />
                  Upload New File
                </Button>
                <div className="rounded-md border bg-sidebar/95 p-3 shadow-md backdrop-blur-sm">
                  <div className="text-sm font-medium">{uploadedFile.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDisplayName(uploadedFile.format)} · {formatFileSize(uploadedFile.size)}
                  </div>
                </div>
              </div>
            ) : undefined}

            {/* Export panel trigger */}
            <div className="absolute flex gap-2 top-(--header-height) right-2 z-10">
              <SettingsControl />
              <FloatingPanel isOpen side="right">
                <FloatingPanelContent>
                  <FloatingPanelContentHeader>
                    <FloatingPanelContentTitle>Export Options</FloatingPanelContentTitle>
                  </FloatingPanelContentHeader>
                  <FloatingPanelContentBody className="p-4">
                    <div className="space-y-6">
                      <FormatSelector selectedFormats={selectedFormats} onFormatToggle={handleFormatToggle} />

                      <div className="flex flex-col gap-2">
                        <Button
                          disabled={selectedFormats.size === 0 || isExporting}
                          size="lg"
                          className="w-full"
                          onClick={handleDownload}
                        >
                          <Download className="size-4" />
                          {selectedFormats.size === 0
                            ? 'Select formats to download'
                            : selectedFormats.size === 1
                              ? 'Download'
                              : `Download ${selectedFormats.size} formats as ZIP`}
                        </Button>

                        <Button variant="outline" size="lg" className="w-full" onClick={handleReset}>
                          <UploadIcon className="size-4" />
                          Clear and Upload New
                        </Button>
                      </div>
                    </div>
                  </FloatingPanelContentBody>
                </FloatingPanelContent>
              </FloatingPanel>
            </div>
          </div>
        </>
      ) : (
        // Landing state - no model loaded
        <div className="container flex h-full flex-col items-center justify-center gap-4 px-4 py-8">
          <h1 className="text-6xl font-medium tracking-tight">Converter</h1>
          <p className="mb-8 text-lg text-muted-foreground">
            Convert 3D models between formats. Free, secure, and fully offline.
          </p>
          <DropArea className="w-full max-w-2xl" onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* Loading overlay */}
      {isConverting ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Converting file...</p>
          </div>
        </div>
      ) : undefined}
    </div>
  );
}
