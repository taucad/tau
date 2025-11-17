import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { importToGlb, supportedImportFormats, supportedExportFormats, formatConfigurations } from '@taucad/converter';
import type { InputFormat, OutputFormat } from '@taucad/converter';
import { Download, Upload, RotateCcw, Package, Code2 } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { fromPromise } from 'xstate';
import type { Geometry, Build } from '@taucad/types';
import { Button } from '#components/ui/button.js';
import { toast } from '#components/ui/sonner.js';
import type { Handle } from '#types/matches.types.js';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import {
  FloatingPanel,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelContentTitle,
  FloatingPanelContentBody,
} from '#components/ui/floating-panel.js';
import { Dropzone, DropzoneEmptyState } from '#components/ui/dropzone.js';
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
import { InfoTooltip } from '#components/ui/info-tooltip.js';
import {
  getFormatFromFilename,
  formatDisplayName,
  formatFileSize,
} from '#components/geometry/converter/converter-utils.js';
import { Converter } from '#components/geometry/converter/converter.js';
import { FovControl } from '#components/geometry/cad/fov-control.js';
import { GridSizeIndicator } from '#components/geometry/cad/grid-control.js';
import { SectionViewControl } from '#components/geometry/cad/section-view-control.js';
import { MeasureControl } from '#components/geometry/cad/measure-control.js';
import { ResetCameraControl } from '#components/geometry/cad/reset-camera-control.js';
import { SettingsControl } from '#components/geometry/cad/settings-control.js';
import { ChatInterfaceGraphics } from '#routes/builds_.$id/chat-interface-graphics.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { cn } from '#utils/ui.utils.js';
import { BuildProvider, useBuild } from '#hooks/use-build.js';
import { metaConfig } from '#config.js';

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

function ConverterContent(): React.JSX.Element {
  const { graphicsRef: graphicsActor } = useBuild();
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | undefined>(undefined);
  const [glbData, setGlbData] = useState<Uint8Array | undefined>(undefined);
  const [selectedFormats, setSelectedFormats] = useCookie<OutputFormat[]>(cookieName.converterOutputFormats, []);
  const [useZipForMultiple, setUseZipForMultiple] = useCookie<boolean>(cookieName.converterMultifileZip, true);
  const [isConverting, setIsConverting] = useState(false);

  const enableSurfaces = useSelector(graphicsActor, (state) => state.context.enableSurfaces);
  const enableLines = useSelector(graphicsActor, (state) => state.context.enableLines);
  const enableGizmo = useSelector(graphicsActor, (state) => state.context.enableGizmo);
  const enableGrid = useSelector(graphicsActor, (state) => state.context.enableGrid);
  const enableAxes = useSelector(graphicsActor, (state) => state.context.enableAxes);
  const enableMatcap = useSelector(graphicsActor, (state) => state.context.enableMatcap);

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

  const handleReset = useCallback(() => {
    setUploadedFile(undefined);
    setGlbData(undefined);
  }, []);

  const handleClearFormats = useCallback(() => {
    setSelectedFormats([]);
  }, [setSelectedFormats]);

  const handleZipToggle = useCallback(
    (useZip: boolean) => {
      setUseZipForMultiple(useZip);
    },
    [setUseZipForMultiple],
  );

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
    ? [{ format: 'gltf', gltfBlob: new Blob([glbData], { type: 'model/gltf-binary' }) }]
    : [];

  const hasModel = glbData !== undefined;

  return (
    <div className="relative flex h-full flex-col">
      {hasModel ? (
        // Loaded state - model rendered with floating panel
        <>
          {/* Main viewer area */}
          <div className="relative flex-1">
            {/* Viewer container - centered in the space not obstructed by sidebar and floating panel */}
            {/* Uses the same centering logic as chat-interface.tsx */}
            <div
              className={cn(
                'absolute inset-0 left-1/2 h-full w-[200dvw]',
                '-translate-x-[calc((100%-var(--sidebar-width-current)+320px)/2)]',
                'transition-all duration-200 ease-in-out',
              )}
            >
              <CadViewer
                enableZoom
                enablePan
                enableYupRotation={uploadedFile ? yUpFormats.has(uploadedFile.format) : false}
                enableMatcap={enableMatcap}
                enableLines={enableLines}
                enableAxes={enableAxes}
                enableGrid={enableGrid}
                enableGizmo={enableGizmo}
                enableSurfaces={enableSurfaces}
                geometries={geometries}
              />
            </div>

            {/* Bottom-left viewer controls */}
            <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex w-90 shrink-0 flex-col gap-2 transition-[left] duration-200 ease-linear md:left-(--sidebar-width-current)">
              {/* File info overlay */}
              {uploadedFile ? (
                <div className="pointer-events-auto rounded-md border bg-sidebar p-3">
                  <div className="flex items-center gap-1">
                    <div className="text-sm font-medium">{uploadedFile.name}</div>
                    <InfoTooltip>{formatConfigurations[uploadedFile.format].description}</InfoTooltip>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDisplayName(uploadedFile.format)} · {formatFileSize(uploadedFile.size)}
                  </div>
                </div>
              ) : undefined}
              <ChatInterfaceGraphics className="w-90" />
              <div className="pointer-events-auto flex items-center gap-2">
                <FovControl defaultAngle={60} className="w-60" />
                <GridSizeIndicator />
                <SectionViewControl />
                <MeasureControl />
                <ResetCameraControl />
              </div>
            </div>

            {/* Export panel trigger */}
            <div className="absolute top-(--header-height) right-2 z-10 flex gap-2">
              <SettingsControl />
              <FloatingPanel isOpen side="right" className="rounded-md border">
                <FloatingPanelContent className="w-80">
                  <FloatingPanelContentHeader>
                    <FloatingPanelContentTitle>Export Options</FloatingPanelContentTitle>
                  </FloatingPanelContentHeader>
                  <FloatingPanelContentBody className="flex h-full flex-col justify-between gap-4 p-3 pt-2">
                    <Converter
                      getGlbData={async () => glbData}
                      selectedFormats={selectedFormats}
                      shouldUseZipForMultiple={useZipForMultiple}
                      uploadedFile={uploadedFile}
                      onFormatToggle={handleFormatToggle}
                      onClearSelection={handleClearFormats}
                      onZipToggle={handleZipToggle}
                    />

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
        <div className="container mx-auto mt-(--header-height) grid h-full items-start gap-8 px-4 transition-[padding-left] duration-200 ease-linear md:pt-8 md:pl-[calc(var(--sidebar-width-current)-var(--spacing)*2)] lg:grid-cols-[300px_1fr_300px] xl:grid-cols-[350px_1fr_350px]">
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
              <div className="flex flex-col items-center gap-0">
                <p className="mb-8 max-w-2xl text-lg text-muted-foreground">
                  Convert 3D models between formats instantly. Free, secure, and fully offline.
                </p>
                <div className="text-md max-w-2xl text-muted-foreground italic">
                  Your data never leaves your browser{' '}
                </div>
                <Button asChild variant="link" className="text-sm underline">
                  <a href={metaConfig.githubUrl} target="_blank" rel="noopener noreferrer">
                    View source code
                  </a>
                </Button>
              </div>
            </div>

            {/* Upload Area */}
            <Dropzone className="w-full max-w-2xl" maxFiles={1} onDrop={handleFileDrop}>
              <DropzoneEmptyState>
                <div className="flex flex-col items-center gap-6 py-4">
                  <div className="flex size-20 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10">
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
                      <p>Integrate 3D conversion into your JavaScript and TypeScript applications.</p>
                      <br />
                      <p>Built for maximum flexibility with full support for both browser and Node.js environments.</p>
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
                      <p>Convert 3D models instantly with our REST API, accessible from any platform or language.</p>
                      <br />
                      <p>
                        Get started in minutes with our managed cloud service, or deploy on your own infrastructure.
                      </p>
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

export default function ConverterRoute(): React.JSX.Element {
  // Provide a minimal build context so downstream components can use graphics/cad state
  const now = Date.now();
  const converterBuild: Build = {
    id: 'converter',
    name: 'Converter',
    description: 'Transient build context for the converter page',
    stars: 0,
    forks: 0,
    author: {
      name: 'Tau',
      avatar: '',
    },
    tags: [],
    thumbnail: '',
    chats: [],
    createdAt: now,
    updatedAt: now,
    assets: {},
  };

  return (
    <BuildProvider
      buildId={converterBuild.id}
      input={{ shouldLoadModelOnStart: false }}
      provide={{
        actors: {
          loadBuildActor: fromPromise(async () => converterBuild),
        },
      }}
    >
      <ConverterContent />
    </BuildProvider>
  );
}
