import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import JSZip from 'jszip';
import { importToGlb, exportFromGlb, supportedImportFormats, supportedExportFormats } from '@taucad/converter';
import type { InputFormat, OutputFormat } from '@taucad/converter';
import { Download, Upload, RotateCcw, Package, Code2 } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Button } from '#components/ui/button.js';
import { toast } from '#components/ui/sonner.js';
import { Checkbox } from '#components/ui/checkbox.js';
import { Label } from '#components/ui/label.js';
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
import { Dropzone, DropzoneEmptyState } from '#components/ui/dropzone.js';
import { FormatSelector } from '#routes/converter/format-selector.js';
import { ConverterFileTree } from '#routes/converter/converter-file-tree.js';
import { FormatsList } from '#routes/converter/formats-list.js';
import { FormatsListMobile } from '#routes/converter/formats-list-mobile.js';
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockAction,
  CodeBlockContent,
  Pre,
} from '#components/code/code-block.js';
import { CopyButton } from '#components/copy-button.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '#components/ui/card.js';
import {
  getFormatFromFilename,
  formatDisplayName,
  formatFileSize,
  getFileExtension,
} from '#routes/converter/converter-utils.js';
import { SettingsControl } from '#components/geometry/cad/settings-control.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

const yUpFormats = new Set<InputFormat>(['gltf', 'glb', 'ifc']);

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant="ghost">
        <Link to="/converter">Converter</Link>
      </Button>
    );
  },
  enableFloatingSidebar: true,
  enableOverflowY: true,
};

type UploadedFileInfo = {
  name: string;
  format: InputFormat;
  size: number;
};

export default function ConverterRoute(): React.JSX.Element {
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | undefined>(undefined);
  const [glbData, setGlbData] = useState<Uint8Array | undefined>(undefined);
  const [selectedFormats, setSelectedFormats] = useCookie<OutputFormat[]>(cookieName.converterOutputFormats, []);
  const [useZipForMultiple, setUseZipForMultiple] = useCookie<boolean>(cookieName.converterMultifileZip, true);
  const [isConverting, setIsConverting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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

  const handleFormatToggle = useCallback(
    (format: OutputFormat) => {
      setSelectedFormats((previous) => {
        if (previous.includes(format)) {
          return previous.filter((f) => f !== format);
        }

        return [...previous, format];
      });
    },
    [setSelectedFormats],
  );

  const handleDownload = useCallback(async () => {
    if (!glbData || selectedFormats.length === 0) {
      return;
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
      } else if (useZipForMultiple) {
        // Multiple files - create zip
        toast.promise(
          (async () => {
            const zip = new JSZip();

            // Export all formats in parallel
            const results = await Promise.all(
              selectedFormats.map(async (format) => {
                const files = await exportFromGlb(glbData, format);
                return { format, files };
              }),
            );

            // Add all files to zip
            for (const { format, files } of results) {
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
            loading: `Exporting ${selectedFormats.length} formats...`,
            success: `Downloaded ${selectedFormats.length} files in zip`,
            error(error: unknown) {
              let message = 'Failed to export files';
              if (error instanceof Error) {
                message = `${message}: ${error.message}`;
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
                const files = await exportFromGlb(glbData, format);
                return { format, files };
              }),
            );

            // Download each file individually
            for (const { format, files } of results) {
              for (const file of files) {
                const extension = getFileExtension(format);
                const filename = uploadedFile
                  ? uploadedFile.name.replace(/\.[^.]+$/, `.${extension}`)
                  : `model.${extension}`;
                downloadBlob(new Blob([file.data]), filename);
              }
            }
          })(),
          {
            loading: `Exporting ${selectedFormats.length} formats...`,
            success: `Downloaded ${selectedFormats.length} files`,
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
  }, [glbData, selectedFormats, uploadedFile, useZipForMultiple]);

  const handleReset = useCallback(() => {
    setUploadedFile(undefined);
    setGlbData(undefined);
  }, []);

  const handleClearFormats = useCallback(() => {
    setSelectedFormats([]);
  }, [setSelectedFormats]);

  const handleFileDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        void handleFileSelect(file);
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
          <div className="relative flex-1">
            <CadViewer
              enableZoom
              enablePan
              enableYupRotation={uploadedFile ? yUpFormats.has(uploadedFile.format) : false}
              enableMatcap={graphicsState.enableMatcap}
              enableLines={graphicsState.enableLines}
              enableAxes={graphicsState.enableAxes}
              enableGrid={graphicsState.enableGrid}
              enableGizmo={graphicsState.enableGizmo}
              enableSurfaces={graphicsState.enableSurfaces}
              geometries={geometries}
            />

            {/* File info overlay */}
            {uploadedFile ? (
              <div className="absolute bottom-4 left-4 flex flex-col gap-2">
                <div className="rounded-md border bg-sidebar/95 p-3 shadow-md backdrop-blur-sm">
                  <div className="text-sm font-medium">{uploadedFile.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDisplayName(uploadedFile.format)} · {formatFileSize(uploadedFile.size)}
                  </div>
                </div>
              </div>
            ) : undefined}

            {/* Export panel trigger */}
            <div className="absolute top-(--header-height) right-2 z-10 flex gap-2">
              <SettingsControl />
              <FloatingPanel isOpen side="right">
                <FloatingPanelContent className="w-80">
                  <FloatingPanelContentHeader>
                    <FloatingPanelContentTitle>Export Options</FloatingPanelContentTitle>
                  </FloatingPanelContentHeader>
                  <FloatingPanelContentBody className="flex h-full flex-col justify-between gap-4 p-4">
                    <div className="flex flex-col gap-6">
                      <FormatSelector
                        selectedFormats={selectedFormats}
                        onFormatToggle={handleFormatToggle}
                        onClearSelection={handleClearFormats}
                      />

                      <div className="flex flex-col gap-2">
                        <Button
                          disabled={selectedFormats.length === 0 || isExporting}
                          size="lg"
                          className="w-full"
                          onClick={handleDownload}
                        >
                          <Download className="size-4" />
                          {selectedFormats.length === 0
                            ? 'Select formats to download'
                            : selectedFormats.length === 1
                              ? 'Download'
                              : useZipForMultiple
                                ? `Download ${selectedFormats.length} formats as ZIP`
                                : `Download ${selectedFormats.length} formats`}
                        </Button>

                        {selectedFormats.length > 1 ? (
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="use-zip"
                              checked={useZipForMultiple}
                              onCheckedChange={(checked) => {
                                setUseZipForMultiple(checked === true);
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

                        {/* File tree preview */}
                        <ConverterFileTree
                          selectedFormats={selectedFormats}
                          fileName={uploadedFile?.name}
                          asZip={useZipForMultiple}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col space-y-4">
                      {/* Drop area for uploading new file */}
                      <Dropzone className="w-full max-md:hidden" maxFiles={1} onDrop={handleFileDrop}>
                        <DropzoneEmptyState>
                          <div className="flex flex-col items-center gap-2 py-4">
                            <Upload className="size-6 text-muted-foreground" />
                            <p className="text-sm font-medium">Drop new file here</p>
                            <p className="text-xs text-muted-foreground">or click to browse</p>
                          </div>
                        </DropzoneEmptyState>
                      </Dropzone>
                      <Button variant="outline" className="w-full" size="lg" onClick={handleReset}>
                        <RotateCcw className="size-4" />
                        Clear and start over
                      </Button>
                    </div>
                  </FloatingPanelContentBody>
                </FloatingPanelContent>
              </FloatingPanel>
            </div>
          </div>
        </>
      ) : (
        // Landing state - no model loaded
        <div className="container mt-(--header-height) grid h-full items-start gap-8 md:pt-8 lg:grid-cols-[300px_1fr_300px] xl:grid-cols-[350px_1fr_350px]">
          {/* Import Formats - Left */}
          <FormatsList
            icon={Upload}
            title="Import Formats"
            description="Formats you can upload"
            formats={supportedImportFormats}
            className="mt-30 max-lg:hidden"
          />

          {/* Center - Hero & Upload */}
          <div className="flex flex-col items-center gap-8 pt-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="text-6xl font-bold tracking-tight">3D Model Converter</h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                Convert 3D models between formats instantly. Free, secure, and fully offline.
              </p>
              <p className="text-md max-w-2xl text-muted-foreground italic">Your data never leaves your browser.</p>
            </div>

            {/* Upload Area */}
            <Dropzone className="w-full max-w-2xl" maxFiles={1} onDrop={handleFileDrop}>
              <DropzoneEmptyState>
                <div className="flex flex-col items-center gap-6 py-4">
                  <div className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10">
                    <Upload className="size-10 text-primary" />
                  </div>
                  <div className="flex flex-col items-center gap-2 text-center">
                    <h3 className="text-xl font-semibold">Drop your 3D model here</h3>
                    <p className="text-sm text-muted-foreground">or click to browse your files</p>
                  </div>
                </div>
              </DropzoneEmptyState>
            </Dropzone>

            {/* Mobile Format Lists */}
            <div className="w-full max-w-2xl space-y-6 lg:hidden">
              <FormatsListMobile title="Import Formats" formats={supportedImportFormats} />
              <FormatsListMobile title="Export Formats" formats={supportedExportFormats} />
            </div>

            {/* Alternative Usage Methods */}
            <div className="w-full max-w-2xl space-y-4 pb-8">
              <div className="text-center">
                <h2 className="text-lg font-semibold">Power Up Your Applications</h2>
                <p className="text-sm text-muted-foreground">
                  Add seamless 3D conversion to any project with our developer tools
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {/* NPM Package */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
                        <Package className="size-4 text-primary" />
                      </div>
                      <CardTitle>NPM Package</CardTitle>
                    </div>
                    <CardDescription>
                      Install the converter package to use it directly in your JavaScript or TypeScript projects.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CodeBlock>
                      <CodeBlockHeader>
                        <CodeBlockTitle>Installation</CodeBlockTitle>
                        <CodeBlockAction visibility="alwaysVisible">
                          <CopyButton
                            size="xs"
                            getText={() => {
                              return 'pnpm install @taucad/converter';
                            }}
                          />
                        </CodeBlockAction>
                      </CodeBlockHeader>
                      <CodeBlockContent>
                        <Pre language="bash">pnpm install @taucad/converter</Pre>
                      </CodeBlockContent>
                    </CodeBlock>
                  </CardContent>
                </Card>

                {/* API */}
                <Card className="justify-between">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
                        <Code2 className="size-4 text-primary" />
                      </div>
                      <CardTitle>REST API</CardTitle>
                    </div>
                    <CardDescription>
                      Use our REST API to convert 3D models from any platform or programming language.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link to="#">View API Documentation</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Export Formats - Right */}
          <FormatsList
            icon={Download}
            title="Export Formats"
            description="Formats you can convert to"
            formats={supportedExportFormats}
            className="mt-30 max-lg:hidden"
          />
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
