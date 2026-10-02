import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Download, Check, ChevronDown, ArrowUpRight } from 'lucide-react';
import { createRuntimeClientOptions } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { openscad } from '@taucad/openscad';
import { parameterCache, geometryCache, gltfCoordinateTransform, gltfEdgeDetection } from '@taucad/runtime/middleware';
import { esbuild } from '@taucad/runtime/bundler';
import { converterTranscoder } from '@taucad/runtime/transcoder';
import { downloadBlob } from '@taucad/utils/file';
import { deriveExportFormatOptions } from '#routes/_index/hero-viewer.utils.js';
import type { ExportFormatOption } from '#routes/_index/hero-viewer.utils.js';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { ModelViewer, RenderStatusOverlay } from '#components/model-viewer.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useRender } from '@taucad/react';
import { Button } from '#components/ui/button.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { toast } from '#components/ui/sonner.js';
import { encodeTextFile } from '#utils/filesystem.utils.js';
import { Loader } from '#components/ui/loader.js';
import type { Units } from '#components/geometry/parameters/rjsf-context.js';
import qrcodeScad from '#routes/_index/qrcode.scad?raw';

const heroProjectId = 'hero-qrcode-v2';
const heroMainFile = 'main.scad';

const heroCode = { [heroMainFile]: qrcodeScad };

const heroUnits: Units = { length: { symbol: 'mm', factor: 1 } };

const heroKernelClientOptions = createRuntimeClientOptions({
  transport: inProcessTransport({ fileSystem: fromMemoryFs() }),
  kernels: [openscad()],
  middleware: [parameterCache(), geometryCache(), gltfCoordinateTransform(), gltfEdgeDetection()],
  bundlers: [esbuild()],
  transcoders: [converterTranscoder()],
});

export function HeroViewer(): React.JSX.Element {
  const navigate = useNavigate();
  const projectManager = useProjectManager();

  const [currentParams, setCurrentParams] = useState<Record<string, unknown>>({});
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const renderParams = useMemo(
    () => (Object.keys(currentParams).length > 0 ? currentParams : undefined),
    [currentParams],
  );

  const { geometries, status, defaultParameters, jsonSchema, exportGeometry, capabilities } = useRender({
    clientOptions: heroKernelClientOptions,
    code: heroCode,
    parameters: renderParams,
  });

  const hasParameters = Boolean(jsonSchema);

  const exportFormatOptions = useMemo<ExportFormatOption[]>(
    () => deriveExportFormatOptions(capabilities),
    [capabilities],
  );

  const [selectedFormat, setSelectedFormat] = useState<ExportFormatOption | undefined>();
  const activeFormat = selectedFormat ?? exportFormatOptions[0];
  const canExport = status === 'success' && Boolean(activeFormat);

  const handleParametersChange = useCallback((newParameters: Record<string, unknown>) => {
    setCurrentParams(newParameters);
  }, []);

  const handleExport = useCallback(() => {
    if (!activeFormat || isExporting) {
      return;
    }
    setIsExporting(true);

    // oxlint-disable-next-line tau-lint/no-async-iife -- export is async.
    void (async () => {
      try {
        const result = await exportGeometry(activeFormat.format);
        if (result.success) {
          const blob = new Blob([result.data.bytes]);
          const filename = `qrcode.${activeFormat.format}`;
          downloadBlob(blob, filename);
          toast.success(`Downloaded ${filename}`);
        } else {
          const message = result.issues[0]?.message ?? 'Export failed';
          toast.error(`Failed to export: ${message}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Export failed';
        toast.error(`Failed to export: ${message}`);
      } finally {
        setIsExporting(false);
      }
    })();
  }, [activeFormat, isExporting, exportGeometry]);

  const handleFormatSelect = useCallback(
    (value: string) => {
      const option = exportFormatOptions.find((o) => o.format === value);
      if (option) {
        setSelectedFormat(option);
      }
    },
    [exportFormatOptions],
  );

  const handleContinueInEditor = useCallback(async () => {
    if (isCreatingProject) {
      return;
    }

    setIsCreatingProject(true);

    try {
      const createProject = await projectManager.createProject({
        project: {
          name: 'QR Code Generator',
          description: 'A parametric QR code generator built with OpenSCAD',
          thumbnail: '/tau-desktop.jpg',
          author: {
            name: 'Community',
            avatar: '/avatar-sample.png',
          },
          tags: ['openscad', 'parametric', 'qr-code'],
          assets: {
            mechanical: {
              main: heroMainFile,
              parameters: currentParams,
            },
          },
          forkedFrom: heroProjectId,
        },
        files: { [heroMainFile]: { content: encodeTextFile(qrcodeScad) } },
      });

      await navigate(`/projects/${createProject.id}`);
    } catch (error) {
      console.error('Failed to create project:', error);
      toast.error('Failed to create project');
      setIsCreatingProject(false);
    }
  }, [isCreatingProject, currentParams, projectManager, navigate]);

  return (
    <div className='space-y-6'>
      <div className='text-center'>
        <h2 className='text-2xl font-semibold tracking-tight md:text-3xl'>See It in Action</h2>
        <p className='mt-2 text-muted-foreground'>
          Tweak parameters, watch the model update instantly, then export to any format.
        </p>
        <p className='mt-1 text-sm text-muted-foreground/70'>Try scanning the QR code with your phone!</p>
      </div>

      <div className='flex flex-col overflow-hidden rounded-xl border bg-sidebar md:h-[700px] md:flex-row'>
        <div className='relative h-[300px] md:h-full md:flex-1'>
          <RenderStatusOverlay status={status} className='top-auto right-4 bottom-4' />

          <Button
            variant='outline'
            size='sm'
            className='absolute top-2 right-2 z-10 gap-1.5 bg-background/80 backdrop-blur-sm'
            disabled={isCreatingProject}
            onClick={handleContinueInEditor}
          >
            <span>Continue in Editor</span>
            {isCreatingProject ? <Loader className='size-4' /> : <ArrowUpRight className='size-4' />}
          </Button>

          <ModelViewer
            geometries={geometries}
            enablePan
            graphicsOptions={{ enableGrid: true, enableAxes: true }}
            stageOptions={{ zoomLevel: 1.2 }}
          />
        </div>

        {hasParameters ? (
          <div className='border-t bg-background md:w-80 md:border-t-0 md:border-l'>
            <div className='flex h-full flex-col'>
              <div className='border-b p-3'>
                <h3 className='text-sm font-semibold'>Parameters</h3>
                <p className='text-xs text-muted-foreground'>Adjust the QR code settings</p>
              </div>
              <div className='h-[280px] overflow-hidden md:h-auto md:flex-1'>
                <Parameters
                  isInitialExpanded={false}
                  parameters={currentParams}
                  defaultParameters={defaultParameters}
                  jsonSchema={jsonSchema}
                  units={heroUnits}
                  emptyDescription='Loading parameters...'
                  onParametersChange={handleParametersChange}
                />
              </div>
              <div className='border-t p-3'>
                <div className='flex items-center gap-2'>
                  {exportFormatOptions.length > 0 && activeFormat ? (
                    <>
                      <ComboBoxResponsive
                        searchPlaceHolder='Search formats...'
                        title='Export Format'
                        description='Select a format to export the model'
                        groupedItems={[
                          {
                            name: 'Formats',
                            items: exportFormatOptions,
                          },
                        ]}
                        value={activeFormat}
                        getValue={(item) => item.format}
                        renderLabel={(item, selected) => (
                          <span className='flex w-full items-center justify-between'>
                            <span className='flex items-center gap-2'>
                              <FileExtensionIcon filename={`file.${item.format}`} className='size-4' />
                              <span>{item.label}</span>
                            </span>
                            {selected?.format === item.format ? <Check className='size-4' /> : null}
                          </span>
                        )}
                        className='min-w-0 flex-1'
                        isSearchEnabled={false}
                        onSelect={handleFormatSelect}
                      >
                        <Button variant='outline' size='sm' className='min-w-0 grow justify-start gap-2'>
                          <FileExtensionIcon filename={`file.${activeFormat.format}`} className='size-4 shrink-0' />
                          <span className='truncate'>{activeFormat.label}</span>
                          <ChevronDown className='ml-auto size-3 shrink-0 opacity-50' />
                        </Button>
                      </ComboBoxResponsive>
                      <Button
                        size='sm'
                        className='shrink-0'
                        disabled={!canExport || isExporting}
                        title={canExport ? `Download as ${activeFormat.label}` : 'Model not ready'}
                        onClick={handleExport}
                      >
                        {isExporting ? <Loader className='size-4' /> : <Download className='size-4' />}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
