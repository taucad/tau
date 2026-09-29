import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { formatConfigurations } from '@taucad/types/constants';
import { Cpu, Download, Upload, RotateCcw } from 'lucide-react';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { projectToManifest } from '@taucad/types';
import type { Geometry } from '@taucad/types';
import type { ProjectLoadInput, ProjectRetrievedEvent } from '#machines/project.machine.js';
import { Button } from '@taucad/ui/components/button';
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
import { InfoTooltip } from '#components/ui/info-tooltip.js';
import {
  getFormatFromFilename,
  formatDisplayName,
  formatFileSize,
  isConfiguredConverterFormat,
} from '#components/geometry/converter/converter-utils.js';
import { Converter } from '#components/geometry/converter/converter.js';
import { ChatViewerControls } from '#routes/w.$workspace.$project/chat-viewer-controls.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { cn } from '@taucad/ui/utils/cn';
import { Loader } from '#components/ui/loader.js';
import { ProjectProvider, useProject } from '#hooks/use-project.js';
import { GraphicsProvider, useGraphicsSelector } from '#hooks/use-graphics.js';
import { PageContent } from '#components/layout/page-content.js';
import { PageHeader } from '#components/layout/page-header.js';
import { PageNotice } from '#components/layout/page-notice.js';
import { createConverterSource } from '@taucad/converter/contracts';
import type { ConverterSource } from '@taucad/converter/contracts';
import type { ConverterExportFormat, ConverterImportFormat, ConverterRuntimeClient } from '@taucad/converter/runtime';
import { createConverterClient } from '#runtime/converter-client-options.js';
import { beginConverterOperation, createActiveConverterClient } from '#routes/convert/converter-client-lifecycle.js';

export const meta: MetaFunction = () => [{ title: 'Convert · Tau' }];

type UploadedFileInfo = {
  name: string;
  format: ConverterImportFormat;
  size: number;
};

const converterViewId = 'converter-main';
const defaultConverterExportFormats: ConverterExportFormat[] = ['stl'];

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
    return (
      <PageContent className='space-y-6'>
        <PageHeader title='Convert' />
        <p role='status' className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader /> Preparing converter…
        </p>
      </PageContent>
    );
  }

  return (
    <GraphicsProvider graphicsRef={graphicsRef}>
      <ConverterContentInner />
    </GraphicsProvider>
  );
}

/**
 * Isolated viewer that owns all graphics-machine selectors, the CadViewer and the viewer bar.
 * Memoised so that UI-only state changes in the parent (format selection, cookie updates, etc.) never cause the
 * WebGL canvas to re-render.
 */
export const ConverterViewer = memo(function ({
  glbData,
  fileName,
}: {
  readonly glbData: Uint8Array<ArrayBuffer>;
  readonly fileName: string;
}): React.JSX.Element {
  const enableSurfaces = useGraphicsSelector((state) => state.context.enableSurfaces);
  const enableLines = useGraphicsSelector((state) => state.context.enableLines);
  const enableGizmo = useGraphicsSelector((state) => state.context.enableGizmo);
  const enableGrid = useGraphicsSelector((state) => state.context.enableGrid);
  const enableAxes = useGraphicsSelector((state) => state.context.enableAxes);
  const enableMatcap = useGraphicsSelector((state) => state.context.enableMatcap);
  const upDirection = useGraphicsSelector((state) => state.context.upDirection);

  const geometry = useMemo<Geometry>(() => ({ format: 'gltf', content: glbData, hash: 'converter' }), [glbData]);

  return (
    <div data-viewer-frame className='absolute inset-0'>
      <div role='img' aria-label={`Preview of ${fileName}`} className='absolute inset-0'>
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
      </div>

      {/* Keep the viewer bar clear of the export panel, with safe centring on narrow screens. */}
      <div className='@container/viewer pointer-events-none absolute right-2 bottom-2 left-2 z-10 flex flex-col items-center-safe md:right-84'>
        <ChatViewerControls shouldEnableCapture={false} />
      </div>
    </div>
  );
});

/**
 * The export panel. From md up it is always open beside the viewer. Below md it folds away behind an Export toggle, so
 * the viewer and its bar stay in reach, and opens under the toggle over the viewer.
 */
export function ConverterExportPanel({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const [isOpenOnPhone, setIsOpenOnPhone] = useState(false);
  const panelId = useId();
  return (
    <>
      <Button
        variant='overlay'
        aria-expanded={isOpenOnPhone}
        aria-controls={panelId}
        className='absolute top-2 right-2 z-10 md:hidden'
        onClick={() => {
          setIsOpenOnPhone((isOpen) => !isOpen);
        }}
      >
        <Download />
        Export
      </Button>
      <div
        id={panelId}
        className={cn(
          'absolute top-2 right-2 bottom-2 z-10 flex gap-2',
          // Below the toggle, inset from every edge.
          'max-md:top-12 max-md:left-2',
          !isOpenOnPhone && 'max-md:hidden',
        )}
      >
        <FloatingPanel isOpen side='right' className='rounded-md border'>
          <FloatingPanelContent className='w-80 max-md:w-full'>
            <FloatingPanelContentHeader className='px-3 text-foreground'>
              <FloatingPanelContentTitle>Export options</FloatingPanelContentTitle>
            </FloatingPanelContentHeader>
            {children}
          </FloatingPanelContent>
        </FloatingPanel>
      </div>
    </>
  );
}

function ConverterContentInner(): React.JSX.Element {
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | undefined>(undefined);
  const [glbData, setGlbData] = useState<Uint8Array<ArrayBuffer> | undefined>(undefined);
  const [source, setSource] = useState<ConverterSource | undefined>(undefined);
  const [client, setClient] = useState<ConverterRuntimeClient | undefined>(undefined);
  const [converterImportFormats, setConverterImportFormats] = useState<ConverterImportFormat[]>([]);
  const [converterExportFormats, setConverterExportFormats] = useState<ConverterExportFormat[]>([]);
  const [selectedFormats, setSelectedFormats] = useCookie<ConverterExportFormat[]>(
    cookieName.converterOutputFormats,
    defaultConverterExportFormats,
  );
  const [useZipForMultiple, setUseZipForMultiple] = useCookie<boolean>(cookieName.converterMultifileZip, true);
  const [isConverting, setIsConverting] = useState(false);
  const [openingFileName, setOpeningFileName] = useState<string>();
  const [conversionError, setConversionError] = useState<string>();
  const conversionGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    let runtimeClient: ConverterRuntimeClient | undefined;
    let unsubscribe: (() => void) | undefined;
    const connectConverter = async (): Promise<void> => {
      try {
        const createdClient = await createActiveConverterClient(createConverterClient, () => active);
        if (!createdClient) {
          return;
        }
        runtimeClient = createdClient;
        unsubscribe = createdClient.on('capabilities', (capabilities) => {
          if (!active) {
            return;
          }
          setConverterImportFormats([
            ...new Set(
              capabilities.registrations
                .flatMap((registration) => (registration.kind === 'kernel' ? registration.extensions : []))
                .filter((format) => isConfiguredConverterFormat(format)),
            ),
          ] as ConverterImportFormat[]);
          setConverterExportFormats([
            ...new Set(
              capabilities.routes
                .map((route) => route.targetFormat)
                .filter((format) => isConfiguredConverterFormat(format)),
            ),
          ]);
        });
        await createdClient.connect();
        if (!active) {
          unsubscribe();
          createdClient.terminate();
          return;
        }
        setClient(createdClient);
      } catch (error) {
        unsubscribe?.();
        runtimeClient?.terminate();
        if (active) {
          setConversionError(
            `Could not start the converter: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    };
    void connectConverter();
    return () => {
      active = false;
      conversionGeneration.current += 1;
      unsubscribe?.();
      runtimeClient?.terminate();
    };
  }, []);

  useEffect(() => {
    if (converterExportFormats.length > 0) {
      setSelectedFormats((formats) => {
        const configuredFormats = formats.filter((format) => converterExportFormats.includes(format));
        return configuredFormats.length === formats.length ? formats : configuredFormats;
      });
    }
  }, [converterExportFormats, setSelectedFormats]);

  const handleFileSelect = useCallback(
    async (files: File[]) => {
      const isCurrentOperation = beginConverterOperation(conversionGeneration);
      setOpeningFileName(files[0]?.name);
      setIsConverting(true);
      setConversionError(undefined);
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
        setOpeningFileName(entryFile.name);
        const format = getFormatFromFilename(entryFile.name);
        const entries = await Promise.all(
          files.map(
            async (file) => [file.webkitRelativePath || file.name, new Uint8Array(await file.arrayBuffer())] as const,
          ),
        );
        if (!isCurrentOperation()) {
          return;
        }
        const nextSource = createConverterSource(entries, entryFile.webkitRelativePath || entryFile.name);
        const outcome = await client.render({ source: nextSource });
        if (!isCurrentOperation() || outcome.superseded) {
          return;
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
      } catch (error) {
        if (isCurrentOperation()) {
          let message = 'Failed to process file';
          if (error instanceof Error) {
            message = `${message}: ${error.message}`;
          }
          setConversionError(message);
        }
      } finally {
        if (isCurrentOperation()) {
          setIsConverting(false);
        }
      }
    },
    [client, converterImportFormats],
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
    conversionGeneration.current += 1;
    setIsConverting(false);
    setConversionError(undefined);
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
    <div className='h-full overflow-y-auto'>
      <PageContent className='flex min-h-full flex-col gap-6'>
        <div className='shrink-0'>
          <PageHeader
            title='Convert'
            action={
              hasModel ? (
                <Button variant='outline' onClick={handleReset}>
                  <RotateCcw />
                  Start over
                </Button>
              ) : undefined
            }
          />
        </div>

        {conversionError ? (
          <PageNotice
            title={client ? 'Model unavailable' : 'Converter unavailable'}
            message={
              client
                ? `${openingFileName ?? 'The selected model'} could not be read. Choose another model to try again.`
                : 'The converter could not start. Reload the page to try again.'
            }
            detail={conversionError}
          >
            {client ? undefined : (
              <Button
                variant='outline'
                onClick={() => {
                  globalThis.location.reload();
                }}
              >
                Reload converter
              </Button>
            )}
          </PageNotice>
        ) : undefined}

        <div
          className={cn(
            'relative',
            (isConverting || hasModel) && 'min-h-144 flex-1 overflow-hidden rounded-lg border bg-muted',
          )}
        >
          {isConverting || hasModel ? (
            <>
              {glbData ? <ConverterViewer glbData={glbData} fileName={uploadedFile?.name ?? 'Model'} /> : undefined}
              {isConverting ? (
                <div
                  role='status'
                  aria-label='Opening model'
                  aria-busy='true'
                  className={cn(
                    'absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-4 text-center',
                    hasModel ? 'bg-background/90' : 'bg-muted',
                  )}
                >
                  <Loader className='size-5 text-muted-foreground' />
                  <span className='max-w-full font-mono text-sm break-all'>{openingFileName}</span>
                  <span className='text-sm text-muted-foreground'>Opening model…</span>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      conversionGeneration.current += 1;
                      setIsConverting(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <ConverterExportPanel>
                  <FloatingPanelContentBody className='flex min-h-0 flex-col justify-between gap-4 bg-sidebar p-3'>
                    <div className='space-y-5'>
                      {uploadedFile ? (
                        <div className='space-y-1'>
                          <div className='flex items-center gap-1'>
                            <span className='truncate text-sm font-medium'>{uploadedFile.name}</span>
                            <InfoTooltip>{formatConfigurations[uploadedFile.format].description}</InfoTooltip>
                          </div>
                          <p className='text-xs text-muted-foreground'>
                            {formatDisplayName(uploadedFile.format)} · {formatFileSize(uploadedFile.size)}
                          </p>
                        </div>
                      ) : undefined}
                      <Converter
                        availableFormats={converterExportFormats}
                        exportFormat={exportFormat}
                        selectedFormats={selectedFormats}
                        shouldUseZipForMultiple={useZipForMultiple}
                        uploadedFile={uploadedFile}
                        onFormatToggle={handleFormatToggle}
                        onClearSelection={handleClearFormats}
                        onZipToggle={handleZipToggle}
                      />
                    </div>
                    <Dropzone
                      className='w-full max-md:hidden'
                      maxFiles={100}
                      onDrop={handleFileDrop}
                      onError={(error) => {
                        setConversionError(error.message);
                      }}
                    >
                      <DropzoneEmptyState>
                        <div className='flex flex-col items-center gap-1 py-1 text-wrap'>
                          <Upload className='size-4 text-muted-foreground' />
                          <span className='text-sm font-medium'>Open another model</span>
                          <span className='text-xs font-normal text-muted-foreground'>
                            Drop files here or click to browse
                          </span>
                        </div>
                      </DropzoneEmptyState>
                    </Dropzone>
                  </FloatingPanelContentBody>
                </ConverterExportPanel>
              )}
            </>
          ) : (
            <div className='grid items-start gap-8 border-t pt-6 lg:grid-cols-[minmax(0,1fr)_20rem]'>
              <div className='min-w-0 space-y-4'>
                <h2 className='text-sm font-medium'>Source model</h2>
                <Dropzone
                  className='min-h-72 rounded-lg border-dashed p-6 text-wrap'
                  maxFiles={100}
                  disabled={!client}
                  onDrop={handleFileDrop}
                  onError={(error) => {
                    setConversionError(error.message);
                  }}
                >
                  <DropzoneEmptyState>
                    <div className='flex flex-col items-center gap-1 text-center'>
                      <span className='mb-2 rounded-xl border bg-card p-2'>
                        <Upload aria-hidden className='size-5 text-muted-foreground' />
                      </span>
                      <span className='text-base font-medium'>Open model</span>
                      <span className='text-sm font-normal text-muted-foreground'>
                        Drop files here or click to browse
                      </span>
                      <span className='mt-3 text-xs font-normal text-muted-foreground'>
                        Include supporting files, such as textures.
                      </span>
                    </div>
                  </DropzoneEmptyState>
                </Dropzone>
                <p className='flex items-center gap-2 text-xs text-muted-foreground'>
                  <Cpu aria-hidden className='size-3.5' /> Processed on this device.
                </p>
              </div>
              <div className='min-w-0 space-y-3'>
                {!client && conversionError ? undefined : (
                  <FormatsList formats={converterImportFormats} isLoading={!client} />
                )}
                <p className='border-t pt-4 text-xs leading-relaxed text-muted-foreground'>
                  Output formats depend on the model. Open a file to see available conversions.
                </p>
              </div>
            </div>
          )}
        </div>
      </PageContent>
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
            };
          }),
        },
      }}
    >
      <ConverterContent />
    </ProjectProvider>
  );
}
