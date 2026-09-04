import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { createRuntimeClient } from '@taucad/runtime/client';
import { webWorkerTransport } from '@taucad/runtime/transport/web';
import { formatConfigurations } from '@taucad/types/constants';
import { Download, Upload, RotateCcw, Package, Code2 } from 'lucide-react';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { projectToManifest } from '@taucad/types';
import type { Geometry } from '@taucad/types';
import type { ProjectLoadInput, ProjectRetrievedEvent } from '#machines/project.machine.js';
import { Button } from '@taucad/ui/components/button';
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
import { FormatsList } from '#routes/convert/formats-list.js';
import { FormatsListMobile } from '#routes/convert/formats-list-mobile.js';
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockAction,
  CodeBlockContent,
  Pre,
} from '#components/code/code-block.js';
import { CopyButton } from '#components/copy-button.js';
import { ExternalLink } from '#components/external-link.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@taucad/ui/components/card';
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
import { ViewerSettings } from '#components/geometry/cad/viewer-settings.js';
import { ChatInterfaceGraphics } from '#routes/w.$workspace.$project/chat-interface-graphics.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { cn } from '@taucad/ui/utils/cn';
import { Loader } from '#components/ui/loader.js';
import { ProjectProvider, useProject } from '#hooks/use-project.js';
import { GraphicsProvider, useGraphicsSelector } from '#hooks/use-graphics.js';
import { metaConfig } from '#constants/meta.constants.js';
import {
  converterExportFormats,
  converterImportFormats,
  createConverterSource,
} from '#routes/convert/converter-runtime.definition.js';
import type {
  converterRuntime,
  ConverterExportFormat,
  ConverterImportFormat,
  ConverterRuntimeClient,
  ConverterSource,
} from '#routes/convert/converter-runtime.definition.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/converter'>Converter</Link>
      </Button>
    );
  },
};

type UploadedFileInfo = {
  name: string;
  format: ConverterImportFormat;
  size: number;
};

const converterViewId = 'converter-main';

function ConverterContent(): React.JSX.Element {
  const { projectRef, viewGraphics } = useProject();

  useEffect(() => {
    projectRef.send({ type: 'createViewGraphics', viewId: converterViewId });
    return () => {
      projectRef.send({ type: 'destroyViewGraphics', viewId: converterViewId });
    };
  }, [projectRef]);

  const graphicsRef = viewGraphics.get(converterViewId);
  if (!graphicsRef) {
    return <Loader className='size-12' />;
  }

  return (
    <GraphicsProvider graphicsRef={graphicsRef}>
      <ConverterContentInner />
    </GraphicsProvider>
  );
}

/**
 * Isolated viewer component that owns all graphics-machine selectors and the
 * CadViewer.  Memoised so that UI-only state changes in the parent
 * (format selection, cookie updates, etc.) never cause the WebGL canvas to
 * re-render.
 */
const ConverterViewer = memo(function ({ glbData }: { readonly glbData: Uint8Array<ArrayBuffer> }): React.JSX.Element {
  const enableSurfaces = useGraphicsSelector((state) => state.context.enableSurfaces);
  const enableLines = useGraphicsSelector((state) => state.context.enableLines);
  const enableGizmo = useGraphicsSelector((state) => state.context.enableGizmo);
  const enableGrid = useGraphicsSelector((state) => state.context.enableGrid);
  const enableAxes = useGraphicsSelector((state) => state.context.enableAxes);
  const enableMatcap = useGraphicsSelector((state) => state.context.enableMatcap);
  const upDirection = useGraphicsSelector((state) => state.context.upDirection);

  const geometry = useMemo<Geometry>(() => ({ format: 'gltf', content: glbData, hash: 'converter' }), [glbData]);

  return (
    <CadViewer
      enableZoom
      enablePan
      upDirection={upDirection}
      enableMatcap={enableMatcap}
      enableLines={enableLines}
      enableAxes={enableAxes}
      enableGrid={enableGrid}
      enableGizmo={enableGizmo}
      enableSurfaces={enableSurfaces}
      geometry={geometry}
    />
  );
});

function ConverterContentInner(): React.JSX.Element {
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | undefined>(undefined);
  const [glbData, setGlbData] = useState<Uint8Array<ArrayBuffer> | undefined>(undefined);
  const [source, setSource] = useState<ConverterSource | undefined>(undefined);
  const [client, setClient] = useState<ConverterRuntimeClient | undefined>(undefined);
  const [selectedFormats, setSelectedFormats] = useCookie<ConverterExportFormat[]>(
    cookieName.converterOutputFormats,
    [],
  );
  const [useZipForMultiple, setUseZipForMultiple] = useCookie<boolean>(cookieName.converterMultifileZip, true);
  const [isConverting, setIsConverting] = useState(false);

  useEffect(() => {
    let active = true;
    const runtimeClient = createRuntimeClient<typeof converterRuntime>({
      transport: webWorkerTransport({
        createWorker: () =>
          new Worker(new URL('converter-runtime.worker.ts', import.meta.url), {
            name: 'tau-converter-runtime-worker',
            type: 'module',
          }),
      }),
    });
    queueMicrotask(() => {
      if (active) {
        setClient(runtimeClient);
      }
    });
    return () => {
      active = false;
      runtimeClient.terminate();
    };
  }, []);

  const handleFileSelect = useCallback(
    async (files: File[]) => {
      setIsConverting(true);

      try {
        if (!client) {
          throw new Error('The converter runtime is still loading');
        }
        const entryFile = files.find((file) => {
          try {
            return converterImportFormats.includes(getFormatFromFilename(file.name));
          } catch {
            return false;
          }
        });
        if (!entryFile) {
          throw new Error('No supported model file was selected');
        }
        const format = getFormatFromFilename(entryFile.name);
        const entries = await Promise.all(
          files.map(
            async (file) => [file.webkitRelativePath || file.name, new Uint8Array(await file.arrayBuffer())] as const,
          ),
        );
        const nextSource = createConverterSource(entries, entryFile.webkitRelativePath || entryFile.name);
        const operation = (async () => {
          const outcome = await client.render({ source: nextSource });
          if (outcome.superseded) {
            throw new Error('Conversion was superseded by a newer upload');
          }
          if (!outcome.geometry.success) {
            throw new Error(outcome.geometry.issues.map((issue) => issue.message).join('\n'));
          }
          if (outcome.geometry.data.format !== 'gltf') {
            throw new Error(`Converter returned unsupported preview geometry: ${outcome.geometry.data.format}`);
          }
          setUploadedFile({ name: entryFile.name, format, size: entryFile.size });
          setSource(nextSource);
          setGlbData(outcome.geometry.data.content);
        })();
        toast.promise(operation, {
          loading: `Converting ${entryFile.name}...`,
          success: `Converted ${entryFile.name} successfully`,
          error(error: unknown) {
            let message = 'Failed to convert file';
            if (error instanceof Error) {
              message = `${message}: ${error.message}`;
            }

            return message;
          },
        });
        await operation;
      } catch (error) {
        let message = 'Failed to process file';
        if (error instanceof Error) {
          message = `${message}: ${error.message}`;
        }

        toast.error(message);
      } finally {
        setIsConverting(false);
      }
    },
    [client],
  );

  const handleFormatToggle = useCallback(
    (format: ConverterExportFormat) => {
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
    setSource(undefined);
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
      if (acceptedFiles.length > 0) {
        void handleFileSelect(acceptedFiles);
      }
    },
    [handleFileSelect],
  );

  const exportFormat = useCallback(
    async (format: ConverterExportFormat) => {
      if (!client || !source) {
        throw new Error('No model is loaded');
      }
      const result = await client.export(format, { source });
      if (!result.success) {
        throw new Error(result.issues.map((issue) => issue.message).join('\n'));
      }
      return result.data;
    },
    [client, source],
  );

  const hasModel = glbData !== undefined;

  return (
    <div className={cn('relative flex h-full flex-col', !hasModel && 'overflow-y-auto')}>
      {hasModel ? (
        // Loaded state - model rendered with floating panel
        <>
          {/* Main viewer area */}
          <div className='relative flex-1'>
            <div className='absolute inset-0'>
              <ConverterViewer glbData={glbData} />
            </div>

            {/* Bottom-left viewer controls */}
            <div className='pointer-events-none absolute bottom-2 left-2 z-10 flex w-90 shrink-0 flex-col gap-2'>
              {/* File info overlay */}
              {uploadedFile ? (
                <div className='pointer-events-auto w-100 rounded-md border bg-sidebar p-3'>
                  <div className='flex items-center gap-1'>
                    <div className='text-sm font-medium'>{uploadedFile.name}</div>
                    <InfoTooltip>{formatConfigurations[uploadedFile.format].description}</InfoTooltip>
                  </div>
                  <div className='text-xs text-muted-foreground'>
                    {formatDisplayName(uploadedFile.format)} · {formatFileSize(uploadedFile.size)}
                  </div>
                </div>
              ) : undefined}
              <ChatInterfaceGraphics className='w-100' />
              <div className='pointer-events-auto flex items-center gap-2'>
                <FovControl className='w-60' />
                <GridSizeIndicator />
                <SectionViewControl />
                <MeasureControl />
                <ResetCameraControl />
                <ViewerSettings />
              </div>
            </div>

            {/* Export panel trigger */}
            <div className='absolute top-(--header-height) right-2 z-10 flex h-full gap-2 pb-[calc(var(--header-height)+var(--spacing)*2)]'>
              <FloatingPanel isOpen side='right' className='rounded-md border'>
                <FloatingPanelContent className='w-80'>
                  <FloatingPanelContentHeader>
                    <FloatingPanelContentTitle>Export Options</FloatingPanelContentTitle>
                  </FloatingPanelContentHeader>
                  <FloatingPanelContentBody className='flex h-full flex-col justify-between gap-4 p-3 pt-2'>
                    <Converter
                      exportFormat={exportFormat}
                      selectedFormats={selectedFormats}
                      shouldUseZipForMultiple={useZipForMultiple}
                      uploadedFile={uploadedFile}
                      onFormatToggle={handleFormatToggle}
                      onClearSelection={handleClearFormats}
                      onZipToggle={handleZipToggle}
                    />

                    <div className='flex flex-col space-y-4'>
                      {/* Drop area for uploading new file */}
                      <Dropzone className='w-full max-md:hidden' maxFiles={100} onDrop={handleFileDrop}>
                        <DropzoneEmptyState>
                          <div className='flex flex-col items-center gap-2 py-4'>
                            <Upload className='size-6 text-muted-foreground' />
                            <p className='text-sm font-medium'>Drop new file here</p>
                            <p className='text-xs text-muted-foreground'>or click to browse</p>
                          </div>
                        </DropzoneEmptyState>
                      </Dropzone>
                      <Button variant='outline' className='w-full' size='lg' onClick={handleReset}>
                        <RotateCcw className='size-4' />
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
        <div className='container mx-auto mt-(--header-height) grid h-full items-start gap-8 px-4 md:pt-8 xl:grid-cols-[250px_1fr_250px]'>
          {/* Import Formats - Left */}
          <FormatsList
            icon={Upload}
            title='Import Formats'
            description='Formats you can upload'
            formats={converterImportFormats}
            className='mt-30 max-xl:hidden'
          />

          {/* Center - Hero & Upload */}
          <div className='flex flex-col items-center gap-8 pt-4'>
            <div className='flex flex-col items-center gap-3 text-center'>
              <h1 className='text-6xl font-bold tracking-tight'>3D Model Converter</h1>
              <div className='flex flex-col items-center gap-0'>
                <p className='mb-8 max-w-2xl text-lg text-muted-foreground'>
                  Convert 3D models between formats instantly. Free, secure, and fully offline.
                </p>
                <div className='text-md max-w-2xl text-muted-foreground italic'>
                  Your data never leaves your browser{' '}
                </div>
                <Button asChild variant='link' className='text-sm underline'>
                  <ExternalLink href={metaConfig.githubUrl} arrowSize='xs'>
                    View source code
                  </ExternalLink>
                </Button>
              </div>
            </div>

            {/* Upload Area */}
            <Dropzone className='w-full max-w-2xl' maxFiles={100} onDrop={handleFileDrop}>
              <DropzoneEmptyState>
                <div className='flex flex-col items-center gap-6 py-4'>
                  <div className='flex size-20 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10'>
                    <Upload className='size-10 text-primary' />
                  </div>
                  <div className='flex flex-col items-center gap-2 text-center'>
                    <h3 className='text-xl font-semibold'>Drop your 3D model here</h3>
                    <p className='text-sm text-muted-foreground'>or click to browse your files</p>
                  </div>
                </div>
              </DropzoneEmptyState>
            </Dropzone>

            {/* Mobile Format Lists */}
            <div className='w-full max-w-2xl space-y-6 xl:hidden'>
              <FormatsListMobile title='Import Formats' formats={converterImportFormats} />
              <FormatsListMobile title='Export Formats' formats={converterExportFormats} />
            </div>

            {/* Alternative Usage Methods */}
            <div className='w-full max-w-2xl space-y-4 pb-8'>
              <div className='text-center'>
                <h2 className='text-lg font-semibold'>Power Up Your Applications</h2>
                <p className='text-sm text-muted-foreground'>
                  Add seamless 3D conversion to any project with our developer tools
                </p>
              </div>

              <div className='grid gap-4 xl:grid-cols-2'>
                {/* NPM Package */}
                <Card>
                  <CardHeader>
                    <div className='flex items-center gap-2'>
                      <div className='flex size-8 items-center justify-center rounded-md bg-primary/10'>
                        <Package className='size-4 text-primary' />
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
                        <CodeBlockAction visibility='alwaysVisible'>
                          <CopyButton
                            size='xs'
                            getText={() => {
                              return 'pnpm add @taucad/cli';
                            }}
                          />
                        </CodeBlockAction>
                      </CodeBlockHeader>
                      <CodeBlockContent>
                        <Pre language='bash'>pnpm add @taucad/cli</Pre>
                      </CodeBlockContent>
                    </CodeBlock>
                  </CardContent>
                </Card>

                {/* API */}
                <Card className='justify-between'>
                  <CardHeader>
                    <div className='flex items-center gap-2'>
                      <div className='flex size-8 items-center justify-center rounded-md bg-primary/10'>
                        <Code2 className='size-4 text-primary' />
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
                    <Button asChild variant='outline' size='sm' className='w-full'>
                      <Link to='https://docs.tau.new/runtime/api'>View API Documentation</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Export Formats - Right */}
          <FormatsList
            icon={Download}
            title='Export Formats'
            description='Formats you can convert to'
            formats={converterExportFormats}
            className='mt-30 max-xl:hidden'
          />
        </div>
      )}

      {/* Loading overlay */}
      {isConverting ? (
        <div className='absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm'>
          <div className='flex flex-col items-center gap-4'>
            <div className='size-12 animate-spin rounded-full border-4 border-primary border-t-transparent' />
            <p className='text-sm text-muted-foreground'>Converting file...</p>
          </div>
        </div>
      ) : undefined}
    </div>
  );
}

export default function ConverterRoute(): React.JSX.Element {
  // Provide a minimal project context so downstream components can use graphics/cad state
  const converterProject = projectToManifest({
    id: 'converter',
    name: 'Converter',
    description: 'Transient project context for the converter page',
    tags: [],
    assets: { main: { entryPath: 'converter.glb' } },
  });

  return (
    <ProjectProvider
      projectId={converterProject.id}
      input={{ shouldLoadModelOnStart: false }}
      provide={{
        actors: {
          loadProjectActor: fromSafeAsync<ProjectRetrievedEvent, ProjectLoadInput>(async () => {
            return {
              type: 'projectRetrieved',
              project: converterProject,
              revisionState: undefined,
              parameterEntries: new Map(),
            };
          }),
        },
      }}
    >
      <ConverterContent />
    </ProjectProvider>
  );
}
